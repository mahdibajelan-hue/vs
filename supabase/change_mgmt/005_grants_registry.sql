-- Change Management v2 — grants, module registry. (Statements were applied one at a time through the SQL API.)
revoke execute on function cm_log(uuid, text, text), cm_activate_next(uuid, int), cm_build_steps(uuid, int, jsonb), cm_basis(chg_change_requests), cm_resolve_core(chg_change_requests, uuid), cm_route_roles(uuid) from public, anon, authenticated;
revoke execute on function cm_submit(uuid), cm_start_evaluation(uuid), cm_complete_evaluation(uuid, text), cm_decide_step(uuid, text, text, text, date, numeric, int), cm_start_implementation(uuid, uuid, date, text), cm_record_result(uuid, numeric, int, boolean, text, boolean),
  cm_close(uuid, text), cm_cancel(uuid, text), cm_comment(uuid, text), cm_request_exception(uuid, text, text), cm_decide_exception(uuid, boolean, text), cm_validate_rule_set(uuid), cm_activate_rule_set(uuid, date), cm_clone_rule_set(uuid, text),
  cm_link(uuid, text, uuid, text, text), cm_remove_link(uuid), cm_create_risk(uuid, text, text, int, int, text), cm_create_issue(uuid, text, text, text), cm_create_from_source(text, uuid, text), cm_my_notifications(), cm_resolve(uuid) from public, anon;
grant execute on function cm_submit(uuid), cm_start_evaluation(uuid), cm_complete_evaluation(uuid, text), cm_decide_step(uuid, text, text, text, date, numeric, int), cm_start_implementation(uuid, uuid, date, text), cm_record_result(uuid, numeric, int, boolean, text, boolean),
  cm_close(uuid, text), cm_cancel(uuid, text), cm_comment(uuid, text), cm_request_exception(uuid, text, text), cm_decide_exception(uuid, boolean, text), cm_validate_rule_set(uuid), cm_activate_rule_set(uuid, date), cm_clone_rule_set(uuid, text),
  cm_link(uuid, text, uuid, text, text), cm_remove_link(uuid), cm_create_risk(uuid, text, text, int, int, text), cm_create_issue(uuid, text, text, text), cm_create_from_source(text, uuid, text), cm_my_notifications(), cm_resolve(uuid) to authenticated;
-- the link tables of the risk and issue modules accept 'change' as a target type
alter table rm_risk_links drop constraint rm_risk_links_target_type_check;
alter table rm_risk_links add constraint rm_risk_links_target_type_check check (target_type in ('risk','issue','mission','finding','external','change'));
alter table im_issue_links drop constraint im_issue_links_target_type_check;
alter table im_issue_links add constraint im_issue_links_target_type_check check (target_type in ('issue','risk','decision','task','project','unit','action','mission','finding','land_parcel','document','change'));
insert into rasta_modules (key, label_fa, is_active) values ('change', 'مدیریت تغییرات پروژه', true) on conflict (key) do nothing;
-- NOTE: the live database also kept three empty helper functions cm_t1/cm_t2/cm_t3 created while diagnosing a tool timeout; they are harmless and can be dropped.
