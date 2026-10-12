-- Material control round 2 (A): unique item code, contract line number, double-order guard with a documented exception.
create sequence if not exists mtl_item_uid_seq;
alter table mtl_materials add column if not exists item_uid text;
update mtl_materials set item_uid = 'MT-' || lpad(nextval('mtl_item_uid_seq')::text, 6, '0') where item_uid is null;
create unique index if not exists mtl_materials_item_uid_key on mtl_materials (item_uid);
alter table mtl_materials alter column item_uid set default ('MT-' || lpad(nextval('mtl_item_uid_seq')::text, 6, '0'));
alter table mtl_materials alter column item_uid set not null;
create or replace function mtl_item_uid_keep() returns trigger language plpgsql as $f$
begin
  if new.item_uid is distinct from old.item_uid then new.item_uid := old.item_uid; end if;
  return new;
end $f$;
create or replace trigger trg_mtl_item_uid_keep before update on mtl_materials for each row execute function mtl_item_uid_keep();
-- contract line number: rows imported without one get their order in the project's MTO
with n as (select id, row_number() over (partition by master_project_id order by created_at, material_code, id) rn from mtl_materials where btrim(coalesce(line_no, '')) = '')
update mtl_materials m set line_no = lpad(n.rn::text, 3, '0') from n where n.id = m.id;
create index if not exists mtl_materials_line_no_idx on mtl_materials (master_project_id, line_no);

alter table mtl_package_items add column if not exists exception_reason text not null default '';
alter table mtl_po_lines add column if not exists exception_reason text not null default '';
create or replace function mtl_required_qty(p_material uuid) returns numeric language sql stable as $f$
  select coalesce(detail_qty, contract_qty, mto_quantity, 0) from mtl_materials where id = p_material
$f$;
-- A material cannot be put into packages (or ordered) beyond what the project needs unless the line carries a reason (shortage or an approved exception).
create or replace function mtl_double_order_guard() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v_req numeric; v_others numeric; v_new numeric;
begin
  v_req := mtl_required_qty(new.material_id);
  if tg_table_name = 'mtl_package_items' then
    v_new := new.qty;
    select coalesce(sum(i.qty), 0) into v_others from mtl_package_items i join mtl_packages p on p.id = i.package_id where i.material_id = new.material_id and p.status <> 'cancelled' and i.id <> new.id;
  else
    v_new := new.quantity_ordered;
    select coalesce(sum(l.quantity_ordered), 0) into v_others from mtl_po_lines l join mtl_purchase_orders o on o.id = l.po_id where l.material_id = new.material_id and o.status <> 'cancelled' and l.id <> new.id;
  end if;
  if v_req > 0 and v_others + v_new > v_req * 1.02 + 0.000001 and btrim(coalesce(new.exception_reason, '')) = '' then
    raise exception 'double_order_blocked';
  end if;
  return new;
end $f$;
create or replace trigger trg_mtl_double_order before insert or update of qty, material_id on mtl_package_items for each row execute function mtl_double_order_guard();
create or replace trigger trg_mtl_double_order before insert or update of quantity_ordered, material_id on mtl_po_lines for each row execute function mtl_double_order_guard();
