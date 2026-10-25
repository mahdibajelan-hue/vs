-- رادار پروژه‌ها: ترتیب فهرست پروژه‌ها بر اساس آخرین بازشدن هر پروژه توسط هر کاربر (روی همهٔ دستگاه‌ها).
create table if not exists radar_project_visits (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id text not null,
  opened_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table radar_project_visits enable row level security;

drop policy if exists radar_visits_own_select on radar_project_visits;
create policy radar_visits_own_select on radar_project_visits for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists radar_visits_own_insert on radar_project_visits;
create policy radar_visits_own_insert on radar_project_visits for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists radar_visits_own_update on radar_project_visits;
create policy radar_visits_own_update on radar_project_visits for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
