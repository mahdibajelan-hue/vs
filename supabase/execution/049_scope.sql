-- 049 — execution scope (pipeline | compressor station) on activities and daily reports.
-- A project's type (master_projects.project_type) picks its profile: 'pipeline', 'compressor_station' or 'hybrid'.
-- In a hybrid project each price-list activity and each daily report belongs to one scope, so progress can be shown per scope
-- and for the whole project. NULL = the project's main scope (rows written before this migration keep their meaning).
-- Additive only: two nullable columns, a check and an index. Rollback: rollback/049_rollback.sql (run by hand).

alter table public.ex_activities add column if not exists scope text;
alter table public.ex_reports    add column if not exists scope text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ex_activities_scope_chk') then
    alter table public.ex_activities add constraint ex_activities_scope_chk check (scope is null or scope in ('pipeline', 'station'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ex_reports_scope_chk') then
    alter table public.ex_reports add constraint ex_reports_scope_chk check (scope is null or scope in ('pipeline', 'station'));
  end if;
end $$;

create index if not exists ex_reports_project_scope_idx on public.ex_reports (project_id, scope);

-- master_projects.project_type stays free text for the other modules; the app writes one of the three codes from now on.
comment on column public.ex_activities.scope is 'pipeline | station; NULL = the project''s main scope';
comment on column public.ex_reports.scope    is 'pipeline | station; NULL = the project''s main scope';
