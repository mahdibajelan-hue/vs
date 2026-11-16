-- perf 002 — from the Supabase performance advisor.
-- 1) foreign keys without a covering index (deletes of the parent and joins scan the child table)
create index if not exists ix_ds_decisions_version_id on ds_decisions (version_id);
create index if not exists ix_ex_photo_picks_photo_id on ex_photo_picks (photo_id);
create index if not exists ix_wq_defects_film_id on wq_defects (film_id);
-- 2) policies that called auth.uid() once per row: wrapped in a sub-select, it is evaluated once per query. Same rule.
alter policy mtl_project_roles_sel on mtl_project_roles using (is_admin_user() or rasta_user_can_access_master_project(project_id) or user_id = (select auth.uid()));
alter policy merged_select on ex_project_roles using (ex_can_view(project_id) or user_id = (select auth.uid()));
alter policy ex_photos_change on ex_photos using (by_user = (select auth.uid()) or ex_can_configure(project_id)) with check (by_user = (select auth.uid()) or ex_can_configure(project_id));
