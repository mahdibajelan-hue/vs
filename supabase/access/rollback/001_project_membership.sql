-- rollback of access/001 (run by hand only)
create or replace function public.rasta_user_can_access_master_project(p_master_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select is_admin_user() or rasta_project_scope_ok(auth.uid(), p_master_project_id) or exists (
    select 1 from rasta_project_mappings m
    where m.master_project_id = p_master_project_id and m.status = 'confirmed'
      and ((m.source_module = 'risk' and rm_is_project_member(m.source_project_id))
        or (m.source_module = 'issues' and im_is_project_member(m.source_project_id))
        or (m.source_module = 'pipepulse' and is_project_member(m.source_project_id)))
  );
$function$;
alter policy master_projects_select_authenticated on master_projects using (auth.uid() is not null);
