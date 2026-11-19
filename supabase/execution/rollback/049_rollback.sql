-- Rollback of 049_scope.sql — run by hand only. Removes the scope columns (tags on rows are lost).
drop index if exists public.ex_reports_project_scope_idx;
alter table public.ex_reports    drop constraint if exists ex_reports_scope_chk;
alter table public.ex_activities drop constraint if exists ex_activities_scope_chk;
alter table public.ex_reports    drop column if exists scope;
alter table public.ex_activities drop column if exists scope;
