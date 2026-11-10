-- Performance: an index for every foreign key that had none, and for every project column (master_project_id /
-- project_id) the modules filter on. Additive only; safe to re-run (finds what is still missing each time).
-- Applied 2026-11-10 as migration `perf_fk_and_project_indexes` (489 indexes, named ix_<table>_<columns>).
do $$
declare r record; n int := 0; used text[] := '{}'; nm text; i int;
begin
  for r in
    with fk as (
      select c.conrelid, c.conkey, cl.relname
      from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace ns on ns.oid=cl.relnamespace
      where c.contype='f' and ns.nspname='public'
    ), missing as (
      select fk.* from fk where not exists (
        select 1 from pg_index ix where ix.indrelid=fk.conrelid
          and (ix.indkey::int2[])[0:array_length(fk.conkey,1)-1] @> fk.conkey and (ix.indkey::int2[])[0:array_length(fk.conkey,1)-1] <@ fk.conkey)
    ), cols as (
      select m.relname, string_agg(quote_ident(a.attname), ', ' order by k.ord) collist, string_agg(a.attname, '_' order by k.ord) colname
      from missing m cross join lateral unnest(m.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid=m.conrelid and a.attnum=k.attnum
      group by m.relname, m.conkey
    ), scope as (
      select cl.relname, quote_ident(a.attname) collist, a.attname::text colname
      from pg_class cl join pg_namespace ns on ns.oid=cl.relnamespace join pg_attribute a on a.attrelid=cl.oid
      where ns.nspname='public' and cl.relkind='r' and a.attname in ('master_project_id','project_id') and not a.attisdropped
        and not exists (select 1 from pg_index ix where ix.indrelid=cl.oid and (ix.indkey::int2[])[0] = a.attnum)
    )
    select distinct relname, collist, colname from (select relname, collist, colname from cols union select relname, collist, colname from scope) u order by 1, 2
  loop
    nm := left('ix_' || r.relname || '_' || r.colname, 63); i := 2;
    while nm = any(used) or exists (select 1 from pg_class where relname = nm) loop
      nm := left('ix_' || r.relname || '_' || r.colname, 63 - length('_' || i)) || '_' || i; i := i + 1;
    end loop;
    used := used || nm;
    execute format('create index if not exists %I on public.%I (%s)', nm, r.relname, r.collist);
    n := n + 1;
  end loop;
  raise notice 'created % indexes', n;
end $$;
