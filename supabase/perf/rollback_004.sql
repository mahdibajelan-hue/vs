-- rollback of perf 004 (run by hand): back to the per-row call.
do $$
declare p record; re text := '\(([a-z_.]+) IN \( SELECT my_projects\(\) AS my_projects\)\)'; rep text := 'rasta_user_can_access_master_project(\1)';
begin
  for p in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public'
           and (qual like '%my_projects() AS my_projects%' or with_check like '%my_projects() AS my_projects%') loop
    if p.qual is not null then execute format('alter policy %I on %I using (%s)', p.policyname, p.tablename, regexp_replace(p.qual, re, rep, 'g')); end if;
    if p.with_check is not null then execute format('alter policy %I on %I with check (%s)', p.policyname, p.tablename, regexp_replace(p.with_check, re, rep, 'g')); end if;
  end loop;
end $$;
