"""Governance: risk register (assessments, response actions, KRIs with readings), issues (workflow stages), decisions,
lessons learned, change requests, management decisions / actions, and stakeholders. The turbo-compressor supply risk
(R-001, score 20, escalated) is the headline item and is linked from the issue, the decision and the actions."""
from common import *
from m_master import RM_P, IM_P

RISKS = [  # code, title, category, sub, phase, P, I, cur P, cur I, status, strategy, cause, event, consequence, time days, cost
    ('R-001', 'عدم تحویل به‌موقع پکیج توربوکمپرسور واحد C (و ریسک واحد B)', 'procurement', 'proc_longlead', 'procurement', 4, 5, 5, 5, 'escalated', 'mitigate',
     'تحریم و توقف قطعات Hot Section در گمرک کشور ثالث؛ وابستگی به نمایندهٔ واسط سازنده', 'تحویل واحد C دست‌کم ۵ تا ۷ ماه دیرتر از برنامه', 'تأخیر گازدهی ایستگاه و خسارت تأخیر؛ از دست رفتن ظرفیت انتقال زمستان ۱۴۰۶', 210, 2_500_000_000_000),
    ('R-002', 'تأخیر تخصیص ارز و گشایش مرحلهٔ دوم اعتبار اسنادی تجهیزات خارجی', 'cost', None, 'procurement', 3, 4, 4, 4, 'open', 'escalate', 'محدودیت منابع ارزی کارفرما', 'عدم صدور مجوز حمل واحدهای A و B', 'انبارداری در بندر و جریمهٔ دموراژ', 75, 600_000_000_000),
    ('R-003', 'تأخیر تکمیل مدارک فروشنده (VDR) و نقشه‌های فونداسیون واحد C', 'engineering', 'eng_design', 'engineering', 3, 3, 3, 4, 'open', 'mitigate', 'دیرکرد سازنده در ارسال بارهای دینامیکی', 'تأخیر IFC فونداسیون', 'توقف بتن‌ریزی بلوک واحد C', 45, 120_000_000_000),
    ('R-004', 'کمبود جوشکار واجد شرایط برای جوشکاری میدانی ایستگاه در بهار ۱۴۰۶', 'construction', 'con_weld', 'construction', 3, 3, 3, 3, 'monitoring', 'mitigate', 'بازار کار پروژه‌های هم‌زمان', 'کمبود ۱۲ جوشکار', 'کاهش نرخ جوشکاری و تأخیر تست‌پک‌ها', 30, 90_000_000_000),
    ('R-005', 'بالا بودن نرخ تعمیر جوش در اسپول‌های شاپ (جوشکار WD-07)', 'quality', None, 'construction', 2, 3, 3, 3, 'open', 'mitigate', 'کیفیت پایین پاس ریشه', 'نرخ مردودی بالاتر از ۵٪', 'دوباره‌کاری و تأخیر ارسال اسپول', 15, 25_000_000_000),
    ('R-006', 'سرمای زودرس و طولانی شدن توقف زمستانی همدان', 'construction', None, 'construction', 3, 2, 3, 3, 'monitoring', 'accept', 'اقلیم سرد کوهستانی', 'تعطیلی بتن‌ریزی تا اواسط اسفند', 'فشرده شدن کارهای بهار', 20, 40_000_000_000),
    ('R-007', 'محدودیت صادرات و تأخیر تأمین سیستم DCS/ESD', 'procurement', 'proc_supplier', 'procurement', 3, 4, 4, 4, 'open', 'mitigate', 'محدودیت صادرات تجهیزات کنترلی', 'تأخیر ۳ ماهه در تحویل DCS', 'تأخیر Loop Check و راه‌اندازی', 75, 350_000_000_000),
    ('R-008', 'تداخل اجرای Tie-in با خط سراسری در حال بهره‌برداری', 'hse', 'hse_safety', 'construction', 2, 5, 2, 5, 'open', 'avoid', 'کار گرم در مجاورت خط تحت فشار', 'نشت یا حادثه حین Hot-tap', 'خسارت جانی و توقف انتقال گاز', 10, 500_000_000_000),
    ('R-009', 'افزایش قیمت مصالح و نوسان نرخ ارز بیش از سقف تعدیل', 'cost', None, 'construction', 4, 3, 4, 3, 'open', 'transfer', 'تورم', 'افزایش هزینهٔ تمام‌شده', 'فشار نقدینگی پیمانکار و کندی کار', 0, 1_800_000_000_000),
    ('R-010', 'تأخیر صدور مجوزهای محیط‌زیست و منابع طبیعی برای دفع پساب', 'permits', None, 'construction', 2, 2, 2, 2, 'closed', 'mitigate', 'فرایند اداری', 'تأخیر مجوز', 'تأخیر جزئی محوطه‌سازی', 10, 5_000_000_000),
    ('R-011', 'فرصت: تأمین داخلی فیلترسپراتورها و کاهش زمان تحویل', 'procurement', None, 'procurement', 3, 3, 3, 3, 'open', 'exploit', 'توان سازندگان داخلی', 'تحویل زودتر از برنامه', 'جبران بخشی از تأخیر مسیر بحرانی', -20, -80_000_000_000),
]
ISSUES = [  # title, category, stage, severity, priority, owner, days ago, impact days, cost
    ('توقف قطعات Hot Section توربوکمپرسور واحد C در گمرک کشور ثالث', 'procurement', 'action_plan', 'critical', 'critical', CTR_PM, 160, 150, 2_500_000_000_000),
    ('عدم گشایش مرحلهٔ دوم اعتبار اسنادی و عدم صدور مجوز حمل واحدهای A و B', 'contract_commercial', 'in_progress', 'high', 'high', EMP_PM, 95, 75, 600_000_000_000),
    ('مقاومت ۲۸ روزهٔ بتن فونداسیون واحد B کمتر از مقدار طراحی', 'quality', 'analysis', 'high', 'high', CONS_PM, 40, 20, 90_000_000_000),
    ('تأخیر تأیید نقشه‌های IFC ایزومتریک بستهٔ دوم', 'document_approval', 'in_progress', 'medium', 'high', CONS_PM, 55, 30, 0),
    ('کمبود میلگرد سایز ۲۵ و ۳۲ در بازار منطقه', 'procurement', 'closed', 'medium', 'medium', CTR_PM, 140, 10, 15_000_000_000),
    ('نرخ تعمیر جوش ۱۶٪ برای جوشکار WD-07 در شاپ اسپول', 'quality', 'resolution_review', 'medium', 'medium', CTR_REP, 30, 5, 8_000_000_000),
    ('تداخل مسیر داکت‌بانک برق با کانال زهکشی محوطه', 'interface', 'validated', 'low', 'medium', CTR_REP, 20, 7, 4_000_000_000),
    ('حادثهٔ جزئی سقوط ابزار از پایپ‌رک — عدم استفاده از کیسهٔ ابزار', 'hse', 'closed', 'medium', 'high', CONS_PM, 70, 0, 0),
    ('تأخیر پرداخت صورت‌وضعیت‌های ۱۳ تا ۱۵ و کاهش نیروی پیمانکار', 'finance', 'registered', 'high', 'high', EMP_REP[2], 12, 20, 0),
]

def sql():
    out = ["-- governance: risks, issues, decisions, lessons, changes, management decisions and actions, stakeholders"]
    risks, ass, acts, kris, reads = [], [], [], [], []
    for i, (code, title, cat, sub, phase, p, im, cp, ci, st, strat, cause, ev, cons, tdays, cost) in enumerate(RISKS):
        rid = U('risk/' + code)
        ident = add(START, 40 + i * 37)
        risks.append(dict(id=rid, project_id=RM_P, code=code, title=title, description=f'{cause}. {ev}.', category=cat, risk_type='opportunity' if cost < 0 else 'threat', owner_id={0: CTR_PM, 1: EMP_PM}.get(i, CONS_PM if i % 2 else CTR_PM),
                          identified_date=ident, status=st, response_strategy=strat, project_phase=phase, time_to_impact_days=max(10, 120 - i * 9), initial_probability=p, initial_impact=im, created_by=EMP_REP[1],
                          escalation_level='management' if st == 'escalated' else None, escalated_to='هیئت‌مدیرهٔ کارفرما' if st == 'escalated' else '', escalation_reason='امتیاز ۲۵ و اثر مستقیم بر تاریخ گازدهی' if st == 'escalated' else '',
                          escalation_date=D(2026, 10, 12) if st == 'escalated' else None, required_decision='تأیید تأمین جایگزین قطعات Hot Section از مسیر دوم و پرداخت هزینهٔ اضافی' if st == 'escalated' else '',
                          escalation_status='escalated' if st == 'escalated' else 'none', cause=cause, risk_event=ev, consequence=cons, source='manual', subcategory=sub, discipline={'procurement': 'procurement', 'engineering': 'engineering'}.get(phase, 'construction'),
                          impact_time_days=abs(tdays), impact_cost=abs(cost), station='ایستگاه همدان', contractor='مشارکت پیمانکاری نمونهٔ گاما', work_package={'procurement': 'تأمین کالا'}.get(phase, phase),
                          review_interval_days=14 if st == 'escalated' else 30, next_review_date=add(TODAY, 7 if st == 'escalated' else 20), closed_reason='مجوز صادر شد' if st == 'closed' else ''))
        for k, (dt, a, b) in enumerate([(add(ident, 30), p, im), (add(TODAY, -20), cp, ci)]):
            ass.append(dict(id=U(f'riska/{code}/{k}'), risk_id=rid, review_date=dt, current_probability=a, current_impact=b, residual_probability=max(1, a - 1), residual_impact=max(1, b - 1), trend='worsening' if k and cp * ci > p * im else 'stable',
                            reviewer_comment='بازبینی دوره‌ای' if k else 'ارزیابی اولیه پس از شناسایی', created_by=EMP_REP[1], method='qualitative', basis='', kind='periodic' if k else 'review'))
        if st != 'closed':
            for k, (desc, typ, pct, s2) in enumerate({0: [('پیگیری از طریق نمایندهٔ دوم سازنده و حمل هوایی قطعات از مسیر جایگزین', 'mitigating', 40, 'in_progress'), ('بررسی امکان تأمین پره‌های توربین از سازندهٔ داخلی (مهندسی معکوس) برای واحد C', 'contingency', 15, 'in_progress'),
                                                     ('تغییر توالی نصب: نصب و راه‌اندازی واحدهای A و B پیش از واحد C', 'mitigating', 60, 'in_progress'), ('جلسهٔ هفتگی پیگیری تأمین با حضور کارفرما و سازنده', 'preventive', 100, 'completed')]}.get(i, [('اقدام پاسخ اصلی ریسک', 'mitigating', 30 + i * 5, 'in_progress')])):
                acts.append(dict(id=U(f'riskact/{code}/{k}'), risk_id=rid, description=desc, owner_id=CTR_PM if i == 0 else CONS_PM, due_date=add(TODAY, 20 + k * 25), status=s2, completion_percentage=pct, created_by=EMP_REP[1], action_type=typ,
                                 expected_output='', expected_effect='کاهش احتمال' if typ != 'contingency' else 'کاهش اثر', resources='', completion_criteria='', planned_start=add(TODAY, -60), blocked_reason='', evidence_note='', effect_status='pending', effect_note=''))
    kd = [('KRI-01', 'R-001', 'تأخیر برآوردی تحویل توربوکمپرسور واحد C', 'روز', 'higher_worse', 30, 90, [60, 95, 120, 150, 165]),
          ('KRI-02', 'R-002', 'سهم ارز تخصیص‌یافته از نیاز اعتبار اسنادی', 'درصد', 'lower_worse', 80, 60, [100, 85, 70, 58, 55]),
          ('KRI-03', 'R-005', 'نرخ مردودی جوش شاپ (۳۰ روز اخیر)', 'درصد', 'higher_worse', 4, 7, [2.1, 3.0, 4.6, 6.2, 5.1]),
          ('KRI-04', 'R-003', 'تعداد مدارک VDR معوق بیش از ۳۰ روز', 'مدرک', 'higher_worse', 5, 10, [3, 6, 8, 9, 11])]
    for code, rk, name, unit, dirn, warn, crit, vals in kd:
        kid = U('kri/' + code)
        last = vals[-1]; state = ('critical' if (last >= crit if dirn == 'higher_worse' else last <= crit) else 'warn' if (last >= warn if dirn == 'higher_worse' else last <= warn) else 'normal')
        kris.append(dict(id=kid, project_id=RM_P, risk_id=U('risk/' + rk), name=name, definition='', unit=unit, domain='project', direction=dirn, baseline=vals[0], warn_threshold=warn, critical_threshold=crit, frequency_days=30, owner_id=EMP_REP[1],
                         data_source='manual', active=True, current_value=last, last_reading_at=ts(add(TODAY, -5)), state=state, created_by=EMP_REP[1]))
        for k, v in enumerate(vals): reads.append(dict(kri_id=kid, value=v, read_at=ts(add(TODAY, -5 - (len(vals) - 1 - k) * 30)), source='manual', note='', created_by=EMP_REP[1]))
    out += ins('rm_risks', risks) + ins('rm_risk_assessments', ass) + ins('rm_risk_actions', acts) + ins('rm_kris', kris) + ins('rm_kri_readings', reads)
    # issues
    iss = []
    for i, (title, cat, stage, sev, pri, owner, ago, idays, cost) in enumerate(ISSUES):
        iss.append(dict(id=U(f'iss/{i}'), code=f'HMD-ISS-{i + 1:02d}', project_id=IM_P, title=title, description=title + '.', pursuer_id=owner, approver_id=EMP_PM, priority=pri, deadline_days=30, status='open', created_by=EMP_REP[0],
                        created_at=ts(add(TODAY, -ago)), source='report' if i in (2, 5, 7) else 'manual', category=cat, discipline={'procurement': 'تأمین', 'quality': 'کنترل کیفیت', 'hse': 'HSE'}.get(cat, 'مدیریت پروژه'), location='ایستگاه همدان',
                        identified_at=add(TODAY, -ago), severity=sev, urgency=pri, impact_time_days=idays, impact_cost=cost, impact_quality=2 if cat == 'quality' else 0, impact_safety=3 if cat == 'hse' else 0, impact_contract=2 if cat in ('contract_commercial', 'finance') else 0,
                        owner_id=owner, resolve_due_date=add(TODAY, 45 - ago // 3), authority_level='management' if sev == 'critical' else 'project_manager', workflow_key='standard', stage=stage,
                        root_cause_summary='وابستگی به تأمین‌کنندهٔ خارجی واحد و نبود منبع جایگزین' if i == 0 else '', resolution_summary='تأمین از بازار تهران با قیمت بالاتر' if stage == 'closed' else '',
                        lessons_learned='برای اقلام بحرانی دست‌کم دو منبع تأمین در مرحلهٔ RFQ تأیید شود' if i == 0 else ''))
    out += ins('im_issues', iss)
    out += ins('im_decisions', [dict(id=U('imd/0'), project_id=IM_P, issue_id=U('iss/0'), title='انتخاب مسیر جایگزین تأمین قطعات Hot Section واحد C', question='آیا هزینهٔ اضافی حمل هوایی و نمایندهٔ دوم (≈ ۴۲۰ میلیارد ریال) پذیرفته شود؟',
                                     requested_by=CTR_PM, decider_id=ME, needed_by=add(TODAY, 10), status='pending', rationale=''),
                                dict(id=U('imd/1'), project_id=IM_P, issue_id=U('iss/2'), title='تصمیم دربارهٔ بلوک بتنی واحد B با مقاومت کمتر', question='مغزه‌گیری و ارزیابی سازه‌ای یا تخریب و بتن‌ریزی مجدد؟',
                                     requested_by=CONS_PM, decider_id=EMP_PM, needed_by=add(TODAY, 15), status='pending', rationale='')])
    out += ins('im_lessons', [dict(id=U('iml/0'), source_issue_id=U('iss/4'), project_id=IM_P, title='ذخیرهٔ احتیاطی میلگرد پیش از فصل کاری', context='کمبود میلگرد سایزهای درشت در بازار منطقه در اوج فصل بتن‌ریزی', root_cause='خرید تدریجی و نبود قرارداد چارچوب',
                                    solution='خرید از بازار تهران', prevention='قرارداد چارچوب با دو تأمین‌کننده و انبار ذخیرهٔ ۲۰٪ پیش از فروردین', category='procurement', tags=Raw("array['تأمین','سیویل']::text[]"), status='published', created_by=CONS_PM, approved_by=EMP_PM, approved_at=ts(add(TODAY, -60))),
                              dict(id=U('iml/1'), source_issue_id=U('iss/7'), project_id=IM_P, title='الزام کیسه و طناب ابزار در کار در ارتفاع', context='سقوط آچار از تراز ۶ متر پایپ‌رک', root_cause='نظارت ناکافی سرپرست', solution='توقف کار و آموزش',
                                    prevention='بازرسی روزانهٔ تجهیزات کار در ارتفاع و درج در مجوز کار', category='hse', tags=Raw("array['HSE','کار در ارتفاع']::text[]"), status='published', created_by=CONS_PM, approved_by=EMP_PM, approved_at=ts(add(TODAY, -40)))])
    # change requests (statuses kept through app.cm_rpc)
    chg = [('CR-01', 'افزودن مخزن دوم آب آتش‌نشانی و پمپ دیزلی پشتیبان (الزام آتش‌نشانی استان)', 'implemented', 'medium', 'technical', 'construction', 'employer', 1_350_000_000_000, 1_250_000_000_000, 25, 20),
           ('CR-02', 'تغییر فونداسیون بلوکی واحد C به شمع و سرشمع به‌علت گزارش ژئوتکنیک تکمیلی', 'approved', 'high', 'technical', 'engineering', 'consultant', 2_100_000_000_000, 1_900_000_000_000, 45, 35),
           ('CR-03', 'تمدید مدت پیمان به‌علت تأخیر تحویل توربوکمپرسورها', 'evaluating', 'critical', 'time_extension', 'procurement', 'contractor', 0, None, 240, None),
           ('CR-04', 'جایگزینی DCS خارجی با سامانهٔ کنترل داخلی معادل', 'submitted', 'high', 'technical', 'procurement', 'contractor', -380_000_000_000, None, 60, None),
           ('CR-05', 'افزایش ظرفیت ترانسفورماتورها از ۲۰۰۰ به ۲۵۰۰ کیلوولت‌آمپر', 'closed', 'low', 'quantity', 'engineering', 'consultant', 160_000_000_000, 150_000_000_000, 0, 0)]
    out += ins('chg_change_requests', [dict(id=U('chg/' + c), master_project_id=P, cr_number=c, title=t, description=t, reason_for_change=t, priority=pr, currency='IRR', original_contract_amount=CONTRACT_VALUE, proposed_change_amount=pa,
                                            approved_change_amount=aa, original_duration_days=(FINISH - START).days, proposed_schedule_impact_days=pd, approved_schedule_impact_days=ad, new_risks_count=1 if c in ('CR-02', 'CR-03') else 0,
                                            scope_impact_level=pr if pr != 'critical' else 'high', status=st, submitted_by=CTR_PM, submitted_at=ts(add(TODAY, -120 + i * 20)), created_by=CTR_PM, project_code=CODE, contract_name='پیمان EPC ایستگاه همدان',
                                            contract_number='HMD-EPC-01', contract_date='1404/01/02', project_phase=ph, requester_name={'employer': PEOPLE[EMP_PM], 'consultant': PEOPLE[CONS_PM]}.get(ro, PEOPLE[CTR_PM]), requester_organization=ro,
                                            change_types=Raw(f"array[{q(ct)}]::text[]"), current_situation_description='', change_reason_categories=Raw("array['الزام فنی']::text[]"), change_reason_other='', affected_documents=Raw("'[]'::jsonb"),
                                            scope_change_type='increase' if (pa or 0) > 0 else ('decrease' if (pa or 0) < 0 else 'none'), scope_effect_description='', identified_risks=Raw("'[]'::jsonb"), requires_new_risk_register_entry=c == 'CR-03',
                                            creates_new_issue=False, implementation_actions=Raw("'[]'::jsonb"), updated_document_types=Raw("'{}'::text[]"), contract_id=U('fin/epc'), contractor_org_id=ORG_CTR)
                                       for i, (c, t, st, pr, ct, ph, ro, pa, aa, pd, ad) in enumerate(chg)])
    # management decisions and actions (Radar / management report)
    out += ins('rasta_decisions', [dict(id=U('rd/0'), master_project_id=P, title='تأمین قطعات Hot Section واحد C از مسیر دوم با هزینهٔ اضافی', description='سازندهٔ اصلی تحویل واحد C را حداقل ۵ ماه عقب انداخته است.', reason='حفظ تاریخ گازدهی واحدهای A و B',
                                         required_by=add(TODAY, 10), impact='تأخیر ۸ ماهه تحویل موقت در صورت عدم تصمیم', recommended_action='تأیید هزینهٔ اضافی و ابلاغ تغییر توالی نصب', decision_owner_id=ME, status='in_review', final_decision='',
                                         related_risk_id=U('risk/R-001'), related_issue_id=U('iss/0'), related_milestone_label='گازدهی واحدهای A و B', created_by=EMP_PM, cancel_reason=''),
                                    dict(id=U('rd/1'), master_project_id=P, title='اولویت تخصیص ارز به مرحلهٔ دوم اعتبار اسنادی توربوکمپرسورها', description='', reason='آزادسازی واحدهای A و B از بندر', required_by=add(TODAY, 20), impact='دموراژ و تأخیر نصب',
                                         recommended_action='', decision_owner_id=ME, status='approved', final_decision='تخصیص ارز از سهمیهٔ سه‌ماههٔ چهارم ۱۴۰۵ تصویب شد', decided_at=ts(add(TODAY, -6)), decided_by=ME, related_risk_id=U('risk/R-002'),
                                         related_issue_id=U('iss/1'), related_milestone_label='', created_by=EMP_PM, cancel_reason='')])
    ra = [('ابلاغ تغییر توالی نصب: واحدهای A و B پیش از C', CTR_PM, 15, 'high', 'in_progress', 'decision', 40), ('پیگیری ترخیص واحد A از بندرعباس', CTR_PM, 10, 'critical', 'in_progress', 'risk', 55),
          ('مغزه‌گیری و آزمایش فونداسیون واحد B', CONS_PM, 7, 'high', 'not_started', 'issue', 0), ('به‌روزرسانی برنامهٔ زمان‌بندی با سناریوی تأخیر واحد C', EMP_REP[1], 12, 'medium', 'in_progress', 'management_report', 60),
          ('تمدید ضمانت‌نامهٔ انجام تعهدات تا فروردین ۱۴۰۶', EMP_REP[2], 25, 'high', 'not_started', 'management_report', 0), ('جذب ۱۲ جوشکار واجد شرایط پیش از اسفند', CTR_PM, 80, 'medium', 'not_started', 'risk', 0)]
    out += ins('rasta_actions', [dict(id=U(f'ra/{i}'), master_project_id=P, title=t, owner_id=o, due_date=add(TODAY, dd), priority=pr, status=st, source=src, source_decision_id=U('rd/0') if src == 'decision' else None,
                                      related_risk_id=U('risk/R-001') if src == 'risk' else None, related_issue_id=U('iss/2') if src == 'issue' else None, created_by=EMP_PM, completion_pct=pc) for i, (t, o, dd, pr, st, src, pc) in enumerate(ra)])
    # stakeholders
    sh = [('SH-01', 'استانداری همدان — معاونت عمرانی', 'government', 5, 4, 'supporter', 'supportive', 'leading'), ('SH-02', 'ادارهٔ کل حفاظت محیط زیست استان همدان', 'regulator', 4, 3, 'neutral', 'neutral', 'supportive'),
          ('SH-03', 'شرکت گاز استان همدان (بهره‌بردار شبکه)', 'employer', 4, 5, 'champion', 'supportive', 'leading'), ('SH-04', 'منطقهٔ ۵ عملیات انتقال گاز (بهره‌بردار آینده)', 'internal', 5, 5, 'supporter', 'supportive', 'leading'),
          ('SH-05', 'دهیاری و شورای روستای مجاور سایت', 'community', 2, 4, 'critic', 'resistant', 'supportive'), ('SH-06', 'شرکت توزیع برق استان همدان', 'local_authority', 3, 3, 'neutral', 'neutral', 'supportive'),
          ('SH-07', 'سازندهٔ توربوکمپرسور (نمایندهٔ ثالث)', 'supplier', 4, 3, 'neutral', 'neutral', 'supportive'), ('SH-08', 'ادارهٔ کل منابع طبیعی استان', 'regulator', 3, 2, 'neutral', 'unaware', 'neutral')]
    out += ins('sh_stakeholders', [dict(id=U('sh/' + c), master_project_id=P, code=c, name=n, organization=n, role_title='', category=cat, side='internal' if cat in ('internal', 'employer') else 'external', power=pw, interest=it, attitude=at,
                                        engagement_current=ec, engagement_desired=ed, owner=PEOPLE[EMP_PM], channel='جلسهٔ حضوری و مکاتبه', frequency_days=30, expectations='', strategy='', note='', is_active=True) for c, n, cat, pw, it, at, ec, ed in sh])
    eng = [('SH-01', 'meeting', 'گزارش پیشرفت به کارگروه انرژی استان', 'positive', 75), ('SH-05', 'public_meeting', 'جلسه با اهالی دربارهٔ ترافیک کامیون‌ها و گردوغبار', 'negative', 50), ('SH-05', 'visit', 'بازدید شورا از اقدامات آب‌پاشی مسیر', 'neutral', 20),
           ('SH-02', 'letter', 'ارسال گزارش پایش صوت و پساب کارگاه', 'neutral', 35), ('SH-04', 'workshop', 'کارگاه مرور فلسفهٔ بهره‌برداری و آموزش اپراتورها', 'positive', 15), ('SH-07', 'call', 'پیگیری وضعیت قطعات واحد C', 'negative', 6)]
    out += ins('sh_engagements', [dict(id=U(f'she/{i}'), stakeholder_id=U('sh/' + s), master_project_id=P, happened_on=add(TODAY, -ago), kind=k, subject=sub, summary=sub, attendees='', sentiment=sen, next_action='پیگیری صورتجلسه', next_due=add(TODAY, 30 - ago // 3),
                                       next_owner=PEOPLE[EMP_PM], next_done=False) for i, (s, k, sub, sen, ago) in enumerate(eng)])
    out += ins('sh_concerns', [dict(id=U('shc/0'), stakeholder_id=U('sh/SH-05'), master_project_id=P, raised_on=add(TODAY, -50), title='گردوغبار و تردد کامیون‌های بتن از داخل روستا', description='', category='environment', priority='high', status='in_progress', owner=PEOPLE[CTR_PM], due_date=add(TODAY, 20), resolution=''),
                               dict(id=U('shc/1'), stakeholder_id=U('sh/SH-05'), master_project_id=P, raised_on=add(TODAY, -90), title='درخواست به‌کارگیری نیروی بومی', description='', category='social', priority='medium', status='resolved', owner=PEOPLE[CTR_PM], due_date=add(TODAY, -30), resolution='۷۰٪ نیروی ساده از روستاهای مجاور جذب شد', resolved_on=add(TODAY, -35))])
    return out, dict(risks=len(risks), issues=len(iss), changes=len(chg), stakeholders=len(sh))
