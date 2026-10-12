-- Material control: project lists the user defines (stations, executing sections, fronts, places of use, warehouses, pipelines). Forms pick from them, so search and allocation never meet two spellings of one place.
create table if not exists mtl_lookups (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  kind text not null check (kind in ('facility','area','front','usage','warehouse','pipeline')),
  label text not null,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (master_project_id, kind, label)
);
alter table mtl_lookups enable row level security;
create policy mtl_lookups_sel on mtl_lookups for select to authenticated using (true);
create policy mtl_lookups_w on mtl_lookups for all to authenticated using (mtl_allows(master_project_id, 'edit_items') or mtl_can_configure()) with check (mtl_allows(master_project_id, 'edit_items') or mtl_can_configure());
create or replace trigger trg_mtl_audit after insert or update or delete on mtl_lookups for each row execute function mtl_audit_trg();

-- every value already in use becomes a list entry
insert into mtl_lookups (master_project_id, kind, label)
select distinct master_project_id, k, btrim(v) from (
  select master_project_id, 'facility' k, facility v from mtl_materials union all select master_project_id, 'area', area from mtl_materials
  union all select master_project_id, 'front', front from mtl_materials union all select master_project_id, 'usage', usage_location from mtl_materials
  union all select master_project_id, 'pipeline', pipeline_no from mtl_materials
  union all select master_project_id, 'facility', facility from mtl_txns union all select master_project_id, 'front', front from mtl_txns
  union all select master_project_id, 'facility', facility from mtl_allocations union all select master_project_id, 'front', front from mtl_allocations
  union all select master_project_id, 'warehouse', warehouse_location from mtl_warehouse_receipts
) t where btrim(coalesce(v, '')) <> '' on conflict do nothing;

-- Rename (or merge into an existing entry): every record that carries the old spelling is rewritten, the old entry is switched off.
create or replace function mtl_lookup_rename(p_project uuid, p_kind text, p_old text, p_new text) returns int language plpgsql security definer set search_path to 'public' as $f$
declare n int := 0; c int;
begin
  if not (mtl_allows(p_project, 'edit_items') or mtl_can_configure()) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if btrim(coalesce(p_new, '')) = '' then raise exception 'reason_required'; end if;
  p_new := btrim(p_new);
  insert into mtl_lookups (master_project_id, kind, label) values (p_project, p_kind, p_new) on conflict (master_project_id, kind, label) do update set active = true;
  if p_kind = 'facility' then
    update mtl_materials set facility = p_new where master_project_id = p_project and facility = p_old; get diagnostics c = row_count; n := n + c;
    update mtl_txns set facility = p_new where master_project_id = p_project and facility = p_old;
    update mtl_allocations set facility = p_new where master_project_id = p_project and facility = p_old;
    update mtl_requisitions set facility = p_new where master_project_id = p_project and facility = p_old;
  elsif p_kind = 'area' then
    update mtl_materials set area = p_new where master_project_id = p_project and area = p_old; get diagnostics c = row_count; n := n + c;
  elsif p_kind = 'front' then
    update mtl_materials set front = p_new where master_project_id = p_project and front = p_old; get diagnostics c = row_count; n := n + c;
    update mtl_txns set front = p_new where master_project_id = p_project and front = p_old;
    update mtl_allocations set front = p_new where master_project_id = p_project and front = p_old;
    update mtl_requisitions set front = p_new where master_project_id = p_project and front = p_old;
  elsif p_kind = 'usage' then
    update mtl_materials set usage_location = p_new where master_project_id = p_project and usage_location = p_old; get diagnostics c = row_count; n := n + c;
  elsif p_kind = 'pipeline' then
    update mtl_materials set pipeline_no = p_new where master_project_id = p_project and pipeline_no = p_old; get diagnostics c = row_count; n := n + c;
  elsif p_kind = 'warehouse' then
    update mtl_warehouse_receipts set warehouse_location = p_new where master_project_id = p_project and warehouse_location = p_old; get diagnostics c = row_count; n := n + c;
    update mtl_txns set from_loc = p_new where master_project_id = p_project and from_loc = p_old;
    update mtl_txns set to_loc = p_new where master_project_id = p_project and to_loc = p_old;
  else raise exception 'invalid_kind'; end if;
  if p_old <> p_new then update mtl_lookups set active = false where master_project_id = p_project and kind = p_kind and label = p_old; end if;
  return n;
end $f$;
