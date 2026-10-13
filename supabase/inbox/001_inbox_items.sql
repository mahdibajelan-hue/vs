-- «کارتابل من»: one list of everything that waits for the signed-in person across the modules.
-- It is computed live from the modules' own tables with the modules' own permission helpers (ex_allows, mtl_allows, cm_has_role …),
-- so an item exists exactly while the underlying record is waiting for this person and disappears the moment it moves on.
-- Decisions are NOT made here: the client calls each module's existing RPC (ex_report_decide_whole, mtl_req_sign, cm_decide_step …),
-- which re-checks the same permissions.
create or replace function inbox_my_items()
returns table (key text, source text, kind text, project_id uuid, project_name text, title text, sub text, due date, since timestamptz, urgent boolean, ref_id uuid, extra jsonb)
language plpgsql stable security definer set search_path = public
as $fn$
declare u uuid := auth.uid(); adm boolean := coalesce(is_admin_user(), false);
begin
  if u is null then return; end if;

  -- ───────── execution ─────────
  return query
  select 'ex:review:' || r.id, 'execution', 'review', r.project_id, coalesce(mp.short_name, mp.official_name, ''),
    r.report_no || ' — ' || (case r.form_key when 'work' then 'گزارش کارکرد روزانه' else 'فرم فنی ' || r.form_key end),
    coalesce(nullif(r.front, ''), 'بدون جبهه') || ' · ' || r.report_date::text || ' · ' || (select count(*) from ex_report_lines l where l.report_id = r.id and l.status = 'pending') || ' ردیف در انتظار',
    null::date, coalesce(r.submitted_at, r.created_at), coalesce(r.submitted_at, r.created_at) < now() - interval '2 days', r.id,
    jsonb_build_object('formKey', r.form_key, 'date', r.report_date, 'front', r.front, 'pending', (select count(*) from ex_report_lines l where l.report_id = r.id and l.status = 'pending'), 'lines', (select count(*) from ex_report_lines l where l.report_id = r.id))
  from ex_reports r left join master_projects mp on mp.id = r.project_id
  where r.status in ('submitted', 'partially_approved') and ex_allows(r.project_id, 'review')
    and (not adm or exists (select 1 from ex_project_roles x where x.project_id = r.project_id and x.user_id = u and x.active));

  return query
  select 'ex:fix:' || r.id, 'execution', 'fix', r.project_id, coalesce(mp.short_name, mp.official_name, ''),
    r.report_no || ' — ' || (case r.status when 'returned' then 'برگشت برای اصلاح' else 'نیازمند تکمیل' end),
    coalesce(nullif(r.review_note, ''), array_to_string(array(select jsonb_array_elements_text(r.missing)), '، ')), null::date, coalesce(r.reviewed_at, r.created_at), true, r.id,
    jsonb_build_object('formKey', r.form_key, 'date', r.report_date, 'front', r.front)
  from ex_reports r left join master_projects mp on mp.id = r.project_id
  where r.status in ('returned', 'incomplete') and r.created_by = u;

  return query
  select 'ex:gap:' || g.id, 'execution', 'gap', g.project_id, coalesce(mp.short_name, mp.official_name, ''), g.subject,
    coalesce(nullif(g.front, ''), '') || ' ' || array_to_string(array(select jsonb_array_elements_text(g.missing)), '، '), g.due_date, g.created_at, g.due_date is not null and g.due_date < current_date, g.id,
    jsonb_build_object('kind', g.kind, 'status', g.status)
  from ex_gap_items g left join master_projects mp on mp.id = g.project_id
  where g.responsible = u and g.status in ('open', 'in_progress');

  -- ───────── material ─────────
  return query
  select 'mtl:sign:' || r.id, 'material', 'sign', r.master_project_id, coalesce(mp.short_name, mp.official_name, ''), 'مجوز خروج ' || r.number || ' — ' || coalesce(nullif(r.facility, ''), 'بدون محل'),
    'نوبت امضای شما' || coalesce(' · نیاز تا ' || r.needed_by::text, ''), r.needed_by, now(), r.needed_by is not null and r.needed_by < current_date, r.id, '{}'::jsonb
  from mtl_requisitions r left join master_projects mp on mp.id = r.master_project_id
  where r.status = 'awaiting_signatures' and exists (
    select 1 from mtl_requisition_signers s where s.requisition_id = r.id and s.user_id = u and s.decision = 'pending'
      and not exists (select 1 from mtl_requisition_signers p where p.requisition_id = r.id and p.sort < s.sort and p.decision <> 'approved'));

  return query
  select 'mtl:disc:' || d.id, 'material', 'discrepancy', d.master_project_id, coalesce(mp.short_name, mp.official_name, ''), 'مغایرت — ' || coalesce(m.description, d.kind),
    'مسئول تعیین تکلیف شما هستید' || coalesce(' · مهلت ' || d.due_date::text, ''), d.due_date, d.detected_at, d.due_date is not null and d.due_date < current_date, d.id,
    jsonb_build_object('kind', d.kind, 'diff', d.diff_qty, 'cause', d.probable_cause)
  from mtl_discrepancies d left join mtl_materials m on m.id = d.material_id left join master_projects mp on mp.id = d.master_project_id
  where d.responsible = u and d.status in ('open', 'in_review');

  return query
  select 'mtl:change:' || c.id, 'material', 'change', c.master_project_id, coalesce(mp.short_name, mp.official_name, ''), 'تغییر ' || c.field || ' — ' || coalesce(m.description, ''),
    c.old_value || ' ← ' || c.new_value || coalesce(' · ' || nullif(c.reason, ''), ''), null::date, c.requested_at, c.requested_at < now() - interval '3 days', c.id, '{}'::jsonb
  from mtl_changes c left join mtl_materials m on m.id = c.material_id left join master_projects mp on mp.id = c.master_project_id
  where c.status = 'requested' and c.requested_by is distinct from u and (mtl_allows(c.master_project_id, 'approve_change') or mtl_allows(c.master_project_id, 'review_change'))
    and (not adm or exists (select 1 from mtl_project_roles x where x.project_id = c.master_project_id and x.user_id = u and x.active));

  return query
  select 'mtl:txn:' || t.id, 'material', 'txn', t.master_project_id, coalesce(mp.short_name, mp.official_name, ''), t.kind || ' — ' || coalesce(m.description, ''),
    'مقدار ' || t.qty::text || ' · در انتظار تأیید', null::date, t.created_at, t.created_at < now() - interval '3 days', t.id, jsonb_build_object('qty', t.qty, 'kind', t.kind)
  from mtl_txns t left join mtl_materials m on m.id = t.material_id left join master_projects mp on mp.id = t.master_project_id
  where t.status = 'pending' and t.created_by is distinct from u and mtl_allows(t.master_project_id, 'approve_txn')
    and (not adm or exists (select 1 from mtl_project_roles x where x.project_id = t.master_project_id and x.user_id = u and x.active));

  return query
  select 'mtl:stage:' || s.id, 'material', 'stage', m.master_project_id, coalesce(mp.short_name, mp.official_name, ''), d.title || ' — ' || coalesce(m.description, ''),
    'بسته ' || coalesce(pk.code, '') || ' · ' || (case s.status when 'submitted' then 'ارسال‌شده' else 'بررسی‌شده' end), null::date, coalesce(s.submitted_at, now()), coalesce(s.submitted_at, now()) < now() - interval '3 days', s.id,
    jsonb_build_object('level', d.review_level, 'status', s.status, 'evidence', s.evidence_url, 'note', s.evidence_note, 'doneQty', s.done_qty)
  from mtl_item_stages s join mtl_stage_defs d on d.key = s.stage_key join mtl_package_items pi on pi.id = s.item_id join mtl_materials m on m.id = pi.material_id
    left join mtl_packages pk on pk.id = pi.package_id left join master_projects mp on mp.id = m.master_project_id
  where s.applicable and s.status in ('submitted', 'reviewed')
    and (case when d.review_level = 'employer' then mtl_allows(m.master_project_id, 'approve_stage')
              when d.review_level = 'both' then (case when s.status = 'submitted' then mtl_allows(m.master_project_id, 'review_stage') else mtl_allows(m.master_project_id, 'approve_stage') end)
              else mtl_allows(m.master_project_id, 'review_stage') end)
    and (not adm or exists (select 1 from mtl_project_roles x where x.project_id = m.master_project_id and x.user_id = u and x.active));

  return query
  select 'mtl:stagefix:' || s.id, 'material', 'stage_fix', m.master_project_id, coalesce(mp.short_name, mp.official_name, ''), d.title || ' — ' || coalesce(m.description, ''),
    'ردشده: ' || coalesce(nullif(s.reject_reason, ''), 'بدون توضیح'), null::date, coalesce(s.reviewed_at, now()), true, s.id, '{}'::jsonb
  from mtl_item_stages s join mtl_stage_defs d on d.key = s.stage_key join mtl_package_items pi on pi.id = s.item_id join mtl_materials m on m.id = pi.material_id left join master_projects mp on mp.id = m.master_project_id
  where s.applicable and s.status = 'rejected' and (s.submitted_by = u or s.responsible = u);

  -- ───────── issues ─────────
  return query
  select 'im:verify:' || t.id, 'issues', 'verify', i.project_id, coalesce(ip.name, ''), t.title, coalesce(i.code, '') || ' ' || i.title || ' · اعلام اتمام شده و منتظر تأیید',
    t.due_date, coalesce(t.completion_claimed_at, t.updated_at), coalesce(t.completion_claimed_at, t.updated_at) < now() - interval '3 days', t.id, jsonb_build_object('issueId', i.id, 'progress', t.progress)
  from im_issue_tasks t join im_issues i on i.id = t.issue_id left join im_projects ip on ip.id = i.project_id
  where t.status = 'pending_verification' and t.executor_id is distinct from u and (t.approver_id = u or (t.approver_id is null and i.owner_id = u));

  return query
  select 'im:ext:' || e.id, 'issues', 'extension', i.project_id, coalesce(ip.name, ''), 'درخواست تمدید — ' || coalesce(i.code, '') || ' ' || i.title,
    e.from_due::text || ' ← ' || e.to_due::text || ' · ' || e.reason, e.to_due, e.requested_at, e.requested_at < now() - interval '3 days', e.id, jsonb_build_object('issueId', i.id, 'impact', e.impact)
  from im_extensions e join im_issues i on i.id = e.issue_id left join im_projects ip on ip.id = i.project_id
  where e.status = 'pending' and e.requested_by is distinct from u and i.approver_id = u;

  return query
  select 'im:task:' || t.id, 'issues', 'task', i.project_id, coalesce(ip.name, ''), t.title, coalesce(i.code, '') || ' ' || i.title || ' · پیشرفت ' || t.progress || '٪' || (case t.status when 'blocked' then ' · مسدود' else '' end),
    t.due_date, t.created_at, t.due_date is not null and t.due_date < current_date, t.id, jsonb_build_object('issueId', i.id, 'status', t.status, 'progress', t.progress)
  from im_issue_tasks t join im_issues i on i.id = t.issue_id left join im_projects ip on ip.id = i.project_id
  where t.executor_id = u and t.status not in ('done', 'cancelled', 'pending_verification');

  -- ───────── risk ─────────
  return query
  select 'rm:action:' || a.id, 'risk', 'risk_action', r.project_id, coalesce(rp.name, ''), a.description, coalesce(r.code, '') || ' ' || r.title || ' · پیشرفت ' || a.completion_percentage || '٪',
    a.due_date, a.created_at, a.due_date is not null and a.due_date < current_date, a.id, jsonb_build_object('riskId', r.id, 'status', a.status, 'progress', a.completion_percentage)
  from rm_risk_actions a join rm_risks r on r.id = a.risk_id left join rm_projects rp on rp.id = r.project_id
  where a.owner_id = u and a.status not in ('completed', 'cancelled');

  return query
  select 'rm:accept:' || x.id, 'risk', 'acceptance', r.project_id, coalesce(rp.name, ''), 'درخواست پذیرش ریسک — ' || coalesce(r.code, '') || ' ' || r.title,
    'ریسک باقیمانده ' || x.residual_score || ' · ' || coalesce(nullif(x.rationale, ''), ''), x.valid_until, x.requested_at, x.requested_at < now() - interval '3 days', x.id, jsonb_build_object('riskId', r.id, 'score', x.residual_score)
  from rm_acceptances x join rm_risks r on r.id = x.risk_id left join rm_projects rp on rp.id = r.project_id
  where x.status = 'requested' and x.requested_by is distinct from u and (r.approver_id = u or rm_project_role(r.project_id) in ('project_manager', 'management'));

  -- ───────── change management ─────────
  return query
  select 'cm:step:' || s.id, 'change', 'change_step', r.master_project_id, coalesce(mp.short_name, mp.official_name, ''), 'درخواست تغییر ' || coalesce(r.cr_number, '') || ' — ' || r.title,
    s.label || ' (' || s.role_name || ')', s.due_at::date, coalesce(s.entered_at, now()), s.due_at is not null and s.due_at < now(), s.id,
    jsonb_build_object('requestId', r.id, 'kind', s.kind, 'requiresReference', s.requires_reference, 'role', s.role_name)
  from cm_request_steps s join chg_change_requests r on r.id = s.request_id left join master_projects mp on mp.id = r.master_project_id
  where s.status = 'active' and s.attempt = r.attempt and r.status = 'awaiting_approval' and cm_has_role(r.master_project_id, array[s.role_name])
    and r.created_by is distinct from u and r.submitted_by is distinct from u;

  -- ───────── missions ─────────
  return query
  select 'ms:approve:' || m.id, 'missions', 'mission_decide', m.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    (case m.status when 'pending_approval' then 'تأیید درخواست مأموریت ' else 'بررسی گزارش مأموریت ' end) || m.code,
    coalesce(m.destination, '') || ' · ' || coalesce(m.start_date::text, '') || ' تا ' || coalesce(m.end_date::text, ''), null::date, coalesce(m.submitted_at, m.updated_at), coalesce(m.submitted_at, m.updated_at) < now() - interval '3 days', m.id,
    jsonb_build_object('status', m.status, 'visit', m.visit_type, 'expected', m.expected_output)
  from ms_missions m left join master_projects mp on mp.id = m.master_project_id
  where m.status in ('pending_approval', 'report_review') and m.approver_id = u;

  return query
  select 'ms:mine:' || m.id, 'missions', 'mission_mine', m.master_project_id, coalesce(mp.short_name, mp.official_name, ''),
    'مأموریت ' || m.code || ' — ' || (case m.status when 'returned' then 'برگشت برای اصلاح' when 'revision_requested' then 'اصلاح گزارش' when 'approved' then 'تأییدشده — شروع گزارش‌گیری' else 'در حال گزارش‌گیری' end),
    coalesce(nullif(m.manager_comment, ''), m.destination, ''), m.end_date, m.updated_at, m.status in ('returned', 'revision_requested'), m.id, jsonb_build_object('status', m.status)
  from ms_missions m left join master_projects mp on mp.id = m.master_project_id
  where m.requester_id = u and m.status in ('returned', 'revision_requested', 'approved', 'debrief');
end
$fn$;
revoke all on function inbox_my_items() from public, anon;
grant execute on function inbox_my_items() to authenticated;
