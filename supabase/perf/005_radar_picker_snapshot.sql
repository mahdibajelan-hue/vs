-- The project picker's card (lifecycle gauge) saved with the EPC figure (applied 2026-11-11 as migration
-- `perf_radar_picker_snapshot`). The picker then reads Stage-Gate data only for projects whose card is stale or whose
-- Stage-Gate rows changed after it was saved, instead of every project's phase items on every visit.
alter table public.radar_epc_snapshots add column if not exists picker jsonb;
comment on column public.radar_epc_snapshots.picker is 'The project picker card (lifecycle gauge) as last computed, saved with the EPC figure';
