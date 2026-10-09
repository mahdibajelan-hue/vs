-- ============================================================================
-- ERM v2 — access helpers (central roles) + child tables: controls, contingency plans, evidence, links,
-- corporate risks, formal acceptances, KRIs (+ readings, events), policy, config audit, suggestions.
-- ============================================================================
create or replace function rm_central_access(p_project uuid, p_user uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rasta_project_mappings m
    where m.source_module = 'risk' and m.source_project_id = p_project and m.status = 'confirmed'
      and (rasta_project_scope_ok(p_user, m.master_project_id)
           or exists (select 1 from rasta_project_role_assignments a where a.project_id = m.master_project_id and a.user_id = p_user))
  );
$$;
create or replace function rm_project_role(p_project_id uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from rm_project_members where project_id = p_project_id and user_id = auth.uid() limit 1),
                  case when rm_central_access(p_project_id, auth.uid()) then 'team_member' end);
$$;
create or replace function rm_can_view(p_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select rm_is_project_member(p_project) or is_admin_user() or rasta_scope_ok_for_source('risk', p_project) or rm_central_access(p_project, auth.uid());
$$;
create or replace function rm_risk_project(p_risk uuid) returns uuid language sql stable security definer set search_path = public as $$
  select project_id from rm_risks where id = p_risk;
$$;
create or replace function rm_can_write_risk(p_risk uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from rm_risks r where r.id = p_risk and (rm_can_edit(r.project_id) or r.owner_id = auth.uid() or r.response_owner_id = auth.uid() or is_admin_user()));
$$;
create or replace function rm_is_any_manager() returns boolean language sql stable security definer set search_path = public as $$
  select is_admin_user() or exists (select 1 from rm_project_members where user_id = auth.uid() and role in ('project_manager', 'risk_manager'));
$$;

create table if not exists rm_controls (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references rm_risks (id) on delete cascade,
  name text not null,
  description text not null default '',
  control_type text not null default 'preventive' check (control_type in ('preventive', 'detective', 'corrective', 'contingency')),
  owner_id uuid references profiles (id),
  is_critical boolean not null default false,
  status text not null default 'active' check (status in ('planned', 'active', 'inactive', 'expired')),
  effectiveness text not null default 'not_tested' check (effectiveness in ('not_tested', 'effective', 'partial', 'ineffective')),
  last_tested_at date,
  test_interval_days integer check (test_interval_days is null or test_interval_days between 1 and 730),
  expires_on date,
  evidence_note text not null default '',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists rm_contingency_plans (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references rm_risks (id) on delete cascade,
  trigger_condition text not null,
  plan text not null,
  owner_id uuid references profiles (id),
  budget numeric,
  status text not null default 'draft' check (status in ('draft', 'ready', 'activated', 'retired')),
  activated_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists rm_risk_evidence (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references rm_risks (id) on delete cascade,
  kind text not null default 'document' check (kind in ('document', 'photo', 'letter', 'report', 'assumption', 'calculation', 'link', 'other')),
  title text not null,
  note text not null default '',
  url text not null default '',
  storage_path text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create table if not exists rm_risk_links (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references rm_risks (id) on delete cascade,
  target_type text not null check (target_type in ('risk', 'issue', 'mission', 'finding', 'external')),
  target_id text not null,
  target_label text not null default '',
  relation text not null default 'related' check (relation in ('related', 'shared_cause', 'depends_on', 'duplicate_of', 'derived_issue', 'source', 'mitigated_by', 'aggregates')),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (risk_id, target_type, target_id, relation)
);
create index if not exists idx_rm_links_target on rm_risk_links (target_type, target_id);

create table if not exists rm_corporate_risks (
  id uuid primary key default gen_random_uuid(),
  code text not null default '',
  title text not null,
  description text not null default '',
  category text references rm_categories (key) on update cascade,
  owner_id uuid references profiles (id),
  status text not null default 'open' check (status in ('open', 'monitoring', 'closed')),
  corrective_plan text not null default '',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create or replace function rm_assign_corp_code() returns trigger language plpgsql as $$
begin
  if new.code is null or new.code = '' then new.code := 'CR-' || lpad((select coalesce(max(split_part(code, '-', 2)::int), 0) + 1 from rm_corporate_risks)::text, 3, '0'); end if;
  return new;
end $$;
drop trigger if exists trg_rm_corp_code on rm_corporate_risks;
create trigger trg_rm_corp_code before insert on rm_corporate_risks for each row execute function rm_assign_corp_code();
alter table rm_risks drop constraint if exists rm_risks_corporate_fk;
alter table rm_risks add constraint rm_risks_corporate_fk foreign key (corporate_risk_id) references rm_corporate_risks (id) on delete set null;

create table if not exists rm_acceptances (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references rm_risks (id) on delete cascade,
  requested_by uuid references profiles (id),
  requested_at timestamptz not null default now(),
  residual_score smallint not null,
  rationale text not null,
  valid_until date,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'withdrawn', 'expired')),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  decision_note text not null default ''
);

create table if not exists rm_kris (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references rm_projects (id) on delete cascade,
  risk_id uuid references rm_risks (id) on delete cascade,
  name text not null,
  definition text not null default '',
  unit text not null default '',
  domain text not null default 'general',
  direction text not null default 'higher_worse' check (direction in ('higher_worse', 'lower_worse')),
  baseline numeric,
  warn_threshold numeric not null,
  critical_threshold numeric not null,
  frequency_days integer not null default 7 check (frequency_days between 1 and 365),
  owner_id uuid references profiles (id),
  data_source text not null default 'manual' check (data_source in ('manual', 'external')),
  external_system text,
  external_key text,
  active boolean not null default true,
  current_value numeric,
  last_reading_at timestamptz,
  state text not null default 'no_data' check (state in ('no_data', 'normal', 'warn', 'critical')),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists idx_rm_kris_project on rm_kris (project_id);
create index if not exists idx_rm_kris_risk on rm_kris (risk_id);
create table if not exists rm_kri_readings (
  id bigint generated always as identity primary key,
  kri_id uuid not null references rm_kris (id) on delete cascade,
  value numeric not null,
  read_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'api', 'import')),
  external_ref text,
  note text not null default '',
  created_by uuid references profiles (id)
);
create unique index if not exists uq_rm_kri_reading_ext on rm_kri_readings (kri_id, external_ref) where external_ref is not null;
create index if not exists idx_rm_kri_readings on rm_kri_readings (kri_id, read_at desc);
create table if not exists rm_kri_events (
  id bigint generated always as identity primary key,
  kri_id uuid not null references rm_kris (id) on delete cascade,
  from_state text not null,
  to_state text not null,
  value numeric,
  at timestamptz not null default now()
);
create index if not exists idx_rm_kri_events on rm_kri_events (kri_id, at desc);

create table if not exists rm_policy (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references rm_projects (id) on delete cascade,
  appetite_max smallint not null default 5 check (appetite_max between 1 and 25),
  tolerance_max smallint not null default 10 check (tolerance_max between 1 and 25),
  escalation_min smallint not null default 16 check (escalation_min between 1 and 25),
  level_bounds smallint[] not null default '{6,11,16}',
  review_days jsonb not null default '{"low":90,"medium":45,"high":30,"critical":14}'::jsonb,
  stale_assessment_days integer not null default 90 check (stale_assessment_days between 7 and 730),
  scale_labels jsonb not null default '{}'::jsonb,
  auto_accept_confidence numeric check (auto_accept_confidence is null or auto_accept_confidence between 0 and 1),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now(),
  check (appetite_max <= tolerance_max and tolerance_max < escalation_min)
);
create unique index if not exists uq_rm_policy_scope on rm_policy ((coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)));
insert into rm_policy (project_id) select null where not exists (select 1 from rm_policy where project_id is null);

create table if not exists rm_config_audit (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id text not null,
  actor uuid,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create or replace function rm_config_audit_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into rm_config_audit (entity, entity_id, actor, before, after)
  values (tg_table_name, coalesce((to_jsonb(coalesce(new, old)) ->> 'id'), (to_jsonb(coalesce(new, old)) ->> 'key')), auth.uid(), case when tg_op = 'INSERT' then null else to_jsonb(old) end, case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return null;
end $$;

create table if not exists rm_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references rm_projects (id) on delete cascade,
  source text not null,
  source_ref_type text not null,
  source_ref_id text not null,
  title text not null,
  description text not null default '',
  payload jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0.5,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_risk_id uuid references rm_risks (id) on delete set null,
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source, source_ref_id)
);
