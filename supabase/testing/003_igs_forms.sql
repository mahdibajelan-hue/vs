-- IGS-C-PL-100(3) hydrostatic test: the project's procedure parameters and calibration list, each section's pipe walls,
-- weld numbers and point elevations, readings by location (km / elevation / which gauge) with the injected volume, and the
-- test minutes (permit, gauge plate, air, strength, leak, drying) as one row per test and kind.
alter table ht_settings add column if not exists method text not null default 'igs' check (method in ('igs', 'factor'));
alter table ht_settings add column if not exists igs jsonb;
alter table ht_settings add column if not exists equipment jsonb;
alter table ht_settings add column if not exists parties jsonb;

alter table ht_sections add column if not exists wall_mix jsonb;
alter table ht_sections add column if not exists weld_from text not null default '';
alter table ht_sections add column if not exists weld_to text not null default '';
alter table ht_sections add column if not exists elev_start numeric;
alter table ht_sections add column if not exists elev_end numeric;
alter table ht_sections add column if not exists head_elev numeric;

alter table ht_readings add column if not exists location text not null default '';
alter table ht_readings add column if not exists km numeric;
alter table ht_readings add column if not exists elev numeric;
alter table ht_readings add column if not exists volume_m3 numeric;

create table if not exists ht_forms (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  target_kind text not null check (target_kind in ('section', 'pack')),
  target_id uuid not null,
  kind text not null check (kind in ('permit', 'gauge', 'air', 'strength', 'leak', 'drying')),
  data jsonb not null default '{}'::jsonb,
  result text not null default 'pending' check (result in ('pending', 'pass', 'fail')),
  at date,
  by_user text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_id, kind)
);
create index if not exists ht_forms_project on ht_forms (master_project_id);
alter table ht_forms enable row level security;
create policy ht_forms_sel on ht_forms for select to authenticated using (auth.uid() is not null);
create policy ht_forms_ins on ht_forms for insert to authenticated with check (auth.uid() is not null);
create policy ht_forms_upd on ht_forms for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
