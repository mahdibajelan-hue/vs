-- APPLIED 2026-11-11 in the SQL editor. Result: 748 merged policies replaced 401; no (table, role, action) has more
-- than one permissive policy; advisor multiple_permissive_policies 908 -> 61 (the rest: tables with separate public and
-- authenticated policies, kept apart on purpose). Rows visible per table were identical before and after for the admin,
-- two non-admin users, a user with no project, and anon (187 tables, same counts and fingerprint); a walk through the
-- radar and 16 modules gave no REST errors.
--
-- Same rule as 004_merge_permissive_policies.sql, computed inside the database from pg_policies. For every (table, role) with more than one permissive policy for an
-- action, the overlapping policies of that role are replaced by one policy per action — merged_<action>, with _auth or
-- _public appended when the table has policies for both roles — whose USING and WITH CHECK are the OR of the old ones
-- (a policy without WITH CHECK contributes its USING, as PostgreSQL does). Undo: 004_merge_permissive_policies_rollback.sql.
do $merge$
declare
  pair record; act text; u text; c text; tag text; n int := 0;
begin
  for pair in
    select p.tablename t, p.roles r, (select count(distinct roles) from pg_policies q where q.schemaname = 'public' and q.tablename = p.tablename) nroles
    from pg_policies p, unnest(case when p.cmd = 'ALL' then array['SELECT','INSERT','UPDATE','DELETE'] else array[p.cmd] end) a
    where p.schemaname = 'public' and p.permissive = 'PERMISSIVE'
    group by p.tablename, p.roles having count(*) > count(distinct a)
  loop
    tag := case when pair.nroles > 1 then case when array_to_string(pair.r, ',') = 'authenticated' then '_auth' else '_' || array_to_string(pair.r, ',') end else '' end;
    -- every action of this role, from the policies as they are now (before any drop)
    for act in select unnest(array['SELECT','INSERT','UPDATE','DELETE']) loop
      select case when bool_or(qual = 'true') then 'true' else string_agg(distinct '(' || qual || ')', ' OR ') end,
             case when bool_or(coalesce(with_check, qual) = 'true') then 'true' else string_agg(distinct '(' || coalesce(with_check, qual) || ')', ' OR ') end
        into u, c
        from pg_policies where schemaname = 'public' and tablename = pair.t and roles = pair.r and permissive = 'PERMISSIVE' and cmd in (act, 'ALL');
      if u is null and c is null then continue; end if;
      execute format('create policy %I on public.%I as permissive for %s to %s', 'merged_' || lower(act) || tag, pair.t, lower(act),
        (select string_agg(quote_ident(x), ', ') from unnest(pair.r) x))
        || case when act in ('SELECT','UPDATE','DELETE') and u is not null then ' using (' || u || ')' else '' end
        || case when act in ('INSERT','UPDATE') and c is not null then ' with check (' || c || ')' else '' end;
      n := n + 1;
    end loop;
    -- then the policies they replace
    for act in select policyname from pg_policies where schemaname = 'public' and tablename = pair.t and roles = pair.r and permissive = 'PERMISSIVE' and policyname not like 'merged\_%' loop
      execute format('drop policy %I on public.%I', act, pair.t);
    end loop;
  end loop;
  raise notice 'merged policies created: %', n;
end
$merge$;
