drop trigger if exists trg_ex_sign_inval_reports on ex_reports;
drop trigger if exists trg_ex_sign_inval_lines on ex_report_lines;
drop function if exists ex_sign_invalidate_trg(), ex_report_unsign(uuid, text), ex_report_sign(uuid, text);
drop table if exists ex_report_signatures;
drop table if exists ex_sign_slots;
