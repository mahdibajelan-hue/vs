-- The project picker's EPC figure per project (applied 2026-11-10 as migration `perf_radar_epc_snapshots`).
-- One small read for every card instead of loading every project's execution/engineering/material data.
create table if not exists public.radar_epc_snapshots (
  master_project_id uuid primary key references public.master_projects(id) on delete cascade,
  epc jsonb not null,
  computed_at timestamptz not null default now(),
  computed_by uuid default auth.uid()
);
alter table public.radar_epc_snapshots enable row level security;
create policy radar_epc_snapshots_select on public.radar_epc_snapshots for select to authenticated
  using (public.rasta_user_can_access_master_project(master_project_id));
create policy radar_epc_snapshots_insert on public.radar_epc_snapshots for insert to authenticated
  with check (public.rasta_user_can_access_master_project(master_project_id));
create policy radar_epc_snapshots_update on public.radar_epc_snapshots for update to authenticated
  using (public.rasta_user_can_access_master_project(master_project_id))
  with check (public.rasta_user_can_access_master_project(master_project_id));
