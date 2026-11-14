-- Run by hand only. Removes the assistant's learning record and the columns of 006; then re-run the wq_evaluate of
-- 002_evaluate_needs_film.sql and the wq_sign of 001_weldqc.sql to restore the earlier functions.
begin;
drop table if exists wq_ai_samples;
alter table wq_evaluations drop column if exists evaluated_by, drop column if exists same_person;
commit;
