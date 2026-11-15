-- rollback of stagegate 008 (lifecycle model of the company, 10 stages). Run by hand in the SQL editor.
-- Restores the nine-stage model and the renumbered project rows from the copies 008 made (sg_bak_1408_*).
-- Rows created after 008 in the restored tables (new items, decisions, history of G10…) are removed with them.
begin;
delete from sg_project_phase_items;            insert into sg_project_phase_items select * from sg_bak_1408_project_items;
delete from sg_lifecycle_gate_decisions;       insert into sg_lifecycle_gate_decisions select * from sg_bak_1408_decisions;
delete from sg_lifecycle_progress_history;     insert into sg_lifecycle_progress_history select * from sg_bak_1408_history;
delete from sg_lifecycle_schedule_items;       insert into sg_lifecycle_schedule_items select * from sg_bak_1408_schedule;
delete from sg_project_lifecycle_phases;       insert into sg_project_lifecycle_phases select * from sg_bak_1408_project_phases;
delete from sg_lifecycle_strategy_phase_dependencies; insert into sg_lifecycle_strategy_phase_dependencies select * from sg_bak_1408_deps;
delete from sg_lifecycle_phase_durations;      insert into sg_lifecycle_phase_durations select * from sg_bak_1408_durations;
delete from sg_lifecycle_objectives;           insert into sg_lifecycle_objectives select * from sg_bak_1408_objectives;
delete from sg_lifecycle_outputs;              insert into sg_lifecycle_outputs select * from sg_bak_1408_outputs;
delete from sg_lifecycle_criteria;             insert into sg_lifecycle_criteria select * from sg_bak_1408_criteria;
update sg_lifecycle_audit_log set phase_code = 'G' || (substring(phase_code from 2)::int - 1) where phase_code ~ '^G([4-9]|10)$';
update sg_lifecycle_phases p set sort_order = b.sort_order, phase_group = b.phase_group, title = b.title, responsible = b.responsible, gate_name = b.gate_name, gate_threshold_pct = b.gate_threshold_pct, progress_engine = b.progress_engine, icon_key = b.icon_key, is_active = b.is_active from sg_bak_1408_phases b where p.code = b.code;
delete from sg_lifecycle_phases where code = 'G10';
select setval(pg_get_serial_sequence('sg_project_phase_items', 'id'), (select max(id) from sg_project_phase_items));
commit;
-- then the copies can go: drop table sg_bak_1408_phases, sg_bak_1408_objectives, sg_bak_1408_outputs, sg_bak_1408_criteria, sg_bak_1408_durations, sg_bak_1408_deps, sg_bak_1408_project_phases, sg_bak_1408_project_items, sg_bak_1408_decisions, sg_bak_1408_history, sg_bak_1408_schedule;
