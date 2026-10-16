-- Personnel cards: a welder or a field-joint coating applicator is introduced with the data of the approved card sheet (+ photo); a welder's qualification test (WQT) is kept per qualification.
-- A card / WQT is confirmed by a reviewer (review or configure); a confirmed one is locked until it is reopened (reopening is logged by the register history).
alter table ex_welders add column if not exists kind text not null default 'welder';
alter table ex_welders add constraint ex_welders_kind_check check (kind in ('welder','coater'));
alter table ex_welders add column if not exists photo text not null default '';
alter table ex_welders add column if not exists card jsonb not null default '{}'::jsonb;
alter table ex_welders add column if not exists card_status text not null default 'draft';
alter table ex_welders add constraint ex_welders_card_status_check check (card_status in ('draft','confirmed'));
alter table ex_welders add column if not exists card_confirmed_by uuid;
alter table ex_welders add column if not exists card_confirmed_at timestamptz;
alter table ex_welder_quals add column if not exists wqt jsonb not null default '{}'::jsonb;
alter table ex_welder_quals add column if not exists wqt_status text not null default 'draft';
alter table ex_welder_quals add constraint ex_welder_quals_wqt_status_check check (wqt_status in ('draft','confirmed'));
alter table ex_welder_quals add column if not exists wqt_confirmed_by uuid;
alter table ex_welder_quals add column if not exists wqt_confirmed_at timestamptz;

create or replace function ex_welder_lock() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.card_status is distinct from old.card_status then
    if not (ex_allows(new.project_id, 'review') or ex_can_configure(new.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if new.card_status = 'confirmed' then
      if coalesce(btrim(new.card->>'name'), '') = '' then raise exception 'card_incomplete'; end if;
      new.card_confirmed_by := auth.uid(); new.card_confirmed_at := now();
    else new.card_confirmed_by := null; new.card_confirmed_at := null; end if;
  elsif old.card_status = 'confirmed' and (new.card is distinct from old.card or new.photo is distinct from old.photo or new.kind is distinct from old.kind) then
    raise exception 'confirmed_locked';
  end if;
  return new;
end $f$;
create trigger trg_ex_welder_lock before update on ex_welders for each row execute function ex_welder_lock();

create or replace function ex_welder_qual_lock() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.wqt_status is distinct from old.wqt_status then
    if not (ex_allows(new.project_id, 'review') or ex_can_configure(new.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if new.wqt_status = 'confirmed' then new.wqt_confirmed_by := auth.uid(); new.wqt_confirmed_at := now(); else new.wqt_confirmed_by := null; new.wqt_confirmed_at := null; end if;
  elsif old.wqt_status = 'confirmed' and (new.wqt is distinct from old.wqt or new.thk_min is distinct from old.thk_min or new.thk_max is distinct from old.thk_max or new.dia_min is distinct from old.dia_min or new.dia_max is distinct from old.dia_max or new.issue_date is distinct from old.issue_date or new.expiry_date is distinct from old.expiry_date or new.wqt_no is distinct from old.wqt_no) then
    raise exception 'confirmed_locked';
  end if;
  return new;
end $f$;
create trigger trg_ex_welder_qual_lock before update on ex_welder_quals for each row execute function ex_welder_qual_lock();
