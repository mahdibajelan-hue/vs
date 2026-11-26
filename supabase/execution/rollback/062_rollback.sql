-- Rollback of 062_final_approval_lock.sql — run by hand only.
drop trigger if exists trg_ex_final_lock_report on ex_reports;
drop trigger if exists trg_ex_final_lock_lines on ex_report_lines;
drop trigger if exists trg_ex_final_lock_sigs on ex_report_signatures;
drop function if exists ex_final_lock_report_trg();
drop function if exists ex_final_lock_child_trg();
drop function if exists ex_final_signed(uuid);
