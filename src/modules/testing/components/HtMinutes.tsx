import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { CheckCircle2, ClipboardSignature, FileText, Plus, Printer, Trash2, XCircle, Clock } from 'lucide-react'
import { ShamsiDate, ShamsiDateTime } from '../../../components/common/ShamsiField'
import { useAuthStore } from '../../../store/useAuthStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { formatJalali } from '../../../lib/jalali'
import { todayTehran } from '../../../lib/today'
import { useTestingStore } from '../store/useTestingStore'
import { PSI_PER_BAR, sectionIgs, smysPsiOf, type WallPart } from '../lib/igs'
import { computeForm, FORM_FA, FORM_ORDER, PERMIT_ITEMS, phaseReadings, type Ctx, type FormData } from '../lib/minutes'
import type { FormKind, HtForm, HtSection } from '../repo'

const fa = (v: number, d = 2) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const RES_UI: Record<HtForm['result'], { label: string; color: string }> = { pass: { label: 'قبول', color: '#22c55e' }, fail: { label: 'مردود', color: '#ef4444' }, pending: { label: 'در انتظار', color: '#94a3b8' } }
const CSS = `.mn{display:grid;gap:.8rem}.mn-tabs{display:flex;gap:.4rem;flex-wrap:wrap}
.mn-tab{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .75rem;border-radius:.8rem;border:1px solid var(--border-soft);font-size:12px;font-weight:800;color:var(--text-secondary);background:transparent;cursor:pointer;transition:transform .14s ease-out}
.mn-tab:active{transform:scale(.97)}.mn-tab i{width:.55rem;height:.55rem;border-radius:99px;background:var(--c)}.mn-tab[aria-pressed=true]{border-color:var(--c);color:var(--text-primary);background:color-mix(in srgb,var(--c) 12%,transparent)}
.mn-calc{display:grid;gap:.25rem;padding:.7rem .85rem;border-radius:.9rem;background:color-mix(in srgb,var(--text-primary) 4%,transparent);font-size:12px}
.mn-calc div{display:flex;justify-content:space-between;gap:1rem}.mn-calc div span{color:var(--text-muted)}.mn-calc div b{font-variant-numeric:tabular-nums;text-align:left}
.mn-verdict{display:flex;align-items:center;gap:.5rem;padding:.6rem .85rem;border-radius:.9rem;border:1px solid color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 10%,transparent);font-size:12.5px;font-weight:700}
.mn-verdict b{color:var(--c)}.mn-radio{display:flex;gap:.8rem;flex-wrap:wrap;font-size:12.5px}.mn-radio label{display:flex;align-items:center;gap:.3rem}
.mn-checks{display:grid;gap:.35rem;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));font-size:12.5px}.mn-checks label{display:flex;gap:.4rem;align-items:center}
.mn-walls td input{width:100%;min-width:5rem}.mn-pt{display:grid;gap:.5rem;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))}`

/** a section's IGS figures (null for no section, e.g. a station package, or when the pipe grade is unknown) */
export function useSectionIgs(sec: HtSection | null) {
  const st = useTestingStore()
  const igs = st.igs()
  return useMemo(() => {
    const pipe = st.pipe
    const smys = st.settings.smysOverride ? st.settings.smysOverride * 145.038 : pipe ? smysPsiOf(pipe.material) : null
    if (!pipe || !smys || !sec) return null
    const r = sectionIgs({ odIn: pipe.diameterIn, smysPsi: smys, defaultWallIn: pipe.wallMm / 25.4, lengthM: (sec.kmTo - sec.kmFrom) * 1000, wallMix: sec.wallMix,
      elev: { low: sec.elevMin, high: sec.elevMax, start: sec.elevStart, end: sec.elevEnd, head: sec.headElev } }, igs)
    return r ? { ...r, igs, odIn: pipe.diameterIn, smys, material: pipe.material } : null
  }, [st.pipe, st.settings.smysOverride, sec, igs])
}

/** The section's specification (form 1) and its six minutes. */
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
  return (
    <div className="mn"><style>{CSS}</style>
      <SectionSpec sec={sec} fig={fig} />
      <section className="ps-card">
        <header className="ps-card-head"><b><ClipboardSignature size={15} /> صورتجلسه‌های آزمون</b>
          <button type="button" className="ps-btn" onClick={() => printSection(sec, fig, ctx, forms, st.settings, project?.officialName ?? '')}><Printer size={14} /> چاپ همهٔ صورتجلسه‌ها</button></header>
        <div className="mn-tabs" role="group" aria-label="صورتجلسه">
          {FORM_ORDER.map((k) => { const r = forms.find((f) => f.kind === k)?.result ?? 'pending'; return <button key={k} type="button" className="mn-tab" aria-pressed={kind === k} style={{ '--c': forms.some((f) => f.kind === k) ? RES_UI[r].color : '#64748b' } as CSSProperties} onClick={() => setKind(k)}><i />{FORM_FA[k].split(' (')[0]}</button> })}
        </div>
        <FormEditor key={kind + (forms.find((f) => f.kind === kind)?.updatedAt ?? '')} kind={kind} sec={sec} ctx={ctx} form={forms.find((f) => f.kind === kind) ?? null}
          onSave={(data, at) => { const c = computeForm(kind, data, ctx); return st.saveForm('section', sec.id, { kind, data, result: c.result, at }, email) }} />
      </section>
    </div>
  )
}

type Fig = NonNullable<ReturnType<typeof useSectionIgs>>
function SectionSpec({ sec, fig }: { sec: HtSection; fig: Fig }) {
  const st = useTestingStore()
  const [walls, setWalls] = useState<WallPart[]>(sec.wallMix ?? fig.mix.parts.map((p) => ({ wtIn: Math.round(p.wtIn * 1000) / 1000, lengthM: Math.round(p.lengthM * 100) / 100 })))
  const r2 = (v: number) => String(Math.round(v * 100) / 100)
  const [w, setW] = useState({ from: sec.weldFrom, to: sec.weldTo, start: r2(sec.elevStart), end: r2(sec.elevEnd), head: r2(sec.headElev) })
  const { mix, pr, igs } = fig
  const lenM = (sec.kmTo - sec.kmFrom) * 1000
  const sumL = walls.reduce((s, x) => s + (Number(x.lengthM) || 0), 0)
  const save = () => st.patchSection(sec.id, { wallMix: walls.filter((x) => x.wtIn > 0 && x.lengthM > 0), weldFrom: w.from, weldTo: w.to, elevStart: Number(w.start), elevEnd: Number(w.end), headElev: Number(w.head) })
  const P = (k: string, s: number, l: number) => <tr><td>{k}</td><td>{fa(s, 2)}</td><td>{fa(l, 2)}</td></tr>
  return (
    <section className="ps-card">
      <header className="ps-card-head"><b><FileText size={15} /> مشخصات قطعه (فرم ۱)</b><small className="ps-meta">{fig.material} · Ø{fa(fig.odIn, 0)}″ · SMYS {fa(fig.smys, 0)} psi{fig.fromTwin ? ' · ضخامت از دوقلوی دیجیتال' : ''}</small></header>
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
        <div className="ht-fig"><small>صفحهٔ اندازه</small><b>{fa(mix.gaugePlateMm, 2)} mm</b><span>{fa(igs.gaugePlatePct, 0)}٪ قطر داخلی ضخیم‌ترین لوله ({fa(mix.thickIn, 3)}″) · {fa(igs.gaugePlateMm, 0)} mm فولاد</span></div>
        <div className="ht-fig"><small>کمترین ضخامت (مبنای فشار)</small><b>{fa(mix.thinIn, 3)}″</b><span>{fa(igs.strengthPct, 0)}٪ SMYS = {fa(pr.pTop, 1)} psi</span></div>
      </div>
      <div className="ps-table-wrap"><table className="ps-table">
        <thead><tr><th>نقطه</th><th>آزمون مقاومت (psi)</th><th>آزمون نشتی (psi)</th></tr></thead>
        <tbody>{P(`پایین (${fa(sec.elevMin, 2)} m)`, pr.strength.low, pr.leak.low)}{P(`بالا (${fa(sec.elevMax, 2)} m)`, pr.strength.high, pr.leak.high)}{P('ابتدا', pr.strength.start, pr.leak.start)}{P('انتها', pr.strength.end, pr.leak.end)}{P('کابین', pr.strength.head, pr.leak.head)}</tbody>
      </table></div>
      <div className="ps-actions"><button type="button" className="ps-btn is-primary" onClick={() => void save()}><CheckCircle2 size={14} /> ذخیرهٔ مشخصات قطعه</button></div>
    </section>
  )
}

function FormEditor({ kind, ctx, form, onSave }: { kind: FormKind; sec: HtSection; ctx: Ctx; form: HtForm | null; onSave: (d: FormData, at: string | null) => Promise<boolean> }) {
  const [d, setD] = useState<FormData>(form?.data ?? {})
  const [at, setAt] = useState<string>(form?.at ?? todayTehran())
  const c = computeForm(kind, d, ctx)
  const ui = RES_UI[c.result]
  const v = (k: string) => (d[k] == null ? '' : String(d[k]))
  const set = (k: string) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value })
  const N = ({ k, label, ph, step = 0.01 }: { k: string; label: string; ph?: string; step?: number }) => <label className="ps-field"><span>{label}</span><input type="number" step={step} value={v(k)} onChange={set(k)} placeholder={ph} dir="ltr" /></label>
  const R = ({ k, label, opts }: { k: string; label: string; opts: [string, string][] }) => <div className="ps-field"><span>{label}</span><div className="mn-radio">{opts.map(([val, l]) => <label key={val}><input type="radio" name={k} checked={d[k] === val} onChange={() => setD({ ...d, [k]: val })} />{l}</label>)}</div></div>
  const DT = ({ k, label }: { k: string; label: string }) => <div className="ps-field"><span>{label}</span><ShamsiDateTime value={v(k)} onChange={(x) => setD({ ...d, [k]: x })} label={label} /></div>
  const auto = (phase: string, which: 'first' | 'last', what: 'p' | 't') => { const rs = phaseReadings(ctx.readings, phase); const r = which === 'first' ? rs[0] : rs[rs.length - 1]; return r ? (what === 'p' ? fa(r.pressureBar * PSI_PER_BAR, 1) : r.tempC != null ? fa(r.tempC, 2) : '') : '' }
  let body: ReactNode
  if (kind === 'permit') body = <div className="mn-checks">{PERMIT_ITEMS.map((t, i) => <label key={t}><input type="checkbox" checked={d[`c${i}`] === true} onChange={(e) => setD({ ...d, [`c${i}`]: e.target.checked })} />{t}</label>)}</div>
  else if (kind === 'gauge') body = <div className="ps-grid">{DT({ k: "sentAt", label: "تاریخ و ساعت ارسال" })}{DT({ k: "receivedAt", label: "تاریخ و ساعت دریافت" })}{R({ k: "condition", label: "وضعیت صفحهٔ دریافتی", opts: [['ok', 'سالم'], ['damaged', 'آسیب‌دیده']] })}</div>
  else if (kind === 'air') body = <div className="ps-grid">{N({ k: "dpPsi", label: "افزایش فشار خط ΔP (psi)" })}{N({ k: "dvActual", label: "حجم آب تزریق‌شده ΔV واقعی (m³)", step: 0.001 })}{N({ k: "waterC", label: "دمای آب (°C)" })}{N({ k: "bulkBar", label: "مدول حجمی آب K (bar)", ph: String(ctx.igs.bulkBar), step: 1 })}{N({ k: "dvTheorManual", label: "ΔV محاسبه‌ای از برگهٔ پیمانکار (اختیاری)", step: 0.001 })}</div>
  else if (kind === 'strength') body = <div className="ps-grid">{R({ k: "method", label: "روش", opts: [['yield', `الف) ${fa(ctx.igs.strengthPct, 0)}٪ تسلیمی`], ['cyclic', 'ب) سیکلی']] })}{N({ k: "finalPsi", label: "فشار نهایی در کابین (psi)", ph: auto('strength', 'last', 'p') })}{N({ k: "holdH", label: "مدت نگهداری (ساعت)", ph: "از قرائت‌ها", step: 0.1 })}{R({ k: "noRupture", label: "پارگی یا نشتی", opts: [['yes', 'مشاهده نشد'], ['no', 'مشاهده شد']] })}</div>
  else if (kind === 'leak') body = <div className="ps-grid">{N({ k: "p1", label: "فشار شروع P₁ (psi)", ph: auto('leak', 'first', 'p') })}{N({ k: "p2", label: "فشار پایان P₂ (psi)", ph: auto('leak', 'last', 'p') })}{N({ k: "t1", label: "دمای شروع (°C)", ph: auto('leak', 'first', 't'), step: 0.001 })}{N({ k: "t2", label: "دمای پایان (°C)", ph: auto('leak', 'last', 't'), step: 0.001 })}{N({ k: "holdH", label: "مدت آزمون (ساعت)", ph: "از قرائت‌ها", step: 0.1 })}<label className="ps-field"><span>دورهٔ یکنواختی کوتاه‌تر</span><label style={{ display: 'flex', gap: '.35rem', alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={d.stabWaived === true} onChange={(e) => setD({ ...d, stabWaived: e.target.checked })} />با نظر نمایندهٔ کارفرما</label></label></div>
  else body = <div className="ps-grid">{DT({ k: "pigAt", label: "زمان دریافت آخرین پیگ" })}{R({ k: "waterAhead", label: "آب جلوی پیگ", opts: [['no', 'دیده نشد'], ['yes', 'دیده شد']] })}{R({ k: "dust", label: "گرد و زنگ در هوای خروجی", opts: [['no', 'ندارد'], ['yes', 'دارد']] })}{N({ k: "dewC", label: "نقطهٔ شبنم داخل لوله (°C)" })}{N({ k: "ambientC", label: "دمای محیط (°C)" })}</div>
  return (
    <div className="mn">
      <b style={{ fontSize: 13.5 }}>{FORM_FA[kind]}</b>
      <div className="ps-grid"><div className="ps-field"><span>تاریخ صورتجلسه</span><ShamsiDate value={at} onChange={setAt} label="تاریخ صورتجلسه" /></div></div>
      {body}
      <label className="ps-field is-wide"><span>توضیحات</span><input value={v('note')} onChange={set('note')} /></label>
      {c.rows.length > 0 && <div className="mn-calc">{c.rows.map(([k, x]) => <div key={k}><span>{k}</span><b>{x}</b></div>)}</div>}
      <div className="mn-verdict" style={{ '--c': ui.color } as CSSProperties}>{c.result === 'pass' ? <CheckCircle2 size={16} color={ui.color} /> : c.result === 'fail' ? <XCircle size={16} color={ui.color} /> : <Clock size={16} color={ui.color} />}<b>{ui.label}</b> — {c.why}</div>
      <div className="ps-actions"><button type="button" className="ps-btn is-primary" onClick={() => void onSave(d, at || null)}><CheckCircle2 size={14} /> ذخیرهٔ صورتجلسه</button>{form && <small className="ps-meta">آخرین ثبت: {form.by} · {formatJalali(form.updatedAt.slice(0, 10))}</small>}</div>
    </div>
  )
}

// ── print: the section's file (spec sheet + every minute), signature rows for the four parties ──────────────
function printSection(sec: HtSection, fig: Fig, ctx: Ctx, forms: HtForm[], settings: ReturnType<typeof useTestingStore.getState>['settings'], projectName: string) {
  const w = window.open('', '_blank', 'width=1000,height=1200'); if (!w) return
  const e = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const p = settings.parties, { mix, pr, igs } = fig
  const today = todayTehran()
  const expired = settings.equipment.filter((x) => x.calibExpiry && x.calibExpiry < today)
  const sign = `<table class="sg"><tr><td>نمایندهٔ پیمانکار</td><td>نمایندهٔ مشاور</td><td>نمایندهٔ کارفرما</td><td>نمایندهٔ امور بازرسی فنی</td></tr><tr class="sp"><td></td><td></td><td></td><td></td></tr></table>`
  const head = `<table><tr><th>پروژه</th><td>${e(projectName)}</td><th>کارفرما / طرح</th><td>${e(p.employer)}</td></tr><tr><th>پیمانکار</th><td>${e(p.contractor)}</td><th>مشاور</th><td>${e(p.consultant)}</td></tr>
    <tr><th>قطعه</th><td>${e(sec.code)}</td><th>شمارهٔ پیمان</th><td>${e(p.contractNo)}</td></tr><tr><th>از کیلومتر / سرجوش</th><td>${fa(sec.kmFrom, 3)} — ${e(sec.weldFrom)}</td><th>تا کیلومتر / سرجوش</th><td>${fa(sec.kmTo, 3)} — ${e(sec.weldTo)}</td></tr>
    <tr><th>لوله</th><td>Ø${fa(fig.odIn, 0)}″ ${e(fig.material)}</td><th>دستورالعمل</th><td>${e(p.procedureRef)} ${e(p.procedureRev)}</td></tr></table>`
  const walls = `<table><tr><th>ضخامت (اینچ)</th><th>طول (متر)</th><th>حجم (m³)</th></tr>${mix.parts.map((x) => `<tr><td>${fa(x.wtIn, 3)}</td><td>${fa(x.lengthM, 2)}</td><td>${fa(x.volumeM3, 2)}</td></tr>`).join('')}<tr><th>جمع</th><th>${fa(mix.lengthM, 2)}</th><th>${fa(mix.volumeM3, 2)}</th></tr></table>
    <table><tr><th></th><th>پایین</th><th>بالا</th><th>ابتدا</th><th>انتها</th><th>کابین</th></tr><tr><th>ارتفاع (m)</th><td>${fa(sec.elevMin)}</td><td>${fa(sec.elevMax)}</td><td>${fa(sec.elevStart)}</td><td>${fa(sec.elevEnd)}</td><td>${fa(sec.headElev)}</td></tr>
    <tr><th>فشار آزمون مقاومت (psi)</th><td>${fa(pr.strength.low, 1)}</td><td>${fa(pr.strength.high, 1)}</td><td>${fa(pr.strength.start, 1)}</td><td>${fa(pr.strength.end, 1)}</td><td>${fa(pr.strength.head, 1)}</td></tr>
    <tr><th>فشار آزمون نشتی (psi)</th><td>${fa(pr.leak.low, 1)}</td><td>${fa(pr.leak.high, 1)}</td><td>${fa(pr.leak.start, 1)}</td><td>${fa(pr.leak.end, 1)}</td><td>${fa(pr.leak.head, 1)}</td></tr></table>
    <p>اختلاف ارتفاع قطعه ${fa(pr.dh)} متر؛ اختلاف ارتفاع مجاز ${fa(pr.allowedDh)} متر (${fa(igs.strengthPct, 0)}٪ و ${fa(igs.minHighPct, 0)}٪ SMYS، ${fa(igs.psiPerM)} psi بر متر). ضخامت معادل ${fa(mix.tEqIn, 4)} اینچ. صفحهٔ اندازه ${fa(mix.gaugePlateMm)} میلی‌متر، ${fa(igs.gaugePlateMm, 0)} میلی‌متر فولاد.</p>`
  const blocks = FORM_ORDER.map((k) => {
    const f = forms.find((x) => x.kind === k)
    const c = computeForm(k, f?.data ?? {}, ctx)
    const res = f ? RES_UI[c.result].label : 'ثبت نشده'
    const note = f?.data.note ? `<p>توضیحات: ${e(String(f.data.note))}</p>` : ''
    const extra = k === 'permit' ? `<p>با توجه به انجام و تأیید کلیهٔ عملیات اجرایی شامل ${PERMIT_ITEMS.join('، ')}، قطعهٔ مزبور آمادهٔ انجام آزمایشات هیدرواستاتیک است. از زمان شروع آزمایشات، مسئولیت انجام هرگونه عملیات اجرایی که نیازمند انجام مجدد آزمایشات گردد به عهدهٔ پیمانکار است.</p>`
      : k === 'gauge' && f ? `<p>تاریخ ارسال: ${f.data.sentAt ? formatJalali(String(f.data.sentAt).slice(0, 10)) + ' ' + String(f.data.sentAt).slice(11, 16) : '—'} · تاریخ دریافت: ${f.data.receivedAt ? formatJalali(String(f.data.receivedAt).slice(0, 10)) + ' ' + String(f.data.receivedAt).slice(11, 16) : '—'}</p>` : ''
    return `<section><h3>${FORM_FA[k]} <span class="r r-${f ? c.result : "pending"}">${res}</span></h3>${f?.at ? `<p class="m">تاریخ: ${formatJalali(f.at)}</p>` : ''}${extra}
      ${c.rows.length ? `<table>${c.rows.map(([a, b]) => `<tr><th>${e(a)}</th><td>${e(b)}</td></tr>`).join('')}</table>` : ''}<p><b>نتیجه:</b> ${e(c.why)}</p>${note}${sign}</section>`
  }).join('')
  const eq = settings.equipment.length ? `<table><tr><th>دستگاه</th><th>دامنه</th><th>دقت</th><th>سریال</th><th>انقضای کالیبراسیون</th></tr>${settings.equipment.map((x) => `<tr><td>${e(x.name)}</td><td>${e(x.range)}</td><td>${e(x.accuracy)}</td><td>${e(x.serial)}</td><td>${x.calibExpiry ? formatJalali(x.calibExpiry) : '—'}${x.calibExpiry && x.calibExpiry < today ? ' (منقضی)' : ''}</td></tr>`).join('')}</table>` : ''
  w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>Hydrotest ${e(sec.code)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;700;900&display=swap">
<style>@page{size:A4;margin:12mm}body{font-family:Vazirmatn,Tahoma,sans-serif;color:#0f172a;font-size:11px;margin:0}h1{font-size:16px;margin:0 0 4px}h2{font-size:13px;margin:14px 0 6px;border-bottom:2px solid #0f172a;padding-bottom:3px}
h3{font-size:12.5px;margin:0 0 6px;display:flex;justify-content:space-between}table{width:100%;border-collapse:collapse;margin:6px 0;font-variant-numeric:tabular-nums}th,td{border:1px solid #94a3b8;padding:4px 6px;text-align:right}th{background:#e2e8f0}
section{border:1.5px solid #334155;border-radius:6px;padding:8px 10px;margin:10px 0;page-break-inside:avoid}.m{color:#475569;margin:0 0 4px}.r{font-size:11px;padding:1px 8px;border-radius:99px;border:1px solid}.r-pass{color:#15803d}.r-fail{color:#b91c1c}.r-pending{color:#64748b}
.sg td{text-align:center;font-weight:700;background:#f8fafc}.sg .sp td{height:42px;background:#fff}.warn{color:#b91c1c;font-weight:700}p{line-height:1.9;margin:4px 0}</style></head><body>
<h1>مشخصات و مستندات مراحل تست هیدرواستاتیک — قطعهٔ ${e(sec.code)}</h1>${head}
<h2>صفحهٔ ۱ — مشخصات قطعه و فشارهای آزمون</h2>${walls}${eq}${expired.length ? `<p class="warn">هشدار: کالیبراسیون ${expired.map((x) => e(x.name + ' ' + x.serial)).join('، ')} منقضی شده است.</p>` : ''}
<h2>صفحهٔ ۲ — صورتجلسه‌ها</h2>${blocks}<p style="color:#475569">کلیهٔ واحدهای حجم متر مکعب و فشار psi است.</p>
<script>document.fonts&&document.fonts.ready.then(()=>setTimeout(()=>print(),200))</script></body></html>`)
  w.document.close()
}
