-- Rollback of 066 — run by hand only.
drop trigger if exists trg_ex_pipe_entry_refresh on ex_report_lines;
drop function if exists ex_pipe_entry_refresh_trg();
