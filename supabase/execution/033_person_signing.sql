-- Welder test (WQT) and welder card are signed in the app: the test by the weld inspector and the weld-defect interpreter, the card by the site head and the supervision head.
-- The people are chosen per project in ex_settings.values_json.personnelSigners {weld_inspector, defect_interpreter, site_head, supervision_head}; where one is not chosen, a reviewer (review/configure) may sign that slot.
-- The signature image is COPIED from the signer's user_signatures at signing time. Both signatures complete the test (confirmed) / issue the card (card number). Reopening clears the signatures.
alter table ex_welder_quals add column if not exists wqt_sign_a jsonb;
alter table ex_welder_quals add column if not exists wqt_sign_b jsonb;
alter table ex_welders add column if not exists card_sign_a jsonb;
alter table ex_welders add column if not exists card_sign_b jsonb;

create or replace function ex_person_signer_ok(p_project uuid, p_key text) returns boolean language plpgsql stable security definer set search_path to 'public' as $f$
declare v uuid;
begin
  select nullif(values_json->'personnelSigners'->>p_key, '')::uuid into v from ex_settings where project_id = p_project;
  if v is not null then return v = auth.uid(); end if;
  return ex_allows(p_project, 'review') or ex_can_configure(p_project);
end $f$;

create or replace function ex_welder_lock() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare via_rpc boolean := coalesce(current_setting('ex.sign_rpc', true), '') = '1';
begin
  if (new.card_status is distinct from old.card_status or new.card_sign_a is distinct from old.card_sign_a or new.card_sign_b is distinct from old.card_sign_b) and not via_rpc then raise exception 'use_rpc'; end if;
  if new.card_status is distinct from old.card_status then
    if new.card_status = 'issued' then
      if new.card_no = '' then
        new.card_no := case new.kind when 'welder' then 'WLD-' else 'CTR-' end || lpad((select count(*) + 1 from ex_welders x where x.project_id = new.project_id and x.kind = new.kind and x.card_no <> '')::text, 4, '0');
      end if;
      new.card_confirmed_by := auth.uid(); new.card_confirmed_at := now(); new.card_issued_at := now(); new.card_issued_by := auth.uid();
    elsif new.card_status = 'draft' then
      new.card_confirmed_by := null; new.card_confirmed_at := null; new.card_issued_at := null; new.card_issued_by := null;
    end if;
  elsif old.card_status <> 'draft' and (new.card is distinct from old.card or new.photo is distinct from old.photo or new.kind is distinct from old.kind or new.card_no is distinct from old.card_no or new.national_id is distinct from old.national_id or new.full_name is distinct from old.full_name) then
    raise exception 'confirmed_locked';
  end if;
  return new;
end $f$;

create or replace function ex_welder_qual_lock() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare via_rpc boolean := coalesce(current_setting('ex.sign_rpc', true), '') = '1';
begin
  if (new.wqt_status is distinct from old.wqt_status or new.wqt_sign_a is distinct from old.wqt_sign_a or new.wqt_sign_b is distinct from old.wqt_sign_b) and not via_rpc then raise exception 'use_rpc'; end if;
  if new.wqt_status is distinct from old.wqt_status then
    if new.wqt_status = 'confirmed' then new.wqt_confirmed_by := auth.uid(); new.wqt_confirmed_at := now(); else new.wqt_confirmed_by := null; new.wqt_confirmed_at := null; end if;
  elsif old.wqt_status = 'confirmed' and (new.wqt is distinct from old.wqt or new.thk_min is distinct from old.thk_min or new.thk_max is distinct from old.thk_max or new.dia_min is distinct from old.dia_min or new.dia_max is distinct from old.dia_max or new.issue_date is distinct from old.issue_date or new.expiry_date is distinct from old.expiry_date or new.wqt_no is distinct from old.wqt_no) then
    raise exception 'confirmed_locked';
  end if;
  return new;
end $f$;

-- p_entity 'wqt' (p_id = ex_welder_quals.id; slots 'a' weld inspector, 'b' defect interpreter) or 'card' (p_id = ex_welders.id; slots 'a' site head, 'b' supervision head)
create or replace function ex_person_sign(p_entity text, p_id uuid, p_slot text) returns jsonb language plpgsql security definer set search_path to 'public' as $f$
declare q ex_welder_quals%rowtype; w ex_welders%rowtype; proj uuid; skey text; img text; nm text; sig jsonb; other jsonb;
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_slot not in ('a','b') then raise exception 'bad_slot'; end if;
  if p_entity = 'wqt' then
    select * into q from ex_welder_quals where id = p_id; if q.id is null then raise exception 'not_found'; end if;
    proj := q.project_id; skey := case p_slot when 'a' then 'weld_inspector' else 'defect_interpreter' end;
    if q.wqt_status <> 'draft' then raise exception 'bad_state'; end if;
    if coalesce(btrim(q.wqt->>'welderName'), '') = '' or coalesce(btrim(q.wqt->>'wqtNo'), '') = '' or coalesce(btrim(q.wqt->>'testDate'), '') = '' or coalesce(q.wqt->>'qualified', '') = '' then raise exception 'wqt_incomplete'; end if;
    if (case p_slot when 'a' then q.wqt_sign_a else q.wqt_sign_b end) is not null then raise exception 'already_signed'; end if;
  elsif p_entity = 'card' then
    select * into w from ex_welders where id = p_id; if w.id is null then raise exception 'not_found'; end if;
    proj := w.project_id; skey := case p_slot when 'a' then 'site_head' else 'supervision_head' end;
    if w.card_status <> 'draft' then raise exception 'bad_state'; end if;
    if coalesce(btrim(w.full_name), '') = '' or coalesce(btrim(w.national_id), '') = '' then raise exception 'card_incomplete'; end if;
    if w.kind = 'welder' and not exists (select 1 from ex_welder_quals x where x.welder_id = w.id and x.wqt_status = 'confirmed' and x.wqt->>'qualified' = 'YES' and x.status = 'valid') then raise exception 'no_qualifying_test'; end if;
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

create or replace function ex_person_reopen(p_entity text, p_id uuid) returns void language plpgsql security definer set search_path to 'public' as $f$
declare proj uuid;
begin
  if p_entity = 'wqt' then select project_id into proj from ex_welder_quals where id = p_id;
  elsif p_entity = 'card' then select project_id into proj from ex_welders where id = p_id;
  else raise exception 'bad_entity'; end if;
  if proj is null then raise exception 'not_found'; end if;
  if not (ex_allows(proj, 'review') or ex_can_configure(proj)) then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform set_config('ex.sign_rpc', '1', true);
  if p_entity = 'wqt' then update ex_welder_quals set wqt_sign_a = null, wqt_sign_b = null, wqt_status = 'draft' where id = p_id;
  else update ex_welders set card_sign_a = null, card_sign_b = null, card_status = 'draft' where id = p_id; end if;
  perform set_config('ex.sign_rpc', '', true);
end $f$;
revoke all on function ex_person_reopen(text, uuid) from public; grant execute on function ex_person_reopen(text, uuid) to authenticated;
