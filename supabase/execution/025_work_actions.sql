-- Field staff report by ACTION (welding, radiography, trench excavation …) with the action's own fields; the statement later maps actions to the nearest price-book item(s) with a factor.
-- Both tables are new and empty. Rollback: rollback/025_work_actions.sql (R-C while empty).
create table if not exists ex_work_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  key text not null,
  title text not null,
  unit text not null default '',
  group_label text not null default '',
  fields jsonb not null default '[]'::jsonb,   -- [{key,label,kind:'text'|'num'|'select',options?:[..]}]
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);
alter table ex_work_actions enable row level security;
create policy ex_work_actions_sel on ex_work_actions for select to authenticated using (true);
create policy ex_work_actions_w on ex_work_actions for all to authenticated using (ex_can_configure(project_id) or ex_allows(project_id, 'edit_activities')) with check (ex_can_configure(project_id) or ex_allows(project_id, 'edit_activities'));
create table if not exists ex_action_map (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  action_key text not null,
  activity_id uuid not null references ex_activities(id) on delete cascade,
  factor numeric not null default 1 check (factor > 0),
  when_field text not null default '',   -- optional condition on one of the action's fields (e.g. soil type) — empty = the default rule
  when_value text not null default '',
  note text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create unique index if not exists ex_action_map_uq on ex_action_map (project_id, action_key, activity_id, when_field, when_value);
create index if not exists ex_action_map_proj on ex_action_map (project_id, action_key);
alter table ex_action_map enable row level security;
create policy ex_action_map_sel on ex_action_map for select to authenticated using (true);
create policy ex_action_map_w on ex_action_map for all to authenticated using (ex_can_configure(project_id) or ex_allows(project_id, 'edit_activities')) with check (ex_can_configure(project_id) or ex_allows(project_id, 'edit_activities'));

-- 025b: an action can be informational (billable = false: no price-book row, e.g. fit-up or bending that are inside the welding row)
-- and a rule can multiply the quantity by numeric fields of the action (length × width × depth → m³).
alter table ex_action_map add column if not exists mult_fields text not null default '';
alter table ex_work_actions add column if not exists billable boolean not null default true;
