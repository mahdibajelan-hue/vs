import { useState, type CSSProperties } from 'react'
import { AlertTriangle, RotateCcw, Save, SlidersHorizontal } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { DEFAULT_CRITERIA, DEFECT_FA, type Criteria } from '../lib/rules'

type Path = (string | number)[]
const get = (o: unknown, p: Path): unknown => p.reduce<unknown>((x, k) => (x as Record<string, unknown>)?.[k as string], o)
const setIn = <T,>(o: T, p: Path, v: unknown): T => { const c = JSON.parse(JSON.stringify(o)); let x = c; for (const k of p.slice(0, -1)) x = x[k]; x[p[p.length - 1]] = v; return c }

const GROUPS: { title: string; color: string; rows: { p: Path; label: string; unit: string; hint?: string }[] }[] = [
  { title: 'پایه', color: '#8b5cf6', rows: [{ p: ['windowMm'], label: 'طول بازهٔ مرجع برای جمع طول عیوب', unit: 'mm', hint: '۳۰۰ mm ≈ ۱۲ اینچ' }, { p: ['maxRepairs'], label: 'سقف تعداد تعمیر هر سرجوش', unit: 'بار', hint: 'پس از آن برش' }] },
  { title: 'عیوب خطی (طول تکی)', color: '#f97316', rows: (['incomplete_penetration', 'incomplete_fusion', 'slag_inclusion'] as const).flatMap((t) => [{ p: ['linear', t, 'singleT'], label: `${DEFECT_FA[t]} — ضریب t`, unit: '× t' }, { p: ['linear', t, 'singleCapMm'], label: `${DEFECT_FA[t]} — سقف`, unit: 'mm' }]) },
  { title: 'جمع طول در بازهٔ مرجع', color: '#a16207', rows: [{ p: ['aggregate', 'tFactor'], label: 'ضریب t', unit: '× t' }, { p: ['aggregate', 'capMm'], label: 'سقف', unit: 'mm' }] },
  { title: 'تخلخل', color: '#0ea5e9', rows: [{ p: ['porosity', 'clusterT'], label: 'طول خوشه — ضریب t', unit: '× t' }, { p: ['porosity', 'clusterCapMm'], label: 'طول خوشه — سقف', unit: 'mm' }, { p: ['porosity', 'singleDiaMm'], label: 'قطر حفرهٔ منفرد', unit: 'mm' }] },
  { title: 'بریدگی کناره', color: '#d946ef', rows: [{ p: ['undercut', 'maxDepthMm'], label: 'حداکثر عمق', unit: 'mm' }, { p: ['undercut', 'maxDepthPctT'], label: 'حداکثر عمق نسبت به t', unit: '٪' }, { p: ['undercut', 'maxLenMm'], label: 'حداکثر طول پیوسته', unit: 'mm' }] },
  { title: 'سوختگی، ناهم‌ترازی و ترک', color: '#ef4444', rows: [{ p: ['burnThrough', 'maxDiaMm'], label: 'سوختگی قابل تعمیر — حداکثر ابعاد', unit: 'mm' }, { p: ['hiLo', 'maxPctT'], label: 'ناهم‌ترازی (Hi-Lo) نسبت به t', unit: '٪' }, { p: ['crater', 'maxLenMm'], label: 'ترک کریتر قابل تعمیر — طول', unit: 'mm' }, { p: ['crater', 'maxDepthMm'], label: 'ترک کریتر قابل تعمیر — عمق', unit: 'mm' }] },
]

/** the acceptance thresholds of this project — one place, checked against the standard and specification in force */
export function WqCriteria() {
  const st = useWqStore()
  const [c, setC] = useState<Criteria>(st.crit)
  const can = st.caps.configure
  const dirty = JSON.stringify(c) !== JSON.stringify(st.crit)
  return (
    <div className="wq-criteria">
      <p className="wq-warn"><AlertTriangle size={16} aria-hidden /> این اعداد ساختار کلی معیارهای پذیرش جوش خطوط لوله را پیاده می‌کنند و کمک‌تصمیم‌اند. مدیر کنترل کیفیت باید هر عدد را با نسخهٔ رسمی استاندارد و مشخصات فنی پروژه تطبیق دهد. برای سرویس‌هایی که معیار مکانیک شکست (ECA) دارند، ارزیابی جداگانه لازم است.</p>
      <div className="wq-crit-grid">
        {GROUPS.map((g, k) => (
          <section key={g.title} className="wq-card wq-rise" style={{ '--i': k, '--c': g.color } as CSSProperties}>
            <header className="wq-card-head"><SlidersHorizontal size={16} aria-hidden style={{ color: g.color }} /><h3>{g.title}</h3></header>
            {g.rows.map((r) => {
              const v = get(c, r.p) as number, d = get(DEFAULT_CRITERIA, r.p) as number
              return (
                <label key={r.p.join('.')} className="wq-crit-row"><span>{r.label}{r.hint && <small>{r.hint}</small>}</span>
                  <span className="wq-crit-in"><input type="number" step="any" min={0} value={v} disabled={!can} onChange={(e) => setC(setIn(c, r.p, e.target.value === '' ? 0 : Number(e.target.value)))} /><em>{r.unit}</em></span>
                  {v !== d && <small className="wq-crit-def">پیش‌فرض {d.toLocaleString('fa-IR')}</small>}
                </label>
              )
            })}
            {g.title.startsWith('سوختگی') && <label className="wq-check"><input type="checkbox" checked={c.crater.allow} disabled={!can} onChange={(e) => setC({ ...c, crater: { ...c.crater, allow: e.target.checked } })} /> ترک کریتر کم‌عمق قابل تعمیر است (سایر ترک‌ها همیشه برش)</label>}
          </section>
        ))}
      </div>
      {can ? (
        <div className="wq-form-actions wq-sticky">
          <button type="button" className="ps-btn is-primary" disabled={!dirty} onClick={() => void st.run('معیارهای پذیرش پروژه ذخیره شد', () => repo.saveCriteria(st.projectId!, c))}><Save size={14} aria-hidden /> ذخیره برای همهٔ کاربران پروژه</button>
          <button type="button" className="ps-btn is-ghost" onClick={() => setC(DEFAULT_CRITERIA)}><RotateCcw size={14} aria-hidden /> بازگشت به پیش‌فرض</button>
        </div>
      ) : <p className="ps-hint">تغییر معیارها با سطح دسترسی «مدیریت» در این ماژول است («مدیریت کاربران»).</p>}
    </div>
  )
}
