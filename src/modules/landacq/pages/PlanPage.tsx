import { useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { useAuthStore } from '../platform'
import { NoRoute, Kpi } from '../components/shared'
import { Card, Segmented } from '../components/ui'
import { HelpButton } from '../components/Help'
import { IssueButton } from '../components/IssueButton'
import { lastActionOf, releasePlan, READINESS_COLOR, READINESS_FA } from '../lib/plan'
import { fmtKmRange } from '../lib/dates'
import { faNum, fmtDate, fmtDateShort } from '../lib/fa'
import { OWNERSHIP_LABEL, LEVEL_LABEL } from '../lib/labels'

type Filter = 'open' | 'urgent' | 'all'

/**
 * Phase 2 — the legal unit's proposed release plan: every parcel in the order acquisition has to begin, with the time it needs
 * (Land Lead Time), the date it must start, its status and the last thing done.
 */
export function PlanPage() {
  const data = useLandStore((s) => s.data)
  const events = data?.events
  const select = useLandStore((s) => s.selectParcel)
  const saveRoute = useLandStore((s) => s.saveRoute)
  const role = data?.myRole ?? null
  const profile = useAuthStore((s) => s.profile)
  const { rows, settings, today } = useLandAnalysis()
  const [filter, setFilter] = useState<Filter>('open')
  const [note, setNote] = useState('')
  const plan = useMemo(() => releasePlan(rows, settings), [rows, settings])
  const urgent = plan.filter((x) => !x.a.released && x.startBy != null && x.startBy <= today && x.a.early.state !== 'ready')
  const soon = plan.filter((x) => !x.a.released && x.startBy != null && x.startBy > today && x.startBy <= new Date(Date.parse(today) + 30 * 864e5).toISOString().slice(0, 10))
  const shown = plan.filter((x) => (filter === 'all' ? true : filter === 'open' ? !x.a.released : urgent.includes(x)))
  if (!data?.route) return <NoRoute />
  const open = plan.filter((x) => !x.a.released)
  const avgLead = open.length ? Math.round(open.reduce((n, x) => n + x.leadDays, 0) / open.length) : 0
  const prop = settings.planProposal
  const canPropose = !!profile?.isAdmin || role === 'employer_legal' || role === 'project_manager' || role === 'executive'
  const propose = () => data.route && saveRoute({ ...data.route, settings: { ...data.route.settings, planProposal: { at: new Date().toISOString(), by: profile?.fullName ?? '', note: note.trim(), urgent: urgent.length, total: open.length } } }).then(() => setNote(''))

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="خلاصهٔ برنامه">
        <Kpi label="قطعه‌های آزادنشده" value={faNum(open.length)} sub={`از ${faNum(plan.length)} قطعه`} />
        <Kpi label="شروع تحصیل: همین حالا" value={faNum(urgent.length)} color="#ef4444" alert={urgent.length > 0} sub="زمان شروع رسیده یا گذشته" />
        <Kpi label="شروع تحصیل: ۳۰ روز آینده" value={faNum(soon.length)} color="#eab308" />
        <Kpi label="میانگین Land Lead Time" value={<>{faNum(avgLead)} <small className="text-[13px]">روز</small></>} />
      </section>

      <Card title="ارائهٔ برنامهٔ پیشنهادی آزادسازی" hint="واحد حقوقی پس از بازبینی فهرست زیر، برنامه را ارائه می‌کند؛ تاریخ و خلاصهٔ آن ثبت می‌شود." help="plan">
        {prop ? (
          <p className="m-0 flex flex-wrap items-center gap-2 text-[12.5px] leading-7"><ClipboardCheck size={16} style={{ color: '#22c55e' }} aria-hidden /> آخرین برنامهٔ ارائه‌شده: <b>{fmtDate(prop.at.slice(0, 10))}</b>{prop.by ? ` توسط ${prop.by}` : ''} — {faNum(prop.total)} قطعهٔ آزادنشده، {faNum(prop.urgent)} مورد شروع فوری.{prop.note ? <span className="la-eyebrow block w-full">{prop.note}</span> : null}</p>
        ) : <p className="la-eyebrow m-0">هنوز برنامه‌ای ارائه نشده است.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="la-input" style={{ maxWidth: 420 }} placeholder="توضیح (اختیاری): مبنای اولویت‌بندی، فرض‌ها …" value={note} onChange={(e) => setNote(e.target.value)} disabled={!canPropose} />
          <button className="la-btn la-btn-primary" disabled={!canPropose} onClick={propose} title={canPropose ? undefined : 'ارائهٔ برنامه با مسئول حقوقی کارفرما، مدیر پروژه یا مجری طرح است'}>ارائهٔ برنامهٔ پیشنهادی</button>
        </div>
      </Card>

      <Card
        title="اولویت و زمان‌بندی تحصیل"
        hint="به ترتیب اولویت شروع: ابتدا قطعه‌هایی که زودتر باید شروع شوند، سپس Criticality بالاتر"
        help="leadtime"
        pad={false}
        action={<Segmented label="فیلتر" value={filter} onChange={setFilter} options={[{ value: 'open', label: 'آزادنشده' }, { value: 'urgent', label: 'شروع فوری' }, { value: 'all', label: 'همه' }]} />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr style={{ color: 'var(--la-muted)' }}>
                {['#', 'قطعه', 'مالکیت', 'وضعیت', 'Criticality', 'مدت لازم (Lead Time)', 'شروع تحصیل تا', 'نیاز اجرایی', 'آخرین اقدام', 'مسئله'].map((h) => <th key={h} className="px-3 py-2 text-right font-semibold">{h}</th>)}
                <th className="px-3 py-2 text-right font-semibold"><HelpButton topic="lastaction" /></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => {
                const la = lastActionOf(x.a.parcel, events, today)
                const late = !x.a.released && x.startBy != null && x.startBy <= today
                return (
                  <tr key={x.a.parcel.id} style={{ borderTop: '1px solid var(--la-line)' }}>
                    <td className="la-num px-3 py-2" style={{ color: 'var(--la-muted)' }}>{faNum(x.rank)}</td>
                    <td className="px-3 py-2"><button className="la-btn la-btn-ghost la-btn-sm" onClick={() => select(x.a.parcel.id)}>{x.a.parcel.code} · {fmtKmRange(x.a.parcel.kmStart, x.a.parcel.kmEnd)}</button></td>
                    <td className="px-3 py-2">{OWNERSHIP_LABEL[x.a.parcel.ownershipClass]}</td>
                    <td className="px-3 py-2"><span className="la-badge" style={{ '--c': READINESS_COLOR[x.readiness] } as React.CSSProperties}><i /> {READINESS_FA[x.readiness]}</span></td>
                    <td className="px-3 py-2">{LEVEL_LABEL[x.a.crit.level]} <span className="la-num" style={{ color: 'var(--la-ink-2)' }}>({faNum(x.a.crit.score)})</span></td>
                    <td className="la-num px-3 py-2">{x.a.released ? '—' : `${faNum(x.leadDays)} روز`}</td>
                    <td className="la-num px-3 py-2 font-semibold" style={{ color: late ? '#ef4444' : undefined }}>{x.a.released ? '—' : fmtDateShort(x.startBy)}{late ? ' ⚠' : ''}</td>
                    <td className="la-num px-3 py-2">{fmtDateShort(x.needBy)}</td>
                    <td className="px-3 py-2 leading-6">{la ? <>{la.text}<span className="la-eyebrow block">{fmtDateShort(la.date)}</span></> : <span className="la-eyebrow">اقدامی ثبت نشده</span>}</td>
                    <td className="px-3 py-2" colSpan={2}>{x.a.released ? <span className="la-eyebrow">—</span> : <IssueButton a={x.a} />}</td>
                  </tr>
                )
              })}
              {shown.length === 0 && <tr><td colSpan={11} className="la-eyebrow px-3 py-6 text-center">موردی برای نمایش نیست.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
