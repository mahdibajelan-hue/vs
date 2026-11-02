import { useState, type CSSProperties } from 'react'
import { BookOpenCheck, CheckCircle2, ClipboardList, Droplets, FlaskConical, Gauge, Plus, ScanLine, ShieldCheck, Thermometer, Trash2, Wind, Wrench, Factory, Ruler } from 'lucide-react'
import { ShamsiDate } from '../../../components/common/ShamsiField'
import { useAuthStore } from '../../../store/useAuthStore'
import { useTestingStore } from '../store/useTestingStore'
import { DEFAULT_IGS, IGS_PROCEDURE, igsOf, SEAM_FA, smysPsiOf, testLimits, PSI_PER_BAR, type IgsParams, type Seam } from '../lib/igs'
import { EMPTY_PARTIES, type HtEquip, type HtParties } from '../repo'
import { todayTehran } from '../../../lib/today'
import { formatJalali } from '../../../lib/jalali'

const fa = (v: number, d = 2) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const STEP_UI: Record<string, { icon: typeof Gauge; color: string }> = {
  basis: { icon: Ruler, color: '#6366f1' }, permit: { icon: ClipboardList, color: '#64748b' }, cleaning: { icon: ScanLine, color: '#a78bfa' }, filling: { icon: Droplets, color: '#38bdf8' },
  air: { icon: Wind, color: '#06b6d4' }, strength: { icon: Gauge, color: '#f59e0b' }, stabilization: { icon: Thermometer, color: '#14b8a6' }, leak: { icon: FlaskConical, color: '#f97316' },
  drying: { icon: Wind, color: '#84cc16' }, stations: { icon: Factory, color: '#0ea5e9' },
}
/** the parameters, grouped as the procedure groups them */
const GROUPS: { title: string; seam?: Seam; fields: { k: keyof IgsParams; label: string; unit?: string; step?: number; nullable?: string }[] }[] = [
  { title: 'روش تسلیمی (DSAW) — قطعه‌بندی، مقاومت و نشتی', seam: 'SAW', fields: [
    { k: 'strengthPct', label: 'فشار نقطهٔ پایین در آزمون مقاومت', unit: '٪ SMYS' }, { k: 'minHighPct', label: 'حداقل فشار نقطهٔ بالا', unit: '٪ SMYS' },
    { k: 'leakPct', label: 'فشار نقطهٔ پایین در آزمون نشتی', unit: '٪ SMYS' }, { k: 'leakMinPct', label: 'حداقل فشار نقطهٔ بالا در نشتی', unit: '٪ SMYS' },
    { k: 'strengthHoldH', label: 'مدت نگهداری فشار مقاومت', unit: 'ساعت' }, { k: 'holdAdjustBar', label: 'تغییر فشار مجاز پیش از جبران', unit: 'bar', step: 0.1 },
    { k: 'pvOffsetPct', label: 'خط Offset نمودار P–V', unit: '٪ حجم', step: 0.01 }, { k: 'slopeChangeMax', label: 'حداکثر تغییر شیب نمودار', unit: 'برابر', step: 0.1 },
  ] },
  { title: 'روش سیکلی (HFW) — قطعه‌بندی و مقاومت', seam: 'HFW', fields: [
    { k: 'cyclicSmysPct', label: 'سقف فشار نقطهٔ پایین', unit: '٪ SMYS' }, { k: 'cyclicDpFactor', label: 'سقف فشار نقطهٔ پایین', unit: '× فشار طراحی', step: 0.05 },
    { k: 'cyclicHighDpFactor', label: 'حداقل فشار نقطهٔ بالا', unit: '× فشار طراحی', step: 0.05 }, { k: 'cyclicHoldMin', label: 'نگهداری هر سیکل', unit: 'دقیقه' }, { k: 'cyclicCycles', label: 'تعداد سیکل' },
  ] },
  { title: 'عمومی', fields: [
    { k: 'psiPerM', label: 'فشار ستون آب', unit: 'psi/m', step: 0.001 }, { k: 'maxSectionKm', label: 'حداکثر طول قطعه', unit: 'km' },
    { k: 'stabilizationDays', label: 'دورهٔ یکنواختی', unit: 'روز', nullable: 'بر اساس قطر' }, { k: 'stabilizationGapH', label: 'حداکثر فاصلهٔ ثبت فشار و دما', unit: 'ساعت' },
    { k: 'leakHoldH', label: 'مدت آزمون نشتی', unit: 'ساعت' }, { k: 'minPipeTempC', label: 'حداقل دمای توصیه‌شدهٔ خط در نشتی', unit: '°C' }, { k: 'minFillTempC', label: 'حداقل دمای آب بدون ضدیخ', unit: '°C' },
  ] },
  { title: 'آزمون نشتی — معیارهای قبولی', fields: [
    { k: 'leakBigDiaIn', label: 'مرز دو روش محاسبه', unit: 'اینچ' }, { k: 'leakMaxPsi', label: 'حداکثر افت فشار (قطر بزرگ)', unit: 'psi', step: 0.1 },
    { k: 'leakFailFactor', label: 'مرز «ΔP ≫ H» (مردود)', unit: '× H', step: 0.1 },
  ] },
  { title: 'عدم وجود هوا، صفحهٔ اندازه و خشک‌کنی', fields: [
    { k: 'airHfwMinSmall', label: 'HFW: حداقل ΔPa/ΔPth تا مرز قطر', unit: '٪' }, { k: 'airHfwMinBig', label: 'HFW: حداقل ΔPa/ΔPth قطرهای بزرگ‌تر', unit: '٪' }, { k: 'airSmallMaxIn', label: 'مرز قطر', unit: 'اینچ' },
    { k: 'airMaxPct', label: 'DSAW: حداکثر هوای موجود', unit: '٪ حجم', step: 0.01 }, { k: 'airRatioMax', label: 'DSAW: حداکثر نسبت شیب واقعی به نظری', step: 0.01 }, { k: 'airPvMaxBar', label: 'DSAW: حداکثر فشار نمودار P/V', unit: 'bar' },
    { k: 'gaugePlatePct', label: 'قطر صفحهٔ اندازه', unit: '٪ قطر داخلی' }, { k: 'gaugePlateMm', label: 'ضخامت صفحهٔ اندازه', unit: 'mm', nullable: 'بر اساس قطر' },
    { k: 'dewPointDiffC', label: 'حداکثر اختلاف نقطهٔ شبنم خروجی با محیط', unit: '°C', step: 0.5 },
  ] },
  { title: 'خواص فولاد و آب', fields: [
    { k: 'eBar', label: 'مدول الاستیسیته (روابط bar)', unit: 'bar', step: 1000 }, { k: 'eKgCm2', label: 'مدول الاستیسیته (روابط kg/cm²)', unit: 'kg/cm²', step: 1000 },
    { k: 'poisson', label: 'ضریب پواسون', step: 0.01 }, { k: 'steelAlpha', label: 'ضریب انبساط طولی فولاد', unit: '1/°C', step: 0.000001 },
    { k: 'bulkBar', label: 'مدول بالک آب', unit: 'bar', nullable: 'از شکل ۲ دستورالعمل' },
  ] },
  { title: 'ایستگاه‌ها و Pre-test', fields: [{ k: 'stationFactor', label: 'ضریب فشار آزمون', unit: '× فشار طراحی', step: 0.05 }, { k: 'stationHoldH', label: 'مدت آزمون', unit: 'ساعت' }] },
]
const PARTY_FIELDS: { k: keyof HtParties; label: string }[] = [
  { k: 'employer', label: 'کارفرما / طرح' }, { k: 'contractor', label: 'پیمانکار' }, { k: 'consultant', label: 'مشاور' }, { k: 'inspection', label: 'امور بازرسی فنی' },
  { k: 'contractNo', label: 'شمارهٔ پیمان' }, { k: 'procedureRef', label: 'دستورالعمل مرجع' }, { k: 'procedureRev', label: 'ویرایش و تاریخ روش آزمون' }, { k: 'waterSource', label: 'منبع آب آزمون' },
]
const CSS = `.pr-steps{display:grid;gap:.6rem;grid-template-columns:repeat(auto-fit,minmax(17rem,1fr))}
.pr-step{position:relative;padding:.75rem .9rem .8rem;border-radius:1rem;border:1px solid color-mix(in srgb,var(--c) 30%,var(--border-soft));background:linear-gradient(160deg,color-mix(in srgb,var(--c) 10%,transparent),transparent 65%)}
.pr-step h4{display:flex;align-items:center;gap:.45rem;margin:0 0 .4rem;font-size:13px;font-weight:900;color:var(--text-primary)}
.pr-step h4 i{display:grid;place-items:center;width:1.7rem;height:1.7rem;border-radius:.6rem;background:var(--c);color:#fff;font-style:normal}
.pr-step h4 em{margin-inline-start:auto;font-style:normal;font-size:10.5px;color:var(--c);font-weight:800}
.pr-step ul{margin:0;padding-inline-start:1rem;display:grid;gap:.25rem;font-size:12px;line-height:1.85;color:var(--text-secondary);list-style:disc}
.pr-fig{display:grid;gap:.5rem;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));margin-top:.6rem}
.pr-grp{border-top:1px dashed var(--border-soft);padding-top:.6rem;margin-top:.6rem}.pr-grp>b{font-size:12.5px;display:block;margin-bottom:.4rem}
.pr-eq td input{width:100%;min-width:6rem}.pr-eq .is-exp{color:#ef4444;font-weight:800}.pr-eq .is-soon{color:#f59e0b;font-weight:800}
.pr-method{display:flex;gap:.5rem;flex-wrap:wrap}.pr-method button{padding:.5rem .8rem;border-radius:.8rem;border:1px solid var(--border-soft);font-size:12.5px;font-weight:800;color:var(--text-secondary);background:transparent;cursor:pointer}
.pr-method button[aria-pressed=true]{border-color:#0ea5e9;background:color-mix(in srgb,#0ea5e9 14%,transparent);color:#0ea5e9}`

/** The project's test method: IGS-C-PL-100(3) summarised and grouped, its parameters, the parties of the minutes and the calibrated instruments. */
export function ProcedureSettings() {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const isAdmin = useAuthStore((s) => !!s.profile?.isAdmin)
  const [p, setP] = useState<IgsParams>(igsOf(st.settings.igs))
  const [method, setMethod] = useState(st.settings.method)
  const [parties, setParties] = useState<HtParties>({ ...EMPTY_PARTIES, ...st.settings.parties })
  const [eq, setEq] = useState<HtEquip[]>(st.settings.equipment)
  const save = () => st.saveSettings({ ...st.settings, method, igs: p, parties, equipment: eq }, email)
  const pipe = st.pipe
  const smys = st.settings.smysOverride ? st.settings.smysOverride * 145.038 : pipe ? smysPsiOf(pipe.material) : null
  const odIn = pipe?.diameterIn ?? 0, wtIn = pipe ? pipe.wallMm / 25.4 : 0
  const lim = pipe && smys ? testLimits(odIn, smys, wtIn, pipe.designPressureBar * PSI_PER_BAR, p) : null
  const today = todayTehran(), soon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10)
  return (
    <div className="ps-stack"><style>{CSS}</style>
      <section className="ps-card">
        <header className="ps-card-head"><b><BookOpenCheck size={15} /> روش آزمایش هیدرواستاتیک</b><small className="ps-meta">{parties.procedureRef || 'IGS-C-PL-100(3)'}{parties.procedureRev ? ` · ${parties.procedureRev}` : ''}</small></header>
        <div className="pr-method" role="group" aria-label="روش محاسبهٔ قطعه‌بندی">
          <button type="button" aria-pressed={method === 'igs'} onClick={() => setMethod('igs')} disabled={!isAdmin}>روش IGS-C-PL-100(3) (پیشنهادی)</button>
          <button type="button" aria-pressed={method === 'factor'} onClick={() => setMethod('factor')} disabled={!isAdmin}>ضریب فشار طراحی (روش قبلی)</button>
        </div>
        {method === 'igs' && <div className="pr-method" role="group" aria-label="نوع درزجوش لوله" style={{ marginTop: '.5rem' }}>
          {(['SAW', 'HFW'] as Seam[]).map((k) => <button key={k} type="button" aria-pressed={p.seam === k} onClick={() => setP({ ...p, seam: k })} disabled={!isAdmin}>{SEAM_FA[k]}</button>)}
        </div>}
        {method === 'igs' && lim && pipe && <div className="pr-fig">
          <Fig k="فشار نقطهٔ پایین (TP)" v={`${fa(lim.lowPsi, 1)} psi`} sub={`${fa(lim.lowPct, 1)}٪ SMYS · لولهٔ ${fa(odIn, 0)}″ × ${fa(wtIn, 3)}″ ${pipe.material}`} />
          <Fig k="حداقل فشار نقطهٔ بالا" v={`${fa(lim.highMinPsi, 1)} psi`} sub={`${fa(lim.highMinPct, 1)}٪ SMYS${p.seam === 'HFW' ? ` · ${fa(p.cyclicHighDpFactor, 2)} × ${fa(pipe.designPressureBar, 1)} bar` : ''}`} />
          <Fig k="اختلاف ارتفاع مجاز هر قطعه" v={`${fa((lim.lowPsi - lim.highMinPsi) / p.psiPerM, 2)} m`} sub={`حداکثر طول ${fa(p.maxSectionKm, 0)} km`} />
          <Fig k="فشار آزمون نشتی (نقطهٔ پایین)" v={`${fa(lim.leakLowPsi, 1)} psi`} sub={`حداقل نقطهٔ بالا ${fa(lim.leakMinPsi, 1)} psi`} />
        </div>}
        <p className="ps-hint">لوله از تنظیمات دوقلوی دیجیتال خوانده می‌شود (ضخامت پیش‌فرض: کمترین ضخامت). ضخامت‌ها و طول‌های واقعی هر قطعه در صفحهٔ همان قطعه وارد می‌شود و محاسبه با کمترین ضخامت قطعه انجام می‌شود.</p>
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b><ShieldCheck size={15} /> خلاصهٔ روش، به ترتیب مراحل</b></header>
        <div className="pr-steps">
          {IGS_PROCEDURE.map((s, i) => { const u = STEP_UI[s.key]; return (
            <article key={s.key} className="pr-step" style={{ '--c': u.color } as CSSProperties}>
              <h4><i><u.icon size={15} /></i>{s.title}<em>{fa(i + 1, 0)}</em></h4>
              <ul>{s.items(p).map((t) => <li key={t}>{t}</li>)}</ul>
            </article>
          ) })}
        </div>
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b><Wrench size={15} /> پارامترهای روش</b><button type="button" className="ps-btn is-ghost" disabled={!isAdmin} onClick={() => setP(DEFAULT_IGS)}>مقادیر دستورالعمل</button></header>
        {GROUPS.filter((g) => !g.seam || g.seam === p.seam).map((g) => (
          <div key={g.title} className="pr-grp"><b>{g.title}</b>
            <div className="ps-grid">{g.fields.map((f) => (
              <label key={f.k} className="ps-field"><span>{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
                <input type="number" step={f.step ?? 1} dir="ltr" disabled={!isAdmin} value={String(p[f.k] ?? '')} placeholder={f.nullable} onChange={(e) => setP({ ...p, [f.k]: e.target.value === '' ? (f.nullable ? null : DEFAULT_IGS[f.k]) : Number(e.target.value) })} />
              </label>
            ))}</div>
          </div>
        ))}
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b><ClipboardList size={15} /> طرفین و مراجع صورتجلسه‌ها</b></header>
        <div className="ps-grid">{PARTY_FIELDS.map((f) => <label key={f.k} className="ps-field"><span>{f.label}</span><input value={parties[f.k]} disabled={!isAdmin} onChange={(e) => setParties({ ...parties, [f.k]: e.target.value })} /></label>)}</div>
      </section>

      <section className="ps-card">
        <header className="ps-card-head"><b><Gauge size={15} /> تجهیزات اندازه‌گیری و کالیبراسیون</b>{isAdmin && <button type="button" className="ps-btn" onClick={() => setEq([...eq, { name: '', range: '', accuracy: '', serial: '', calibExpiry: null }])}><Plus size={14} /> افزودن دستگاه</button>}</header>
        {eq.length ? <div className="ps-table-wrap"><table className="ps-table pr-eq">
          <thead><tr><th>دستگاه</th><th>دامنهٔ کاری</th><th>دقت</th><th>شمارهٔ سریال</th><th>انقضای کالیبراسیون</th><th /></tr></thead>
          <tbody>{eq.map((x, i) => {
            const up = (k: keyof HtEquip, v: string | null) => setEq(eq.map((y, j) => (j === i ? { ...y, [k]: v } : y)))
            const exp = x.calibExpiry && x.calibExpiry < today, near = !exp && x.calibExpiry && x.calibExpiry <= soon
            return <tr key={i}>
              <td><input list="pr-eq-names" value={x.name} disabled={!isAdmin} onChange={(e) => up('name', e.target.value)} placeholder="فشارسنج وزنه‌ای" /></td>
              <td><input value={x.range} disabled={!isAdmin} onChange={(e) => up('range', e.target.value)} dir="ltr" placeholder="0-6000 psi" /></td>
              <td><input value={x.accuracy} disabled={!isAdmin} onChange={(e) => up('accuracy', e.target.value)} dir="ltr" placeholder="0.1 psi" /></td>
              <td><input value={x.serial} disabled={!isAdmin} onChange={(e) => up('serial', e.target.value)} dir="ltr" /></td>
              <td>{isAdmin ? <ShamsiDate clearable value={x.calibExpiry ?? ''} onChange={(v) => up('calibExpiry', v || null)} label="انقضای کالیبراسیون" /> : formatJalali(x.calibExpiry ?? '')}
                {exp ? <small className="is-exp"> منقضی شده</small> : near ? <small className="is-soon"> کمتر از ۳۰ روز</small> : null}</td>
              <td>{isAdmin && <button type="button" className="ps-btn is-ghost" aria-label="حذف دستگاه" onClick={() => setEq(eq.filter((_, j) => j !== i))}><Trash2 size={13} /></button>}</td>
            </tr>
          })}</tbody>
        </table></div> : <p className="ps-hint">دستگاهی ثبت نشده است. ترمومترها، فشارسنج‌های وزنه‌ای و عقربه‌ای، ثبات‌های فشار و دما و کنتور آب را با تاریخ انقضای کالیبراسیون وارد کنید؛ دستگاه منقضی در صورتجلسه‌ها هشدار داده می‌شود.</p>}
        <datalist id="pr-eq-names">{['ترمومتر دیجیتال', 'فشارسنج وزنه‌ای', 'فشارسنج عقربه‌ای', 'ثبات فشار', 'ثبات حرارت', 'کنتور آب', 'دبی‌سنج پمپ'].map((n) => <option key={n} value={n} />)}</datalist>
      </section>

      <div className="ps-actions">
        <button type="button" className="ps-btn is-primary" disabled={!isAdmin} onClick={() => void save()}><CheckCircle2 size={15} /> ذخیرهٔ روش آزمون</button>
        {!isAdmin && <small className="ps-meta">فقط مدیر سامانه روش آزمون را تغییر می‌دهد.</small>}
      </div>
    </div>
  )
}

function Fig({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return <div className="ht-fig"><small>{k}</small><b>{v}</b>{sub && <span>{sub}</span>}</div>
}
