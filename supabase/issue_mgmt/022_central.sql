-- ============================================================================
-- Issue Management v2.1 — users, projects and access come from the central platform (User Management + Master Data).
--  * identified_at is optional (registration no longer fails on an empty value; default = now()).
--  * im_central_access(project, user): the user's central scope (rasta_user_project_scope) or project-role assignment covers the
--    master project mapped to this issue project.
--  * im_is_project_member / im_project_role also honour central access (legacy im_project_members rows keep working).
--  * im_people(project): active users who may work on that project — the only list the module's pickers use.
--  * im_sync_master_projects(): every master project gets an issue project + confirmed mapping, names follow Master Data.
-- Apply statements one by one on Supabase MCP.
-- ============================================================================
alter table im_issues alter column identified_at drop not null;
alter table im_issues alter column identified_at set default now();

create or replace function im_central_access(p_project uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rasta_project_mappings m
    where m.source_module = 'issues' and m.source_project_id = p_project and m.status = 'confirmed'
      and (rasta_project_scope_ok(p_user, m.master_project_id)
           or exists (select 1 from rasta_project_role_assignments a where a.project_id = m.master_project_id and a.user_id = p_user))
  );
$$;

create or replace function im_is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from im_project_members where project_id = p_project_id and user_id = auth.uid())
      or im_central_access(p_project_id, auth.uid());
$$;

create or replace function im_project_role(p_project_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from im_project_members where project_id = p_project_id and user_id = auth.uid() limit 1),
    case when im_central_access(p_project_id, auth.uid()) then 'pursuer' end);
$$;

create or replace function im_people(p_project uuid default null)
returns table (id uuid, full_name text, email text, position_title text, organization text, project_roles text[], is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_project is not null and not (im_is_project_member(p_project) or is_admin_user()) then return; end if;
  return query
  select p.id, p.full_name, p.email, coalesce(p.position_title, ''), coalesce(p.organization, ''),
         coalesce((select array_agg(distinct r.name) from rasta_project_role_assignments a join rasta_project_roles r on r.id = a.project_role_id
                    join rasta_project_mappings m on m.master_project_id = a.project_id and m.source_module = 'issues' and m.status = 'confirmed'
                   where a.user_id = p.id and (p_project is null or m.source_project_id = p_project)), '{}'),
         coalesce(p.is_admin, false)
    from profiles p
   where p.account_status = 'active'
     and (p_project is null or p.is_admin or im_central_access(p_project, p.id)
          or exists (select 1 from im_project_members x where x.project_id = p_project and x.user_id = p.id))
   order by p.full_name;
end;
$$;
grant execute on function im_people(uuid) to authenticated;
revoke execute on function im_people(uuid) from public, anon;

create or replace function im_sync_master_projects()
returns jsonb language plpgsql security definer set search_path = public as $$
declare mp record; v_new uuid; n_created int := 0; n_renamed int := 0; v_name text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not is_admin_user() then return jsonb_build_object('created', 0, 'renamed', 0, 'skipped', 'admin_only'); end if;
  for mp in select id, project_code, official_name, short_name, description from master_projects loop
    v_name := mp.official_name;
    select source_project_id into v_new from rasta_project_mappings where master_project_id = mp.id and source_module = 'issues' and status = 'confirmed' limit 1;
    if v_new is null then
      insert into im_projects (name, description, created_by, master_ref_id, short_code) values (v_name, coalesce(mp.description, ''), auth.uid(), mp.id, coalesce(mp.project_code, '')) returning id into v_new;
      insert into rasta_project_mappings (master_project_id, source_module, source_project_id, alias_name, status) values (mp.id, 'issues', v_new, v_name, 'confirmed');
      n_created := n_created + 1;
    else
      update im_projects set name = v_name, master_ref_id = mp.id, short_code = coalesce(mp.project_code, short_code)
       where id = v_new and (name is distinct from v_name or master_ref_id is distinct from mp.id);
      if found then n_renamed := n_renamed + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('created', n_created, 'renamed', n_renamed);
end;
$$;
grant execute on function im_sync_master_projects() to authenticated;
revoke execute on function im_sync_master_projects() from public, anon;
