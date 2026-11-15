-- delivery 001 — راهبرد و روش اجرای پروژه (Project Delivery Strategy & Execution Method Selection)
--
-- Only what no other module holds is stored here: the study (its answers and weights), immutable analysis versions and
-- the human decisions on them. Project identity, risks and contracts are read from master_projects, rm_risks and
-- fin_contracts; nothing is copied into a parallel table.
--
-- · the analysis is computed by the module's deterministic engine (src/modules/delivery/lib/engine.ts); a version keeps
--   the answers, the weights, the engine version and the full result, so it can be re-run and compared at any time
-- · versions are append-only; the optional machine-written narrative is attached once and never rewrites numbers
-- · nothing is final without a person: a decision needs the «approve» right, and the decider cannot be the person who
--   produced the analysis being decided; choosing another method than the engine's needs a written rationale
-- · confidentiality: a person sees a study only if they may open the project and hold the module's «view» right

insert into rasta_modules (key, label_fa, is_active) values ('delivery', 'راهبرد و روش اجرای پروژه', true) on conflict (key) do nothing;
insert into rasta_permissions (module_key, action)
select 'delivery', a from (values ('view'), ('create'), ('edit'), ('submit'), ('review'), ('approve'), ('reject'), ('export'), ('configure')) v(a)
on conflict (module_key, action) do nothing;

-- roles: the analyst prepares, the approver decides; «دسترسی کامل» gets everything
insert into rasta_roles (name, description, is_system)
select 'تحلیلگر راهبرد اجرا', 'تهیهٔ مطالعهٔ انتخاب روش و راهبرد اجرای پروژه و ارسال برای تصمیم', true
where not exists (select 1 from rasta_roles where name = 'تحلیلگر راهبرد اجرا');
insert into rasta_roles (name, description, is_system)
select 'تصویب‌کنندهٔ راهبرد اجرا', 'بررسی و تصمیم نهایی دربارهٔ روش و راهبرد اجرای پروژه', true
where not exists (select 1 from rasta_roles where name = 'تصویب‌کنندهٔ راهبرد اجرا');
insert into rasta_role_permissions (role_id, permission_id)
select r.id, p.id from rasta_roles r join rasta_permissions p on p.module_key = 'delivery'
where (r.name = 'تحلیلگر راهبرد اجرا' and p.action in ('view', 'create', 'edit', 'submit', 'export'))
   or (r.name = 'تصویب‌کنندهٔ راهبرد اجرا' and p.action in ('view', 'review', 'approve', 'reject', 'export'))
   or (r.name like 'دسترسی کامل%')
on conflict do nothing;

create or replace function ds_can(p_project uuid, p_action text) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (
    is_admin_user()
    or (rasta_user_can_access_master_project(p_project) and rasta_has_permission(auth.uid(), 'delivery', p_action))
  );
$f$;
revoke all on function ds_can(uuid, text) from public, anon;
grant execute on function ds_can(uuid, text) to authenticated;

create or replace function ds_my_caps(p_project uuid) returns jsonb language sql stable security definer set search_path to 'public' as $f$
  select jsonb_build_object('view', ds_can(p_project, 'view'), 'create', ds_can(p_project, 'create'), 'edit', ds_can(p_project, 'edit'), 'submit', ds_can(p_project, 'submit'),
    'approve', ds_can(p_project, 'approve'), 'export', ds_can(p_project, 'export'), 'configure', ds_can(p_project, 'configure'), 'admin', is_admin_user());
$f$;
revoke all on function ds_my_caps(uuid) from public, anon;
grant execute on function ds_my_caps(uuid) to authenticated;

create table if not exists ds_studies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'analysed', 'in_review', 'approved', 'rejected')),
  answers jsonb not null default '{}'::jsonb,
  weights jsonb,
  sources jsonb not null default '{}'::jsonb,
  current_version int not null default 0,
  created_by uuid default auth.uid(), created_name text not null default '',
  created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now()
);
create index if not exists ds_studies_project on ds_studies (project_id);

create table if not exists ds_versions (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references ds_studies (id) on delete cascade,
  project_id uuid not null,
  version int not null,
  answers jsonb not null,
  weights jsonb not null,
  result jsonb not null,
  engine_version text not null,
  recommended text,
  confidence numeric,
  decisive boolean not null default false,
  note text not null default '',
  narrative jsonb,
  narrative_at timestamptz,
  created_by uuid default auth.uid(), created_name text not null default '',
  created_at timestamptz not null default now(),
  unique (study_id, version)
);

create table if not exists ds_decisions (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references ds_studies (id) on delete cascade,
  version_id uuid not null references ds_versions (id) on delete cascade,
  project_id uuid not null,
  decision text not null check (decision in ('submitted', 'approve', 'approve_override', 'return', 'reject', 'reopen')),
  method text,
  pricing text[] not null default '{}',
  procurement text[] not null default '{}',
  execution text[] not null default '{}',
  rationale text not null default '',
  overrides_engine boolean not null default false,
  same_person boolean not null default false,
  decided_by uuid default auth.uid(), decided_name text not null default '',
  decided_at timestamptz not null default now()
);
create index if not exists ds_decisions_study on ds_decisions (study_id);

alter table ds_studies enable row level security;
alter table ds_versions enable row level security;
alter table ds_decisions enable row level security;
create policy ds_studies_read on ds_studies for select to authenticated using (ds_can(project_id, 'view'));
create policy ds_versions_read on ds_versions for select to authenticated using (ds_can(project_id, 'view'));
create policy ds_decisions_read on ds_decisions for select to authenticated using (ds_can(project_id, 'view'));
revoke all on ds_studies, ds_versions, ds_decisions from anon;
revoke all on ds_studies, ds_versions, ds_decisions from authenticated;
grant select on ds_studies, ds_versions, ds_decisions to authenticated;

create or replace function ds_me() returns text language sql stable security definer set search_path to 'public' as $f$
  select coalesce((select coalesce(nullif(full_name, ''), email) from profiles where id = auth.uid()), '');
$f$;

-- a new study, or the answers and weights of a draft
create or replace function ds_save_study(p_id uuid, p_project uuid, p_title text, p_answers jsonb, p_weights jsonb, p_sources jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare s ds_studies; x uuid;
begin
  if p_id is null then
    if not ds_can(p_project, 'create') then raise exception 'not_allowed' using errcode = '42501'; end if;
    if length(btrim(coalesce(p_title, ''))) < 3 then raise exception 'ds_no_title'; end if;
    insert into ds_studies (project_id, title, answers, weights, sources, created_name, updated_by)
    values (p_project, btrim(p_title), coalesce(p_answers, '{}'::jsonb), p_weights, coalesce(p_sources, '{}'::jsonb), ds_me(), auth.uid()) returning id into x;
    return x;
  end if;
  select * into s from ds_studies where id = p_id for update;
  if not found then raise exception 'ds_not_found'; end if;
  if not (ds_can(s.project_id, 'edit') or ds_can(s.project_id, 'create')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.status in ('in_review', 'approved') then raise exception 'ds_locked'; end if;
  update ds_studies set title = coalesce(nullif(btrim(p_title), ''), title), answers = coalesce(p_answers, answers), weights = p_weights, sources = coalesce(p_sources, sources),
    status = case when status = 'rejected' then 'draft' else status end, updated_by = auth.uid(), updated_at = now() where id = p_id;
  return p_id;
end $f$;

-- an analysis run: stored as an immutable version
create or replace function ds_save_version(p_study uuid, p_answers jsonb, p_weights jsonb, p_result jsonb, p_engine text, p_note text) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare s ds_studies; v int; x uuid;
begin
  select * into s from ds_studies where id = p_study for update;
  if not found then raise exception 'ds_not_found'; end if;
  if not (ds_can(s.project_id, 'edit') or ds_can(s.project_id, 'create')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if s.status in ('in_review', 'approved') then raise exception 'ds_locked'; end if;
  if p_result is null or p_result -> 'options' is null then raise exception 'ds_bad_result'; end if;
  v := s.current_version + 1;
  insert into ds_versions (study_id, project_id, version, answers, weights, result, engine_version, recommended, confidence, decisive, note, created_name)
  values (p_study, s.project_id, v, p_answers, p_weights, p_result, coalesce(p_engine, ''), p_result ->> 'winner', nullif(p_result #>> '{confidence,score}', '')::numeric,
    coalesce((p_result #>> '{confidence,decisive}')::boolean, false), coalesce(p_note, ''), ds_me()) returning id into x;
  update ds_studies set current_version = v, answers = p_answers, weights = p_weights, status = 'analysed', updated_by = auth.uid(), updated_at = now() where id = p_study;
  return x;
end $f$;

-- the machine-written narrative of a version (once; it only rephrases the version's own items)
create or replace function ds_set_narrative(p_version uuid, p_narrative jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare v ds_versions;
begin
  select * into v from ds_versions where id = p_version for update;
  if not found then raise exception 'ds_not_found'; end if;
  if not (ds_can(v.project_id, 'edit') or ds_can(v.project_id, 'create') or ds_can(v.project_id, 'export')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v.narrative is not null then raise exception 'ds_narrative_exists'; end if;
  update ds_versions set narrative = p_narrative, narrative_at = now() where id = p_version;
end $f$;

-- the steps: submit for decision, decide (approve / approve with another option / return / reject), reopen an approved study
create or replace function ds_decide(p_study uuid, p_decision text, p_method text, p_pricing text[], p_procurement text[], p_execution text[], p_rationale text) returns void language plpgsql security definer set search_path to 'public' as $f$
declare s ds_studies; v ds_versions; same boolean;
begin
  select * into s from ds_studies where id = p_study for update;
  if not found then raise exception 'ds_not_found'; end if;
  select * into v from ds_versions where study_id = p_study and version = s.current_version;
  if not found then raise exception 'ds_no_version'; end if;
  if p_decision = 'submitted' then
    if not ds_can(s.project_id, 'submit') then raise exception 'not_allowed' using errcode = '42501'; end if;
    if s.status <> 'analysed' then raise exception 'ds_bad_step'; end if;
    update ds_studies set status = 'in_review', updated_by = auth.uid(), updated_at = now() where id = p_study;
  elsif p_decision in ('approve', 'approve_override', 'return', 'reject') then
    if not ds_can(s.project_id, case when p_decision = 'reject' then 'reject' else 'approve' end) and not ds_can(s.project_id, 'approve') then raise exception 'not_allowed' using errcode = '42501'; end if;
    if s.status <> 'in_review' then raise exception 'ds_bad_step'; end if;
    same := v.created_by = auth.uid();
    if same and not is_admin_user() then raise exception 'ds_same_person'; end if;
    if p_decision in ('approve', 'approve_override') and coalesce(p_method, '') = '' then raise exception 'ds_no_method'; end if;
    if p_decision = 'approve' and p_method is distinct from v.recommended then p_decision := 'approve_override'; end if;
    if p_decision in ('approve_override', 'return', 'reject') and length(btrim(coalesce(p_rationale, ''))) < 20 then raise exception 'ds_rationale'; end if;
    if p_decision = 'approve' and not v.decisive and length(btrim(coalesce(p_rationale, ''))) < 20 then raise exception 'ds_rationale_indicative'; end if;
    update ds_studies set status = case p_decision when 'return' then 'draft' when 'reject' then 'rejected' else 'approved' end, updated_by = auth.uid(), updated_at = now() where id = p_study;
  elsif p_decision = 'reopen' then
    if not ds_can(s.project_id, 'approve') then raise exception 'not_allowed' using errcode = '42501'; end if;
    if s.status not in ('approved', 'rejected') then raise exception 'ds_bad_step'; end if;
    if length(btrim(coalesce(p_rationale, ''))) < 20 then raise exception 'ds_rationale'; end if;
    update ds_studies set status = 'draft', updated_by = auth.uid(), updated_at = now() where id = p_study;
  else raise exception 'ds_bad_step';
  end if;
  insert into ds_decisions (study_id, version_id, project_id, decision, method, pricing, procurement, execution, rationale, overrides_engine, same_person, decided_name)
  values (p_study, v.id, s.project_id, p_decision, nullif(p_method, ''), coalesce(p_pricing, '{}'), coalesce(p_procurement, '{}'), coalesce(p_execution, '{}'), btrim(coalesce(p_rationale, '')),
    p_decision = 'approve_override', coalesce(same, false), ds_me());
end $f$;

revoke all on function ds_me() from public, anon;
revoke all on function ds_save_study(uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon;
revoke all on function ds_save_version(uuid, jsonb, jsonb, jsonb, text, text) from public, anon;
revoke all on function ds_set_narrative(uuid, jsonb) from public, anon;
revoke all on function ds_decide(uuid, text, text, text[], text[], text[], text) from public, anon;
grant execute on function ds_me() to authenticated;
grant execute on function ds_save_study(uuid, uuid, text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function ds_save_version(uuid, jsonb, jsonb, jsonb, text, text) to authenticated;
grant execute on function ds_set_narrative(uuid, jsonb) to authenticated;
grant execute on function ds_decide(uuid, text, text, text[], text[], text[], text) to authenticated;
