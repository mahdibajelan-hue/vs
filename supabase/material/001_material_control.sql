-- Material control — part 1: configuration, MTO columns, packages and weighted stages, ledger, discrepancies, roles, links, audit.
-- Extends the existing mtl_* module (schema.sql §20); nothing is duplicated. Applied live.

-- ───────────── roles and permission matrix
create table if not exists mtl_project_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('contractor','consultant','employer','storekeeper','controller','inspector','manager')),
  organization_id uuid,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, user_id, role)
);

create table if not exists mtl_settings_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  valid_from date not null default current_date,
  note text not null default '',
  values_json jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists mtl_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  table_name text not null,
  row_id uuid,
  master_project_id uuid,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
create index if not exists idx_mtl_audit_project on mtl_audit (master_project_id, at desc);

-- ───────────── configuration: groups, units, stages, weight patterns
create table if not exists mtl_units (
  code text primary key,
  label text not null,
  kind text not null default 'count' check (kind in ('count','length','weight','volume','area','pack')),
  base_code text,
  to_base numeric not null default 1 check (to_base > 0),
  active boolean not null default true
);

create table if not exists mtl_patterns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  notes text not null default '',
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists mtl_stage_defs (
  key text primary key,
  title text not null,
  sort int not null default 0,
  review_level text not null default 'consultant' check (review_level in ('consultant','employer','both')),
  needs_evidence boolean not null default true,
  active boolean not null default true
);

create table if not exists mtl_pattern_weights (
  pattern_id uuid not null references mtl_patterns (id) on delete cascade,
  stage_key text not null references mtl_stage_defs (key) on update cascade,
  weight numeric not null default 0 check (weight >= 0 and weight <= 100),
  primary key (pattern_id, stage_key)
);

create table if not exists mtl_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  measure_kind text not null default 'count' check (measure_kind in ('count','length','weight','volume','consumable')),
  default_unit text,
  is_consumable boolean not null default false,
  pattern_id uuid references mtl_patterns (id) on delete set null,
  lead_time_days int not null default 0,
  criticality text not null default 'B' check (criticality in ('A','B','C')),
  sort int not null default 0,
  active boolean not null default true
);

-- ───────────── MTO columns on the existing material row
alter table mtl_materials
  add column if not exists group_id uuid references mtl_groups (id) on delete set null,
  add column if not exists contract_qty numeric check (contract_qty is null or contract_qty >= 0),
  add column if not exists detail_qty numeric check (detail_qty is null or detail_qty >= 0),
  add column if not exists detail_status text not null default 'none' check (detail_status in ('none','draft','linked','final')),
  add column if not exists pipeline_no text not null default '',
  add column if not exists isometric_no text not null default '',
  add column if not exists front text not null default '',
  add column if not exists usage_location text not null default '',
  add column if not exists need_date date,
  add column if not exists criticality text not null default 'B' check (criticality in ('A','B','C')),
  add column if not exists lead_time_days int,
  add column if not exists price_basis text not null default '',
  add column if not exists price_date date,
  add column if not exists fx_rate numeric not null default 1,
  add column if not exists spec_ref text not null default '',
  add column if not exists is_demo boolean not null default false;

-- the rows that exist today were produced by the demo-data generator
update mtl_materials set is_demo = true, contract_qty = coalesce(contract_qty, mto_quantity) where contract_qty is null;
alter table mtl_purchase_orders add column if not exists is_demo boolean not null default false;
update mtl_purchase_orders set is_demo = true;

-- the base quantity (mto_quantity) follows the contract MTO; items that exist only in the detail design take the design quantity
create or replace function mtl_materials_base_trg() returns trigger language plpgsql as $f$
begin
  new.mto_quantity := coalesce(new.contract_qty, new.detail_qty, new.mto_quantity, 0);
  return new;
end $f$;
drop trigger if exists trg_mtl_materials_base on mtl_materials;
create trigger trg_mtl_materials_base before insert or update on mtl_materials for each row execute function mtl_materials_base_trg();

-- inspection state of what arrives at site, and where it is kept
alter table mtl_warehouse_lines
  add column if not exists inspection_status text not null default 'accepted' check (inspection_status in ('pending','accepted','quarantine','rejected')),
  add column if not exists inspected_by uuid,
  add column if not exists inspected_at timestamptz;
alter table mtl_allocations
  add column if not exists front text not null default '',
  add column if not exists facility text not null default '';

-- ───────────── packages, items, weighted stages, baselines
create table if not exists mtl_packages (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  code text not null,
  title text not null,
  group_id uuid references mtl_groups (id) on delete set null,
  contractor_org_id uuid references organizations (id) on delete set null,
  supplier_org_id uuid references organizations (id) on delete set null,
  pattern_id uuid references mtl_patterns (id) on delete set null,
  status text not null default 'draft' check (status in ('draft','active','closed','cancelled')),
  planned_start date,
  planned_end date,
  notes text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (master_project_id, code)
);
alter table mtl_procurement_requests add column if not exists package_id uuid references mtl_packages (id) on delete set null;
alter table mtl_purchase_orders add column if not exists package_id uuid references mtl_packages (id) on delete set null;

create table if not exists mtl_package_items (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references mtl_packages (id) on delete cascade,
  material_id uuid not null references mtl_materials (id) on delete cascade,
  qty numeric not null default 0 check (qty >= 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  currency text not null default 'IRR',
  supplier_org_id uuid references organizations (id) on delete set null,
  planned_delivery date,
  baseline_version int not null default 0,
  created_at timestamptz not null default now(),
  unique (package_id, material_id)
);

create table if not exists mtl_item_stages (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references mtl_package_items (id) on delete cascade,
  stage_key text not null references mtl_stage_defs (key) on update cascade,
  applicable boolean not null default true,
  na_reason text not null default '',
  weight numeric not null default 0 check (weight >= 0 and weight <= 100),
  planned_date date,
  actual_date date,
  responsible uuid,
  status text not null default 'pending' check (status in ('pending','submitted','reviewed','approved','rejected')),
  done_qty numeric check (done_qty is null or done_qty >= 0),
  evidence_url text not null default '',
  evidence_note text not null default '',
  submitted_by uuid, submitted_at timestamptz,
  reviewed_by uuid, reviewed_at timestamptz,
  approved_by uuid, approved_at timestamptz,
  reject_reason text not null default '',
  unique (item_id, stage_key)
);

create table if not exists mtl_baselines (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  version int not null,
  status text not null default 'approved' check (status in ('draft','approved')),
  note text not null default '',
  price_method text not null default '',
  currency text not null default 'IRR',
  fx_rate numeric not null default 1,
  base_date date not null default current_date,
  total_value numeric not null default 0,
  snapshot jsonb not null default '[]'::jsonb,
  approved_by uuid, approved_at timestamptz default now(),
  created_at timestamptz not null default now(),
  unique (master_project_id, version)
);

-- ───────────── requested changes with history and decision
create table if not exists mtl_changes (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  material_id uuid not null references mtl_materials (id) on delete cascade,
  field text not null check (field in ('contract_qty','detail_qty','unit_price','spec','size','unit','material_code','usage_location','need_date')),
  old_value text not null default '',
  new_value text not null default '',
  reason text not null default '',
  doc_ref text not null default '',
  status text not null default 'requested' check (status in ('requested','approved','rejected')),
  requested_by uuid default auth.uid(), requested_at timestamptz not null default now(),
  decided_by uuid, decided_at timestamptz, decision_note text not null default ''
);

-- ───────────── ledger of stock movements after receipt, and consumption norms
create table if not exists mtl_txns (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  material_id uuid not null references mtl_materials (id) on delete cascade,
  kind text not null check (kind in ('transfer','issue','return','scrap','adjust')),
  qty numeric not null check (qty > 0),
  adjust_sign smallint check (adjust_sign in (-1, 1)),
  txn_date date not null default current_date,
  from_loc text not null default '',
  to_loc text not null default '',
  facility text not null default '',
  front text not null default '',
  allocation_id uuid references mtl_allocations (id) on delete set null,
  work_op text not null default '',
  activity_qty numeric,
  activity_unit text not null default '',
  contractor_org_id uuid references organizations (id) on delete set null,
  doc_ref text not null default '',
  status text not null default 'posted' check (status in ('pending','posted','voided')),
  void_reason text not null default '',
  notes text not null default '',
  is_demo boolean not null default false,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  approved_by uuid, approved_at timestamptz
);
create index if not exists idx_mtl_txns_material on mtl_txns (material_id);
create index if not exists idx_mtl_txns_project on mtl_txns (master_project_id, txn_date);

create table if not exists mtl_norms (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  material_id uuid references mtl_materials (id) on delete cascade,
  group_id uuid references mtl_groups (id) on delete cascade,
  work_op text not null default '',
  per_unit text not null default '',
  qty_per_unit numeric not null check (qty_per_unit >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (material_id is not null or group_id is not null)
);

-- ───────────── discrepancies found by comparison; the decision is human
create table if not exists mtl_discrepancies (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  material_id uuid references mtl_materials (id) on delete cascade,
  package_id uuid references mtl_packages (id) on delete set null,
  kind text not null check (kind in ('not_in_contract','qty_diff','no_order','under_ordered','delay_risk','unallocated','spec_mismatch','unit_mismatch','code_mismatch','location_mismatch','manual')),
  source text not null default 'auto' check (source in ('auto','manual')),
  fingerprint text not null,
  diff_qty numeric,
  probable_cause text not null default '',
  usage_location text not null default '',
  impact text not null default '',
  responsible uuid,
  due_date date,
  status text not null default 'open' check (status in ('open','in_review','resolved','accepted','escalated','cleared')),
  resolution text not null default '',
  decided_by uuid, decided_at timestamptz,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (master_project_id, fingerprint)
);

-- ───────────── links to risks and issues that live in their own modules
create table if not exists mtl_links (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null,
  source_type text not null check (source_type in ('material','package','discrepancy','project','risk')),
  source_id uuid,
  target_type text not null check (target_type in ('risk','issue')),
  target_id uuid not null,
  rel text not null default 'raised' check (rel in ('raised','attached','realized')),
  label text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (source_type, source_id, target_type, target_id)
);
create index if not exists idx_mtl_links_target on mtl_links (target_type, target_id);
create index if not exists idx_mtl_links_project on mtl_links (master_project_id);

create index if not exists idx_mtl_packages_project on mtl_packages (master_project_id);
create index if not exists idx_mtl_package_items_pkg on mtl_package_items (package_id);
create index if not exists idx_mtl_package_items_mat on mtl_package_items (material_id);
create index if not exists idx_mtl_item_stages_item on mtl_item_stages (item_id);
create index if not exists idx_mtl_changes_material on mtl_changes (material_id);
create index if not exists idx_mtl_discrepancies_project on mtl_discrepancies (master_project_id, status);
create index if not exists idx_mtl_materials_group on mtl_materials (group_id);
