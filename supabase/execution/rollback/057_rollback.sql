-- Rollback of 057_pipe_entry_register.sql — run by hand only. Pipes already registered stay in ex_pipes.
drop trigger if exists trg_ex_pipe_entry_line on ex_report_lines;
drop trigger if exists trg_ex_pipe_entry_sent on ex_reports;
drop function if exists ex_pipe_entry_line_trg();
drop function if exists ex_pipe_entry_sent_trg();
drop function if exists ex_register_entry_pipes(uuid);
drop function if exists ex_num(text);
