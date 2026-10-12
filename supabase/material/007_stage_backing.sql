-- Material control round 2 (B): a supply stage cannot be approved beyond what the real records support.
-- Order-dependent stages (PO, manufacturing, inspection, release, shipping) need order lines; site receipt / entry inspection need warehouse receipts.
create or replace function mtl_stage_limit(p_stage uuid) returns numeric language plpgsql stable security definer set search_path to 'public' as $f$
declare s mtl_item_stages; i mtl_package_items;
begin
  select * into s from mtl_item_stages where id = p_stage;
  select * into i from mtl_package_items where id = s.item_id;
  if s.stage_key in ('po_issue','manufacturing','inspection','release','shipping') then
    return (select coalesce(sum(l.quantity_ordered), 0) from mtl_po_lines l join mtl_purchase_orders o on o.id = l.po_id where l.material_id = i.material_id and o.status in ('issued','active','completed'));
  elsif s.stage_key in ('site_receipt','entry_inspection') then
    return (select coalesce(sum(w.quantity_received), 0) from mtl_warehouse_lines w where w.material_id = i.material_id);
  end if;
  return null;
end $f$;

do $p$
declare d text;
begin
  d := pg_get_functiondef('mtl_stage_submit'::regproc);
  if position('stage_not_backed' in d) = 0 then
    d := replace(d, E'  perform set_config(''mtl.rpc'', ''1'', true);', E'  if mtl_stage_limit(p_stage) is not null and coalesce(p_done_qty, v_qty) > mtl_stage_limit(p_stage) + 0.000001 then raise exception ''stage_not_backed''; end if;\n  perform set_config(''mtl.rpc'', ''1'', true);');
    execute d;
  end if;
  d := pg_get_functiondef('mtl_stage_decide'::regproc);
  if position('stage_not_backed' in d) = 0 then
    d := replace(d, E'  if p_decision <> ''approve'' then raise exception ''invalid_decision''; end if;', E'  if p_decision <> ''approve'' then raise exception ''invalid_decision''; end if;\n  if mtl_stage_limit(p_stage) is not null and coalesce(s.done_qty, v_qty) > mtl_stage_limit(p_stage) + 0.000001 then raise exception ''stage_not_backed''; end if;');
    execute d;
  end if;
end $p$;

-- existing approvals that have no backing record go back (fully, or down to the supported quantity)
do $r$
begin
  perform set_config('mtl.rpc', '1', true);
  with lim as (select s.id, mtl_stage_limit(s.id) l from mtl_item_stages s where s.applicable and s.status = 'approved')
  update mtl_item_stages s set approved_qty = least(s.approved_qty, lim.l),
    status = case when lim.l <= 0 then 'pending' else s.status end,
    approved_by = case when lim.l <= 0 then null else s.approved_by end, approved_at = case when lim.l <= 0 then null else s.approved_at end,
    reviewed_by = case when lim.l <= 0 then null else s.reviewed_by end, reviewed_at = case when lim.l <= 0 then null else s.reviewed_at end,
    reject_reason = case when lim.l <= 0 then 'برگشت خودکار: سفارش یا رسید پشتیبان این مرحله ثبت نشده است' else s.reject_reason end
  from lim where lim.id = s.id and lim.l is not null and s.approved_qty > lim.l;
end $r$;
