-- Undo 004_merge_permissive_policies.sql: drops the merged policies and recreates every original policy exactly as
-- it was (names, actions, roles, USING and WITH CHECK from pg_policies on 2026-11-11). One transaction.
begin;

-- chg_documents (public)
drop policy "merged_select" on public."chg_documents";
drop policy "merged_insert" on public."chg_documents";
drop policy "merged_update" on public."chg_documents";
drop policy "merged_delete" on public."chg_documents";
create policy "chg_documents_select_authenticated" on public."chg_documents" as permissive for select to public
  using (cm_can_view(( SELECT c.master_project_id
   FROM chg_change_requests c
  WHERE (c.id = chg_documents.change_request_id))));
create policy "chg_documents_write" on public."chg_documents" as permissive for all to public
  using (chg_can_write_project(( SELECT chg_change_requests.master_project_id
   FROM chg_change_requests
  WHERE (chg_change_requests.id = chg_documents.change_request_id))))
  with check (chg_can_write_project(( SELECT chg_change_requests.master_project_id
   FROM chg_change_requests
  WHERE (chg_change_requests.id = chg_documents.change_request_id))));

-- chg_history (public)
drop policy "merged_select" on public."chg_history";
drop policy "merged_insert" on public."chg_history";
drop policy "merged_update" on public."chg_history";
drop policy "merged_delete" on public."chg_history";
create policy "chg_history_select_authenticated" on public."chg_history" as permissive for select to public
  using (cm_can_view(( SELECT c.master_project_id
   FROM chg_change_requests c
  WHERE (c.id = chg_history.change_request_id))));
create policy "chg_history_write" on public."chg_history" as permissive for all to public
  using (false)
  with check (false);

-- chg_stage_reviews (public)
drop policy "merged_select" on public."chg_stage_reviews";
drop policy "merged_insert" on public."chg_stage_reviews";
drop policy "merged_update" on public."chg_stage_reviews";
drop policy "merged_delete" on public."chg_stage_reviews";
create policy "chg_stage_reviews_select_authenticated" on public."chg_stage_reviews" as permissive for select to public
  using (cm_can_view(( SELECT c.master_project_id
   FROM chg_change_requests c
  WHERE (c.id = chg_stage_reviews.change_request_id))));
create policy "chg_stage_reviews_write" on public."chg_stage_reviews" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- cm_authority_limits (authenticated)
drop policy "merged_select" on public."cm_authority_limits";
drop policy "merged_insert" on public."cm_authority_limits";
drop policy "merged_update" on public."cm_authority_limits";
drop policy "merged_delete" on public."cm_authority_limits";
create policy "cm_authority_limits_read" on public."cm_authority_limits" as permissive for select to authenticated
  using (true);
create policy "cm_authority_limits_write" on public."cm_authority_limits" as permissive for all to authenticated
  using (cm_can_manage_rules())
  with check (cm_can_manage_rules());

-- cm_route_steps (authenticated)
drop policy "merged_select" on public."cm_route_steps";
drop policy "merged_insert" on public."cm_route_steps";
drop policy "merged_update" on public."cm_route_steps";
drop policy "merged_delete" on public."cm_route_steps";
create policy "cm_route_steps_read" on public."cm_route_steps" as permissive for select to authenticated
  using (true);
create policy "cm_route_steps_write" on public."cm_route_steps" as permissive for all to authenticated
  using (cm_can_manage_rules())
  with check (cm_can_manage_rules());

-- cm_routes (authenticated)
drop policy "merged_select" on public."cm_routes";
drop policy "merged_insert" on public."cm_routes";
drop policy "merged_update" on public."cm_routes";
drop policy "merged_delete" on public."cm_routes";
create policy "cm_routes_read" on public."cm_routes" as permissive for select to authenticated
  using (true);
create policy "cm_routes_write" on public."cm_routes" as permissive for all to authenticated
  using (cm_can_manage_rules())
  with check (cm_can_manage_rules());

-- cm_rule_sets (authenticated)
drop policy "merged_select" on public."cm_rule_sets";
drop policy "merged_insert" on public."cm_rule_sets";
drop policy "merged_update" on public."cm_rule_sets";
drop policy "merged_delete" on public."cm_rule_sets";
create policy "cm_rule_sets_read" on public."cm_rule_sets" as permissive for select to authenticated
  using (true);
create policy "cm_rule_sets_write" on public."cm_rule_sets" as permissive for all to authenticated
  using (cm_can_manage_rules())
  with check (cm_can_manage_rules());

-- cm_rules (authenticated)
drop policy "merged_select" on public."cm_rules";
drop policy "merged_insert" on public."cm_rules";
drop policy "merged_update" on public."cm_rules";
drop policy "merged_delete" on public."cm_rules";
create policy "cm_rules_read" on public."cm_rules" as permissive for select to authenticated
  using (true);
create policy "cm_rules_write" on public."cm_rules" as permissive for all to authenticated
  using (cm_can_manage_rules())
  with check (cm_can_manage_rules());

-- comp_assessment_blueprints (public)
drop policy "merged_select" on public."comp_assessment_blueprints";
drop policy "merged_insert" on public."comp_assessment_blueprints";
drop policy "merged_update" on public."comp_assessment_blueprints";
drop policy "merged_delete" on public."comp_assessment_blueprints";
create policy "comp_assessment_blueprints_select_authenticated" on public."comp_assessment_blueprints" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "comp_assessment_blueprints_write_admin_or_designer" on public."comp_assessment_blueprints" as permissive for all to public
  using ((comp_is_module_admin() OR comp_is_assessment_designer()))
  with check ((comp_is_module_admin() OR comp_is_assessment_designer()));

-- comp_assessment_templates (public)
drop policy "merged_select" on public."comp_assessment_templates";
drop policy "merged_insert" on public."comp_assessment_templates";
drop policy "merged_update" on public."comp_assessment_templates";
drop policy "merged_delete" on public."comp_assessment_templates";
create policy "comp_assessment_templates_select_authenticated" on public."comp_assessment_templates" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "comp_assessment_templates_write_designer" on public."comp_assessment_templates" as permissive for all to public
  using (comp_is_assessment_designer())
  with check (comp_is_assessment_designer());

-- comp_competencies (public)
drop policy "merged_select" on public."comp_competencies";
drop policy "merged_insert" on public."comp_competencies";
drop policy "merged_update" on public."comp_competencies";
drop policy "merged_delete" on public."comp_competencies";
create policy "comp_competencies_select_authenticated" on public."comp_competencies" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "comp_competencies_write_admin_or_designer" on public."comp_competencies" as permissive for all to public
  using ((comp_is_module_admin() OR comp_is_assessment_designer()))
  with check ((comp_is_module_admin() OR comp_is_assessment_designer()));

-- comp_competency_evidence_sources (public)
drop policy "merged_select" on public."comp_competency_evidence_sources";
drop policy "merged_insert" on public."comp_competency_evidence_sources";
drop policy "merged_update" on public."comp_competency_evidence_sources";
drop policy "merged_delete" on public."comp_competency_evidence_sources";
create policy "comp_competency_evidence_sources_select_authenticated" on public."comp_competency_evidence_sources" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "comp_competency_evidence_sources_write_admin_or_designer" on public."comp_competency_evidence_sources" as permissive for all to public
  using ((comp_is_module_admin() OR comp_is_assessment_designer()))
  with check ((comp_is_module_admin() OR comp_is_assessment_designer()));

-- comp_inservice_cycles (public)
drop policy "merged_select" on public."comp_inservice_cycles";
drop policy "merged_insert" on public."comp_inservice_cycles";
drop policy "merged_update" on public."comp_inservice_cycles";
drop policy "merged_delete" on public."comp_inservice_cycles";
create policy "comp_inservice_cycles_select" on public."comp_inservice_cycles" as permissive for select to public
  using ((comp_inservice_manager() OR comp_inservice_is_rater(id)));
create policy "comp_inservice_cycles_write" on public."comp_inservice_cycles" as permissive for all to public
  using (comp_inservice_manager())
  with check (comp_inservice_manager());

-- comp_inservice_raters (public)
drop policy "merged_select" on public."comp_inservice_raters";
drop policy "merged_insert" on public."comp_inservice_raters";
drop policy "merged_update" on public."comp_inservice_raters";
drop policy "merged_delete" on public."comp_inservice_raters";
create policy "comp_inservice_raters_select" on public."comp_inservice_raters" as permissive for select to public
  using ((comp_inservice_manager() OR (user_id = ( SELECT auth.uid() AS uid))));
create policy "comp_inservice_raters_write" on public."comp_inservice_raters" as permissive for all to public
  using (comp_inservice_manager())
  with check (comp_inservice_manager());

-- comp_inservice_ratings (public)
drop policy "merged_select" on public."comp_inservice_ratings";
drop policy "merged_insert" on public."comp_inservice_ratings";
drop policy "merged_update" on public."comp_inservice_ratings";
drop policy "merged_delete" on public."comp_inservice_ratings";
create policy "comp_inservice_ratings_select" on public."comp_inservice_ratings" as permissive for select to public
  using ((comp_inservice_manager() OR (rater_id = ( SELECT auth.uid() AS uid))));
create policy "comp_inservice_ratings_write" on public."comp_inservice_ratings" as permissive for all to public
  using (((rater_id = ( SELECT auth.uid() AS uid)) AND comp_inservice_is_rater(cycle_id) AND (EXISTS ( SELECT 1
   FROM comp_inservice_cycles c
  WHERE ((c.id = comp_inservice_ratings.cycle_id) AND (c.status = 'open'::text))))))
  with check (((rater_id = ( SELECT auth.uid() AS uid)) AND comp_inservice_is_rater(cycle_id) AND (EXISTS ( SELECT 1
   FROM comp_inservice_cycles c
  WHERE ((c.id = comp_inservice_ratings.cycle_id) AND (c.status = 'open'::text))))));

-- comp_job_competency_requirements (public)
drop policy "merged_select" on public."comp_job_competency_requirements";
drop policy "merged_insert" on public."comp_job_competency_requirements";
drop policy "merged_update" on public."comp_job_competency_requirements";
drop policy "merged_delete" on public."comp_job_competency_requirements";
create policy "comp_job_competency_requirements_select_authenticated" on public."comp_job_competency_requirements" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "comp_job_competency_requirements_write_admin_or_designer" on public."comp_job_competency_requirements" as permissive for all to public
  using ((comp_is_module_admin() OR comp_is_assessment_designer()))
  with check ((comp_is_module_admin() OR comp_is_assessment_designer()));

-- comp_job_positions (public)
drop policy "merged_select" on public."comp_job_positions";
drop policy "merged_insert" on public."comp_job_positions";
drop policy "merged_update" on public."comp_job_positions";
drop policy "merged_delete" on public."comp_job_positions";
create policy "comp_job_positions_select" on public."comp_job_positions" as permissive for select to public
  using (true);
create policy "comp_job_positions_write" on public."comp_job_positions" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- comp_job_role_config (public)
drop policy "merged_select" on public."comp_job_role_config";
drop policy "merged_insert" on public."comp_job_role_config";
drop policy "merged_update" on public."comp_job_role_config";
drop policy "merged_delete" on public."comp_job_role_config";
create policy "comp_job_role_config_select_authenticated" on public."comp_job_role_config" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "comp_job_role_config_write_admin" on public."comp_job_role_config" as permissive for all to public
  using (comp_is_module_admin())
  with check (comp_is_module_admin());

-- comp_module_admins (public)
drop policy "merged_select" on public."comp_module_admins";
drop policy "merged_insert" on public."comp_module_admins";
drop policy "merged_update" on public."comp_module_admins";
drop policy "merged_delete" on public."comp_module_admins";
create policy "comp_module_admins_select_authenticated" on public."comp_module_admins" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "comp_module_admins_write_admin" on public."comp_module_admins" as permissive for all to public
  using (comp_is_module_admin())
  with check (comp_is_module_admin());

-- comp_panel_group_members (public)
drop policy "merged_select" on public."comp_panel_group_members";
drop policy "merged_insert" on public."comp_panel_group_members";
drop policy "merged_update" on public."comp_panel_group_members";
drop policy "merged_delete" on public."comp_panel_group_members";
create policy "comp_panel_group_members_select_authenticated" on public."comp_panel_group_members" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "comp_panel_group_members_write_owner" on public."comp_panel_group_members" as permissive for all to public
  using ((comp_is_module_admin() OR (EXISTS ( SELECT 1
   FROM comp_panel_groups g
  WHERE ((g.id = comp_panel_group_members.group_id) AND (g.created_by = ( SELECT auth.uid() AS uid)))))))
  with check ((comp_is_module_admin() OR (EXISTS ( SELECT 1
   FROM comp_panel_groups g
  WHERE ((g.id = comp_panel_group_members.group_id) AND (g.created_by = ( SELECT auth.uid() AS uid)))))));

-- comp_panel_groups (public)
drop policy "merged_select" on public."comp_panel_groups";
drop policy "merged_insert" on public."comp_panel_groups";
drop policy "merged_update" on public."comp_panel_groups";
drop policy "merged_delete" on public."comp_panel_groups";
create policy "comp_panel_groups_select_authenticated" on public."comp_panel_groups" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "comp_panel_groups_write_owner" on public."comp_panel_groups" as permissive for all to public
  using ((comp_is_module_admin() OR (created_by = ( SELECT auth.uid() AS uid))))
  with check ((comp_is_module_admin() OR (created_by = ( SELECT auth.uid() AS uid))));

-- comp_questions (public)
drop policy "merged_select" on public."comp_questions";
drop policy "merged_insert" on public."comp_questions";
drop policy "merged_update" on public."comp_questions";
drop policy "merged_delete" on public."comp_questions";
create policy "comp_questions_select" on public."comp_questions" as permissive for select to public
  using (true);
create policy "comp_questions_write" on public."comp_questions" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- comp_role_maturity_guidance (public)
drop policy "merged_select" on public."comp_role_maturity_guidance";
drop policy "merged_insert" on public."comp_role_maturity_guidance";
drop policy "merged_update" on public."comp_role_maturity_guidance";
drop policy "merged_delete" on public."comp_role_maturity_guidance";
create policy "comp_role_maturity_guidance_select_all" on public."comp_role_maturity_guidance" as permissive for select to public
  using (true);
create policy "comp_role_maturity_guidance_write_admin" on public."comp_role_maturity_guidance" as permissive for all to public
  using (comp_is_module_admin())
  with check (comp_is_module_admin());

-- equipment3d (public)
drop policy "merged_select" on public."equipment3d";
drop policy "merged_insert" on public."equipment3d";
drop policy "merged_update" on public."equipment3d";
drop policy "merged_delete" on public."equipment3d";
create policy "equipment3d_select_member" on public."equipment3d" as permissive for select to public
  using ((is_project_member(project_id) OR is_admin_user()));
create policy "equipment3d_write_editor" on public."equipment3d" as permissive for all to public
  using ((can_edit_project(project_id) OR (project_role(project_id) = 'owner'::text) OR is_admin_user()))
  with check ((can_edit_project(project_id) OR (project_role(project_id) = 'owner'::text) OR is_admin_user()));

-- est_assumptions (public)
drop policy "merged_select" on public."est_assumptions";
drop policy "merged_insert" on public."est_assumptions";
drop policy "merged_update" on public."est_assumptions";
drop policy "merged_delete" on public."est_assumptions";
create policy "est_assumptions_select_all" on public."est_assumptions" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "est_assumptions_write_admin" on public."est_assumptions" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- est_benchmarks (authenticated)
drop policy "merged_select" on public."est_benchmarks";
drop policy "merged_insert" on public."est_benchmarks";
drop policy "merged_update" on public."est_benchmarks";
drop policy "merged_delete" on public."est_benchmarks";
create policy "est_benchmarks_select_all" on public."est_benchmarks" as permissive for select to authenticated
  using (true);
create policy "est_benchmarks_write_own" on public."est_benchmarks" as permissive for all to authenticated
  using (((created_by = ( SELECT auth.uid() AS uid)) OR is_admin_user()))
  with check (((created_by = ( SELECT auth.uid() AS uid)) OR is_admin_user()));

-- ex_action_map (authenticated)
drop policy "merged_select" on public."ex_action_map";
drop policy "merged_insert" on public."ex_action_map";
drop policy "merged_update" on public."ex_action_map";
drop policy "merged_delete" on public."ex_action_map";
create policy "ex_action_map_sel" on public."ex_action_map" as permissive for select to authenticated
  using (true);
create policy "ex_action_map_w" on public."ex_action_map" as permissive for all to authenticated
  using ((ex_can_configure(project_id) OR ex_allows(project_id, 'edit_activities'::text)))
  with check ((ex_can_configure(project_id) OR ex_allows(project_id, 'edit_activities'::text)));

-- ex_activities (authenticated)
drop policy "merged_select" on public."ex_activities";
drop policy "merged_insert" on public."ex_activities";
drop policy "merged_update" on public."ex_activities";
drop policy "merged_delete" on public."ex_activities";
create policy "ex_activities_sel" on public."ex_activities" as permissive for select to authenticated
  using (true);
create policy "ex_activities_w" on public."ex_activities" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_activity_deps (authenticated)
drop policy "merged_select" on public."ex_activity_deps";
drop policy "merged_insert" on public."ex_activity_deps";
drop policy "merged_update" on public."ex_activity_deps";
drop policy "merged_delete" on public."ex_activity_deps";
create policy "ex_activity_deps_sel" on public."ex_activity_deps" as permissive for select to authenticated
  using (true);
create policy "ex_activity_deps_w" on public."ex_activity_deps" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_baseline_lines (authenticated)
drop policy "merged_select" on public."ex_baseline_lines";
drop policy "merged_insert" on public."ex_baseline_lines";
drop policy "merged_update" on public."ex_baseline_lines";
drop policy "merged_delete" on public."ex_baseline_lines";
create policy "ex_baseline_lines_sel" on public."ex_baseline_lines" as permissive for select to authenticated
  using (true);
create policy "ex_baseline_lines_w" on public."ex_baseline_lines" as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM ex_baselines b
  WHERE ((b.id = ex_baseline_lines.baseline_id) AND (b.status = 'draft'::text) AND ex_allows(b.project_id, 'edit_baseline'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM ex_baselines b
  WHERE ((b.id = ex_baseline_lines.baseline_id) AND (b.status = 'draft'::text) AND ex_allows(b.project_id, 'edit_baseline'::text)))));

-- ex_baselines (authenticated)
drop policy "merged_select" on public."ex_baselines";
drop policy "merged_insert" on public."ex_baselines";
drop policy "merged_update" on public."ex_baselines";
drop policy "merged_delete" on public."ex_baselines";
create policy "ex_baselines_sel" on public."ex_baselines" as permissive for select to authenticated
  using (true);
create policy "ex_baselines_w" on public."ex_baselines" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_baseline'::text) AND (status = 'draft'::text)))
  with check ((ex_allows(project_id, 'edit_baseline'::text) AND (status = 'draft'::text)));

-- ex_crew_logs (authenticated)
drop policy "merged_select" on public."ex_crew_logs";
drop policy "merged_insert" on public."ex_crew_logs";
drop policy "merged_update" on public."ex_crew_logs";
drop policy "merged_delete" on public."ex_crew_logs";
create policy "ex_crew_logs_sel" on public."ex_crew_logs" as permissive for select to authenticated
  using (true);
create policy "ex_crew_logs_w" on public."ex_crew_logs" as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM ex_reports r
  WHERE ((r.id = ex_crew_logs.report_id) AND ex_allows(r.project_id, 'record'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM ex_reports r
  WHERE ((r.id = ex_crew_logs.report_id) AND ex_allows(r.project_id, 'record'::text)))));

-- ex_doc_links (authenticated)
drop policy "merged_select" on public."ex_doc_links";
drop policy "merged_insert" on public."ex_doc_links";
drop policy "merged_update" on public."ex_doc_links";
drop policy "merged_delete" on public."ex_doc_links";
create policy "ex_doc_links_sel" on public."ex_doc_links" as permissive for select to authenticated
  using (true);
create policy "ex_doc_links_w" on public."ex_doc_links" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_eng_docs (authenticated)
drop policy "merged_select" on public."ex_eng_docs";
drop policy "merged_insert" on public."ex_eng_docs";
drop policy "merged_update" on public."ex_eng_docs";
drop policy "merged_delete" on public."ex_eng_docs";
create policy "ex_eng_docs_sel" on public."ex_eng_docs" as permissive for select to authenticated
  using (true);
create policy "ex_eng_docs_w" on public."ex_eng_docs" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_form_activity_map (authenticated)
drop policy "merged_select" on public."ex_form_activity_map";
drop policy "merged_insert" on public."ex_form_activity_map";
drop policy "merged_update" on public."ex_form_activity_map";
drop policy "merged_delete" on public."ex_form_activity_map";
create policy "ex_form_activity_map_sel" on public."ex_form_activity_map" as permissive for select to authenticated
  using (true);
create policy "ex_form_activity_map_w" on public."ex_form_activity_map" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_form_entries (authenticated)
drop policy "merged_select" on public."ex_form_entries";
drop policy "merged_insert" on public."ex_form_entries";
drop policy "merged_update" on public."ex_form_entries";
drop policy "merged_delete" on public."ex_form_entries";
create policy "ex_form_entries_sel" on public."ex_form_entries" as permissive for select to authenticated
  using (true);
create policy "ex_form_entries_w" on public."ex_form_entries" as permissive for all to authenticated
  using ((ex_allows(project_id, 'record'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'record'::text) OR ex_can_configure(project_id)));

-- ex_gap_items (authenticated)
drop policy "merged_select" on public."ex_gap_items";
drop policy "merged_insert" on public."ex_gap_items";
drop policy "merged_update" on public."ex_gap_items";
drop policy "merged_delete" on public."ex_gap_items";
create policy "ex_gap_items_sel" on public."ex_gap_items" as permissive for select to authenticated
  using (true);
create policy "ex_gap_items_w" on public."ex_gap_items" as permissive for all to authenticated
  using ((ex_allows(project_id, 'manage_gaps'::text) OR ex_allows(project_id, 'record'::text)))
  with check ((ex_allows(project_id, 'manage_gaps'::text) OR ex_allows(project_id, 'record'::text)));

-- ex_lookahead (authenticated)
drop policy "merged_select" on public."ex_lookahead";
drop policy "merged_insert" on public."ex_lookahead";
drop policy "merged_update" on public."ex_lookahead";
drop policy "merged_delete" on public."ex_lookahead";
create policy "ex_lookahead_sel" on public."ex_lookahead" as permissive for select to authenticated
  using (true);
create policy "ex_lookahead_w" on public."ex_lookahead" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_measurements (authenticated)
drop policy "merged_select" on public."ex_measurements";
drop policy "merged_insert" on public."ex_measurements";
drop policy "merged_update" on public."ex_measurements";
drop policy "merged_delete" on public."ex_measurements";
create policy "ex_measurements_sel" on public."ex_measurements" as permissive for select to authenticated
  using (true);
create policy "ex_measurements_w" on public."ex_measurements" as permissive for all to authenticated
  using ((ex_allows(project_id, 'measure'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'measure'::text) OR ex_can_configure(project_id)));

-- ex_prereqs (authenticated)
drop policy "merged_select" on public."ex_prereqs";
drop policy "merged_insert" on public."ex_prereqs";
drop policy "merged_update" on public."ex_prereqs";
drop policy "merged_delete" on public."ex_prereqs";
create policy "ex_prereqs_sel" on public."ex_prereqs" as permissive for select to authenticated
  using (true);
create policy "ex_prereqs_w" on public."ex_prereqs" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_price_books (authenticated)
drop policy "merged_select" on public."ex_price_books";
drop policy "merged_insert" on public."ex_price_books";
drop policy "merged_update" on public."ex_price_books";
drop policy "merged_delete" on public."ex_price_books";
create policy "ex_price_books_sel" on public."ex_price_books" as permissive for select to authenticated
  using (true);
create policy "ex_price_books_w" on public."ex_price_books" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_price_items (authenticated)
drop policy "merged_select" on public."ex_price_items";
drop policy "merged_insert" on public."ex_price_items";
drop policy "merged_update" on public."ex_price_items";
drop policy "merged_delete" on public."ex_price_items";
create policy "ex_price_items_sel" on public."ex_price_items" as permissive for select to authenticated
  using (true);
create policy "ex_price_items_w" on public."ex_price_items" as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM ex_price_books b
  WHERE ((b.id = ex_price_items.book_id) AND (ex_allows(b.project_id, 'edit_activities'::text) OR ex_can_configure(b.project_id))))))
  with check ((EXISTS ( SELECT 1
   FROM ex_price_books b
  WHERE ((b.id = ex_price_items.book_id) AND (ex_allows(b.project_id, 'edit_activities'::text) OR ex_can_configure(b.project_id))))));

-- ex_project_roles (authenticated)
drop policy "merged_select" on public."ex_project_roles";
drop policy "merged_insert" on public."ex_project_roles";
drop policy "merged_update" on public."ex_project_roles";
drop policy "merged_delete" on public."ex_project_roles";
create policy "ex_project_roles_cfg" on public."ex_project_roles" as permissive for all to authenticated
  using (ex_can_configure(project_id))
  with check (ex_can_configure(project_id));
create policy "ex_project_roles_sel" on public."ex_project_roles" as permissive for select to authenticated
  using (true);

-- ex_qc_findings (authenticated)
drop policy "merged_select" on public."ex_qc_findings";
drop policy "merged_insert" on public."ex_qc_findings";
drop policy "merged_update" on public."ex_qc_findings";
drop policy "merged_delete" on public."ex_qc_findings";
create policy "ex_qc_findings_sel" on public."ex_qc_findings" as permissive for select to authenticated
  using (true);
create policy "ex_qc_findings_w" on public."ex_qc_findings" as permissive for all to authenticated
  using ((ex_allows(project_id, 'record'::text) OR ex_allows(project_id, 'raise'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'record'::text) OR ex_allows(project_id, 'raise'::text) OR ex_can_configure(project_id)));

-- ex_report_lines (authenticated)
drop policy "merged_select" on public."ex_report_lines";
drop policy "merged_insert" on public."ex_report_lines";
drop policy "merged_update" on public."ex_report_lines";
drop policy "merged_delete" on public."ex_report_lines";
create policy "ex_report_lines_sel" on public."ex_report_lines" as permissive for select to authenticated
  using (true);
create policy "ex_report_lines_w" on public."ex_report_lines" as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM ex_reports r
  WHERE ((r.id = ex_report_lines.report_id) AND ex_allows(r.project_id, 'record'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM ex_reports r
  WHERE ((r.id = ex_report_lines.report_id) AND ex_allows(r.project_id, 'record'::text)))));

-- ex_report_links (authenticated)
drop policy "merged_select" on public."ex_report_links";
drop policy "merged_insert" on public."ex_report_links";
drop policy "merged_update" on public."ex_report_links";
drop policy "merged_delete" on public."ex_report_links";
create policy "ex_report_links_sel" on public."ex_report_links" as permissive for select to authenticated
  using (true);
create policy "ex_report_links_w" on public."ex_report_links" as permissive for all to authenticated
  using ((ex_allows(project_id, 'record'::text) OR ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'record'::text) OR ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_report_resources (authenticated)
drop policy "merged_select" on public."ex_report_resources";
drop policy "merged_insert" on public."ex_report_resources";
drop policy "merged_update" on public."ex_report_resources";
drop policy "merged_delete" on public."ex_report_resources";
create policy "ex_report_resources_sel" on public."ex_report_resources" as permissive for select to authenticated
  using (true);
create policy "ex_report_resources_w" on public."ex_report_resources" as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM ex_reports r
  WHERE ((r.id = ex_report_resources.report_id) AND ex_allows(r.project_id, 'record'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM ex_reports r
  WHERE ((r.id = ex_report_resources.report_id) AND ex_allows(r.project_id, 'record'::text)))));

-- ex_report_stoppages (authenticated)
drop policy "merged_select" on public."ex_report_stoppages";
drop policy "merged_insert" on public."ex_report_stoppages";
drop policy "merged_update" on public."ex_report_stoppages";
drop policy "merged_delete" on public."ex_report_stoppages";
create policy "ex_report_stoppages_sel" on public."ex_report_stoppages" as permissive for select to authenticated
  using (true);
create policy "ex_report_stoppages_w" on public."ex_report_stoppages" as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM ex_reports r
  WHERE ((r.id = ex_report_stoppages.report_id) AND ex_allows(r.project_id, 'record'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM ex_reports r
  WHERE ((r.id = ex_report_stoppages.report_id) AND ex_allows(r.project_id, 'record'::text)))));

-- ex_reports (authenticated)
drop policy "merged_select" on public."ex_reports";
drop policy "merged_insert" on public."ex_reports";
drop policy "merged_update" on public."ex_reports";
drop policy "merged_delete" on public."ex_reports";
create policy "ex_reports_sel" on public."ex_reports" as permissive for select to authenticated
  using (true);
create policy "ex_reports_w" on public."ex_reports" as permissive for all to authenticated
  using (ex_allows(project_id, 'record'::text))
  with check (ex_allows(project_id, 'record'::text));

-- ex_required_forms (authenticated)
drop policy "merged_select" on public."ex_required_forms";
drop policy "merged_insert" on public."ex_required_forms";
drop policy "merged_update" on public."ex_required_forms";
drop policy "merged_delete" on public."ex_required_forms";
create policy "ex_required_forms_sel" on public."ex_required_forms" as permissive for select to authenticated
  using (true);
create policy "ex_required_forms_w" on public."ex_required_forms" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_schedule_imports (authenticated)
drop policy "merged_select" on public."ex_schedule_imports";
drop policy "merged_insert" on public."ex_schedule_imports";
drop policy "merged_update" on public."ex_schedule_imports";
drop policy "merged_delete" on public."ex_schedule_imports";
create policy "ex_schedule_imports_sel" on public."ex_schedule_imports" as permissive for select to authenticated
  using (true);
create policy "ex_schedule_imports_w" on public."ex_schedule_imports" as permissive for all to authenticated
  using ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)))
  with check ((ex_allows(project_id, 'edit_activities'::text) OR ex_can_configure(project_id)));

-- ex_settings (authenticated)
drop policy "merged_select" on public."ex_settings";
drop policy "merged_insert" on public."ex_settings";
drop policy "merged_update" on public."ex_settings";
drop policy "merged_delete" on public."ex_settings";
create policy "ex_settings_cfg" on public."ex_settings" as permissive for all to authenticated
  using (ex_can_configure(project_id))
  with check (ex_can_configure(project_id));
create policy "ex_settings_sel" on public."ex_settings" as permissive for select to authenticated
  using (true);

-- ex_sign_slots (authenticated)
drop policy "merged_select" on public."ex_sign_slots";
drop policy "merged_insert" on public."ex_sign_slots";
drop policy "merged_update" on public."ex_sign_slots";
drop policy "merged_delete" on public."ex_sign_slots";
create policy "ex_sign_slots_sel" on public."ex_sign_slots" as permissive for select to authenticated
  using (true);
create policy "ex_sign_slots_w" on public."ex_sign_slots" as permissive for all to authenticated
  using (ex_can_configure(project_id))
  with check (ex_can_configure(project_id));

-- ex_work_actions (authenticated)
drop policy "merged_select" on public."ex_work_actions";
drop policy "merged_insert" on public."ex_work_actions";
drop policy "merged_update" on public."ex_work_actions";
drop policy "merged_delete" on public."ex_work_actions";
create policy "ex_work_actions_sel" on public."ex_work_actions" as permissive for select to authenticated
  using (true);
create policy "ex_work_actions_w" on public."ex_work_actions" as permissive for all to authenticated
  using ((ex_can_configure(project_id) OR ex_allows(project_id, 'edit_activities'::text)))
  with check ((ex_can_configure(project_id) OR ex_allows(project_id, 'edit_activities'::text)));

-- fin_annual_budgets (public)
drop policy "merged_select" on public."fin_annual_budgets";
drop policy "merged_insert" on public."fin_annual_budgets";
drop policy "merged_update" on public."fin_annual_budgets";
drop policy "merged_delete" on public."fin_annual_budgets";
create policy "fin_annual_budgets_select_authenticated" on public."fin_annual_budgets" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_annual_budgets_write_admin" on public."fin_annual_budgets" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_budget_changes (public)
drop policy "merged_select" on public."fin_budget_changes";
drop policy "merged_insert" on public."fin_budget_changes";
drop policy "merged_update" on public."fin_budget_changes";
drop policy "merged_delete" on public."fin_budget_changes";
create policy "fin_budget_changes_select_authenticated" on public."fin_budget_changes" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_budget_changes_write_admin" on public."fin_budget_changes" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_budgets (public)
drop policy "merged_select" on public."fin_budgets";
drop policy "merged_insert" on public."fin_budgets";
drop policy "merged_update" on public."fin_budgets";
drop policy "merged_delete" on public."fin_budgets";
create policy "fin_budgets_select_authenticated" on public."fin_budgets" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_budgets_write_admin" on public."fin_budgets" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_cashflow_forecasts (public)
drop policy "merged_select" on public."fin_cashflow_forecasts";
drop policy "merged_insert" on public."fin_cashflow_forecasts";
drop policy "merged_update" on public."fin_cashflow_forecasts";
drop policy "merged_delete" on public."fin_cashflow_forecasts";
create policy "fin_cashflow_forecasts_select_authenticated" on public."fin_cashflow_forecasts" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_cashflow_forecasts_write_admin" on public."fin_cashflow_forecasts" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_claims (public)
drop policy "merged_select" on public."fin_claims";
drop policy "merged_insert" on public."fin_claims";
drop policy "merged_update" on public."fin_claims";
drop policy "merged_delete" on public."fin_claims";
create policy "fin_claims_select_authenticated" on public."fin_claims" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_claims_write_admin" on public."fin_claims" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_contract_amendments (public)
drop policy "merged_select" on public."fin_contract_amendments";
drop policy "merged_insert" on public."fin_contract_amendments";
drop policy "merged_update" on public."fin_contract_amendments";
drop policy "merged_delete" on public."fin_contract_amendments";
create policy "fin_contract_amendments_select_authenticated" on public."fin_contract_amendments" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_contract_amendments_write_admin" on public."fin_contract_amendments" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_contracts (public)
drop policy "merged_select" on public."fin_contracts";
drop policy "merged_insert" on public."fin_contracts";
drop policy "merged_update" on public."fin_contracts";
drop policy "merged_delete" on public."fin_contracts";
create policy "fin_contracts_select_authenticated" on public."fin_contracts" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_contracts_write_admin" on public."fin_contracts" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_guarantees (public)
drop policy "merged_select" on public."fin_guarantees";
drop policy "merged_insert" on public."fin_guarantees";
drop policy "merged_update" on public."fin_guarantees";
drop policy "merged_delete" on public."fin_guarantees";
create policy "fin_guarantees_select_authenticated" on public."fin_guarantees" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_guarantees_write_admin" on public."fin_guarantees" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_payment_certificates (public)
drop policy "merged_select_public" on public."fin_payment_certificates";
drop policy "merged_insert_public" on public."fin_payment_certificates";
drop policy "merged_update_public" on public."fin_payment_certificates";
drop policy "merged_delete_public" on public."fin_payment_certificates";
create policy "fin_payment_certificates_select_authenticated" on public."fin_payment_certificates" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_payment_certificates_write_admin" on public."fin_payment_certificates" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_payments (public)
drop policy "merged_select_public" on public."fin_payments";
drop policy "merged_insert_public" on public."fin_payments";
drop policy "merged_update_public" on public."fin_payments";
drop policy "merged_delete_public" on public."fin_payments";
create policy "fin_payments_select_authenticated" on public."fin_payments" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_payments_write_admin" on public."fin_payments" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- fin_retention_releases (public)
drop policy "merged_select" on public."fin_retention_releases";
drop policy "merged_insert" on public."fin_retention_releases";
drop policy "merged_update" on public."fin_retention_releases";
drop policy "merged_delete" on public."fin_retention_releases";
create policy "fin_retention_releases_select_authenticated" on public."fin_retention_releases" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "fin_retention_releases_write_admin" on public."fin_retention_releases" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- im_attachments (public)
drop policy "merged_select" on public."im_attachments";
drop policy "merged_insert" on public."im_attachments";
drop policy "merged_update" on public."im_attachments";
drop policy "merged_delete" on public."im_attachments";
create policy "im_attachments_read" on public."im_attachments" as permissive for select to public
  using (im_can_see_issue(issue_id));
create policy "im_attachments_write" on public."im_attachments" as permissive for all to public
  using (im_can_write_issue(issue_id))
  with check (im_can_write_issue(issue_id));

-- im_capa (public)
drop policy "merged_select" on public."im_capa";
drop policy "merged_insert" on public."im_capa";
drop policy "merged_update" on public."im_capa";
drop policy "merged_delete" on public."im_capa";
create policy "im_capa_read" on public."im_capa" as permissive for select to public
  using (im_can_see_issue(issue_id));
create policy "im_capa_write" on public."im_capa" as permissive for all to public
  using (im_can_write_issue(issue_id))
  with check (im_can_write_issue(issue_id));

-- im_categories (public)
drop policy "merged_select" on public."im_categories";
drop policy "merged_insert" on public."im_categories";
drop policy "merged_update" on public."im_categories";
drop policy "merged_delete" on public."im_categories";
create policy "im_categories_read" on public."im_categories" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "im_categories_write" on public."im_categories" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- im_decision_options (public)
drop policy "merged_select" on public."im_decision_options";
drop policy "merged_insert" on public."im_decision_options";
drop policy "merged_update" on public."im_decision_options";
drop policy "merged_delete" on public."im_decision_options";
create policy "im_dec_options_read" on public."im_decision_options" as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM im_decisions d
  WHERE ((d.id = im_decision_options.decision_id) AND im_can_see_decision(d.project_id, d.issue_id)))));
create policy "im_dec_options_write" on public."im_decision_options" as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM im_decisions d
  WHERE ((d.id = im_decision_options.decision_id) AND (im_is_project_member(d.project_id) OR is_admin_user()) AND (d.status = ANY (ARRAY['draft'::text, 'pending'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM im_decisions d
  WHERE ((d.id = im_decision_options.decision_id) AND (im_is_project_member(d.project_id) OR is_admin_user()) AND (d.status = ANY (ARRAY['draft'::text, 'pending'::text]))))));

-- im_decisions (public)
drop policy "merged_select" on public."im_decisions";
drop policy "merged_insert" on public."im_decisions";
drop policy "merged_update" on public."im_decisions";
drop policy "merged_delete" on public."im_decisions";
create policy "im_decisions_read" on public."im_decisions" as permissive for select to public
  using (im_can_see_decision(project_id, issue_id));
create policy "im_decisions_write" on public."im_decisions" as permissive for all to public
  using ((im_is_project_member(project_id) OR is_admin_user()))
  with check ((im_is_project_member(project_id) OR is_admin_user()));

-- im_extensions (public)
drop policy "merged_select" on public."im_extensions";
drop policy "merged_insert" on public."im_extensions";
drop policy "merged_update" on public."im_extensions";
drop policy "merged_delete" on public."im_extensions";
create policy "im_extensions_read" on public."im_extensions" as permissive for select to public
  using (im_can_see_issue(issue_id));
create policy "im_extensions_write" on public."im_extensions" as permissive for all to public
  using (im_can_write_issue(issue_id))
  with check (im_can_write_issue(issue_id));

-- im_issue_links (public)
drop policy "merged_select" on public."im_issue_links";
drop policy "merged_insert" on public."im_issue_links";
drop policy "merged_update" on public."im_issue_links";
drop policy "merged_delete" on public."im_issue_links";
create policy "im_issue_links_read" on public."im_issue_links" as permissive for select to public
  using (im_can_see_issue(issue_id));
create policy "im_issue_links_write" on public."im_issue_links" as permissive for all to public
  using (im_can_write_issue(issue_id))
  with check (im_can_write_issue(issue_id));

-- im_issue_people (public)
drop policy "merged_select" on public."im_issue_people";
drop policy "merged_insert" on public."im_issue_people";
drop policy "merged_update" on public."im_issue_people";
drop policy "merged_delete" on public."im_issue_people";
create policy "im_issue_people_read" on public."im_issue_people" as permissive for select to public
  using (im_can_see_issue(issue_id));
create policy "im_issue_people_write" on public."im_issue_people" as permissive for all to public
  using (im_can_write_issue(issue_id))
  with check (im_can_write_issue(issue_id));

-- im_issue_tasks (public)
drop policy "merged_select" on public."im_issue_tasks";
drop policy "merged_insert" on public."im_issue_tasks";
drop policy "merged_update" on public."im_issue_tasks";
drop policy "merged_delete" on public."im_issue_tasks";
create policy "im_issue_tasks_read" on public."im_issue_tasks" as permissive for select to public
  using (im_can_see_issue(issue_id));
create policy "im_issue_tasks_write" on public."im_issue_tasks" as permissive for all to public
  using (im_can_write_issue(issue_id))
  with check (im_can_write_issue(issue_id));

-- im_notif_rules (public)
drop policy "merged_select" on public."im_notif_rules";
drop policy "merged_insert" on public."im_notif_rules";
drop policy "merged_update" on public."im_notif_rules";
drop policy "merged_delete" on public."im_notif_rules";
create policy "im_rules_admin" on public."im_notif_rules" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());
create policy "im_rules_read" on public."im_notif_rules" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- im_rca (public)
drop policy "merged_select" on public."im_rca";
drop policy "merged_insert" on public."im_rca";
drop policy "merged_update" on public."im_rca";
drop policy "merged_delete" on public."im_rca";
create policy "im_rca_read" on public."im_rca" as permissive for select to public
  using (im_can_see_issue(issue_id));
create policy "im_rca_write" on public."im_rca" as permissive for all to public
  using (im_can_write_issue(issue_id))
  with check (im_can_write_issue(issue_id));

-- im_sla_policies (public)
drop policy "merged_select" on public."im_sla_policies";
drop policy "merged_insert" on public."im_sla_policies";
drop policy "merged_update" on public."im_sla_policies";
drop policy "merged_delete" on public."im_sla_policies";
create policy "im_sla_read" on public."im_sla_policies" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "im_sla_write" on public."im_sla_policies" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- im_task_deps (public)
drop policy "merged_select" on public."im_task_deps";
drop policy "merged_insert" on public."im_task_deps";
drop policy "merged_update" on public."im_task_deps";
drop policy "merged_delete" on public."im_task_deps";
create policy "im_task_deps_read" on public."im_task_deps" as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM im_issue_tasks t
  WHERE ((t.id = im_task_deps.task_id) AND im_can_see_issue(t.issue_id)))));
create policy "im_task_deps_write" on public."im_task_deps" as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM im_issue_tasks t
  WHERE ((t.id = im_task_deps.task_id) AND im_can_write_issue(t.issue_id)))))
  with check ((EXISTS ( SELECT 1
   FROM im_issue_tasks t
  WHERE ((t.id = im_task_deps.task_id) AND im_can_write_issue(t.issue_id)))));

-- im_task_updates (public)
drop policy "merged_select" on public."im_task_updates";
drop policy "merged_insert" on public."im_task_updates";
drop policy "merged_update" on public."im_task_updates";
drop policy "merged_delete" on public."im_task_updates";
create policy "im_task_updates_read" on public."im_task_updates" as permissive for select to public
  using (im_can_see_issue(issue_id));
create policy "im_task_updates_write" on public."im_task_updates" as permissive for all to public
  using (im_can_write_issue(issue_id))
  with check (im_can_write_issue(issue_id));

-- im_templates (public)
drop policy "merged_select" on public."im_templates";
drop policy "merged_insert" on public."im_templates";
drop policy "merged_update" on public."im_templates";
drop policy "merged_delete" on public."im_templates";
create policy "im_templates_read" on public."im_templates" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "im_templates_write" on public."im_templates" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- im_workflow_stages (public)
drop policy "merged_select" on public."im_workflow_stages";
drop policy "merged_insert" on public."im_workflow_stages";
drop policy "merged_update" on public."im_workflow_stages";
drop policy "merged_delete" on public."im_workflow_stages";
create policy "im_wf_stages_read" on public."im_workflow_stages" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "im_wf_stages_write" on public."im_workflow_stages" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- im_workflow_transitions (public)
drop policy "merged_select" on public."im_workflow_transitions";
drop policy "merged_insert" on public."im_workflow_transitions";
drop policy "merged_update" on public."im_workflow_transitions";
drop policy "merged_delete" on public."im_workflow_transitions";
create policy "im_wf_trans_read" on public."im_workflow_transitions" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "im_wf_trans_write" on public."im_workflow_transitions" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- joints (public)
drop policy "merged_select" on public."joints";
drop policy "merged_insert" on public."joints";
drop policy "merged_update" on public."joints";
drop policy "merged_delete" on public."joints";
create policy "joints_select_member" on public."joints" as permissive for select to public
  using ((is_project_member(project_id) OR is_admin_user()));
create policy "joints_write_editor" on public."joints" as permissive for all to public
  using ((can_edit_project(project_id) OR (project_role(project_id) = 'owner'::text) OR is_admin_user()))
  with check ((can_edit_project(project_id) OR (project_role(project_id) = 'owner'::text) OR is_admin_user()));

-- la_activities (public)
drop policy "merged_select" on public."la_activities";
drop policy "merged_insert" on public."la_activities";
drop policy "merged_update" on public."la_activities";
drop policy "merged_delete" on public."la_activities";
create policy "la_activities_select" on public."la_activities" as permissive for select to public
  using (la_can_view(master_project_id));
create policy "la_activities_write" on public."la_activities" as permissive for all to public
  using (la_can_edit(master_project_id))
  with check (la_can_edit(master_project_id));

-- la_crossings (public)
drop policy "merged_select" on public."la_crossings";
drop policy "merged_insert" on public."la_crossings";
drop policy "merged_update" on public."la_crossings";
drop policy "merged_delete" on public."la_crossings";
create policy "la_crossings_select" on public."la_crossings" as permissive for select to public
  using (la_can_view(master_project_id));
create policy "la_crossings_write" on public."la_crossings" as permissive for all to public
  using (la_can_edit(master_project_id))
  with check (la_can_edit(master_project_id));

-- la_docs (public)
drop policy "merged_select" on public."la_docs";
drop policy "merged_insert" on public."la_docs";
drop policy "merged_update" on public."la_docs";
drop policy "merged_delete" on public."la_docs";
create policy "la_docs_select" on public."la_docs" as permissive for select to public
  using (la_can_view(la_parcel_project(parcel_id)));
create policy "la_docs_write" on public."la_docs" as permissive for all to public
  using (la_can_edit(la_parcel_project(parcel_id)))
  with check (la_can_edit(la_parcel_project(parcel_id)));

-- la_owners (public)
drop policy "merged_select" on public."la_owners";
drop policy "merged_insert" on public."la_owners";
drop policy "merged_update" on public."la_owners";
drop policy "merged_delete" on public."la_owners";
create policy "la_owners_select" on public."la_owners" as permissive for select to public
  using (la_can_view(la_parcel_project(parcel_id)));
create policy "la_owners_write" on public."la_owners" as permissive for all to public
  using (la_can_edit(la_parcel_project(parcel_id)))
  with check (la_can_edit(la_parcel_project(parcel_id)));

-- la_parcels (public)
drop policy "merged_select" on public."la_parcels";
drop policy "merged_insert" on public."la_parcels";
drop policy "merged_update" on public."la_parcels";
drop policy "merged_delete" on public."la_parcels";
create policy "la_parcels_select" on public."la_parcels" as permissive for select to public
  using (la_can_view(master_project_id));
create policy "la_parcels_write" on public."la_parcels" as permissive for all to public
  using (la_can_edit(master_project_id))
  with check (la_can_edit(master_project_id));

-- la_payments (public)
drop policy "merged_select" on public."la_payments";
drop policy "merged_insert" on public."la_payments";
drop policy "merged_update" on public."la_payments";
drop policy "merged_delete" on public."la_payments";
create policy "la_payments_select" on public."la_payments" as permissive for select to public
  using (la_can_view(master_project_id));
create policy "la_payments_write" on public."la_payments" as permissive for all to public
  using (la_can_edit(master_project_id))
  with check (la_can_edit(master_project_id));

-- la_plots (public)
drop policy "merged_select" on public."la_plots";
drop policy "merged_insert" on public."la_plots";
drop policy "merged_update" on public."la_plots";
drop policy "merged_delete" on public."la_plots";
create policy "la_plots_select" on public."la_plots" as permissive for select to public
  using (la_can_view(la_parcel_project(parcel_id)));
create policy "la_plots_write" on public."la_plots" as permissive for all to public
  using (la_can_edit(la_parcel_project(parcel_id)))
  with check (la_can_edit(la_parcel_project(parcel_id)));

-- la_roles (public)
drop policy "merged_select" on public."la_roles";
drop policy "merged_insert" on public."la_roles";
drop policy "merged_update" on public."la_roles";
drop policy "merged_delete" on public."la_roles";
create policy "la_roles_select" on public."la_roles" as permissive for select to public
  using (la_can_view(master_project_id));
create policy "la_roles_write" on public."la_roles" as permissive for all to public
  using ((is_admin_user() OR rasta_has_permission(( SELECT auth.uid() AS uid), 'landacq'::text, 'configure'::text)))
  with check ((is_admin_user() OR rasta_has_permission(( SELECT auth.uid() AS uid), 'landacq'::text, 'configure'::text)));

-- la_routes (public)
drop policy "merged_select" on public."la_routes";
drop policy "merged_insert" on public."la_routes";
drop policy "merged_update" on public."la_routes";
drop policy "merged_delete" on public."la_routes";
create policy "la_routes_select" on public."la_routes" as permissive for select to public
  using (la_can_view(master_project_id));
create policy "la_routes_write" on public."la_routes" as permissive for all to public
  using (la_can_edit(master_project_id))
  with check (la_can_edit(master_project_id));

-- la_stages (public)
drop policy "merged_select" on public."la_stages";
drop policy "merged_insert" on public."la_stages";
drop policy "merged_update" on public."la_stages";
drop policy "merged_delete" on public."la_stages";
create policy "la_stages_select" on public."la_stages" as permissive for select to public
  using (la_can_view(la_parcel_project(parcel_id)));
create policy "la_stages_write" on public."la_stages" as permissive for all to public
  using (la_can_edit(la_parcel_project(parcel_id)))
  with check (la_can_edit(la_parcel_project(parcel_id)));

-- lines (public)
drop policy "merged_select" on public."lines";
drop policy "merged_insert" on public."lines";
drop policy "merged_update" on public."lines";
drop policy "merged_delete" on public."lines";
create policy "lines_select_member" on public."lines" as permissive for select to public
  using ((is_project_member(project_id) OR is_admin_user() OR rasta_scope_ok_for_source('pipepulse'::text, project_id)));
create policy "lines_write_editor" on public."lines" as permissive for all to public
  using ((can_edit_project(project_id) OR (project_role(project_id) = 'owner'::text) OR is_admin_user()))
  with check ((can_edit_project(project_id) OR (project_role(project_id) = 'owner'::text) OR is_admin_user()));

-- master_project_dependencies (public)
drop policy "merged_select" on public."master_project_dependencies";
drop policy "merged_insert" on public."master_project_dependencies";
drop policy "merged_update" on public."master_project_dependencies";
drop policy "merged_delete" on public."master_project_dependencies";
create policy "master_project_dependencies_select_authenticated" on public."master_project_dependencies" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "master_project_dependencies_write_admin" on public."master_project_dependencies" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- master_project_parties (public)
drop policy "merged_select" on public."master_project_parties";
drop policy "merged_insert" on public."master_project_parties";
drop policy "merged_update" on public."master_project_parties";
drop policy "merged_delete" on public."master_project_parties";
create policy "master_project_parties_select" on public."master_project_parties" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "master_project_parties_write" on public."master_project_parties" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- master_project_team (public)
drop policy "merged_select" on public."master_project_team";
drop policy "merged_insert" on public."master_project_team";
drop policy "merged_update" on public."master_project_team";
drop policy "merged_delete" on public."master_project_team";
create policy "master_project_team_select" on public."master_project_team" as permissive for select to public
  using (rasta_user_can_access_master_project(project_id));
create policy "master_project_team_write" on public."master_project_team" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- master_projects (public)
drop policy "merged_select" on public."master_projects";
drop policy "merged_insert" on public."master_projects";
drop policy "merged_update" on public."master_projects";
drop policy "merged_delete" on public."master_projects";
create policy "master_projects_select_authenticated" on public."master_projects" as permissive for select to public
  using (rasta_user_can_access_master_project(id));
create policy "master_projects_write_admin" on public."master_projects" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- ms_question_sets (public)
drop policy "merged_select" on public."ms_question_sets";
drop policy "merged_insert" on public."ms_question_sets";
drop policy "merged_update" on public."ms_question_sets";
drop policy "merged_delete" on public."ms_question_sets";
create policy "ms_question_sets_select" on public."ms_question_sets" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "ms_question_sets_write" on public."ms_question_sets" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- ms_roles (public)
drop policy "merged_select" on public."ms_roles";
drop policy "merged_insert" on public."ms_roles";
drop policy "merged_update" on public."ms_roles";
drop policy "merged_delete" on public."ms_roles";
create policy "ms_roles_select" on public."ms_roles" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "ms_roles_write" on public."ms_roles" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_allocations (public)
drop policy "merged_select_public" on public."mtl_allocations";
drop policy "merged_insert_public" on public."mtl_allocations";
drop policy "merged_update_public" on public."mtl_allocations";
drop policy "merged_delete_public" on public."mtl_allocations";
create policy "mtl_allocations_select_authenticated" on public."mtl_allocations" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_allocations_write_admin" on public."mtl_allocations" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_groups (authenticated)
drop policy "merged_select" on public."mtl_groups";
drop policy "merged_insert" on public."mtl_groups";
drop policy "merged_update" on public."mtl_groups";
drop policy "merged_delete" on public."mtl_groups";
create policy "mtl_groups_cfg" on public."mtl_groups" as permissive for all to authenticated
  using (mtl_can_configure())
  with check (mtl_can_configure());
create policy "mtl_groups_sel" on public."mtl_groups" as permissive for select to authenticated
  using (true);

-- mtl_item_stages (authenticated)
drop policy "merged_select" on public."mtl_item_stages";
drop policy "merged_insert" on public."mtl_item_stages";
drop policy "merged_update" on public."mtl_item_stages";
drop policy "merged_delete" on public."mtl_item_stages";
create policy "mtl_item_stages_role_w" on public."mtl_item_stages" as permissive for all to authenticated
  using (mtl_allows(( SELECT p.master_project_id
   FROM (mtl_package_items i
     JOIN mtl_packages p ON ((p.id = i.package_id)))
  WHERE (i.id = mtl_item_stages.item_id)), 'edit_packages'::text))
  with check (mtl_allows(( SELECT p.master_project_id
   FROM (mtl_package_items i
     JOIN mtl_packages p ON ((p.id = i.package_id)))
  WHERE (i.id = mtl_item_stages.item_id)), 'edit_packages'::text));
create policy "mtl_item_stages_sel" on public."mtl_item_stages" as permissive for select to authenticated
  using (true);

-- mtl_lookups (authenticated)
drop policy "merged_select" on public."mtl_lookups";
drop policy "merged_insert" on public."mtl_lookups";
drop policy "merged_update" on public."mtl_lookups";
drop policy "merged_delete" on public."mtl_lookups";
create policy "mtl_lookups_sel" on public."mtl_lookups" as permissive for select to authenticated
  using (true);
create policy "mtl_lookups_w" on public."mtl_lookups" as permissive for all to authenticated
  using ((mtl_allows(master_project_id, 'edit_items'::text) OR mtl_can_configure()))
  with check ((mtl_allows(master_project_id, 'edit_items'::text) OR mtl_can_configure()));

-- mtl_manufacturing (public)
drop policy "merged_select_public" on public."mtl_manufacturing";
drop policy "merged_insert_public" on public."mtl_manufacturing";
drop policy "merged_update_public" on public."mtl_manufacturing";
drop policy "merged_delete_public" on public."mtl_manufacturing";
create policy "mtl_manufacturing_select_authenticated" on public."mtl_manufacturing" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_manufacturing_write_admin" on public."mtl_manufacturing" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_materials (public)
drop policy "merged_select_public" on public."mtl_materials";
drop policy "merged_insert_public" on public."mtl_materials";
drop policy "merged_update_public" on public."mtl_materials";
drop policy "merged_delete_public" on public."mtl_materials";
create policy "mtl_materials_select_authenticated" on public."mtl_materials" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_materials_write_admin" on public."mtl_materials" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_mto_revisions (public)
drop policy "merged_select_public" on public."mtl_mto_revisions";
drop policy "merged_insert_public" on public."mtl_mto_revisions";
drop policy "merged_update_public" on public."mtl_mto_revisions";
drop policy "merged_delete_public" on public."mtl_mto_revisions";
create policy "mtl_mto_revisions_select_authenticated" on public."mtl_mto_revisions" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_mto_revisions_write_admin" on public."mtl_mto_revisions" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_norms (authenticated)
drop policy "merged_select" on public."mtl_norms";
drop policy "merged_insert" on public."mtl_norms";
drop policy "merged_update" on public."mtl_norms";
drop policy "merged_delete" on public."mtl_norms";
create policy "mtl_norms_role_w" on public."mtl_norms" as permissive for all to authenticated
  using (mtl_allows(master_project_id, 'edit_items'::text))
  with check (mtl_allows(master_project_id, 'edit_items'::text));
create policy "mtl_norms_sel" on public."mtl_norms" as permissive for select to authenticated
  using (true);

-- mtl_package_items (authenticated)
drop policy "merged_select" on public."mtl_package_items";
drop policy "merged_insert" on public."mtl_package_items";
drop policy "merged_update" on public."mtl_package_items";
drop policy "merged_delete" on public."mtl_package_items";
create policy "mtl_package_items_role_w" on public."mtl_package_items" as permissive for all to authenticated
  using (mtl_allows(( SELECT mtl_packages.master_project_id
   FROM mtl_packages
  WHERE (mtl_packages.id = mtl_package_items.package_id)), 'edit_packages'::text))
  with check (mtl_allows(( SELECT mtl_packages.master_project_id
   FROM mtl_packages
  WHERE (mtl_packages.id = mtl_package_items.package_id)), 'edit_packages'::text));
create policy "mtl_package_items_sel" on public."mtl_package_items" as permissive for select to authenticated
  using (true);

-- mtl_packages (authenticated)
drop policy "merged_select" on public."mtl_packages";
drop policy "merged_insert" on public."mtl_packages";
drop policy "merged_update" on public."mtl_packages";
drop policy "merged_delete" on public."mtl_packages";
create policy "mtl_packages_role_w" on public."mtl_packages" as permissive for all to authenticated
  using (mtl_allows(master_project_id, 'edit_packages'::text))
  with check (mtl_allows(master_project_id, 'edit_packages'::text));
create policy "mtl_packages_sel" on public."mtl_packages" as permissive for select to authenticated
  using (true);

-- mtl_pattern_weights (authenticated)
drop policy "merged_select" on public."mtl_pattern_weights";
drop policy "merged_insert" on public."mtl_pattern_weights";
drop policy "merged_update" on public."mtl_pattern_weights";
drop policy "merged_delete" on public."mtl_pattern_weights";
create policy "mtl_pattern_weights_cfg" on public."mtl_pattern_weights" as permissive for all to authenticated
  using (mtl_can_configure())
  with check (mtl_can_configure());
create policy "mtl_pattern_weights_sel" on public."mtl_pattern_weights" as permissive for select to authenticated
  using (true);

-- mtl_patterns (authenticated)
drop policy "merged_select" on public."mtl_patterns";
drop policy "merged_insert" on public."mtl_patterns";
drop policy "merged_update" on public."mtl_patterns";
drop policy "merged_delete" on public."mtl_patterns";
create policy "mtl_patterns_cfg" on public."mtl_patterns" as permissive for all to authenticated
  using (mtl_can_configure())
  with check (mtl_can_configure());
create policy "mtl_patterns_sel" on public."mtl_patterns" as permissive for select to authenticated
  using (true);

-- mtl_po_lines (public)
drop policy "merged_select_public" on public."mtl_po_lines";
drop policy "merged_insert_public" on public."mtl_po_lines";
drop policy "merged_update_public" on public."mtl_po_lines";
drop policy "merged_delete_public" on public."mtl_po_lines";
create policy "mtl_po_lines_select_authenticated" on public."mtl_po_lines" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_po_lines_write_admin" on public."mtl_po_lines" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_procurement_lines (public)
drop policy "merged_select_public" on public."mtl_procurement_lines";
drop policy "merged_insert_public" on public."mtl_procurement_lines";
drop policy "merged_update_public" on public."mtl_procurement_lines";
drop policy "merged_delete_public" on public."mtl_procurement_lines";
create policy "mtl_procurement_lines_select_authenticated" on public."mtl_procurement_lines" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_procurement_lines_write_admin" on public."mtl_procurement_lines" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_procurement_requests (public)
drop policy "merged_select_public" on public."mtl_procurement_requests";
drop policy "merged_insert_public" on public."mtl_procurement_requests";
drop policy "merged_update_public" on public."mtl_procurement_requests";
drop policy "merged_delete_public" on public."mtl_procurement_requests";
create policy "mtl_procurement_requests_select_authenticated" on public."mtl_procurement_requests" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_procurement_requests_write_admin" on public."mtl_procurement_requests" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_purchase_orders (public)
drop policy "merged_select_public" on public."mtl_purchase_orders";
drop policy "merged_insert_public" on public."mtl_purchase_orders";
drop policy "merged_update_public" on public."mtl_purchase_orders";
drop policy "merged_delete_public" on public."mtl_purchase_orders";
create policy "mtl_purchase_orders_select_authenticated" on public."mtl_purchase_orders" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_purchase_orders_write_admin" on public."mtl_purchase_orders" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_release_lines (public)
drop policy "merged_select_public" on public."mtl_release_lines";
drop policy "merged_insert_public" on public."mtl_release_lines";
drop policy "merged_update_public" on public."mtl_release_lines";
drop policy "merged_delete_public" on public."mtl_release_lines";
create policy "mtl_release_lines_select_authenticated" on public."mtl_release_lines" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_release_lines_write_admin" on public."mtl_release_lines" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_release_notes (public)
drop policy "merged_select_public" on public."mtl_release_notes";
drop policy "merged_insert_public" on public."mtl_release_notes";
drop policy "merged_update_public" on public."mtl_release_notes";
drop policy "merged_delete_public" on public."mtl_release_notes";
create policy "mtl_release_notes_select_authenticated" on public."mtl_release_notes" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_release_notes_write_admin" on public."mtl_release_notes" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_shipment_lines (public)
drop policy "merged_select_public" on public."mtl_shipment_lines";
drop policy "merged_insert_public" on public."mtl_shipment_lines";
drop policy "merged_update_public" on public."mtl_shipment_lines";
drop policy "merged_delete_public" on public."mtl_shipment_lines";
create policy "mtl_shipment_lines_select_authenticated" on public."mtl_shipment_lines" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_shipment_lines_write_admin" on public."mtl_shipment_lines" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_shipments (public)
drop policy "merged_select_public" on public."mtl_shipments";
drop policy "merged_insert_public" on public."mtl_shipments";
drop policy "merged_update_public" on public."mtl_shipments";
drop policy "merged_delete_public" on public."mtl_shipments";
create policy "mtl_shipments_select_authenticated" on public."mtl_shipments" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_shipments_write_admin" on public."mtl_shipments" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_stage_defs (authenticated)
drop policy "merged_select" on public."mtl_stage_defs";
drop policy "merged_insert" on public."mtl_stage_defs";
drop policy "merged_update" on public."mtl_stage_defs";
drop policy "merged_delete" on public."mtl_stage_defs";
create policy "mtl_stage_defs_cfg" on public."mtl_stage_defs" as permissive for all to authenticated
  using (mtl_can_configure())
  with check (mtl_can_configure());
create policy "mtl_stage_defs_sel" on public."mtl_stage_defs" as permissive for select to authenticated
  using (true);

-- mtl_units (authenticated)
drop policy "merged_select" on public."mtl_units";
drop policy "merged_insert" on public."mtl_units";
drop policy "merged_update" on public."mtl_units";
drop policy "merged_delete" on public."mtl_units";
create policy "mtl_units_cfg" on public."mtl_units" as permissive for all to authenticated
  using (mtl_can_configure())
  with check (mtl_can_configure());
create policy "mtl_units_sel" on public."mtl_units" as permissive for select to authenticated
  using (true);

-- mtl_warehouse_lines (public)
drop policy "merged_select_public" on public."mtl_warehouse_lines";
drop policy "merged_insert_public" on public."mtl_warehouse_lines";
drop policy "merged_update_public" on public."mtl_warehouse_lines";
drop policy "merged_delete_public" on public."mtl_warehouse_lines";
create policy "mtl_warehouse_lines_select_authenticated" on public."mtl_warehouse_lines" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_warehouse_lines_write_admin" on public."mtl_warehouse_lines" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_warehouse_receipts (public)
drop policy "merged_select_public" on public."mtl_warehouse_receipts";
drop policy "merged_insert_public" on public."mtl_warehouse_receipts";
drop policy "merged_update_public" on public."mtl_warehouse_receipts";
drop policy "merged_delete_public" on public."mtl_warehouse_receipts";
create policy "mtl_warehouse_receipts_select_authenticated" on public."mtl_warehouse_receipts" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "mtl_warehouse_receipts_write_admin" on public."mtl_warehouse_receipts" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- mtl_weld_lines (authenticated)
drop policy "merged_select" on public."mtl_weld_lines";
drop policy "merged_insert" on public."mtl_weld_lines";
drop policy "merged_update" on public."mtl_weld_lines";
drop policy "merged_delete" on public."mtl_weld_lines";
create policy "mtl_weld_lines_sel" on public."mtl_weld_lines" as permissive for select to authenticated
  using (true);
create policy "mtl_weld_lines_w" on public."mtl_weld_lines" as permissive for all to authenticated
  using (mtl_allows(( SELECT mtl_weld_sets.master_project_id
   FROM mtl_weld_sets
  WHERE (mtl_weld_sets.id = mtl_weld_lines.set_id)), 'edit_items'::text))
  with check (mtl_allows(( SELECT mtl_weld_sets.master_project_id
   FROM mtl_weld_sets
  WHERE (mtl_weld_sets.id = mtl_weld_lines.set_id)), 'edit_items'::text));

-- mtl_weld_sets (authenticated)
drop policy "merged_select" on public."mtl_weld_sets";
drop policy "merged_insert" on public."mtl_weld_sets";
drop policy "merged_update" on public."mtl_weld_sets";
drop policy "merged_delete" on public."mtl_weld_sets";
create policy "mtl_weld_sets_sel" on public."mtl_weld_sets" as permissive for select to authenticated
  using (true);
create policy "mtl_weld_sets_w" on public."mtl_weld_sets" as permissive for all to authenticated
  using (mtl_allows(master_project_id, 'edit_items'::text))
  with check (mtl_allows(master_project_id, 'edit_items'::text));

-- organizations (public)
drop policy "merged_select" on public."organizations";
drop policy "merged_insert" on public."organizations";
drop policy "merged_update" on public."organizations";
drop policy "merged_delete" on public."organizations";
create policy "organizations_select_authenticated" on public."organizations" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "organizations_write_admin" on public."organizations" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- personality_behavioral_dimensions (public)
drop policy "merged_select" on public."personality_behavioral_dimensions";
drop policy "merged_insert" on public."personality_behavioral_dimensions";
drop policy "merged_update" on public."personality_behavioral_dimensions";
drop policy "merged_delete" on public."personality_behavioral_dimensions";
create policy "personality_behavioral_dimensions_select_authenticated" on public."personality_behavioral_dimensions" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "personality_behavioral_dimensions_write_admin" on public."personality_behavioral_dimensions" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- personality_dimension_scores (public)
drop policy "merged_select" on public."personality_dimension_scores";
drop policy "merged_insert" on public."personality_dimension_scores";
drop policy "merged_update" on public."personality_dimension_scores";
drop policy "merged_delete" on public."personality_dimension_scores";
create policy "personality_dimension_scores_select" on public."personality_dimension_scores" as permissive for select to public
  using (personality_can_access_assessment(personality_assessment_id));
create policy "personality_dimension_scores_write" on public."personality_dimension_scores" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- personality_facets (public)
drop policy "merged_select" on public."personality_facets";
drop policy "merged_insert" on public."personality_facets";
drop policy "merged_update" on public."personality_facets";
drop policy "merged_delete" on public."personality_facets";
create policy "personality_facets_select_authenticated" on public."personality_facets" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "personality_facets_write_admin" on public."personality_facets" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- personality_frameworks (public)
drop policy "merged_select" on public."personality_frameworks";
drop policy "merged_insert" on public."personality_frameworks";
drop policy "merged_update" on public."personality_frameworks";
drop policy "merged_delete" on public."personality_frameworks";
create policy "personality_frameworks_select_authenticated" on public."personality_frameworks" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "personality_frameworks_write_admin" on public."personality_frameworks" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- personality_job_behavioral_profiles (public)
drop policy "merged_select" on public."personality_job_behavioral_profiles";
drop policy "merged_insert" on public."personality_job_behavioral_profiles";
drop policy "merged_update" on public."personality_job_behavioral_profiles";
drop policy "merged_delete" on public."personality_job_behavioral_profiles";
create policy "personality_job_behavioral_profiles_select_authenticated" on public."personality_job_behavioral_profiles" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "personality_job_behavioral_profiles_write_admin" on public."personality_job_behavioral_profiles" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- personality_job_behavioral_requirements (public)
drop policy "merged_select" on public."personality_job_behavioral_requirements";
drop policy "merged_insert" on public."personality_job_behavioral_requirements";
drop policy "merged_update" on public."personality_job_behavioral_requirements";
drop policy "merged_delete" on public."personality_job_behavioral_requirements";
create policy "personality_job_behavioral_requirements_select_authenticated" on public."personality_job_behavioral_requirements" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "personality_job_behavioral_requirements_write_admin" on public."personality_job_behavioral_requirements" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- personality_module_admins (public)
drop policy "merged_select" on public."personality_module_admins";
drop policy "merged_insert" on public."personality_module_admins";
drop policy "merged_update" on public."personality_module_admins";
drop policy "merged_delete" on public."personality_module_admins";
create policy "personality_module_admins_select_authenticated" on public."personality_module_admins" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "personality_module_admins_write_admin" on public."personality_module_admins" as permissive for all to public
  using (personality_is_module_admin())
  with check (personality_is_module_admin());

-- personality_response_scales (public)
drop policy "merged_select" on public."personality_response_scales";
drop policy "merged_insert" on public."personality_response_scales";
drop policy "merged_update" on public."personality_response_scales";
drop policy "merged_delete" on public."personality_response_scales";
create policy "personality_response_scales_select_authenticated" on public."personality_response_scales" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "personality_response_scales_write_admin" on public."personality_response_scales" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- personality_responses (public)
drop policy "merged_select" on public."personality_responses";
drop policy "merged_insert" on public."personality_responses";
drop policy "merged_update" on public."personality_responses";
drop policy "merged_delete" on public."personality_responses";
create policy "personality_responses_select" on public."personality_responses" as permissive for select to public
  using (personality_can_access_assessment(personality_assessment_id));
create policy "personality_responses_write" on public."personality_responses" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- personality_traits (public)
drop policy "merged_select" on public."personality_traits";
drop policy "merged_insert" on public."personality_traits";
drop policy "merged_update" on public."personality_traits";
drop policy "merged_delete" on public."personality_traits";
create policy "personality_traits_select_authenticated" on public."personality_traits" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "personality_traits_write_admin" on public."personality_traits" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- personality_validity_results (public)
drop policy "merged_select" on public."personality_validity_results";
drop policy "merged_insert" on public."personality_validity_results";
drop policy "merged_update" on public."personality_validity_results";
drop policy "merged_delete" on public."personality_validity_results";
create policy "personality_validity_results_select" on public."personality_validity_results" as permissive for select to public
  using (personality_can_access_assessment(personality_assessment_id));
create policy "personality_validity_results_write" on public."personality_validity_results" as permissive for all to public
  using ((personality_is_module_admin() OR personality_is_assessment_designer()))
  with check ((personality_is_module_admin() OR personality_is_assessment_designer()));

-- pf_project_scores (authenticated)
drop policy "merged_select" on public."pf_project_scores";
drop policy "merged_insert" on public."pf_project_scores";
drop policy "merged_update" on public."pf_project_scores";
drop policy "merged_delete" on public."pf_project_scores";
create policy "pf_scores_read" on public."pf_project_scores" as permissive for select to authenticated
  using ((is_admin_user() OR rasta_user_can_access_master_project(master_project_id)));
create policy "pf_scores_write" on public."pf_project_scores" as permissive for all to authenticated
  using (pf_can_score())
  with check (pf_can_score());

-- pf_settings (authenticated)
drop policy "merged_select" on public."pf_settings";
drop policy "merged_insert" on public."pf_settings";
drop policy "merged_update" on public."pf_settings";
drop policy "merged_delete" on public."pf_settings";
create policy "pf_settings_read" on public."pf_settings" as permissive for select to authenticated
  using (true);
create policy "pf_settings_write" on public."pf_settings" as permissive for all to authenticated
  using (pf_can_govern())
  with check (pf_can_govern());

-- plc_activities (public)
drop policy "merged_select" on public."plc_activities";
drop policy "merged_insert" on public."plc_activities";
drop policy "merged_update" on public."plc_activities";
drop policy "merged_delete" on public."plc_activities";
create policy "plc_activities_select_authenticated" on public."plc_activities" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_activities_write_authenticated" on public."plc_activities" as permissive for all to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL))
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- plc_checklist_items (public)
drop policy "merged_select" on public."plc_checklist_items";
drop policy "merged_insert" on public."plc_checklist_items";
drop policy "merged_update" on public."plc_checklist_items";
drop policy "merged_delete" on public."plc_checklist_items";
create policy "plc_checklist_items_select_authenticated" on public."plc_checklist_items" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_checklist_items_write_authenticated" on public."plc_checklist_items" as permissive for all to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL))
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- plc_early_warnings (public)
drop policy "merged_select" on public."plc_early_warnings";
drop policy "merged_insert" on public."plc_early_warnings";
drop policy "merged_update" on public."plc_early_warnings";
drop policy "merged_delete" on public."plc_early_warnings";
create policy "plc_warnings_select_authenticated" on public."plc_early_warnings" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_warnings_write_authenticated" on public."plc_early_warnings" as permissive for all to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL))
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- plc_health_scores (public)
drop policy "merged_select" on public."plc_health_scores";
drop policy "merged_insert" on public."plc_health_scores";
drop policy "merged_update" on public."plc_health_scores";
drop policy "merged_delete" on public."plc_health_scores";
create policy "plc_health_select_authenticated" on public."plc_health_scores" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_health_write_authenticated" on public."plc_health_scores" as permissive for all to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL))
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- plc_milestones (public)
drop policy "merged_select" on public."plc_milestones";
drop policy "merged_insert" on public."plc_milestones";
drop policy "merged_update" on public."plc_milestones";
drop policy "merged_delete" on public."plc_milestones";
create policy "plc_milestones_select_authenticated" on public."plc_milestones" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_milestones_write_authenticated" on public."plc_milestones" as permissive for all to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL))
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- plc_project_gates (public)
drop policy "merged_select" on public."plc_project_gates";
drop policy "merged_insert" on public."plc_project_gates";
drop policy "merged_update" on public."plc_project_gates";
drop policy "merged_delete" on public."plc_project_gates";
create policy "plc_project_gates_select_authenticated" on public."plc_project_gates" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_project_gates_write_authenticated" on public."plc_project_gates" as permissive for all to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL))
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- plc_project_lifecycle (public)
drop policy "merged_select" on public."plc_project_lifecycle";
drop policy "merged_insert" on public."plc_project_lifecycle";
drop policy "merged_update" on public."plc_project_lifecycle";
drop policy "merged_delete" on public."plc_project_lifecycle";
create policy "plc_project_lifecycle_select_authenticated" on public."plc_project_lifecycle" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_project_lifecycle_write_authenticated" on public."plc_project_lifecycle" as permissive for all to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL))
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- plc_project_stages (public)
drop policy "merged_select" on public."plc_project_stages";
drop policy "merged_insert" on public."plc_project_stages";
drop policy "merged_update" on public."plc_project_stages";
drop policy "merged_delete" on public."plc_project_stages";
create policy "plc_project_stages_select_authenticated" on public."plc_project_stages" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_project_stages_write_authenticated" on public."plc_project_stages" as permissive for all to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL))
  with check ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- plc_template_checklist_items (public)
drop policy "merged_select" on public."plc_template_checklist_items";
drop policy "merged_insert" on public."plc_template_checklist_items";
drop policy "merged_update" on public."plc_template_checklist_items";
drop policy "merged_delete" on public."plc_template_checklist_items";
create policy "plc_template_checklist_select_authenticated" on public."plc_template_checklist_items" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_template_checklist_write_admin" on public."plc_template_checklist_items" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- plc_template_stages (public)
drop policy "merged_select" on public."plc_template_stages";
drop policy "merged_insert" on public."plc_template_stages";
drop policy "merged_update" on public."plc_template_stages";
drop policy "merged_delete" on public."plc_template_stages";
create policy "plc_template_stages_select_authenticated" on public."plc_template_stages" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_template_stages_write_admin" on public."plc_template_stages" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- plc_templates (public)
drop policy "merged_select" on public."plc_templates";
drop policy "merged_insert" on public."plc_templates";
drop policy "merged_update" on public."plc_templates";
drop policy "merged_delete" on public."plc_templates";
create policy "plc_templates_select_authenticated" on public."plc_templates" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "plc_templates_write_admin" on public."plc_templates" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- portfolios (public)
drop policy "merged_select" on public."portfolios";
drop policy "merged_insert" on public."portfolios";
drop policy "merged_update" on public."portfolios";
drop policy "merged_delete" on public."portfolios";
create policy "portfolios_select_authenticated" on public."portfolios" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "portfolios_write_admin" on public."portfolios" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- programs (public)
drop policy "merged_select" on public."programs";
drop policy "merged_insert" on public."programs";
drop policy "merged_update" on public."programs";
drop policy "merged_delete" on public."programs";
create policy "programs_select_authenticated" on public."programs" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "programs_write_admin" on public."programs" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- project_phases (public)
drop policy "merged_select" on public."project_phases";
drop policy "merged_insert" on public."project_phases";
drop policy "merged_update" on public."project_phases";
drop policy "merged_delete" on public."project_phases";
create policy "project_phases_select_authenticated" on public."project_phases" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "project_phases_write_admin" on public."project_phases" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- pst_contract_cfg (authenticated)
drop policy "merged_select" on public."pst_contract_cfg";
drop policy "merged_insert" on public."pst_contract_cfg";
drop policy "merged_update" on public."pst_contract_cfg";
drop policy "merged_delete" on public."pst_contract_cfg";
create policy "pst_cfg_sel" on public."pst_contract_cfg" as permissive for select to authenticated
  using (pst_can_view(master_project_id));
create policy "pst_cfg_wr" on public."pst_contract_cfg" as permissive for all to authenticated
  using (pst_can_approve(master_project_id))
  with check (pst_can_approve(master_project_id));

-- pst_pay_sequences (authenticated)
drop policy "merged_select" on public."pst_pay_sequences";
drop policy "merged_insert" on public."pst_pay_sequences";
drop policy "merged_update" on public."pst_pay_sequences";
drop policy "merged_delete" on public."pst_pay_sequences";
create policy "pst_seq_sel" on public."pst_pay_sequences" as permissive for select to authenticated
  using (pst_can_view(master_project_id));
create policy "pst_seq_wr" on public."pst_pay_sequences" as permissive for all to authenticated
  using (pst_can_approve(master_project_id))
  with check (pst_can_approve(master_project_id));

-- rasta_modules (public)
drop policy "merged_select" on public."rasta_modules";
drop policy "merged_insert" on public."rasta_modules";
drop policy "merged_update" on public."rasta_modules";
drop policy "merged_delete" on public."rasta_modules";
create policy "rasta_modules_select_authenticated" on public."rasta_modules" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "rasta_modules_write_admin" on public."rasta_modules" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_permissions (public)
drop policy "merged_select" on public."rasta_permissions";
drop policy "merged_insert" on public."rasta_permissions";
drop policy "merged_update" on public."rasta_permissions";
drop policy "merged_delete" on public."rasta_permissions";
create policy "rasta_permissions_select_authenticated" on public."rasta_permissions" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "rasta_permissions_write_admin" on public."rasta_permissions" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_project_mappings (public)
drop policy "merged_select" on public."rasta_project_mappings";
drop policy "merged_insert" on public."rasta_project_mappings";
drop policy "merged_update" on public."rasta_project_mappings";
drop policy "merged_delete" on public."rasta_project_mappings";
create policy "rasta_project_mappings_select_authenticated" on public."rasta_project_mappings" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "rasta_project_mappings_write_admin" on public."rasta_project_mappings" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_project_role_assignments (public)
drop policy "merged_select" on public."rasta_project_role_assignments";
drop policy "merged_insert" on public."rasta_project_role_assignments";
drop policy "merged_update" on public."rasta_project_role_assignments";
drop policy "merged_delete" on public."rasta_project_role_assignments";
create policy "rasta_project_role_assignments_select_authenticated" on public."rasta_project_role_assignments" as permissive for select to public
  using (((user_id = ( SELECT auth.uid() AS uid)) OR rasta_user_can_access_master_project(project_id)));
create policy "rasta_project_role_assignments_write_admin" on public."rasta_project_role_assignments" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_project_roles (public)
drop policy "merged_select" on public."rasta_project_roles";
drop policy "merged_insert" on public."rasta_project_roles";
drop policy "merged_update" on public."rasta_project_roles";
drop policy "merged_delete" on public."rasta_project_roles";
create policy "rasta_project_roles_select_authenticated" on public."rasta_project_roles" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "rasta_project_roles_write_admin" on public."rasta_project_roles" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_role_permissions (public)
drop policy "merged_select" on public."rasta_role_permissions";
drop policy "merged_insert" on public."rasta_role_permissions";
drop policy "merged_update" on public."rasta_role_permissions";
drop policy "merged_delete" on public."rasta_role_permissions";
create policy "rasta_role_permissions_select_authenticated" on public."rasta_role_permissions" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "rasta_role_permissions_write_admin" on public."rasta_role_permissions" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_roles (public)
drop policy "merged_select" on public."rasta_roles";
drop policy "merged_insert" on public."rasta_roles";
drop policy "merged_update" on public."rasta_roles";
drop policy "merged_delete" on public."rasta_roles";
create policy "rasta_roles_select_authenticated" on public."rasta_roles" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "rasta_roles_write_admin" on public."rasta_roles" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_user_module_access (public)
drop policy "merged_select" on public."rasta_user_module_access";
drop policy "merged_insert" on public."rasta_user_module_access";
drop policy "merged_update" on public."rasta_user_module_access";
drop policy "merged_delete" on public."rasta_user_module_access";
create policy "rasta_user_module_access_select_self_or_admin" on public."rasta_user_module_access" as permissive for select to public
  using ((is_admin_user() OR (user_id = ( SELECT auth.uid() AS uid))));
create policy "rasta_user_module_access_write_admin" on public."rasta_user_module_access" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_user_permission_overrides (public)
drop policy "merged_select" on public."rasta_user_permission_overrides";
drop policy "merged_insert" on public."rasta_user_permission_overrides";
drop policy "merged_update" on public."rasta_user_permission_overrides";
drop policy "merged_delete" on public."rasta_user_permission_overrides";
create policy "rasta_user_permission_overrides_select" on public."rasta_user_permission_overrides" as permissive for select to public
  using ((is_admin_user() OR (user_id = ( SELECT auth.uid() AS uid))));
create policy "rasta_user_permission_overrides_write_admin" on public."rasta_user_permission_overrides" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_user_project_scope (public)
drop policy "merged_select" on public."rasta_user_project_scope";
drop policy "merged_insert" on public."rasta_user_project_scope";
drop policy "merged_update" on public."rasta_user_project_scope";
drop policy "merged_delete" on public."rasta_user_project_scope";
create policy "rasta_user_project_scope_select_self_or_admin" on public."rasta_user_project_scope" as permissive for select to public
  using ((is_admin_user() OR (user_id = ( SELECT auth.uid() AS uid))));
create policy "rasta_user_project_scope_write_admin" on public."rasta_user_project_scope" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rasta_user_roles (public)
drop policy "merged_select" on public."rasta_user_roles";
drop policy "merged_insert" on public."rasta_user_roles";
drop policy "merged_update" on public."rasta_user_roles";
drop policy "merged_delete" on public."rasta_user_roles";
create policy "rasta_user_roles_select_self_or_admin" on public."rasta_user_roles" as permissive for select to public
  using ((is_admin_user() OR (user_id = ( SELECT auth.uid() AS uid))));
create policy "rasta_user_roles_write_admin" on public."rasta_user_roles" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());

-- rm_categories (public)
drop policy "merged_select" on public."rm_categories";
drop policy "merged_insert" on public."rm_categories";
drop policy "merged_update" on public."rm_categories";
drop policy "merged_delete" on public."rm_categories";
create policy "rm_cat_admin" on public."rm_categories" as permissive for all to public
  using (is_admin_user())
  with check (is_admin_user());
create policy "rm_cat_read" on public."rm_categories" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));

-- rm_contingency_plans (public)
drop policy "merged_select" on public."rm_contingency_plans";
drop policy "merged_insert" on public."rm_contingency_plans";
drop policy "merged_update" on public."rm_contingency_plans";
drop policy "merged_delete" on public."rm_contingency_plans";
create policy "rm_cont_sel" on public."rm_contingency_plans" as permissive for select to public
  using (rm_can_view(rm_risk_project(risk_id)));
create policy "rm_cont_wr" on public."rm_contingency_plans" as permissive for all to public
  using (rm_can_write_risk(risk_id))
  with check (rm_can_write_risk(risk_id));

-- rm_controls (public)
drop policy "merged_select" on public."rm_controls";
drop policy "merged_insert" on public."rm_controls";
drop policy "merged_update" on public."rm_controls";
drop policy "merged_delete" on public."rm_controls";
create policy "rm_controls_sel" on public."rm_controls" as permissive for select to public
  using (rm_can_view(rm_risk_project(risk_id)));
create policy "rm_controls_wr" on public."rm_controls" as permissive for all to public
  using (rm_can_write_risk(risk_id))
  with check (rm_can_write_risk(risk_id));

-- rm_kris (public)
drop policy "merged_select" on public."rm_kris";
drop policy "merged_insert" on public."rm_kris";
drop policy "merged_update" on public."rm_kris";
drop policy "merged_delete" on public."rm_kris";
create policy "rm_kris_sel" on public."rm_kris" as permissive for select to public
  using (rm_can_view(project_id));
create policy "rm_kris_wr" on public."rm_kris" as permissive for all to public
  using ((rm_can_edit(project_id) OR is_admin_user() OR (owner_id = ( SELECT auth.uid() AS uid))))
  with check ((rm_can_edit(project_id) OR is_admin_user() OR (owner_id = ( SELECT auth.uid() AS uid))));

-- rm_policy (public)
drop policy "merged_select" on public."rm_policy";
drop policy "merged_insert" on public."rm_policy";
drop policy "merged_update" on public."rm_policy";
drop policy "merged_delete" on public."rm_policy";
create policy "rm_policy_sel" on public."rm_policy" as permissive for select to public
  using ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy "rm_policy_wr" on public."rm_policy" as permissive for all to public
  using ((is_admin_user() OR ((project_id IS NOT NULL) AND rm_can_manage(project_id))))
  with check ((is_admin_user() OR ((project_id IS NOT NULL) AND rm_can_manage(project_id))));

-- rm_risk_actions (public)
drop policy "merged_select" on public."rm_risk_actions";
drop policy "merged_insert" on public."rm_risk_actions";
drop policy "merged_update" on public."rm_risk_actions";
drop policy "merged_delete" on public."rm_risk_actions";
create policy "rm_actions_select_member" on public."rm_risk_actions" as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM rm_risks r
  WHERE ((r.id = rm_risk_actions.risk_id) AND (rm_is_project_member(r.project_id) OR is_admin_user() OR rasta_scope_ok_for_source('risk'::text, r.project_id))))));
create policy "rm_actions_write_editor" on public."rm_risk_actions" as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM rm_risks r
  WHERE ((r.id = rm_risk_actions.risk_id) AND (rm_can_edit(r.project_id) OR (r.owner_id = ( SELECT auth.uid() AS uid)) OR is_admin_user())))))
  with check ((EXISTS ( SELECT 1
   FROM rm_risks r
  WHERE ((r.id = rm_risk_actions.risk_id) AND (rm_can_edit(r.project_id) OR (r.owner_id = ( SELECT auth.uid() AS uid)) OR is_admin_user())))));

-- rm_risk_evidence (public)
drop policy "merged_select" on public."rm_risk_evidence";
drop policy "merged_insert" on public."rm_risk_evidence";
drop policy "merged_update" on public."rm_risk_evidence";
drop policy "merged_delete" on public."rm_risk_evidence";
create policy "rm_evid_sel" on public."rm_risk_evidence" as permissive for select to public
  using (rm_can_view(rm_risk_project(risk_id)));
create policy "rm_evid_wr" on public."rm_risk_evidence" as permissive for all to public
  using (rm_can_write_risk(risk_id))
  with check (rm_can_write_risk(risk_id));

-- rm_risk_links (public)
drop policy "merged_select" on public."rm_risk_links";
drop policy "merged_insert" on public."rm_risk_links";
drop policy "merged_update" on public."rm_risk_links";
drop policy "merged_delete" on public."rm_risk_links";
create policy "rm_links_sel" on public."rm_risk_links" as permissive for select to public
  using (rm_can_view(rm_risk_project(risk_id)));
create policy "rm_links_wr" on public."rm_risk_links" as permissive for all to public
  using (rm_can_write_risk(risk_id))
  with check (rm_can_write_risk(risk_id));

-- rp_finding_reviews (authenticated)
drop policy "merged_select" on public."rp_finding_reviews";
drop policy "merged_insert" on public."rp_finding_reviews";
drop policy "merged_update" on public."rp_finding_reviews";
drop policy "merged_delete" on public."rp_finding_reviews";
create policy "rp_finding_reviews_read" on public."rp_finding_reviews" as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM rasta_report_snapshots s
  WHERE ((s.id = rp_finding_reviews.snapshot_id) AND (is_admin_user() OR rasta_user_can_access_master_project(s.master_project_id))))));
create policy "rp_finding_reviews_write" on public."rp_finding_reviews" as permissive for all to authenticated
  using (rp_can_review())
  with check ((rp_can_review() AND (reviewed_by = ( SELECT auth.uid() AS uid))));

-- rp_thresholds (authenticated)
drop policy "merged_select" on public."rp_thresholds";
drop policy "merged_insert" on public."rp_thresholds";
drop policy "merged_update" on public."rp_thresholds";
drop policy "merged_delete" on public."rp_thresholds";
create policy "rp_thresholds_read" on public."rp_thresholds" as permissive for select to authenticated
  using (true);
create policy "rp_thresholds_write" on public."rp_thresholds" as permissive for all to authenticated
  using (rp_can_configure())
  with check (rp_can_configure());

-- spools (public)
drop policy "merged_select" on public."spools";
drop policy "merged_insert" on public."spools";
drop policy "merged_update" on public."spools";
drop policy "merged_delete" on public."spools";
create policy "spools_select_member" on public."spools" as permissive for select to public
  using ((is_project_member(project_id) OR is_admin_user()));
create policy "spools_write_editor" on public."spools" as permissive for all to public
  using ((can_edit_project(project_id) OR (project_role(project_id) = 'owner'::text) OR is_admin_user()))
  with check ((can_edit_project(project_id) OR (project_role(project_id) = 'owner'::text) OR is_admin_user()));

-- sv_attendance (public)
drop policy "merged_select" on public."sv_attendance";
drop policy "merged_insert" on public."sv_attendance";
drop policy "merged_update" on public."sv_attendance";
drop policy "merged_delete" on public."sv_attendance";
create policy "sv_attendance_del" on public."sv_attendance" as permissive for delete to public
  using ((sv_is_head(master_project_id) AND (NOT sv_day_locked(master_project_id, day))));
create policy "sv_attendance_ins" on public."sv_attendance" as permissive for insert to public
  with check ((sv_is_head(master_project_id) AND (NOT sv_day_locked(master_project_id, day)) AND sv_entry_ok(master_project_id, day, status, late_reason)));
create policy "sv_attendance_read" on public."sv_attendance" as permissive for select to public
  using (sv_can_read(master_project_id));
create policy "sv_attendance_upd" on public."sv_attendance" as permissive for update to public
  using ((sv_is_head(master_project_id) AND (NOT sv_day_locked(master_project_id, day))))
  with check ((sv_is_head(master_project_id) AND (NOT sv_day_locked(master_project_id, day)) AND sv_entry_ok(master_project_id, day, status, late_reason)));
create policy "sv_attendance_write_retired" on public."sv_attendance" as permissive for all to public
  using (false)
  with check (false);

-- sv_clock_events (public)
drop policy "merged_select" on public."sv_clock_events";
drop policy "merged_insert" on public."sv_clock_events";
drop policy "merged_update" on public."sv_clock_events";
drop policy "merged_delete" on public."sv_clock_events";
create policy "sv_clock_events_del" on public."sv_clock_events" as permissive for delete to public
  using (sv_can_write(master_project_id));
create policy "sv_clock_events_ins" on public."sv_clock_events" as permissive for insert to public
  with check (sv_can_write(master_project_id));
create policy "sv_clock_events_read" on public."sv_clock_events" as permissive for select to public
  using (sv_can_read(master_project_id));
create policy "sv_clock_events_upd" on public."sv_clock_events" as permissive for update to public
  using (sv_can_write(master_project_id))
  with check (sv_can_write(master_project_id));
create policy "sv_clock_events_write_retired" on public."sv_clock_events" as permissive for all to public
  using (false)
  with check (false);

-- sv_guest_meals (public)
drop policy "merged_select" on public."sv_guest_meals";
drop policy "merged_insert" on public."sv_guest_meals";
drop policy "merged_update" on public."sv_guest_meals";
drop policy "merged_delete" on public."sv_guest_meals";
create policy "sv_guest_meals_del" on public."sv_guest_meals" as permissive for delete to public
  using ((sv_can_write(master_project_id) AND (NOT sv_day_locked(master_project_id, day))));
create policy "sv_guest_meals_ins" on public."sv_guest_meals" as permissive for insert to public
  with check ((sv_can_write(master_project_id) AND (NOT sv_day_locked(master_project_id, day)) AND sv_entry_ok(master_project_id, day, NULL::text, late_reason)));
create policy "sv_guest_meals_read" on public."sv_guest_meals" as permissive for select to public
  using (sv_can_read(master_project_id));
create policy "sv_guest_meals_upd" on public."sv_guest_meals" as permissive for update to public
  using ((sv_can_write(master_project_id) AND (NOT sv_day_locked(master_project_id, day))))
  with check ((sv_can_write(master_project_id) AND (NOT sv_day_locked(master_project_id, day)) AND sv_entry_ok(master_project_id, day, NULL::text, late_reason)));
create policy "sv_guest_meals_write_retired" on public."sv_guest_meals" as permissive for all to public
  using (false)
  with check (false);

-- sv_menu (public)
drop policy "merged_select" on public."sv_menu";
drop policy "merged_insert" on public."sv_menu";
drop policy "merged_update" on public."sv_menu";
drop policy "merged_delete" on public."sv_menu";
create policy "sv_menu_del" on public."sv_menu" as permissive for delete to public
  using ((sv_is_head(master_project_id) OR sv_can_write(master_project_id)));
create policy "sv_menu_ins" on public."sv_menu" as permissive for insert to public
  with check ((sv_is_head(master_project_id) OR sv_can_write(master_project_id)));
create policy "sv_menu_read" on public."sv_menu" as permissive for select to public
  using (sv_can_read(master_project_id));
create policy "sv_menu_upd" on public."sv_menu" as permissive for update to public
  using ((sv_is_head(master_project_id) OR sv_can_write(master_project_id)))
  with check ((sv_is_head(master_project_id) OR sv_can_write(master_project_id)));
create policy "sv_menu_write_retired" on public."sv_menu" as permissive for all to public
  using (false)
  with check (false);

-- sv_people (public)
drop policy "merged_select" on public."sv_people";
drop policy "merged_insert" on public."sv_people";
drop policy "merged_update" on public."sv_people";
drop policy "merged_delete" on public."sv_people";
create policy "sv_people_del" on public."sv_people" as permissive for delete to public
  using (sv_can_write(master_project_id));
create policy "sv_people_ins" on public."sv_people" as permissive for insert to public
  with check (sv_can_write(master_project_id));
create policy "sv_people_read" on public."sv_people" as permissive for select to public
  using (sv_can_read(master_project_id));
create policy "sv_people_upd" on public."sv_people" as permissive for update to public
  using (sv_can_write(master_project_id))
  with check (sv_can_write(master_project_id));
create policy "sv_people_write_retired" on public."sv_people" as permissive for all to public
  using (false)
  with check (false);

-- sv_settings (public)
drop policy "merged_select" on public."sv_settings";
drop policy "merged_insert" on public."sv_settings";
drop policy "merged_update" on public."sv_settings";
drop policy "merged_delete" on public."sv_settings";
create policy "sv_settings_del" on public."sv_settings" as permissive for delete to public
  using (sv_can_write(master_project_id));
create policy "sv_settings_ins" on public."sv_settings" as permissive for insert to public
  with check (sv_can_write(master_project_id));
create policy "sv_settings_read" on public."sv_settings" as permissive for select to public
  using (sv_can_read(master_project_id));
create policy "sv_settings_upd" on public."sv_settings" as permissive for update to public
  using (sv_can_write(master_project_id))
  with check (sv_can_write(master_project_id));
create policy "sv_settings_write_retired" on public."sv_settings" as permissive for all to public
  using (false)
  with check (false);

-- sv_sites (public)
drop policy "merged_select" on public."sv_sites";
drop policy "merged_insert" on public."sv_sites";
drop policy "merged_update" on public."sv_sites";
drop policy "merged_delete" on public."sv_sites";
create policy "sv_sites_del" on public."sv_sites" as permissive for delete to public
  using (sv_can_write(master_project_id));
create policy "sv_sites_ins" on public."sv_sites" as permissive for insert to public
  with check (sv_can_write(master_project_id));
create policy "sv_sites_read" on public."sv_sites" as permissive for select to public
  using (sv_can_read(master_project_id));
create policy "sv_sites_upd" on public."sv_sites" as permissive for update to public
  using (sv_can_write(master_project_id))
  with check (sv_can_write(master_project_id));
create policy "sv_sites_write_retired" on public."sv_sites" as permissive for all to public
  using (false)
  with check (false);

-- sv_vehicle_days (public)
drop policy "merged_select" on public."sv_vehicle_days";
drop policy "merged_insert" on public."sv_vehicle_days";
drop policy "merged_update" on public."sv_vehicle_days";
drop policy "merged_delete" on public."sv_vehicle_days";
create policy "sv_vehicle_days_del" on public."sv_vehicle_days" as permissive for delete to public
  using ((sv_can_write(master_project_id) AND (NOT sv_day_locked(master_project_id, day))));
create policy "sv_vehicle_days_ins" on public."sv_vehicle_days" as permissive for insert to public
  with check ((sv_can_write(master_project_id) AND (NOT sv_day_locked(master_project_id, day)) AND sv_entry_ok(master_project_id, day, NULL::text, late_reason)));
create policy "sv_vehicle_days_read" on public."sv_vehicle_days" as permissive for select to public
  using (sv_can_read(master_project_id));
create policy "sv_vehicle_days_upd" on public."sv_vehicle_days" as permissive for update to public
  using ((sv_can_write(master_project_id) AND (NOT sv_day_locked(master_project_id, day))))
  with check ((sv_can_write(master_project_id) AND (NOT sv_day_locked(master_project_id, day)) AND sv_entry_ok(master_project_id, day, NULL::text, late_reason)));
create policy "sv_vehicle_days_write_retired" on public."sv_vehicle_days" as permissive for all to public
  using (false)
  with check (false);

-- sv_vehicles (public)
drop policy "merged_select" on public."sv_vehicles";
drop policy "merged_insert" on public."sv_vehicles";
drop policy "merged_update" on public."sv_vehicles";
drop policy "merged_delete" on public."sv_vehicles";
create policy "sv_vehicles_del" on public."sv_vehicles" as permissive for delete to public
  using (sv_can_write(master_project_id));
create policy "sv_vehicles_ins" on public."sv_vehicles" as permissive for insert to public
  with check (sv_can_write(master_project_id));
create policy "sv_vehicles_read" on public."sv_vehicles" as permissive for select to public
  using (sv_can_read(master_project_id));
create policy "sv_vehicles_upd" on public."sv_vehicles" as permissive for update to public
  using (sv_can_write(master_project_id))
  with check (sv_can_write(master_project_id));
create policy "sv_vehicles_write_retired" on public."sv_vehicles" as permissive for all to public
  using (false)
  with check (false);

commit;
