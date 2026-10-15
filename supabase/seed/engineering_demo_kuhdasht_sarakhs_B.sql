-- Part B (run after A and finance parts A–E): measurements ledger, a full spread of change requests (every status) tied to engineering documents,
-- approval steps for the request waiting on the CEO, and risks/issues raised from engineering documents and linked back to the change requests.
-- Idempotent: skipped when KS-009 already exists.
do $seed$
declare
  p constant uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  u constant uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
  c1 uuid; c2 uuid; o1 uuid; o2 uuid; rs uuid; rp uuid; ip uuid;
  r1 uuid; r2 uuid; i1 uuid; i2 uuid; i3 uuid; q uuid; d uuid;
begin
  if exists (select 1 from chg_change_requests where master_project_id = p and cr_number = 'KS-009') then raise notice 'engineering demo B already present'; return; end if;
  select id, contractor_org_id into c1, o1 from fin_contracts where master_project_id = p and contract_number = 'KS-EPC-01';
  select id, contractor_org_id into c2, o2 from fin_contracts where master_project_id = p and contract_number = 'KS-EPC-02';
  select id into rs from cm_rule_sets where status = 'active' order by activated_at desc nulls last limit 1;
  select source_project_id into rp from rasta_project_mappings where master_project_id = p and source_module = 'risk' and status = 'confirmed' limit 1;
  select source_project_id into ip from rasta_project_mappings where master_project_id = p and source_module = 'issues' and status = 'confirmed' limit 1;

  -- 1) Measured / billed / paid ledger (never above the supervision-approved cumulative, which the guard trigger enforces)
  perform set_config('ex.rpc', '1', true);
  insert into ex_measurements (project_id, activity_id, period_key, measured_qty, billed_qty, paid_qty, note, created_by)
  select p, t.aid, '1405-06', floor(t.cum * 0.5), floor(t.cum * 0.5), floor(t.cum * 0.4), 'برآورد دورهٔ شهریور', u
  from (select l.activity_id aid, sum(case when l.status = 'approved' then coalesce(l.approved_qty, l.qty) else 0 end) cum
        from ex_report_lines l join ex_reports r on r.id = l.report_id join ex_activities a on a.id = l.activity_id
        where r.project_id = p and r.form_key = 'work' and a.item_no in ('510101026','510226007','510301026','510411026','511301001','511309002') group by 1) t where floor(t.cum * 0.5) > 0;
  insert into ex_measurements (project_id, activity_id, period_key, measured_qty, billed_qty, paid_qty, note, created_by)
  select p, t.aid, '1405-07', floor(t.cum * 0.3), floor(t.cum * 0.2), 0, 'برآورد دورهٔ مهر — صورت‌وضعیت در جریان', u
  from (select l.activity_id aid, sum(case when l.status = 'approved' then coalesce(l.approved_qty, l.qty) else 0 end) cum
        from ex_report_lines l join ex_reports r on r.id = l.report_id join ex_activities a on a.id = l.activity_id
        where r.project_id = p and r.form_key = 'work' and a.item_no in ('510101026','510226007','510301026','510411026','511301001','511309002') group by 1) t where floor(t.cum * 0.3) > 0;

  -- 2) Enrich the four existing change requests with affected documents, reasons and (for KS-003) the approval route
  perform set_config('app.cm_rpc', '1', true);
  update chg_change_requests set
    change_reason_categories = array['تغییر مطالعات','الزام ایمنی'],
    affected_documents = '[{"docNumber":"KS-PL-004","title":"طرح تفصیلی سه گذر HDD"},{"docNumber":"KS-GT-003","title":"گزارش ژئوتکنیک رودخانه‌ها"}]'::jsonb,
    scope_effect_description = 'افزودن سه گذر HDD؛ تغییر روش اجرا در km 180 تا 210'
  where master_project_id = p and cr_number = 'KS-001';
  update chg_change_requests set
    change_reason_categories = array['مجوز مرجع ذی‌صلاح'],
    affected_documents = '[{"docNumber":"KS-PL-006","title":"اصلاح مسیر km 112 تا 114.4"}]'::jsonb,
    scope_effect_description = 'اصلاح ۲٫۴ کیلومتر از مسیر؛ تغییر نقشهٔ نواری قطعهٔ ۲',
    implementation_due = current_date + 25
  where master_project_id = p and cr_number = 'KS-002';
  update chg_change_requests set
    change_reason_categories = array['الزام استاندارد','ایمنی'],
    affected_documents = '[{"docNumber":"KS-PL-003","title":"محاسبات ضخامت جداره کلاس ۳ (Rev B)"},{"docNumber":"KS-PL-001","title":"نقشه‌های نواری قطعهٔ ۱"}]'::jsonb,
    scope_effect_description = 'افزایش ضخامت دیواره در حدود ۴۲ کیلومتر؛ اثر مستقیم بر مصرف لوله و جوش',
    rule_set_id = rs, route_status = 'resolved', base_amount = 1600000000000, cum_prev_amount = 140000000000, cum_prev_days = 40
  where master_project_id = p and cr_number = 'KS-003';
  update chg_change_requests set
    change_reason_categories = array['تأخیر تأمین'],
    affected_documents = '[{"docNumber":"KS-WE-004","title":"مشخصات پوشش FBE دوبل"},{"docNumber":"KS-WE-003","title":"روش پوشش درز جوش (Rev B)"}]'::jsonb,
    scope_effect_description = 'تغییر پوشش از 3LPE به FBE دوبل؛ بازنگری روش پوشش درز جوش'
  where master_project_id = p and cr_number = 'KS-004';

  select id into q from chg_change_requests where master_project_id = p and cr_number = 'KS-003';
  insert into cm_request_steps (request_id, attempt, seq, group_no, kind, role_name, label, route_code, rule_codes, status, opinion, decided_by, decided_by_name, decided_at, entered_at, due_at, sla_days) values
   (q, 1, 1, 1, 'opinion', 'مدیر امور پیمان', 'نظر امور پیمان', 'R-BOARD', array['C-25'], 'approved', 'مبلغ در سقف ۱۳٪ مبلغ اولیهٔ قرارداد؛ با تغییرات قبلی تجمعی ۲۱٫۵٪', u, 'مدیر امور پیمان', now() - interval '12 days', now() - interval '16 days', now() - interval '11 days', 5),
   (q, 1, 2, 2, 'opinion', 'مدیر ارشد پروژه', 'نظر مجری طرح', 'R-BOARD', array['C-25'], 'approved', 'الزام ایمنی؛ موافق با اجرا', u, 'مدیر ارشد پروژه', now() - interval '7 days', now() - interval '12 days', now() - interval '5 days', 7),
   (q, 1, 3, 3, 'approval', 'مدیرعامل', 'تصویب مدیرعامل', 'R-BOARD', array['C-25'], 'active', '', null, null, null, now() - interval '6 days', now() + interval '1 day', 7),
   (q, 1, 4, 4, 'body', 'مدیرعامل', 'مصوبهٔ هیئت‌مدیره (ثبت شمارهٔ مصوبه)', 'R-BOARD', array['C-25'], 'waiting', '', null, null, null, null, null, 14);

  -- 3) New requests covering every remaining status
  insert into chg_change_requests (master_project_id, cr_number, title, description, reason_for_change, priority, currency, original_contract_amount, proposed_change_amount, original_duration_days, proposed_schedule_impact_days, scope_impact_level, submitted_at, requester_organization, project_phase, change_type, contract_id, contractor_org_id, created_by, submitted_by, project_code, change_reason_categories, affected_documents, scope_effect_description)
  values
   (p, 'KS-005', 'اصلاح جزئیات تیپ گذر راه‌آهن (ضخامت پوشش بتنی)', 'درخواست پیش‌نویس: افزایش ضخامت غلاف بتنی طبق نظر راه‌آهن', 'نظر مرجع ذی‌صلاح', 'medium', 'IRR', 1100000000000, 8000000000, 730, 10, 'low', null, 'contractor', 'engineering', 'technical', c2, o2, u, u, 'MAT-DEMO', array['مجوز مرجع ذی‌صلاح'], '[{"docNumber":"KS-PL-005","title":"جزئیات تیپ گذر جاده و راه‌آهن"}]'::jsonb, 'تغییر جزئی در جزئیات تیپ'),
   (p, 'KS-006', 'افزایش حجم حفاری سنگی نسبت به برآورد پیمان', 'مقادیر واقعی حفاری سنگی در km 60 تا 95 بیش از برآورد اولیه', 'تفاوت شرایط واقعی زمین', 'high', 'IRR', 1600000000000, 96000000000, 730, 18, 'medium', now() - interval '4 days', 'contractor', 'construction', 'quantity', c1, o1, u, u, 'MAT-DEMO', array['شرایط زمین'], '[{"docNumber":"KS-GT-001","title":"گزارش ژئوتکنیک قطعهٔ ۱"}]'::jsonb, 'افزایش مقدار ردیف‌های حفاری سنگی'),
   (p, 'KS-007', 'دیوار حائل اضافی ایستگاه تراکم', 'درخواست پیمانکار برای ساخت دیوار حائل در شیب شمالی ایستگاه', 'درخواست پیمانکار', 'low', 'IRR', 1100000000000, 31000000000, 730, 30, 'medium', now() - interval '48 days', 'contractor', 'construction', 'additional_work', c2, o2, u, u, 'MAT-DEMO', array['درخواست پیمانکار'], '[{"docNumber":"KS-CV-001","title":"نقشه‌های فونداسیون ایستگاه تراکم"}]'::jsonb, 'کار اضافی خارج از محدودهٔ نقشه‌ها'),
   (p, 'KS-008', 'افزایش مقدار کنده‌کاری و خاکریز در عبور از دشت سیلابی', 'اجرای حفاظ سنگ‌چین و افزایش حجم خاکریز km 130 تا 150', 'سیلاب بهار', 'high', 'IRR', 1600000000000, 54000000000, 730, 12, 'medium', now() - interval '90 days', 'contractor', 'construction', 'quantity', c1, o1, u, u, 'MAT-DEMO', array['حادثهٔ طبیعی'], '[{"docNumber":"KS-PL-007","title":"جزئیات تیپ کانال، بستر و خاکریز"}]'::jsonb, 'حجم خاکریز و سنگ‌چین افزایش یافت'),
   (p, 'KS-009', 'تغییر محل شیر MLV-3 به‌علت مسیر سیلاب', 'جابه‌جایی ایستگاه شیر ۱۸۰ متر به‌سمت پایین‌دست', 'مطالعات هیدرولوژی', 'medium', 'IRR', 1600000000000, 6500000000, 730, 4, 'low', now() - interval '130 days', 'employer', 'engineering', 'technical', c1, o1, u, u, 'MAT-DEMO', array['تغییر مطالعات'], '[{"docNumber":"KS-ME-002","title":"چیدمان ایستگاه شیرهای میان‌مسیری"}]'::jsonb, 'تغییر محل MLV-3');

  update chg_change_requests set status = 'submitted' where master_project_id = p and cr_number = 'KS-006';
  update chg_change_requests set status = 'rejected', decision_note = 'مورد کار اضافی تلقی نمی‌شود؛ طبق بند ۳ شرایط خصوصی، دیوار حائل جزو محدودهٔ نقشه‌های ابلاغی است', approved_at = now() - interval '35 days' where master_project_id = p and cr_number = 'KS-007';
  update chg_change_requests set status = 'implemented', approved_change_amount = 48000000000, approved_schedule_impact_days = 10, approved_at = now() - interval '70 days', implementation_started_at = now() - interval '60 days', decision_note = 'تصویب مجری طرح در سقف اختیار', result_note = 'اجرا شد؛ هزینهٔ قطعی ۵۱ میلیارد ریال', result_recorded_at = now() - interval '15 days', actual_cost_amount = 51000000000, actual_delay_days = 14, implemented_as_approved = false, documents_updated = true where master_project_id = p and cr_number = 'KS-008';
  update chg_change_requests set status = 'closed', approved_change_amount = 6500000000, approved_schedule_impact_days = 4, approved_at = now() - interval '110 days', implementation_started_at = now() - interval '100 days', decision_note = 'تصویب مجری طرح', result_note = 'اجرا مطابق مصوبه', result_recorded_at = now() - interval '60 days', closed_at = now() - interval '55 days', actual_cost_amount = 6500000000, actual_delay_days = 4, implemented_as_approved = true, documents_updated = true, lesson_learned_recorded = true, lesson_learned_number = 'LL-1405-07' where master_project_id = p and cr_number = 'KS-009';

  -- 4) Risks / issues raised from engineering documents (the same way the «ثبت ریسک/مسئله» button does) + links to documents and change requests
  insert into rm_risks (project_id, code, title, description, category, risk_type, initial_probability, initial_impact, created_by, source, source_ref_type, source_ref_id, station, work_front, discipline)
  select rp, '', 'توقف جوش در مناطق کلاس ۳ به‌علت تأیید نشدن ضخامت جداره', 'سند KS-PL-003 (Rev B) هنوز تأیید نشده؛ جوش لوله در حدود ۴۲ کیلومتر مناطق کلاس ۳ بدون ضخامت نهایی ممکن نیست.' || E'\n\n— منبع: پایش پیشرفت مهندسی (مدرک KS-PL-003)', 'schedule', 'threat', 5, 5, u, 'api', 'engineering_doc', e.id::text, 'km 60–210', 'جبههٔ شمال', 'pipeline' from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-PL-003' returning id into r1;
  insert into ex_links (project_id, source_type, source_id, target_type, target_id, label) select p, 'doc', e.id, 'risk', r1, 'توقف جوش در مناطق کلاس ۳' from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-PL-003';
  insert into rm_risks (project_id, code, title, description, category, risk_type, initial_probability, initial_impact, created_by, source, source_ref_type, source_ref_id, station, work_front, discipline)
  select rp, '', 'عدم صدور مجوز آب منطقه‌ای برای سه گذر HDD', 'نقشهٔ KS-PL-004 و مجوز عبور از رودخانه‌ها هر دو معوق‌اند؛ شروع گذرها از ۲۵ روز دیگر در معرض تأخیر است.' || E'\n\n— منبع: پایش پیشرفت مهندسی (مدرک KS-PL-004)', 'schedule', 'threat', 4, 5, u, 'api', 'engineering_doc', e.id::text, 'km 180–210', 'جبههٔ شمال', 'pipeline' from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-PL-004' returning id into r2;
  insert into ex_links (project_id, source_type, source_id, target_type, target_id, label) select p, 'doc', e.id, 'risk', r2, 'عدم صدور مجوز گذرهای HDD' from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-PL-004';

  insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category, location, discipline, impact_time_days, source_ref_type, source_ref_id)
  select ip, 'دیرکرد ۱۴ روزهٔ گزارش ژئوتکنیک رودخانه‌ها', 'KS-GT-003 پیش‌نیاز طرح HDD است و ۱۴ روز از موعد گذشته است.' || E'\n\n— منبع: پایش پیشرفت مهندسی (مدرک KS-GT-003)', 'critical', 3, 'open', u, 'api', 'engineering', 'km 180–210', 'geotech', 14, 'engineering_doc', e.id::text from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-GT-003' returning id into i1;
  insert into ex_links (project_id, source_type, source_id, target_type, target_id, label) select p, 'doc', e.id, 'issue', i1, 'دیرکرد گزارش ژئوتکنیک رودخانه‌ها' from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-GT-003';
  insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category, location, discipline, impact_time_days, source_ref_type, source_ref_id)
  select ip, 'روش پوشش درز جوش تأیید نشده', 'KS-WE-003 Rev B در انتظار تأیید است؛ پوشش‌دهی درز جوش از ۱۰ روز دیگر نیاز دارد.' || E'\n\n— منبع: پایش پیشرفت مهندسی (مدرک KS-WE-003)', 'high', 7, 'open', u, 'api', 'engineering', 'قطعهٔ ۲', 'welding', 7, 'engineering_doc', e.id::text from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-WE-003' returning id into i2;
  insert into ex_links (project_id, source_type, source_id, target_type, target_id, label) select p, 'doc', e.id, 'issue', i2, 'روش پوشش درز جوش تأیید نشده' from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-WE-003';
  insert into im_issues (project_id, title, description, priority, deadline_days, status, created_by, source, category, location, discipline, impact_time_days, source_ref_type, source_ref_id)
  select ip, 'نقشه‌های فونداسیون ایستگاه هنوز تأیید نشده‌اند', 'KS-CV-001 ارسال شده ولی تأیید نشده؛ شروع ساخت فونداسیون ۵ روز دیگر.' || E'\n\n— منبع: پایش پیشرفت مهندسی (مدرک KS-CV-001)', 'medium', 14, 'open', u, 'api', 'engineering', 'ایستگاه تراکم', 'civil', 5, 'engineering_doc', e.id::text from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-CV-001' returning id into i3;
  insert into ex_links (project_id, source_type, source_id, target_type, target_id, label) select p, 'doc', e.id, 'issue', i3, 'نقشه‌های فونداسیون ایستگاه تأیید نشده' from ex_eng_docs e where e.project_id = p and e.doc_no = 'KS-CV-001';

  insert into cm_links (request_id, target_type, target_id, target_label, relation, source, created_by)
  select c.id, x.tt, x.tid, x.lbl, x.rel, 'manual', u from (values
    ('KS-003', 'risk',  r1, 'توقف جوش در مناطق کلاس ۳', 'raises'),
    ('KS-001', 'risk',  r2, 'عدم صدور مجوز گذرهای HDD', 'related'),
    ('KS-001', 'issue', i1, 'دیرکرد گزارش ژئوتکنیک رودخانه‌ها', 'caused_by'),
    ('KS-004', 'issue', i2, 'روش پوشش درز جوش تأیید نشده', 'raises')
  ) x(cr, tt, tid, lbl, rel) join chg_change_requests c on c.master_project_id = p and c.cr_number = x.cr;
end
$seed$;
