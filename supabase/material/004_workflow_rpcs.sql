-- Material control — part 4: workflow RPCs. Every decision goes through here (permission matrix + audit); direct writes cannot approve anything.

create or replace function mtl_item_project(p_item uuid) returns uuid language sql stable security definer set search_path to 'public' as $f$
  select p.master_project_id from mtl_package_items i join mtl_packages p on p.id = i.package_id where i.id = p_item;
$f$;
create or replace function mtl_stage_project(p_stage uuid) returns uuid language sql stable security definer set search_path to 'public' as $f$
  select mtl_item_project(item_id) from mtl_item_stages where id = p_stage;
$f$;

-- a new package item gets its stage rows, with the weights of the package pattern (else the group's, else the default one) copied in
create or replace function mtl_init_item_stages_trg() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare v_pat uuid;
begin
  select coalesce(p.pattern_id, g.pattern_id, (select id from mtl_patterns where is_default and active limit 1)) into v_pat
    from mtl_packages p left join mtl_materials m on m.id = new.material_id left join mtl_groups g on g.id = m.group_id where p.id = new.package_id;
  insert into mtl_item_stages (item_id, stage_key, weight, applicable)
  select new.id, d.key, coalesce(w.weight, 0), true from mtl_stage_defs d left join mtl_pattern_weights w on w.stage_key = d.key and w.pattern_id = v_pat where d.active;
  return new;
end $f$;
create trigger trg_mtl_init_stages after insert on mtl_package_items for each row execute function mtl_init_item_stages_trg();

create or replace function mtl_save_pattern(p_id uuid, p_code text, p_title text, p_weights jsonb, p_default boolean default false) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare v_id uuid; v_sum numeric; k text;
begin
  if not mtl_can_configure() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(sum((e.value)::numeric), 0) into v_sum from jsonb_each_text(p_weights) e join mtl_stage_defs d on d.key = e.key and d.active;
  if abs(v_sum - 100) > 0.001 then raise exception 'weights_must_sum_100:%', v_sum; end if;
  if p_id is null then insert into mtl_patterns (code, title, is_default) values (p_code, p_title, false) returning id into v_id;
  else update mtl_patterns set code = p_code, title = p_title where id = p_id returning id into v_id; end if;
  if p_default then update mtl_patterns set is_default = (id = v_id) where id is not null; end if;
  update mtl_pattern_weights set weight = 0 where pattern_id = v_id;
  insert into mtl_pattern_weights (pattern_id, stage_key, weight) select v_id, e.key, (e.value)::numeric from jsonb_each_text(p_weights) e join mtl_stage_defs d on d.key = e.key
  on conflict (pattern_id, stage_key) do update set weight = excluded.weight;
  return v_id;
end $f$;

-- items whose stages are untouched take the pattern's current weights; the rest keep theirs (reported back)
create or replace function mtl_reapply_pattern(p_package uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_proj uuid; v_pat uuid; r record; v_upd int := 0; v_skip int := 0;
begin
  select master_project_id, pattern_id into v_proj, v_pat from mtl_packages where id = p_package;
  if not mtl_allows(v_proj, 'edit_packages') then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform set_config('mtl.rpc', '1', true);
  for r in select i.id, coalesce(v_pat, g.pattern_id, (select id from mtl_patterns where is_default limit 1)) pat from mtl_package_items i join mtl_materials m on m.id = i.material_id left join mtl_groups g on g.id = m.group_id where i.package_id = p_package loop
    if exists (select 1 from mtl_item_stages where item_id = r.id and status <> 'pending') then v_skip := v_skip + 1; continue; end if;
    update mtl_item_stages s set weight = coalesce((select weight from mtl_pattern_weights w where w.pattern_id = r.pat and w.stage_key = s.stage_key), 0) where s.item_id = r.id;
    v_upd := v_upd + 1;
  end loop;
  return jsonb_build_object('updated', v_upd, 'skipped', v_skip);
end $f$;

create or replace function mtl_set_applicable(p_stage uuid, p_applicable boolean, p_reason text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare v_st text;
begin
  if not mtl_allows(mtl_stage_project(p_stage), 'edit_packages') then raise exception 'not_allowed' using errcode = '42501'; end if;
  select status into v_st from mtl_item_stages where id = p_stage;
  if v_st in ('submitted','reviewed','approved') then raise exception 'stage_locked'; end if;
  if not p_applicable and coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update mtl_item_stages set applicable = p_applicable, na_reason = case when p_applicable then '' else p_reason end where id = p_stage;
end $f$;

create or replace function mtl_stage_submit(p_stage uuid, p_actual date, p_done_qty numeric, p_evidence text, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare s mtl_item_stages; d mtl_stage_defs; v_qty numeric;
begin
  select * into s from mtl_item_stages where id = p_stage;
  if s.id is null then raise exception 'not_found'; end if;
  if not mtl_allows(mtl_item_project(s.item_id), 'submit_stage') then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into d from mtl_stage_defs where key = s.stage_key;
  select qty into v_qty from mtl_package_items where id = s.item_id;
  if not s.applicable then raise exception 'stage_not_applicable'; end if;
  if s.status in ('submitted','reviewed') then raise exception 'already_submitted'; end if;
  if s.status = 'approved' and coalesce(p_done_qty, v_qty) <= s.approved_qty then raise exception 'nothing_new_to_submit'; end if;
  if d.needs_evidence and coalesce(btrim(p_evidence), '') = '' and coalesce(btrim(p_note), '') = '' then raise exception 'evidence_required'; end if;
  if p_done_qty is not null and p_done_qty > v_qty then raise exception 'qty_exceeds_item'; end if;
  perform set_config('mtl.rpc', '1', true);
  update mtl_item_stages set status = 'submitted', actual_date = coalesce(p_actual, current_date), done_qty = p_done_qty,
    evidence_url = coalesce(nullif(p_evidence, ''), evidence_url), evidence_note = coalesce(p_note, ''), submitted_by = auth.uid(), submitted_at = now(),
    reviewed_by = null, reviewed_at = null, reject_reason = '' where id = p_stage;
end $f$;

create or replace function mtl_stage_decide(p_stage uuid, p_decision text, p_note text default '') returns text language plpgsql security definer set search_path to 'public' as $f$
declare s mtl_item_stages; d mtl_stage_defs; v_proj uuid; v_qty numeric; v_new text;
begin
  select * into s from mtl_item_stages where id = p_stage;
  if s.id is null then raise exception 'not_found'; end if;
  v_proj := mtl_item_project(s.item_id);
  select * into d from mtl_stage_defs where key = s.stage_key;
  select qty into v_qty from mtl_package_items where id = s.item_id;
  if s.status not in ('submitted','reviewed') then raise exception 'not_awaiting_decision'; end if;
  if s.submitted_by = auth.uid() and not is_admin_user() then raise exception 'separation_of_duties'; end if;
  if p_decision = 'reject' then
    if not (mtl_allows(v_proj, 'review_stage') or mtl_allows(v_proj, 'approve_stage')) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if coalesce(btrim(p_note), '') = '' then raise exception 'reason_required'; end if;
    perform set_config('mtl.rpc', '1', true);
    update mtl_item_stages set status = 'rejected', reject_reason = p_note, reviewed_by = auth.uid(), reviewed_at = now() where id = p_stage;
    return 'rejected';
  end if;
  if p_decision <> 'approve' then raise exception 'invalid_decision'; end if;
  if d.review_level = 'employer' then
    if not mtl_allows(v_proj, 'approve_stage') then raise exception 'not_allowed' using errcode = '42501'; end if;
    v_new := 'approved';
  elsif d.review_level = 'both' and s.status = 'submitted' then
    if not mtl_allows(v_proj, 'review_stage') then raise exception 'not_allowed' using errcode = '42501'; end if;
    v_new := 'reviewed';
  elsif d.review_level = 'both' then
    if not mtl_allows(v_proj, 'approve_stage') then raise exception 'not_allowed' using errcode = '42501'; end if;
    v_new := 'approved';
  else
    if not (mtl_allows(v_proj, 'review_stage') or mtl_allows(v_proj, 'approve_stage')) then raise exception 'not_allowed' using errcode = '42501'; end if;
    v_new := 'approved';
  end if;
  perform set_config('mtl.rpc', '1', true);
  if v_new = 'reviewed' then
    update mtl_item_stages set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now() where id = p_stage;
  else
    update mtl_item_stages set status = 'approved', approved_by = auth.uid(), approved_at = now(), reviewed_by = coalesce(reviewed_by, auth.uid()), reviewed_at = coalesce(reviewed_at, now()),
      approved_qty = coalesce(done_qty, v_qty), reject_reason = '' where id = p_stage;
  end if;
  return v_new;
end $f$;

-- approved baseline: freeze quantity, price, value and stage weights of every package item as a numbered version
create or replace function mtl_approve_baseline(p_project uuid, p_note text, p_method text, p_currency text, p_fx numeric, p_base_date date) returns int language plpgsql security definer set search_path to 'public' as $f$
declare v int; v_snap jsonb; v_total numeric;
begin
  if not mtl_allows(p_project, 'approve_baseline') then raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(max(version), 0) + 1 into v from mtl_baselines where master_project_id = p_project;
  select coalesce(jsonb_agg(jsonb_build_object('item', i.id, 'package', i.package_id, 'material', i.material_id, 'qty', i.qty, 'price', i.unit_price, 'value', i.qty * i.unit_price,
      'weights', (select coalesce(jsonb_object_agg(s.stage_key, case when s.applicable then s.weight else 0 end), '{}'::jsonb) from mtl_item_stages s where s.item_id = i.id))), '[]'::jsonb),
    coalesce(sum(i.qty * i.unit_price), 0)
  into v_snap, v_total from mtl_package_items i join mtl_packages p on p.id = i.package_id where p.master_project_id = p_project and p.status <> 'cancelled';
  insert into mtl_baselines (master_project_id, version, note, price_method, currency, fx_rate, base_date, total_value, snapshot, approved_by)
  values (p_project, v, coalesce(p_note, ''), coalesce(p_method, ''), coalesce(p_currency, 'IRR'), coalesce(p_fx, 1), coalesce(p_base_date, current_date), v_total, v_snap, auth.uid());
  update mtl_package_items i set baseline_version = v from mtl_packages p where p.id = i.package_id and p.master_project_id = p_project and p.status <> 'cancelled';
  return v;
end $f$;

create or replace function mtl_request_change(p_material uuid, p_field text, p_new text, p_reason text, p_doc text default '') returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare m mtl_materials; v_old text; v_id uuid;
begin
  select * into m from mtl_materials where id = p_material;
  if m.id is null then raise exception 'not_found'; end if;
  if not mtl_allows(m.master_project_id, 'edit_items') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  v_old := case p_field when 'contract_qty' then m.contract_qty::text when 'detail_qty' then m.detail_qty::text when 'unit_price' then m.unit_price::text when 'spec' then m.spec when 'size' then m.size when 'unit' then m.unit
    when 'material_code' then m.material_code when 'usage_location' then m.usage_location when 'need_date' then m.need_date::text else null end;
  insert into mtl_changes (master_project_id, material_id, field, old_value, new_value, reason, doc_ref) values (m.master_project_id, p_material, p_field, coalesce(v_old, ''), coalesce(p_new, ''), p_reason, coalesce(p_doc, '')) returning id into v_id;
  return v_id;
end $f$;

create or replace function mtl_decide_change(p_id uuid, p_approve boolean, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare c mtl_changes;
begin
  select * into c from mtl_changes where id = p_id;
  if c.id is null or c.status <> 'requested' then raise exception 'not_pending'; end if;
  if not (mtl_allows(c.master_project_id, 'approve_change') or mtl_allows(c.master_project_id, 'review_change')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if c.requested_by = auth.uid() and not is_admin_user() then raise exception 'separation_of_duties'; end if;
  if p_approve then
    update mtl_materials set
      contract_qty = case when c.field = 'contract_qty' then nullif(c.new_value, '')::numeric else contract_qty end,
      detail_qty = case when c.field = 'detail_qty' then nullif(c.new_value, '')::numeric else detail_qty end,
      unit_price = case when c.field = 'unit_price' then c.new_value::numeric else unit_price end,
      spec = case when c.field = 'spec' then c.new_value else spec end,
      size = case when c.field = 'size' then c.new_value else size end,
      unit = case when c.field = 'unit' then c.new_value else unit end,
      material_code = case when c.field = 'material_code' then c.new_value else material_code end,
      usage_location = case when c.field = 'usage_location' then c.new_value else usage_location end,
      need_date = case when c.field = 'need_date' then nullif(c.new_value, '')::date else need_date end
    where id = c.material_id;
  end if;
  update mtl_changes set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = coalesce(p_note, '') where id = p_id;
end $f$;

-- detected discrepancies are upserted by fingerprint; people decide, detection only reopens or clears automatic ones
create or replace function mtl_sync_discrepancies(p_project uuid, p_items jsonb) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare it jsonb; v_new int := 0; v_upd int := 0; v_clr int; v_fps text[];
begin
  if not (mtl_allows(p_project, 'sync') or mtl_allows(p_project, 'edit_items')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(array_agg(x->>'fingerprint'), '{}') into v_fps from jsonb_array_elements(p_items) x;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into mtl_discrepancies (master_project_id, material_id, package_id, kind, fingerprint, diff_qty, probable_cause, usage_location, impact, due_date)
    values (p_project, nullif(it->>'material_id', '')::uuid, nullif(it->>'package_id', '')::uuid, it->>'kind', it->>'fingerprint', nullif(it->>'diff_qty', '')::numeric,
      coalesce(it->>'probable_cause', ''), coalesce(it->>'usage_location', ''), coalesce(it->>'impact', ''), nullif(it->>'due_date', '')::date)
    on conflict (master_project_id, fingerprint) do update set diff_qty = excluded.diff_qty, probable_cause = excluded.probable_cause, impact = excluded.impact, usage_location = excluded.usage_location, last_seen_at = now(),
      status = case when mtl_discrepancies.status = 'cleared' then 'open' else mtl_discrepancies.status end;
    if found then v_upd := v_upd + 1; end if;
  end loop;
  update mtl_discrepancies set status = 'cleared', last_seen_at = now() where master_project_id = p_project and source = 'auto' and status in ('open','in_review') and not (fingerprint = any(v_fps));
  get diagnostics v_clr = row_count;
  return jsonb_build_object('upserted', v_upd, 'cleared', v_clr);
end $f$;

create or replace function mtl_decide_discrepancy(p_id uuid, p_status text, p_resolution text default '', p_responsible uuid default null, p_due date default null, p_impact text default null) returns void language plpgsql security definer set search_path to 'public' as $f$
declare x mtl_discrepancies;
begin
  select * into x from mtl_discrepancies where id = p_id;
  if x.id is null then raise exception 'not_found'; end if;
  if p_status in ('resolved','accepted','escalated') then
    if not mtl_allows(x.master_project_id, 'decide_discrepancy') then raise exception 'not_allowed' using errcode = '42501'; end if;
    if p_status in ('resolved','accepted') and coalesce(btrim(p_resolution), '') = '' then raise exception 'resolution_required'; end if;
  elsif not (mtl_allows(x.master_project_id, 'edit_items') or mtl_allows(x.master_project_id, 'decide_discrepancy')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update mtl_discrepancies set status = p_status, resolution = coalesce(nullif(p_resolution, ''), resolution), responsible = coalesce(p_responsible, responsible), due_date = coalesce(p_due, due_date), impact = coalesce(p_impact, impact),
    decided_by = case when p_status in ('resolved','accepted','escalated') then auth.uid() else decided_by end, decided_at = case when p_status in ('resolved','accepted','escalated') then now() else decided_at end where id = p_id;
end $f$;

-- stock position: accepted receipts, minus issues/scrap/negative adjustments, plus returns/positive adjustments
create or replace function mtl_onhand(p_material uuid) returns numeric language sql stable security definer set search_path to 'public' as $f$
  select coalesce((select sum(quantity_received) from mtl_warehouse_lines where material_id = p_material and condition = 'ok' and inspection_status = 'accepted'), 0)
    - coalesce((select sum(qty) from mtl_txns where material_id = p_material and status = 'posted' and (kind in ('issue','scrap') or (kind = 'adjust' and adjust_sign = -1))), 0)
    + coalesce((select sum(qty) from mtl_txns where material_id = p_material and status = 'posted' and (kind = 'return' or (kind = 'adjust' and adjust_sign = 1))), 0);
$f$;

create or replace function mtl_post_txn(p_material uuid, p_kind text, p_qty numeric, p_date date, p_from text default '', p_to text default '', p_facility text default '', p_front text default '', p_allocation uuid default null,
  p_op text default '', p_activity_qty numeric default null, p_activity_unit text default '', p_contractor uuid default null, p_doc text default '', p_notes text default '', p_sign smallint default null) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare m mtl_materials; v_id uuid; v_status text;
begin
  select * into m from mtl_materials where id = p_material;
  if m.id is null then raise exception 'not_found'; end if;
  if not mtl_allows(m.master_project_id, 'post_txn') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'qty_must_be_positive'; end if;
  if p_kind = 'adjust' and p_sign is null then raise exception 'adjust_sign_required'; end if;
  if p_kind in ('issue','scrap') or (p_kind = 'adjust' and p_sign = -1) then
    if p_qty > mtl_onhand(p_material) then raise exception 'insufficient_stock'; end if;
  end if;
  v_status := case when p_kind in ('scrap','adjust') then 'pending' else 'posted' end;
  insert into mtl_txns (master_project_id, material_id, kind, qty, adjust_sign, txn_date, from_loc, to_loc, facility, front, allocation_id, work_op, activity_qty, activity_unit, contractor_org_id, doc_ref, notes, status)
  values (m.master_project_id, p_material, p_kind, p_qty, p_sign, coalesce(p_date, current_date), coalesce(p_from, ''), coalesce(p_to, ''), coalesce(p_facility, ''), coalesce(p_front, ''), p_allocation, coalesce(p_op, ''), p_activity_qty, coalesce(p_activity_unit, ''), p_contractor, coalesce(p_doc, ''), coalesce(p_notes, ''), v_status)
  returning id into v_id;
  return v_id;
end $f$;

create or replace function mtl_decide_txn(p_id uuid, p_approve boolean, p_note text default '') returns void language plpgsql security definer set search_path to 'public' as $f$
declare t mtl_txns;
begin
  select * into t from mtl_txns where id = p_id;
  if t.id is null or t.status <> 'pending' then raise exception 'not_pending'; end if;
  if not mtl_allows(t.master_project_id, 'approve_txn') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if t.created_by = auth.uid() and not is_admin_user() then raise exception 'separation_of_duties'; end if;
  if p_approve and (t.kind = 'scrap' or (t.kind = 'adjust' and t.adjust_sign = -1)) and t.qty > mtl_onhand(t.material_id) then raise exception 'insufficient_stock'; end if;
  update mtl_txns set status = case when p_approve then 'posted' else 'voided' end, approved_by = auth.uid(), approved_at = now(), void_reason = case when p_approve then '' else coalesce(p_note, '') end where id = p_id;
end $f$;

create or replace function mtl_void_txn(p_id uuid, p_reason text) returns void language plpgsql security definer set search_path to 'public' as $f$
declare t mtl_txns;
begin
  select * into t from mtl_txns where id = p_id;
  if t.id is null then raise exception 'not_found'; end if;
  if not mtl_allows(t.master_project_id, 'approve_txn') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update mtl_txns set status = 'voided', void_reason = p_reason where id = p_id;
end $f$;

create or replace function mtl_save_settings(p_values jsonb, p_valid_from date default current_date, p_note text default '') returns int language plpgsql security definer set search_path to 'public' as $f$
declare v int;
begin
  if not mtl_can_configure() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select coalesce(max(version), 0) + 1 into v from mtl_settings_versions;
  insert into mtl_settings_versions (version, valid_from, note, values_json) values (v, coalesce(p_valid_from, current_date), coalesce(p_note, ''), p_values);
  return v;
end $f$;

create or replace function mtl_set_role(p_project uuid, p_user uuid, p_role text, p_active boolean default true, p_org uuid default null) returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not (mtl_can_configure() or mtl_allows(p_project, '*')) then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into mtl_project_roles (project_id, user_id, role, active, organization_id) values (p_project, p_user, p_role, p_active, p_org)
  on conflict (project_id, user_id, role) do update set active = excluded.active, organization_id = coalesce(excluded.organization_id, mtl_project_roles.organization_id);
end $f$;
