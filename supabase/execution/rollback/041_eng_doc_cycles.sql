-- Rollback of 041_eng_doc_cycles.sql (run by hand). The documents keep the status, revision and dates the cycle last
-- gave them; only the history of submissions and results is removed. Re-run my_engineering_notifications() from
-- 038 / 014 if the old notification texts are wanted back.
drop trigger if exists ex_eng_doc_cycles_sync on ex_eng_doc_cycles;
drop function if exists ex_eng_cycle_sync();
drop function if exists ex_doc_submit(uuid, text, text, date);
drop function if exists ex_doc_review(uuid, text, date);
drop function if exists ex_doc_undo(uuid);
drop table if exists ex_eng_doc_cycles;
