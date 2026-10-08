import { AlarmClockOff, AlertOctagon, ArrowLeft, CalendarClock, Siren } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { RouteMap } from '../components/RouteMap'
import { ChainageRibbon } from '../components/ChainageRibbon'
import { Kpi, MapLegend, NoRoute } from '../components/shared'
import { Card, EmptyState, LevelBadge } from '../components/ui'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '../lib/status'
import { fmtKmRange } from '../lib/dates'
import { faNum, fmtDate, fmtLen as km, relDays } from '../lib/fa'
import { STAGE_LABEL } from '../lib/labels'
import { currentStage } from '../lib/workflow'
import { allowedActions } from '../lib/approval'
import { Coins, Factory, Spline } from 'lucide-react'

/** Executive home: where we stand (KPIs + stacked length bar), where the land is (map + ribbon), what hurts (constraints), what to do (actions). */
export function TowerPage() {
  const data = useLandStore((s) => s.data)
  const selectedId = useLandStore((s) => s.selectedId)
  const select = useLandStore((s) => s.selectParcel)
  const setTab = useLandStore((s) => s.setTab)
  const { rows, stations, crossings, kpis, lengths, constraints, actions, settings, today } = useLandAnalysis()
  const selectCrossing = useLandStore((s) => s.selectCrossing)
  if (!data?.route) return <NoRoute />
  const route = data.route
  const total = route.totalKm || 1
  const legal = actions.filter((x) => x.kind === 'legal_deadline').sort((a, b) => a.daysFromToday - b.daysFromToday)
  const myRole = data.myRole
  const waitingForMe = myRole ? rows.filter((r) => allowedActions(r.parcel.approvalStatus, myRole, false).some((x) => x !== 'return' && x !== 'reopen' && x !== 'submit') || (myRole === 'contractor' && r.parcel.approvalStatus === 'draft' && !!r.parcel.approvalNote)).length : 0
  const urgent = actions.filter((x) => x.kind !== 'upcoming_stage' && x.kind !== 'legal_deadline')
  const upcoming = actions.filter((x) => x.kind !== 'legal_deadline').slice(0, 8)

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      {/* ------------------------------------------------------------ headline + stacked bar */}
      <section className="la-card la-rise p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
            <p className="la-eyebrow m-0">پیشرفت تحصیل اراضی · {route.name}</p>
            <p className="m-0 mt-1 flex items-baseline gap-2">
              <span className="la-num text-[44px] font-bold leading-none" style={{ color: 'var(--la-accent)' }}>{faNum(kpis.progressPct)}٪</span>
              <span className="text-[12.5px]" style={{ color: 'var(--la-ink-2)' }}>مراحل طی‌شده · {faNum(kpis.releasedPct)}٪ مسیر آزاد</span>
            </p>
          </div>
          <div className="text-[12.5px] leading-7" style={{ color: 'var(--la-ink-2)' }}>
            {kpis.actionRequired > 0 ? <p className="m-0 flex items-center gap-2" style={{ color: '#ef4444' }}><Siren size={15} /> <b>{faNum(kpis.actionRequired)} قطعه</b> باید همین حالا تحصیلش شروع شود</p> : <p className="m-0">اقدام فوری برای شروع تحصیل لازم نیست.</p>}
            {waitingForMe > 0 && <p className="m-0 font-bold" style={{ color: 'var(--la-accent)' }}>{faNum(waitingForMe)} قطعه منتظر اقدام شما در زنجیرهٔ تأیید است</p>}
            <p className="m-0">{faNum(kpis.impactingSoon)} قطعه ظرف {faNum(settings.horizonDays)} روز آینده به فعالیت اجرایی می‌رسد و هنوز آزاد نیست.</p>
          </div>
        </div>
        <div className="la-bar mt-4" role="img" aria-label="سهم طول مسیر به تفکیک وضعیت">
          {STATUS_ORDER.map((s) => <i key={s} title={`${STATUS_LABEL[s]}: ${km(lengths[s])} km`} style={{ flexGrow: lengths[s], background: STATUS_COLOR[s] }} />)}
          <i style={{ flexGrow: Math.max(0, total - Object.values(lengths).reduce((a, b) => a + b, 0)), background: 'transparent' }} />
        </div>
        <div className="mt-3"><MapLegend mode="status" counts={lengths} /></div>
      </section>

      {/* ------------------------------------------------------------ legal alarms (1358 law) */}
      {legal.length > 0 && (
        <section className="la-card la-rise p-4" style={{ borderColor: 'color-mix(in srgb, #ef4444 45%, var(--la-line))', background: 'color-mix(in srgb, #ef4444 6%, var(--la-surface))' }} aria-label="هشدارهای مواعد قانونی">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="la-title m-0 flex items-center gap-2" style={{ color: '#ef4444' }}><AlarmClockOff size={16} /> هشدار مواعد قانونی</p>
            <p className="la-eyebrow m-0">{faNum(kpis.legalOverdue)} مهلت گذشته · {faNum(kpis.legalSoon)} نزدیک مهلت{kpis.stayed > 0 ? ` · ${faNum(kpis.stayed)} توقف دادگاهی` : ''}</p>
          </div>
          <ul className="m-0 mt-2 list-none p-0">
            {legal.slice(0, 5).map((x) => (
              <li key={x.id}>
                <button className="la-row" style={{ padding: '9px 6px' }} onClick={() => select(x.parcelId)}>
                  <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: x.severity === 'critical' ? '#ef4444' : '#f59e0b' }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{x.title}</span>
                  <span className="la-num shrink-0 text-[11.5px] font-bold" style={{ color: x.severity === 'critical' ? '#ef4444' : '#f59e0b' }}>{x.daysFromToday < 0 ? `${faNum(-x.daysFromToday)} روز گذشته` : x.daysFromToday === 0 ? 'امروز' : `${faNum(x.daysFromToday)} روز مانده`}</span>
                </button>
              </li>
            ))}
          </ul>
          {legal.length > 5 && <button className="la-btn la-btn-sm mt-2" onClick={() => setTab('actions')}>همهٔ هشدارها ({faNum(legal.length)}) <ArrowLeft size={13} /></button>}
        </section>
      )}

      {/* ------------------------------------------------------------ KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="شاخص‌های کلیدی">
        <Kpi label="طول کل مسیر" value={<>{km(kpis.totalKm)} <small className="text-[13px]">km</small></>} sub={`${faNum(kpis.parcelCount)} قطعه`} />
        <Kpi label="طول آزادشده" value={<>{km(kpis.releasedKm)} <small className="text-[13px]">km</small></>} sub={`${faNum(kpis.releasedPct)}٪ مسیر`} color="#22c55e" />
        <Kpi label="در حال تحصیل" value={<>{km(kpis.acquiringKm)} <small className="text-[13px]">km</small></>} color="#eab308" />
        <Kpi label="طول پرریسک (High+Critical)" value={<>{km(kpis.riskKm)} <small className="text-[13px]">km</small></>} color="#f97316" alert={kpis.riskKm > 0} />
        <Kpi label="نقاط Critical" value={faNum(kpis.criticalCount)} color="#ef4444" alert={kpis.criticalCount > 0} onClick={() => setTab('actions')} sub="مشاهده اقدام‌ها" />
        <Kpi label="تعداد مالکین" value={faNum(kpis.ownerCount)} />
        <Kpi label="نقاط اختلاف" value={faNum(kpis.disputeCount)} color="#f97316" alert={kpis.disputeCount > 0} />
        <Kpi label="اقدام‌های معوق" value={faNum(kpis.overdueActions)} color="#ef4444" alert={kpis.overdueActions > 0} onClick={() => setTab('actions')} />
        <Kpi label={`اثرگذار بر برنامه (${faNum(settings.horizonDays)} روز آینده)`} value={faNum(kpis.impactingSoon)} color="#f97316" alert={kpis.impactingSoon > 0} onClick={() => setTab('schedule')} />
        <Kpi label="تأخیر پیش‌بینی‌شده" value={faNum(kpis.delayExpected)} sub="قطعه" color="#eab308" />
      </section>

      {(!settings.budgetAmount || data.parcels.some((p) => p.priceException?.status === 'requested')) && (
        <section className="la-card la-rise flex flex-wrap items-center gap-3 p-4" style={{ borderColor: 'color-mix(in srgb, #f59e0b 50%, var(--la-line))', background: 'color-mix(in srgb, #f59e0b 7%, var(--la-surface))' }} aria-label="هشدار مالی">
          <Coins size={20} style={{ color: '#f59e0b' }} aria-hidden />
          <p className="m-0 min-w-0 flex-1 text-[12.5px] leading-7">
            {!settings.budgetAmount && <span className="block"><b>بودجهٔ تحصیل اراضی این پروژه ثبت نشده است.</b> برای کنترل مصرف بودجه، مبلغ مصوب را در بخش «مالی و بودجه» وارد کنید.</span>}
            {data.parcels.some((p) => p.priceException?.status === 'requested') && <span className="block"><b>{faNum(data.parcels.filter((p) => p.priceException?.status === 'requested').length)} درخواست ثبت قیمت استثنایی</b> منتظر تصمیم مدیر پروژه است.</span>}
          </p>
          <button className="la-btn la-btn-sm" onClick={() => setTab('finance')}>مالی و بودجه <ArrowLeft size={13} /></button>
        </section>
      )}

      {(stations.length > 0 || crossings.length > 0) && (
        <section className="la-card la-rise grid gap-px overflow-hidden sm:grid-cols-2" style={{ background: 'var(--la-line)' }} aria-label="ایستگاه‌ها و عبور از تأسیسات">
          <FacilityStat icon={<Factory size={18} />} label="ایستگاه‌های تملک‌شده" done={stations.filter((r) => r.released).length} total={stations.length} color="#22c55e" onClick={() => setTab('stations')} />
          <FacilityStat icon={<Spline size={18} />} label="عبورهای دارای مجوز" done={crossings.filter((x) => x.c.permitStatus === 'issued').length} total={crossings.length} color="#38bdf8" onClick={() => setTab('crossings')} />
        </section>
      )}

      {/* ------------------------------------------------------------ map + ribbon */}
      <Card title="نقشهٔ وضعیت تحصیل" hint="روی هر بخش از مسیر بزنید تا جزئیات قطعه باز شود" action={<button className="la-btn la-btn-sm" onClick={() => setTab('map')}>نقشهٔ کامل <ArrowLeft size={13} /></button>}>
        <RouteMap route={route} rows={rows} mode="status" selectedId={selectedId} onSelect={select} activities={data.activities} today={today} height={360} stations={stations} crossings={crossings} onSelectCrossing={(id) => { selectCrossing(id); setTab('crossings') }} />
        <div className="mt-4"><ChainageRibbon route={route} rows={rows} mode="status" selectedId={selectedId} onSelect={select} activities={data.activities} today={today} /></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------------------------------------------------- critical land constraints */}
        <Card title="Critical Land Constraints" hint="زمین‌هایی که برنامهٔ اجرایی را متوقف می‌کنند — به ترتیب فوریت" pad={false}>
          {constraints.length === 0 ? (
            <EmptyState icon={<AlertOctagon size={20} />} title="قیدی دیده نمی‌شود" text="هیچ زمین آزادنشده‌ای فعالیت‌های برنامه را تهدید نمی‌کند." />
          ) : (
            <ul className="m-0 list-none p-0">
              {constraints.slice(0, 8).map((r) => (
                <li key={r.parcel.id}>
                  <button className="la-row" aria-pressed={selectedId === r.parcel.id} onClick={() => select(r.parcel.id)}>
                    <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: r.early.state === 'action_required' ? '#ef4444' : r.crit.level === 'critical' ? '#ef4444' : '#f97316' }} />
                    <span className="min-w-0 flex-1">
                      <span className="la-km block text-[13px] font-bold">{fmtKmRange(r.parcel.kmStart, r.parcel.kmEnd)}</span>
                      <span className="la-eyebrow block truncate leading-6">
                        {r.early.state === 'action_required' ? `باید از ${fmtDate(r.early.startBy)} شروع می‌شد` : r.early.needBy ? `نیاز اجرا: ${fmtDate(r.early.needBy)}${r.early.delayDays > 0 ? ` · تأخیر ${faNum(r.early.delayDays)} روز` : ''}` : 'بدون فعالیت مرتبط'}
                        {' · '}{currentStage(r.parcel) ? STAGE_LABEL[currentStage(r.parcel)!.key] : 'آماده'}
                      </span>
                    </span>
                    <LevelBadge level={r.crit.level} score={r.crit.score} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------------------- upcoming actions */}
        <Card title="اقدام‌های پیش‌رو" hint={`${faNum(urgent.length)} اقدام فوری یا معوق`} action={<button className="la-btn la-btn-sm" onClick={() => setTab('actions')}>همه <ArrowLeft size={13} /></button>} pad={false}>
          {upcoming.length === 0 ? (
            <EmptyState icon={<CalendarClock size={20} />} title="اقدام بازی نیست" text="وقتی تاریخ مراحل یا فعالیت‌ها ثبت شود، اقدام‌های لازم اینجا ظاهر می‌شوند." />
          ) : (
            <ul className="m-0 list-none p-0">
              {upcoming.map((x) => (
                <li key={x.id}>
                  <button className="la-row" onClick={() => select(x.parcelId)}>
                    <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: x.severity === 'critical' ? '#ef4444' : x.severity === 'high' ? '#f97316' : x.severity === 'medium' ? '#eab308' : 'var(--la-line-2)' }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold leading-6">{x.title}</span>
                      <span className="la-eyebrow block">{fmtDate(x.due)}</span>
                    </span>
                    <span className="la-num shrink-0 text-[11.5px]" style={{ color: x.daysFromToday < 0 ? '#ef4444' : 'var(--la-ink-2)' }}>{relDays(x.daysFromToday)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function FacilityStat({ icon, label, done, total, color, onClick }: { icon: React.ReactNode; label: string; done: number; total: number; color: string; onClick: () => void }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-4 p-4 text-right" style={{ background: 'var(--la-surface)', border: 0, color: 'inherit', fontFamily: 'inherit', cursor: 'pointer' }}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="la-eyebrow block">{label}</span>
        <span className="la-num block text-[26px] font-bold leading-tight">{faNum(done)} <span className="text-[15px] font-semibold" style={{ color: 'var(--la-ink-2)' }}>از {faNum(total)}</span></span>
        <span className="la-bar mt-1.5" aria-hidden><i style={{ flexGrow: done, background: color }} /><i style={{ flexGrow: total - done }} /></span>
      </span>
      <span className="la-num text-[13px] font-bold" style={{ color }}>{faNum(pct)}٪</span>
    </button>
  )
}
