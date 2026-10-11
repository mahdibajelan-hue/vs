-- Part D: change requests (workflow fields bypass the guard via app.cm_rpc inside one transaction, so the finance sync trigger creates the amendments).
do $seed$
declare
  p constant uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  u constant uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
  c1 uuid; c2 uuid; c4 uuid; o1 uuid; o2 uuid; o4 uuid;
begin
  if exists (select 1 from chg_change_requests where master_project_id = p) then return; end if;
  select id, contractor_org_id into c1, o1 from fin_contracts where master_project_id = p and contract_number = 'KS-EPC-01';
  select id, contractor_org_id into c2, o2 from fin_contracts where master_project_id = p and contract_number = 'KS-EPC-02';
  select id, contractor_org_id into c4, o4 from fin_contracts where master_project_id = p and contract_number = 'KS-SUP-PIPE';
  insert into chg_change_requests (master_project_id, cr_number, title, description, reason_for_change, priority, currency, original_contract_amount, proposed_change_amount, original_duration_days, proposed_schedule_impact_days, scope_impact_level, submitted_at, requester_organization, project_phase, change_type, contract_id, contractor_org_id, created_by, submitted_by, project_code)
  values
   (p, 'KS-001', 'سه گذر افقی (HDD) اضافه برای عبور از رودخانه‌های فصلی', 'افزودن سه گذر HDD در کیلومترهای ۱۸۰ تا ۲۱۰ بنا بر مطالعات هیدرولوژی', 'تغییر مطالعات هیدرولوژی', 'high', 'IRR', 1600000000000, 150000000000, 730, 45, 'medium', now() - interval '70 days', 'consultant', 'construction', 'additional_work', c1, o1, u, u, 'MAT-DEMO'),
   (p, 'KS-002', 'جابه‌جایی ۲٫۴ کیلومتر از مسیر به‌علت تعارض با حریم معدنی', 'اصلاح مسیر پس از مجوز وزارت صمت', 'مجوز جدید معدن', 'high', 'IRR', 1100000000000, 70000000000, 730, 20, 'medium', now() - interval '55 days', 'contractor', 'construction', 'technical', c2, o2, u, u, 'MAT-DEMO'),
   (p, 'KS-003', 'افزایش ضخامت دیواره در مناطق کلاس ۳ مکانی', 'تغییر ضریب طراحی به‌علت نزدیک شدن مسیر به مناطق مسکونی', 'الزام استاندارد ایمنی', 'critical', 'IRR', 1600000000000, 210000000000, 730, 60, 'high', now() - interval '18 days', 'employer', 'engineering', 'technical', c1, o1, u, u, 'MAT-DEMO'),
   (p, 'KS-004', 'تغییر روکش لوله از ۳LPE به FBE دوبل در قطعهٔ ۲', 'درخواست پیمانکار تأمین به‌علت تأخیر تولید روکش', 'تأخیر تولید روکش', 'medium', 'IRR', 400000000000, 24000000000, 150, 25, 'medium', now() - interval '9 days', 'contractor', 'procurement', 'technical', c4, o4, u, u, 'MAT-DEMO');
  perform set_config('app.cm_rpc', '1', true);
  update chg_change_requests set status='approved', approved_change_amount=140000000000, approved_schedule_impact_days=40, approved_at=now()-interval '41 days', decision_note='تصویب در کمیتهٔ کنترل تغییرات (CCB) با سقف اختیار مدیر پروژه + تأیید کارفرما' where cr_number='KS-001' and master_project_id=p;
  update chg_change_requests set status='implementing', approved_change_amount=62000000000, approved_schedule_impact_days=15, approved_at=now()-interval '30 days', implementation_started_at=now()-interval '20 days', decision_note='تصویب پس از کسر هزینهٔ حذف‌شده' where cr_number='KS-002' and master_project_id=p;
  update chg_change_requests set status='awaiting_approval', evaluation_completed_at=now()-interval '6 days', evaluation_note='ارزیابی فنی تکمیل؛ در انتظار تصمیم مدیرعامل (فراتر از سقف اختیار مجری)' where cr_number='KS-003' and master_project_id=p;
  update chg_change_requests set status='evaluating' where cr_number='KS-004' and master_project_id=p;
end
$seed$;
