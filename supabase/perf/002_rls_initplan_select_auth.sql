-- Performance: RLS policies called auth.uid() / auth.jwt() / auth.role() / auth.email() once PER ROW.
-- Wrapping each call as (select auth.<fn>()) lets Postgres evaluate it once per query (an InitPlan); the policy's
-- meaning is unchanged. Only ALTER POLICY is used (nothing dropped). Already-wrapped calls are left as they are.
-- Applied 2026-11-10 as migration `perf_rls_initplan_select_auth`; safe to re-run.
create or replace function pg_temp.wrap_auth(x text) returns text language sql immutable as $f$
  select case when x is null then null else
    replace(replace(replace(replace(
      regexp_replace(
        replace(replace(replace(replace(x, '( SELECT auth.uid() AS uid)', '§U§'), '( SELECT auth.jwt() AS jwt)', '§J§'), '( SELECT auth.role() AS role)', '§R§'), '( SELECT auth.email() AS email)', '§E§'),
        'auth\.(uid|jwt|role|email)\(\)', '(select auth.\1())', 'g'),
      '§U§', '( SELECT auth.uid() AS uid)'), '§J§', '( SELECT auth.jwt() AS jwt)'), '§R§', '( SELECT auth.role() AS role)'), '§E§', '( SELECT auth.email() AS email)')
  end
$f$;

do $$
declare p record; nq text; nc text; n int := 0;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    nq := pg_temp.wrap_auth(p.qual);
    nc := pg_temp.wrap_auth(p.with_check);
    if nq is distinct from p.qual and nc is distinct from p.with_check then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, nq, nc); n := n + 1;
    elsif nq is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, nq); n := n + 1;
    elsif nc is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, nc); n := n + 1;
    end if;
  end loop;
  raise notice 'altered % policies', n;
end $$;
