-- Rollback of 051_cs_qc.sql — run by hand only. Removes the QC rules and ITP records (and their data) and restores the
-- guard of 050 by re-running 050_cs_registers.sql afterwards.
drop table if exists public.cs_inspections;
drop table if exists public.cs_qc_settings;
drop function if exists public.cs_settings_stamp();
alter table public.cs_welds drop constraint if exists cs_welds_ndt_reason_chk;
alter table public.cs_welds drop column if exists ndt_reason;
alter table public.cs_welds drop column if exists ndt_selected;
-- then: \i supabase/execution/050_cs_registers.sql  (restores cs_guard without the 051 rules)
