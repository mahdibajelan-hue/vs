-- Execution management (مدیریت اجرا) — part 1: roles, settings, price books, activities, baselines, daily reports and their children, gaps, audit.
-- All tables are prefixed ex_. Fronts / stations come from the shared mtl_lookups lists; materials from mtl_materials; nothing is duplicated.

create table if not exists ex_project_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('contractor','supervision','consultant','employer','manager')),
  organization_id uuid,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, user_id, role)
);

create table if not exists ex_settings (
  project_id uuid primary key,
  values_json jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists ex_price_books (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  discipline text not null default '',
  year int,
  season text not null default '',
  title text not null,
  version int not null default 1,
  status text not null default 'active' check (status in ('active','superseded')),
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists ex_price_items (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references ex_price_books(id) on delete cascade,
  chapter text not null default '',
  item_no text not null,
  description text not null,
  unit text not null default '',
  unit_price numeric not null default 0,
  starred boolean not null default false,
  unique (book_id, item_no)
);

create table if not exists ex_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  price_item_id uuid references ex_price_items(id) on delete set null,
  item_no text not null default '',
  title text not null,
  unit text not null default '',
  chapter text not null default '',
  kind text not null default 'standard' check (kind in ('standard','starred','special')),
  base_qty numeric not null default 0,
  unit_price numeric not null default 0,
  weight numeric not null default 0,
  weight_group text not null default '',
  metric text not null default '',
  area text not null default '',
  front text not null default '',
  station text not null default '',
  km_from numeric,
  km_to numeric,
  planned_start date,
  planned_end date,
  active boolean not null default true,
  approval text not null default 'approved' check (approval in ('draft','pending','approved','rejected')),
  approval_note text not null default '',
  approved_by uuid,
  approved_at timestamptz,
  sort int not null default 0,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_ex_activities_project on ex_activities (project_id, sort);

create table if not exists ex_baselines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  version int not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  reason text not null default '',
  effective_date date not null default current_date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  unique (project_id, version)
);

create table if not exists ex_baseline_lines (
  id uuid primary key default gen_random_uuid(),
  baseline_id uuid not null references ex_baselines(id) on delete cascade,
  activity_id uuid not null references ex_activities(id) on delete cascade,
  item_no text not null default '',
  title text not null default '',
  unit text not null default '',
  base_qty numeric not null default 0,
  weight numeric not null default 0,
  unit_price numeric not null default 0,
  weight_group text not null default '',
  active boolean not null default true,
  unique (baseline_id, activity_id)
);

create table if not exists ex_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  form_key text not null default 'work',
  report_no text not null default '',
  report_date date not null default current_date,
  contractor_org_id uuid,
  front text not null default '',
  station text not null default '',
  shift text not null default 'day',
  status text not null default 'draft' check (status in ('draft','incomplete','submitted','partially_approved','approved','returned','rejected')),
  data jsonb not null default '{}'::jsonb,
  notes text not null default '',
  missing jsonb not null default '[]'::jsonb,
  completion_of uuid,
  due_date date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  submitted_by uuid,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text not null default '',
  updated_at timestamptz not null default now(),
  unique (project_id, form_key, report_no)
);
create index if not exists idx_ex_reports_project_date on ex_reports (project_id, report_date desc);

create table if not exists ex_report_lines (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references ex_reports(id) on delete cascade,
  line_no int not null default 0,
  activity_id uuid references ex_activities(id) on delete restrict,
  qty numeric not null default 0,
  km_from numeric,
  km_to numeric,
  location text not null default '',
  note text not null default '',
  detail jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','approved','rejected','returned')),
  approved_qty numeric,
  review_note text not null default '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  source_report_id uuid references ex_reports(id) on delete set null,
  evidence jsonb not null default '[]'::jsonb
);
create index if not exists idx_ex_lines_report on ex_report_lines (report_id, line_no);
create index if not exists idx_ex_lines_activity on ex_report_lines (activity_id);
create unique index if not exists uq_ex_lines_source on ex_report_lines (source_report_id, activity_id) where source_report_id is not null;

create table if not exists ex_report_resources (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references ex_reports(id) on delete cascade,
  kind text not null check (kind in ('man','equip')),
  name text not null,
  active_qty numeric not null default 0,
  idle_qty numeric not null default 0,
  hours numeric not null default 0,
  note text not null default ''
);

create table if not exists ex_report_stoppages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references ex_reports(id) on delete cascade,
  category text not null default 'other' check (category in ('material','drawing','land','permit','weather','equipment','manpower','hse','other')),
  hours numeric not null default 0,
  description text not null default '',
  material_id uuid,
  issue_ref uuid
);

create table if not exists ex_report_history (
  id bigserial primary key,
  report_id uuid not null references ex_reports(id) on delete cascade,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  action text not null,
  note text not null default ''
);

create table if not exists ex_form_activity_map (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  form_key text not null,
  metric_key text not null,
  group_value text not null default '',
  activity_id uuid not null references ex_activities(id) on delete cascade,
  unique (project_id, form_key, metric_key, group_value)
);

create table if not exists ex_gap_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  fingerprint text not null,
  kind text not null check (kind in ('missing_report','incomplete','inconsistent','unreviewed','period_open','form_missing')),
  form_key text not null default '',
  period_key text not null default '',
  front text not null default '',
  subject text not null default '',
  existing jsonb not null default '{}'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  responsible uuid,
  due_date date,
  status text not null default 'open' check (status in ('open','in_progress','closed','waived')),
  note text not null default '',
  generated_report_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, fingerprint)
);

create table if not exists ex_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  table_name text not null,
  row_id uuid,
  project_id uuid,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
create index if not exists idx_ex_audit_project on ex_audit (project_id, at desc);
