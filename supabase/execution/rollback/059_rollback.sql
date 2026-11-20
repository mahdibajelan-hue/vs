-- Rollback of 059_one_report_per_day.sql — run by hand only.
drop trigger if exists trg_ex_one_per_day on ex_reports;
drop function if exists ex_one_per_day_trg();
