-- The people of a project are visible to the project's own members only.
-- Before: master_project_team (names, phones, national ids, working hours) and rasta_project_role_assignments (who holds
-- which role where) were readable by every signed-in user. After: by admins and by members of that project; a person
-- always sees their own role rows. Writes stay admin-only (unchanged).
alter policy master_project_team_select on master_project_team using (rasta_user_can_access_master_project(project_id));
alter policy rasta_project_role_assignments_select_authenticated on rasta_project_role_assignments using (user_id = auth.uid() or rasta_user_can_access_master_project(project_id));
