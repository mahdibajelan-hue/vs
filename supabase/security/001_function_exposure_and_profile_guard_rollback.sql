-- ============================================================================
-- ROLLBACK for 001_function_exposure_and_profile_guard.sql
-- ============================================================================
-- Restores the pre-hardening grant state (EXECUTE to PUBLIC on all public
-- functions) and the original profiles guard (froze only is_admin).
--
-- NOTE: the search_path pinning from Step 3 is deliberately NOT undone here — it
-- is purely protective, changes no behaviour for functions that reference public
-- objects, and reverting it would re-introduce a search_path-hijack weakness. If
-- you truly must clear it, run `alter function <sig> reset search_path` per
-- function by hand.
--
-- Run this only if the hardening broke a flow you cannot otherwise fix. Contains
-- no DROP / DELETE / TRUNCATE.
-- ============================================================================

begin;

-- Restore the default blanket EXECUTE to PUBLIC on every public function
-- (this also re-exposes them to anon, i.e. the original, weaker state).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
  loop
    execute format('grant execute on function %s to public', r.sig);
  end loop;
end $$;

-- Restore the original guard: only is_admin was frozen for non-admins.
create or replace function public.prevent_self_admin_escalation()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not coalesce((select is_admin from profiles where id = auth.uid()), false) then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$function$;

commit;
