drop trigger if exists trg_ex_welder_lock on ex_welders; drop trigger if exists trg_ex_welder_qual_lock on ex_welder_quals;
drop function if exists ex_welder_lock(); drop function if exists ex_welder_qual_lock();
alter table ex_welders drop column if exists kind, drop column if exists photo, drop column if exists card, drop column if exists card_status, drop column if exists card_confirmed_by, drop column if exists card_confirmed_at;
alter table ex_welder_quals drop column if exists wqt, drop column if exists wqt_status, drop column if exists wqt_confirmed_by, drop column if exists wqt_confirmed_at;
