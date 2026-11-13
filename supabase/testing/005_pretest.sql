-- Pre-test of crossing pipe (road, railway, river, wadi, canal …) before it is installed: kept with the station test
-- packages in ht_packs (same stages, readings and minutes), told apart by «category». Used by the quality-control module.
alter table ht_packs add column if not exists category text not null default 'station';
alter table ht_packs add column if not exists crossing text not null default '';
alter table ht_packs add column if not exists km numeric;
alter table ht_packs add column if not exists length_m numeric;
alter table ht_packs add column if not exists hold_h numeric;
alter table ht_packs add column if not exists wt_mm numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ht_packs_category_chk') then
    alter table ht_packs add constraint ht_packs_category_chk check (category in ('station', 'pretest'));
  end if;
end $$;
