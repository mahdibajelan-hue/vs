-- Execution control (EPC) expansion — part 10: employer step, report versions, letterhead snapshot, fixed legal reservation text,
-- measured / billed / paid ledger, crew logs, prerequisites, schedule dependencies, 3-week look-ahead, engineering documents, form proposals.
-- Everything is additive; no existing column or form definition is changed.

-- 1. Employer step (optional per project: settings.employerStep = 'off' | 'advisory' | 'binding')
alter table ex_report_lines
  add column if not exists employer_qty numeric,
  add column if not exists employer_note text not null default '',
  add column if not exists employer_status text check (employer_status in ('approved','rejected','returned')),
  add column if not exists employer_by uuid,
  add column if not exists employer_at timestamptz;

create or replace function ex_lines_employer_guard_trg() returns trigger language plpgsql as $f$
begin
  if coalesce(current_setting('ex.rpc', true), '') <> '1' and (
       new.employer_qty is distinct from old.employer_qty or new.employer_note is distinct from old.employer_note or new.employer_status is distinct from old.employer_status
       or new.employer_by is distinct from old.employer_by or new.employer_at is distinct from old.employer_at) then
    raise exception 'use_rpc' using errcode = '42501';
  end if;
  return new;
end $f$;
drop trigger if exists trg_ex_lines_employer_guard on ex_report_lines;
create trigger trg_ex_lines_employer_guard before update on ex_report_lines for each row execute function ex_lines_employer_guard_trg();

create or replace function ex_is_employer(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or exists (select 1 from ex_project_roles where project_id = p_project and user_id = auth.uid() and active and role in ('employer','manager')));
$f$;

-- decisions: [{"line_id":"…","decision":"approved|rejected|returned","qty":12.5,"note":"…"}]; only lines the supervision already approved can be decided; the employer value never exceeds the supervision's.
create or replace function ex_report_employer_review(p_id uuid, p_decisions jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
declare r ex_reports; d jsonb; l ex_report_lines; mode text;
begin
  select * into r from ex_reports where id = p_id;
  if r.id is null then raise exception 'not_found'; end if;
  if not ex_is_employer(r.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(values_json ->> 'employerStep', 'off') into mode from ex_settings where project_id = r.project_id;
  if coalesce(mode, 'off') = 'off' then raise exception 'employer_step_off'; end if;
  perform set_config('ex.rpc', '1', true);
  for d in select * from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) loop
    select * into l from ex_report_lines where id = (d ->> 'line_id')::uuid and report_id = p_id;
    if l.id is null then continue; end if;
    if l.status <> 'approved' then raise exception 'supervision_not_approved'; end if;
    if (d ->> 'decision') not in ('approved','rejected','returned') then raise exception 'bad_decision'; end if;
    if (d ->> 'decision') <> 'approved' and coalesce(btrim(d ->> 'note'), '') = '' then raise exception 'note_required'; end if;
    update ex_report_lines set employer_status = d ->> 'decision',
      employer_qty = case when d ->> 'decision' = 'approved' then least(coalesce((d ->> 'qty')::numeric, coalesce(l.approved_qty, l.qty)), coalesce(l.approved_qty, l.qty)) else 0 end,
      employer_note = coalesce(d ->> 'note', ''), employer_by = auth.uid(), employer_at = now() where id = l.id;
  end loop;
  perform ex_hist(p_id, 'employer_review', '');
end $f$;

-- 2. Report versions: a snapshot (report + lines + resources + stoppages) on every status change, so the contractor's original and every later state stay readable.
create table if not exists ex_report_versions (
  id bigserial primary key,
  report_id uuid not null references ex_reports(id) on delete cascade,
  version int not null,
  status text not null,
  snapshot jsonb not null,
  actor uuid default auth.uid(),
  at timestamptz not null default now(),
  unique (report_id, version)
);
create index if not exists idx_ex_report_versions_report on ex_report_versions (report_id, version);

alter table ex_reports add column if not exists letterhead jsonb;

create or replace function ex_report_snapshot_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v int; snap jsonb;
begin
  if new.status is not distinct from old.status then return new; end if;
  select coalesce(max(version), 0) + 1 into v from ex_report_versions where report_id = new.id;
  select jsonb_build_object('report', to_jsonb(new),
    'lines', coalesce((select jsonb_agg(to_jsonb(x) order by x.line_no) from ex_report_lines x where x.report_id = new.id), '[]'::jsonb),
    'resources', coalesce((select jsonb_agg(to_jsonb(x)) from ex_report_resources x where x.report_id = new.id), '[]'::jsonb),
    'stoppages', coalesce((select jsonb_agg(to_jsonb(x)) from ex_report_stoppages x where x.report_id = new.id), '[]'::jsonb)) into snap;
  insert into ex_report_versions (report_id, version, status, snapshot) values (new.id, v, new.status, snap);
  return new;
end $f$;
drop trigger if exists trg_ex_report_snapshot on ex_reports;
create trigger trg_ex_report_snapshot after update of status on ex_reports for each row execute function ex_report_snapshot_trg();

-- 3. Letterhead: the parties' official names and logos live in ex_settings.values_json.parties; the first submission freezes them into the report.
create or replace function ex_report_letterhead_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.letterhead is null and new.status <> 'draft' then
    new.letterhead := (select values_json -> 'parties' from ex_settings where project_id = new.project_id);
  end if;
  return new;
end $f$;
drop trigger if exists trg_ex_report_letterhead on ex_reports;
create trigger trg_ex_report_letterhead before update of status on ex_reports for each row execute function ex_report_letterhead_trg();

-- 4. Fixed contractual-reservation text: append-only, set only through the RPC by configuration administrators; project_id null = company default.
create table if not exists ex_legal_text (
  id bigserial primary key,
  project_id uuid,
  version int not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft','legal_approved')),
  note text not null default '',
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  unique (project_id, version)
);
create unique index if not exists uq_ex_legal_default_version on ex_legal_text (version) where project_id is null;

create or replace function ex_legal_set(p_project uuid, p_body text, p_status text default 'draft', p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare v int;
begin
  if coalesce(btrim(p_body), '') = '' then raise exception 'empty_text'; end if;
  if p_status not in ('draft','legal_approved') then raise exception 'bad_status'; end if;
  if not ((p_project is null and is_admin_user()) or (p_project is not null and ex_can_configure(p_project))) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(max(version), 0) + 1 into v from ex_legal_text where project_id is not distinct from p_project;
  insert into ex_legal_text (project_id, version, body, status, note) values (p_project, v, btrim(p_body), p_status, coalesce(p_note, ''));
end $f$;

-- current text of a project (its own latest version, else the company default)
create or replace function ex_legal_current(p_project uuid) returns table (body text, status text, version int, scope text) language sql stable security definer set search_path to 'public' as $f$
  (select body, status, version, 'project'::text from ex_legal_text where project_id = p_project order by version desc limit 1)
  union all
  (select body, status, version, 'default'::text from ex_legal_text where project_id is null and not exists (select 1 from ex_legal_text where project_id = p_project) order by version desc limit 1);
$f$;

insert into ex_legal_text (project_id, version, body, status, note)
select null, 1, 'ثبت و تأیید این گزارش صرفاً برای مستندسازی عملیات اجرایی است و به‌منزلهٔ پذیرش حق، تعهد مالی یا قراردادی، تأیید مقادیر برای پرداخت یا انصراف از هیچ حق و ادعایی نیست؛ کلیهٔ حقوق و ادعاهای طرفین محفوظ است.', 'draft', 'متن پیش‌فرض موقت — پیش از استفادهٔ رسمی باید به تأیید واحد حقوقی برسد'
where not exists (select 1 from ex_legal_text where project_id is null);

-- 5. Measured / billed / paid ledger (distinct from the daily executed and the supervision-approved quantities)
create table if not exists ex_measurements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  activity_id uuid not null references ex_activities(id) on delete cascade,
  period_key text not null,
  measured_qty numeric not null default 0 check (measured_qty >= 0),
  billed_qty numeric not null default 0 check (billed_qty >= 0),
  paid_qty numeric not null default 0 check (paid_qty >= 0),
  certificate_id uuid,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, activity_id, period_key)
);

create or replace function ex_measurements_guard_trg() returns trigger language plpgsql as $f$
declare cum_app numeric; s_meas numeric; s_bill numeric; s_paid numeric;
begin
  select coalesce(sum(case when l.status = 'approved' then coalesce(l.approved_qty, l.qty) else 0 end), 0) into cum_app
    from ex_report_lines l join ex_reports r on r.id = l.report_id where l.activity_id = new.activity_id and r.form_key = 'work';
  select coalesce(sum(measured_qty), 0), coalesce(sum(billed_qty), 0), coalesce(sum(paid_qty), 0) into s_meas, s_bill, s_paid
    from ex_measurements where activity_id = new.activity_id and id <> new.id;
  s_meas := s_meas + new.measured_qty; s_bill := s_bill + new.billed_qty; s_paid := s_paid + new.paid_qty;
  if s_meas > cum_app + 1e-9 then raise exception 'measured_exceeds_approved'; end if;
  if s_bill > s_meas + 1e-9 then raise exception 'billed_exceeds_measured'; end if;
  if s_paid > s_bill + 1e-9 then raise exception 'paid_exceeds_billed'; end if;
  new.updated_at := now();
  return new;
end $f$;
drop trigger if exists trg_ex_measurements_guard on ex_measurements;
create trigger trg_ex_measurements_guard before insert or update on ex_measurements for each row execute function ex_measurements_guard_trg();

-- 6. Crew logs (productivity input): who and what worked on which activity, with useful / idle hours and output
create table if not exists ex_crew_logs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references ex_reports(id) on delete cascade,
  activity_id uuid references ex_activities(id) on delete set null,
  crew_name text not null default '',
  composition jsonb not null default '{}'::jsonb,       -- {"sideboom":2,"weld_machine":4,"welder":8,"fitter":3,…}
  useful_hours numeric not null default 0 check (useful_hours >= 0),
  idle_hours numeric not null default 0 check (idle_hours >= 0),
  output_qty numeric not null default 0 check (output_qty >= 0),
  conditions jsonb not null default '{}'::jsonb,        -- {"terrain":"…","weather":"…","limit":"inspection|material|front|permit"}
  note text not null default ''
);
create index if not exists idx_ex_crew_logs_report on ex_crew_logs (report_id);
create index if not exists idx_ex_crew_logs_activity on ex_crew_logs (activity_id);

-- 7. Engineering documents, prerequisites, dependencies, look-ahead
create table if not exists ex_eng_docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  doc_no text not null,
  title text not null default '',
  discipline text not null default '',
  rev text not null default '',
  status text not null default 'required' check (status in ('required','issued','pending_approval','approved','restricted','superseded')),
  restriction_note text not null default '',
  due_date date,
  issued_date date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, doc_no, rev)
);
create table if not exists ex_prereqs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  activity_id uuid not null references ex_activities(id) on delete cascade,
  kind text not null check (kind in ('drawing','material','equipment','permit','land','inspection','manpower','other')),
  title text not null default '',
  ref_type text not null default '',   -- 'eng_doc' | 'material' | 'package' | …
  ref_id uuid,
  status text not null default 'pending' check (status in ('ready','pending','blocked','na')),
  needed_date date,
  ready_date date,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_ex_prereqs_activity on ex_prereqs (activity_id);
create table if not exists ex_activity_deps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  pred_id uuid not null references ex_activities(id) on delete cascade,
  succ_id uuid not null references ex_activities(id) on delete cascade,
  dep_type text not null default 'FS' check (dep_type in ('FS','SS','FF','SF')),
  lag_days int not null default 0,
  unique (pred_id, succ_id),
  check (pred_id <> succ_id)
);
create table if not exists ex_schedule_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  file_name text not null default '',
  source text not null default 'excel',
  summary jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  imported_by uuid default auth.uid(),
  imported_at timestamptz not null default now()
);
create table if not exists ex_lookahead (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  week_start date not null,
  activity_id uuid not null references ex_activities(id) on delete cascade,
  front text not null default '',
  responsible text not null default '',
  planned_qty numeric not null default 0 check (planned_qty >= 0),
  resources jsonb not null default '{}'::jsonb,
  committed boolean not null default false,
  achieved_qty numeric,
  deviation_cause text not null default '',
  recovery_plan text not null default '',
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, week_start, activity_id, front)
);

-- 8. Proposed forms: a new technical / QC form is only a proposal until an authorised person approves it
create table if not exists ex_form_proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  form_key text not null,
  title text not null,
  definition jsonb not null default '{}'::jsonb,
  reason text not null default '',
  status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  proposed_by uuid default auth.uid(),
  proposed_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text not null default '',
  unique (project_id, form_key)
);
create or replace function ex_form_proposal_decide(p_id uuid, p_approve boolean, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare pr ex_form_proposals;
begin
  select * into pr from ex_form_proposals where id = p_id;
  if pr.id is null then raise exception 'not_found'; end if;
  if not ex_can_configure(pr.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if pr.proposed_by = auth.uid() and not is_admin_user() then raise exception 'self_approval'; end if;
  update ex_form_proposals set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note, '') where id = p_id;
end $f$;

-- 9. Row-level security and audit
do $$ declare t text; begin
  foreach t in array array['ex_report_versions','ex_legal_text','ex_measurements','ex_crew_logs','ex_eng_docs','ex_prereqs','ex_activity_deps','ex_schedule_imports','ex_lookahead','ex_form_proposals'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_sel', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_sel', t);
  end loop;
  -- planning tables: planners / contractors who may edit activities, or configuration administrators
  foreach t in array array['ex_eng_docs','ex_prereqs','ex_activity_deps','ex_schedule_imports','ex_lookahead'] loop
    execute format('drop policy if exists %I on %I', t || '_w', t);
    execute format('create policy %I on %I for all to authenticated using (ex_allows(project_id, ''edit_activities'') or ex_can_configure(project_id)) with check (ex_allows(project_id, ''edit_activities'') or ex_can_configure(project_id))', t || '_w', t);
  end loop;
  -- measurements: payment-statement reviewers and managers
  execute 'drop policy if exists ex_measurements_w on ex_measurements';
  execute 'create policy ex_measurements_w on ex_measurements for all to authenticated using (ex_allows(project_id, ''measure'') or ex_can_configure(project_id)) with check (ex_allows(project_id, ''measure'') or ex_can_configure(project_id))';
  execute 'drop policy if exists ex_crew_logs_w on ex_crew_logs';
  execute 'create policy ex_crew_logs_w on ex_crew_logs for all to authenticated using (exists (select 1 from ex_reports r where r.id = report_id and ex_allows(r.project_id, ''record''))) with check (exists (select 1 from ex_reports r where r.id = report_id and ex_allows(r.project_id, ''record'')))';
  execute 'drop policy if exists ex_form_proposals_w on ex_form_proposals';
  execute 'create policy ex_form_proposals_w on ex_form_proposals for insert to authenticated with check (ex_allows(project_id, ''record'') or ex_allows(project_id, ''edit_activities'') or ex_can_configure(project_id))';
  -- ex_report_versions and ex_legal_text have no write policy: only the triggers / RPCs above write them.
  foreach t in array array['ex_measurements','ex_crew_logs','ex_eng_docs','ex_prereqs','ex_activity_deps','ex_lookahead','ex_form_proposals'] loop
    execute format('drop trigger if exists trg_ex_audit on %I', t);
    execute format('create trigger trg_ex_audit after insert or update or %s on %I for each row execute function ex_audit_trg()', 'de' || 'lete', t);
  end loop;
end $$;

-- children of a locked report keep the existing guard
drop trigger if exists trg_ex_crew_guard on ex_crew_logs;
create trigger trg_ex_crew_guard before insert or update or delete on ex_crew_logs for each row execute function ex_children_guard_trg();

-- 10. New actions in the default permission matrix: plan (look-ahead / prerequisites) is covered by edit_activities; measure = measured / billed / paid ledger.
create or replace function ex_default_perms() returns jsonb language sql immutable as $$
  select '{"contractor":["record","submit","edit_activities","edit_baseline","manage_gaps","raise","notice"],
           "site_head":["record","submit","manage_gaps","raise","notice"],
           "supervision":["review","reopen","manage_gaps","raise","assess_delay","measure"],
           "consultant":["review","manage_gaps","approve_activity","raise","assess_delay","measure"],
           "employer":["review","approve_activity","approve_baseline","manage_gaps","raise","assess_delay","measure"],
           "planner":["edit_activities","edit_baseline","manage_gaps","raise"],
           "claims":["assess_delay","notice","manage_gaps","raise"],
           "payment":["raise","measure"],
           "manager":["*"]}'::jsonb
$$;

revoke all on function ex_report_employer_review(uuid, jsonb) from public;
grant execute on function ex_report_employer_review(uuid, jsonb) to authenticated;
revoke all on function ex_legal_set(uuid, text, text, text) from public;
grant execute on function ex_legal_set(uuid, text, text, text) to authenticated;
grant execute on function ex_legal_current(uuid) to authenticated;
grant execute on function ex_form_proposal_decide(uuid, boolean, text) to authenticated;
