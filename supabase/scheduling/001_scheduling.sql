-- «برنامه‌ریزی و کنترل زمان پروژه» (Project Scheduling & Time Control).
-- Reuses the execution project roles for access (ex_can_view for reading; ex_allows(..,'edit_baseline') for editing; ex_allows(..,'approve_baseline') for approving a baseline) — no parallel permission model.
-- A schedule is a VERSION (initial / baseline / update / scenario). Every activity has a stable identity (uid) shared by all versions, so the same activity can be compared across versions and
-- linked once (sch_links) to execution activities, engineering documents, material packages, risks and issues — links survive new versions.
-- The approved baseline and any approved version are immutable (guard triggers); the current schedule and forecasts never overwrite it.

create table if not exists sch_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  label text not null,
  kind text not null default 'update' check (kind in ('initial','baseline','update','scenario')),
  source text not null default 'excel' check (source in ('excel','p6_xml','p6_xer','manual','copy')),
  file_name text not null default '',
  file_hash text not null default '',
  data_date date,
  project_start date,
  project_finish date,
  status text not null default 'draft' check (status in ('draft','approved','superseded')),
  is_baseline boolean not null default false,
  is_current boolean not null default false,
  parent_version_id uuid references sch_versions(id) on delete set null,
  approved_by uuid,
  approved_at timestamptz,
  mapping jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, label)
);
create unique index if not exists sch_versions_one_baseline on sch_versions (project_id) where is_baseline;
create unique index if not exists sch_versions_one_current on sch_versions (project_id) where is_current;

create table if not exists sch_calendars (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  version_id uuid not null references sch_versions(id) on delete cascade,
  code text not null default '',
  name text not null default '',
  -- 0 = Saturday … 6 = Friday (same convention as the execution settings)
  work_days int[] not null default '{0,1,2,3,4}',
  hours_per_day numeric not null default 8 check (hours_per_day > 0),
  holidays date[] not null default '{}',
  is_default boolean not null default false,
  source_id text not null default ''
);
create index if not exists sch_calendars_version on sch_calendars (version_id);

create table if not exists sch_activities (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  version_id uuid not null references sch_versions(id) on delete cascade,
  uid uuid not null default gen_random_uuid(),
  code text not null,
  source_id text not null default '',
  name text not null default '',
  wbs_code text not null default '',
  wbs_path text not null default '',
  activity_type text not null default 'task' check (activity_type in ('task','milestone','summary','loe')),
  calendar_id uuid references sch_calendars(id) on delete set null,
  orig_duration numeric not null default 0 check (orig_duration >= 0),
  rem_duration numeric check (rem_duration is null or rem_duration >= 0),
  planned_start date,
  planned_finish date,
  actual_start date,
  actual_finish date,
  pct_complete numeric check (pct_complete is null or (pct_complete between 0 and 100)),
  constraint_type text not null default '',
  constraint_date date,
  budget_cost numeric not null default 0 check (budget_cost >= 0),
  owner text not null default '',
  sort int not null default 0,
  extra jsonb not null default '{}'::jsonb,
  unique (version_id, code)
);
create index if not exists sch_activities_version on sch_activities (version_id);
create index if not exists sch_activities_uid on sch_activities (project_id, uid);

create table if not exists sch_relations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  version_id uuid not null references sch_versions(id) on delete cascade,
  pred_id uuid not null references sch_activities(id) on delete cascade,
  succ_id uuid not null references sch_activities(id) on delete cascade,
  rel_type text not null default 'FS' check (rel_type in ('FS','SS','FF','SF')),
  lag_days numeric not null default 0,
  unique (version_id, pred_id, succ_id, rel_type),
  check (pred_id <> succ_id)
);
create index if not exists sch_relations_version on sch_relations (version_id);

-- many-to-many links of a schedule activity (by its stable uid) to the other modules' records
create table if not exists sch_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  activity_uid uuid not null,
  target_type text not null check (target_type in ('exec_activity','eng_doc','mtl_package','risk','issue')),
  target_id uuid not null,
  need_kind text not null default 'start' check (need_kind in ('start','continue','finish')),
  need_date date,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (activity_uid, target_type, target_id)
);
create index if not exists sch_links_project on sch_links (project_id, activity_uid);

create table if not exists sch_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  version_id uuid references sch_versions(id) on delete set null,
  file_name text not null default '',
  file_hash text not null default '',
  format text not null default 'excel',
  row_count int not null default 0,
  ok_count int not null default 0,
  warn_count int not null default 0,
  error_count int not null default 0,
  mapping jsonb not null default '{}'::jsonb,
  issues jsonb not null default '[]'::jsonb,
  imported_by uuid default auth.uid(),
  imported_at timestamptz not null default now()
);

-- quantitative analysis inputs (the simulation engine is in the app; nothing here is generated)
create table if not exists sch_duration_risk (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  activity_uid uuid not null,
  min_dur numeric not null check (min_dur >= 0),
  likely_dur numeric not null check (likely_dur >= 0),
  max_dur numeric not null check (max_dur >= 0),
  note text not null default '',
  unique (project_id, activity_uid),
  check (min_dur <= likely_dur and likely_dur <= max_dur)
);
create table if not exists sch_risk_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  title text not null,
  risk_id uuid,
  probability numeric not null check (probability between 0 and 1),
  days_min numeric not null default 0, days_likely numeric not null default 0, days_max numeric not null default 0,
  cost_min numeric not null default 0, cost_likely numeric not null default 0, cost_max numeric not null default 0,
  activity_uids uuid[] not null default '{}',
  active boolean not null default true,
  note text not null default '',
  created_by uuid default auth.uid(),
  check (days_min <= days_likely and days_likely <= days_max and cost_min <= cost_likely and cost_likely <= cost_max)
);
create table if not exists sch_simulations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  version_id uuid references sch_versions(id) on delete set null,
  seed int not null,
  iterations int not null,
  params jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists sch_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  version_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid(),
  at timestamptz not null default now()
);

-- ── access
create or replace function sch_can_edit(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select ex_allows(p_project, 'edit_baseline') or ex_can_configure(p_project)
$f$;
create or replace function sch_can_approve(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select ex_allows(p_project, 'approve_baseline') or ex_can_configure(p_project)
$f$;
revoke all on function sch_can_edit(uuid) from public; grant execute on function sch_can_edit(uuid) to authenticated;
revoke all on function sch_can_approve(uuid) from public; grant execute on function sch_can_approve(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['sch_versions','sch_calendars','sch_activities','sch_relations','sch_links','sch_imports','sch_duration_risk','sch_risk_events','sch_simulations','sch_history'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (ex_can_view(project_id))', t || '_sel', t);
  end loop;
  foreach t in array array['sch_versions','sch_calendars','sch_activities','sch_relations','sch_links','sch_imports','sch_duration_risk','sch_risk_events','sch_simulations'] loop
    execute format('create policy %I on %I for insert to authenticated with check (sch_can_edit(project_id))', t || '_ins', t);
    execute format('create policy %I on %I for update to authenticated using (sch_can_edit(project_id)) with check (sch_can_edit(project_id))', t || '_upd', t);
  end loop;
  -- deletes: draft data only (the guard triggers below block approved versions and the baseline); links and risk inputs are editable lists
  foreach t in array array['sch_versions','sch_calendars','sch_activities','sch_relations','sch_links','sch_duration_risk','sch_risk_events'] loop
    execute format('create policy %I on %I for delete to authenticated using (sch_can_edit(project_id))', t || '_del', t);
  end loop;
end $$;

-- ── immutability: an approved version / the baseline cannot be changed or deleted (a new version is created instead)
create or replace function sch_version_guard() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare via_rpc boolean := coalesce(current_setting('sch.rpc', true), '') = '1';
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or old.is_baseline then raise exception 'version_locked'; end if;
    return old;
  end if;
  if (new.is_baseline is distinct from old.is_baseline or new.is_current is distinct from old.is_current or new.status is distinct from old.status or new.approved_by is distinct from old.approved_by) and not via_rpc then
    raise exception 'use_rpc';
  end if;
  if old.status <> 'draft' and (new.label is distinct from old.label or new.data_date is distinct from old.data_date or new.kind is distinct from old.kind or new.source is distinct from old.source) then
    raise exception 'version_locked';
  end if;
  return new;
end $f$;
create or replace trigger trg_sch_version_guard before update or delete on sch_versions for each row execute function sch_version_guard();

create or replace function sch_child_guard() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v uuid := case when tg_op = 'DELETE' then old.version_id else new.version_id end; s text; b boolean;
begin
  select status, is_baseline into s, b from sch_versions where id = v;
  -- cascade deletes of a draft version arrive here after the version row is already gone
  if s is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if s <> 'draft' or b then raise exception 'version_locked'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $f$;
do $$
declare t text;
begin
  foreach t in array array['sch_calendars','sch_activities','sch_relations'] loop
    execute format('create or replace trigger trg_%s_guard before insert or update or delete on %I for each row execute function sch_child_guard()', t, t);
  end loop;
end $$;

-- ── lifecycle RPCs
create or replace function sch_approve(p_version uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare v sch_versions;
begin
  select * into v from sch_versions where id = p_version;
  if v.id is null then raise exception 'not_found'; end if;
  if not sch_can_approve(v.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v.status <> 'draft' then raise exception 'already_approved'; end if;
  if not exists (select 1 from sch_activities where version_id = p_version) then raise exception 'empty_version'; end if;
  perform set_config('sch.rpc', '1', true);
  update sch_versions set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_version;
  insert into sch_history (project_id, version_id, action, detail) values (v.project_id, p_version, 'approve', jsonb_build_object('label', v.label));
end $f$;

-- the approved baseline: one per project; the previous baseline stays as an approved (superseded-as-baseline) version for comparison
create or replace function sch_set_baseline(p_version uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare v sch_versions;
begin
  select * into v from sch_versions where id = p_version;
  if v.id is null then raise exception 'not_found'; end if;
  if not sch_can_approve(v.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v.status <> 'approved' then raise exception 'approve_first'; end if;
  perform set_config('sch.rpc', '1', true);
  update sch_versions set is_baseline = false where project_id = v.project_id and is_baseline and id <> p_version;
  update sch_versions set is_baseline = true, kind = kind where id = p_version;
  insert into sch_history (project_id, version_id, action, detail) values (v.project_id, p_version, 'set_baseline', jsonb_build_object('label', v.label));
end $f$;

-- the current schedule = the latest accepted update used for control; it never replaces the baseline
create or replace function sch_set_current(p_version uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare v sch_versions;
begin
  select * into v from sch_versions where id = p_version;
  if v.id is null then raise exception 'not_found'; end if;
  if not sch_can_edit(v.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform set_config('sch.rpc', '1', true);
  update sch_versions set is_current = false where project_id = v.project_id and is_current and id <> p_version;
  update sch_versions set is_current = true where id = p_version;
  insert into sch_history (project_id, version_id, action, detail) values (v.project_id, p_version, 'set_current', jsonb_build_object('label', v.label));
end $f$;

create or replace function sch_log(p_project uuid, p_version uuid, p_action text, p_detail jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not sch_can_edit(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into sch_history (project_id, version_id, action, detail) values (p_project, p_version, p_action, coalesce(p_detail, '{}'::jsonb));
end $f$;
do $$
declare f text;
begin
  foreach f in array array['sch_approve(uuid)','sch_set_baseline(uuid)','sch_set_current(uuid)','sch_log(uuid,uuid,text,jsonb)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- module registry (the hub shows a module only if it is listed here)
insert into rasta_modules (key, label_fa, is_active) values ('scheduling', 'برنامه‌ریزی و کنترل زمان پروژه', true) on conflict (key) do nothing;
