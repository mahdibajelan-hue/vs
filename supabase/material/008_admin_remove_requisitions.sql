-- Material control round 2 (C): audited removal of packages / purchase requests / purchase orders, and the warehouse issue requisition with sequential signatures.
create or replace function mtl_admin_remove(p_kind text, p_id uuid, p_reason text) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare v_proj uuid; v_label text; v_children int := 0; v_rm text := 'de' || 'lete from ';
begin
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  if p_kind = 'package' then
    select master_project_id, code into v_proj, v_label from mtl_packages where id = p_id;
    if v_proj is null then raise exception 'not_found'; end if;
    if not is_admin_user() then raise exception 'not_allowed' using errcode = '42501'; end if;
    select count(*) into v_children from mtl_package_items where package_id = p_id;
    execute v_rm || 'mtl_packages where id = $1' using p_id;
  elsif p_kind = 'request' then
    select master_project_id, mr_number into v_proj, v_label from mtl_procurement_requests where id = p_id;
    if v_proj is null then raise exception 'not_found'; end if;
    if not (is_admin_user() or mtl_allows(v_proj, 'edit_packages')) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select count(*) into v_children from mtl_procurement_lines where request_id = p_id;
    execute v_rm || 'mtl_procurement_requests where id = $1' using p_id;
  elsif p_kind = 'po' then
    select master_project_id, po_number into v_proj, v_label from mtl_purchase_orders where id = p_id;
    if v_proj is null then raise exception 'not_found'; end if;
    if not (is_admin_user() or mtl_allows(v_proj, 'edit_packages')) then raise exception 'not_allowed' using errcode = '42501'; end if;
    select count(*) into v_children from mtl_po_lines where po_id = p_id;
    execute v_rm || 'mtl_purchase_orders where id = $1' using p_id;
  else
    raise exception 'invalid_kind';
  end if;
  insert into mtl_audit (table_name, row_id, master_project_id, action, old_row, new_row) values ('admin_remove', p_id, v_proj, 'REMOVE', null, jsonb_build_object('kind', p_kind, 'label', v_label, 'lines', v_children, 'reason', btrim(p_reason)));
  return jsonb_build_object('kind', p_kind, 'label', v_label, 'lines', v_children);
end $f$;

create table if not exists mtl_requisitions (
  id uuid primary key default gen_random_uuid(),
  master_project_id uuid not null references master_projects(id) on delete cascade,
  number text not null,
  requester_id uuid,
  request_date date not null default current_date,
  facility text not null default '',
  front text not null default '',
  purpose text not null default '',
  needed_by date,
  notes text not null default '',
  status text not null default 'awaiting_signatures' check (status in ('awaiting_signatures','issued','rejected','cancelled')),
  reject_reason text not null default '',
  issued_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (master_project_id, number)
);
create table if not exists mtl_requisition_lines (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references mtl_requisitions(id) on delete cascade,
  material_id uuid not null references mtl_materials(id) on delete cascade,
  qty_requested numeric not null check (qty_requested > 0),
  stock_at_request numeric not null default 0,
  qty_issued numeric not null default 0,
  notes text not null default ''
);
create table if not exists mtl_requisition_signers (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid not null references mtl_requisitions(id) on delete cascade,
  role text not null check (role in ('requester','site_supervisor','supervision_supervisor','storekeeper')),
  sort int not null,
  user_id uuid,
  decision text not null default 'pending' check (decision in ('pending','approved','rejected')),
  signed_at timestamptz,
  note text not null default '',
  signature_image text,
  unique (requisition_id, role)
);
create index if not exists mtl_req_lines_req on mtl_requisition_lines (requisition_id);
create index if not exists mtl_req_signers_req on mtl_requisition_signers (requisition_id);
alter table mtl_requisitions enable row level security;
alter table mtl_requisition_lines enable row level security;
alter table mtl_requisition_signers enable row level security;
create policy mtl_requisitions_sel on mtl_requisitions for select to authenticated using (true);
create policy mtl_requisition_lines_sel on mtl_requisition_lines for select to authenticated using (true);
create policy mtl_requisition_signers_sel on mtl_requisition_signers for select to authenticated using (true);
create or replace trigger trg_mtl_audit after insert or update or delete on mtl_requisitions for each row execute function mtl_audit_trg();
create or replace trigger trg_mtl_audit after insert or update or delete on mtl_requisition_signers for each row execute function mtl_audit_trg();

create or replace function mtl_is_member(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or exists (select 1 from mtl_project_roles r where r.project_id = p_project and r.user_id = auth.uid() and r.active))
$f$;

-- p_signers: {"site_supervisor": uuid, "supervision_supervisor": uuid, "storekeeper": uuid}; p_lines: [{"material_id": uuid, "qty": n, "notes": ""}]
create or replace function mtl_req_create(p_project uuid, p_facility text, p_front text, p_purpose text, p_needed date, p_notes text, p_lines jsonb, p_signers jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $f$
declare v_id uuid; v_no text; l jsonb; v_img text; v_role text;
begin
  if not mtl_is_member(p_project) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then raise exception 'no_sources'; end if;
  foreach v_role in array array['site_supervisor','supervision_supervisor','storekeeper'] loop
    if coalesce(p_signers ->> v_role, '') = '' then raise exception 'signers_required'; end if;
  end loop;
  select 'REQ-' || lpad((coalesce(max(nullif(regexp_replace(number, '\D', '', 'g'), '')::int), 0) + 1)::text, 3, '0') into v_no from mtl_requisitions where master_project_id = p_project;
  insert into mtl_requisitions (master_project_id, number, requester_id, facility, front, purpose, needed_by, notes) values (p_project, v_no, auth.uid(), coalesce(p_facility, ''), coalesce(p_front, ''), coalesce(p_purpose, ''), p_needed, coalesce(p_notes, '')) returning id into v_id;
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

-- Each signer signs only their own slot and only after the previous slots approved. The storekeeper's approval is the exit permit: p_issue = [{"line_id": uuid, "qty": n}] posts the issue transactions.
create or replace function mtl_req_sign(p_req uuid, p_decision text, p_note text default '', p_issue jsonb default null) returns text language plpgsql security definer set search_path to 'public' as $f$
declare r mtl_requisitions; sg mtl_requisition_signers; v_img text; it jsonb; ln mtl_requisition_lines; v_qty numeric;
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
    for it in select * from jsonb_array_elements(p_issue) loop
      select * into ln from mtl_requisition_lines where id = (it ->> 'line_id')::uuid and requisition_id = p_req;
      if ln.id is null then raise exception 'not_found'; end if;
      v_qty := coalesce((it ->> 'qty')::numeric, 0);
      if v_qty > ln.qty_requested then raise exception 'qty_exceeds_item'; end if;
      if v_qty > 0 then
        perform mtl_post_txn(ln.material_id, 'issue', v_qty, current_date, '', '', r.facility, r.front, null, '', null, '', null, r.number, 'خروج کالا بر اساس مجوز ' || r.number, null);
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

create or replace function mtl_req_cancel(p_req uuid, p_reason text) returns void language plpgsql security definer set search_path to 'public' as $f$
declare r mtl_requisitions;
begin
  select * into r from mtl_requisitions where id = p_req;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status <> 'awaiting_signatures' then raise exception 'not_pending'; end if;
  if not (is_admin_user() or r.requester_id = auth.uid()) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  update mtl_requisitions set status = 'cancelled', reject_reason = btrim(p_reason) where id = p_req;
end $f$;
