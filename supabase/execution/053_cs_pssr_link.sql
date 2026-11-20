-- 053 — compressor station ↔ PSSR: a test pack and an equipment item may belong to a PSSR system (commissioning
-- system), so the PSSR module can show, per system, the packs not yet tested / reinstated and the equipment whose
-- installation is not complete before anyone confirms the hydrotest and mechanical-completion items or signs RFSU.
-- The system must be of the same project (trigger). Additive only. Rollback: rollback/053_rollback.sql (run by hand).

alter table public.cs_test_packs add column if not exists pssr_system_id uuid references public.pssr_systems(id) on delete set null;
alter table public.cs_equipment  add column if not exists pssr_system_id uuid references public.pssr_systems(id) on delete set null;
create index if not exists cs_test_packs_pssr_idx on public.cs_test_packs (pssr_system_id);
create index if not exists cs_equipment_pssr_idx  on public.cs_equipment (pssr_system_id);

create or replace function public.cs_pssr_same_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pssr_system_id is not null and not exists (select 1 from pssr_systems where id = new.pssr_system_id and master_project_id = new.project_id) then
    raise exception 'cross_project' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.cs_pssr_same_project() from public, anon, authenticated;
create or replace trigger trg_cs_pssr_same_project before insert or update on public.cs_test_packs for each row execute function public.cs_pssr_same_project();
create or replace trigger trg_cs_pssr_same_project before insert or update on public.cs_equipment  for each row execute function public.cs_pssr_same_project();
