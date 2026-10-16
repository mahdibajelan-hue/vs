-- Qualification of welders / coating applicators now lives in the Competency module; the pipe-entry form in the Material module (as an MRS = warehouse receipt).
-- The Execution module only READS both per project. The data stays in ex_welders / ex_welder_quals / ex_pipes (renaming would break the functions that use them).
create or replace function ex_can_register_personnel(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select ex_can_register(p_project) or comp_is_module_admin()
$f$;
create or replace function ex_can_register_pipes(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select ex_can_register(p_project) or mtl_allows(p_project, 'post_txn')
$f$;
revoke all on function ex_can_register_personnel(uuid) from public; grant execute on function ex_can_register_personnel(uuid) to authenticated;
revoke all on function ex_can_register_pipes(uuid) from public; grant execute on function ex_can_register_pipes(uuid) to authenticated;
-- anybody working on the project in one of the three modules may read the registers
create or replace function ex_can_view(p_project uuid) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select is_admin_user() or comp_is_module_admin()
    or exists (select 1 from ex_project_roles r where r.project_id = p_project and r.user_id = auth.uid() and r.active)
    or exists (select 1 from mtl_project_roles r where r.project_id = p_project and r.user_id = auth.uid() and r.active)
$f$;
-- (a policy cannot be altered in place: they are re-created with the new helpers)
do $$ begin
  execute 'drop policy if exists ex_welders_ins on ex_welders'; execute 'drop policy if exists ex_welders_upd on ex_welders';
  execute 'drop policy if exists ex_welder_quals_ins on ex_welder_quals'; execute 'drop policy if exists ex_welder_quals_upd on ex_welder_quals';
  execute 'drop policy if exists ex_pipes_ins on ex_pipes'; execute 'drop policy if exists ex_pipes_upd on ex_pipes';
end $$;
create policy ex_welders_ins on ex_welders for insert to authenticated with check (ex_can_register_personnel(project_id));
create policy ex_welders_upd on ex_welders for update to authenticated using (ex_can_register_personnel(project_id)) with check (ex_can_register_personnel(project_id));
create policy ex_welder_quals_ins on ex_welder_quals for insert to authenticated with check (ex_can_register_personnel(project_id));
create policy ex_welder_quals_upd on ex_welder_quals for update to authenticated using (ex_can_register_personnel(project_id)) with check (ex_can_register_personnel(project_id));
create policy ex_pipes_ins on ex_pipes for insert to authenticated with check (ex_can_register_pipes(project_id));
create policy ex_pipes_upd on ex_pipes for update to authenticated using (ex_can_register_pipes(project_id)) with check (ex_can_register_pipes(project_id));

-- signing: when no signer is chosen for a slot, a reviewer or a competency module admin may sign it; reopening likewise
create or replace function ex_person_signer_ok(p_project uuid, p_key text) returns boolean language plpgsql stable security definer set search_path to 'public' as $f$
declare v uuid;
begin
  select nullif(values_json->'personnelSigners'->>p_key, '')::uuid into v from ex_settings where project_id = p_project;
  if v is not null then return v = auth.uid(); end if;
  return ex_allows(p_project, 'review') or ex_can_configure(p_project) or comp_is_module_admin();
end $f$;
create or replace function ex_person_reopen(p_entity text, p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare proj uuid;
begin
  if p_entity = 'wqt' then select project_id into proj from ex_welder_quals where id = p_id;
  elsif p_entity = 'card' then select project_id into proj from ex_welders where id = p_id;
  else raise exception 'bad_entity'; end if;
  if proj is null then raise exception 'not_found'; end if;
  if not (ex_allows(proj, 'review') or ex_can_configure(proj) or comp_is_module_admin()) then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform set_config('ex.sign_rpc', '1', true);
  if p_entity = 'wqt' then update ex_welder_quals set wqt_sign_a = null, wqt_sign_b = null, wqt_status = 'draft' where id = p_id;
  else update ex_welders set card_sign_a = null, card_sign_b = null, card_status = 'draft' where id = p_id; end if;
  perform set_config('ex.sign_rpc', '', true);
end $f$;

-- what the caller may do on this project's personnel register, and who the chosen signers are
create or replace function ex_personnel_caps(p_project uuid) returns jsonb language sql stable security definer set search_path to 'public' as $f$
  select jsonb_build_object('me', auth.uid(), 'admin', comp_is_module_admin(), 'register', ex_can_register_personnel(p_project),
    'review', (ex_allows(p_project, 'review') or ex_can_configure(p_project) or comp_is_module_admin()),
    'signers', coalesce((select values_json->'personnelSigners' from ex_settings where project_id = p_project), '{}'::jsonb))
$f$;
revoke all on function ex_personnel_caps(uuid) from public; grant execute on function ex_personnel_caps(uuid) to authenticated;
create or replace function ex_personnel_set_signers(p_project uuid, p_signers jsonb) returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if not (comp_is_module_admin() or ex_can_configure(p_project)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into ex_settings (project_id, values_json) values (p_project, jsonb_build_object('personnelSigners', coalesce(p_signers, '{}'::jsonb)))
  on conflict (project_id) do update set values_json = jsonb_set(ex_settings.values_json, '{personnelSigners}', coalesce(p_signers, '{}'::jsonb), true), updated_at = now();
end $f$;
revoke all on function ex_personnel_set_signers(uuid, jsonb) from public; grant execute on function ex_personnel_set_signers(uuid, jsonb) to authenticated;

-- pipes arrive with a warehouse receipt (MRS): the pipe rows point at it
alter table ex_pipes add column if not exists receipt_id uuid;
-- p_rows: [{raw, heatNo, odIn, wtIn, lengthM, grade, supplier, wayBill, materialId}] — creates MRS-#### (mtl_warehouse_receipts) and registers the pipes; duplicates are skipped and returned
create or replace function mtl_pipe_receive(p_project uuid, p_date date, p_rows jsonb, p_note text default '') returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare r jsonb; k text; ids uuid[] := '{}'; skipped text[] := '{}'; pid uuid; rid uuid; rno text; m record; n int;
begin
  if not (mtl_allows(p_project, 'post_txn') or ex_can_register(p_project)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    k := ex_weld_n1(coalesce(r->>'raw', ''));
    if k = '' then continue; end if;
    if exists (select 1 from ex_pipes where project_id = p_project and pipe_key = k) then skipped := skipped || (r->>'raw'); continue; end if;
    insert into ex_pipes (project_id, pipe_key, pipe_raw, entry_date, heat_no, od_in, wt_in, length_m, grade, supplier, way_bill, material_id)
    values (p_project, k, btrim(r->>'raw'), p_date, coalesce(r->>'heatNo', ''), nullif(r->>'odIn', '')::numeric, nullif(r->>'wtIn', '')::numeric, nullif(r->>'lengthM', '')::numeric, coalesce(r->>'grade', ''), coalesce(r->>'supplier', ''), coalesce(r->>'wayBill', ''), nullif(r->>'materialId', '')::uuid)
    returning id into pid;
    ids := ids || pid;
  end loop;
  n := coalesce(array_length(ids, 1), 0);
  if n = 0 then return jsonb_build_object('added', 0, 'skipped', to_jsonb(skipped)); end if;
  select 'MRS-' || lpad((count(*) + 1)::text, 4, '0') into rno from mtl_warehouse_receipts where master_project_id = p_project and receipt_number like 'MRS-%';
  insert into mtl_warehouse_receipts (master_project_id, receipt_number, receipt_date, notes) values (p_project, rno, p_date, btrim(coalesce(p_note, '') || ' — ورود لوله به کارگاه (' || n || ' شاخه)')) returning id into rid;
  update ex_pipes set receipt_id = rid where id = any(ids);
  -- lines only for pipes tied to a material item; the quantity follows the item's unit (metres → total length, otherwise the number of joints); inspection stays pending
  for m in select p.material_id, count(*) as cnt, coalesce(sum(p.length_m), 0) as len, lower(coalesce(max(x.unit), '')) as unit from ex_pipes p join mtl_materials x on x.id = p.material_id where p.id = any(ids) group by p.material_id loop
    insert into mtl_warehouse_lines (receipt_id, material_id, quantity_received, condition, inspection_status) values (rid, m.material_id, case when m.unit in ('m', 'meter', 'متر') then m.len else m.cnt end, 'ok', 'pending');
  end loop;
  return jsonb_build_object('added', n, 'skipped', to_jsonb(skipped), 'receipt_id', rid, 'receipt_number', rno);
end $f$;
revoke all on function mtl_pipe_receive(uuid, date, jsonb, text) from public; grant execute on function mtl_pipe_receive(uuid, date, jsonb, text) to authenticated;
