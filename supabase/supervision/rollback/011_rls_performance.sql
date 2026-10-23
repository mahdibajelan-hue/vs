-- Rollback of 011: one FOR ALL write policy per table again (rebuilt from the update policy, which carries both the
-- USING and WITH CHECK of the original), and the uncached access checks. Indexes are kept (harmless).
do $$
declare r record;
begin
  for r in select tablename, qual, with_check from pg_policies where tablename like 'sv\_%' and policyname = tablename || '_upd' loop
    execute format('create policy %I on %I for all using (%s) with check (%s)', r.tablename || '_write', r.tablename, r.qual, r.with_check);
    execute format('drop policy if exists %I on %I', r.tablename || '_ins', r.tablename);
    execute format('drop policy if exists %I on %I', r.tablename || '_upd', r.tablename);
    execute format('drop policy if exists %I on %I', r.tablename || '_del', r.tablename);
  end loop;
end $$;

alter policy sv_meal_ratings_read on sv_meal_ratings using (sv_can_read(master_project_id) or user_id = auth.uid());
alter policy sv_self_punches_read on sv_self_punches using (sv_can_read(master_project_id) or user_id = auth.uid());

-- create or replace may change the language in place (policies depend on these, so they are not dropped)
create or replace function sv_can_read(p_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and rasta_user_can_access_master_project(p_project);
$$;
create or replace function sv_can_write(p_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (is_admin_user() or (rasta_user_can_access_master_project(p_project)
    and (rasta_has_permission(auth.uid(), 'supervision', 'edit') or rasta_has_permission(auth.uid(), 'supervision', 'create'))));
$$;
create or replace function sv_is_head(p_project uuid) returns boolean language sql stable security definer set search_path = public as $$
  select is_admin_user()
      or exists (select 1 from sv_people where master_project_id = p_project and is_head and active and user_id = auth.uid())
      or (not exists (select 1 from sv_people where master_project_id = p_project and is_head and active) and sv_can_write(p_project));
$$;
