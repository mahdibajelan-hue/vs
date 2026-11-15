-- weldqc 007
-- · films around the pipe: each film's number, where it starts on the circumference (mm from 12 o'clock, clockwise) and
--   how much of the weld it covers — the clock of an indication follows from the diameter and the distance on the film
-- · the repaired zone of each repair: only that zone is radiographed again
-- · approved welding procedures (WPS) with their PQRs, chosen per weld and per repair
-- · sign-offs of the weld passport (weld inspector, coating inspector, site head, supervision head)
alter table wq_films add column if not exists seq int;
alter table wq_films add column if not exists start_mm numeric;
alter table wq_films add column if not exists len_mm numeric;
alter table wq_films add column if not exists shot_at date;
alter table wq_joints add column if not exists film_count int;
alter table wq_joints add column if not exists wps_id uuid;
alter table wq_joints add column if not exists signs jsonb not null default '{}'::jsonb;
alter table wq_repairs add column if not exists clock_from numeric;
alter table wq_repairs add column if not exists clock_to numeric;
alter table wq_repairs add column if not exists repair_wps_id uuid;

create table if not exists wq_wps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references master_projects (id) on delete cascade,
  kind text not null default 'main' check (kind in ('main', 'repair', 'tie_in')),
  wps_no text not null,
  rev text not null default '',
  process text not null default '',
  filler text not null default '',
  positions text not null default '',
  direction text not null default '',
  material text not null default '',
  dia_min_in numeric, dia_max_in numeric, thk_min_mm numeric, thk_max_mm numeric,
  pqr_nos text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved', 'withdrawn')),
  approved_by text not null default '',
  approved_at date,
  note text not null default '',
  created_by uuid default auth.uid(), created_name text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create unique index if not exists wq_wps_no on wq_wps (project_id, wps_no, rev) where removed_at is null;
alter table wq_wps enable row level security;
create policy wq_wps_read on wq_wps for select to authenticated using (ex_can_view(project_id));
create policy wq_wps_add on wq_wps for insert to authenticated with check (wq_can(project_id, 'edit') or wq_can(project_id, 'configure'));
create policy wq_wps_change on wq_wps for update to authenticated using (wq_can(project_id, 'edit') or wq_can(project_id, 'configure')) with check (wq_can(project_id, 'edit') or wq_can(project_id, 'configure'));
revoke all on wq_wps from anon;

-- the WPS of a weld (also after the radiography file is closed: the passport is completed later)
create or replace function wq_set_wps(p_weld uuid, p_wps uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare j wq_joints;
begin
  j := wq_ensure_joint(p_weld);
  if not (wq_can(j.project_id, 'edit') or wq_can(j.project_id, 'submit')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_wps is not null and not exists (select 1 from wq_wps where id = p_wps and project_id = j.project_id and removed_at is null) then raise exception 'wps_not_found'; end if;
  update wq_joints set wps_id = p_wps, updated_at = now() where weld_id = p_weld;
end $f$;

-- the zone a repair covered (clock from … to, clockwise) and its repair WPS
create or replace function wq_repair_zone(p_weld uuid, p_round int, p_from numeric, p_to numeric, p_wps uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare pid uuid;
begin
  select project_id into pid from wq_repairs where weld_id = p_weld and round = p_round;
  if pid is null then raise exception 'no_repair'; end if;
  if not wq_can(pid, 'edit') then raise exception 'not_allowed' using errcode = '42501'; end if;
  update wq_repairs set clock_from = p_from, clock_to = p_to, repair_wps_id = p_wps where weld_id = p_weld and round = p_round;
end $f$;

-- a sign-off of the weld passport; signing again replaces the earlier one, p_name null withdraws it (QC manager)
create or replace function wq_passport_sign(p_weld uuid, p_role text, p_name text) returns void language plpgsql security definer set search_path to 'public' as $f$
declare j wq_joints;
begin
  j := wq_ensure_joint(p_weld);
  if p_role not in ('weld_inspector', 'coat_inspector', 'site_head', 'supervision_head') then raise exception 'invalid_role'; end if;
  if p_name is null then
    if not wq_can(j.project_id, 'configure') then raise exception 'not_allowed' using errcode = '42501'; end if;
    update wq_joints set signs = signs - p_role, updated_at = now() where weld_id = p_weld; return;
  end if;
  if not wq_can(j.project_id, case when p_role = 'supervision_head' then 'approve' else 'edit' end) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update wq_joints set signs = signs || jsonb_build_object(p_role, jsonb_build_object('name', p_name, 'at', now(), 'user', auth.uid())), updated_at = now() where weld_id = p_weld;
end $f$;
revoke all on function wq_set_wps(uuid, uuid) from public, anon;
revoke all on function wq_repair_zone(uuid, int, numeric, numeric, uuid) from public, anon;
revoke all on function wq_passport_sign(uuid, text, text) from public, anon;
grant execute on function wq_set_wps(uuid, uuid) to authenticated;
grant execute on function wq_repair_zone(uuid, int, numeric, numeric, uuid) to authenticated;
grant execute on function wq_passport_sign(uuid, text, text) to authenticated;
