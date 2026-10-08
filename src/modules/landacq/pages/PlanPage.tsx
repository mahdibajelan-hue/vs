import { useMemo, useState } from 'react'
import { CalendarPlus, ClipboardCheck } from 'lucide-react'
import { JalaliDateInput } from '../platform'
import { ReleaseCurve } from '../components/ReleaseCurve'
import { plannedFinishOf, startOf, summarizePlan, type PlanMode } from '../lib/autoplan'
import { totalExpectedDays } from '../lib/workflow'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { useAuthStore } from '../platform'
import { NoRoute, Kpi } from '../components/shared'
import { Card, Segmented } from '../components/ui'
import { IssueButton } from '../components/IssueButton'
import { lastActionOf, releasePlan, READINESS_COLOR, READINESS_FA } from '../lib/plan'
import { diffDays, fmtKmRange } from '../lib/dates'
import { faNum, fmtDate, fmtDateShort } from '../lib/fa'

type Filter = 'open' | 'urgent' | 'all'

const dayAfter = (iso: string, n: number) => new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10)

/**
 * Phase 2 — the release plan. From a single start date the system writes a planned date for every step of every parcel; the
 * table then lets the legal unit adjust the start or duration of any parcel, and the curve compares plan, reality and forecast.
 */
export function PlanPage() {
  const data = useLandStore((s) => s.data)
  const events = data?.events
  const select = useLandStore((s) => s.selectParcel)
  const saveRoute = useLandStore((s) => s.saveRoute)
  const planAll = useLandStore((s) => s.planAll)
  const planParcel = useLandStore((s) => s.planParcel)
  const update = useLandStore((s) => s.updateParcel)
  const role = data?.myRole ?? null
  const profile = useAuthStore((s) => s.profile)
  const { rows, settings, today } = useLandAnalysis()
  const [filter, setFilter] = useState<Filter>('open')
  const [note, setNote] = useState('')
  const [gen, setGen] = useState<{ start: string; mode: PlanMode; onlyNew: boolean }>({ start: today, mode: 'jit', onlyNew: false })
  const [done, setDone] = useState<number | null>(null)
  const plan = useMemo(() => releasePlan(rows, settings), [rows, settings])
  const sum = useMemo(() => summarizePlan(rows.map((r) => r.parcel)), [rows])
  const urgent = plan.filter((x) => !x.a.released && x.startBy != null && x.startBy <= today && !x.a.parcel.planStart)
  const soon = plan.filter((x) => !x.a.released && x.startBy != null && x.startBy > today && x.startBy <= dayAfter(today, 30))
  const shown = plan.filter((x) => (filter === 'all' ? true : filter === 'open' ? !x.a.released : urgent.includes(x)))
  if (!data?.route) return <NoRoute />
  const open = plan.filter((x) => !x.a.released)
  const misfits = open.filter((x) => { const f = plannedFinishOf(x.a.parcel); return f && x.needBy && f > x.needBy })
  const behind = open.filter((x) => { const f = plannedFinishOf(x.a.parcel); return f && x.a.early.projectedRelease > f })
  const prop = settings.planProposal
  const canPropose = !!profile?.isAdmin || role === 'employer_legal' || role === 'project_manager' || role === 'executive'
  const propose = () => data.route && saveRoute({ ...data.route, settings: { ...data.route.settings, planProposal: { at: new Date().toISOString(), by: profile?.fullName ?? '', note: note.trim(), urgent: urgent.length, total: open.length } } }).then(() => setNote(''))

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <Card title="ایجاد خودکار برنامهٔ تحصیل و آزادسازی" hint="فقط تاریخ شروع را بدهید؛ سامانه برای هر قطعه تاریخ برنامه‌ای همهٔ مراحل را می‌سازد و پایان تحصیل را پیش‌بینی می‌کند." help="plan">
        <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <div><span className="la-label">تاریخ شروع عملیات تحصیل</span><JalaliDateInput value={gen.start} onChange={(iso) => setGen({ ...gen, start: iso ?? today })} /></div>
          <div>
            <span className="la-label">روش شروع قطعه‌ها</span>
            <Segmented label="روش" value={gen.mode} onChange={(mode) => setGen({ ...gen, mode })} options={[{ value: 'jit', label: 'به‌موقع: هر قطعه دیرتر از «شروع لازم» نه' }, { value: 'asap', label: 'سریع: همه از تاریخ شروع' }]} />
          </div>
          <button className="la-btn la-btn-primary" onClick={async () => setDone(await planAll(gen.mode, gen.start, gen.onlyNew))}><CalendarPlus size={15} /> ایجاد برنامه</button>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px]"><input type="checkbox" checked={gen.onlyNew} onChange={(e) => setGen({ ...gen, onlyNew: e.target.checked })} /> فقط قطعه‌هایی که هنوز برنامه ندارند (برنامهٔ دستی قطعه‌های دیگر حفظ شود)</label>
        <p className="la-eyebrow mt-2 leading-7">
          {done != null && <b style={{ color: '#22c55e' }}>برنامهٔ {faNum(done)} قطعه ایجاد شد. </b>}
          در حالت «به‌موقع»، هر قطعه از «شروع لازم» (نیاز فعالیت اجرایی منهای مدت لازم و ذخیرهٔ اطمینان) شروع می‌شود و هیچ قطعه‌ای زودتر از تاریخ شروع نمی‌آید؛ اگر فعالیت پیمانکار تعریف نشده، قطعه از تاریخ شروع آغاز می‌شود. مراحل انجام‌شده دست نمی‌خورند.
        </p>
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="خلاصهٔ برنامه">
        <Kpi label="شروع تحصیل کل مسیر" value={<span className="text-[19px]">{fmtDateShort(sum.start)}</span>} />
        <Kpi label="پایان پیش‌بینی‌شدهٔ آزادسازی" value={<span className="text-[19px]">{fmtDateShort(sum.finish)}</span>} sub={sum.span ? `${faNum(Math.round(sum.span / 30))} ماه` : undefined} />
        <Kpi label="قطعه‌های دارای برنامه" value={`${faNum(sum.planned)} از ${faNum(sum.total)}`} />
        <Kpi label="ناهمخوان با نیاز پیمانکار" value={faNum(misfits.length)} color="#ef4444" alert={misfits.length > 0} sub="پایان برنامه‌ای دیرتر از نیاز اجرایی" />
        <Kpi label="عقب‌تر از برنامه" value={faNum(behind.length)} color="#f97316" alert={behind.length > 0} sub="پیش‌بینی دیرتر از پایان برنامه‌ای" />
      </section>

      <Card title="پیشرفت آزادسازی: برنامه، واقعی و پیش‌بینی" hint="آبی: برنامه · سبز: واقعی تا امروز · نقطه‌چین نارنجی: پیش‌بینی با روند فعلی" action={<span className="la-eyebrow">شاخص کنترل برنامه</span>}>
        <ReleaseCurve rows={rows} today={today} />
      </Card>

      <Card title="ارائهٔ برنامهٔ پیشنهادی آزادسازی" hint="پس از بازبینی جدول زیر، واحد حقوقی برنامه را ارائه می‌کند؛ تاریخ و خلاصهٔ آن ثبت می‌شود و مراحل تأیید بعدی روی آن انجام می‌شود.">
        {prop ? (
          <p className="m-0 flex flex-wrap items-center gap-2 text-[12.5px] leading-7"><ClipboardCheck size={16} style={{ color: '#22c55e' }} aria-hidden /> آخرین برنامهٔ ارائه‌شده: <b>{fmtDate(prop.at.slice(0, 10))}</b>{prop.by ? ` توسط ${prop.by}` : ''} — {faNum(prop.total)} قطعهٔ آزادنشده، {faNum(prop.urgent)} مورد شروع فوری.{prop.note ? <span className="la-eyebrow block w-full">{prop.note}</span> : null}</p>
        ) : <p className="la-eyebrow m-0">هنوز برنامه‌ای ارائه نشده است.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="la-input" style={{ maxWidth: 420 }} placeholder="توضیح (اختیاری): مبنای اولویت‌بندی، فرض‌ها …" value={note} onChange={(e) => setNote(e.target.value)} disabled={!canPropose} />
          <button className="la-btn la-btn-primary" disabled={!canPropose} onClick={propose} title={canPropose ? undefined : 'ارائهٔ برنامه با مسئول حقوقی کارفرما، مدیر پروژه یا مجری طرح است'}>ارائهٔ برنامهٔ پیشنهادی</button>
        </div>
      </Card>

      <Card
        title="برنامهٔ هر قطعه"
        hint="تاریخ شروع و مدت را در همین جدول ویرایش کنید؛ تاریخ مراحل همان قطعه خودکار دوباره ساخته می‌شود. «نیاز اجرایی» از برنامهٔ پیمانکار می‌آید و در «تطبیق با برنامه» تغییر می‌کند."
        help="leadtime"
        pad={false}
        action={<Segmented label="فیلتر" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'آزادنشده' }, { value: 'urgent', label: 'شروع فوری' }, { value: 'all', label: 'همه' }]} />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse', minWidth: 1280 }}>
            <thead>
              <tr style={{ color: 'var(--la-muted)' }}>
                {['#', 'قطعه', 'وضعیت', 'شروع تحصیل (برنامه)', 'مدت تحصیل (روز)', 'پایان برنامه‌ای', 'پیش‌بینی با روند فعلی', 'نیاز اجرایی (پیمانکار)', 'همخوانی', 'آخرین اقدام', 'مسئله'].map((h) => <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => {
                const p = x.a.parcel
                const la = lastActionOf(p, events, today)
                const fin = plannedFinishOf(p)
                const fc = x.a.early.projectedRelease
                const dev = fin && !x.a.released ? diffDays(fc, fin) : 0
                const fits = fin && x.needBy ? fin <= x.needBy : null
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--la-line)' }}>
                    <td className="la-num px-3 py-2" style={{ color: 'var(--la-muted)' }}>{faNum(x.rank)}</td>
                    <td className="px-3 py-2"><button className="la-btn la-btn-ghost la-btn-sm" onClick={() => select(p.id)}>{p.code} · {fmtKmRange(p.kmStart, p.kmEnd)}</button></td>
                    <td className="px-3 py-2"><span className="la-badge" style={{ '--c': READINESS_COLOR[x.readiness] } as React.CSSProperties}><i /> {READINESS_FA[x.readiness]}</span></td>
                    <td className="px-3 py-2" style={{ minWidth: 150 }}>{x.a.released ? <span className="la-num">{fmtDateShort(startOf(p))}</span> : <JalaliDateInput value={p.planStart ?? ''} onChange={(iso) => iso && planParcel(p.id, iso)} />}</td>
                    <td className="px-3 py-2" style={{ width: 110 }}>{x.a.released ? '—' : <input className="la-input la-num" type="number" min={1} style={{ minHeight: 34 }} defaultValue={totalExpectedDays(p)} key={`d${p.id}${totalExpectedDays(p)}`} onBlur={(e) => { const v = Math.round(Number(e.target.value)); if (v > 0 && v !== totalExpectedDays(p)) { const st = p.planStart ?? startOf(p); void (st ? planParcel(p.id, st, v) : update(p.id, { estDurationDays: v })) } }} aria-label="مدت تحصیل" />}</td>
                    <td className="la-num px-3 py-2 font-semibold">{fmtDateShort(fin)}</td>
                    <td className="la-num px-3 py-2">{x.a.released ? '—' : fmtDateShort(fc)}{dev > 0 && <span className="block text-[11px]" style={{ color: '#ef4444' }}>{faNum(dev)} روز عقب‌تر</span>}</td>
                    <td className="la-num px-3 py-2" title="از برنامهٔ زمان‌بندی پیمانکار">{fmtDateShort(x.needBy)}</td>
                    <td className="px-3 py-2">{x.a.released ? '—' : fits == null ? <span className="la-eyebrow">{fin ? 'بدون فعالیت مرتبط' : 'برنامه ندارد'}</span> : fits ? <span style={{ color: '#22c55e' }}>✓ همخوان</span> : <span style={{ color: '#ef4444' }}>⚠ دیرتر از نیاز</span>}</td>
                    <td className="px-3 py-2 leading-6">{la ? <>{la.text}<span className="la-eyebrow block">{fmtDateShort(la.date)}</span></> : <span className="la-eyebrow">اقدامی ثبت نشده</span>}</td>
                    <td className="px-3 py-2">{x.a.released ? <span className="la-eyebrow">—</span> : <IssueButton a={x.a} />}</td>
                  </tr>
                )
              })}
              {shown.length === 0 && <tr><td colSpan={11} className="la-eyebrow px-3 py-6 text-center">موردی برای نمایش نیست.</td></tr>}
            </tbody>
          </table>
        </div>
        {soon.length > 0 && <p className="la-eyebrow m-0 px-4 py-3">{faNum(soon.length)} قطعه ظرف ۳۰ روز آینده باید شروع شود و {faNum(urgent.length)} قطعهٔ بدون برنامه، زمان شروعش رسیده است.</p>}
      </Card>
    </div>
  )
}
