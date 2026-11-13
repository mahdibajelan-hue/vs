import { useMemo, useState, type CSSProperties } from 'react'
import { CheckCircle2, Gauge, Plus, X } from 'lucide-react'
import { ShamsiDate } from '../../../components/common/ShamsiField'
import { useAuthStore } from '../../../store/useAuthStore'
import { formatJalali } from '../../../lib/jalali'
import { useTestingStore } from '../../testing/store/useTestingStore'
import { TestPage } from '../../testing/components/TestPage'
import { HT_FAILED_COLOR, HT_STAGE_COLOR, HT_STAGE_FA, hoopMpa, smysOf } from '../../testing/lib/htCore'
import { CROSSINGS, CROSSING_FA } from '../../testing/lib/crossings'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const jd = (d: string | null) => (d ? formatJalali(d.slice(0, 10)) : '—')

/**
 * پیش‌تست قطعات عبوری — the pipe of a road, railway, river or wadi crossing is pressure-tested on its own before it is
 * laid (IGS: test pressure = factor × design pressure, held for hours). Each pre-test runs the same stages, readings and
 * minutes as a station test package; it is stored with them and told apart by its category.
 */
export function QcPretest() {
  const st = useTestingStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [kind, setKind] = useState('')
  const igs = st.igs()
  const list = useMemo(() => st.packs.filter((p) => p.category === 'pretest').sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.code.localeCompare(b.code)), [st.packs])
  const nextCode = `PT-${String(list.length + 1).padStart(2, '0')}`
  const blank = () => ({ code: '', crossing: 'road', title: '', km: '', len: '', wt: st.pipe ? String(st.pipe.wallMm) : '', dp: st.pipe ? String(st.pipe.designPressureBar) : '', tp: '', hold: '', medium: 'water' as 'water' | 'air' | 'nitrogen', date: '' })
  const [f, setF] = useState(blank)
  const tpAuto = f.dp ? (Number(f.dp) * igs.stationFactor).toFixed(1) : ''
  const tp = Number(f.tp || tpAuto)
  const smys = st.pipe ? smysOf(st.pipe.material) : null
  const odMm = st.pipe ? st.pipe.diameterIn * 25.4 : 0
  const pctSmys = smys && odMm && Number(f.wt) > 0 && tp > 0 ? (hoopMpa(tp, odMm, Number(f.wt)) / smys) * 100 : null
  const save = async () => {
    const p = await st.savePack({ code: f.code.trim() || nextCode, category: 'pretest', crossing: f.crossing, station: '', title: f.title, km: f.km === '' ? null : Number(f.km), lengthM: f.len === '' ? null : Number(f.len), wtMm: f.wt === '' ? null : Number(f.wt), designPressureBar: Number(f.dp), testPressureBar: tp, holdH: f.hold === '' ? igs.stationHoldH : Number(f.hold), medium: f.medium, plannedDate: f.date || null }, email)
    if (p) { setAdding(false); setF(blank()) }
  }
  if (open && st.packs.some((p) => p.id === open)) return <div className="ht"><TestPage kind="pack" id={open} onBack={() => setOpen(null)} /></div>

  const shown = kind ? list.filter((p) => p.crossing === kind) : list
  const acc = list.filter((p) => p.stage === 'accepted').length, fail = list.filter((p) => p.failed).length
  return (
    <div className="ps-stack ht">
      <div className="ps-row-head">
        <div><b>پیش‌تست هیدرواستاتیک قطعات عبوری</b><small>لولهٔ عبور از جاده، راه‌آهن، رودخانه، مسیل و کانال پیش از نصب جداگانه آزمون می‌شود؛ فشار آزمون {fa(igs.stationFactor, 2)} برابر فشار طراحی و نگهداری {fa(igs.stationHoldH)} ساعت (دستورالعمل پروژه).</small></div>
        <button type="button" className="ps-btn is-primary" onClick={() => { setF(blank()); setAdding(true) }}><Plus size={15} /> پیش‌تست جدید</button>
      </div>
      <section className="ps-kpis">
        <div className="ps-kpi" style={{ '--c': '#0ea5e9' } as CSSProperties}><small>قطعه‌های ثبت‌شده</small><b>{fa(list.length)}</b><span>{fa(list.reduce((s, p) => s + (p.lengthM ?? 0), 0))} متر لوله</span></div>
        <div className="ps-kpi" style={{ '--c': '#22c55e' } as CSSProperties}><small>پذیرفته‌شده</small><b>{fa(acc)}</b><span>آمادهٔ نصب</span></div>
        <div className="ps-kpi" style={{ '--c': '#f59e0b' } as CSSProperties}><small>در جریان</small><b>{fa(list.length - acc - fail)}</b><span>برنامه‌ریزی تا تخلیه</span></div>
        <div className="ps-kpi" style={{ '--c': '#ef4444' } as CSSProperties}><small>مردود</small><b>{fa(fail)}</b><span>نیازمند تعمیر و آزمون مجدد</span></div>
      </section>
      {adding && (
        <section className="ps-card ps-form">
          <header className="ps-card-head"><b>پیش‌تست قطعهٔ عبوری</b><button type="button" className="ps-x" onClick={() => setAdding(false)} aria-label="بستن"><X size={16} /></button></header>
          <div className="ht-seg" role="group" aria-label="نوع عبور">{CROSSINGS.map((k) => <button key={k} type="button" aria-pressed={f.crossing === k} onClick={() => setF({ ...f, crossing: k })}>{CROSSING_FA[k]}</button>)}</div>
          <div className="ps-grid">
            <label className="ps-field"><span>کد</span><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder={nextCode} dir="ltr" /></label>
            <label className="ps-field is-wide"><span>نام / شرح</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="جادهٔ اصلی سرخس — مشهد" /></label>
            <label className="ps-field"><span>کیلومتر خط</span><input type="number" value={f.km} onChange={(e) => setF({ ...f, km: e.target.value })} dir="ltr" step="0.001" /></label>
            <label className="ps-field"><span>طول قطعه (m)</span><input type="number" value={f.len} onChange={(e) => setF({ ...f, len: e.target.value })} dir="ltr" /></label>
            <label className="ps-field"><span>ضخامت دیواره (mm)</span><input type="number" value={f.wt} onChange={(e) => setF({ ...f, wt: e.target.value })} dir="ltr" step="0.1" /></label>
            <label className="ps-field"><span>فشار طراحی (bar) *</span><input type="number" value={f.dp} onChange={(e) => setF({ ...f, dp: e.target.value })} dir="ltr" /></label>
            <label className="ps-field"><span>فشار آزمون (bar)</span><input type="number" value={f.tp} onChange={(e) => setF({ ...f, tp: e.target.value })} placeholder={tpAuto} dir="ltr" /></label>
            <label className="ps-field"><span>مدت نگهداری (ساعت)</span><input type="number" value={f.hold} onChange={(e) => setF({ ...f, hold: e.target.value })} placeholder={String(igs.stationHoldH)} dir="ltr" /></label>
            <label className="ps-field"><span>سیال</span><select value={f.medium} onChange={(e) => setF({ ...f, medium: e.target.value as typeof f.medium })}><option value="water">آب</option><option value="nitrogen">نیتروژن</option><option value="air">هوا</option></select></label>
            <div className="ps-field"><span>تاریخ برنامه</span><ShamsiDate clearable value={f.date} onChange={(v) => setF({ ...f, date: v })} label="تاریخ برنامه" /></div>
          </div>
          {pctSmys != null && <p className={`ps-hint ${pctSmys > 100 ? 'is-warn' : ''}`}><Gauge size={14} /> تنش حلقوی در فشار آزمون {fa(tp, 1)} bar برابر {fa(pctSmys, 1)}٪ SMYS است{pctSmys > 100 ? ' — بیش از تنش تسلیم؛ ضخامت یا فشار را بازبینی کنید.' : '.'}</p>}
          <div className="ps-actions"><button type="button" className="ps-btn is-primary" disabled={!(Number(f.dp) > 0)} onClick={save}><CheckCircle2 size={15} /> ذخیره</button></div>
        </section>
      )}
      {list.length > 0 && <div className="ht-seg" role="group" aria-label="صافی نوع عبور"><button type="button" aria-pressed={!kind} onClick={() => setKind('')}>همه</button>{CROSSINGS.filter((k) => list.some((p) => p.crossing === k)).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{CROSSING_FA[k]} ({fa(list.filter((p) => p.crossing === k).length)})</button>)}</div>}
      {shown.length ? (
        <div className="ps-list">
          {shown.map((p) => (
            <button key={p.id} type="button" className="ps-sys" onClick={() => setOpen(p.id)} style={{ '--c': p.failed ? HT_FAILED_COLOR : HT_STAGE_COLOR[p.stage] } as CSSProperties}>
              <span className="ps-code" dir="ltr">{p.code}</span>
              <span className="ps-sys-main"><b>{CROSSING_FA[p.crossing] ?? 'قطعهٔ عبوری'}{p.title ? ` — ${p.title}` : ''}</b><small>{p.km != null ? `کیلومتر ${fa(p.km, 3)} · ` : ''}{p.lengthM ? `${fa(p.lengthM)} m · ` : ''}آزمون {fa(p.testPressureBar, 1)} bar · نگهداری {fa(p.holdH ?? igs.stationHoldH)} ساعت{p.plannedDate ? ` · ${jd(p.plannedDate)}` : ''}</small></span>
              <span className="ps-chip"><i />{p.failed ? 'مردود' : HT_STAGE_FA[p.stage]}</span>
            </button>
          ))}
        </div>
      ) : !adding && <p className="ps-hint">هنوز پیش‌تستی ثبت نشده است. برای هر قطعهٔ عبوری یک پیش‌تست بسازید؛ قرائت‌های فشار، مراحل و صورتجلسه‌ها مانند هیدروتست ثبت می‌شوند.</p>}
    </div>
  )
}
