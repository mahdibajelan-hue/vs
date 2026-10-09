-- Change Management v2 — core (extends chg_* tables, adds the rule-engine tables). Idempotent.
-- 1) statuses: legacy 12-state pipeline -> process states
alter table chg_change_requests drop constraint if exists chg_change_requests_status_check;
update chg_change_requests set status = case status
  when 'engineering_review' then 'evaluating' when 'planning_review' then 'evaluating' when 'contract_review' then 'evaluating'
  when 'pm_review' then 'awaiting_approval' when 'ccb_review' then 'awaiting_approval'
  when 'implementation' then 'implementing' when 'verification' then 'implemented' else status end;
alter table chg_change_requests add constraint chg_change_requests_status_check check (status in
  ('draft','submitted','evaluating','awaiting_approval','approved','rejected','returned','implementing','implemented','closed','cancelled'));

-- 2) rule-engine tables
create table if not exists cm_rule_sets (
  id uuid primary key default gen_random_uuid(), version int generated always as identity, name text not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  effective_from date, effective_to date, note text not null default '', is_sample boolean not null default false,
  created_by uuid default auth.uid() references profiles(id), created_at timestamptz not null default now(), activated_by uuid references profiles(id), activated_at timestamptz);
create unique index if not exists cm_one_active_set on cm_rule_sets ((true)) where status = 'active';

create table if not exists cm_routes (
  id uuid primary key default gen_random_uuid(), rule_set_id uuid not null references cm_rule_sets(id) on delete cascade, code text not null, title text not null,
  mode text not null default 'sequential' check (mode in ('sequential','parallel')), level int not null default 1, unique (rule_set_id, code));
create table if not exists cm_route_steps (
  id uuid primary key default gen_random_uuid(), route_id uuid not null references cm_routes(id) on delete cascade, seq int not null,
  kind text not null default 'approval' check (kind in ('opinion','approval','body')), role_name text not null, label text not null default '',
  parallel_group int, sla_days int not null default 5, requires_reference boolean not null default false, unique (route_id, seq));
create table if not exists cm_rules (
  id uuid primary key default gen_random_uuid(), rule_set_id uuid not null references cm_rule_sets(id) on delete cascade, code text not null, title text not null,
  dimension text not null check (dimension in ('cost','time','type')), change_types text[] not null default '{}',
  cost_basis text not null default 'cumulative' check (cost_basis in ('current','cumulative')), pct_min numeric, pct_max numeric, amount_min numeric, amount_max numeric,
  days_basis text not null default 'cumulative' check (days_basis in ('current','cumulative')), days_min int, days_max int, days_pct_min numeric, days_pct_max numeric,
  contract_types text[] not null default '{}', project_ids uuid[] not null default '{}', org_units text[] not null default '{}', requires_opinions text[] not null default '{}',
  route_id uuid not null references cm_routes(id) on delete restrict, priority int not null default 100, active boolean not null default true, valid_from date, valid_to date,
  escalate_after_days int, escalation_role text, notes text not null default '', unique (rule_set_id, code));
create table if not exists cm_authority_limits (
  id uuid primary key default gen_random_uuid(), role_name text not null, max_cost_pct numeric, max_cost_amount numeric, max_days int, active boolean not null default true,
  valid_from date, valid_to date, note text not null default '', created_at timestamptz not null default now());
create table if not exists cm_rule_audit (
  id bigint generated always as identity primary key, at timestamptz not null default now(), user_id uuid default auth.uid(), table_name text not null, row_id uuid, action text not null, old_data jsonb, new_data jsonb);

-- 3) request columns
alter table chg_change_requests
  add column if not exists change_type text check (change_type in ('additional_work','new_work','quantity','technical','time_extension','other')),
  add column if not exists contract_id uuid references fin_contracts(id) on delete set null,
  add column if not exists contractor_org_id uuid references organizations(id) on delete set null,
  add column if not exists org_unit text not null default '',
  add column if not exists rule_set_id uuid references cm_rule_sets(id),
  add column if not exists route_status text not null default 'none' check (route_status in ('none','resolved','blocked')),
  add column if not exists route_snapshot jsonb,
  add column if not exists route_blockers jsonb not null default '[]'::jsonb,
  add column if not exists base_amount numeric,
  add column if not exists cum_prev_amount numeric,
  add column if not exists cum_prev_days int,
  add column if not exists evaluation_note text not null default '',
  add column if not exists impact_quality text not null default '',
  add column if not exists impact_safety text not null default '',
  add column if not exists evaluation_completed_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists decision_note text not null default '',
  add column if not exists cancel_reason text not null default '',
  add column if not exists implementation_owner_id uuid references profiles(id),
  add column if not exists implementation_due date,
  add column if not exists implementation_started_at timestamptz,
  add column if not exists result_note text not null default '',
  add column if not exists result_recorded_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists executed_under_exception boolean not null default false,
  add column if not exists attempt int not null default 1,
  add column if not exists stage_entered_at timestamptz not null default now();
create index if not exists chg_req_project_status on chg_change_requests (master_project_id, status);
create index if not exists chg_req_contract on chg_change_requests (contract_id);

-- 4) instances, exceptions, links
create table if not exists cm_request_steps (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references chg_change_requests(id) on delete cascade, attempt int not null default 1, seq int not null, group_no int,
  kind text not null check (kind in ('opinion','approval','body')), role_name text not null, label text not null default '', route_code text not null default '', rule_codes text[] not null default '{}',
  status text not null default 'waiting' check (status in ('waiting','active','approved','rejected','returned','skipped')), opinion text not null default '', reference_no text not null default '', reference_date date,
  requires_reference boolean not null default false, decided_by uuid references profiles(id), decided_by_name text, decided_as_admin boolean not null default false, decided_at timestamptz,
  entered_at timestamptz, due_at timestamptz, reminded_at timestamptz, escalated_at timestamptz, sla_days int not null default 5);
create index if not exists cm_steps_req on cm_request_steps (request_id, attempt, seq);
create table if not exists cm_exceptions (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references chg_change_requests(id) on delete cascade, justification text not null, evidence_ref text not null default '',
  status text not null default 'requested' check (status in ('requested','authorised','refused')), requested_by uuid default auth.uid() references profiles(id), requested_at timestamptz not null default now(),
  decided_by uuid references profiles(id), decided_at timestamptz, decision_note text not null default '');
create table if not exists cm_links (
  id uuid primary key default gen_random_uuid(), request_id uuid not null references chg_change_requests(id) on delete cascade, target_type text not null check (target_type in ('risk','issue')), target_id uuid not null,
  target_label text not null default '', relation text not null default 'related' check (relation in ('raises','caused_by','mitigates','related')), source text not null default 'manual' check (source in ('manual','suggestion','auto')),
  created_by uuid default auth.uid() references profiles(id), created_at timestamptz not null default now(), unique (request_id, target_type, target_id));
