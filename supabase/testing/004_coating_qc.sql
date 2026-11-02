-- Coating inspection by the procedure: one row per field-joint QC record (surface preparation, conditions, thickness,
-- holiday, adhesion) and per electrical (current-density I/S) test of a stretch of buried line, with its potential table
-- (forms 6-1-6 and 6-2). The figures live in `data`; the verdict is computed by the module and stored in `result`.
create table if not exists ct_tests (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects (id) on delete cascade,
  kind text not null check (kind in ('joint', 'electrical')),
  ref text not null default '',
  km_from numeric,
  km_to numeric,
  at date,
  data jsonb not null default '{}'::jsonb,
  result text not null default 'pending' check (result in ('pending', 'pass', 'fail')),
  by_user text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ct_tests_project on ct_tests (master_project_id, kind);
alter table ct_tests enable row level security;
create policy ct_tests_sel on ct_tests for select to authenticated using (auth.uid() is not null);
create policy ct_tests_ins on ct_tests for insert to authenticated with check (auth.uid() is not null);
create policy ct_tests_upd on ct_tests for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
