-- Scheduling v2: in-app editing of draft versions (server-side copy), cost–time parameters, portfolio-level common risk drivers.
-- Editing itself uses the existing RLS (sch_can_edit) and the guard triggers: only DRAFT versions accept changes.

create table if not exists sch_cost_params (
  project_id uuid primary key,
  variable_share numeric not null default 0 check (variable_share between 0 and 1),
  indirect_per_day numeric not null default 0 check (indirect_per_day >= 0),
  target_finish date,
  target_cost numeric check (target_cost is null or target_cost >= 0),
  note text not null default '',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table sch_cost_params enable row level security;
create policy sch_cost_params_sel on sch_cost_params for select to authenticated using (ex_can_view(project_id));
create policy sch_cost_params_ins on sch_cost_params for insert to authenticated with check (sch_can_edit(project_id));
create policy sch_cost_params_upd on sch_cost_params for update to authenticated using (sch_can_edit(project_id)) with check (sch_can_edit(project_id));

-- risks that hit several projects at once (shared supplier, regulator, currency…); one random draw per iteration applies to every listed project
create table if not exists sch_portfolio_drivers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  probability numeric not null check (probability between 0 and 1),
  days_min numeric not null default 0, days_likely numeric not null default 0, days_max numeric not null default 0,
  cost_min numeric not null default 0, cost_likely numeric not null default 0, cost_max numeric not null default 0,
  project_ids uuid[] not null default '{}',
  active boolean not null default true,
  note text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (days_min <= days_likely and days_likely <= days_max and cost_min <= cost_likely and cost_likely <= cost_max),
  check (cardinality(project_ids) >= 2)
);
alter table sch_portfolio_drivers enable row level security;
create policy sch_pd_sel on sch_portfolio_drivers for select to authenticated using (coalesce((select bool_and(ex_can_view(p)) from unnest(project_ids) p), false));
create policy sch_pd_ins on sch_portfolio_drivers for insert to authenticated with check (coalesce((select bool_and(sch_can_edit(p)) from unnest(project_ids) p), false));
create policy sch_pd_upd on sch_portfolio_drivers for update to authenticated using (coalesce((select bool_and(sch_can_edit(p)) from unnest(project_ids) p), false)) with check (coalesce((select bool_and(sch_can_edit(p)) from unnest(project_ids) p), false));
create policy sch_pd_del on sch_portfolio_drivers for delete to authenticated using (coalesce((select bool_and(sch_can_edit(p)) from unnest(project_ids) p), false));

-- a new DRAFT copied from any version (calendars, activities with the SAME uids, relations): the starting point of every edit
create or replace function sch_copy_version(p_src uuid, p_label text, p_kind text default 'scenario') returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare s sch_versions; v uuid := gen_random_uuid();
begin
  select * into s from sch_versions where id = p_src;
  if s.id is null then raise exception 'not_found'; end if;
  if not sch_can_edit(s.project_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_kind not in ('initial','update','scenario') then raise exception 'bad_kind'; end if;
  insert into sch_versions (id, project_id, label, kind, source, data_date, project_start, project_finish, status, parent_version_id, summary, note)
    values (v, s.project_id, p_label, p_kind, 'copy', s.data_date, s.project_start, s.project_finish, 'draft', p_src, s.summary, 'کپی از «' || s.label || '»');
  insert into sch_calendars (project_id, version_id, code, name, work_days, hours_per_day, holidays, is_default, source_id)
    select project_id, v, code, name, work_days, hours_per_day, holidays, is_default, source_id from sch_calendars where version_id = p_src;
  insert into sch_activities (project_id, version_id, uid, code, source_id, name, wbs_code, wbs_path, activity_type, calendar_id, orig_duration, rem_duration, planned_start, planned_finish, actual_start, actual_finish, pct_complete, constraint_type, constraint_date, budget_cost, owner, sort)
    select a.project_id, v, a.uid, a.code, a.source_id, a.name, a.wbs_code, a.wbs_path, a.activity_type,
           (select c2.id from sch_calendars c1 join sch_calendars c2 on c2.version_id = v and c2.code = c1.code where c1.id = a.calendar_id limit 1),
           a.orig_duration, a.rem_duration, a.planned_start, a.planned_finish, a.actual_start, a.actual_finish, a.pct_complete, a.constraint_type, a.constraint_date, a.budget_cost, a.owner, a.sort
    from sch_activities a where a.version_id = p_src;
  insert into sch_relations (project_id, version_id, pred_id, succ_id, rel_type, lag_days)
    select r.project_id, v, dp.id, ds.id, r.rel_type, r.lag_days
    from sch_relations r join sch_activities sp on sp.id = r.pred_id join sch_activities ss on ss.id = r.succ_id
    join sch_activities dp on dp.version_id = v and dp.uid = sp.uid join sch_activities ds on ds.version_id = v and ds.uid = ss.uid
    where r.version_id = p_src;
  insert into sch_history (project_id, version_id, action, detail) values (s.project_id, v, 'copy', jsonb_build_object('label', p_label, 'from', s.label));
  return v;
end $f$;
revoke all on function sch_copy_version(uuid, text, text) from public;
grant execute on function sch_copy_version(uuid, text, text) to authenticated;
