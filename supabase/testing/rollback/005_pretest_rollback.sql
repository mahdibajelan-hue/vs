-- Run by hand only. Removes the crossing pre-tests and the columns added by 005_pretest.sql.
begin;
delete from ht_readings r using ht_packs p where r.target_id = p.id and p.category = 'pretest';
delete from ht_events e using ht_packs p where e.target_id = p.id and p.category = 'pretest';
delete from ht_forms f using ht_packs p where f.target_id = p.id and p.category = 'pretest';
delete from ht_packs where category = 'pretest';
alter table ht_packs drop constraint if exists ht_packs_category_chk;
alter table ht_packs drop column if exists category, drop column if exists crossing, drop column if exists km,
  drop column if exists length_m, drop column if exists hold_h, drop column if exists wt_mm;
commit;
