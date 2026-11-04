-- rollback of 002 (run by hand only)
drop table if exists sp_settings;
alter table sp_welds drop column if exists coat_type;
alter table sp_welds drop column if exists coat_date;
alter table sp_welds drop column if exists blast_date;
alter table sp_welds drop column if exists buried;
