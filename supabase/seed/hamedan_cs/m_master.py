"""Master data: demo suppliers, the project (type compressor_station), its parties and team, and the risk / issue
module projects mapped to it (the Stage-Gate row is created by sg_auto_lifecycle_project)."""
from common import *

RM_P, IM_P = U('rm-project'), U('im-project')

def sql():
    out = ["-- master data"]
    out += ins('organizations', [dict(id=i, name=n, short_name='', org_type='other', description='سازمان نمونه برای پروژهٔ آزمایشی ایستگاه همدان') for i, n in SUP.values()])
    out += ins('master_projects', [dict(id=P, project_id_code='HMD-CS-DEMO', project_code=CODE, official_name=NAME, short_name=SHORT,
        description='پروژهٔ آزمایشی برای نمایش کارکرد همهٔ ماژول‌ها؛ همهٔ داده‌ها تصادفی و ساختگی است. ایستگاه تقویت فشار گاز با سه واحد توربوکمپرسور ۲۵ مگاواتی (۲ کار + ۱ آماده‌به‌کار) روی خط سراسری، ۲۵ کیلومتری جنوب‌شرق همدان.',
        project_type='compressor_station', project_category='ایستگاه تقویت فشار', portfolio_id=PORTFOLIO, program_id=PROGRAM, status='executing', contract_number='HMD-EPC-01',
        contract_type='EPC', contract_value=CONTRACT_VALUE, currency='ریال', contract_start_date=START, contractual_completion_date=FINISH, employer_org_id=ORG_EMP,
        consultant_org_id=ORG_SUP, contractor_org_id=ORG_CTR, project_manager_id=EMP_PM, project_director_id=ME, planned_start_date=START, planned_finish_date=FINISH,
        actual_start_date=START, forecast_finish_date=D(2028, 11, 15), baseline_version='Baseline 1', schedule_status='delayed', location='استان همدان، ۲۵ کیلومتری جنوب‌شرق شهر همدان (موقعیت فرضی)',
        scope_summary='طراحی تفصیلی، تأمین، ساخت، نصب و راه‌اندازی ایستگاه تقویت فشار با ۳ واحد توربوکمپرسور ۲۵ مگاوات، ۶ کولر هوایی، سرخط ورودی/خروجی ۳۶ اینچ، پست برق ۲۰ کیلوولت و ساختمان‌های کنترل و پشتیبانی',
        objectives='افزایش ظرفیت انتقال خط سراسری به میزان ۳۵ میلیون مترمکعب در روز تا زمستان ۱۴۰۶')])
    parties = [(ORG_EMP, 'employer'), (ORG_CTR, 'contractor'), (ORG_SUP, 'supervision_consultant'), (ORG_DES, 'design_consultant')] + [(i, 'other') for i, _ in SUP.values()]
    out += ins('master_project_parties', [dict(id=U(f'party/{o}/{r}'), project_id=P, organization_id=o, role=r, notes='تأمین‌کننده' if r == 'other' else '') for o, r in parties])
    team = [('exec', ME, PEOPLE[ME], 'executive', 'مدیر طرح', ORG_EMP, None), ('pm', EMP_PM, PEOPLE[EMP_PM], 'project_manager', 'مدیر پروژهٔ کارفرما', ORG_EMP, 'exec'),
            ('cpm', CONS_PM, PEOPLE[CONS_PM], 'project_manager', 'مدیر پروژهٔ مشاور', ORG_SUP, 'exec'), ('kpm', CTR_PM, PEOPLE[CTR_PM], 'project_manager', 'مدیر پروژهٔ پیمانکار', ORG_CTR, 'exec'),
            ('rep0', EMP_REP[0], PEOPLE[EMP_REP[0]], 'employer_rep', 'نمایندهٔ کارفرما در کارگاه', ORG_EMP, 'pm'), ('rep1', EMP_REP[1], PEOPLE[EMP_REP[1]], 'employer_rep', 'کارشناس برنامه‌ریزی و کنترل پروژه', ORG_EMP, 'pm'),
            ('rep2', EMP_REP[2], PEOPLE[EMP_REP[2]], 'employer_rep', 'کارشناس مالی و صورت‌وضعیت', ORG_EMP, 'pm'), ('crep', CTR_REP, PEOPLE[CTR_REP], 'contractor_rep', 'رئیس کارگاه پیمانکار', ORG_CTR, 'kpm'),
            ('sup', None, 'مهندس علی لک', 'supervision_head', 'سرپرست دستگاه نظارت مقیم', ORG_SUP, 'cpm'), ('qc', None, 'مهندس مریم نوری', 'site_supervisor', 'ناظر کنترل کیفیت و جوش', ORG_SUP, 'sup'),
            ('civ', None, 'مهندس امیر تهرانی', 'site_supervisor', 'ناظر سیویل', ORG_SUP, 'sup'), ('mec', None, 'مهندس سارا احمدی', 'site_supervisor', 'ناظر مکانیکال و پایپینگ', ORG_SUP, 'sup'),
            ('ele', None, 'مهندس نیما صادقی', 'site_supervisor', 'ناظر برق و ابزاردقیق', ORG_SUP, 'sup'), ('hse', None, 'مهندس پریسا کرمی', 'site_supervisor', 'ناظر HSE', ORG_SUP, 'sup')]
    out += ins('master_project_team', [dict(id=U('team/' + k), project_id=P, user_id=u, person_name=n, position_key=pk, position_title=t, organization_id=o, parent_id=U('team/' + par) if par else None,
                                             sort=i * 10, card_no=str(3100 + i)) for i, (k, u, n, pk, t, o, par) in enumerate(team)])
    out += ins('rm_projects', [dict(id=RM_P, name=NAME, client='کارفرمای نمونهٔ طرح‌های گاز', project_manager_id=EMP_PM, start_date=START, finish_date=FINISH, status='active', master_ref_id=P, short_code=CODE, created_by=ME)])
    out += ins('im_projects', [dict(id=IM_P, name=NAME, description='مسائل پروژهٔ آزمایشی ایستگاه همدان', scope_level='project', master_ref_id=P, short_code=CODE, created_by=ME)])
    out += ins('rasta_project_mappings', [dict(id=U('map/risk'), master_project_id=P, source_module='risk', source_project_id=RM_P, alias_name=SHORT, status='confirmed', match_confidence=100, created_by=ME, decided_by=ME, decided_at=ts(START)),
                                          dict(id=U('map/issues'), master_project_id=P, source_module='issues', source_project_id=IM_P, alias_name=SHORT, status='confirmed', match_confidence=100, created_by=ME, decided_by=ME, decided_at=ts(START))])
    return out, dict(team=len(team), parties=len(parties))
