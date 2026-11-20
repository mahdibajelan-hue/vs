"""Procurement (material control): MTO, nine supply packages, item stages, MR / PO / manufacturing / shipping / receipts.
Target: planned − actual = 20.0 points, value-weighted exactly as materialCore / itemProgress compute it.
The long-lead turbo-compressor order (PO-HMD-001) carries the supply risk: unit A finished, unit B late, unit C stuck
(hot-section parts held by a third-country forwarder), FAT postponed, shipping at risk."""
from common import *

STAGES = ['pr_submit', 'pr_approve', 'rfq', 'po_issue', 'manufacturing', 'inspection', 'release', 'shipping', 'site_receipt', 'entry_inspection']
PATTERN = {  # weights per pattern code (as in mtl_pattern_weights)
    'STD': [5, 5, 10, 10, 30, 10, 5, 10, 5, 10], 'EQUIP': [3, 5, 7, 10, 35, 15, 5, 10, 5, 5], 'CONS': [10, 10, 15, 20, 0, 0, 5, 25, 10, 5]}
GROUP_PATTERN = {'pipe': 'STD', 'fitting': 'STD', 'flange': 'STD', 'gasket': 'STD', 'bolt_nut': 'STD', 'support': 'STD', 'other': 'STD',
                 'valve': 'EQUIP', 'instrument': 'EQUIP', 'equipment': 'EQUIP', 'electrode': 'CONS', 'coating': 'CONS', 'rt_film': 'CONS', 'gas': 'CONS', 'install_cons': 'CONS'}
FAC = 'ایستگاه تقویت فشار همدان'
# package: code, title, supplier key, pattern, plan dates of the 10 stages, done (index of the last approved stage), long lead
PKG = [
    ('PK-01', 'پکیج توربوکمپرسور گازسوز (۳ واحد، ۲+۱)', 'turbo', 'EQUIP'),
    ('PK-02', 'کولرهای هوایی گاز (Gas Air Coolers)', 'cooler', 'EQUIP'),
    ('PK-03', 'شیرآلات خط اصلی، ESD و بلودان', 'valve', 'EQUIP'),
    ('PK-04', 'لوله، اتصالات، فلنج، گسکت و پیچ‌ومهره', 'pipe', 'STD'),
    ('PK-05', 'تجهیزات ثابت (فیلترسپراتور، لانچر/ریسیور، مخازن، اسکیدها)', 'static', 'EQUIP'),
    ('PK-06', 'تجهیزات برق (ترانس، تابلو، دیزل ژنراتور، UPS، کابل)', 'elec', 'EQUIP'),
    ('PK-07', 'ابزاردقیق و سیستم کنترل (DCS/ESD/F&G، میترینگ)', 'elec', 'EQUIP'),
    ('PK-08', 'سازهٔ فلزی، ساپورت و جرثقیل سقفی', 'pipe', 'STD'),
    ('PK-09', 'اقلام مصرفی جوشکاری، پوشش و NDT', 'pipe', 'CONS'),
]
# materials: package, group code, code, description, unit, qty, unit price (rial, or euro when fx), fx?, area, tag, need date, criticality, lead days
M = [
    ('PK-01', 'equipment', 'TC-PKG-A', 'پکیج توربوکمپرسور واحد A — توربین گازی ۲۵ مگاوات + کمپرسور سانتریفیوژ (کار)', 'EA', 1, 24_500_000, True, 'واحد کمپرسور A', 'K-101A', '2026-12-20', 'A', 600),
    ('PK-01', 'equipment', 'TC-PKG-B', 'پکیج توربوکمپرسور واحد B — توربین گازی ۲۵ مگاوات + کمپرسور سانتریفیوژ (کار)', 'EA', 1, 24_500_000, True, 'واحد کمپرسور B', 'K-101B', '2027-03-20', 'A', 600),
    ('PK-01', 'equipment', 'TC-PKG-C', 'پکیج توربوکمپرسور واحد C — توربین گازی ۲۵ مگاوات + کمپرسور سانتریفیوژ (آماده‌به‌کار)', 'EA', 1, 24_500_000, True, 'واحد کمپرسور C', 'K-101C', '2027-04-20', 'A', 600),
    ('PK-01', 'equipment', 'TC-SPR-2Y', 'قطعات یدکی دوساله راه‌اندازی و بهره‌برداری توربوکمپرسورها', 'SET', 1, 1_850_000, True, 'انبار', '', '2027-06-01', 'B', 540),
    ('PK-02', 'equipment', 'AC-BAY', 'کولر هوایی گاز — یک Bay (۲ فن، API 661)', 'EA', 6, 92_000_000_000, False, 'کولرها', 'E-201', '2027-03-15', 'A', 330),
    ('PK-03', 'valve', 'BV-36-600', 'شیر توپی ۳۶ اینچ کلاس ۶۰۰ Full Bore جوشی', 'EA', 12, 14_200_000_000, False, 'سرخط ورودی', '', '2026-11-01', 'A', 270),
    ('PK-03', 'valve', 'BV-30-600', 'شیر توپی ۳۰ اینچ کلاس ۶۰۰', 'EA', 10, 10_400_000_000, False, 'واحد کمپرسور', '', '2026-11-01', 'A', 270),
    ('PK-03', 'valve', 'BV-24-600', 'شیر توپی ۲۴ اینچ کلاس ۶۰۰', 'EA', 8, 7_300_000_000, False, 'کولرها', '', '2026-11-01', 'A', 240),
    ('PK-03', 'valve', 'ESDV-36', 'شیر ESD عملگر گاز-هیدرولیک ۳۶ اینچ', 'EA', 6, 23_500_000_000, False, 'سرخط ورودی', 'SDV-100', '2027-03-10', 'A', 360),
    ('PK-03', 'valve', 'BDV-08', 'شیر بلودان ۸ اینچ با عملگر', 'EA', 5, 3_900_000_000, False, 'واحد کمپرسور', 'BDV-300', '2027-03-10', 'A', 300),
    ('PK-03', 'valve', 'ASV-16', 'شیر کنترل ضدسرج (Anti-Surge) ۱۶ اینچ', 'EA', 3, 21_000_000_000, False, 'واحد کمپرسور', 'FV-410', '2027-04-01', 'A', 360),
    ('PK-03', 'valve', 'CV-30', 'شیر یک‌طرفه ۳۰ اینچ کلاس ۶۰۰', 'EA', 4, 6_200_000_000, False, 'واحد کمپرسور', '', '2026-11-01', 'B', 210),
    ('PK-03', 'valve', 'PSV-SET', 'شیر اطمینان (PSV) سایزهای مختلف', 'EA', 24, 680_000_000, False, 'کل ایستگاه', 'PSV', '2027-03-15', 'B', 180),
    ('PK-04', 'pipe', 'PIPE-36-X65', 'لوله ۳۶ اینچ API 5L X65 PSL2 ضخامت ۱۹٫۱ میلی‌متر', 'M', 420, 118_000_000, False, 'سرخط ورودی', '', '2026-07-01', 'A', 150),
    ('PK-04', 'pipe', 'PIPE-30-X65', 'لوله ۳۰ اینچ API 5L X65 PSL2 ضخامت ۱۵٫۹ میلی‌متر', 'M', 600, 92_000_000, False, 'واحد کمپرسور', '', '2026-07-01', 'A', 150),
    ('PK-04', 'pipe', 'PIPE-24-X52', 'لوله ۲۴ اینچ API 5L X52 ضخامت ۱۲٫۷ میلی‌متر', 'M', 520, 61_000_000, False, 'کولرها', '', '2026-07-01', 'A', 150),
    ('PK-04', 'pipe', 'PIPE-16-B', 'لوله ۱۶ اینچ API 5L Gr.B ضخامت ۹٫۵ میلی‌متر', 'M', 780, 33_000_000, False, 'کل ایستگاه', '', '2026-07-01', 'B', 120),
    ('PK-04', 'pipe', 'PIPE-08-B', 'لوله ۸ اینچ ASTM A106 Gr.B SCH40', 'M', 900, 13_500_000, False, 'کل ایستگاه', '', '2026-07-01', 'B', 90),
    ('PK-04', 'pipe', 'PIPE-SMALL', 'لوله ۲ تا ۴ اینچ ASTM A106 Gr.B (یوتیلیتی)', 'M', 2400, 4_200_000, False, 'تأسیسات جانبی', '', '2026-07-01', 'C', 75),
    ('PK-04', 'fitting', 'ELB-36-90', 'زانویی ۳۶ اینچ ۹۰ درجه 3D WPHY65', 'EA', 34, 520_000_000, False, 'سرخط ورودی', '', '2026-07-15', 'A', 150),
    ('PK-04', 'fitting', 'TEE-36-30', 'سه‌راهی کاهنده ۳۶×۳۰ اینچ WPHY65', 'EA', 9, 860_000_000, False, 'واحد کمپرسور', '', '2026-07-15', 'A', 150),
    ('PK-04', 'fitting', 'FIT-MISC', 'اتصالات جوشی و رزوه‌ای سایزهای کوچک', 'EA', 3200, 3_100_000, False, 'کل ایستگاه', '', '2026-08-01', 'C', 75),
    ('PK-04', 'flange', 'FLG-WN-600', 'فلنج گلودار کلاس ۶۰۰ سایزهای ۸ تا ۳۶ اینچ', 'EA', 380, 96_000_000, False, 'کل ایستگاه', '', '2026-08-01', 'B', 90),
    ('PK-04', 'gasket', 'GSK-SW', 'گسکت اسپیرال‌وند کلاس ۶۰۰', 'EA', 1100, 2_400_000, False, 'کل ایستگاه', '', '2026-10-01', 'C', 45),
    ('PK-04', 'bolt_nut', 'STUD-B7', 'استادبولت و مهره ASTM A193 B7 / A194 2H', 'SET', 1300, 3_600_000, False, 'کل ایستگاه', '', '2026-10-01', 'C', 45),
    ('PK-05', 'equipment', 'FS-301', 'فیلتر سپراتور ورودی ایستگاه', 'EA', 4, 46_000_000_000, False, 'سرخط ورودی', 'F-301', '2027-03-01', 'A', 300),
    ('PK-05', 'equipment', 'PL-48', 'لانچر / ریسیور توپک ۴۸ اینچ', 'EA', 2, 31_000_000_000, False, 'سرخط ورودی', 'L-401', '2027-03-01', 'B', 270),
    ('PK-05', 'equipment', 'V-CD', 'مخزن درین بسته (Closed Drain Vessel)', 'EA', 1, 12_500_000_000, False, 'تأسیسات جانبی', 'V-501', '2027-03-15', 'B', 240),
    ('PK-05', 'equipment', 'FGS-01', 'اسکید آماده‌سازی گاز سوخت (Fuel Gas Conditioning)', 'EA', 1, 54_000_000_000, False, 'تأسیسات جانبی', 'X-601', '2027-04-01', 'A', 330),
    ('PK-05', 'equipment', 'IA-PKG', 'پکیج هوای ابزار (کمپرسور + درایر)', 'EA', 1, 17_000_000_000, False, 'تأسیسات جانبی', 'X-701', '2027-04-01', 'B', 240),
    ('PK-06', 'equipment', 'TR-2500', 'ترانسفورماتور ۲۰/۰٫۴ کیلوولت ۲۵۰۰ کیلوولت‌آمپر', 'EA', 2, 21_000_000_000, False, 'پست برق', 'TR-01', '2027-03-20', 'A', 240),
    ('PK-06', 'equipment', 'SWG-MV', 'تابلوهای فشار متوسط ۲۰ کیلوولت (۱۲ سلول)', 'SET', 1, 48_000_000_000, False, 'پست برق', 'SWG-01', '2027-03-20', 'A', 270),
    ('PK-06', 'equipment', 'MCC-LV', 'تابلوهای MCC فشار ضعیف', 'EA', 4, 9_800_000_000, False, 'پست برق', 'MCC', '2027-03-20', 'B', 210),
    ('PK-06', 'equipment', 'EDG-1000', 'دیزل ژنراتور اضطراری ۱۰۰۰ کیلوولت‌آمپر', 'EA', 1, 36_000_000_000, False, 'پست برق', 'G-01', '2027-04-10', 'A', 270),
    ('PK-06', 'equipment', 'UPS-AC', 'سیستم UPS و شارژر باتری', 'EA', 2, 8_600_000_000, False, 'ساختمان کنترل', 'UPS', '2027-04-10', 'B', 210),
    ('PK-06', 'other', 'CBL-MV', 'کابل ۲۰ کیلوولت XLPE', 'M', 4200, 6_900_000, False, 'کل ایستگاه', '', '2027-03-01', 'B', 120),
    ('PK-06', 'other', 'CBL-LV', 'کابل‌های قدرت و کنترل فشار ضعیف', 'M', 38000, 950_000, False, 'کل ایستگاه', '', '2027-03-01', 'C', 90),
    ('PK-07', 'instrument', 'DCS-SYS', 'سیستم کنترل توزیع‌شده، ESD و F&G (سخت‌افزار + نرم‌افزار)', 'SET', 1, 2_400_000, True, 'ساختمان کنترل', 'DCS', '2027-04-15', 'A', 360),
    ('PK-07', 'instrument', 'MTR-USM', 'اسکید میترینگ اولتراسونیک خروجی ایستگاه', 'EA', 1, 68_000_000_000, False, 'خروجی ایستگاه', 'FQ-900', '2027-04-15', 'A', 330),
    ('PK-07', 'instrument', 'TX-SET', 'ترانسمیترهای فشار، دما و سطح', 'EA', 210, 310_000_000, False, 'کل ایستگاه', 'PT/TT/LT', '2027-03-20', 'B', 180),
    ('PK-07', 'instrument', 'GD-SET', 'دتکتورهای گاز و شعله', 'EA', 64, 420_000_000, False, 'کل ایستگاه', 'GD', '2027-03-20', 'B', 180),
    ('PK-07', 'other', 'CBL-INS', 'کابل ابزاردقیق شیلددار', 'M', 22000, 780_000, False, 'کل ایستگاه', '', '2027-03-01', 'C', 90),
    ('PK-08', 'support', 'STL-STR', 'سازهٔ فلزی پایپ‌رک و سولهٔ کمپرسورخانه (ST37 / ST52)', 'KG', 650_000, 1_150_000, False, 'واحد کمپرسور', '', '2026-08-15', 'A', 120),
    ('PK-08', 'support', 'STL-SUP', 'ساپورت‌های لوله (استاندارد و خاص)', 'KG', 85_000, 1_420_000, False, 'کل ایستگاه', '', '2026-09-01', 'B', 90),
    ('PK-08', 'equipment', 'CRN-40T', 'جرثقیل سقفی ۴۰ تن کمپرسورخانه', 'EA', 1, 26_000_000_000, False, 'واحد کمپرسور', 'CR-01', '2027-03-20', 'B', 240),
    ('PK-09', 'electrode', 'ELC-E7018', 'الکترود E7018 و E8010 (پاس ریشه و پرکن)', 'KG', 9000, 9_800_000, False, 'انبار', '', '2026-06-01', 'B', 30),
    ('PK-09', 'coating', 'CT-FJ', 'مواد پوشش سرجوش و رنگ صنعتی', 'KG', 6000, 14_500_000, False, 'انبار', '', '2026-06-01', 'B', 30),
    ('PK-09', 'rt_film', 'RT-FILM', 'فیلم رادیوگرافی و ملزومات NDT', 'BOX', 800, 21_000_000, False, 'انبار', '', '2026-06-01', 'B', 45),
]
# planned dates of the 10 stages per package (avoiding the winter window) and the actual approvals
PLAN = {
    'PK-01': ['2025-05-10', '2025-06-01', '2025-07-20', '2025-08-25', '2026-10-25', '2026-11-12', '2026-11-18', '2027-03-15', '2027-04-10', '2027-04-25'],
    'PK-02': ['2025-07-01', '2025-07-20', '2025-09-01', '2025-10-01', '2026-08-01', '2026-09-01', '2026-09-15', '2026-10-15', '2026-11-05', '2026-11-15'],
    'PK-03': ['2025-06-15', '2025-07-05', '2025-08-15', '2025-09-15', '2026-06-01', '2026-07-01', '2026-07-15', '2026-08-15', '2026-09-01', '2026-09-20'],
    'PK-04': ['2025-05-01', '2025-05-20', '2025-06-25', '2025-07-25', '2025-12-01', '2026-01-10', '2026-01-25', '2026-03-01', '2026-03-20', '2026-04-10'],
    'PK-05': ['2025-07-15', '2025-08-05', '2025-09-20', '2025-10-25', '2026-08-15', '2026-09-15', '2026-10-01', '2026-11-01', '2026-11-15', '2027-03-05'],
    'PK-06': ['2025-08-01', '2025-08-20', '2025-10-01', '2025-11-05', '2026-09-01', '2026-10-01', '2026-10-15', '2027-03-05', '2027-03-20', '2027-04-01'],
    'PK-07': ['2025-08-15', '2025-09-05', '2025-10-20', '2025-11-25', '2026-10-01', '2026-11-01', '2026-11-15', '2027-03-10', '2027-03-25', '2027-04-10'],
    'PK-08': ['2025-06-01', '2025-06-20', '2025-07-25', '2025-08-25', '2026-02-15', '2026-03-15', '2026-04-01', '2026-05-01', '2026-05-20', '2026-06-10'],
    'PK-09': ['2025-09-01', '2025-09-15', '2025-10-05', '2025-10-25', None, None, '2025-11-10', '2025-12-01', '2025-12-15', '2026-01-05'],
}
# actual: per material code → fraction approved per stage (1 = the whole quantity); omitted stages are not approved
def actual_profile(code, pkg):
    full = lambda k: {s: 1.0 for s in STAGES[:k]}
    if code == 'TC-PKG-A': return full(8)                                   # FAT passed, released, shipped — at the port (customs)
    if code == 'TC-PKG-B': return full(6)                                   # built; FAT passed on the retest; release waits for the second LC instalment
    if code in ('TC-PKG-C', 'TC-SPR-2Y'): return full(4)                     # ordered; manufacturing stuck (hot section)
    if pkg == 'PK-02': return full(5) | {'inspection': 0.5}                  # 3 of 6 bays inspected
    if pkg == 'PK-03':
        if code in ('ESDV-36', 'ASV-16', 'BDV-08', 'PSV-SET'): return full(5) if code != 'ASV-16' else full(4)
        return full(10)
    if pkg == 'PK-04':
        if code in ('PIPE-SMALL', 'FIT-MISC', 'GSK-SW', 'STUD-B7'): return full(8) | {'site_receipt': 0.6, 'entry_inspection': 0.6}
        return full(10)
    if pkg == 'PK-05': return full(4) | {'manufacturing': 0.5} if code in ('FS-301', 'PL-48') else full(4)
    if pkg == 'PK-06': return full(4) | {'manufacturing': 0.5} if code == 'TR-2500' else full(4)
    if pkg == 'PK-07': return full(4) if code != 'DCS-SYS' else full(3)      # DCS PO still under negotiation
    if pkg == 'PK-08': return (full(8) | {'site_receipt': .4, 'entry_inspection': .4}) if code == 'STL-STR' else full(10) if code != 'CRN-40T' else full(4)
    if pkg == 'PK-09': return full(10)
    return {}

def item_progress(m, plan, act, pat):
    w = PATTERN[pat]; app = [i for i, s in enumerate(STAGES) if w[i] > 0 or pat != 'CONS']
    tot = sum(w[i] for i in app)
    planned = sum(w[i] for i in app if plan[i] and plan[i] <= TODAY.isoformat()) / tot
    actual = sum(w[i] * act.get(STAGES[i], 0) for i in app) / tot
    return planned, actual

def build():
    items = []
    for (pkg, grp, code, desc, unit, qty, price, fx, area, tag, need, crit, lead) in M:
        pat = GROUP_PATTERN[grp] if pkg != 'PK-09' else 'CONS'
        pk_pat = dict((p[0], p[3]) for p in PKG)[pkg]
        pat = pk_pat  # package pattern wins (as mtl_init_item_stages_trg: package → group → default)
        rate = EUR if fx else 1
        if not fx: price = price * 10   # domestic rial prices of the table are in tens of rials
        value = qty * price * rate
        plan = [x and safe(d(x)).isoformat() for x in PLAN[pkg]]
        items.append(dict(pkg=pkg, grp=grp, code=code, desc=desc, unit=unit, qty=qty, price=price, fx=fx, rate=rate, area=area, tag=tag, need=need, crit=crit, lead=lead,
                          pat=pat, value=value, plan=plan, act=actual_profile(code, pkg)))
    return items

def rollup(items):
    V = sum(i['value'] for i in items)
    pl = sum(i['value'] * item_progress(i, i['plan'], i['act'], i['pat'])[0] for i in items) / V * 100
    ac = sum(i['value'] * item_progress(i, i['plan'], i['act'], i['pat'])[1] for i in items) / V * 100
    return pl, ac, V

def calibrate(items, gap=20.0):
    """coarse: whole-unit approvals (in a realistic order) until the gap is within one point of the target;
    fine: the share of structural steel received and accepted at site (kilograms, so any fraction is real)"""
    by = {i['code']: i for i in items}
    coarse = [('FS-301', 'manufacturing', 1.0), ('PL-48', 'manufacturing', 1.0), ('AC-BAY', 'inspection', 5 / 6), ('TR-2500', 'manufacturing', 1.0), ('SWG-MV', 'manufacturing', 1.0),
              ('ESDV-36', 'inspection', 1.0), ('BDV-08', 'inspection', 1.0), ('PSV-SET', 'inspection', 1.0), ('AC-BAY', 'release', 3 / 6), ('TX-SET', 'manufacturing', 1.0), ('GD-SET', 'manufacturing', 1.0),
              ('MTR-USM', 'manufacturing', 1.0), ('EDG-1000', 'manufacturing', 1.0), ('FGS-01', 'manufacturing', 1.0), ('AC-BAY', 'shipping', 3 / 6), ('ESDV-36', 'release', 1.0), ('ESDV-36', 'shipping', 1.0)]
    for code, st, f in coarse:
        pl, ac, _ = rollup(items)
        if (pl - ac) - gap < 0.45: break
        by[code]['act'][st] = max(by[code]['act'].get(st, 0), f)
    st = by['STL-STR']; lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2; st['act']['site_receipt'] = st['act']['entry_inspection'] = mid
        pl, ac, _ = rollup(items)
        if pl - ac > gap: lo = mid
        else: hi = mid

def sql():
    items = build()
    calibrate(items)
    # approved quantities are whole units where the unit is counted
    for i in items:
        for s, f in list(i['act'].items()):
            qv = i['qty'] * f
            if i['unit'] in ('EA', 'SET', 'BOX'): qv = round(qv)
            i['act'][s] = qv / i['qty'] if i['qty'] else 0
    stat_pl, stat_ac, V = rollup(items)
    out = ["-- procurement: lookups, MTO, materials, packages, items (stages are created by mtl_init_item_stages_trg and then updated), MR, PO, manufacturing, shipping, receipts"]
    lk = [('facility', FAC), ('area', 'واحد کمپرسور A'), ('area', 'واحد کمپرسور B'), ('area', 'واحد کمپرسور C'), ('area', 'کولرها'), ('area', 'سرخط ورودی'), ('area', 'خروجی ایستگاه'), ('area', 'تأسیسات جانبی'), ('area', 'پست برق'), ('area', 'ساختمان کنترل'),
          ('front', 'جبههٔ سیویل'), ('front', 'جبههٔ مکانیکال و پایپینگ'), ('front', 'جبههٔ برق و ابزاردقیق'), ('warehouse', 'انبار روباز کارگاه'), ('warehouse', 'انبار سرپوشیده'), ('usage', 'پیش‌ساخت اسپول'), ('usage', 'نصب تجهیزات')]
    out += ins('mtl_lookups', [dict(id=U(f'lk/{k}/{l}'), master_project_id=P, kind=k, label=l, sort=i * 10) for i, (k, l) in enumerate(lk)])
    mto = U('mto/rev2')
    out += ins('mtl_mto_revisions', [dict(id=mto, master_project_id=P, revision_number='Rev.2', revision_date=D(2026, 6, 10), status='issued', notes='MTO نهایی پس از تأیید ایزومتریک‌های بستهٔ اول')])
    mats, pkgs, its = [], [], []
    for n, i in enumerate(items):
        i['id'] = U('mat/' + i['code'])
        mats.append(dict(id=i['id'], master_project_id=P, mto_revision_id=mto, line_no=str(n + 1), material_code=f"HMD-{i['code']}", description=i['desc'],
                         commodity_type=i['grp'] if i['grp'] in ('pipe', 'fitting', 'valve', 'flange', 'gasket', 'bolt_nut', 'instrument', 'equipment', 'support') else 'other',
                         spec='', size='', rating='', unit=i['unit'], facility=FAC, area=i['area'], system_name='ایستگاه', tag_number=i['tag'], mto_quantity=i['qty'], contract_qty=i['qty'],
                         unit_price=i['price'], currency='EUR' if i['fx'] else 'IRR', fx_rate=i['rate'], is_construction_blocking=i['crit'] == 'A',
                         group_id=Raw(f"(select id from mtl_groups where code={q(i['grp'])})"), need_date=d(i['need']), criticality=i['crit'], lead_time_days=i['lead'],
                         price_basis='قیمت قرارداد' if not i['fx'] else 'پیشنهاد فروشنده (یورو)', price_date=D(2025, 8, 1), front='جبههٔ مکانیکال و پایپینگ', usage_location=f"{FAC} / {i['area']}",
                         is_demo=True, created_by=ME))
    for (code, title, sup, pat) in PKG:
        pl = PLAN[code]
        pkgs.append(dict(id=U('pkg/' + code), master_project_id=P, code=code, title=title, contractor_org_id=ORG_CTR, supplier_org_id=SUP[sup][0],
                         pattern_id=Raw(f"(select id from mtl_patterns where code={q(pat)})"), status='active', planned_start=d(pl[0]), planned_end=safe(d(pl[-1])),
                         notes='سفارش بلندمدت (Long Lead) — ریسک بالای تأمین؛ پیگیری هفتگی' if code == 'PK-01' else ''))
    for i in items:
        i['item'] = U('item/' + i['code'])
        its.append(dict(id=i['item'], package_id=U('pkg/' + i['pkg']), material_id=i['id'], qty=i['qty'], unit_price=i['price'], currency='EUR' if i['fx'] else 'IRR',  # the app multiplies by the material's fx_rate
                        supplier_org_id=SUP[dict((p[0], p[2]) for p in PKG)[i['pkg']]][0], planned_delivery=d(i['plan'][8] or i['plan'][7]), baseline_version=1))
    out += ins('mtl_materials', mats) + ins('mtl_packages', pkgs) + ins('mtl_package_items', its)
    # stages: plan dates for all, approvals with dates and quantities
    for i in items:
        for k, s in enumerate(STAGES):
            pdate = i['plan'][k]
            f = i['act'].get(s, 0)
            sets = [f"planned_date={q(pdate)}"]
            if f > 0:
                adate = min(add(d(pdate) if pdate else D(2025, 10, 1), rnd.randint(-5, 35) if s != 'manufacturing' or not i['code'].startswith('TC') else 160), add(TODAY, -2))
                aq = round(i['qty'] * f, 3)
                sets += ["status='approved'", f"done_qty={aq}", f"approved_qty={aq}", f"actual_date={q(adate)}", f"approved_at={q(ts(min(add(adate, 3), add(TODAY, -1))))}", f"approved_by={q(CONS_PM)}",
                         f"submitted_by={q(CTR_REP)}", f"submitted_at={q(ts(adate))}", f"reviewed_by={q(CONS_PM)}", f"reviewed_at={q(ts(min(add(adate, 2), add(TODAY, -1))))}", "evidence_note='مدرک مرحله پیوست شد (آزمایشی)'"]
            elif i['code'] == 'TC-PKG-B' and s == 'release':
                sets += ["status='rejected'", f"submitted_by={q(CTR_REP)}", f"submitted_at={q(ts(D(2026, 11, 8)))}", f"reviewed_by={q(CONS_PM)}", f"reviewed_at={q(ts(D(2026, 11, 12)))}",
                         "reject_reason='مجوز حمل واحد B صادر نشد: مرحلهٔ دوم اعتبار اسنادی هنوز گشایش نشده و گواهی بازرس TPI برای آزمون مجدد FAT پیوست نیست'"]
            elif i['code'] == 'TC-PKG-C' and s == 'manufacturing':
                sets += ["status='submitted'", f"done_qty=0", f"submitted_by={q(CTR_REP)}", f"submitted_at={q(ts(D(2026, 10, 28)))}", "evidence_note='گزارش پیشرفت سازنده: ۵۵٪ — قطعات Hot Section در گمرک کشور ثالث متوقف است'"]
            if len(sets) > 1 or pdate:
                out.append(f"update mtl_item_stages set {', '.join(sets)} where item_id={q(i['item'])} and stage_key={q(s)};")
            if not pdate and i['pat'] == 'CONS' and s in ('manufacturing', 'inspection'):
                out.append(f"update mtl_item_stages set applicable=false, na_reason='اقلام مصرفی — ساخت و بازرسی حین ساخت ندارد' where item_id={q(i['item'])} and stage_key={q(s)};")
    # MR, PO, manufacturing, shipment, receipt — backing the approved quantities
    prs, prl, pos, pol, mfg, shp, shl, rcp, rcl = [], [], [], [], [], [], [], [], []
    for (code, title, sup, pat) in PKG:
        mine = [i for i in items if i['pkg'] == code]
        pr = U('mr/' + code)
        prs.append(dict(id=pr, master_project_id=P, mr_number=f"MR-HMD-{code[-2:]}", mr_date=d(PLAN[code][1]), status='awarded' if any(i['act'].get('po_issue') for i in mine) else 'under_evaluation',
                        supplier_org_id=SUP[sup][0], package_id=U('pkg/' + code), notes=title, created_by=CTR_PM))
        for i in mine: prl.append(dict(id=U('mrl/' + i['code']), request_id=pr, material_id=i['id'], quantity_requested=i['qty']))
        ordered = [i for i in mine if i['act'].get('po_issue')]
        if not ordered: continue
        po = U('po/' + code)
        pos.append(dict(id=po, master_project_id=P, request_id=pr, po_number=f"PO-HMD-{code[-2:].zfill(3)}", po_date=d(PLAN[code][3]), supplier_org_id=SUP[sup][0],
                        currency='EUR' if code == 'PK-01' else 'IRR', status='active', package_id=U('pkg/' + code), is_demo=True, created_by=CTR_PM,
                        notes='سفارش بلندمدت؛ تحویل CIF بندرعباس؛ پرداخت با اعتبار اسنادی ارزی' if code == 'PK-01' else ''))
        for i in ordered:
            pl_id = U('pol/' + i['code'])
            pol.append(dict(id=pl_id, po_id=po, material_id=i['id'], quantity_ordered=i['qty'], unit_price=i['price'], planned_delivery_date=d(i['plan'][8] or i['plan'][7])))
            if i['pat'] == 'EQUIP':
                st = 'fat_passed' if i['act'].get('inspection') else 'in_progress' if i['act'].get('manufacturing', 0) < 1 or i['code'] == 'TC-PKG-B' else 'fat_scheduled'
                if i['act'].get('release'): st = 'ready_for_shipment'
                note = {'TC-PKG-A': 'FAT در کارخانهٔ سازنده با حضور بازرس TPI انجام و قبول شد؛ منتظر مجوز حمل و گشایش اعتبار مرحلهٔ دوم',
                        'TC-PKG-B': 'FAT اول به‌علت لرزش یاتاقان مردود شد و آزمون مجدد در آبان قبول شد؛ مجوز حمل منتظر گشایش مرحلهٔ دوم اعتبار اسنادی',
                        'TC-PKG-C': 'قطعات Hot Section (پره‌های توربین) در گمرک کشور ثالث متوقف؛ تأخیر برآوردی ۵ تا ۷ ماه؛ ریسک عدم تحویل به‌موقع',
                        'TC-SPR-2Y': 'تابع تحویل واحدهای اصلی'}.get(i['code'], '')
                mfg.append(dict(id=U('mfg/' + i['code']), po_line_id=pl_id, status=st, is_long_lead=i['lead'] >= 300, planned_ready_date=d(i['plan'][5]),
                                actual_ready_date=D(2026, 10, 30) if i['code'] == 'TC-PKG-A' else None, fat_date=D(2026, 10, 20) if i['code'] == 'TC-PKG-A' else (D(2026, 11, 4) if i['code'] == 'TC-PKG-B' else None), notes=note))
        shipped = [i for i in ordered if i['act'].get('shipping')]
        if shipped:
            sh = U('ship/' + code)
            shp.append(dict(id=sh, master_project_id=P, shipment_number=f"SH-HMD-{code[-2:]}", shipment_date=d(PLAN[code][7]), carrier='حمل‌ونقل جاده‌ای', tracking_ref=f"BL-{code[-2:]}26",
                            origin='کارخانهٔ سازنده', destination='کارگاه ایستگاه همدان', status='delivered', eta=d(PLAN[code][7]), ata=add(d(PLAN[code][7]), 6)))
            for i in shipped: shl.append(dict(id=U('shl/' + i['code']), shipment_id=sh, material_id=i['id'], quantity_shipped=round(i['qty'] * i['act']['shipping'], 3)))
            rec = [i for i in shipped if i['act'].get('site_receipt')]
            if rec:
                r = U('rcp/' + code)
                rcp.append(dict(id=r, master_project_id=P, receipt_number=f"GRN-HMD-{code[-2:]}", receipt_date=add(d(PLAN[code][7]), 8), shipment_id=sh, warehouse_location='انبار روباز کارگاه'))
                for i in rec:
                    rq = round(i['qty'] * i['act']['site_receipt'], 3)
                    rcl.append(dict(id=U('rcl/' + i['code']), receipt_id=r, material_id=i['id'], quantity_received=rq, condition='ok',
                                    inspection_status='accepted' if i['act'].get('entry_inspection', 0) >= i['act']['site_receipt'] - 1e-9 else 'pending',
                                    inspected_by=CONS_PM, inspected_at=ts(add(d(PLAN[code][7]), 12))))
    out += ins('mtl_procurement_requests', prs) + ins('mtl_procurement_lines', prl) + ins('mtl_purchase_orders', pos) + ins('mtl_po_lines', pol)
    out += ins('mtl_manufacturing', mfg) + ins('mtl_shipments', shp) + ins('mtl_shipment_lines', shl) + ins('mtl_warehouse_receipts', rcp) + ins('mtl_warehouse_lines', rcl)
    # issues to the contractor for prefabrication / civil steel (posted)
    tx = []
    for n, (code, share, op) in enumerate([('PIPE-30-X65', .42, 'پیش‌ساخت اسپول'), ('PIPE-24-X52', .35, 'پیش‌ساخت اسپول'), ('PIPE-16-B', .3, 'پیش‌ساخت اسپول'), ('STL-STR', .55, 'نصب سازهٔ فلزی'), ('ELC-E7018', .4, 'جوشکاری'), ('ELB-36-90', .25, 'پیش‌ساخت اسپول')]):
        i = next(x for x in items if x['code'] == code)
        tx.append(dict(id=U('tx/' + code), master_project_id=P, material_id=i['id'], kind='issue', qty=round(i['qty'] * share), adjust_sign=1, txn_date=add(D(2026, 6, 1), n * 20), from_loc='انبار روباز کارگاه',
                       to_loc='پیمانکار نصب', facility=FAC, front='جبههٔ مکانیکال و پایپینگ', work_op=op, contractor_org_id=ORG_CTR, doc_ref=f"MIV-{1000 + n}", status='posted', is_demo=True,
                       created_by=CTR_REP, approved_by=CONS_PM, approved_at=ts(add(D(2026, 6, 2), n * 20))))
    out += ins('mtl_txns', tx)
    return out, dict(items=len(items), planned=round(stat_pl, 2), actual=round(stat_ac, 2), gap=round(stat_pl - stat_ac, 2), value=V, turbo_share=round(sum(i['value'] for i in items if i['pkg']=='PK-01')/V*100,1))
