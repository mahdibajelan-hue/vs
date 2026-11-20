"""Finance: budget and budget lines, annual budgets, three contracts (EPC, supervision consultant, third-party
inspection), monthly payment certificates with payments (advance recovery 10 %, retention 5 %, tax / insurance),
guarantees, claims, an amendment from the approved change, and the baseline / contractor cash-flow plans."""
from common import *

C_EPC, C_SUP, C_TPI = U('fin/epc'), U('fin/sup'), U('fin/tpi')

def jadd(y, m, n):
    m += n
    while m > 12: m -= 12; y += 1
    return y, m

def sql():
    out = ["-- finance"]
    out += ins('fin_budgets', [dict(id=U('fin/budget'), master_project_id=P, approved_budget=206_000_000_000_000, currency='IRR', notes='بودجهٔ مصوب طرح (پیمان EPC + خدمات مشاوره + بازرسی + هزینه‌های کارفرما + ذخیرهٔ احتیاط)',
                                         created_by=EMP_REP[2], approved_budget_fc=78_000_000, fc_currency='EUR', exchange_rate=EUR, certificate_approval_threshold=2_000_000_000_000, rate_date=D(2025, 8, 1))])
    lines = [('B-01', 'پیمان EPC ایستگاه تقویت فشار', 'contract', 190_000_000_000_000), ('B-02', 'خدمات مشاور نظارت', 'consultancy', 2_900_000_000_000), ('B-03', 'بازرسی فنی شخص ثالث (TPI)', 'inspection', 380_000_000_000),
             ('B-04', 'تملک زمین، مجوزها و عوارض', 'land', 1_200_000_000_000), ('B-05', 'هزینه‌های کارفرما (برق، آب، راه دسترسی)', 'owner', 2_600_000_000_000), ('B-06', 'ذخیرهٔ احتیاط', 'contingency', 8_920_000_000_000)]
    out += ins('fin_budget_lines', [dict(id=U('fin/bl/' + c), master_project_id=P, code=c, title=t, cost_category=cat, kind='land' if cat == 'land' else 'general', approved_amount=a, currency='IRR', notes='', is_active=True, created_by=EMP_REP[2]) for c, t, cat, a in lines])
    out += ins('fin_annual_budgets', [dict(id=U(f'fin/ab/{y}'), master_project_id=P, jalali_year=y, budget_amount=a, currency='IRR', notes='', created_by=EMP_REP[2]) for y, a in [(1404, 38e12), (1405, 74e12), (1406, 69e12), (1407, 25e12)]])
    out += ins('fin_contracts', [
        dict(id=C_EPC, master_project_id=P, contract_number='HMD-EPC-01', title='پیمان EPC احداث ایستگاه تقویت فشار همدان', contractor_org_id=ORG_CTR, contract_value=CONTRACT_VALUE, currency='IRR', advance_payment_percent=10, retention_percent=5,
             performance_guarantee_percent=5, start_date=START, planned_completion_date=FINISH, status='active', contract_role='main_epc', contract_value_fc=73_500_000, fc_currency='EUR', exchange_rate=EUR, contract_type='EPC — مبلغ مقطوع',
             budget_line_id=U('fin/bl/B-01'), status_note='', created_by=EMP_REP[2], rate_date=D(2025, 8, 1)),
        dict(id=C_SUP, master_project_id=P, contract_number='HMD-SUP-01', title='خدمات مهندسی نظارت عالیه و کارگاهی', contractor_org_id=ORG_SUP, contract_value=2_900_000_000_000, currency='IRR', advance_payment_percent=10, retention_percent=5,
             performance_guarantee_percent=5, start_date=START, planned_completion_date=FINISH, status='active', contract_role='supervision_consultant', contract_value_fc=0, fc_currency='', exchange_rate=1, contract_type='حق‌الزحمه — نفر-ماه',
             budget_line_id=U('fin/bl/B-02'), status_note='', created_by=EMP_REP[2], rate_date=None),
        dict(id=C_TPI, master_project_id=P, contract_number='HMD-TPI-01', title='بازرسی فنی شخص ثالث تجهیزات (داخل و خارج کشور)', contractor_org_id=ORG_DES, contract_value=380_000_000_000, currency='IRR', advance_payment_percent=0, retention_percent=0,
             performance_guarantee_percent=5, start_date=D(2025, 9, 1), planned_completion_date=D(2027, 9, 1), status='active', contract_role='tpi', contract_value_fc=0, fc_currency='', exchange_rate=1, contract_type='حق‌الزحمه',
             budget_line_id=U('fin/bl/B-03'), status_note='', created_by=EMP_REP[2], rate_date=None)])
    # monthly certificates of the EPC (1404/04 … 1405/07): earned value grows with the E/P/C progress
    cert, pay = [], []
    curve = [0.6, 1.4, 2.4, 3.0, 3.6, 4.1, 3.2, 2.0, 1.6, 2.8, 3.9, 4.6, 5.2, 5.6, 5.4, 5.0, 4.7, 4.3]  # % of contract per month
    y, m = 1404, 4
    adv = CONTRACT_VALUE * 0.10
    recovered = 0
    for i, pct in enumerate(curve):
        gross = round(CONTRACT_VALUE * pct / 100, -6)
        rec = round(min(gross * 0.10, adv - recovered), -6); recovered += rec
        ret = round(gross * 0.05, -6); tax = round(gross * 0.03, -6); ins_ = round(gross * 0.0167, -6)
        payable = gross - rec - ret - tax - ins_
        g = D(2025, 6, 22) + timedelta(days=30 * i)
        status = 'paid' if i < 12 else ('partially_paid' if i < 15 else ('certified' if i < 17 else 'under_review'))
        paid = payable if status == 'paid' else (round(payable * 0.55, -6) if status == 'partially_paid' else 0)
        cid = U(f'fin/cert/{i}')
        cert.append(dict(id=cid, contract_id=C_EPC, certificate_number=f'صورت‌وضعیت {i + 1:02d} — {JMONTH[m - 1]} {y}', certificate_date=add(g, 25), gross_amount=gross, adjustments=0, retention_amount=ret, advance_recovery_amount=rec,
                         certified_amount=gross if status != 'under_review' else None, paid_amount=paid, status=status, submitted_date=add(g, 27), certified_date=add(g, 40) if status != 'under_review' else None,
                         paid_date=add(g, 75) if paid else None, notes='', created_by=EMP_REP[2], certificate_type='work', gross_amount_fc=0, fc_currency='', exchange_rate=1, paid_amount_fc=0, paid_exchange_rate=1,
                         tax_deduction=tax, insurance_deduction=ins_, other_deduction=0, certified_by=CONS_PM if status != 'under_review' else None, approved_by=EMP_PM if status in ('paid', 'partially_paid', 'certified') else None,
                         approved_date=add(g, 45) if status in ('paid', 'partially_paid', 'certified') else None, attachment_url=''))
        if paid: pay.append(dict(id=U(f'fin/pay/{i}'), certificate_id=cid, payment_date=add(g, 75), amount=paid, amount_fc=0, fc_currency='', exchange_rate=1, method='حواله بانکی', reference_number=f'TR-{140400 + i * 7}', notes='', created_by=EMP_REP[2]))
        y, m = jadd(y, m, 1)
    # advance payment (certificate 0) and the supervision consultant's monthly invoices
    cert.append(dict(id=U('fin/cert/adv'), contract_id=C_EPC, certificate_number='پیش‌پرداخت ۱۰٪', certificate_date=D(2025, 4, 20), gross_amount=adv, adjustments=0, retention_amount=0, advance_recovery_amount=0, certified_amount=adv, paid_amount=adv,
                     status='paid', submitted_date=D(2025, 4, 10), certified_date=D(2025, 4, 18), paid_date=D(2025, 5, 5), notes='در قبال ضمانت‌نامهٔ بانکی پیش‌پرداخت', created_by=EMP_REP[2], certificate_type='work', gross_amount_fc=0, fc_currency='',
                     exchange_rate=1, paid_amount_fc=0, paid_exchange_rate=1, tax_deduction=0, insurance_deduction=0, other_deduction=0, certified_by=CONS_PM, approved_by=EMP_PM, approved_date=D(2025, 4, 20), attachment_url=''))
    pay.append(dict(id=U('fin/pay/adv'), certificate_id=U('fin/cert/adv'), payment_date=D(2025, 5, 5), amount=adv, amount_fc=0, fc_currency='', exchange_rate=1, method='حواله بانکی', reference_number='TR-140301', notes='پیش‌پرداخت', created_by=EMP_REP[2]))
    for i in range(16):
        g = D(2025, 4, 22) + timedelta(days=30 * i); amt = 72_000_000_000 + (i % 4) * 4_000_000_000; st = 'paid' if i < 13 else 'certified'
        cert.append(dict(id=U(f'fin/sup/{i}'), contract_id=C_SUP, certificate_number=f'صورت‌حساب نظارت {i + 1:02d}', certificate_date=add(g, 28), gross_amount=amt, adjustments=0, retention_amount=round(amt * .05), advance_recovery_amount=0,
                         certified_amount=amt, paid_amount=round(amt * .95) if st == 'paid' else 0, status=st, submitted_date=add(g, 29), certified_date=add(g, 35), paid_date=add(g, 60) if st == 'paid' else None, notes='', created_by=EMP_REP[2],
                         certificate_type='work', gross_amount_fc=0, fc_currency='', exchange_rate=1, paid_amount_fc=0, paid_exchange_rate=1, tax_deduction=0, insurance_deduction=0, other_deduction=0, certified_by=EMP_REP[0], approved_by=EMP_PM,
                         approved_date=add(g, 36), attachment_url=''))
        if st == 'paid': pay.append(dict(id=U(f'fin/sp/{i}'), certificate_id=U(f'fin/sup/{i}'), payment_date=add(g, 60), amount=round(amt * .95), amount_fc=0, fc_currency='', exchange_rate=1, method='حواله بانکی', reference_number=f'TS-{1404000 + i}', notes='', created_by=EMP_REP[2]))
    out += ins('fin_payment_certificates', cert) + ins('fin_payments', pay)
    out += ins('fin_guarantees', [dict(id=U('fin/g/adv'), contract_id=C_EPC, guarantee_type='bank_guarantee', number='BG-ADV-0425', amount=adv, currency='IRR', issue_date=D(2025, 4, 15), expiry_date=D(2027, 4, 15), status='active', notes='ضمانت‌نامهٔ پیش‌پرداخت؛ آزادسازی متناسب با استهلاک', created_by=EMP_REP[2], attachment_url=''),
                                        dict(id=U('fin/g/perf'), contract_id=C_EPC, guarantee_type='bank_guarantee', number='BG-PERF-0318', amount=CONTRACT_VALUE * .05, currency='IRR', issue_date=D(2025, 3, 18), expiry_date=D(2027, 3, 18), status='active', notes='ضمانت‌نامهٔ انجام تعهدات — تمدید آن تا فروردین ۱۴۰۶ لازم است', created_by=EMP_REP[2], attachment_url=''),
                                        dict(id=U('fin/g/sup'), contract_id=C_SUP, guarantee_type='promissory_note', number='SN-SUP-01', amount=145_000_000_000, currency='IRR', issue_date=D(2025, 3, 20), expiry_date=D(2028, 6, 20), status='active', notes='', created_by=EMP_REP[2], attachment_url='')])
    out += ins('fin_claims', [dict(id=U('fin/cl/1'), contract_id=C_EPC, claim_number='CL-01', claim_type='time_extension', title='تمدید مدت به‌علت تأخیر کارفرما در گشایش مرحلهٔ دوم اعتبار اسنادی توربوکمپرسورها', description='پیمانکار ۷۵ روز تمدید مدت و جبران هزینه‌های بالاسری را مطالبه کرده است.',
                                   submitted_date=D(2026, 9, 1), amount_claimed=1_950_000_000_000, amount_approved=None, currency='IRR', status='under_review', correspondence_ref='نامهٔ ۱۴۰۵/ح/۸۸۲', attachment_url='', notes='', created_by=EMP_REP[2]),
                              dict(id=U('fin/cl/2'), contract_id=C_EPC, claim_number='CL-02', claim_type='cost', title='هزینهٔ توقف ماشین‌آلات در توقف زمستانی ۱۴۰۴', description='مطالبهٔ هزینهٔ توقف ماشین‌آلات و نیروی ثابت کارگاه در زمستان؛ مشاور بخشی را پذیرفته است.',
                                   submitted_date=D(2026, 4, 10), amount_claimed=420_000_000_000, amount_approved=165_000_000_000, currency='IRR', status='partially_approved', correspondence_ref='نامهٔ ۱۴۰۵/ح/۲۱۴', attachment_url='', resolution_date=D(2026, 7, 2), notes='', created_by=EMP_REP[2])])
    out += ins('fin_contract_amendments', [dict(id=U('fin/am/1'), contract_id=C_SUP, amendment_number='الحاقیه ۱', amendment_date=D(2026, 10, 1), amount=420_000_000_000, reason='افزایش نفر-ماه نظارت به‌علت تمدید مدت اجرا', created_by=EMP_REP[2], days_delta=240, void_reason='')])
    # cash flow: baseline plan of the EPC by Jalali month, and the contractor's latest plan for the remaining months
    cf = []
    base = [0.6, 1.4, 2.4, 3.0, 3.6, 4.1, 3.2, 2.0, 1.6, 2.8, 3.9, 4.6, 5.2, 5.6, 5.4, 5.0, 4.7, 4.3, 3.6, 3.2, 3.0, 3.5, 4.1, 4.3, 4.0, 3.6, 3.0, 2.4, 1.8, 1.2, 0.9, 0.6, 0.4, 0.3, 0.2, 0.1]
    k = sum(base); y, m = 1404, 1
    for i, pct in enumerate(base):
        cf.append(dict(id=U(f'fin/cf/b/{i}'), contract_id=C_EPC, kind='baseline', fund='rial', currency='IRR', jalali_year=y, jalali_month=m, amount=round(CONTRACT_VALUE * pct / k, -6), created_by=EMP_REP[2], master_project_id=P))
        y, m = jadd(y, m, 1)
    y, m = 1405, 9
    for i, pct in enumerate([2.4, 2.0, 1.6, 2.8, 3.4, 4.0, 4.6, 5.1, 5.0, 4.8, 4.4, 4.0, 3.6, 3.2, 2.8, 2.4, 2.0, 1.6, 1.2, 0.9, 0.6, 0.4]):
        cf.append(dict(id=U(f'fin/cf/c/{i}'), contract_id=C_EPC, kind='contractor', fund='rial', currency='IRR', jalali_year=y, jalali_month=m, amount=round(CONTRACT_VALUE * pct / 100 * 0.62, -6), created_by=CTR_PM, master_project_id=P))
        y, m = jadd(y, m, 1)
    out += ins('fin_cashflow_plans', cf)
    return out, dict(contracts=3, certificates=len(cert), payments=len(pay))
