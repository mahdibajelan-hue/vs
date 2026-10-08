import { AlarmClockOff, ArrowUpRight, CalendarClock, Siren } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import type { Analysis } from '../lib/kpis'

import { fmtKmRange } from '../lib/dates'
import { fmtDate, fmtDuration, relDays, faNum } from '../lib/fa'
import { ROUTE_LABEL, STAGE_LABEL } from '../lib/labels'
import { currentStage } from '../lib/workflow'
import { Card, EmptyState, LevelBadge } from '../components/ui'
import { NoRoute } from '../components/shared'

const COLUMNS = [
  { state: 'action_required', title: 'اقدام فوری', hint: 'زمان شروع تحصیل گذشته و هنوز شروع نشده', color: '#ef4444' },
  { state: 'delay_expected', title: 'تأخیر پیش‌بینی‌شده', hint: 'شروع شده ولی با روند فعلی دیر می‌رسد', color: '#f97316' },
  { state: 'start_soon', title: 'به‌زودی باید شروع شود', hint: 'در افق برنامه‌ریزی', color: '#eab308' },
] as const

/** Early Action Planning: for each parcel, the date acquisition must start so the first activity is not held up. */
export function ActionsPage() {
  const data = useLandStore((s) => s.data)
  const select = useLandStore((s) => s.selectParcel)
  const transfer = useLandStore((s) => s.transfer)
  const { rows, actions, settings } = useLandAnalysis()
  if (!data?.route) return <NoRoute />
  const overdue = actions.filter((a) => a.kind === 'overdue_stage')
  const legal = actions.filter((a) => a.kind === 'legal_deadline').sort((a, b) => a.daysFromToday - b.daysFromToday)

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <p className="la-eyebrow m-0 leading-7">
        تاریخ شروع تحصیل = نیاز فعالیت اجرایی − (زمان باقی‌ماندهٔ تحصیل + ذخیرهٔ اطمینان {faNum(settings.bufferDays)} روز). هر زمین پس از این تاریخ، خودش به‌تنهایی برنامه را عقب می‌اندازد.
      </p>
      <Card title="مواعد قانونی (لایحهٔ ۱۳۵۸)" hint="مهلت‌هایی که قانون برای دستگاه اجرایی، مالک، کارشناس و دادگاه تعیین کرده و گذشته یا نزدیک است" pad={false}>
        {legal.length === 0 ? <EmptyState icon={<AlarmClockOff size={20} />} title="مهلت قانونی نزدیک یا گذشته‌ای نیست" text="با ثبت تاریخ تصرف، استعلام، توافق یا ابلاغ در تب «مواعد قانونی» هر قطعه، مهلت‌ها اینجا هشدار می‌دهند." /> : (
          <ul className="m-0 list-none p-0">
            {legal.map((x) => (
              <li key={x.id}>
                <button className="la-row" onClick={() => select(x.parcelId)}>
                  <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: x.severity === 'critical' ? '#ef4444' : '#f59e0b' }} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-semibold leading-6">{x.title}</span><span className="la-eyebrow block">مهلت: {fmtDate(x.due)}</span></span>
                  <span className="la-num shrink-0 text-[11.5px] font-bold" style={{ color: x.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>{x.daysFromToday < 0 ? `${faNum(-x.daysFromToday)} روز گذشته` : x.daysFromToday === 0 ? 'امروز' : `${faNum(x.daysFromToday)} روز مانده`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((c) => {
          const list = rows.filter((r) => r.early.state === c.state).sort((a, b) => (a.early.startBy ?? '').localeCompare(b.early.startBy ?? '') || b.crit.score - a.crit.score)
          return (
            <section key={c.state} className="flex flex-col gap-3">
              <header className="flex items-center gap-2 px-1">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
                <h3 className="m-0 text-[13px] font-bold">{c.title}</h3>
                <span className="la-num la-eyebrow">{faNum(list.length)}</span>
                <span className="la-eyebrow ms-auto hidden xl:block">{c.hint}</span>
              </header>
              {list.length === 0 ? <div className="la-card-flat"><EmptyState icon={<CalendarClock size={18} />} title="موردی نیست" /></div> : list.slice(0, 12).map((r) => <ActionCard key={r.parcel.id} r={r} color={c.color} onOpen={() => select(r.parcel.id)} onTransfer={(t) => transfer(r.parcel.id, t)} />)}
              {list.length > 12 && <p className="la-eyebrow px-1">و {faNum(list.length - 12)} مورد دیگر…</p>}
            </section>
          )
        })}
      </div>

      <Card title="مراحل معوق" hint="مرحله‌هایی که تاریخ برنامه‌شان گذشته و تمام نشده‌اند" pad={false}>
        {overdue.length === 0 ? <EmptyState icon={<Siren size={20} />} title="مرحلهٔ معوقی نیست" /> : (
          <ul className="m-0 list-none p-0">
            {overdue.slice(0, 20).map((x) => (
              <li key={x.id}><button className="la-row" onClick={() => select(x.parcelId)}><span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{x.title}</span><span className="la-num text-[11.5px]" style={{ color: '#ef4444' }}>{relDays(x.daysFromToday)}</span></button></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function ActionCard({ r, color, onOpen, onTransfer }: { r: Analysis; color: string; onOpen: () => void; onTransfer: (t: 'risk' | 'issue' | 'schedule') => void }) {
  const p = r.parcel
  const cur = currentStage(p)
  const e = r.early
  return (
    <article className="la-card p-4" style={{ borderInlineStart: `3px solid ${color}` }}>
      <div className="flex items-start justify-between gap-2">
        <button className="min-w-0 text-right" onClick={onOpen}>
          <b className="la-km block text-[13.5px]">{fmtKmRange(p.kmStart, p.kmEnd)}</b>
          <span className="la-eyebrow">{p.code} · {ROUTE_LABEL[p.acquisitionRoute]}</span>
        </button>
        <LevelBadge level={r.crit.level} score={r.crit.score} />
      </div>
      {e.state === 'action_required' && <p className="m-0 mt-2 text-[12px] font-bold" style={{ color }}>Land Acquisition Action Required</p>}
      <dl className="m-0 mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <Row k="شروع عملیات اجرایی" v={fmtDate(e.needBy)} />
        <Row k="مدت تحصیل" v={fmtDuration(e.remaining)} />
        <Row k="باید شروع شود از" v={fmtDate(e.startBy)} bold color={e.daysToStartBy != null && e.daysToStartBy <= 0 ? '#ef4444' : undefined} />
        <Row k="وضعیت فعلی" v={cur ? STAGE_LABEL[cur.key] : '—'} />
      </dl>
      {e.delayDays > 0 && <p className="la-eyebrow m-0 mt-2">آزادسازی {fmtDuration(e.delayDays)} دیرتر از نیاز برنامه پیش‌بینی می‌شود.</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {([['risk', p.riskId, 'ریسک'], ['issue', p.issueId, 'مسئله'], ['schedule', p.scheduleWarningId, 'هشدار برنامه']] as const).map(([t, id, label]) => (
          <button key={t} className="la-btn la-btn-sm" disabled={!!id} onClick={() => onTransfer(t)}>{id ? `${label} ثبت شد` : <>انتقال به {label} <ArrowUpRight size={12} /></>}</button>
        ))}
      </div>
    </article>
  )
}

function Row({ k, v, bold, color }: { k: string; v: string; bold?: boolean; color?: string }) {
  return <div><dt className="la-eyebrow">{k}</dt><dd className="m-0" style={{ fontWeight: bold ? 700 : 500, color }}>{v}</dd></div>
}

