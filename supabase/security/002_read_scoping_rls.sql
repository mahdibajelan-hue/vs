-- ============================================================================
-- Security hardening 002 — scope SELECT (read) policies to project membership
-- ============================================================================
-- Finding (Broken Object-Level Authorization / IDOR, High): across the
-- execution, finance, material, change-management and estimator modules ~90
-- tables had `SELECT USING (true)` — writes were correctly gated by project
-- role, but ANY authenticated user could read EVERY row of EVERY project. In a
-- multi-organisation EPC platform that means one company's user could read
-- another company's financial budgets, cashflow plans, material requisitions,
-- NCRs, statements (صورت‌وضعیت) and daily reports.
--
-- Fix: rewrite each open SELECT policy to the module's existing "can view"
-- predicate, scoped by the row's project:
--   * execution tables           → ex_can_view(project_id)           (admin OR
--                                    an active ex/mtl project role)
--   * execution child tables     → ex_can_view() of the parent's project
--   * finance / material / report → is_admin_user() OR
--                                    rasta_user_can_access_master_project(mpid)
--   * child tables               → same, through the parent row
-- Admins (is_admin_user()) keep full visibility, so portfolio/radar dashboards
-- are unaffected. Genuine GLOBAL catalogs with no project column (units, stage
-- defs, benchmarks, CM rule/route library, shared form/link templates, finance
-- dropdown config, app-wide finance settings) are intentionally left readable
-- and are listed at the bottom for the record.
--
-- Safety: uses ALTER POLICY only — no DROP / DELETE / TRUNCATE, no data touched.
-- It rewrites a table's SELECT policy only while that policy's USING is still
-- `true`, so it is fully idempotent and safe to re-run. Rollback: 002_..._rollback.sql
-- ============================================================================

begin;

do $$
declare
  r record;
  pname text;
begin
  for r in
    select * from (values
      -- ---- execution: direct project_id -> ex_can_view(project_id) ----
      ('ex_action_map',        'ex_can_view(ex_action_map.project_id)'),
      ('ex_activities',        'ex_can_view(ex_activities.project_id)'),
      ('ex_activity_deps',     'ex_can_view(ex_activity_deps.project_id)'),
      ('ex_audit',             'ex_can_view(ex_audit.project_id)'),
      ('ex_baselines',         'ex_can_view(ex_baselines.project_id)'),
      ('ex_doc_links',         'ex_can_view(ex_doc_links.project_id)'),
      ('ex_eng_docs',          'ex_can_view(ex_eng_docs.project_id)'),
      ('ex_form_activity_map', 'ex_can_view(ex_form_activity_map.project_id)'),
      ('ex_form_entries',      'ex_can_view(ex_form_entries.project_id)'),
      ('ex_form_proposals',    'ex_can_view(ex_form_proposals.project_id)'),
      ('ex_gap_items',         'ex_can_view(ex_gap_items.project_id)'),
      ('ex_legal_text',        'ex_can_view(ex_legal_text.project_id)'),
      ('ex_line_welds',        'ex_can_view(ex_line_welds.project_id)'),
      ('ex_links',             'ex_can_view(ex_links.project_id)'),
      ('ex_lookahead',         'ex_can_view(ex_lookahead.project_id)'),
      ('ex_measurements',      'ex_can_view(ex_measurements.project_id)'),
      ('ex_ncr',               'ex_can_view(ex_ncr.project_id)'),
      ('ex_prereqs',           'ex_can_view(ex_prereqs.project_id)'),
      ('ex_price_books',       'ex_can_view(ex_price_books.project_id)'),
      ('ex_qc_findings',       'ex_can_view(ex_qc_findings.project_id)'),
      ('ex_report_archive',    'ex_can_view(ex_report_archive.project_id)'),
      ('ex_report_links',      'ex_can_view(ex_report_links.project_id)'),
      ('ex_report_signatures', 'ex_can_view(ex_report_signatures.project_id)'),
      ('ex_reports',           'ex_can_view(ex_reports.project_id)'),
      ('ex_required_forms',    'ex_can_view(ex_required_forms.project_id)'),
      ('ex_schedule_imports',  'ex_can_view(ex_schedule_imports.project_id)'),
      ('ex_settings',          'ex_can_view(ex_settings.project_id)'),
      ('ex_sign_slots',        'ex_can_view(ex_sign_slots.project_id)'),
      ('ex_statement_rows',    'ex_can_view(ex_statement_rows.project_id)'),
      ('ex_statements',        'ex_can_view(ex_statements.project_id)'),
      ('ex_weld_attr_history', 'ex_can_view(ex_weld_attr_history.project_id)'),
      ('ex_weld_conflicts',    'ex_can_view(ex_weld_conflicts.project_id)'),
      ('ex_weld_dismissals',   'ex_can_view(ex_weld_dismissals.project_id)'),
      ('ex_weld_merges',       'ex_can_view(ex_weld_merges.project_id)'),
      ('ex_welds',             'ex_can_view(ex_welds.project_id)'),
      ('ex_work_actions',      'ex_can_view(ex_work_actions.project_id)'),
      ('ex_project_roles',     'ex_can_view(ex_project_roles.project_id) or ex_project_roles.user_id = auth.uid()'),
      -- ---- execution: child tables scoped through their parent row ----
      ('ex_crew_logs',         'exists (select 1 from ex_reports r where r.id = ex_crew_logs.report_id and ex_can_view(r.project_id))'),
      ('ex_report_history',    'exists (select 1 from ex_reports r where r.id = ex_report_history.report_id and ex_can_view(r.project_id))'),
      ('ex_report_lines',      'exists (select 1 from ex_reports r where r.id = ex_report_lines.report_id and ex_can_view(r.project_id))'),
      ('ex_report_resources',  'exists (select 1 from ex_reports r where r.id = ex_report_resources.report_id and ex_can_view(r.project_id))'),
      ('ex_report_stoppages',  'exists (select 1 from ex_reports r where r.id = ex_report_stoppages.report_id and ex_can_view(r.project_id))'),
      ('ex_report_versions',   'exists (select 1 from ex_reports r where r.id = ex_report_versions.report_id and ex_can_view(r.project_id))'),
      ('ex_baseline_lines',    'exists (select 1 from ex_baselines b where b.id = ex_baseline_lines.baseline_id and ex_can_view(b.project_id))'),
      ('ex_ncr_events',        'exists (select 1 from ex_ncr n where n.id = ex_ncr_events.ncr_id and ex_can_view(n.project_id))'),
      ('ex_ncr_links',         'exists (select 1 from ex_ncr n where n.id = ex_ncr_links.ncr_id and ex_can_view(n.project_id))'),
      ('ex_price_items',       'exists (select 1 from ex_price_books b where b.id = ex_price_items.book_id and ex_can_view(b.project_id))'),
      -- ---- finance: master_project_id ----
      ('fin_audit',            '(is_admin_user() or rasta_user_can_access_master_project(fin_audit.master_project_id))'),
      ('fin_budget_lines',     '(is_admin_user() or rasta_user_can_access_master_project(fin_budget_lines.master_project_id))'),
      ('fin_cashflow_plans',   '(is_admin_user() or rasta_user_can_access_master_project(fin_cashflow_plans.master_project_id))'),
      ('fin_insight_reviews',  '(is_admin_user() or rasta_user_can_access_master_project(fin_insight_reviews.master_project_id))'),
      ('fin_links',            '(is_admin_user() or rasta_user_can_access_master_project(fin_links.master_project_id))'),
      ('fin_sync_log',         '(is_admin_user() or rasta_user_can_access_master_project(fin_sync_log.master_project_id))'),
      ('fin_clearances',       'exists (select 1 from fin_contracts fc where fc.id = fin_clearances.contract_id and (is_admin_user() or rasta_user_can_access_master_project(fc.master_project_id)))'),
      -- ---- material: master_project_id ----
      ('mtl_audit',            '(is_admin_user() or rasta_user_can_access_master_project(mtl_audit.master_project_id))'),
      ('mtl_baselines',        '(is_admin_user() or rasta_user_can_access_master_project(mtl_baselines.master_project_id))'),
      ('mtl_changes',          '(is_admin_user() or rasta_user_can_access_master_project(mtl_changes.master_project_id))'),
      ('mtl_discrepancies',    '(is_admin_user() or rasta_user_can_access_master_project(mtl_discrepancies.master_project_id))'),
      ('mtl_links',            '(is_admin_user() or rasta_user_can_access_master_project(mtl_links.master_project_id))'),
      ('mtl_lookups',          '(is_admin_user() or rasta_user_can_access_master_project(mtl_lookups.master_project_id))'),
      ('mtl_norms',            '(is_admin_user() or rasta_user_can_access_master_project(mtl_norms.master_project_id))'),
      ('mtl_packages',         '(is_admin_user() or rasta_user_can_access_master_project(mtl_packages.master_project_id))'),
      ('mtl_requisitions',     '(is_admin_user() or rasta_user_can_access_master_project(mtl_requisitions.master_project_id))'),
      ('mtl_txns',             '(is_admin_user() or rasta_user_can_access_master_project(mtl_txns.master_project_id))'),
      ('mtl_weld_sets',        '(is_admin_user() or rasta_user_can_access_master_project(mtl_weld_sets.master_project_id))'),
      ('mtl_project_roles',    '(is_admin_user() or rasta_user_can_access_master_project(mtl_project_roles.project_id) or mtl_project_roles.user_id = auth.uid())'),
      -- ---- material: child tables scoped through their parent row ----
      ('mtl_requisition_lines',   'exists (select 1 from mtl_requisitions q where q.id = mtl_requisition_lines.requisition_id and (is_admin_user() or rasta_user_can_access_master_project(q.master_project_id)))'),
      ('mtl_requisition_signers', 'exists (select 1 from mtl_requisitions q where q.id = mtl_requisition_signers.requisition_id and (is_admin_user() or rasta_user_can_access_master_project(q.master_project_id)))'),
      ('mtl_package_items',       'exists (select 1 from mtl_packages p where p.id = mtl_package_items.package_id and (is_admin_user() or rasta_user_can_access_master_project(p.master_project_id)))'),
      ('mtl_item_stages',         'exists (select 1 from mtl_package_items pi join mtl_packages p on p.id = pi.package_id where pi.id = mtl_item_stages.item_id and (is_admin_user() or rasta_user_can_access_master_project(p.master_project_id)))'),
      ('mtl_weld_lines',          'exists (select 1 from mtl_weld_sets ws where ws.id = mtl_weld_lines.set_id and (is_admin_user() or rasta_user_can_access_master_project(ws.master_project_id)))'),
      -- ---- reporting ----
      ('rp_thresholds',        '(is_admin_user() or rasta_user_can_access_master_project(rp_thresholds.master_project_id))')
    ) as m(tbl, pred)
  loop
    -- only rewrite the SELECT policy while it is still the open `true` policy
    select pol.polname into pname
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = r.tbl and pol.polcmd = 'r'
      and coalesce(pg_get_expr(pol.polqual, pol.polrelid), 'true') = 'true'
    limit 1;

    if pname is not null then
      execute format('alter policy %I on public.%I using (%s)', pname, r.tbl, r.pred);
    end if;
  end loop;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Intentionally left readable by any authenticated user (global catalogs /
-- app-wide config with no project column — no tenant data):
--   cm_authority_limits, cm_route_steps, cm_routes, cm_rule_sets, cm_rules,
--   est_benchmarks, ex_form_templates, ex_link_templates,
--   ex_form_mapping_approvals, fin_config_items, fin_settings_versions,
--   mtl_groups, mtl_patterns, mtl_pattern_weights, mtl_stage_defs, mtl_units,
--   pf_settings
-- ----------------------------------------------------------------------------
