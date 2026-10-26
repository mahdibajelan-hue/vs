create table if not exists ht_settings (
  master_project_id uuid primary key references master_projects (id) on delete cascade,
  test_factor numeric not null default 1.25,
  max_hoop_pct numeric not null default 95,
  max_section_km numeric not null default 20,
  min_section_km numeric not null default 1,
  density numeric not null default 1000,
  strength_hold_h numeric not null default 4,
  leak_hold_h numeric not null default 24,
  allowed_drop_bar numeric not null default 0.5,
  smys_override numeric,
  profile jsonb,
  profile_name text,
  updated_by text, updated_at timestamptz not null default now()
);
create table if not exists ht_sections (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  seq int not null,
  code text not null,
  km_from numeric not null, km_to numeric not null,
  elev_min numeric, elev_min_km numeric, elev_max numeric, elev_max_km numeric,
  p_high numeric, p_low numeric, hoop_low_pct numeric, head_km numeric, p_head numeric, volume_m3 numeric,
  cut text not null default 'end',
  stage text not null default 'planned' check (stage in ('planned', 'cleaning', 'filling', 'stabilization', 'strength', 'leak', 'dewatering', 'accepted')),
  failed boolean not null default false,
  failed_note text not null default '',
  planned_date date,
  note text not null default '',
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (master_project_id, code)
);
create table if not exists ht_packs (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  code text not null,
  station text not null default '',
  title text not null default '',
  design_pressure_bar numeric not null,
  test_pressure_bar numeric not null,
  medium text not null default 'water' check (medium in ('water', 'air', 'nitrogen')),
  stage text not null default 'planned' check (stage in ('planned', 'cleaning', 'filling', 'stabilization', 'strength', 'leak', 'dewatering', 'accepted')),
  failed boolean not null default false,
  failed_note text not null default '',
  planned_date date,
  note text not null default '',
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (master_project_id, code)
);
create table if not exists ht_readings (
  id bigserial primary key,
  master_project_id uuid not null references master_projects (id) on delete cascade,
  target_kind text not null check (target_kind in ('section', 'pack')),
  target_id uuid not null,
  phase text not null,
  at timestamptz not null,
  pressure_bar numeric not null,
  temp_c numeric,
  note text not null default '',
  by_user text
);
create index if not exists ht_readings_target on ht_readings (target_id, at);
create table if not exists ht_events (
  id bigserial primary key,
  master_project_id uuid not null references master_projects (id) on delete cascade,
  target_kind text not null, target_id uuid not null,
  stage text not null, failed boolean not null default false,
  note text not null default '', by_user text, at timestamptz not null default now()
);
create index if not exists ht_events_target on ht_events (target_id);
create table if not exists ct_records (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  kind text not null check (kind in ('holiday', 'dcvg', 'cips', 'adhesion', 'dft')),
  km_from numeric not null, km_to numeric not null,
  at date not null,
  voltage_kv numeric,
  result text not null default 'pass' check (result in ('pass', 'fail')),
  defects int not null default 0,
  report_no text not null default '',
  contractor text not null default '',
  note text not null default '',
  by_user text, created_at timestamptz not null default now()
);
create table if not exists ct_defects (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  record_id uuid references ct_records (id) on delete set null,
  km numeric not null,
  kind text not null default 'holiday',
  severity text not null default 'minor' check (severity in ('minor', 'moderate', 'severe')),
  status text not null default 'open' check (status in ('open', 'repaired', 'verified')),
  note text not null default '',
  repaired_at date,
  by_user text, created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['ht_settings', 'ht_sections', 'ht_packs', 'ht_readings', 'ht_events', 'ct_records', 'ct_defects'] loop
    execute format('alter table %I enable row level security', t);
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_auth') then
      execute format('create policy %I on %I for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null)', t || '_auth', t);
    end if;
  end loop;
end $$;
