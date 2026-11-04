-- Project membership, in one place.
-- Before: a person's «سمت در پروژه» (rasta_project_role_assignments) and their place in the project team
-- (master_project_team) did not give access to the project's data — only an access scope or a membership in one of the
-- three legacy products did — and the project list itself (master_projects) was readable by every signed-in user.
-- After:
--   • being a member of a project = an access scope covering it, OR a project role in it, OR a place in its team with the
--     person's account linked, OR (as before) a membership in a mapped PipePulse / Risk / Issues project;
--   • every module that checks rasta_user_can_access_master_project (land acquisition, supervision, finance, PSSR,
--     testing, stakeholders, change management…) follows the same rule — the risk module already counted project roles;
--   • a person sees in the project list only the projects they are a member of (admins see all).
create or replace function public.rasta_user_can_access_master_project(p_master_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select is_admin_user()
    or rasta_project_scope_ok(auth.uid(), p_master_project_id)
    or exists (select 1 from rasta_project_role_assignments a where a.project_id = p_master_project_id and a.user_id = auth.uid())
    or exists (select 1 from master_project_team t where t.project_id = p_master_project_id and t.user_id = auth.uid())
    or exists (
      select 1 from rasta_project_mappings m
      where m.master_project_id = p_master_project_id and m.status = 'confirmed'
        and ((m.source_module = 'risk' and rm_is_project_member(m.source_project_id))
          or (m.source_module = 'issues' and im_is_project_member(m.source_project_id))
          or (m.source_module = 'pipepulse' and is_project_member(m.source_project_id)))
    );
$function$;

alter policy master_projects_select_authenticated on master_projects using (rasta_user_can_access_master_project(id));
