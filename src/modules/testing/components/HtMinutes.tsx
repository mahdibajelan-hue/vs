import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { CheckCircle2, ClipboardSignature, Download, FileText, Plus, Printer, Trash2, XCircle, Clock, RotateCw } from 'lucide-react'
import { ShamsiDate, ShamsiDateTime } from '../../../components/common/ShamsiField'
import { useAuthStore } from '../../../store/useAuthStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../../lib/jalali'
import { todayTehran } from '../../../lib/today'
import { useTestingStore } from '../store/useTestingStore'
import { airTestSaw, pumpRateOf, PSI_PER_BAR, SEAM_FA, sectionIgs, smysPsiOf, WATER_LIMITS, type WallPart } from '../lib/igs'
import {
  computeForm, FORM_FA, FORM_ORDER, FORM_SHORT, LEAK_T, leakLog, num, PERMIT_ITEMS, phaseReadings, riseCumulative, rowsOf, strengthRise, tmOf,
  type Ctx, type FormData, type LeakRow, type PvRow, type RiseRow,
} from '../lib/minutes'
import type { FormKind, HtForm, HtSection } from '../repo'
import { PvChart } from './HtCharts'

const fa = (v: number, d = 2) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const RES_UI: Record<HtForm['result'], { label: string; color: string }> = { pass: { label: 'قبول', color: '#22c55e' }, fail: { label: 'مردود', color: '#ef4444' }, pending: { label: 'در انتظار', color: '#94a3b8' } }
/** a stored timestamp as the local (Tehran) «YYYY-MM-DDTHH:mm» the date-time field edits */
const localDt = (iso: string) => {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return iso.slice(0, 16)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
const CSS = `.mn{display:grid;gap:.8rem}.mn-tabs{display:flex;gap:.4rem;flex-wrap:wrap}
.mn-tab{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .75rem;border-radius:.8rem;border:1px solid var(--border-soft);font-size:12px;font-weight:800;color:var(--text-secondary);background:transparent;cursor:pointer;transition:transform .14s ease-out}
.mn-tab:active{transform:scale(.97)}.mn-tab i{width:.55rem;height:.55rem;border-radius:99px;background:var(--c)}.mn-tab[aria-pressed=true]{border-color:var(--c);color:var(--text-primary);background:color-mix(in srgb,var(--c) 12%,transparent)}
.mn-calc{display:grid;gap:.25rem;padding:.7rem .85rem;border-radius:.9rem;background:color-mix(in srgb,var(--text-primary) 4%,transparent);font-size:12px}
.mn-calc div{display:flex;justify-content:space-between;gap:1rem}.mn-calc div span{color:var(--text-muted)}.mn-calc div b{font-variant-numeric:tabular-nums;text-align:left}
.mn-verdict{display:flex;align-items:center;gap:.5rem;padding:.6rem .85rem;border-radius:.9rem;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 10%,transparent);font-size:12.5px;font-weight:700}
.mn-verdict b{color:var(--c)}.mn-radio{display:flex;gap:.8rem;flex-wrap:wrap;font-size:12.5px}.mn-radio label{display:flex;align-items:center;gap:.3rem}
.mn-checks{display:grid;gap:.35rem;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));font-size:12.5px}.mn-checks label{display:flex;gap:.4rem;align-items:center}
.mn-walls td input{width:100%;min-width:5rem}.mn-pt{display:grid;gap:.5rem;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))}
.mn-sub{display:grid;gap:.45rem;padding:.65rem .8rem;border:1px dashed var(--border-soft);border-radius:.9rem}.mn-sub>b{font-size:12.5px}.mn-sub>small{color:var(--text-muted);font-size:11.5px;line-height:1.8}
.mn-et td{padding:.25rem .3rem}.mn-et td input{width:100%;min-width:4.2rem;font-variant-numeric:tabular-nums}.mn-et td.ro{color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.mn-et .shamsi-dt{min-width:12rem}.mn-pair{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))}`

/** a section's IGS figures (null for no section, e.g. a station package, or when the pipe grade is unknown) */
export function useSectionIgs(sec: HtSection | null) {
  const st = useTestingStore()
  const igs = st.igs()
  return useMemo(() => {
    const pipe = st.pipe
    const smys = st.settings.smysOverride ? st.settings.smysOverride * 145.038 : pipe ? smysPsiOf(pipe.material) : null
    if (!pipe || !smys || !sec) return null
    const r = sectionIgs({ odIn: pipe.diameterIn, smysPsi: smys, defaultWallIn: pipe.wallMm / 25.4, lengthM: (sec.kmTo - sec.kmFrom) * 1000, wallMix: sec.wallMix, dpPsi: pipe.designPressureBar * PSI_PER_BAR,
      elev: { low: sec.elevMin, high: sec.elevMax, start: sec.elevStart, end: sec.elevEnd, head: sec.headElev } }, igs)
    return r ? { ...r, igs, odIn: pipe.diameterIn, smys, material: pipe.material, dpPsi: pipe.designPressureBar * PSI_PER_BAR } : null
  }, [st.pipe, st.settings.smysOverride, sec, igs])
}

/** The section's specification (form 5-1) and its minutes (forms 5-2 … 5-7). */
export function HtMinutes({ sec }: { sec: HtSection }) {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === st.projectId))
  const fig = useSectionIgs(sec)
  const readings = useMemo(() => st.readings.filter((r) => r.targetId === sec.id), [st.readings, sec.id])
  const forms = st.forms.filter((f) => f.targetId === sec.id)
  const [kind, setKind] = useState<FormKind>(() => FORM_ORDER.find((k) => forms.find((f) => f.kind === k)?.result !== 'pass') ?? 'permit')
  if (!fig) return <p className="ps-hint is-warn">مشخصات لوله یا گرید آن (SMYS) در دسترس نیست؛ تنظیمات دوقلوی دیجیتال یا «SMYS دستی» را کامل کنید.</p>
  const ctx: Ctx = { igs: fig.igs, mix: fig.mix, pr: fig.pr, odIn: fig.odIn, readings }
  const print = (only?: FormKind | 'profile') => printSection({ sec, fig, ctx, forms, settings: st.settings, projectName: project?.officialName ?? '', profile: st.profile, only })
  return (
    <div className="mn"><style>{CSS}</style>
      <SectionSpec sec={sec} fig={fig} onPrint={() => print('profile')} />
      <section className="ps-card">
        <header className="ps-card-head"><b><ClipboardSignature size={15} /> صورتجلسه‌ها و جداول آزمون (پیوست ۵ دستورالعمل)</b>
          <button type="button" className="ps-btn" onClick={() => print()}><Printer size={14} /> چاپ پروندهٔ کامل قطعه</button></header>
        <div className="mn-tabs" role="group" aria-label="صورتجلسه">
          {FORM_ORDER.map((k) => { const r = forms.find((f) => f.kind === k)?.result ?? 'pending'; return <button key={k} type="button" className="mn-tab" aria-pressed={kind === k} style={{ '--c': forms.some((f) => f.kind === k) ? RES_UI[r].color : '#64748b' } as CSSProperties} onClick={() => setKind(k)}><i />{FORM_SHORT[k]}</button> })}
        </div>
        <FormEditor key={kind + (forms.find((f) => f.kind === kind)?.updatedAt ?? '')} kind={kind} ctx={ctx} fig={fig} form={forms.find((f) => f.kind === kind) ?? null} onPrint={() => print(kind)}
          onSave={(data, at) => { const c = computeForm(kind, data, ctx); return st.saveForm('section', sec.id, { kind, data, result: c.result, at }, email) }} />
      </section>
    </div>
  )
}

type Fig = NonNullable<ReturnType<typeof useSectionIgs>>
function SectionSpec({ sec, fig, onPrint }: { sec: HtSection; fig: Fig; onPrint: () => void }) {
  const st = useTestingStore()
  const [walls, setWalls] = useState<WallPart[]>(sec.wallMix ?? fig.mix.parts.map((p) => ({ wtIn: Math.round(p.wtIn * 1000) / 1000, lengthM: Math.round(p.lengthM * 100) / 100 })))
  const r2 = (v: number) => String(Math.round(v * 100) / 100)
  const [w, setW] = useState({ from: sec.weldFrom, to: sec.weldTo, start: r2(sec.elevStart), end: r2(sec.elevEnd), head: r2(sec.headElev) })
  const { mix, pr, igs, plate } = fig
  const lenM = (sec.kmTo - sec.kmFrom) * 1000
  const sumL = walls.reduce((s, x) => s + (Number(x.lengthM) || 0), 0)
  const save = () => st.patchSection(sec.id, { wallMix: walls.filter((x) => x.wtIn > 0 && x.lengthM > 0), weldFrom: w.from, weldTo: w.to, elevStart: Number(w.start), elevEnd: Number(w.end), headElev: Number(w.head) })
  const P = (k: string, s: number, l: number) => <tr><td>{k}</td><td>{fa(s, 2)}</td><td>{fa(l, 2)}</td></tr>
  const lim = pr.limits
  return (
    <section className="ps-card">
      <header className="ps-card-head"><b><FileText size={15} /> مشخصات قطعه و نیمرخ طولی (فرم ۵-۱)</b><small className="ps-meta">{fig.material} · Ø{fa(fig.odIn, 0)}″ · SMYS {fa(fig.smys, 0)} psi · {SEAM_FA[igs.seam]}{fig.fromTwin ? ' · ضخامت از دوقلوی دیجیتال' : ''}</small>
        <button type="button" className="ps-btn" onClick={onPrint}><Printer size={14} /> چاپ فرم ۵-۱</button></header>
      <div className="ps-grid">
        <label className="ps-field"><span>شمارهٔ سرجوش ابتدا</span><input value={w.from} onChange={(e) => setW({ ...w, from: e.target.value })} dir="ltr" /></label>
        <label className="ps-field"><span>شمارهٔ سرجوش انتها</span><input value={w.to} onChange={(e) => setW({ ...w, to: e.target.value })} dir="ltr" /></label>
        <label className="ps-field"><span>ارتفاع ابتدا (m)</span><input type="number" step="0.01" value={w.start} onChange={(e) => setW({ ...w, start: e.target.value })} dir="ltr" /></label>
        <label className="ps-field"><span>ارتفاع انتها (m)</span><input type="number" step="0.01" value={w.end} onChange={(e) => setW({ ...w, end: e.target.value })} dir="ltr" /></label>
        <label className="ps-field"><span>ارتفاع کابین / سر آزمون (m)</span><input type="number" step="0.01" value={w.head} onChange={(e) => setW({ ...w, head: e.target.value })} dir="ltr" /></label>
      </div>
      <div className="ps-table-wrap"><table className="ps-table mn-walls">
        <thead><tr><th>ضخامت (اینچ)</th><th>طول (متر)</th><th>قطر داخلی (mm)</th><th>حجم (m³)</th><th /></tr></thead>
        <tbody>{walls.map((x, i) => { const part = mix.parts.find((p) => Math.abs(p.wtIn - x.wtIn) < 0.0006); return <tr key={i}>
          <td><input type="number" step="0.001" value={x.wtIn || ''} onChange={(e) => setWalls(walls.map((y, j) => (j === i ? { ...y, wtIn: Number(e.target.value) } : y)))} dir="ltr" /></td>
          <td><input type="number" step="0.01" value={x.lengthM || ''} onChange={(e) => setWalls(walls.map((y, j) => (j === i ? { ...y, lengthM: Number(e.target.value) } : y)))} dir="ltr" /></td>
          <td>{part ? fa(part.idMm, 1) : '—'}</td><td>{part ? fa(part.volumeM3, 2) : '—'}</td>
          <td><button type="button" className="ps-btn is-ghost" aria-label="حذف ردیف" onClick={() => setWalls(walls.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td>
        </tr> })}</tbody>
        <tfoot><tr><td><button type="button" className="ps-btn" onClick={() => setWalls([...walls, { wtIn: 0, lengthM: 0 }])}><Plus size={13} /> ضخامت دیگر</button></td><td><b>{fa(sumL, 2)}</b>{Math.abs(sumL - lenM) > 1 && <small className="ps-meta"> (طول قطعه {fa(lenM, 0)} m)</small>}</td><td>ضخامت معادل {fa(mix.tEqIn, 4)}″</td><td><b>{fa(mix.volumeM3, 2)}</b></td><td /></tr></tfoot>
      </table></div>
      <div className="mn-pt">
        <div className="ht-fig"><small>اختلاف ارتفاع قطعه / مجاز</small><b style={{ color: pr.dhOk ? undefined : '#ef4444' }}>{fa(pr.dh, 2)} / {fa(pr.allowedDh, 2)} m</b><span>{pr.dhOk ? 'در حد مجاز' : 'بیش از حد مجاز — قطعه را کوتاه‌تر کنید'}</span></div>
        <div className="ht-fig"><small>فشار نقطهٔ پایین (TP) / حداقل نقطهٔ بالا</small><b>{fa(lim.lowPsi, 1)} / {fa(lim.highMinPsi, 1)} psi</b><span>{igs.seam === 'HFW' ? `کمترِ ${fa(igs.cyclicSmysPct, 0)}٪ SMYS و ${fa(igs.cyclicDpFactor, 2)}×DP (${lim.governs === 'dp' ? 'فشار طراحی تعیین‌کننده است' : 'SMYS تعیین‌کننده است'}) · ${fa(igs.cyclicHighDpFactor, 2)}×DP` : `${fa(lim.lowPct, 0)}٪ و ${fa(lim.highMinPct, 0)}٪ SMYS`}</span></div>
        <div className="ht-fig"><small>صفحهٔ اندازه</small><b>{fa(mix.gaugePlateMm, 2)} mm</b><span>{fa(igs.gaugePlatePct, 0)}٪ قطر داخلی ضخیم‌ترین لوله ({fa(mix.thickIn, 3)}″) · {fa(plate.mm, 0)} mm {plate.material}</span></div>
        <div className="ht-fig"><small>یکنواختی / حداقل دبی پمپ</small><b>{fa(fig.stabDays, 0)} روز</b><span>پمپ آبگیری دست‌کم {fa(pumpRateOf(fig.odIn), 0)} لیتر بر دقیقه</span></div>
      </div>
      <div className="ps-table-wrap"><table className="ps-table">
        <thead><tr><th>نقطه</th><th>آزمون مقاومت (psi)</th><th>آزمون نشتی (psi)</th></tr></thead>
        <tbody>{P(`پایین (${fa(sec.elevMin, 2)} m)`, pr.strength.low, pr.leak.low)}{P(`بالا (${fa(sec.elevMax, 2)} m)`, pr.strength.high, pr.leak.high)}{P('ابتدا', pr.strength.start, pr.leak.start)}{P('انتها', pr.strength.end, pr.leak.end)}{P('کابین', pr.strength.head, pr.leak.head)}</tbody>
      </table></div>
      <div className="ps-actions"><button type="button" className="ps-btn is-primary" onClick={() => void save()}><CheckCircle2 size={14} /> ذخیرهٔ مشخصات قطعه</button></div>
    </section>
  )
}

// ── an editable table of a form (the rows the attached forms tabulate) ───────
interface Col { k: string; label: string; type?: 'num' | 'text' | 'dt'; step?: number }
function EditTable<T extends object>({ cols, rows, onChange, blank, extra }: { cols: Col[]; rows: T[]; onChange: (r: T[]) => void; blank: T; extra?: { label: string; cell: (r: T, i: number) => ReactNode }[] }) {
  const get = (r: T, k: string) => String((r as Record<string, unknown>)[k] ?? '')
  const set = (i: number, k: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div className="ps-table-wrap"><table className="ps-table mn-et">
      <thead><tr><th>ردیف</th>{cols.map((c) => <th key={c.k}>{c.label}</th>)}{extra?.map((x) => <th key={x.label}>{x.label}</th>)}<th /></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td className="ro">{fa(i + 1, 0)}</td>
        {cols.map((c) => <td key={c.k}>{c.type === 'dt' ? <ShamsiDateTime value={get(r, c.k)} onChange={(x) => set(i, c.k, x)} label={c.label} />
          : <input type={c.type === 'text' ? 'text' : 'number'} step={c.step ?? 0.01} dir="ltr" value={get(r, c.k)} aria-label={c.label} onChange={(e) => set(i, c.k, e.target.value)} />}</td>)}
        {extra?.map((x) => <td key={x.label} className="ro">{x.cell(r, i)}</td>)}
        <td><button type="button" className="ps-btn is-ghost" aria-label="حذف ردیف" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={13} /></button></td></tr>)}</tbody>
      <tfoot><tr><td colSpan={cols.length + (extra?.length ?? 0) + 2}><button type="button" className="ps-btn" onClick={() => onChange([...rows, { ...blank, ...(rows.length && 'at' in blank ? { at: get(rows[rows.length - 1], 'at') } : {}) }])}><Plus size={13} /> ردیف جدید</button></td></tr></tfoot>
    </table></div>
  )
}

function FormEditor({ kind, ctx, fig, form, onSave, onPrint }: { kind: FormKind; ctx: Ctx; fig: Fig; form: HtForm | null; onSave: (d: FormData, at: string | null) => Promise<boolean>; onPrint: () => void }) {
  const [d, setD] = useState<FormData>(form?.data ?? {})
  const [at, setAt] = useState<string>(form?.at ?? todayTehran())
  const c = computeForm(kind, d, ctx)
  const ui = RES_UI[c.result]
  const { igs } = ctx
  const v = (k: string) => (d[k] == null ? '' : String(d[k]))
  const set = (k: string) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value })
  // field helpers are called as functions (not components) so inputs keep their focus while typing
  const N = (k: string, label: string, ph?: string, step = 0.01) => <label className="ps-field" key={k}><span>{label}</span><input type="number" step={step} value={v(k)} onChange={set(k)} placeholder={ph} dir="ltr" /></label>
  const T = (k: string, label: string) => <label className="ps-field" key={k}><span>{label}</span><input value={v(k)} onChange={set(k)} /></label>
  const R = (k: string, label: string, opts: [string, string][]) => <div className="ps-field" key={k}><span>{label}</span><div className="mn-radio">{opts.map(([val, l]) => <label key={val}><input type="radio" name={k} checked={d[k] === val} onChange={() => setD({ ...d, [k]: val })} />{l}</label>)}</div></div>
  const DT = (k: string, label: string) => <div className="ps-field" key={k}><span>{label}</span><ShamsiDateTime value={v(k)} onChange={(x) => setD({ ...d, [k]: x })} label={label} /></div>
  const CB = (k: string, label: string) => <label className="ps-field" key={k}><span>&nbsp;</span><span style={{ display: 'flex', gap: '.35rem', alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={d[k] === true} onChange={(e) => setD({ ...d, [k]: e.target.checked })} />{label}</span></label>
  const setRows = (k: string) => (r: unknown[]) => setD({ ...d, [k]: r })
  const endpoint = (p: 'send' | 'recv', title: string) => <div className="mn-sub"><b>{title}</b><div className="ps-grid">{N(`${p}Km`, 'کیلومتر', undefined, 0.001)}{T(`${p}Loc`, 'محل / موقعیت')}{T(`${p}Weld`, 'شمارهٔ سرجوش')}{DT(`${p}At`, 'تاریخ و ساعت')}</div></div>
  const fromReadings = (phase: string) => phaseReadings(ctx.readings, phase)

  let body: ReactNode
  if (kind === 'permit') body = <>
    <div className="mn-checks">{PERMIT_ITEMS.map((t, i) => <label key={t}><input type="checkbox" checked={d[`c${i}`] === true} onChange={(e) => setD({ ...d, [`c${i}`]: e.target.checked })} />{t}</label>)}</div>
    <div className="mn-sub"><b>آنالیز آب مصرفی</b><small>حدود مجاز دستورالعمل کنار هر مورد آمده است؛ نتیجهٔ آزمایشگاه را وارد کنید.</small>
      <div className="ps-grid">{WATER_LIMITS.map((l) => N(`w_${l.k}`, `${l.label} (${l.min != null ? `${fa(l.min)} تا ${fa(l.max!)}` : `≤ ${fa(l.max!)}`}${l.unit ? ' ' + l.unit : ''})`))}
        {N('fillTempC', 'دمای آب در آبگیری (°C)')}{CB('antifreeze', `ضدیخ افزوده شده (زیر ${fa(igs.minFillTempC, 0)} °C)`)}</div></div>
  </>
  else if (kind === 'gauge') body = <>
    <div className="mn-pair">{endpoint('send', 'ارسال')}{endpoint('recv', 'دریافت')}</div>
    <div className="ps-grid">{R('condition', 'وضعیت صفحهٔ دریافتی', [['ok', 'سالم دریافت گردید'], ['damaged', 'سالم دریافت نگردید']])}</div>
  </>
  else if (kind === 'air' && igs.seam === 'HFW') body = <div className="mn-sub"><b>روش HFW — برداشت آب و اندازه‌گیری افت فشار</b><small>ΔP₀ = M × ۱۴٫۲۲ ÷ (V × (X + D/(E·te)))؛ اگر X خالی بماند، از منحنی مدول بالک آب (شکل ۲) در دمای آب محاسبه می‌شود.</small>
    <div className="ps-grid">{N('p1', 'فشار خط قبل از برداشت آب P₁ (psi)', undefined, 0.1)}{N('m', 'حجم آب برداشته‌شده M (m³)', undefined, 0.001)}{N('p2', 'فشار خط بعد از برداشت آب P₂ (psi)', undefined, 0.1)}{N('waterC', 'دمای آب خط T (°C)')}{N('x', 'ضریب فشردگی X (×۱۰⁻⁶ kg/cm²، اختیاری)')}</div></div>
  else if (kind === 'air') {
    const pv = rowsOf<PvRow>(d, 'pv')
    const saw = airTestSaw(pv.map((r) => ({ p: num(r.p)!, v: num(r.v)! })).filter((r) => r.p != null && r.v != null), { volumeM3: fig.mix.volumeM3, odIn: fig.odIn, teIn: fig.mix.tEqIn, tC: num(d.waterC) ?? 15, staticBar: num(d.staticBar) ?? undefined }, igs)
    body = <div className="mn-sub"><b>روش DSAW — جدول و نمودار P/V</b><small>{`افزایش حجم آب در برابر فشار هر ۱ بار تا ${fa(igs.airPvMaxBar, 0)} بار یا نصف MAOP (هر کدام کمتر)؛ حجم به‌صورت تجمعی از شروع افزایش فشار.`}</small>
      <div className="ps-grid">{N('waterC', 'دمای متوسط آب (°C)')}{N('staticBar', 'فشار ستون آب Static Head (bar، اختیاری)', 'اولین قرائت')}</div>
      <EditTable cols={[{ k: 'p', label: 'فشار (bar)', step: 0.1 }, { k: 'v', label: 'حجم آب تزریقی تجمعی (m³)', step: 0.001 }]} rows={pv} onChange={setRows('pv')} blank={{ p: '', v: '' }} />
      <PvChart mode="air" points={pv.map((r) => ({ p: Number(r.p), v: Number(r.v) }))} volumeM3={fig.mix.volumeM3} igs={igs} air={saw} />
    </div>
  }
  else if (kind === 'strength') {
    const rise = rowsOf<RiseRow>(d, 'rise'), hold = rowsOf<RiseRow>(d, 'hold')
    const riseCols: Col[] = [{ k: 'at', label: 'تاریخ و ساعت', type: 'dt' }, { k: 'psi', label: 'فشار خط (psi)', step: 0.1 }, { k: 'meter', label: 'عدد کنتور (m³)', step: 0.001 }, { k: 'vol', label: 'آب تزریق‌شده (m³)', step: 0.001 }, { k: 'note', label: 'ملاحظات', type: 'text' }]
    const change = (rs: RiseRow[]) => (r: RiseRow, i: number) => { const a = num(r.psi), b = i ? num(rs[i - 1].psi) : null; return a != null && b != null ? fa(a - b, 1) : '—' }
    const importRise = () => setD({ ...d, rise: fromReadings('strength').filter((r) => r.volumeM3 != null).map((r, i, arr) => ({ at: localDt(r.at), psi: String(Math.round(r.pressureBar * PSI_PER_BAR * 10) / 10), meter: '', vol: String(Math.round((r.volumeM3! - (i ? arr[i - 1].volumeM3! : 0)) * 1000) / 1000) })) })
    body = <>
      <div className="ps-grid">{N('finalPsi', 'فشار نهایی در کابین (psi)')}{R('noRupture', 'پارگی یا نشتی', [['yes', 'مشاهده نشد'], ['no', 'مشاهده شد']])}</div>
      {igs.seam === 'HFW' ? <div className="mn-sub"><b>روش سیکلی</b><small>{`پس از رسیدن به TP، ${fa(igs.cyclicHoldMin, 0)} دقیقه نگهداری، کاهش فشار به نصف و افزایش مجدد؛ مجموعاً ${fa(igs.cyclicCycles, 0)} سیکل.`}</small>
        <div className="ps-grid">{N('cycles', 'تعداد سیکل انجام‌شده', undefined, 1)}{CB('cycleHoldOk', `هر سیکل دست‌کم ${fa(igs.cyclicHoldMin, 0)} دقیقه در TP`)}</div></div>
      : <>
        <div className="mn-sub"><b>جدول تغییرات فشار نسبت به حجم آب تزریقی تا رسیدن به فشار آزمون مقاومت (از ۵۰٪ TP)</b>
          <div className="ps-actions"><button type="button" className="ps-btn" disabled={!fromReadings('strength').some((r) => r.volumeM3 != null)} onClick={importRise}><Download size={13} /> از قرائت‌های آزمون مقاومت</button></div>
          <EditTable cols={riseCols} rows={rise} onChange={setRows('rise')} blank={{ at: '', psi: '', meter: '', vol: '', note: '' }} extra={[{ label: 'تغییرات فشار (psi)', cell: change(rise) }, { label: 'مجموع آب تزریقی (m³)', cell: (_r, i) => fa(riseCumulative(rise)[i].cum, 3) }]} />
          <PvChart points={strengthRise(d, ctx.readings)} volumeM3={fig.mix.volumeM3} igs={igs} />
        </div>
        <div className="mn-sub"><b>{`آزمایش ${fa(igs.strengthHoldH, 0)} ساعتهٔ مقاومت`}</b><small>{`تغییر فشار بیش از ${fa(igs.holdAdjustBar, 0)} بار با تزریق (مقدار مثبت) یا تخلیهٔ آب (مقدار منفی) جبران و حجم آن در همان ردیف یا ردیف بعد ثبت می‌شود.`}</small>
          <EditTable cols={[...riseCols.slice(0, 3), { k: 'vol', label: 'آب تزریقی (+) / تخلیه (−) m³', step: 0.001 }, riseCols[4]]} rows={hold} onChange={setRows('hold')} blank={{ at: '', psi: '', meter: '', vol: '', note: '' }} extra={[{ label: 'تغییرات فشار (psi)', cell: change(hold) }]} />
          <div className="ps-grid">{N('holdH', 'مدت نگهداری (ساعت، اختیاری)', 'از جدول یا قرائت‌ها', 0.1)}</div>
        </div>
      </>}
    </>
  }
  else if (kind === 'leak') {
    const log = rowsOf<LeakRow>(d, 'log')
    const small = fig.odIn <= igs.leakBigDiaIn
    const importLog = () => setD({ ...d, log: fromReadings('leak').map((r) => ({ at: localDt(r.at), psi: String(Math.round(r.pressureBar * PSI_PER_BAR * 10) / 10), amb: '', t1: r.tempC != null ? String(r.tempC) : '' })) })
    const auto = leakLog(d, ctx.readings)
    body = <>
      <div className="mn-sub"><b>جدول ثبت ارقام آزمایش نشتی (فرم ۵-۳)</b><small>{`فشار هر ساعت با فشارسنج وزنه‌ای؛ دمای ${small ? 'زمین' : 'سطح لوله'} (T₁ تا T₆) هر ۳ ساعت و دمای محیط هر ساعت. Tm میانگین دماهای ثبت‌شدهٔ هر ردیف است.`}</small>
        <div className="ps-actions"><button type="button" className="ps-btn" disabled={!fromReadings('leak').length} onClick={importLog}><Download size={13} /> از قرائت‌های آزمون نشتی</button></div>
        <EditTable cols={[{ k: 'at', label: 'تاریخ و ساعت', type: 'dt' }, { k: 'psi', label: 'فشارسنج وزنه‌ای (psi)', step: 0.1 }, { k: 'amb', label: 'دمای محیط (°C)', step: 0.1 }, ...LEAK_T.map((k, i) => ({ k, label: `T${fa(i + 1, 0)}`, step: 0.001 })), { k: 'note', label: 'ملاحظات', type: 'text' as const }]}
          rows={log} onChange={setRows('log')} blank={{ at: '', psi: '', amb: '' } as LeakRow} extra={[{ label: 'Tm', cell: (r) => { const t = tmOf(r); return t == null ? '—' : fa(t, 3) } }]} />
        {!log.length && auto.length > 0 && <small className="ps-meta">{`تا ثبت جدول، ${fa(auto.length, 0)} قرائت آزمون نشتی مبنای محاسبه است.`}</small>}
      </div>
      <div className="mn-sub"><b>{small ? `صورتجلسهٔ آزمایش نشتی — قطر ${fa(fig.odIn, 0)}″ (روش K–F–H، فرم ۵-۶)` : `صورتجلسهٔ آزمایش نشتی — قطر ${fa(fig.odIn, 0)}″ (بیش از ${fa(igs.leakBigDiaIn, 0)}″)`}</b>
        <small>مقادیر خالی از ردیف اول و آخر جدول بالا یا از قرائت‌ها برداشته می‌شوند.{small ? ' F و ΔF/F را از منحنی پیوست دستورالعمل بر اساس قطر لوله بخوانید؛ اگر (μ−γ) و X خالی بمانند، از منحنی‌ها در دمای خط محاسبه می‌شوند.' : ' اگر δ خالی بماند، از شکل ۳ در دمای متوسط محاسبه می‌شود.'}</small>
        <div className="ps-grid">{N('p1', 'فشار شروع P₁ (psi)', undefined, 0.1)}{N('p2', 'فشار خاتمه P₂ (psi)', undefined, 0.1)}{N('t1', 'دمای شروع T₁ (°C)', undefined, 0.001)}{N('t2', 'دمای خاتمه T₂ (°C)', undefined, 0.001)}
          {small ? <>{N('F', 'ضریب محاسبات F', undefined, 0.001)}{N('dFF', 'ضریب ΔF/F', undefined, 0.001)}{N('muGamma', '(μ−γ) ×۱۰⁻⁶ /°C (اختیاری)')}{N('x', 'X ×۱۰⁻⁶ kg/cm² (اختیاری)')}</> : N('delta', 'δ ×۱۰⁻⁶ /°C (اختیاری)')}
          {N('holdH', 'مدت آزمون (ساعت، اختیاری)', 'از جدول', 0.1)}{N('ext', 'تعداد تمدید ۲۴ ساعته', '۰', 1)}{CB('stabWaived', 'یکنواختی دما زودتر نشان داده شد')}</div>
        {c.extend && <div className="ps-actions"><button type="button" className="ps-btn" onClick={() => setD({ ...d, ext: (num(d.ext) ?? 0) + 1 })}><RotateCw size={13} /> ثبت تمدید ۲۴ ساعته</button></div>}
      </div>
    </>
  }
  else body = <>
    <div className="ps-grid">{N('airC', 'دمای هوا (°C)', undefined, 0.1)}{R('weather', 'وضعیت هوا', [['sunny', 'آفتابی'], ['cloudy', 'ابری'], ['rainy', 'بارانی']])}</div>
    <div className="mn-pair">{endpoint('send', 'ارسال آخرین پیگ')}{endpoint('recv', 'دریافت آخرین پیگ')}</div>
    <div className="ps-grid">{R('waterAhead', 'آب جلوی آخرین پیگ', [['no', 'دیده نشد'], ['yes', 'دیده شد']])}{R('dust', 'گرد و زنگ در هوای خروجی', [['no', 'ندارد'], ['yes', 'دارد']])}
      {N('dewC', 'نقطهٔ شبنم هوای خروجی (°C)', undefined, 0.1)}{N('ambDewC', 'نقطهٔ شبنم هوای محیط (°C)', undefined, 0.1)}{CB('n2', 'پر کردن با نیتروژن ۱ kg/cm² (توقف طولانی)')}</div>
  </>
  return (
    <div className="mn">
      <b style={{ fontSize: 13.5 }}>{FORM_FA[kind]}</b>
      <div className="ps-grid"><div className="ps-field"><span>تاریخ صورتجلسه</span><ShamsiDate value={at} onChange={setAt} label="تاریخ صورتجلسه" /></div></div>
      {body}
      <label className="ps-field is-wide"><span>توضیحات</span><input value={v('note')} onChange={set('note')} /></label>
      {c.rows.length > 0 && <div className="mn-calc">{c.rows.map(([k, x]) => <div key={k}><span>{k}</span><b>{x}</b></div>)}</div>}
      <div className="mn-verdict" style={{ '--c': c.extend ? '#f59e0b' : ui.color } as CSSProperties}>{c.result === 'pass' ? <CheckCircle2 size={16} color={ui.color} /> : c.result === 'fail' ? <XCircle size={16} color={ui.color} /> : <Clock size={16} color={c.extend ? '#f59e0b' : ui.color} />}<b>{c.extend ? 'تمدید' : ui.label}</b> — {c.why}</div>
      <div className="ps-actions"><button type="button" className="ps-btn is-primary" onClick={() => void onSave(d, at || null)}><CheckCircle2 size={14} /> ذخیرهٔ صورتجلسه</button>
        <button type="button" className="ps-btn" onClick={onPrint} disabled={!form}><Printer size={14} /> چاپ فرم</button>
        {form ? <small className="ps-meta">آخرین ثبت: {form.by} · {formatJalali(form.updatedAt.slice(0, 10))}</small> : <small className="ps-meta">برای چاپ، ابتدا صورتجلسه را ذخیره کنید.</small>}</div>
    </div>
  )
}

// ── print: the forms of appendix 5, each on its own page with its own signature block ──────────────
interface PrintArgs { sec: HtSection; fig: Fig; ctx: Ctx; forms: HtForm[]; settings: ReturnType<typeof useTestingStore.getState>['settings']; projectName: string; profile: { km: number; elev: number }[]; only?: FormKind | 'profile' }
function printSection({ sec, fig, ctx, forms, settings, projectName, profile, only }: PrintArgs) {
  const w = window.open('', '_blank', 'width=1000,height=1200'); if (!w) return
  const e = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const p = settings.parties, { mix, pr, igs, plate } = fig
  const today = todayTehran()
  const dt = (x: unknown) => { const s = String(x ?? ''); return s ? `${formatJalali(s.slice(0, 10))}${s.length > 10 ? ' — ' + s.slice(11, 16) : ''}` : '—' }
  const nv = (x: unknown, d = 2) => { const n = num(x); return n == null ? '—' : fa(n, d) }
  const box = (on: boolean) => (on ? '☑' : '☐')
  const SIG4 = ['رئیس دستگاه نظارت / مشاور', 'مسئول کنترل کیفی پیمانکار', 'مسئول اجرای آزمایش هیدرواستاتیک', 'رئیس کارگاه پیمانکار']
  const SIG3 = ['رئیس دستگاه نظارت (مشاور)', 'مسئول اجرای آزمایش هیدرواستاتیک', 'رئیس کارگاه پیمانکار']
  const SIG_REP = ['رئیس دستگاه نظارت (مشاور)', 'نمایندهٔ پیمانکار — الف) مجری آزمایش هیدرواستاتیک', 'نمایندهٔ پیمانکار — ب) رئیس کارگاه پیمانکار']
  const SIG_PERMIT = ['نمایندهٔ پیمانکار', 'نمایندهٔ مشاور', 'نمایندهٔ کارفرما', 'نمایندهٔ امور بازرسی فنی']
  const sign = (names: string[]) => `<table class="sg"><tr>${names.map((n) => `<td>${n}<br><small>نام و امضاء</small></td>`).join('')}</tr><tr class="sp">${names.map(() => '<td></td>').join('')}</tr></table>`
  const head = (no: string, title: string, at: string | null) => `<div class="fh"><div class="org">شرکت ملی گاز ایران — پروژهٔ احداث خط انتقال گاز ${e(projectName)}</div><h2>${no ? `<small>${no}</small> ` : ''}${title}</h2>
    <table class="hd"><tr><th>شمارهٔ قرارداد</th><td>${e(p.contractNo)}</td><th>کارفرما</th><td>${e(p.employer)}</td></tr><tr><th>تاریخ</th><td>${formatJalali(at ?? today)}</td><th>مشاور</th><td>${e(p.consultant)}</td></tr><tr><th>پیمانکار</th><td colspan="3">${e(p.contractor)}</td></tr></table></div>`
  const secRow = `<table><tr><th>شمارهٔ قطعه</th><td>${e(sec.code)}</td><th>از کیلومتر</th><td>${fa(sec.kmFrom, 3)}</td><th>تا کیلومتر</th><td>${fa(sec.kmTo, 3)}</td></tr>
    <tr><th>قطر و جنس لوله</th><td>${fa(fig.odIn, 0)}″ — ${e(fig.material)}</td><th>ضخامت (اینچ)</th><td>${mix.parts.map((x) => fa(x.wtIn, 3)).join(' / ')}</td><th>طول قطعه (m)</th><td>${fa(mix.lengthM, 2)}</td></tr></table>`
  const wallTable = `<table><tr><th>پارامتر</th>${mix.parts.map((x) => `<th>ضخامت ${fa(x.wtIn, 3)}″</th>`).join('')}<th>جمع</th></tr><tr><th>طول L (متر)</th>${mix.parts.map((x) => `<td>${fa(x.lengthM, 2)}</td>`).join('')}<td>${fa(mix.lengthM, 2)}</td></tr><tr><th>حجم V (مترمکعب)</th>${mix.parts.map((x) => `<td>${fa(x.volumeM3, 2)}</td>`).join('')}<td>${fa(mix.volumeM3, 2)}</td></tr></table>`
  const kv = (rows: [string, string][]) => `<table>${rows.map(([a, b]) => `<tr><th>${e(a)}</th><td>${e(b)}</td></tr>`).join('')}</table>`
  const verdictP = (k: FormKind) => { const f = forms.find((x) => x.kind === k); const cc = computeForm(k, f?.data ?? {}, ctx); return `<p class="v v-${f ? (cc.extend ? 'pending' : cc.result) : 'pending'}"><b>نتیجه:</b> ${e(cc.why)}</p>${f?.data.note ? `<p>توضیحات: ${e(f.data.note)}</p>` : ''}` }
  const endpoints = (d: FormData) => { const ep = (x: 'send' | 'recv') => [nv(d[`${x}Km`], 3), e(d[`${x}Loc`]), e(d[`${x}Weld`]), dt(d[`${x}At`])]; const s1 = ep('send'), r1 = ep('recv')
    return `<table><tr><th></th><th>ارسال</th><th>دریافت</th></tr>${['کیلومتر', 'محل / موقعیت', 'شمارهٔ سرجوش', 'تاریخ و ساعت'].map((t, i) => `<tr><th>${t}</th><td>${s1[i]}</td><td>${r1[i]}</td></tr>`).join('')}</table>` }
  const pages: string[] = []
  const want = (k: FormKind | 'profile') => !only || only === k

  // 5-1 — the section's longitudinal profile
  if (want('profile')) {
    const pts = profile.filter((x) => x.km >= sec.kmFrom - 1e-9 && x.km <= sec.kmTo + 1e-9)
    const step = Math.max(1, Math.ceil(pts.length / 14)), pick = pts.filter((_, i) => i % step === 0 || i === pts.length - 1)
    let nat = 0
    const tab = pick.map((x, i) => { if (i) nat += Math.hypot((x.km - pick[i - 1].km) * 1000, x.elev - pick[i - 1].elev); return { ...x, nat } })
    const W = 760, H = 170, eMin = Math.min(...pts.map((x) => x.elev), sec.elevMin), eMax = Math.max(...pts.map((x) => x.elev), sec.elevMax)
    const X = (km: number) => 30 + ((km - sec.kmFrom) / Math.max(1e-6, sec.kmTo - sec.kmFrom)) * (W - 40), Y = (el: number) => H - 20 - ((el - eMin) / Math.max(1, eMax - eMin)) * (H - 40)
    const svg = pts.length > 1 ? `<svg viewBox="0 0 ${W} ${H}" width="100%" style="border:1px solid #94a3b8;border-radius:4px"><polyline fill="none" stroke="#0f172a" stroke-width="1.6" points="${pts.map((x) => `${X(x.km).toFixed(1)},${Y(x.elev).toFixed(1)}`).join(' ')}"/>
      <circle cx="${X(sec.elevMinKm)}" cy="${Y(sec.elevMin)}" r="4" fill="#dc2626"/><circle cx="${X(sec.elevMaxKm)}" cy="${Y(sec.elevMax)}" r="4" fill="#16a34a"/>
      <text x="${X(sec.elevMinKm) + 6}" y="${Y(sec.elevMin) + 4}" font-size="10">LP ${fa(sec.elevMin)} m</text><text x="${X(sec.elevMaxKm) + 6}" y="${Y(sec.elevMax) - 4}" font-size="10">HP ${fa(sec.elevMax)} m</text>
      <text x="30" y="${H - 4}" font-size="10">km ${fa(sec.kmFrom, 3)}</text><text x="${W - 90}" y="${H - 4}" font-size="10">km ${fa(sec.kmTo, 3)}</text></svg>` : '<p>پروفیل ارتفاعی قطعه در دسترس نیست.</p>'
    pages.push(`<section>${head('فرم ۵-۱', `نیمرخ طولی قطعهٔ مورد آزمایش به شمارهٔ ${e(sec.code)}`, null)}
      <table><tr><th>SECTION NO.</th><td>${e(sec.code)}</td><th>GRADE — API 5L</th><td>${e(fig.material)}</td><th>روش</th><td>${SEAM_FA[igs.seam]}</td></tr></table>
      <table><tr><th>WALL THICKNESS — LENGTH</th>${mix.parts.map((x) => `<td>${fa(x.wtIn, 3)}″ = ${fa(x.lengthM, 2)} m</td>`).join('')}</tr></table>
      <table><tr><th>HP — فشار نقطهٔ بالا</th><td>${fa(pr.strength.high, 1)} psi</td><th>LP — فشار نقطهٔ پایین</th><td>${fa(pr.strength.low, 1)} psi</td><th>P — فشار کابین</th><td>${fa(pr.strength.head, 1)} psi</td></tr>
        <tr><th>فشار نشتی (پایین / بالا / کابین)</th><td colspan="5">${fa(pr.leak.low, 1)} / ${fa(pr.leak.high, 1)} / ${fa(pr.leak.head, 1)} psi — اختلاف ارتفاع ${fa(pr.dh)} m از ${fa(pr.allowedDh)} m مجاز</td></tr></table>
      ${svg}
      <table><tr><th>کیلومتر</th>${tab.map((x) => `<td>${fa(x.km, 3)}</td>`).join('')}</tr><tr><th>نقاط ارتفاعی (m)</th>${tab.map((x) => `<td>${fa(x.elev, 2)}</td>`).join('')}</tr><tr><th>طول طبیعی (m)</th>${tab.map((x) => `<td>${fa(x.nat, 0)}</td>`).join('')}</tr>
        <tr><th>شمارهٔ سرجوش</th>${tab.map((_, i) => `<td>${i === 0 ? e(sec.weldFrom) : i === tab.length - 1 ? e(sec.weldTo) : ''}</td>`).join('')}</tr></table>
      ${wallTable}${sign(SIG4)}</section>`)
  }
  for (const k of FORM_ORDER) {
    if (!want(k)) continue
    const f = forms.find((x) => x.kind === k)
    if (only == null && !f) continue
    const d = f?.data ?? {}
    const cc = computeForm(k, d, ctx)
    if (k === 'permit') {
      pages.push(`<section>${head('', 'صورتجلسهٔ مجوز شروع آزمایشات هیدرواستاتیک', f?.at ?? null)}${secRow}
        <p>با توجه به انجام و تأیید کلیهٔ عملیات اجرایی شامل ${PERMIT_ITEMS.map((t, i) => `${box(d[`c${i}`] === true)} ${t}`).join('، ')}، قطعهٔ مزبور آمادهٔ انجام آزمایشات هیدرواستاتیک است. از زمان شروع آزمایشات، مسئولیت انجام هرگونه عملیات اجرایی که نیازمند انجام مجدد آزمایشات گردد به عهدهٔ پیمانکار است.</p>
        <h4>آنالیز آب مصرفی${p.waterSource ? ` — منبع: ${e(p.waterSource)}` : ''}</h4>${kv(cc.rows.slice(1))}${verdictP(k)}${sign(SIG_PERMIT)}</section>`)
    } else if (k === 'gauge') {
      pages.push(`<section>${head('فرم ۵-۲', 'صورتجلسهٔ ارسال صفحهٔ اندازه', f?.at ?? null)}
        <table><tr><th>شمارهٔ قطعه</th><td>${e(sec.code)}</td><th>قطر لوله (inch)</th><td>${fa(fig.odIn, 0)}</td><th>جنس لوله</th><td>${e(fig.material)}</td></tr></table>${wallTable}
        <table><tr><th rowspan="2">مشخصات صفحهٔ اندازه</th><th>جنس</th><th>ضخامت (mm)</th><th>قطر (mm)</th></tr><tr><td>${plate.material}</td><td>${fa(plate.mm, 0)}</td><td>${fa(mix.gaugePlateMm, 2)}</td></tr></table>
        ${endpoints(d)}
        <p>${box(d.condition === 'ok')} نظر به اینکه صفحهٔ اندازه به‌طور سالم دریافت گردید، لذا سلامت لوله از نظر لهیدگی (OVAL, DENT) در قطعهٔ فوق مورد تأیید می‌باشد.</p>
        <p>${box(d.condition === 'damaged')} نظر به اینکه صفحهٔ اندازه به‌طور سالم دریافت نگردید، لذا سلامت لوله از نظر لهیدگی (OVAL, DENT) در قطعهٔ فوق مورد تأیید نمی‌باشد.</p>
        ${d.note ? `<p>توضیحات: ${e(d.note)}</p>` : ''}${sign(SIG_REP)}</section>`)
    } else if (k === 'air') {
      const body = igs.seam === 'HFW'
        ? `<table><tr><th>قطر خارجی لوله D</th><td>${fa(fig.odIn, 0)} inch</td><th rowspan="4">فرمول محاسبه</th><td rowspan="4" dir="ltr" style="text-align:center">ΔP₀ = M × 14.22 / ( V × (X + D / (E × te)) )<br>1/te = (1/Vt) Σ Vi/ti<br>E = 2.11 × 10⁶ kg/cm²</td></tr>
            <tr><th>طول به تفکیک ضخامت</th><td>${mix.parts.map((x) => `${fa(x.wtIn, 3)}″: ${fa(x.lengthM, 1)} m`).join('<br>')}</td></tr><tr><th>طول قطعه</th><td>${fa(mix.lengthM, 2)} m</td></tr><tr><th>حجم قطعه Vt</th><td>${fa(mix.volumeM3, 2)} m³</td></tr>
            <tr><th>فشار خط قبل از برداشت آب P₁</th><td>${nv(d.p1, 1)} psi</td><th rowspan="2">شرط قبولی</th><td rowspan="2">ΔP₁/ΔP₀ ≥ ${fa(igs.airHfwMinSmall, 0)}٪ برای D ≤ ${fa(igs.airSmallMaxIn, 0)}″<br>ΔP₁/ΔP₀ ≥ ${fa(igs.airHfwMinBig, 0)}٪ برای D ≥ ۱۶″</td></tr>
            <tr><th>حجم آب برداشته‌شده M</th><td>${nv(d.m, 3)} m³</td></tr><tr><th>فشار خط بعد از برداشت آب P₂</th><td colspan="3">${nv(d.p2, 1)} psi</td></tr><tr><th>دمای آب خط T</th><td colspan="3">${nv(d.waterC, 1)} °C</td></tr></table>${kv(cc.rows.slice(2))}`
        : `<table><tr><th>ردیف</th><th>فشار (bar)</th><th>حجم آب تزریقی تجمعی (m³)</th></tr>${rowsOf<PvRow>(d, 'pv').map((r, i) => `<tr><td>${fa(i + 1, 0)}</td><td>${nv(r.p, 2)}</td><td>${nv(r.v, 3)}</td></tr>`).join('')}</table>${kv(cc.rows)}`
      pages.push(`<section>${head('فرم ۵-۵', 'جدول ثبت ارقام آزمایش عدم وجود هوا', f?.at ?? null)}${secRow}${body}
        <p>نتیجه: ${box(cc.result === 'pass')} آزمایش عدم وجود هوا مورد تأیید می‌باشد &nbsp;&nbsp; ${box(cc.result === 'fail')} آزمایش عدم وجود هوا مورد تأیید نمی‌باشد</p>${verdictP(k)}${sign(SIG3)}</section>`)
    } else if (k === 'strength') {
      const tab = (rs: RiseRow[], cumulative: boolean) => { const cm = riseCumulative(rs); return `<table><tr><th>تاریخ و ساعت</th><th>فشار خط (psi)</th><th>تغییرات فشار (psi)</th><th>عدد کنتور (m³)</th><th>${cumulative ? 'مقدار آب تزریق‌شده' : 'آب تزریقی / تخلیه'} (m³)</th>${cumulative ? '<th>مجموع آب تزریق‌شده (m³)</th>' : ''}<th>ملاحظات</th></tr>${rs.map((r, i) => { const a = num(r.psi), b = i ? num(rs[i - 1].psi) : null; return `<tr><td>${dt(r.at)}</td><td>${nv(r.psi, 1)}</td><td>${a != null && b != null ? fa(a - b, 1) : '—'}</td><td>${nv(r.meter, 3)}</td><td>${nv(r.vol, 3)}</td>${cumulative ? `<td>${fa(cm[i].cum, 3)}</td>` : ''}<td>${e(r.note)}</td></tr>` }).join('') || '<tr><td colspan="7">ثبت نشده</td></tr>'}</table>` }
      const body = igs.seam === 'HFW' ? kv(cc.rows) : `<h4>جدول تغییرات فشار نسبت به حجم آب تزریقی تا مرحلهٔ رسیدن فشار خط به حد فشار آزمایش مقاومت</h4>${tab(rowsOf<RiseRow>(d, 'rise'), true)}
        <h4>آزمایش ${fa(igs.strengthHoldH, 0)} ساعتهٔ مقاومت</h4>${tab(rowsOf<RiseRow>(d, 'hold'), false)}${kv(cc.rows)}`
      pages.push(`<section>${head('فرم ۵-۴', 'گزارش آزمایش مقاومت', f?.at ?? null)}
        <table><tr><th>شمارهٔ قطعه</th><td>${e(sec.code)}</td><th>از کیلومتر</th><td>${fa(sec.kmFrom, 3)}</td><th>تا کیلومتر</th><td>${fa(sec.kmTo, 3)}</td></tr><tr><th>طول (m)</th><td>${fa(mix.lengthM, 2)}</td><th>حجم آزمایش (m³)</th><td>${fa(mix.volumeM3, 2)}</td><th>روش</th><td>${SEAM_FA[igs.seam]}</td></tr></table>${body}${verdictP(k)}${sign(SIG3)}</section>`)
    } else if (k === 'leak') {
      const log = leakLog(d, ctx.readings)
      const small = fig.odIn <= igs.leakBigDiaIn
      pages.push(`<section>${head('فرم ۵-۳', 'جدول ثبت ارقام آزمایش نشتی', f?.at ?? null)}${secRow}
        <table><tr><th rowspan="2">تاریخ — ساعت</th><th rowspan="2">فشارسنج وزنه‌ای (psi)</th><th rowspan="2">دمای محیط (°C)</th><th colspan="7">درجه حرارت ${small ? 'زمین' : 'سطح لوله'} (°C)</th><th rowspan="2">ملاحظات</th></tr><tr>${LEAK_T.map((_, i) => `<th>T${fa(i + 1, 0)}</th>`).join('')}<th>Tm</th></tr>
        ${log.map((r) => { const t = tmOf(r); return `<tr><td>${dt(r.at)}</td><td>${nv(r.psi, 1)}</td><td>${nv(r.amb, 1)}</td>${LEAK_T.map((tk) => `<td>${nv(r[tk], 3)}</td>`).join('')}<td>${t == null ? '—' : fa(t, 3)}</td><td>${e(r.note)}</td></tr>` }).join('') || '<tr><td colspan="11">ثبت نشده</td></tr>'}</table>${sign(SIG3)}</section>`)
      const formula = small ? 'K = 14.22 (μ − γ) / (X + D/(E·te))<br>ΔP₀ = K·F·(T₁ − T₂)<br>H = ΔF/F × ΔP₀ + 0.2·K·F<br>ΔP = (P₁ − P₂) − ΔP₀<br>E = 2.11 × 10⁶ kg/cm²' : 'ΔPth/ΔT = (δ − 2(1+ν)α) / (D(1−ν²)/(E·t) + 1/B)<br>ΔT = T₁ − T₂, ΔPa = P₁ − P₂<br>E = 2.07 × 10⁶ bar, α = 1.17 × 10⁻⁵'
      const res = small ? `<p>نتیجه: ${box(cc.result === 'pass')} ΔP ≤ H قابل قبول است &nbsp; ${box(!!cc.extend)} ΔP > H تمدید &nbsp; ${box(cc.result === 'fail')} ΔP ≫ H قابل قبول نمی‌باشد</p>`
        : `<p>نتیجه: ${box(cc.result === 'pass')} ΔPa ≤ ΔPth و ΔPa ≤ ${fa(igs.leakMaxPsi, 1)} psi — قابل قبول است &nbsp; ${box(!!cc.extend)} تمدید ۲۴ ساعته &nbsp; ${box(cc.result === 'fail')} قابل قبول نمی‌باشد</p>`
      pages.push(`<section>${head('فرم ۵-۶', 'صورتجلسهٔ آزمایش نشتی', f?.at ?? null)}${secRow}<h4>شرح صورتجلسهٔ آزمایش نشتی</h4>${wallTable}
        <table><tr><td style="width:62%;vertical-align:top;padding:0;border:0">${kv(cc.rows)}</td><td style="vertical-align:top" dir="ltr"><b>فرمول‌های محاسبه</b><br>${formula}</td></tr></table>${res}${verdictP(k)}${sign(SIG_REP)}</section>`)
    } else {
      pages.push(`<section>${head('فرم ۵-۷', 'صورتجلسهٔ تخلیه و خشک‌کنی خط', f?.at ?? null)}
        <table><tr><th>شمارهٔ قطعه</th><td>${e(sec.code)}</td><th>قطر لوله (inch)</th><td>${fa(fig.odIn, 0)}</td><th>جنس لوله</th><td>${e(fig.material)}</td><th>طول لوله (m)</th><td>${fa(mix.lengthM, 2)}</td></tr>
          <tr><th>دمای هوا (°C)</th><td>${nv(d.airC, 1)}</td><th>وضعیت هوا</th><td colspan="5">${box(d.weather === 'sunny')} آفتابی &nbsp; ${box(d.weather === 'cloudy')} ابری &nbsp; ${box(d.weather === 'rainy')} بارانی</td></tr></table>
        ${endpoints(d)}${kv(cc.rows)}${d.n2 === true ? '<p>☑ خط برای توقف طولانی با نیتروژن به فشار ۱ kg/cm² پر شد.</p>' : ''}${verdictP(k)}${sign(SIG_REP)}</section>`)
    }
  }
  const expired = settings.equipment.filter((x) => x.calibExpiry && x.calibExpiry < today)
  const eq = !only && settings.equipment.length ? `<section><h2>تجهیزات و کالیبراسیون</h2><table><tr><th>دستگاه</th><th>دامنه</th><th>دقت</th><th>سریال</th><th>انقضای کالیبراسیون</th></tr>${settings.equipment.map((x) => `<tr><td>${e(x.name)}</td><td>${e(x.range)}</td><td>${e(x.accuracy)}</td><td>${e(x.serial)}</td><td>${x.calibExpiry ? formatJalali(x.calibExpiry) : '—'}${x.calibExpiry && x.calibExpiry < today ? ' (منقضی)' : ''}</td></tr>`).join('')}</table>${expired.length ? `<p class="warn">هشدار: کالیبراسیون ${expired.map((x) => e(x.name + ' ' + x.serial)).join('، ')} منقضی شده است.</p>` : ''}</section>` : ''
  w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>Hydrotest ${e(sec.code)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap">
<style>@page{size:A4;margin:11mm}body{font-family:Vazirmatn,Tahoma,sans-serif;color:#0f172a;font-size:10.5px;margin:0}
section{page-break-after:always;border:1.6px solid #1e293b;border-radius:6px;padding:8px 10px}section:last-of-type{page-break-after:auto}
.fh .org{text-align:center;font-weight:900;font-size:12px}.fh h2{text-align:center;font-size:14px;margin:4px 0 6px}.fh h2 small{font-size:10.5px;color:#475569;font-weight:700}
h2{font-size:13px}h4{font-size:11.5px;margin:8px 0 3px}table{width:100%;border-collapse:collapse;margin:5px 0;font-variant-numeric:tabular-nums}th,td{border:1px solid #94a3b8;padding:3px 5px;text-align:right}th{background:#e2e8f0;font-weight:700}
.hd th{width:16%}.sg{margin-top:10px}.sg td{text-align:center;font-weight:700;background:#f8fafc}.sg td small{font-weight:400;color:#64748b}.sg .sp td{height:46px;background:#fff}
.v{padding:4px 8px;border-radius:4px;border:1px solid}.v-pass{border-color:#16a34a;color:#166534}.v-fail{border-color:#dc2626;color:#991b1b}.v-pending{border-color:#94a3b8;color:#334155}.warn{color:#b91c1c;font-weight:700}p{line-height:1.9;margin:4px 0}</style></head><body>
${pages.join('') || '<p>صورتجلسه‌ای ثبت نشده است.</p>'}${eq}
<script>document.fonts&&document.fonts.ready.then(()=>setTimeout(()=>print(),250))</script></body></html>`)
  w.document.close()
}
