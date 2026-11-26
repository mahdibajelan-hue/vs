-- Rollback of 061_signed_lock.sql — run by hand only. Removes the signed-draft lock; the two signature-invalidation
-- triggers keep their history line (harmless). To restore the previous unsign, re-run 027_signatures.sql's ex_report_unsign.
drop trigger if exists trg_ex_signed_lock_report on ex_reports;
drop trigger if exists trg_ex_signed_lock_lines on ex_report_lines;
drop trigger if exists trg_ex_signed_lock_res on ex_report_resources;
drop trigger if exists trg_ex_signed_lock_crew on ex_crew_logs;
drop trigger if exists trg_ex_signed_lock_stop on ex_report_stoppages;
drop function if exists ex_signed_lock_report_trg();
drop function if exists ex_signed_lock_child_trg();
