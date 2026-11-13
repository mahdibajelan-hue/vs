import { useState, type CSSProperties } from 'react'
import { AlertTriangle, BookOpen, RotateCcw, Ruler, Save, SlidersHorizontal } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { API1104_DEFAULT, evaluate, type Api1104Criteria } from '../lib/api1104'
import { fa } from '../lib/useQc'

type Path = (string | number)[]
const get = (o: unknown, p: Path): unknown => p.reduce<unknown>((x, k) => (x as Record<string, unknown>)?.[k as string], o)
const setIn = <T,>(o: T, p: Path, v: unknown): T => { const c = JSON.parse(JSON.stringify(o)); let x = c; for (const k of p.slice(0, -1)) x = x[k]; x[p[p.length - 1]] = v; return c }
type Row = { p: Path; label: string; unit: string; inch?: string }

const GROUPS: { title: string; clause: string; color: string; rows: Row[] }[] = [
  { title: 'پایه', clause: '9.3', color: '#0891b2', rows: [{ p: ['windowMm'], label: 'طول پیوستهٔ مرجع (حداکثر برابر طول جوش)', unit: 'mm', inch: '12 in' }, { p: ['pct8'], label: 'سهم از طول جوش برای مجموع‌ها', unit: '٪', inch: '8 %' }, { p: ['maxRepairs'], label: 'سقف تعمیر هر سرجوش (سپس برش)', unit: 'بار' }] },
  { title: 'نفوذ ناقص', clause: '9.3.1–9.3.3', color: '#f97316', rows: [
    { p: ['ip', 'single'], label: 'IP — طول تکی', unit: 'mm', inch: '1 in' }, { p: ['ip', 'agg'], label: 'IP — مجموع در طول مرجع', unit: 'mm', inch: '1 in' },
    { p: ['ipd', 'single'], label: 'IPD — طول تکی', unit: 'mm', inch: '2 in' }, { p: ['ipd', 'agg'], label: 'IPD — مجموع در طول مرجع', unit: 'mm', inch: '3 in' },
    { p: ['icp', 'single'], label: 'ICP — طول تکی', unit: 'mm', inch: '2 in' }, { p: ['icp', 'agg'], label: 'ICP — مجموع در طول مرجع', unit: 'mm', inch: '2 in' }] },
  { title: 'ذوب ناقص', clause: '9.3.4–9.3.5', color: '#f59e0b', rows: [
    { p: ['if', 'single'], label: 'IF — طول تکی', unit: 'mm', inch: '1 in' }, { p: ['if', 'agg'], label: 'IF — مجموع در طول مرجع', unit: 'mm', inch: '1 in' },
    { p: ['ifd', 'single'], label: 'IFD — طول تکی', unit: 'mm', inch: '2 in' }, { p: ['ifd', 'agg'], label: 'IFD — مجموع در طول مرجع', unit: 'mm', inch: '2 in' }] },
  { title: 'سوختگی', clause: '9.3.7', color: '#e11d48', rows: [{ p: ['bt', 'maxDim'], label: 'بیشترین بُعد (اگر تیره‌تر از فلز پایه)', unit: 'mm', inch: '¼ in' }, { p: ['bt', 'sumAgg'], label: 'مجموع ابعاد در طول مرجع', unit: 'mm', inch: '½ in' }] },
  { title: 'آخال سرباره', clause: '9.3.8', color: '#a16207', rows: [
    { p: ['esi', 'length'], label: 'ESI — طول', unit: 'mm', inch: '2 in' }, { p: ['esi', 'agg'], label: 'ESI — مجموع در طول مرجع', unit: 'mm', inch: '2 in' }, { p: ['esi', 'width'], label: 'ESI — عرض', unit: 'mm', inch: '1/16 in' },
    { p: ['isi', 'agg'], label: 'ISI — مجموع در طول مرجع', unit: 'mm', inch: '½ in' }, { p: ['isi', 'width'], label: 'ISI — عرض', unit: 'mm', inch: '⅛ in' }, { p: ['isi', 'maxCount'], label: 'ISI با عرض حداکثر — تعداد در طول مرجع', unit: 'عدد' }] },
  { title: 'تخلخل', clause: '9.3.9', color: '#0ea5e9', rows: [
    { p: ['p', 'pore'], label: 'حفرهٔ منفرد — قطر', unit: 'mm', inch: '⅛ in' }, { p: ['p', 'porePctT'], label: 'حفرهٔ منفرد — نسبت به ضخامت', unit: '٪ t' },
    { p: ['cp', 'dia'], label: 'CP — قطر خوشه', unit: 'mm', inch: '½ in' }, { p: ['cp', 'agg'], label: 'CP — مجموع در طول مرجع', unit: 'mm', inch: '½ in' }, { p: ['cp', 'pore'], label: 'CP — حفرهٔ درون خوشه', unit: 'mm', inch: '1/16 in' },
    { p: ['hb', 'single'], label: 'HB — طول تکی', unit: 'mm', inch: '½ in' }, { p: ['hb', 'agg'], label: 'HB — مجموع در طول مرجع', unit: 'mm', inch: '2 in' }, { p: ['hb', 'big'], label: 'HB بزرگ‌تر از', unit: 'mm', inch: '¼ in' }, { p: ['hb', 'spacing'], label: 'HB بزرگ — کمترین فاصله', unit: 'mm', inch: '2 in' }] },
  { title: 'ترک، بریدگی، تجمع', clause: '9.3.10–9.3.12, 9.7', color: '#ef4444', rows: [
    { p: ['crack', 'crater'], label: 'ترک کریتر / ستاره‌ای قابل قبول', unit: 'mm', inch: '5/32 in' }, { p: ['crack', 'repairPctW'], label: 'ترک قابل تعمیر — کمتر از طول جوش', unit: '٪' },
    { p: ['undercut', 'agg'], label: 'بریدگی EU + IU — مجموع در طول مرجع', unit: 'mm', inch: '2 in' }, { p: ['undercut', 'fracW'], label: 'بریدگی — مجموع کمتر از ۱/n طول جوش', unit: 'n', inch: '1/6' },
    { p: ['undercut', 'depthMm'], label: 'عمق بریدگی', unit: 'mm', inch: '1/32 in' }, { p: ['undercut', 'depthPctT'], label: 'عمق بریدگی نسبت به ضخامت', unit: '٪ t' },
    { p: ['hiLo', 'offset'], label: 'ناهم‌ترازی لبه‌ها (Hi-Lo)', unit: 'mm', inch: '⅛ in' }, { p: ['ai', 'agg'], label: 'تجمع ناپیوستگی‌ها در طول مرجع', unit: 'mm', inch: '2 in' }] },
]

/** the API 1104 acceptance limits of the project — one place, each with its clause and the standard's own inch figure */
export function WqCriteria() {
  const st = useWqStore()
  const [c, setC] = useState<Api1104Criteria>(st.crit)
  const [od, setOd] = useState(56), [t, setT] = useState(19.05)
  const can = st.caps.configure
  const dirty = JSON.stringify(c) !== JSON.stringify(st.crit)
  const lim = evaluate({ odMm: od * 25.4, thkMm: t }, [], c).limits
  return (
    <div className="wq-criteria">
      <section className="wq-card wq-rise wq-api-intro">
        <header className="wq-card-head"><BookOpen size={16} aria-hidden /><h3>معیارهای پذیرش رادیوگرافی طبق API 1104 (بند 9.3)</h3></header>
        <p>در API 1104 حدود پذیرش، <b>طول‌های ثابت</b> (۲۵، ۵۰، ۱۳ میلی‌متر…) در هر <b>۳۰۰ میلی‌متر پیوستهٔ جوش</b> هستند، نه ضریبی از ضخامت. چند حد به <b>طول جوش</b> (محیط π × OD) وابسته‌اند: مجموع بعضی نشانه‌ها نباید از ۸٪ طول جوش بیشتر شود، مجموع بریدگی‌ها از ۱/۶ طول جوش، و طول مرجع هیچ‌گاه از کل جوش بلندتر نیست. فقط قطر حفرهٔ منفرد (۲۵٪ ضخامت) و عمق بریدگی (۱۲٫۵٪ ضخامت) به ضخامت دیواره بستگی دارند.</p>
        <p className="wq-warn"><AlertTriangle size={16} aria-hidden /> مقادیر پیش‌فرض از ویرایش ۲۲ استاندارد (۲۰۲۱) برای لوله با قطر ۶۰٫۳ میلی‌متر و بیشتر است. ویرایش مورد قرارداد و مشخصات فنی کارفرما ملاک است و مدیر کنترل کیفیت باید آن‌ها را تطبیق دهد. توزیع تخلخل (نمودارهای بند 9.3.9) توسط مفسر بررسی می‌شود.</p>
      </section>
      <section className="wq-card wq-rise" style={{ '--i': 1 } as CSSProperties}>
        <header className="wq-card-head"><Ruler size={16} aria-hidden /><h3>حدود برای یک سرجوش</h3></header>
        <div className="wq-form is-row"><label><span>قطر خارجی (اینچ)</span><input type="number" min={2.375} step={0.125} value={od} onChange={(e) => setOd(Number(e.target.value) || 2.375)} /></label><label><span>ضخامت دیواره (mm)</span><input type="number" min={1} step={0.01} value={t} onChange={(e) => setT(Number(e.target.value) || 1)} /></label></div>
        <div className="wq-limits">{lim.map((l) => <span key={l.label}><small>{l.label}</small>{l.value}</span>)}</div>
      </section>
      <div className="wq-crit-grid">
        {GROUPS.map((g, k) => (
          <section key={g.title} className="wq-card wq-rise" style={{ '--i': k + 2, '--c': g.color } as CSSProperties}>
            <header className="wq-card-head"><SlidersHorizontal size={16} aria-hidden style={{ color: g.color }} /><h3>{g.title}</h3><small className="ps-meta">بند {g.clause}</small></header>
            {g.rows.map((r) => {
              const v = get(c, r.p) as number, d = get(API1104_DEFAULT, r.p) as number
              return (
                <label key={r.p.join('.')} className="wq-crit-row"><span>{r.label}{r.inch && <small>استاندارد: {r.inch}</small>}</span>
                  <span className="wq-crit-in"><input type="number" step="any" min={0} value={v} disabled={!can} onChange={(e) => setC(setIn(c, r.p, e.target.value === '' ? 0 : Number(e.target.value)))} /><em>{r.unit}</em></span>
                  {v !== d && <small className="wq-crit-def">پیش‌فرض {fa(d, 2)}</small>}
                </label>
              )
            })}
          </section>
        ))}
      </div>
      {can ? (
        <div className="wq-form-actions wq-sticky">
          <button type="button" className="ps-btn is-primary" disabled={!dirty} onClick={() => void st.run('معیارهای پذیرش پروژه ذخیره شد', () => repo.saveCriteria(st.projectId!, { api1104: c }))}><Save size={14} aria-hidden /> ذخیره برای همهٔ کاربران پروژه</button>
          <button type="button" className="ps-btn is-ghost" onClick={() => setC(API1104_DEFAULT)}><RotateCcw size={14} aria-hidden /> بازگشت به مقادیر API 1104</button>
        </div>
      ) : <p className="ps-hint">تغییر معیارها با سطح دسترسی «مدیریت» در این ماژول است («مدیریت کاربران»).</p>}
    </div>
  )
}
