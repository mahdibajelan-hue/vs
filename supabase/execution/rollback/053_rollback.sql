-- Rollback of 053_cs_pssr_link.sql — run by hand only. Removes the PSSR system links of test packs and equipment.
drop trigger if exists trg_cs_pssr_same_project on public.cs_test_packs;
drop trigger if exists trg_cs_pssr_same_project on public.cs_equipment;
drop function if exists public.cs_pssr_same_project();
alter table public.cs_test_packs drop column if exists pssr_system_id;
alter table public.cs_equipment  drop column if exists pssr_system_id;
