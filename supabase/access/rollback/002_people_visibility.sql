-- rollback of access/002 (run by hand only)
alter policy master_project_team_select on master_project_team using (auth.uid() is not null);
alter policy rasta_project_role_assignments_select_authenticated on rasta_project_role_assignments using (auth.uid() is not null);
