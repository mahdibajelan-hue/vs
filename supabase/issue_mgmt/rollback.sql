-- ============================================================================
-- Issue Management v2 — ROLLBACK (manual, destructive for v2 data). Legacy columns/rows of im_issues are untouched.
-- BACK UP first: im_issue_events, im_issue_tasks, im_extensions, im_decisions*, im_rca, im_capa, im_attachments, im_lessons, im_notif_* are dropped.
-- Run statements one by one on Supabase MCP (60 s limit). cron job: select cron.unschedule('im-generate-notifications');
-- ============================================================================
select cron.unschedule('im-generate-notifications') where exists (select 1 from cron.job where jobname = 'im-generate-notifications');

drop trigger if exists trg_im_lesson_guard on im_lessons;
drop trigger if exists trg_im_decision_guard on im_decisions;
drop trigger if exists trg_im_decision_audit on im_decisions;
drop trigger if exists trg_00_im_issue_guard on im_issues;
drop trigger if exists trg_im_issue_audit on im_issues;
drop trigger if exists trg_im_issue_audit_del on im_issues;
drop trigger if exists trg_im_task_guard on im_issue_tasks;
drop trigger if exists trg_im_task_audit on im_issue_tasks;
drop trigger if exists trg_im_task_dep_cycle on im_task_deps;

drop function if exists im_notif_mark_issue_read(uuid), im_notif_mark_read(bigint[]), im_generate_notifications_now(), im_generate_notifications(),
  im_enqueue(text, im_issues, uuid, uuid, text, text, text, smallint), im_resolve_recipients(im_issues, text[]),
  im_convert_risk_to_issue(uuid, text, uuid, integer), im_ingest_issue(text, text, text, uuid, jsonb), im_bulk_create(uuid, jsonb),
  im_decide_extension(uuid, boolean, text), im_request_extension(uuid, uuid, date, text, text), im_transition(uuid, text, text, jsonb),
  im_lesson_guard(), im_decision_audit(), im_decision_guard(), im_can_see_decision(uuid, uuid),
  im_issue_guard(), im_issue_audit(), im_task_guard(), im_task_audit(), im_task_dep_cycle_guard(), im_log_event(uuid, text, uuid, text, text, text, text, jsonb),
  im_close_blockers(im_issues), im_actor_roles(im_issues), im_can_write_issue(uuid), im_can_see_issue(uuid);

drop table if exists im_lessons, im_decision_options, im_decisions, im_notif_state, im_notif_outbox, im_notif_prefs, im_notif_rules,
  im_saved_filters, im_templates, im_issue_people, im_capa, im_rca, im_attachments, im_issue_links, im_extensions, im_task_updates, im_task_deps,
  im_issue_tasks, im_issue_events, im_workflow_transitions, im_workflow_stages, im_sla_policies, im_categories cascade;
drop sequence if exists im_decision_seq, im_issue_seq;

-- restore the pre-v2 bell (without the engine loop): re-run the original my_notifications() definition from schema.sql history.
-- ms_transfer_finding: re-run the pre-v2 definition (see git history before commit "Issue Management v2: …enrichment").

alter table im_issues drop constraint if exists im_issues_severity_check;
alter table im_issues drop constraint if exists im_issues_urgency_check;
alter table im_issues drop constraint if exists im_issues_impact_levels_check;
alter table im_issues drop constraint if exists im_issues_authority_check;
alter table im_issues drop constraint if exists im_issues_sync_status_check;
alter table im_issues drop constraint if exists im_issues_source_check;
alter table im_issues add constraint im_issues_source_check check (source in ('manual', 'lifecycle_action', 'mission_debrief', 'land_acquisition'));  -- legacy rule restored (rows with newer sources must be re-labelled first)
alter table im_issues drop constraint if exists im_issues_not_own_parent;
alter table im_issues
  drop column if exists seq_no,
  drop column if exists code,
  drop column if exists category,
  drop column if exists discipline,
  drop column if exists location,
  drop column if exists identified_at,
  drop column if exists severity,
  drop column if exists urgency,
  drop column if exists impact_time_days,
  drop column if exists impact_cost,
  drop column if exists impact_quality,
  drop column if exists impact_safety,
  drop column if exists impact_contract,
  drop column if exists impact_objectives,
  drop column if exists owner_id,
  drop column if exists follow_up_id,
  drop column if exists review_due_date,
  drop column if exists resolve_due_date,
  drop column if exists original_due_date,
  drop column if exists extension_count,
  drop column if exists authority_level,
  drop column if exists workflow_key,
  drop column if exists stage,
  drop column if exists stage_changed_at,
  drop column if exists root_cause_summary,
  drop column if exists root_cause_confirmed,
  drop column if exists acceptance_criteria,
  drop column if exists resolution_summary,
  drop column if exists resolution_requested_at,
  drop column if exists resolution_verified_by,
  drop column if exists resolution_verified_at,
  drop column if exists effectiveness_result,
  drop column if exists lessons_learned,
  drop column if exists reopen_count,
  drop column if exists last_reopened_at,
  drop column if exists blocked_since,
  drop column if exists blocked_kind,
  drop column if exists blocked_note,
  drop column if exists source_ref_type,
  drop column if exists source_ref_id,
  drop column if exists external_system,
  drop column if exists external_id,
  drop column if exists sync_status,
  drop column if exists synced_at,
  drop column if exists tags,
  drop column if exists template_key,
  drop column if exists corporate_issue_id,
  drop column if exists source_snapshot;
alter table im_projects drop column if exists scope_level, drop column if exists master_ref_id, drop column if exists short_code;
