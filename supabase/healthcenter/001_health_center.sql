-- Project Health Center: the engine's settings and its daily snapshots. Indicators are computed in the browser from what
-- the other modules already store (nothing is re-entered); only the result is kept here so a past date and the cause of a
-- change can be looked at later. Rollback: 001_health_center_down.sql.

-- settings: one global row (master_project_id null) and an optional override per project; anyone may read, admins write
create table if not exists public.ph_settings (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid references public.master_projects(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ph_settings_scope_uq on public.ph_settings (coalesce(master_project_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table public.ph_settings enable row level security;
create policy ph_settings_read on public.ph_settings for select to authenticated
  using (master_project_id is null or rasta_user_can_access_master_project(master_project_id));
create policy ph_settings_insert on public.ph_settings for insert to authenticated with check (coalesce(is_admin_user(), false));
create policy ph_settings_update on public.ph_settings for update to authenticated using (coalesce(is_admin_user(), false)) with check (coalesce(is_admin_user(), false));

-- snapshots: one per project per day, upserted whenever the health of the project is computed
create table if not exists public.ph_snapshots (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references public.master_projects(id) on delete cascade,
  snap_date date not null,
  health_index numeric not null,
  raw_index numeric,
  status text not null,
  coverage numeric,
  domains jsonb not null default '[]'::jsonb,
  indicators jsonb not null default '{}'::jsonb,
  caps jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (master_project_id, snap_date)
);
create index if not exists ph_snapshots_project_date on public.ph_snapshots (master_project_id, snap_date desc);
alter table public.ph_snapshots enable row level security;
create policy ph_snapshots_read on public.ph_snapshots for select to authenticated using (rasta_user_can_access_master_project(master_project_id));
create policy ph_snapshots_insert on public.ph_snapshots for insert to authenticated with check (rasta_user_can_access_master_project(master_project_id));
create policy ph_snapshots_update on public.ph_snapshots for update to authenticated using (rasta_user_can_access_master_project(master_project_id)) with check (rasta_user_can_access_master_project(master_project_id));

-- the module's own counts that the reporting facts do not carry: open punch A and unaccepted failed pressure tests
create or replace function public.ph_extra_counts(p uuid)
returns table(punch_a integer, ht_failed integer, has_pssr boolean, has_ht boolean)
language sql stable security definer set search_path to 'public'
as $$
  select
    (select count(*)::int from pssr_punches x join pssr_systems s on s.id = x.system_id where s.master_project_id = p and x.category = 'A' and x.status = 'open'),
    (select count(*)::int from ht_sections where master_project_id = p and failed) + (select count(*)::int from ht_packs where master_project_id = p and failed),
    exists (select 1 from pssr_systems where master_project_id = p),
    exists (select 1 from ht_sections where master_project_id = p) or exists (select 1 from ht_packs where master_project_id = p)
  where rasta_user_can_access_master_project(p)
$$;
grant execute on function public.ph_extra_counts(uuid) to authenticated;
grant select, insert, update on public.ph_settings, public.ph_snapshots to authenticated;
