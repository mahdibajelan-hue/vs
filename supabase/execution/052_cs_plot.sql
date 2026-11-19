-- 052 — compressor-station digital twin: the plot plan (phase 4 of the project-profile work).
-- cs_plot_shapes holds the drawn layout of a station in site metres: the site boundary, the areas (units), each equipment
-- footprint and each line route. A shape points to the register row it shows (cs_equipment / cs_lines) or names an area;
-- the twin colours it from the registers, so nothing about progress is stored here. Written by anyone who may write the
-- station registers; archived, never deleted; every change goes to cs_history (cs_guard).
-- Additive only. Rollback: rollback/052_rollback.sql (run by hand).

create table if not exists public.cs_plot_shapes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.master_projects(id),
  kind text not null check (kind in ('site', 'area', 'equipment', 'line', 'label')),
  ref_id uuid,
  area_name text not null default '',
  label text not null default '',
  x numeric not null default 0, y numeric not null default 0,
  w numeric not null default 0 check (w >= 0), h numeric not null default 0 check (h >= 0),
  rot numeric not null default 0,
  points jsonb not null default '[]'::jsonb,
  z int not null default 0,
  note text not null default '',
  archived boolean not null default false,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now(),
  check (kind not in ('equipment', 'line') or ref_id is not null),
  check (jsonb_typeof(points) = 'array')
);
create index if not exists cs_plot_shapes_project_idx on public.cs_plot_shapes (project_id);
create unique index if not exists cs_plot_shapes_ref_uniq on public.cs_plot_shapes (project_id, kind, ref_id) where ref_id is not null and not archived;

-- the shape's register row must belong to the same project
create or replace function public.cs_plot_ref() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'equipment' and not exists (select 1 from cs_equipment where id = new.ref_id and project_id = new.project_id) then raise exception 'cross_project' using errcode = 'P0001'; end if;
  if new.kind = 'line' and not exists (select 1 from cs_lines where id = new.ref_id and project_id = new.project_id) then raise exception 'cross_project' using errcode = 'P0001'; end if;
  return new;
end $$;
revoke all on function public.cs_plot_ref() from public, anon, authenticated;
create or replace trigger trg_cs_plot_ref before insert or update on public.cs_plot_shapes for each row execute function public.cs_plot_ref();
create or replace trigger trg_cs_guard before insert or update on public.cs_plot_shapes for each row execute function public.cs_guard();

alter table public.cs_plot_shapes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cs_plot_shapes' and policyname = 'cs_plot_shapes_sel') then
    create policy cs_plot_shapes_sel on public.cs_plot_shapes for select to authenticated using (ex_can_view(project_id));
    create policy cs_plot_shapes_ins on public.cs_plot_shapes for insert to authenticated with check (cs_can_write(project_id));
    create policy cs_plot_shapes_upd on public.cs_plot_shapes for update to authenticated using (cs_can_write(project_id)) with check (cs_can_write(project_id));
  end if;
end $$;
revoke all on public.cs_plot_shapes from anon;
grant select, insert, update on public.cs_plot_shapes to authenticated;
