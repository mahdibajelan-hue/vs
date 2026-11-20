"""Shared pieces of the Hamedan compressor-station demo generator (all data fictitious, marked «آزمایشی»).

Data date: 2026-11-20 (1405/08/29). Every planned date of engineering, procurement and construction avoids the window
2026-11-21 … 2027-02-28 (the site's winter stop in Hamedan), so the planned figures — and with them the requested gaps
(engineering 10, procurement 20, construction 26.6 percentage points) — stay put through the winter."""
import random, uuid
from datetime import date, timedelta

NS = uuid.UUID('6c1b6f0e-3d5a-4b7e-9f20-0000000000aa')
def U(key: str) -> str:
    """deterministic id: the same key always gives the same uuid (re-runs are stable, cleanup is exact)"""
    return str(uuid.uuid5(NS, 'hmd-cs/' + key))

rnd = random.Random(1405)
def q(v) -> str:
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return repr(round(v, 6)) if isinstance(v, float) else str(v)
    if isinstance(v, date): return "'" + v.isoformat() + "'"
    return "'" + str(v).replace("'", "''") + "'"
def arr(xs, typ='text') -> str:
    return "array[" + ",".join(q(x) for x in xs) + f"]::{typ}[]" if xs else f"'{{}}'::{typ}[]"
def js(o) -> str:
    import json
    return q(json.dumps(o, ensure_ascii=False)) + '::jsonb'

def ins(table: str, rows: list[dict]) -> list[str]:
    """multi-row insert, 200 rows per statement; all rows of one call must share their keys"""
    out = []
    for i in range(0, len(rows), 200):
        chunk = rows[i:i + 200]
        cols = list(chunk[0].keys())
        vals = ",\n".join("(" + ",".join(r[c] if isinstance(r[c], Raw) else q(r[c]) for c in cols) + ")" for r in chunk)
        out.append(f"insert into {table} ({', '.join(cols)}) values\n{vals};")
    return out
class Raw(str):
    """a value written as SQL as-is (sub-select, cast, array …)"""

D = date
def d(s: str) -> date: return date.fromisoformat(s)
def add(x: date, n: int) -> date: return x + timedelta(days=n)
TODAY = D(2026, 11, 20)
FREEZE_FROM, FREEZE_TO = D(2026, 11, 21), D(2027, 2, 28)
def safe(x: date) -> date:
    """moves a planned date out of the winter window (forward to 1 March) so the plan does not move until spring"""
    return D(2027, 3, 1) + timedelta(days=(x - FREEZE_FROM).days % 20) if FREEZE_FROM <= x <= FREEZE_TO else x
def ts(x: date, h=9) -> str: return f"{x.isoformat()} {h:02d}:{rnd.randint(0, 59):02d}:00+03:30"

# ---- Jalali (for texts, finance months) ----
def g2j(g: date):
    gy, gm, gd = g.year, g.month, g.day
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + (365 * gy) + ((gy2 + 3) // 4) - ((gy2 + 99) // 100) + ((gy2 + 399) // 400) + gd + g_d_m[gm - 1]
    jy = -1595 + (33 * (days // 12053)); days %= 12053
    jy += 4 * (days // 1461); days %= 1461
    if days > 365: jy += (days - 1) // 365; days = (days - 1) % 365
    jm = 1 + days // 31 if days < 186 else 7 + (days - 186) // 30
    jd = 1 + (days % 31 if days < 186 else (days - 186) % 30)
    return jy, jm, jd
FA = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')
def jtxt(g: date) -> str:
    y, m, dd = g2j(g); return f"{y}/{m:02d}/{dd:02d}".translate(FA)
JMONTH = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']

# ---- the project ----
P = U('project')
CODE = 'HMD-CS'
NAME = 'پروژهٔ آزمایشی: احداث ایستگاه تقویت فشار گاز همدان (۳ واحد توربوکمپرسور)'
SHORT = 'ایستگاه تقویت فشار همدان (آزمایشی)'
START, FINISH = D(2025, 3, 22), D(2028, 3, 19)      # 1404/01/02 → 1406/12/29, 36 months
CONTRACT_VALUE = 190_000_000_000_000                 # rial (190 همت): EPC; the three imported turbo-compressor packages are ~42 % of it
EUR = 1_050_000                                      # rial per euro used for the imported items (fx_rate)
VALUE_E = 7_600_000_000_000                          # engineering share (document prices) ≈ 4 %
PORTFOLIO, PROGRAM = '3ebb59a6-28f4-4306-9271-91a3f9deaec5', '353376b1-4c9c-4e31-b3f8-bab55670e462'

# existing people and organisations of the demo projects (live ids)
ME = '244bc5e5-d9f2-4931-b417-d7eea2ffd444'           # executive (the account owner)
EMP_PM = '7c8c7273-1992-4b51-93fa-6a350b071d2d'       # employer project manager
CONS_PM = '5c028c5e-a0e9-48b2-ab3a-2d8f987ac1bc'      # supervision consultant manager
CTR_PM = 'ca9b46df-0656-4c94-b4b3-a76f22ff43d0'       # contractor project manager
EMP_REP = ['404db5d6-5e3b-4b15-a436-0b12998746b9', '4143d26b-f086-400a-9b39-599c44845c89', 'bfb7f733-1fa1-48ec-b3c7-55aa5f9390e0']
CTR_REP = 'a2256be1-4561-45c6-810e-f35fd77e49ce'
PEOPLE = {ME: 'مهدی باجلان', EMP_PM: 'احسان سید آبادی', CONS_PM: 'صادق خداویسی', CTR_PM: 'محمد جواد بنگش', EMP_REP[0]: 'مهندس رضا محمدی',
          EMP_REP[1]: 'میثم فتاحی', EMP_REP[2]: 'مهران محمودی', CTR_REP: 'هادی بهرامی'}
ORG_EMP = '92e62f01-203b-418f-8ff7-6fd38cf9e236'      # کارفرمای نمونهٔ طرح‌های گاز
ORG_CTR = '34f279f6-85d6-4c26-ae0c-614e82a11d47'      # مشارکت پیمانکاری نمونهٔ گاما (EPC)
ORG_SUP = '501f0b6c-ffdc-4c3d-b7b2-4d71a4f9e41f'      # مهندسین مشاور نمونهٔ دلتا (supervision)
ORG_DES = 'f03463c5-6a72-4a2f-909c-45f3e509ccbb'      # مهندسین مشاور نمونهٔ آلفا (basic design)
# new demo suppliers (created by this seed)
SUP = {
    'turbo': (U('org/turbo'), 'سازندهٔ نمونهٔ توربوکمپرسور (اروپایی، از طریق نمایندهٔ ثالث)'),
    'cooler': (U('org/cooler'), 'سازندهٔ نمونهٔ کولرهای هوایی گاز'),
    'valve': (U('org/valve'), 'سازندهٔ نمونهٔ شیرآلات صنعتی'),
    'pipe': (U('org/pipe'), 'تأمین‌کنندهٔ نمونهٔ لوله، اتصالات و فلنج'),
    'elec': (U('org/elec'), 'تأمین‌کنندهٔ نمونهٔ تجهیزات برق و ابزار دقیق'),
    'static': (U('org/static'), 'سازندهٔ نمونهٔ مخازن و تجهیزات ثابت'),
}
