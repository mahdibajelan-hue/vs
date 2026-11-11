-- ============================================================================
-- ROLLBACK for 002_read_scoping_rls.sql
-- ============================================================================
-- Re-opens the SELECT policies this migration scoped, back to USING (true),
-- i.e. the original (insecure) state where any authenticated user could read
-- every project's rows. Run only if the scoping broke a legitimate read flow
-- you cannot otherwise fix; prefer to fix the specific predicate instead.
--
-- Each listed table had exactly one permissive SELECT policy, so setting that
-- table's SELECT policy back to `true` restores the prior behaviour. Contains
-- no DROP / DELETE / TRUNCATE.
-- ============================================================================

begin;

do $$
declare
  t text;
  pname text;
  tables text[] := array[
    'ex_action_map','ex_activities','ex_activity_deps','ex_audit','ex_baselines','ex_doc_links',
    'ex_eng_docs','ex_form_activity_map','ex_form_entries','ex_form_proposals','ex_gap_items','ex_legal_text',
    'ex_line_welds','ex_links','ex_lookahead','ex_measurements','ex_ncr','ex_prereqs','ex_price_books',
    'ex_qc_findings','ex_report_archive','ex_report_links','ex_report_signatures','ex_reports','ex_required_forms',
    'ex_schedule_imports','ex_settings','ex_sign_slots','ex_statement_rows','ex_statements','ex_weld_attr_history',
    'ex_weld_conflicts','ex_weld_dismissals','ex_weld_merges','ex_welds','ex_work_actions','ex_project_roles',
    'ex_crew_logs','ex_report_history','ex_report_lines','ex_report_resources','ex_report_stoppages',
    'ex_report_versions','ex_baseline_lines','ex_ncr_events','ex_ncr_links','ex_price_items',
    'fin_audit','fin_budget_lines','fin_cashflow_plans','fin_insight_reviews','fin_links','fin_sync_log','fin_clearances',
    'mtl_audit','mtl_baselines','mtl_changes','mtl_discrepancies','mtl_links','mtl_lookups','mtl_norms','mtl_packages',
    'mtl_requisitions','mtl_txns','mtl_weld_sets','mtl_project_roles','mtl_requisition_lines','mtl_requisition_signers',
    'mtl_package_items','mtl_item_stages','mtl_weld_lines','rp_thresholds'
  ];
begin
  foreach t in array tables loop
    select pol.polname into pname
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t and pol.polcmd = 'r'
    limit 1;
    if pname is not null then
      execute format('alter policy %I on public.%I using (true)', pname, t);
    end if;
  end loop;
end $$;

commit;
