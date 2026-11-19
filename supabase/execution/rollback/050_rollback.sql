-- Rollback of 050_cs_registers.sql — run by hand only. Removes the compressor-station registers AND THEIR DATA.
drop table if exists public.cs_history;
drop table if exists public.cs_welds;
drop table if exists public.cs_spools;
drop table if exists public.cs_lines;
drop table if exists public.cs_equipment;
drop table if exists public.cs_test_packs;
drop function if exists public.cs_guard();
drop function if exists public.cs_same_project();
drop function if exists public.cs_can_write(uuid);
drop function if exists public.cs_can_review(uuid);
