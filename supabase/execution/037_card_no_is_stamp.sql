-- One code per welder / coater: the card number IS the stamp the person is known by in the forms (welder_raw). No second auto-generated «WLD-0001».
create or replace function ex_welder_lock() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare via_rpc boolean := coalesce(current_setting('ex.sign_rpc', true), '') = '1';
begin
  if (new.card_status is distinct from old.card_status or new.card_sign_a is distinct from old.card_sign_a or new.card_sign_b is distinct from old.card_sign_b) and not via_rpc then raise exception 'use_rpc'; end if;
  if new.card_status is distinct from old.card_status then
    if new.card_status = 'issued' then
      new.card_no := new.welder_raw;
      new.card_confirmed_by := auth.uid(); new.card_confirmed_at := now(); new.card_issued_at := now(); new.card_issued_by := auth.uid();
    elsif new.card_status = 'draft' then
      new.card_confirmed_by := null; new.card_confirmed_at := null; new.card_issued_at := null; new.card_issued_by := null;
    end if;
  elsif old.card_status <> 'draft' and (new.card is distinct from old.card or new.photo is distinct from old.photo or new.kind is distinct from old.kind or new.card_no is distinct from old.card_no or new.national_id is distinct from old.national_id or new.full_name is distinct from old.full_name) then
    raise exception 'confirmed_locked';
  end if;
  return new;
end $f$;
