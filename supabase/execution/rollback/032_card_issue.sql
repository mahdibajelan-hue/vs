update ex_welders set card_status = 'confirmed' where card_status = 'issued';
alter table ex_welders drop constraint if exists ex_welders_card_status_check;
alter table ex_welders add constraint ex_welders_card_status_check check (card_status in ('draft','confirmed'));
drop index if exists ex_welders_card_no_uq;
alter table ex_welders drop column if exists card_no, drop column if exists card_issued_at, drop column if exists card_issued_by;
-- ex_welder_lock() returns to the definition of 031_personnel_cards.sql
