-- weldqc 004 — the workflow functions are for signed-in users only (Supabase grants new functions to «anon» by default).
-- Each function already refuses a caller without a session; this removes the grant the security advisor flags.
-- Rollback: grant execute on the same functions to anon (not recommended).
revoke execute on function wq_can(uuid, text), wq_open(uuid), wq_my_caps(uuid), wq_ensure_joint(uuid),
  wq_evaluate(uuid, text, text, jsonb, numeric, text), wq_sign(uuid, boolean, text), wq_repair(uuid, text, text, text, text, text, text),
  wq_path_project(text) from anon;
