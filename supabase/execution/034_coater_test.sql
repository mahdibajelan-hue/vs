-- Coating applicators take a test too (the field-joint coating test sheet): its two signers are coat_supervisor and coat_contractor; a card of any kind needs a confirmed test with qualified = YES.
create or replace function ex_person_sign(p_entity text, p_id uuid, p_slot text) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare q ex_welder_quals%rowtype; w ex_welders%rowtype; proj uuid; skey text; img text; nm text; sig jsonb; other jsonb; k text;
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_slot not in ('a','b') then raise exception 'bad_slot'; end if;
  if p_entity = 'wqt' then
    select * into q from ex_welder_quals where id = p_id; if q.id is null then raise exception 'not_found'; end if;
    proj := q.project_id; select kind into k from ex_welders where id = q.welder_id;
    skey := case when k = 'coater' then (case p_slot when 'a' then 'coat_supervisor' else 'coat_contractor' end) else (case p_slot when 'a' then 'weld_inspector' else 'defect_interpreter' end) end;
    if q.wqt_status <> 'draft' then raise exception 'bad_state'; end if;
    if coalesce(btrim(q.wqt->>'welderName'), '') = '' or coalesce(btrim(q.wqt->>'wqtNo'), '') = '' or coalesce(btrim(q.wqt->>'testDate'), '') = '' or coalesce(q.wqt->>'qualified', '') = '' then raise exception 'wqt_incomplete'; end if;
    if (case p_slot when 'a' then q.wqt_sign_a else q.wqt_sign_b end) is not null then raise exception 'already_signed'; end if;
  elsif p_entity = 'card' then
    select * into w from ex_welders where id = p_id; if w.id is null then raise exception 'not_found'; end if;
    proj := w.project_id; skey := case p_slot when 'a' then 'site_head' else 'supervision_head' end;
    if w.card_status <> 'draft' then raise exception 'bad_state'; end if;
    if coalesce(btrim(w.full_name), '') = '' or coalesce(btrim(w.national_id), '') = '' then raise exception 'card_incomplete'; end if;
    if not exists (select 1 from ex_welder_quals x where x.welder_id = w.id and x.wqt_status = 'confirmed' and x.wqt->>'qualified' = 'YES' and x.status = 'valid') then raise exception 'no_qualifying_test'; end if;
    if (case p_slot when 'a' then w.card_sign_a else w.card_sign_b end) is not null then raise exception 'already_signed'; end if;
  else raise exception 'bad_entity'; end if;
  if not ex_person_signer_ok(proj, skey) then raise exception 'not_assignee' using errcode = '42501'; end if;
  select image into img from user_signatures where user_id = auth.uid();
  if img is null then raise exception 'signature_required'; end if;
  select coalesce(full_name, '') into nm from profiles where id = auth.uid();
  sig := jsonb_build_object('user', auth.uid(), 'name', coalesce(nm, ''), 'image', img, 'at', now());
  perform set_config('ex.sign_rpc', '1', true);
  if p_entity = 'wqt' then
    if p_slot = 'a' then update ex_welder_quals set wqt_sign_a = sig where id = p_id; else update ex_welder_quals set wqt_sign_b = sig where id = p_id; end if;
    select case p_slot when 'a' then wqt_sign_b else wqt_sign_a end into other from ex_welder_quals where id = p_id;
    if other is not null then update ex_welder_quals set wqt_status = 'confirmed' where id = p_id; end if;
  else
    if p_slot = 'a' then update ex_welders set card_sign_a = sig where id = p_id; else update ex_welders set card_sign_b = sig where id = p_id; end if;
    select case p_slot when 'a' then card_sign_b else card_sign_a end into other from ex_welders where id = p_id;
    if other is not null then update ex_welders set card_status = 'issued' where id = p_id; end if;
  end if;
  perform set_config('ex.sign_rpc', '', true);
  return jsonb_build_object('ok', true, 'complete', other is not null);
end $f$;
revoke all on function ex_person_sign(text, uuid, text) from public; grant execute on function ex_person_sign(text, uuid, text) to authenticated;
