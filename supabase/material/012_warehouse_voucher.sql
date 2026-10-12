-- Material control: «حواله انبار» — one voucher for every warehouse operation (issue, consume, transfer, return, scrap, adjust), four signatures in order, posted to the ledger by the storekeeper's signature.
-- Columns added to mtl_requisitions: operation, from_loc, to_loc, work_op, activity_qty, activity_unit, contractor_org_id, adjust_sign, reason. Weld tables: basis (joint | meter), pipe_length_m. Groups: scrap_allow_pct.
create or replace function mtl_req_create(p_project uuid, p_operation text, p_facility text, p_front text, p_purpose text, p_needed date, p_notes text, p_lines jsonb, p_signers jsonb,
  p_from text default '', p_to text default '', p_work_op text default '', p_activity_qty numeric default null, p_activity_unit text default '', p_contractor uuid default null, p_sign smallint default 1, p_reason text default '') returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare v_id uuid; v_no text; l jsonb; v_img text; v_role text;
begin
  if not mtl_is_member(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_operation not in ('issue','consume','transfer','return','scrap','adjust') then raise exception 'invalid_kind'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'no_sources'; end if;
  foreach v_role in array array['site_supervisor','supervision_supervisor','storekeeper'] loop
    if coalesce(p_signers ->> v_role, '') = '' then raise exception 'signers_required'; end if;
  end loop;
  if p_operation = 'transfer' and (btrim(coalesce(p_from, '')) = '' or btrim(coalesce(p_to, '')) = '' or p_from = p_to) then raise exception 'transfer_places_required'; end if;
  if p_operation = 'return' and btrim(coalesce(p_to, '')) = '' then raise exception 'transfer_places_required'; end if;
  if p_operation in ('scrap','adjust') and btrim(coalesce(p_reason, '')) = '' then raise exception 'reason_required'; end if;
  if p_operation = 'consume' and btrim(coalesce(p_work_op, '')) = '' then raise exception 'work_op_required'; end if;
  select 'WV-' || lpad((coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0') into v_no from mtl_requisitions where master_project_id = p_project;
  insert into mtl_requisitions (master_project_id, number, requester_id, operation, facility, front, purpose, needed_by, notes, from_loc, to_loc, work_op, activity_qty, activity_unit, contractor_org_id, adjust_sign, reason)
  values (p_project, v_no, auth.uid(), p_operation, coalesce(p_facility, ''), coalesce(p_front, ''), coalesce(p_purpose, ''), p_needed, coalesce(p_notes, ''), coalesce(p_from, ''), coalesce(p_to, ''), coalesce(p_work_op, ''), p_activity_qty, coalesce(p_activity_unit, ''), p_contractor, coalesce(p_sign, 1), btrim(coalesce(p_reason, ''))) returning id into v_id;
  for l in select * from jsonb_array_elements(p_lines) loop
    if not exists (select 1 from mtl_materials where id = (l ->> 'material_id')::uuid and master_project_id = p_project) then raise exception 'not_found'; end if;
    if coalesce((l ->> 'qty')::numeric, 0) <= 0 then raise exception 'qty_must_be_positive'; end if;
    insert into mtl_requisition_lines (requisition_id, material_id, qty_requested, stock_at_request, notes) values (v_id, (l ->> 'material_id')::uuid, (l ->> 'qty')::numeric, mtl_onhand((l ->> 'material_id')::uuid), coalesce(l ->> 'notes', ''));
  end loop;
  select image into v_img from user_signatures where user_id = auth.uid();
  insert into mtl_requisition_signers (requisition_id, role, sort, user_id, decision, signed_at, signature_image) values (v_id, 'requester', 1, auth.uid(), 'approved', now(), v_img);
  insert into mtl_requisition_signers (requisition_id, role, sort, user_id) values
    (v_id, 'site_supervisor', 2, (p_signers ->> 'site_supervisor')::uuid), (v_id, 'supervision_supervisor', 3, (p_signers ->> 'supervision_supervisor')::uuid), (v_id, 'storekeeper', 4, (p_signers ->> 'storekeeper')::uuid);
  return v_id;
end $f$;

create or replace function mtl_req_sign(p_req uuid, p_decision text, p_note text default '', p_issue jsonb default null) returns text language plpgsql security definer set search_path to 'public' as $f$
declare r mtl_requisitions; sg mtl_requisition_signers; v_img text; it jsonb; ln mtl_requisition_lines; v_qty numeric; v_kind text; v_tx uuid;
begin
  select * into r from mtl_requisitions where id = p_req;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status <> 'awaiting_signatures' then raise exception 'not_pending'; end if;
  select * into sg from mtl_requisition_signers where requisition_id = p_req and user_id = auth.uid() and decision = 'pending' order by sort limit 1;
  if sg.id is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if exists (select 1 from mtl_requisition_signers where requisition_id = p_req and sort < sg.sort and decision <> 'approved') then raise exception 'previous_signature_missing'; end if;
  select image into v_img from user_signatures where user_id = auth.uid();
  if p_decision = 'reject' then
    if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
    update mtl_requisition_signers set decision = 'rejected', signed_at = now(), note = btrim(p_note), signature_image = v_img where id = sg.id;
    update mtl_requisitions set status = 'rejected', reject_reason = btrim(p_note) where id = p_req;
    return 'rejected';
  end if;
  if p_decision <> 'approve' then raise exception 'invalid_decision'; end if;
  if sg.role = 'storekeeper' then
    if p_issue is null then raise exception 'no_sources'; end if;
    v_kind := case r.operation when 'consume' then 'issue' else r.operation end;
    for it in select * from jsonb_array_elements(p_issue) loop
      select * into ln from mtl_requisition_lines where id = (it ->> 'line_id')::uuid and requisition_id = p_req;
      if ln.id is null then raise exception 'not_found'; end if;
      v_qty := coalesce((it ->> 'qty')::numeric, 0);
      if v_qty > ln.qty_requested and r.operation <> 'adjust' then raise exception 'qty_exceeds_item'; end if;
      if v_qty > 0 then
        if r.operation = 'transfer' and v_qty > mtl_onhand(ln.material_id) then raise exception 'insufficient_stock'; end if;
        v_tx := mtl_post_txn(ln.material_id, v_kind, v_qty, current_date, r.from_loc, r.to_loc, r.facility, r.front, null, r.work_op, r.activity_qty, r.activity_unit, r.contractor_org_id, r.number,
          case r.operation when 'scrap' then 'ضایعات: ' || r.reason when 'adjust' then 'تعدیل: ' || r.reason else 'حواله انبار ' || r.number end, case when r.operation = 'adjust' then r.adjust_sign else null end);
        -- the four signatures are the approval that scrap and adjustment would otherwise wait for
        if r.operation in ('scrap','adjust') then update mtl_txns set status = 'posted', approved_by = auth.uid(), approved_at = now() where id = v_tx; end if;
        update mtl_requisition_lines set qty_issued = v_qty where id = ln.id;
      end if;
    end loop;
    update mtl_requisition_signers set decision = 'approved', signed_at = now(), note = coalesce(p_note, ''), signature_image = v_img where id = sg.id;
    update mtl_requisitions set status = 'issued', issued_at = now() where id = p_req;
    return 'issued';
  end if;
  update mtl_requisition_signers set decision = 'approved', signed_at = now(), note = coalesce(p_note, ''), signature_image = v_img where id = sg.id;
  return 'signed';
end $f$;
