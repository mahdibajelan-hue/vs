-- 050 — compressor-station execution registers (phase 2 of the project-profile work).
-- Piping lines, spools (shop fabrication → erection), shop/field welds measured in inch-dia, equipment installation steps
-- and test packs. Everything belongs to a master project and is read/written under the execution module's own rules:
--   read   ex_can_view(project)
--   write  ex_allows(project,'record') (contractor), 'review' (supervision / QC) or ex_can_configure(project)
-- Integrity on the server, not only in the screen:
--   * an NDT result (accept / reject) is set only by a reviewer; the contractor may only send a rejected weld back to
--     «pending» while recording its repair (repair_count + 1);
--   * a weld date cannot precede its fit-up; a result needs a weld date;
--   * a test pack can be marked «tested» only by a reviewer, with a test date, no open punch-A item, and every weld on its
--     lines welded and (where the line's NDT extent is 100%) accepted;
--   * rows are archived, never deleted (no delete policy); every change is written to cs_history.
-- Additive only. Rollback: rollback/050_rollback.sql (run by hand).

create table if not exists public.cs_test_packs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.master_projects(id),
  pack_no text not null,
  system text not null default '',
  medium text not null default 'hydro' check (medium in ('hydro', 'pneumatic', 'service')),
  test_press_bar numeric check (test_press_bar is null or test_press_bar > 0),
  status text not null default 'open' check (status in ('open', 'ready', 'tested', 'reinstated')),
  punch_a int not null default 0 check (punch_a >= 0),
  punch_b int not null default 0 check (punch_b >= 0),
  test_date date, reinstated_date date,
  note text not null default '',
  archived boolean not null default false,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now(),
  unique (project_id, pack_no),
  check (status <> 'tested' or test_date is not null),
  check (status <> 'reinstated' or (test_date is not null and reinstated_date is not null))
);

create table if not exists public.cs_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.master_projects(id),
  line_no text not null,
  service text not null default '',
  size_in numeric not null check (size_in > 0),
  spec_class text not null default '',
  material text not null default '',
  area text not null default '',
  iso_no text not null default '',
  design_press_bar numeric,
  ndt_pct numeric not null default 100 check (ndt_pct between 0 and 100),
  test_pack_id uuid references public.cs_test_packs(id),
  note text not null default '',
  archived boolean not null default false,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now(),
  unique (project_id, line_no)
);

create table if not exists public.cs_spools (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.master_projects(id),
  line_id uuid not null references public.cs_lines(id),
  spool_no text not null,
  iso_no text not null default '',
  size_in numeric check (size_in is null or size_in > 0),
  weight_kg numeric check (weight_kg is null or weight_kg >= 0),
  area text not null default '',
  stage text not null default 'planned' check (stage in ('planned', 'cut', 'fitup', 'welded', 'ndt', 'painted', 'dispatched', 'erected')),
  stage_dates jsonb not null default '{}'::jsonb,
  note text not null default '',
  archived boolean not null default false,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now(),
  unique (project_id, spool_no)
);

create table if not exists public.cs_welds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.master_projects(id),
  line_id uuid not null references public.cs_lines(id),
  spool_id uuid references public.cs_spools(id),
  weld_no text not null,
  location text not null default 'shop' check (location in ('shop', 'field')),
  joint_type text not null default 'BW' check (joint_type in ('BW', 'SW', 'FW', 'BR')),
  size_in numeric not null check (size_in > 0),
  thk_mm numeric check (thk_mm is null or thk_mm > 0),
  material text not null default '',
  wps text not null default '',
  welder text not null default '',
  fitup_date date, weld_date date,
  ndt_method text not null default '',
  ndt_result text not null default 'pending' check (ndt_result in ('pending', 'accept', 'reject')),
  ndt_date date, ndt_report text not null default '',
  repair_count int not null default 0 check (repair_count >= 0),
  note text not null default '',
  archived boolean not null default false,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now(),
  unique (project_id, line_id, weld_no),
  check (weld_date is null or fitup_date is null or weld_date >= fitup_date),
  check (ndt_result = 'pending' or weld_date is not null)
);

create table if not exists public.cs_equipment (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.master_projects(id),
  tag text not null,
  title text not null default '',
  kind text not null default 'other',
  area text not null default '',
  weight_t numeric check (weight_t is null or weight_t >= 0),
  steps jsonb not null default '{}'::jsonb,
  note text not null default '',
  archived boolean not null default false,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  updated_by uuid, updated_at timestamptz not null default now(),
  unique (project_id, tag)
);

create table if not exists public.cs_history (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  entity text not null,
  row_id uuid not null,
  action text not null,
  changes jsonb not null default '{}'::jsonb,
  by uuid default auth.uid(),
  at timestamptz not null default now()
);

create index if not exists cs_lines_project_idx on public.cs_lines (project_id);
create index if not exists cs_spools_line_idx on public.cs_spools (line_id);
create index if not exists cs_spools_project_idx on public.cs_spools (project_id);
create index if not exists cs_welds_line_idx on public.cs_welds (line_id);
create index if not exists cs_welds_project_idx on public.cs_welds (project_id);
create index if not exists cs_welds_spool_idx on public.cs_welds (spool_id);
create index if not exists cs_lines_pack_idx on public.cs_lines (test_pack_id);
create index if not exists cs_equipment_project_idx on public.cs_equipment (project_id);
create index if not exists cs_test_packs_project_idx on public.cs_test_packs (project_id);
create index if not exists cs_history_row_idx on public.cs_history (row_id, at desc);
create index if not exists cs_history_project_idx on public.cs_history (project_id, at desc);

-- who may write: the contractor recording, the supervision reviewing, or the project's configurator
create or replace function public.cs_can_write(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select ex_allows(p_project, 'record') or ex_allows(p_project, 'review') or ex_can_configure(p_project)
$$;
create or replace function public.cs_can_review(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select ex_allows(p_project, 'review') or ex_can_configure(p_project)
$$;
revoke all on function public.cs_can_write(uuid) from public, anon;
revoke all on function public.cs_can_review(uuid) from public, anon;
grant execute on function public.cs_can_write(uuid) to authenticated;
grant execute on function public.cs_can_review(uuid) to authenticated;

-- stamp, guard and record every change
create or replace function public.cs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ch jsonb := '{}'::jsonb; k text; o jsonb; n jsonb; bad int;
begin
  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id then raise exception 'project_locked' using errcode = 'P0001'; end if;
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();

  if tg_table_name = 'cs_welds' and auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.ndt_result <> 'pending' and not cs_can_review(new.project_id) then raise exception 'ndt_reviewer_only' using errcode = 'P0001'; end if;
    else
      if new.ndt_result is distinct from old.ndt_result and not cs_can_review(new.project_id) then
        -- the contractor may only send a rejected weld back for re-test while recording its repair
        if not (old.ndt_result = 'reject' and new.ndt_result = 'pending' and new.repair_count = old.repair_count + 1) then
          raise exception 'ndt_reviewer_only' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  -- nested ifs: a record field may only be read on the table that has it
  if tg_table_name = 'cs_test_packs' and tg_op = 'UPDATE' then
  if new.status is distinct from old.status and new.status in ('tested', 'reinstated') then
    if auth.uid() is not null and not cs_can_review(new.project_id) then raise exception 'pack_reviewer_only' using errcode = 'P0001'; end if;
    if new.status = 'tested' then
      if new.punch_a > 0 then raise exception 'pack_punch_open' using errcode = 'P0001'; end if;
      select count(*) into bad from cs_welds w join cs_lines l on l.id = w.line_id
       where l.test_pack_id = new.id and not w.archived and not l.archived
         and (w.weld_date is null or w.ndt_result = 'reject' or (l.ndt_pct >= 100 and w.ndt_result <> 'accept'));
      if bad > 0 then raise exception 'pack_not_ready' using errcode = 'P0001', detail = bad::text; end if;
    end if;
  end if;
  end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(to_jsonb(new)) loop
      if k in ('updated_at', 'updated_by') then continue; end if;
      o := to_jsonb(old) -> k; n := to_jsonb(new) -> k;
      if o is distinct from n then ch := ch || jsonb_build_object(k, jsonb_build_array(o, n)); end if;
    end loop;
    if ch <> '{}'::jsonb then insert into cs_history (project_id, entity, row_id, action, changes) values (new.project_id, tg_table_name, new.id, 'update', ch); end if;
  else
    insert into cs_history (project_id, entity, row_id, action, changes) values (new.project_id, tg_table_name, new.id, 'insert', '{}'::jsonb);
  end if;
  return new;
end $$;
revoke all on function public.cs_guard() from public, anon, authenticated;

create or replace trigger trg_cs_guard before insert or update on public.cs_test_packs for each row execute function public.cs_guard();
create or replace trigger trg_cs_guard before insert or update on public.cs_lines      for each row execute function public.cs_guard();
create or replace trigger trg_cs_guard before insert or update on public.cs_spools     for each row execute function public.cs_guard();
create or replace trigger trg_cs_guard before insert or update on public.cs_welds      for each row execute function public.cs_guard();
create or replace trigger trg_cs_guard before insert or update on public.cs_equipment  for each row execute function public.cs_guard();

-- a child row must stay in its parent's project
create or replace function public.cs_same_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- nested ifs: a record field may only be read on the table that has it
  if tg_table_name in ('cs_spools', 'cs_welds') then
    if not exists (select 1 from cs_lines where id = new.line_id and project_id = new.project_id) then
      raise exception 'cross_project' using errcode = 'P0001';
    end if;
  end if;
  if tg_table_name = 'cs_welds' then
    if new.spool_id is not null and not exists (select 1 from cs_spools where id = new.spool_id and line_id = new.line_id) then
      raise exception 'spool_not_on_line' using errcode = 'P0001';
    end if;
  end if;
  if tg_table_name = 'cs_lines' then
    if new.test_pack_id is not null and not exists (select 1 from cs_test_packs where id = new.test_pack_id and project_id = new.project_id) then
      raise exception 'cross_project' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.cs_same_project() from public, anon, authenticated;
create or replace trigger trg_cs_same_project before insert or update on public.cs_lines  for each row execute function public.cs_same_project();
create or replace trigger trg_cs_same_project before insert or update on public.cs_spools for each row execute function public.cs_same_project();
create or replace trigger trg_cs_same_project before insert or update on public.cs_welds  for each row execute function public.cs_same_project();

alter table public.cs_test_packs enable row level security;
alter table public.cs_lines      enable row level security;
alter table public.cs_spools     enable row level security;
alter table public.cs_welds      enable row level security;
alter table public.cs_equipment  enable row level security;
alter table public.cs_history    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cs_test_packs', 'cs_lines', 'cs_spools', 'cs_welds', 'cs_equipment'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_sel') then
      execute format('create policy %I on public.%I for select to authenticated using (ex_can_view(project_id))', t || '_sel', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (cs_can_write(project_id))', t || '_ins', t);
      execute format('create policy %I on public.%I for update to authenticated using (cs_can_write(project_id)) with check (cs_can_write(project_id))', t || '_upd', t);
    end if;
  end loop;
  if not exists (select 1 from pg_policies where tablename = 'cs_history' and policyname = 'cs_history_sel') then
    create policy cs_history_sel on public.cs_history for select to authenticated using (ex_can_view(project_id));
  end if;
end $$;

revoke all on public.cs_test_packs, public.cs_lines, public.cs_spools, public.cs_welds, public.cs_equipment, public.cs_history from anon;
grant select, insert, update on public.cs_test_packs, public.cs_lines, public.cs_spools, public.cs_welds, public.cs_equipment to authenticated;
grant select on public.cs_history to authenticated;
