-- ============================================================================
-- «کنترل کیفیت جوش و تفسیر رادیوگرافی» (weldqc) — step 1: tables, rules of access, workflow functions, film bucket
-- ============================================================================
-- Nothing about a weld or a welder is typed again here:
--   * the weld (سرجوش) is the central weld register of the execution module (ex_welds) — its section, number, pipe,
--     size and wall thickness; the welders of each pass come from the welding / tie-in report rows linked to it;
--   * the welder is the welder register (ex_welders, competency module) — stamp, name, status.
-- This module only adds what quality control produces: radiographic films and their review, interpretation marks,
-- defects (tied to the weld, the film, the pass and the welders of that pass), the evaluation and the NDT inspector's
-- sign-off, repairs (at most two rounds, then cut-out), VT inspections and an append-only opinion trail.
--
-- Who may do what is set in the User Center (module «weldqc», access level or one of the four roles seeded below) and is
-- limited to the projects the person belongs to in execution (ex_can_view):
--   submit    → upload films, review film quality, interpret (marks, defects), run the evaluation   (film interpreter)
--   edit      → VT inspections and repair records                                                   (welding engineer)
--   approve   → the NDT inspector's opinions and final sign-off                                       (NDT inspector)
--   configure → acceptance criteria of the project, withdrawing a defect                              (QC manager)
-- The execution project manager and system admins may do everything.
--
-- Records are never deleted (no delete policy): a mark or a defect is withdrawn with removed_at; opinions are append-only.
-- Rollback: rollback/001_weldqc_rollback.sql (run by hand only).
-- ============================================================================

-- ── module registration (access matrix + the standard ten permissions)
insert into rasta_modules (key, label_fa, is_active) values ('weldqc', 'کنترل کیفیت جوش و رادیوگرافی', true) on conflict (key) do nothing;
insert into rasta_permissions (module_key, action)
select 'weldqc', a.a from (values ('view'), ('create'), ('edit'), ('delete'), ('submit'), ('review'), ('approve'), ('reject'), ('export'), ('configure')) a(a)
where not exists (select 1 from rasta_permissions p where p.module_key = 'weldqc' and p.action = a.a);

-- ── the four QC roles (assigned to people in the User Center like any other role)
insert into rasta_roles (name, description, is_system) values
  ('مفسر فیلم رادیوگرافی', 'بارگذاری و بررسی کیفیت فیلم، تفسیر، ثبت عیب و اجرای ارزیابی (ماژول کنترل کیفیت جوش)', true),
  ('بازرس NDT', 'نظر کارشناسی و تأیید نهایی ارزیابی هر راند (ماژول کنترل کیفیت جوش)', true),
  ('مهندس ناظر جوش', 'بازرسی چشمی (VT) و ثبت تعمیر (ماژول کنترل کیفیت جوش)', true),
  ('مدیر کنترل کیفیت جوش', 'همهٔ کارهای ماژول کنترل کیفیت جوش، شامل معیارهای پذیرش', true)
on conflict (name) do nothing;
insert into rasta_role_permissions (role_id, permission_id)
select r.id, p.id from rasta_roles r join rasta_permissions p on p.module_key = 'weldqc'
where (r.name = 'مفسر فیلم رادیوگرافی' and p.action in ('view', 'export', 'create', 'submit'))
   or (r.name = 'بازرس NDT' and p.action in ('view', 'export', 'review', 'approve', 'reject'))
   or (r.name = 'مهندس ناظر جوش' and p.action in ('view', 'export', 'create', 'edit'))
   or (r.name = 'مدیر کنترل کیفیت جوش')
on conflict do nothing;

-- ── access helper: project membership (execution) + the module permission, or the project's execution manager / admin
create or replace function wq_can(p_project uuid, p_action text) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (
    is_admin_user()
    or ex_can_configure(p_project)
    or (ex_can_view(p_project) and (
      rasta_has_permission(auth.uid(), 'weldqc', p_action)
      or (p_action in ('submit', 'edit') and rasta_has_permission(auth.uid(), 'weldqc', 'configure'))
      or (p_action = 'approve' and rasta_has_permission(auth.uid(), 'weldqc', 'configure'))
    ))
  );
$f$;
revoke all on function wq_can(uuid, text) from public;
grant execute on function wq_can(uuid, text) to authenticated;

-- ── tables
create table if not exists wq_settings (
  project_id uuid primary key,
  criteria jsonb not null default '{}'::jsonb,
  values_json jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid(), updated_at timestamptz not null default now()
);

-- the QC state of one weld of the central register (created on the first QC record of that weld)
create table if not exists wq_joints (
  weld_id uuid primary key references ex_welds (id),
  project_id uuid not null,
  current_round int not null default 0 check (current_round between 0 and 2),
  is_closed boolean not null default false,
  final_status text check (final_status in ('accept', 'cut_out')),
  closed_at timestamptz,
  -- wall thickness / OD used by the rules when the central weld register has none (mm)
  thk_mm numeric check (thk_mm is null or thk_mm > 0),
  od_mm numeric check (od_mm is null or od_mm > 0),
  service_type text not null default 'standard',
  note text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists wq_joints_project on wq_joints (project_id);

create table if not exists wq_vt (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  weld_id uuid not null references ex_welds (id),
  round int not null default 0 check (round between 0 and 2),
  result text not null check (result in ('accept', 'reject')),
  note text not null default '',
  files jsonb not null default '[]'::jsonb,
  by_user uuid default auth.uid(), by_name text not null default '',
  at timestamptz not null default now()
);
create index if not exists wq_vt_weld on wq_vt (weld_id);

create table if not exists wq_films (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  weld_id uuid not null references ex_welds (id),
  round int not null default 0 check (round between 0 and 2),
  exam_type text not null default 'RT' check (exam_type in ('RT', 'RS')),
  attempt int not null default 1,
  segment text not null default '',
  path text not null,
  file_name text not null default '',
  mime text not null default '',
  width int, height int,
  px_per_mm numeric check (px_per_mm is null or px_per_mm > 0),
  iqi text not null default '',
  density text not null default '',
  quality_status text not null default 'pending' check (quality_status in ('pending', 'accepted', 'retake', 'reshoot')),
  quality_note text not null default '',
  quality_by uuid, quality_name text not null default '', quality_at timestamptz,
  uploaded_by uuid default auth.uid(), uploaded_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists wq_films_weld on wq_films (weld_id);
create index if not exists wq_films_project on wq_films (project_id);

create table if not exists wq_marks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  film_id uuid not null references wq_films (id),
  kind text not null check (kind in ('line', 'box', 'point', 'calib')),
  geom jsonb not null,
  label text not null default '',
  removed_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index if not exists wq_marks_film on wq_marks (film_id);

create table if not exists wq_defects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  weld_id uuid not null references ex_welds (id),
  film_id uuid references wq_films (id),
  round int not null default 0 check (round between 0 and 2),
  defect_type text not null check (defect_type in ('crack', 'incomplete_fusion', 'incomplete_penetration', 'internal_undercut', 'external_undercut', 'porosity', 'slag_inclusion', 'burn_through', 'hi_lo', 'other')),
  length_mm numeric not null default 0 check (length_mm >= 0),
  depth_mm numeric not null default 0 check (depth_mm >= 0),
  position_mm numeric not null default 0 check (position_mm >= 0),
  pass text not null default '' check (pass in ('', 'root', 'hot', 'fill', 'cap')),
  -- the welders' stamps of that pass at the time of recording (from the welding report row of the weld)
  welders text[] not null default '{}',
  bbox jsonb,
  detected_by text not null default 'manual' check (detected_by in ('manual', 'ai')),
  confidence numeric,
  confirmed boolean not null default true,
  verdict text check (verdict in ('accept', 'repair', 'cut_out')),
  verdict_reason text not null default '',
  repair_advice text not null default '',
  note text not null default '',
  removed_at timestamptz, removed_by uuid,
  created_by uuid default auth.uid(), created_name text not null default '', created_at timestamptz not null default now()
);
create index if not exists wq_defects_weld on wq_defects (weld_id);
create index if not exists wq_defects_project on wq_defects (project_id);

create table if not exists wq_evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  weld_id uuid not null references ex_welds (id),
  round int not null check (round between 0 and 2),
  overall_status text not null check (overall_status in ('accept', 'repair', 'cut_out')),
  summary text not null default '',
  verdicts jsonb not null default '[]'::jsonb,
  thk_mm numeric,
  evaluated_by uuid default auth.uid(), evaluated_name text not null default '', evaluated_at timestamptz not null default now(),
  signed_by uuid, signed_name text not null default '', signed_at timestamptz,
  forced_cutout boolean not null default false
);
create index if not exists wq_evaluations_weld on wq_evaluations (weld_id, round);

create table if not exists wq_repairs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  weld_id uuid not null references ex_welds (id),
  round int not null check (round between 0 and 1),
  method text not null default '',
  performed_by text not null default '',
  approved_by text not null default '',
  repair_wps text not null default '',
  note text not null default '',
  created_by uuid default auth.uid(), created_name text not null default '', created_at timestamptz not null default now(),
  unique (weld_id, round)
);
create index if not exists wq_repairs_project on wq_repairs (project_id);

-- append-only: an opinion is never edited or removed
create table if not exists wq_opinions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  weld_id uuid not null references ex_welds (id),
  target_kind text not null check (target_kind in ('defect', 'evaluation', 'joint')),
  target_id uuid not null,
  stance text not null default 'note' check (stance in ('agree', 'disagree', 'note')),
  body text not null,
  author uuid default auth.uid(), author_name text not null default '',
  at timestamptz not null default now()
);
create index if not exists wq_opinions_weld on wq_opinions (weld_id);

-- ── row level security: read = project member; write = the module action, and nothing changes on a closed file
create or replace function wq_open(p_weld uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select not coalesce((select is_closed from wq_joints where weld_id = p_weld), false);
$f$;
revoke all on function wq_open(uuid) from public;
grant execute on function wq_open(uuid) to authenticated;

alter table wq_settings enable row level security;
alter table wq_joints enable row level security;
alter table wq_vt enable row level security;
alter table wq_films enable row level security;
alter table wq_marks enable row level security;
alter table wq_defects enable row level security;
alter table wq_evaluations enable row level security;
alter table wq_repairs enable row level security;
alter table wq_opinions enable row level security;

create policy wq_settings_sel on wq_settings for select to authenticated using (ex_can_view(project_id));
create policy wq_settings_ins on wq_settings for insert to authenticated with check (wq_can(project_id, 'configure'));
create policy wq_settings_upd on wq_settings for update to authenticated using (wq_can(project_id, 'configure')) with check (wq_can(project_id, 'configure'));

create policy wq_joints_sel on wq_joints for select to authenticated using (ex_can_view(project_id));
create policy wq_joints_ins on wq_joints for insert to authenticated with check (wq_can(project_id, 'submit') or wq_can(project_id, 'edit'));
-- round / closing move only through the functions below; thickness, OD, service and note while the file is open
create policy wq_joints_upd on wq_joints for update to authenticated using ((wq_can(project_id, 'submit') or wq_can(project_id, 'edit')) and not is_closed) with check (wq_can(project_id, 'submit') or wq_can(project_id, 'edit'));

create policy wq_vt_sel on wq_vt for select to authenticated using (ex_can_view(project_id));
create policy wq_vt_ins on wq_vt for insert to authenticated with check (wq_can(project_id, 'edit') and wq_open(weld_id));

create policy wq_films_sel on wq_films for select to authenticated using (ex_can_view(project_id));
create policy wq_films_ins on wq_films for insert to authenticated with check (wq_can(project_id, 'submit') and wq_open(weld_id));
create policy wq_films_upd on wq_films for update to authenticated using (wq_can(project_id, 'submit') and wq_open(weld_id)) with check (wq_can(project_id, 'submit'));

create policy wq_marks_sel on wq_marks for select to authenticated using (ex_can_view(project_id));
create policy wq_marks_ins on wq_marks for insert to authenticated with check (wq_can(project_id, 'submit'));
create policy wq_marks_upd on wq_marks for update to authenticated using (wq_can(project_id, 'submit')) with check (wq_can(project_id, 'submit'));

create policy wq_defects_sel on wq_defects for select to authenticated using (ex_can_view(project_id));
create policy wq_defects_ins on wq_defects for insert to authenticated with check (wq_can(project_id, 'submit') and wq_open(weld_id));
create policy wq_defects_upd on wq_defects for update to authenticated using ((wq_can(project_id, 'submit') or wq_can(project_id, 'configure')) and wq_open(weld_id)) with check (wq_can(project_id, 'submit') or wq_can(project_id, 'configure'));

create policy wq_evaluations_sel on wq_evaluations for select to authenticated using (ex_can_view(project_id));
create policy wq_repairs_sel on wq_repairs for select to authenticated using (ex_can_view(project_id));

create policy wq_opinions_sel on wq_opinions for select to authenticated using (ex_can_view(project_id));
create policy wq_opinions_ins on wq_opinions for insert to authenticated with check (wq_can(project_id, 'approve') or wq_can(project_id, 'submit') or wq_can(project_id, 'edit'));

-- ── workflow (security definer: the checks of the procedure live here, not in the screen)
create or replace function wq_ensure_joint(p_weld uuid) returns wq_joints language plpgsql security definer set search_path to 'public' as $f$
declare j wq_joints; w ex_welds;
begin
  select * into w from ex_welds where id = p_weld;
  if w.id is null then raise exception 'weld_not_found'; end if;
  if not ex_can_view(w.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into wq_joints (weld_id, project_id) values (p_weld, w.project_id) on conflict (weld_id) do nothing;
  select * into j from wq_joints where weld_id = p_weld;
  return j;
end $f$;

-- the evaluation of the current round, computed by the acceptance rules of the project (client) from the defects of the
-- accepted films; it is stored here with the person's name and waits for the NDT inspector
create or replace function wq_evaluate(p_weld uuid, p_overall text, p_summary text, p_verdicts jsonb, p_thk numeric, p_name text) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare j wq_joints; v jsonb; new_id uuid;
begin
  j := wq_ensure_joint(p_weld);
  if not wq_can(j.project_id, 'submit') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if j.is_closed then raise exception 'file_closed'; end if;
  if p_overall not in ('accept', 'repair', 'cut_out') then raise exception 'invalid_status'; end if;
  if exists (select 1 from wq_films where weld_id = p_weld and round = j.current_round)
     and not exists (select 1 from wq_films where weld_id = p_weld and round = j.current_round and quality_status = 'accepted') then
    raise exception 'no_accepted_film';
  end if;
  insert into wq_evaluations (project_id, weld_id, round, overall_status, summary, verdicts, thk_mm, evaluated_name)
  values (j.project_id, p_weld, j.current_round, p_overall, coalesce(p_summary, ''), coalesce(p_verdicts, '[]'::jsonb), p_thk, coalesce(p_name, ''))
  returning id into new_id;
  for v in select * from jsonb_array_elements(coalesce(p_verdicts, '[]'::jsonb)) loop
    update wq_defects set verdict = v->>'verdict', verdict_reason = coalesce(v->>'reason', ''), repair_advice = coalesce(v->>'advice', '')
    where id = (v->>'id')::uuid and weld_id = p_weld and round = j.current_round and removed_at is null;
  end loop;
  return new_id;
end $f$;

-- the NDT inspector's final sign-off of the round's latest evaluation; «accept» or «cut-out» closes the file
create or replace function wq_sign(p_weld uuid, p_force_cutout boolean, p_name text) returns text language plpgsql security definer set search_path to 'public' as $f$
declare j wq_joints; e wq_evaluations; st text;
begin
  select * into j from wq_joints where weld_id = p_weld;
  if j.weld_id is null then raise exception 'no_evaluation'; end if;
  if not wq_can(j.project_id, 'approve') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if j.is_closed then raise exception 'file_closed'; end if;
  select * into e from wq_evaluations where weld_id = p_weld and round = j.current_round order by evaluated_at desc limit 1;
  if e.id is null then raise exception 'no_evaluation'; end if;
  st := e.overall_status;
  if coalesce(p_force_cutout, false) then
    if st <> 'repair' or j.current_round < 2 then raise exception 'cutout_not_allowed'; end if;
    st := 'cut_out';
  end if;
  update wq_evaluations set signed_by = auth.uid(), signed_name = coalesce(p_name, ''), signed_at = now(),
    overall_status = st, forced_cutout = coalesce(p_force_cutout, false),
    summary = case when coalesce(p_force_cutout, false) then summary || ' [به دلیل تکمیل سقف مجاز تعمیر، توسط بازرس به «برش» تغییر یافت]' else summary end
  where id = e.id;
  if st in ('accept', 'cut_out') then
    update wq_joints set is_closed = true, final_status = st, closed_at = now(), updated_at = now() where weld_id = p_weld;
  end if;
  return st;
end $f$;

-- the repair of a signed «repair» round; the next round (RS) opens. A third repair is not allowed: the joint is cut out.
create or replace function wq_repair(p_weld uuid, p_method text, p_performed_by text, p_approved_by text, p_wps text, p_note text, p_name text) returns int language plpgsql security definer set search_path to 'public' as $f$
declare j wq_joints; e wq_evaluations;
begin
  select * into j from wq_joints where weld_id = p_weld;
  if j.weld_id is null then raise exception 'no_evaluation'; end if;
  if not wq_can(j.project_id, 'edit') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if j.is_closed then raise exception 'file_closed'; end if;
  if j.current_round >= 2 then raise exception 'max_repairs'; end if;
  select * into e from wq_evaluations where weld_id = p_weld and round = j.current_round order by evaluated_at desc limit 1;
  if e.id is null or e.overall_status <> 'repair' then raise exception 'not_repair'; end if;
  if e.signed_at is null then raise exception 'not_signed'; end if;
  insert into wq_repairs (project_id, weld_id, round, method, performed_by, approved_by, repair_wps, note, created_name)
  values (j.project_id, p_weld, j.current_round, coalesce(p_method, ''), coalesce(p_performed_by, ''), coalesce(p_approved_by, ''), coalesce(p_wps, ''), coalesce(p_note, ''), coalesce(p_name, ''));
  update wq_joints set current_round = current_round + 1, updated_at = now() where weld_id = p_weld;
  return j.current_round + 1;
end $f$;

revoke all on function wq_ensure_joint(uuid) from public;
revoke all on function wq_evaluate(uuid, text, text, jsonb, numeric, text) from public;
revoke all on function wq_sign(uuid, boolean, text) from public;
revoke all on function wq_repair(uuid, text, text, text, text, text, text) from public;
grant execute on function wq_ensure_joint(uuid) to authenticated;
grant execute on function wq_evaluate(uuid, text, text, jsonb, numeric, text) to authenticated;
grant execute on function wq_sign(uuid, boolean, text) to authenticated;
grant execute on function wq_repair(uuid, text, text, text, text, text, text) to authenticated;

-- ── film and VT files: <project_id>/<weld_id>/<uuid>.<ext> in the private bucket «wq-films»
insert into storage.buckets (id, name, public, file_size_limit) values ('wq-films', 'wq-films', false, 52428800) on conflict (id) do nothing;
create or replace function wq_path_project(p_name text) returns uuid language plpgsql immutable set search_path to 'public' as $f$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then return null;
end $f$;
create policy wq_films_obj_read on storage.objects for select to authenticated using (bucket_id = 'wq-films' and ex_can_view(wq_path_project(name)));
create policy wq_films_obj_write on storage.objects for insert to authenticated with check (bucket_id = 'wq-films' and (wq_can(wq_path_project(name), 'submit') or wq_can(wq_path_project(name), 'edit')));
