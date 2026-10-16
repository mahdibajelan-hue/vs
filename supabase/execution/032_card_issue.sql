-- Issuing the personnel card: draft → confirmed (reviewer) → issued (reviewer, gets a card number). An issued card is locked like a confirmed one.
alter table ex_welders drop constraint if exists ex_welders_card_status_check;
alter table ex_welders add constraint ex_welders_card_status_check check (card_status in ('draft','confirmed','issued'));
alter table ex_welders add column if not exists card_no text not null default '';
alter table ex_welders add column if not exists card_issued_at timestamptz;
alter table ex_welders add column if not exists card_issued_by uuid;
create unique index if not exists ex_welders_card_no_uq on ex_welders (project_id, card_no) where card_no <> '';
create or replace function ex_welder_lock() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  if new.card_status is distinct from old.card_status then
    if not (ex_allows(new.project_id, 'review') or ex_can_configure(new.project_id)) then raise exception 'not_allowed' using errcode = '42501'; end if;
    if old.card_status = 'draft' and new.card_status = 'issued' then raise exception 'confirm_first'; end if;
    if new.card_status = 'confirmed' and old.card_status = 'draft' then
      if coalesce(btrim(new.card->>'name'), '') = '' then raise exception 'card_incomplete'; end if;
      new.card_confirmed_by := auth.uid(); new.card_confirmed_at := now();
    elsif new.card_status = 'issued' then
      if new.card_no = '' then
        new.card_no := case new.kind when 'welder' then 'WLD-' else 'CTR-' end || lpad((select count(*) + 1 from ex_welders x where x.project_id = new.project_id and x.kind = new.kind and x.card_no <> '')::text, 4, '0');
      end if;
      new.card_issued_at := now(); new.card_issued_by := auth.uid();
    elsif new.card_status = 'draft' then
      new.card_confirmed_by := null; new.card_confirmed_at := null; new.card_issued_at := null; new.card_issued_by := null;
    end if;
  elsif old.card_status <> 'draft' and (new.card is distinct from old.card or new.photo is distinct from old.photo or new.kind is distinct from old.kind or new.card_no is distinct from old.card_no) then
    raise exception 'confirmed_locked';
  end if;
  return new;
end $f$;
