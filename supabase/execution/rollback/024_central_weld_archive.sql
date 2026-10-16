-- R-C: only while the new structures are empty. With data: rename to _retired_* and ask for approval (R-D).
drop function if exists ex_archive_report(uuid, text, text, text);
drop table if exists ex_report_archive;
drop function if exists ex_weld_central_backfill(uuid);
drop function if exists ex_weld_absorb(uuid);
drop function if exists ex_weld_set_attr(uuid, text, text, text, text, uuid);
drop function if exists ex_same_val(text, text);
drop table if exists ex_weld_attr_history;
alter table ex_welds drop column if exists c_pipe, drop column if exists c_size, drop column if exists c_thk, drop column if exists c_length, drop column if exists c_bend, drop column if exists c_updated_at, drop column if exists c_updated_by;
