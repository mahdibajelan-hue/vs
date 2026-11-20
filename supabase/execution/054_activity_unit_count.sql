-- 054 — how many units a price-list row covers (e.g. 3 turbo-compressor foundations), for the count columns of the
-- compressor-station daily report (DR) beside the volumes. The units done each day are entered on the report line
-- (detail.count). Optional; additive only. Rollback: rollback/054_rollback.sql (run by hand).
alter table public.ex_activities add column if not exists unit_count numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ex_activities_unit_count_chk') then
    alter table public.ex_activities add constraint ex_activities_unit_count_chk check (unit_count is null or unit_count >= 0);
  end if;
end $$;
comment on column public.ex_activities.unit_count is 'number of units (foundations, sleepers …) the row covers; the DR count columns';
