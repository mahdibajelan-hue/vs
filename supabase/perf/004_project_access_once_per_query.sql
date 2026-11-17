-- perf 004 — 51 policies called rasta_user_can_access_master_project(col) once per row. The same rule as
-- `col in (select my_projects())` is evaluated once per query (my_projects() lists the projects the user can access,
-- admins included — security/001), so large tables are filtered by a hash lookup instead of several lookups per row.
do $$
declare p record; q text; c text; re text := 'rasta_user_can_access_master_project\(([a-z_.]+)\)'; rep text := '(\1 in (select my_projects()))';
begin
  for p in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public'
           and (qual like '%rasta_user_can_access_master_project(%' or with_check like '%rasta_user_can_access_master_project(%') loop
    q := regexp_replace(p.qual, re, rep, 'g'); c := regexp_replace(p.with_check, re, rep, 'g');
    if p.qual is not null and p.with_check is not null then
      execute format('alter policy %I on %I using (%s) with check (%s)', p.policyname, p.tablename, q, c);
    elsif p.qual is not null then
      execute format('alter policy %I on %I using (%s)', p.policyname, p.tablename, q);
    else
      execute format('alter policy %I on %I with check (%s)', p.policyname, p.tablename, c);
    end if;
  end loop;
end $$;
