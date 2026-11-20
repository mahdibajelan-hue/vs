-- Stage-Gate (lifecycle) data of the Hamedan demo: the gate items, decisions, phases and phase schedule of the demo
-- project Kuhdasht–Sarakhs (also in execution, gate G7) copied under the Hamedan project name, plus a client report
-- with Hamedan's own E/P/C figures. Insert-only; run once after demo_hamedan_cs.sql.
do $$
declare
  src text := (select name from sg_projects where master_project_id = '5aa1afc2-c569-4546-a07f-2ca4160c2e63');
  dst text := (select name from sg_projects where master_project_id = '5a0538d4-3e6a-5367-81fa-5158578db748');
  r record; new_id bigint;
begin
  if dst is null or src is null then raise exception 'project_missing'; end if;
  if exists (select 1 from sg_project_lifecycle_phases where project_name = dst) then return; end if;
  insert into sg_project_phase_items (project_name, phase_code, kind, item_id, status, owner, due_date, completion_date, evidence, comment, submitted_by, verified_by, verification_date, updated_by, evidence_file_url)
    select dst, phase_code, kind, item_id, status, owner, due_date, completion_date, evidence, comment, submitted_by, verified_by, verification_date, updated_by, evidence_file_url from sg_project_phase_items where project_name = src;
  insert into sg_lifecycle_gate_decisions (project_name, phase_code, decision, reason, condition_text, condition_owner, condition_due_date, decided_by, decided_at)
    select dst, phase_code, decision, reason, condition_text, condition_owner, condition_due_date, decided_by, decided_at - interval '120 days' from sg_lifecycle_gate_decisions where project_name = src;
  insert into sg_project_lifecycle_phases (project_name, phase_code, weight_pct, planned_start, planned_finish, actual_start, actual_finish, contract_value, manual_actual_pct, gate_status, updated_by)
    select dst, phase_code, weight_pct, planned_start, planned_finish, actual_start, actual_finish, contract_value, manual_actual_pct, gate_status, updated_by from sg_project_lifecycle_phases where project_name = src;
  -- the phase schedule refers to its own parents: copy parents first and map the ids
  create temp table _sg_map (old_id bigint, new_id bigint) on commit drop;
  for r in select * from sg_lifecycle_schedule_items where project_name = src order by parent_id nulls first, id loop
    insert into sg_lifecycle_schedule_items (project_name, phase_code, parent_id, seq, title, planned_start, planned_finish, weight_pct, manual_actual_pct, updated_by)
      values (dst, r.phase_code, (select m.new_id from _sg_map m where m.old_id = r.parent_id), r.seq, r.title, r.planned_start, r.planned_finish, r.weight_pct, r.manual_actual_pct, r.updated_by)
      returning id into new_id;
    insert into _sg_map values (r.id, new_id);
  end loop;
  insert into sg_client_reports (project_name, contract_type, contractor_name, consultant_name, contract_end_date, progress_planned, progress_physical, progress_engineering, progress_procurement, progress_construction,
                                 forecast_completion_date, progress_engineering_planned, progress_procurement_planned, progress_construction_planned, progress_engineering_weight, progress_procurement_weight, progress_construction_weight)
    values (dst, 'EPC', 'مشارکت پیمانکاری نمونهٔ گاما', 'مهندسین مشاور نمونهٔ دلتا', '2028-03-19', 75.8, 54.4, 83.7, 64.8, 25.1, '2028-11-15', 93.7, 84.8, 51.7, 4.5, 67.2, 28.3);
end $$;
