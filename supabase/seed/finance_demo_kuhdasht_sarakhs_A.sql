-- Finance & Contract Control demo — 48" gas pipeline Kuhdasht–Sarakhs (master project MAT-DEMO-48). Part A: budget, contracts, amendments, guarantees, clearances, claims, retention.
-- Idempotent guard: does nothing when the project already has contracts. All rows are plain fin_* rows (no is_demo column) — clean up by master_project_id.
do $seed$
declare
  p constant uuid := '5aa1afc2-c569-4546-a07f-2ca4160c2e63';
  u constant uuid := '244bc5e5-d9f2-4931-b417-d7eea2ffd444';
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
  l_con1 uuid; l_con2 uuid; l_proc uuid; l_sup uuid; l_land uuid; l_own uuid; l_cont uuid;
begin
  if exists (select 1 from fin_contracts where master_project_id = p) then return; end if;

  -- 1) Project budget + budget lines
  insert into fin_budgets (master_project_id, approved_budget, currency, notes, certificate_approval_threshold, created_by)
  values (p, 5120000000000, 'IRR', 'بودجهٔ مصوب پروژه (مصوبهٔ هیئت‌مدیره، شامل ذخیره و تحصیل اراضی)', 150000000000, u);
  insert into fin_budget_changes (master_project_id, change_date, amount, reason, created_by) values
    (p, date '2025-11-20', 150000000000, 'الحاقیهٔ محدودهٔ کار: افزایش گذرهای رودخانه‌ای', u),
    (p, date '2026-03-08', -40000000000, 'صرفه‌جویی مهندسی ارزش در پوشش خط لوله', u);
  insert into fin_budget_lines (master_project_id, code, title, cost_category, kind, approved_amount, currency, created_by) values
    (p, 'KS-CON1', 'اجرای قطعهٔ ۱ (کوهدشت تا میانه)', 'construction', 'general', 1850000000000, 'IRR', u),
    (p, 'KS-CON2', 'اجرای قطعهٔ ۲ (میانه تا سرخس)', 'construction', 'general', 1550000000000, 'IRR', u),
    (p, 'KS-PROC', 'تأمین لولهٔ ۴۸ اینچ و اتصالات', 'procurement', 'general', 900000000000, 'IRR', u),
    (p, 'KS-SUP', 'نظارت، مشاوره و بازرسی شخص ثالث', 'supervision', 'general', 250000000000, 'IRR', u),
    (p, 'KS-LAND', 'تحصیل اراضی و خسارت‌ها', 'land', 'land', 260000000000, 'IRR', u),
    (p, 'KS-OWN', 'هزینه‌های کارفرما', 'owner', 'general', 120000000000, 'IRR', u),
    (p, 'KS-CONT', 'ذخیرهٔ پروژه', 'contingency', 'general', 190000000000, 'IRR', u);
  select id into l_con1 from fin_budget_lines where master_project_id = p and code = 'KS-CON1';
  select id into l_con2 from fin_budget_lines where master_project_id = p and code = 'KS-CON2';
  select id into l_proc from fin_budget_lines where master_project_id = p and code = 'KS-PROC';
  select id into l_sup from fin_budget_lines where master_project_id = p and code = 'KS-SUP';
  select id into l_land from fin_budget_lines where master_project_id = p and code = 'KS-LAND';

  -- 2) Contracts (two EPC sections, one with a euro component; supervision; line-pipe supply with euro component; third-party inspection)
  insert into fin_contracts (master_project_id, contract_number, title, contractor_org_id, contract_value, currency, advance_payment_percent, retention_percent, performance_guarantee_percent, start_date, planned_completion_date, status, contract_role, contract_type, budget_line_id, contract_value_fc, fc_currency, exchange_rate, rate_date, created_by)
  values (p, 'KS-EPC-01', 'قرارداد EPC احداث خط لوله ۴۸ اینچ کوهدشت–سرخس — قطعهٔ ۱', '758db988-6b9d-426d-b9ac-56f18ac79d60', 1600000000000, 'IRR', 10, 5, 10, date '2025-07-01', date '2027-06-30', 'active', 'main_epc', 'epc', l_con1, 0, 'EUR', 0, null, u) returning id into c1;
  insert into fin_contracts (master_project_id, contract_number, title, contractor_org_id, contract_value, currency, advance_payment_percent, retention_percent, performance_guarantee_percent, start_date, planned_completion_date, status, contract_role, contract_type, budget_line_id, contract_value_fc, fc_currency, exchange_rate, rate_date, created_by)
  values (p, 'KS-EPC-02', 'قرارداد EPC احداث خط لوله ۴۸ اینچ کوهدشت–سرخس — قطعهٔ ۲', 'a8a29077-a502-49d1-b90a-465254d68253', 1100000000000, 'IRR', 10, 5, 10, date '2025-09-01', date '2027-09-01', 'active', 'main_epc', 'epc', l_con2, 600000, 'EUR', 580000, date '2025-09-01', u) returning id into c2;
  insert into fin_contracts (master_project_id, contract_number, title, contractor_org_id, contract_value, currency, advance_payment_percent, retention_percent, performance_guarantee_percent, start_date, planned_completion_date, status, contract_role, contract_type, budget_line_id, contract_value_fc, fc_currency, exchange_rate, created_by)
  values (p, 'KS-SUP-01', 'قرارداد مشاوره و نظارت عالیه بر اجرای خط لوله', '258183da-8472-4560-a384-5a17ada72e71', 210000000000, 'IRR', 5, 5, 5, date '2025-07-01', date '2027-12-31', 'active', 'supervision_consultant', 'supervision', l_sup, 0, 'EUR', 0, u) returning id into c3;
  insert into fin_contracts (master_project_id, contract_number, title, contractor_org_id, contract_value, currency, advance_payment_percent, retention_percent, performance_guarantee_percent, start_date, planned_completion_date, status, contract_role, contract_type, budget_line_id, contract_value_fc, fc_currency, exchange_rate, rate_date, created_by)
  values (p, 'KS-SUP-PIPE', 'قرارداد تأمین لولهٔ ۴۸ اینچ API 5L X70 و اتصالات', '2f440812-ccb3-4917-8aa0-d80fa611fd5b', 400000000000, 'IRR', 15, 5, 10, date '2025-08-01', date '2026-12-31', 'active', 'other', 'equipment_supply', l_proc, 800000, 'EUR', 600000, date '2025-08-01', u) returning id into c4;
  insert into fin_contracts (master_project_id, contract_number, title, contractor_org_id, contract_value, currency, advance_payment_percent, retention_percent, performance_guarantee_percent, start_date, planned_completion_date, status, contract_role, contract_type, budget_line_id, contract_value_fc, fc_currency, exchange_rate, created_by)
  values (p, 'KS-TPI-01', 'قرارداد بازرسی شخص ثالث (TPI) جوش و پوشش', 'f03463c5-6a72-4a2f-909c-45f3e509ccbb', 45000000000, 'IRR', 0, 5, 5, date '2025-09-01', date '2027-06-30', 'active', 'tpi', 'other', l_sup, 0, 'EUR', 0, u) returning id into c5;

  -- 3) Amendments (change-request amendments are created by the sync trigger in part D)
  insert into fin_contract_amendments (contract_id, amendment_number, amendment_date, amount, reason, days_delta, created_by) values
    (c1, 'AM-01', date '2025-12-15', 85000000000, 'الحاقیه: تعرفهٔ جدید خاک‌برداری در زمین‌های سنگی', 30, u),
    (c2, 'AM-01', date '2026-02-20', 120000000000, 'الحاقیه: افزایش گذرهای جاده‌ای و راه‌آهن', 20, u),
    (c3, 'AM-01', date '2026-04-10', 18000000000, 'الحاقیه: تمدید دورهٔ نظارت به‌علت تمدید پیمان', 0, u),
    (c4, 'AM-01', date '2026-03-05', -22000000000, 'کاهش مقدار لوله پس از اصلاح MTO', 0, u);
  insert into fin_contract_amendments (contract_id, amendment_number, amendment_date, amount, reason, days_delta, voided_at, void_reason, created_by)
  values (c1, 'AM-X', date '2026-05-01', 30000000000, 'الحاقیهٔ اشتباهی (ثبت تکراری)', 0, now(), 'ثبت تکراری — ابطال شد', u);

  -- 4) Guarantees: one expiring in <30 days, one already past expiry but still active (needs renewal), one released
  insert into fin_guarantees (contract_id, guarantee_type, number, amount, currency, issue_date, expiry_date, status, notes, created_by) values
    (c1, 'bank_guarantee', 'BG-1404-1187', 160000000000, 'IRR', date '2025-06-25', date '2026-11-05', 'active', 'حسن انجام تعهدات — نیازمند تمدید', u),
    (c1, 'bank_guarantee', 'BG-1404-1188', 160000000000, 'IRR', date '2025-06-25', date '2027-03-20', 'active', 'پیش‌پرداخت', u),
    (c2, 'bank_guarantee', 'BG-1404-2210', 110000000000, 'IRR', date '2025-08-28', date '2026-09-20', 'active', 'حسن انجام تعهدات — تاریخ گذشته ولی هنوز فعال', u),
    (c2, 'bank_guarantee', 'BG-1404-2211', 110000000000, 'IRR', date '2025-08-28', date '2027-02-28', 'active', 'پیش‌پرداخت', u),
    (c3, 'promissory_note', 'PN-1404-77', 10500000000, 'IRR', date '2025-06-28', date '2028-01-31', 'active', 'سفته حسن انجام کار', u),
    (c4, 'bank_guarantee', 'BG-1404-3301', 40000000000, 'IRR', date '2025-07-28', date '2027-01-31', 'active', 'حسن انجام تعهدات', u),
    (c4, 'bank_guarantee', 'BG-1404-3302', 60000000000, 'IRR', date '2025-07-28', date '2026-08-30', 'released', 'پیش‌پرداخت — پس از تهاتر کامل آزاد شد', u),
    (c5, 'promissory_note', 'PN-1404-91', 2250000000, 'IRR', date '2025-08-25', date '2027-09-30', 'active', 'سفته حسن انجام کار', u);

  -- 5) Statutory clearances
  insert into fin_clearances (contract_id, kind, status, number, issue_date, expiry_date, note) values
    (c1, 'social_security', 'issued', 'SS-1405-4410', date '2026-06-21', date '2026-12-20', ''),
    (c1, 'insurance', 'issued', 'INS-1405-88', date '2026-04-26', date '2026-10-25', 'کمتر از دو هفته به پایان اعتبار'),
    (c1, 'tax', 'issued', 'TX-1405-2210', date '2026-03-21', date '2027-03-20', ''),
    (c2, 'social_security', 'expired', 'SS-1404-9902', date '2026-03-01', date '2026-09-01', 'تمدید نشده — پرداخت صورت‌وضعیت مشروط'),
    (c2, 'insurance', 'pending', '', null, null, 'در انتظار صدور'),
    (c2, 'tax', 'issued', 'TX-1405-2218', date '2026-03-21', date '2027-03-20', ''),
    (c3, 'social_security', 'issued', 'SS-1405-4501', date '2026-07-01', date '2027-01-01', ''),
    (c3, 'tax', 'issued', 'TX-1405-2302', date '2026-03-21', date '2027-03-20', ''),
    (c4, 'social_security', 'issued', 'SS-1405-4620', date '2026-05-10', date '2026-11-10', '');

  -- 6) Claims
  insert into fin_claims (contract_id, claim_number, claim_type, title, description, submitted_date, amount_claimed, amount_approved, currency, status, correspondence_ref, resolution_date, created_by) values
    (c1, 'CL-01', 'time_extension', 'تمدید زمان به‌علت تأخیر در رفع تصرف اراضی', 'تأخیر ۴۵ روزه در تحویل ۱۲ قطعهٔ زمین کیلومتر ۳۰ تا ۶۰', date '2026-04-12', 0, 0, 'IRR', 'under_review', 'C-1405-0412', null, u),
    (c1, 'CL-02', 'cost', 'هزینهٔ توقف ماشین‌آلات بر اثر بارندگی غیرمتعارف', 'ادعای هزینهٔ دورهٔ توقف اسفند تا فروردین', date '2026-06-02', 82000000000, 0, 'IRR', 'submitted', 'C-1405-0602', null, u),
    (c2, 'CL-01', 'variation', 'کار اضافی: لوله‌گذاری در مسیر معدنی', 'مسیر عبوری از حریم معدن نیاز به حفاظت اضافی', date '2026-02-14', 64000000000, 0, 'IRR', 'rejected', 'C-1404-0214', date '2026-04-05', u),
    (c2, 'CL-02', 'disruption', 'اختلال در جریان کار به‌علت تأخیر تأمین لوله', 'تأخیر تحویل لوله به محل (وابسته به قرارداد تأمین)', date '2026-05-20', 95000000000, 41000000000, 'IRR', 'partially_approved', 'C-1405-0520', date '2026-08-30', u),
    (c4, 'CL-01', 'cost', 'جبران افزایش هزینهٔ حمل دریایی', 'افزایش کرایهٔ حمل کانتینر از بندر', date '2026-07-04', 36000000000, 36000000000, 'IRR', 'approved', 'C-1405-0704', date '2026-09-15', u);

  -- 7) Retention releases
  insert into fin_retention_releases (contract_id, release_stage, planned_date, planned_amount, actual_date, actual_amount, status, notes, created_by) values
    (c1, 'provisional_handover', date '2027-08-15', 40000000000, null, null, 'pending', '', u),
    (c1, 'final_handover', date '2028-08-15', 40000000000, null, null, 'pending', '', u),
    (c4, 'provisional_handover', date '2026-09-30', 10000000000, date '2026-10-04', 10000000000, 'released', 'آزادسازی پس از تأیید تحویل موقت لوله', u),
    (c4, 'final_handover', date '2027-09-30', 10000000000, null, null, 'pending', '', u);
end
$seed$;
