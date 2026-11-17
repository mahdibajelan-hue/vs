-- security 001 — every signed-in user could read (and on «ALL» policies also write) other projects' data in about 100
-- tables. Each table is now limited to the projects the user can access (rasta_user_can_access_master_project, gathered
-- once per query by my_projects()) and, for module-owned data, to users who have one of the modules that use it
-- (rasta_my_accessible_modules). Reference tables (units, templates, categories) stay readable by every signed-in user;
-- the Stage-Gate / PSSR reference tables can now only be changed by those allowed to configure the module.
-- Done with ALTER/CREATE POLICY only (nothing dropped).

create or replace function my_projects() returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select mp.id from master_projects mp where is_admin_user() or rasta_user_can_access_master_project(mp.id)
$f$;
create or replace function my_module_any(p_keys text[]) returns boolean language sql stable security definer set search_path to 'public' as $f$
  select auth.uid() is not null and (is_admin_user() or exists (select 1 from rasta_my_accessible_modules() m where m.module_key = any(p_keys)))
$f$;
create or replace function my_sg_projects() returns setof text language sql stable security definer set search_path to 'public' as $f$
  select s.name from sg_projects s where is_admin_user() or s.is_guide or s.master_project_id in (select my_projects())
$f$;
create or replace function my_panel_assessments() returns setof uuid language sql stable security definer set search_path to 'public' as $f$
  select p.assessment_id from comp_panelists p where p.user_id = auth.uid()
$f$;
revoke all on function my_projects() from public, anon; grant execute on function my_projects() to authenticated;
revoke all on function my_module_any(text[]) from public, anon; grant execute on function my_module_any(text[]) to authenticated;
revoke all on function my_sg_projects() from public, anon; grant execute on function my_sg_projects() to authenticated;
revoke all on function my_panel_assessments() from public, anon; grant execute on function my_panel_assessments() to authenticated;

alter policy ct_defects_auth on ct_defects using (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}')));
alter policy ct_records_auth on ct_records using (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}')));
alter policy ct_tests_sel on ct_tests using (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}')));
alter policy ht_events_auth on ht_events using (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}')));
alter policy ht_forms_sel on ht_forms using (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}')));
alter policy ht_packs_auth on ht_packs using (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}')));
alter policy ht_readings_auth on ht_readings using (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}')));
alter policy ht_sections_auth on ht_sections using (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}')));
alter policy ht_settings_auth on ht_settings using (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{testing,weldqc}')));
alter policy merged_select on fin_annual_budgets using (master_project_id in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select on fin_budget_changes using (master_project_id in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select on fin_budgets using (master_project_id in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select on fin_contracts using (master_project_id in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select on fin_cashflow_forecasts using ((select fin_contracts.master_project_id from fin_contracts where fin_contracts.id = fin_cashflow_forecasts.contract_id) in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select on fin_claims using ((select fin_contracts.master_project_id from fin_contracts where fin_contracts.id = fin_claims.contract_id) in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select on fin_contract_amendments using ((select fin_contracts.master_project_id from fin_contracts where fin_contracts.id = fin_contract_amendments.contract_id) in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select on fin_guarantees using ((select fin_contracts.master_project_id from fin_contracts where fin_contracts.id = fin_guarantees.contract_id) in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select_public on fin_payment_certificates using ((select fin_contracts.master_project_id from fin_contracts where fin_contracts.id = fin_payment_certificates.contract_id) in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select on fin_retention_releases using ((select fin_contracts.master_project_id from fin_contracts where fin_contracts.id = fin_retention_releases.contract_id) in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select_public on fin_payments using ((select k.master_project_id from fin_payment_certificates c join fin_contracts k on k.id = c.contract_id where c.id = fin_payments.certificate_id) in (select my_projects()) and (select my_module_any('{finance,statements,executive}')));
alter policy merged_select_public on mtl_allocations using (master_project_id in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_materials using (master_project_id in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_mto_revisions using (master_project_id in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_procurement_requests using (master_project_id in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_purchase_orders using (master_project_id in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_release_notes using (master_project_id in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_shipments using (master_project_id in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_warehouse_receipts using (master_project_id in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_manufacturing using ((select p.master_project_id from mtl_po_lines l join mtl_purchase_orders p on p.id = l.po_id where l.id = mtl_manufacturing.po_line_id) in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_po_lines using ((select mtl_purchase_orders.master_project_id from mtl_purchase_orders where mtl_purchase_orders.id = mtl_po_lines.po_id) in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_procurement_lines using ((select mtl_procurement_requests.master_project_id from mtl_procurement_requests where mtl_procurement_requests.id = mtl_procurement_lines.request_id) in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_release_lines using ((select mtl_release_notes.master_project_id from mtl_release_notes where mtl_release_notes.id = mtl_release_lines.release_id) in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_shipment_lines using ((select mtl_shipments.master_project_id from mtl_shipments where mtl_shipments.id = mtl_shipment_lines.shipment_id) in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy merged_select_public on mtl_warehouse_lines using ((select mtl_warehouse_receipts.master_project_id from mtl_warehouse_receipts where mtl_warehouse_receipts.id = mtl_warehouse_lines.receipt_id) in (select my_projects()) and (select my_module_any('{material,execution,statements}')));
alter policy pdt_assets_auth on pdt_assets using (master_project_id in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}')));
alter policy pdt_joint_events_auth on pdt_joint_events using (master_project_id in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}')));
alter policy pdt_joints_auth on pdt_joints using (master_project_id in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}')));
alter policy pdt_settings_auth on pdt_settings using (master_project_id in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}')));
alter policy pdt_asset_events_auth on pdt_asset_events using ((select pdt_assets.master_project_id from pdt_assets where pdt_assets.id = pdt_asset_events.asset_id) in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}'))) with check ((select pdt_assets.master_project_id from pdt_assets where pdt_assets.id = pdt_asset_events.asset_id) in (select my_projects()) and (select my_module_any('{pipelinedigitaltwin}')));
alter policy pssr_signers_auth on pssr_signers using (master_project_id in (select my_projects()) and (select my_module_any('{pssr}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{pssr}')));
alter policy pssr_systems_auth on pssr_systems using (master_project_id in (select my_projects()) and (select my_module_any('{pssr}'))) with check (master_project_id in (select my_projects()) and (select my_module_any('{pssr}')));
alter policy pssr_checks_auth on pssr_checks using ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_checks.system_id) in (select my_projects()) and (select my_module_any('{pssr}'))) with check ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_checks.system_id) in (select my_projects()) and (select my_module_any('{pssr}')));
alter policy pssr_gasin_permits_auth on pssr_gasin_permits using ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_gasin_permits.system_id) in (select my_projects()) and (select my_module_any('{pssr}'))) with check ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_gasin_permits.system_id) in (select my_projects()) and (select my_module_any('{pssr}')));
alter policy pssr_meetings_auth on pssr_meetings using ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_meetings.system_id) in (select my_projects()) and (select my_module_any('{pssr}'))) with check ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_meetings.system_id) in (select my_projects()) and (select my_module_any('{pssr}')));
alter policy pssr_punches_auth on pssr_punches using ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_punches.system_id) in (select my_projects()) and (select my_module_any('{pssr}'))) with check ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_punches.system_id) in (select my_projects()) and (select my_module_any('{pssr}')));
alter policy pssr_signoffs_auth on pssr_signoffs using ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_signoffs.system_id) in (select my_projects()) and (select my_module_any('{pssr}'))) with check ((select pssr_systems.master_project_id from pssr_systems where pssr_systems.id = pssr_signoffs.system_id) in (select my_projects()) and (select my_module_any('{pssr}')));
alter policy pssr_gasin_logs_auth on pssr_gasin_logs using ((select s.master_project_id from pssr_gasin_permits g join pssr_systems s on s.id = g.system_id where g.id = pssr_gasin_logs.permit_id) in (select my_projects()) and (select my_module_any('{pssr}'))) with check ((select s.master_project_id from pssr_gasin_permits g join pssr_systems s on s.id = g.system_id where g.id = pssr_gasin_logs.permit_id) in (select my_projects()) and (select my_module_any('{pssr}')));
alter policy sp_drawings_sel on sp_drawings using (master_project_id in (select my_projects()) and (select my_module_any('{stationpiping,execution}')));
alter policy sp_items_sel on sp_items using (master_project_id in (select my_projects()) and (select my_module_any('{stationpiping,execution}')));
alter policy sp_lines_sel on sp_lines using (master_project_id in (select my_projects()) and (select my_module_any('{stationpiping,execution}')));
alter policy sp_logs_sel on sp_logs using (master_project_id in (select my_projects()) and (select my_module_any('{stationpiping,execution}')));
alter policy sp_settings_sel on sp_settings using (master_project_id in (select my_projects()) and (select my_module_any('{stationpiping,execution}')));
alter policy sp_stations_sel on sp_stations using (master_project_id in (select my_projects()) and (select my_module_any('{stationpiping,execution}')));
alter policy sp_welds_sel on sp_welds using (master_project_id in (select my_projects()) and (select my_module_any('{stationpiping,execution}')));
alter policy merged_select on master_project_dependencies using (project_id in (select my_projects()));
alter policy merged_select on master_project_parties using (project_id in (select my_projects()));
alter policy merged_select on plc_activities using (project_id in (select my_projects()));
alter policy plc_activity_deps_all on plc_activity_deps using (project_id in (select my_projects())) with check (project_id in (select my_projects()));
alter policy plc_audit_select_authenticated on plc_audit_log using (project_id in (select my_projects()));
alter policy merged_select on plc_checklist_items using (project_id in (select my_projects()));
alter policy merged_select on plc_early_warnings using (project_id in (select my_projects()));
alter policy plc_gate_decisions_select on plc_gate_decisions using (project_id in (select my_projects()));
alter policy merged_select on plc_health_scores using (project_id in (select my_projects()));
alter policy merged_select on plc_milestones using (project_id in (select my_projects()));
alter policy plc_plan_baselines_select on plc_plan_baselines using (project_id in (select my_projects()));
alter policy plc_progress_log_select on plc_progress_log using (project_id in (select my_projects()));
alter policy merged_select on plc_project_gates using (project_id in (select my_projects()));
alter policy merged_select on plc_project_lifecycle using (project_id in (select my_projects()));
alter policy merged_select on plc_project_stages using (project_id in (select my_projects()));
alter policy plc_project_strategy_all on plc_project_strategy using (project_id in (select my_projects())) with check (project_id in (select my_projects()));
alter policy plc_schedule_versions_select on plc_schedule_versions using (project_id in (select my_projects()));
alter policy merged_select on project_phases using (project_id in (select my_projects()));
alter policy plc_ms_history_select_authenticated on plc_milestone_forecast_history using ((select plc_milestones.project_id from plc_milestones where plc_milestones.id = plc_milestone_forecast_history.milestone_id) in (select my_projects()));
alter policy merged_select on rasta_project_mappings using (is_admin_user() or master_project_id in (select my_projects()));
alter policy sg_client_reports_all on sg_client_reports using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_lifecycle_audit_log_all on sg_lifecycle_audit_log using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_lifecycle_gate_decisions_all on sg_lifecycle_gate_decisions using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_lifecycle_master_schedule_all on sg_lifecycle_master_schedule using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_lifecycle_master_schedule_versions_all on sg_lifecycle_master_schedule_versions using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_lifecycle_progress_history_all on sg_lifecycle_progress_history using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_lifecycle_schedule_baselines_all on sg_lifecycle_schedule_baselines using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_lifecycle_schedule_dependencies_all on sg_lifecycle_schedule_dependencies using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_lifecycle_schedule_items_all on sg_lifecycle_schedule_items using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_project_lifecycle_phases_all on sg_project_lifecycle_phases using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_project_phase_items_all on sg_project_phase_items using (project_name in (select my_sg_projects())) with check (project_name in (select my_sg_projects()));
alter policy sg_lifecycle_schedule_baseline_items_all on sg_lifecycle_schedule_baseline_items using ((select sg_lifecycle_schedule_baselines.project_name from sg_lifecycle_schedule_baselines where sg_lifecycle_schedule_baselines.id = sg_lifecycle_schedule_baseline_items.baseline_id) in (select my_sg_projects())) with check ((select sg_lifecycle_schedule_baselines.project_name from sg_lifecycle_schedule_baselines where sg_lifecycle_schedule_baselines.id = sg_lifecycle_schedule_baseline_items.baseline_id) in (select my_sg_projects()));
alter policy sg_projects_all on sg_projects using (is_admin_user() or is_guide or master_project_id in (select my_projects())) with check (is_admin_user() or is_guide or master_project_id in (select my_projects()));
alter policy tm_case_updates_all on tm_case_updates using (is_admin_user()) with check (is_admin_user());
alter policy tm_cases_all on tm_cases using (is_admin_user()) with check (is_admin_user());
alter policy tm_project_issues_all on tm_project_issues using (is_admin_user()) with check (is_admin_user());
alter policy tm_project_users_all on tm_project_users using (is_admin_user()) with check (is_admin_user());
alter policy tm_projects_all on tm_projects using (is_admin_user()) with check (is_admin_user());
alter policy tm_users_all on tm_users using (is_admin_user()) with check (is_admin_user());
alter policy comp_assessments_select_own on comp_assessments using ((select my_module_any('{competency}')) or id in (select my_panel_assessments()));
alter policy comp_ai_analysis_select_authenticated on comp_ai_analysis using ((select my_module_any('{competency}')) or assessment_id in (select my_panel_assessments()));
alter policy comp_candidate_ai_analysis_select on comp_candidate_ai_analysis using ((select my_module_any('{competency}')) or assessment_id in (select my_panel_assessments()));
alter policy comp_panelist_scores_select on comp_panelist_scores using ((select my_module_any('{competency}')) or assessment_id in (select my_panel_assessments()));
alter policy comp_panelists_select on comp_panelists using ((select my_module_any('{competency}')) or user_id = (select auth.uid()));
create policy sg_lifecycle_criteria_read on sg_lifecycle_criteria for select to authenticated using ((select auth.uid()) is not null);
alter policy sg_lifecycle_criteria_all on sg_lifecycle_criteria using (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure'))) with check (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure')));
create policy sg_lifecycle_objectives_read on sg_lifecycle_objectives for select to authenticated using ((select auth.uid()) is not null);
alter policy sg_lifecycle_objectives_all on sg_lifecycle_objectives using (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure'))) with check (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure')));
create policy sg_lifecycle_outputs_read on sg_lifecycle_outputs for select to authenticated using ((select auth.uid()) is not null);
alter policy sg_lifecycle_outputs_all on sg_lifecycle_outputs using (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure'))) with check (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure')));
create policy sg_lifecycle_phase_durations_read on sg_lifecycle_phase_durations for select to authenticated using ((select auth.uid()) is not null);
alter policy sg_lifecycle_phase_durations_all on sg_lifecycle_phase_durations using (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure'))) with check (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure')));
create policy sg_lifecycle_phases_read on sg_lifecycle_phases for select to authenticated using ((select auth.uid()) is not null);
alter policy sg_lifecycle_phases_all on sg_lifecycle_phases using (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure'))) with check (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure')));
create policy sg_lifecycle_strategy_phase_dependencies_read on sg_lifecycle_strategy_phase_dependencies for select to authenticated using ((select auth.uid()) is not null);
alter policy sg_lifecycle_strategy_phase_dependencies_all on sg_lifecycle_strategy_phase_dependencies using (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure'))) with check (is_admin_user() or (select rasta_has_permission(auth.uid(), 'stagegate', 'configure')));
create policy pssr_template_items_read on pssr_template_items for select to authenticated using ((select auth.uid()) is not null);
alter policy pssr_template_items_auth on pssr_template_items using (is_admin_user() or (select rasta_has_permission(auth.uid(), 'pssr', 'configure'))) with check (is_admin_user() or (select rasta_has_permission(auth.uid(), 'pssr', 'configure')));
create policy sg_lifecycle_schedule_success_template_items_read on sg_lifecycle_schedule_success_template_items for select to authenticated using ((select auth.uid()) is not null);
alter policy sg_lifecycle_schedule_success_template_items_all on sg_lifecycle_schedule_success_template_items using ((select my_module_any('{stagegate,scheduling}'))) with check ((select my_module_any('{stagegate,scheduling}')));
create policy sg_lifecycle_schedule_success_template_phases_read on sg_lifecycle_schedule_success_template_phases for select to authenticated using ((select auth.uid()) is not null);
alter policy sg_lifecycle_schedule_success_template_phases_all on sg_lifecycle_schedule_success_template_phases using ((select my_module_any('{stagegate,scheduling}'))) with check ((select my_module_any('{stagegate,scheduling}')));
create policy sg_lifecycle_schedule_success_templates_read on sg_lifecycle_schedule_success_templates for select to authenticated using ((select auth.uid()) is not null);
alter policy sg_lifecycle_schedule_success_templates_all on sg_lifecycle_schedule_success_templates using ((select my_module_any('{stagegate,scheduling}'))) with check ((select my_module_any('{stagegate,scheduling}')));
