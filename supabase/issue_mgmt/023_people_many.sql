-- ============================================================================
-- Issue Management — one round trip for the people directory of several projects.
-- im_people_many(projects) = im_people(p) for each p (same access check per project), tagged with the project id.
-- Rollback: drop function if exists im_people_many(uuid[]);
-- ============================================================================
create or replace function im_people_many(p_projects uuid[])
returns table (project_id uuid, id uuid, full_name text, email text, position_title text, organization text, project_roles text[], is_admin boolean)
language sql stable security invoker set search_path = public as $$
  select pid, x.id, x.full_name, x.email, x.position_title, x.organization, x.project_roles, x.is_admin
    from unnest(p_projects) as pid
    cross join lateral im_people(pid) as x
$$;
grant execute on function im_people_many(uuid[]) to authenticated;
