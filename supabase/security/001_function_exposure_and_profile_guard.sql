-- ============================================================================
-- Security hardening 001 — function exposure, search_path, profile self-guard
-- ============================================================================
-- Why: a pentest / security advisor flagged three real weaknesses.
--
--   1. PostgreSQL grants EXECUTE on every new function to the PUBLIC pseudo-role
--      by default, and Supabase's `anon` (unauthenticated) role inherits PUBLIC.
--      That left ~334 SECURITY DEFINER functions reachable by anyone on the
--      internet via PostgREST `/rest/v1/rpc/<name>`. Most enforce their own
--      authorization, but an unauthenticated caller should never even reach an
--      internal RPC. We shrink the anon surface to the handful of token-gated
--      endpoints the public pages actually use, plus the helper functions that
--      RLS / Storage policies call while evaluating an anon request.
--
--   2. 86 trigger functions (return type `trigger`) were directly callable as
--      RPCs. Triggers fire as the table owner regardless of grants, so no one
--      needs EXECUTE on them — revoke from everyone.
--
--   3. 43 SECURITY DEFINER functions had a mutable search_path (search_path
--      hijack / privilege escalation). Pin it.
--
--   Plus: the profiles self-update guard only froze `is_admin`. A disabled or
--   blocked user holding a still-valid JWT could flip their own
--   `account_status` back to 'active' (or change `user_type`) by calling
--   PostgREST directly. Freeze those too.
--
-- Safety: this migration only changes EXECUTE grants, function search_path, and
-- one guard trigger function (CREATE OR REPLACE). It contains no DROP / DELETE /
-- TRUNCATE and does not touch any row of data. `authenticated` keeps EXECUTE on
-- every non-trigger function, so signed-in app behaviour is unchanged. It is
-- idempotent and safe to re-run. Rollback: 001_..._rollback.sql.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Step 0 — strip the blanket PUBLIC/anon EXECUTE from every public function
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;

-- Trigger functions need no EXECUTE grant from anyone (Postgres does not check
-- EXECUTE on a function fired by a trigger). Supabase's default privileges grant
-- execute to authenticated/service_role explicitly, so revoke those too.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from authenticated, service_role', r.sig);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Step 1 — re-grant EXECUTE to authenticated + service_role on every
--          NON-trigger function (keeps the signed-in app fully working).
--          Trigger functions are intentionally left with no grant.
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and p.prorettype <> 'trigger'::regtype
  loop
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Step 2 — grant EXECUTE to anon only for:
--          (a) the token-gated RPCs the public, unauthenticated pages call
--              (candidate self-service, MCQ exam, personality test, public
--               results — RootApp.tsx query-param routes), and
--          (b) every function referenced inside an RLS / Storage policy
--              expression, which anon must be able to execute while the policy
--              is evaluated for an anonymous request.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  allow text[] := array[
    -- competency candidate self-service (?candidate=<token>)
    'comp_self_service_get','comp_self_service_link_state','comp_self_service_list_attachments',
    'comp_self_service_submit','comp_self_service_set_photo','comp_self_service_add_document',
    'comp_self_service_remove_document',
    -- competency public results (?results=<token>)
    'comp_public_results_get','comp_public_competency_scores_get',
    -- competency online MCQ exam (?mcq=<token>)
    'comp_mcq_candidate_get','comp_mcq_candidate_start','comp_mcq_candidate_answer_v2',
    'comp_mcq_candidate_log','comp_mcq_candidate_submit',
    -- personality candidate test (?p_candidate=<token>)
    'personality_candidate_get','personality_candidate_start','personality_candidate_get_responses',
    'personality_candidate_submit_response','personality_candidate_finalize','personality_question_public'
  ];
  polfns text[];
begin
  -- function names mentioned inside any policy expression (all schemas, incl. storage)
  select coalesce(array_agg(distinct p.proname), array[]::text[]) into polfns
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral (
    select string_agg(
      coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
      coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), ' ') as txt
    from pg_policy pol
  ) pe
  where n.nspname = 'public' and pe.txt ilike '%' || p.proname || '(%';

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and p.prorettype <> 'trigger'::regtype
      and (p.proname = any(allow) or p.proname = any(polfns))
  loop
    execute format('grant execute on function %s to anon', r.sig);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Step 3 — pin search_path on every public function that lacks one (SECURITY
--          DEFINER ones are the real hijack risk; the rest are pinned too so
--          the advisor is fully clear and future definers inherit the habit).
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f','p')
      and not (p.proconfig is not null
               and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, extensions, pg_catalog', r.sig);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Step 4 — a non-admin editing their own profiles row may not change any
--          privileged field. Previously only is_admin was frozen; a disabled
--          user could re-activate themselves via a direct PostgREST UPDATE.
-- ----------------------------------------------------------------------------
create or replace function public.prevent_self_admin_escalation()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_is_admin boolean;
begin
  if auth.uid() is not null then
    select coalesce(is_admin, false) into v_is_admin from profiles where id = auth.uid();
    if not coalesce(v_is_admin, false) then
      -- freeze every admin-controlled field for a non-admin caller
      new.is_admin       := old.is_admin;
      new.account_status := old.account_status;
      new.status_reason  := old.status_reason;
      new.user_type      := old.user_type;
    end if;
  end if;
  return new;
end;
$function$;

commit;
