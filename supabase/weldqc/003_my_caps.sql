-- weldqc 003 — what the signed-in person may do in a project's QC, in one call (the screen used four wq_can calls).
-- Read-only; the tables and functions still check every write. Rollback: drop function wq_my_caps(uuid).
create or replace function wq_my_caps(p_project uuid) returns jsonb language sql stable security definer set search_path to 'public' as $f$
  select jsonb_build_object('submit', wq_can(p_project, 'submit'), 'edit', wq_can(p_project, 'edit'), 'approve', wq_can(p_project, 'approve'), 'configure', wq_can(p_project, 'configure'));
$f$;
revoke all on function wq_my_caps(uuid) from public;
grant execute on function wq_my_caps(uuid) to authenticated;
