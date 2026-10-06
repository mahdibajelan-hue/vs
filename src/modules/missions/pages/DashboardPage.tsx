import { useMemo, useState } from 'react'
import { Activity, ArrowLeft, CircleCheck, Clock, FileCheck2, FileWarning, Inbox, Lightbulb, OctagonAlert, Sparkles, Ticket, TriangleAlert, UserCheck, UserRound, Users, Wallet } from 'lucide-react'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DEMO_MARKER, useMissionStore } from '../store/useMissionStore'
import { useNav } from '../nav'
import { ACTIVE_STATUSES, computeInsights, computeKpis, managerQuality, objectiveStatusMix, projectHeat, trendByMonth, type Insight } from '../lib/insights'
import { nextStepFor, STEPS, stepIndex } from '../lib/workflow'
import { faNum, shamsi } from '../lib/fa'
import { Avatar, Card, EmptyState, Kpi, Meter, Pill, SectionHead, SeverityDot, StatusPill } from '../components/ui'
import { MISSION_STATUS_LABEL } from '../types'
import type { PortfolioData } from '../repo/types'

const TONE_ICON = { bad: TriangleAlert, warn: TriangleAlert, info: Lightbulb, good: CircleCheck } as const
const TONE_VAR = { bad: 'var(--ms-bad)', warn: 'var(--ms-warn)', info: 'var(--ms-sky)', good: 'var(--ms-good)' } as const

export function DashboardPage() {
  const { go } = useNav()
  const user = useMissionStore((s) => s.user)
  const seedDemoData = useMissionStore((s) => s.seedDemoData)
  const clearDemoData = useMissionStore((s) => s.clearDemoData)
  const loading = useMissionStore((s) => s.loading)
  const portfolio = useMissionStore((s) => s.portfolio)
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const seesAll = !!user?.isManager || !!user?.isAdminAffairs

  const data: PortfolioData | null = useMemo(() => {
    if (!portfolio) return null
    if (scope === 'all' && seesAll) return portfolio
    const ids = new Set(portfolio.missions.filter((m) => m.requesterId === user?.id).map((m) => m.id))
    return {
      ...portfolio,
      missions: portfolio.missions.filter((m) => ids.has(m.id)),
      objectives: portfolio.objectives.filter((o) => ids.has(o.missionId)),
      findings: portfolio.findings.filter((f) => ids.has(f.missionId)),
      interviews: portfolio.interviews.filter((i) => ids.has(i.missionId)),
    }
  }, [portfolio, scope, seesAll, user?.id])

  const kpis = useMemo(() => (data ? computeKpis(data) : null), [data])
  const insights = useMemo(() => (data ? computeInsights(data) : []), [data])
  const trend = useMemo(() => (data ? trendByMonth(data) : []), [data])
  const heat = useMemo(() => (data ? projectHeat(data) : []), [data])
  const quality = useMemo(() => (data ? managerQuality(data) : []), [data])
  const objMix = useMemo(() => (data ? objectiveStatusMix(data.objectives, data.missions) : null), [data])

  if (!data || !kpis) return null

  const mine = data.missions.map((m) => ({ m, next: nextStepFor(m, user) })).filter((x) => x.next)
  const funnel = [...STEPS, 'پایان‌یافته'].map((label, i) => ({ label, count: data.missions.filter((m) => stepIndex(m.status) === i).length }))
  const total = data.missions.length

  if (!total) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card>
          <EmptyState
            icon={Inbox}
            title="هنوز مأموریتی ثبت نشده است"
            text="با ثبت اولین درخواست مأموریت و اهداف قابل‌اندازه‌گیری، چرخه بازدید → گزارش هوشمند → اقدام مدیریتی شروع می‌شود."
            action={
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button className="ms-btn ms-btn-primary" onClick={() => go({ kind: 'form' })}>
                  ثبت درخواست مأموریت
                </button>
                {user?.isAdmin && (
                  <button className="ms-btn" disabled={loading} onClick={() => seedDemoData()}>
                    {loading ? 'در حال ساخت…' : 'ساخت داده نمونه برای تجربه فرآیند'}
                  </button>
                )}
              </div>
            }
          />
        </Card>
      </div>
    )
  }

  const objPct = kpis.objectivesTotal ? Math.round((kpis.objectivesAchieved / kpis.objectivesTotal) * 100) : null

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {/* ------------------------------------------------------------------ title + scope */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="ms-eyebrow mb-1">{seesAll ? 'نگاه مدیریتی' : 'میز کار من'}</p>
          <h1 className="text-[22px] font-black leading-9">نبض بازدیدهای پروژه</h1>
          <p className="ms-ink2 text-[12.5px] leading-7">آنچه از بازدیدها بیرون می‌آید، نه فقط آنچه ثبت شده است.</p>
        </div>
        {seesAll && (
          <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--ms-panel-2)', border: '1px solid var(--ms-line)' }} role="group" aria-label="دامنه نمایش">
            <button className={`ms-chip ${scope === 'all' ? 'is-on' : ''}`} aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
              <Users size={13} aria-hidden /> همه
            </button>
            <button className={`ms-chip ${scope === 'mine' ? 'is-on' : ''}`} aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>
              <UserRound size={13} aria-hidden /> مأموریت‌های من
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Kpi icon={Activity} hue="var(--ms-accent)" label="مأموریت جاری" value={faNum(kpis.active)} onClick={() => go({ kind: 'list', filter: 'active' })} />
        <Kpi icon={UserCheck} hue="var(--ms-orange)" label="منتظر تأیید مجری طرح" value={faNum(kpis.awaitingRequestApproval)} tone={kpis.awaitingRequestApproval ? 'warn' : undefined} onClick={() => go({ kind: 'list', filter: 'pending_approval' })} />
        <Kpi icon={Ticket} hue="var(--ms-sky)" label="منتظر صدور بلیط" value={faNum(kpis.awaitingTicket)} tone={kpis.awaitingTicket ? 'warn' : undefined} onClick={() => go({ kind: 'list', filter: 'ticketing' })} />
        <Kpi icon={FileCheck2} hue="var(--ms-violet)" label="گزارش منتظر تأیید" value={faNum(kpis.awaitingReportReview)} tone={kpis.awaitingReportReview ? 'warn' : undefined} onClick={() => go({ kind: 'list', filter: 'report_review' })} />
        <Kpi icon={Wallet} hue="var(--ms-teal)" label="کلیم منتظر تأیید" value={faNum(kpis.awaitingClaim)} tone={kpis.awaitingClaim ? 'warn' : undefined} onClick={() => go({ kind: 'list', filter: 'claim' })} />
        <Kpi icon={CircleCheck} hue="var(--ms-emerald)" label="گزارش تکمیل‌شده" value={faNum(kpis.completedReports)} tone="good" onClick={() => go({ kind: 'list', filter: 'done' })} />
        <Kpi icon={FileWarning} hue="#d97706" label="گزارش ناقص" value={faNum(kpis.incompleteReports)} tone={kpis.incompleteReports ? 'warn' : undefined} onClick={() => go({ kind: 'list', filter: 'incomplete' })} />
        <Kpi icon={OctagonAlert} hue="var(--ms-rose)" label="Issue شناسایی‌شده" value={faNum(kpis.issues)} tone={kpis.issues ? 'bad' : undefined} sub={`${faNum(kpis.transferred)} منتقل‌شده`} onClick={() => go({ kind: 'findings' })} />
        <Kpi icon={TriangleAlert} hue="#c026d3" label="Risk شناسایی‌شده" value={faNum(kpis.risks)} onClick={() => go({ kind: 'findings' })} />
        <Kpi icon={Clock} hue="#be123c" label="اقدام و تعهد از موعد گذشته" value={faNum(kpis.overdue)} tone={kpis.overdue ? 'bad' : 'good'} sub={`از ${faNum(kpis.actions + kpis.commitments)} مورد`} onClick={() => go({ kind: 'findings' })} />
      </div>

      {/* ------------------------------------------------------------------ insights + queue */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <SectionHead eyebrow="بینش‌های هوشمند" title="چه چیزی نیاز به تصمیم دارد؟" sub="بر اساس قواعد مدیریتی روی داده‌های واقعی بازدیدها" />
          <ul className="flex flex-col gap-2.5">
            {insights.slice(0, 5).map((i) => (
              <InsightRow key={i.id} insight={i} onOpen={(id) => (id ? go({ kind: 'mission', id }) : go({ kind: 'list' }))} />
            ))}
          </ul>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <SectionHead eyebrow="نوبت شماست" title={seesAll ? 'در انتظار تصمیم یا اقدام شما' : 'قدم بعدی من'} />
          {mine.length === 0 ? (
            <EmptyState icon={CircleCheck} title="کار معوقی ندارید" text="هر مأموریتی که اقدام شما را بخواهد اینجا می‌آید." />
          ) : (
            <ul className="flex flex-col gap-2">
              {mine.slice(0, 6).map(({ m, next }) => (
                <li key={m.id}>
                  <button className="ms-card-flat flex w-full items-center gap-3 p-3 text-right transition-colors hover:border-[var(--ms-accent)]" onClick={() => go(next!.view)}>
                    <Avatar name={m.requesterName} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-extrabold">{next!.label}</span>
                      <span className="ms-muted block truncate text-[11px] leading-5">
                        {m.code} · {m.projectName}
                      </span>
                      <span className="ms-ink2 block truncate text-[11px] leading-5">{next!.hint}</span>
                    </span>
                    <ArrowLeft size={15} className="ms-muted shrink-0" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------------------ funnel + trend */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-2">
          <SectionHead eyebrow="مسیر مأموریت‌ها" title="هر مأموریت کجای فرآیند است؟" />
          <ol className="flex flex-col gap-2.5">
            {funnel.map((f, i) => (
              <li key={f.label} className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black" style={{ background: 'var(--ms-accent-soft)', color: 'var(--ms-accent)' }}>
                  {faNum(i + 1)}
                </span>
                <span className="w-32 shrink-0 text-[12px] font-bold">{f.label}</span>
                <div className="flex-1">
                  <Meter value={total ? (f.count / total) * 100 : 0} />
                </div>
                <span className="w-6 text-left text-[13px] font-black">{faNum(f.count)}</span>
              </li>
            ))}
          </ol>
          <p className="ms-muted mt-3 text-[11px] leading-6">
            {faNum(data.missions.filter((m) => ['rejected', 'cancelled'].includes(m.status)).length)} مورد ردشده یا لغوشده در این نمودار نیست.
          </p>
        </Card>

        <Card className="p-4 lg:col-span-3">
          <SectionHead eyebrow="روند" title="بازدیدها و یافته‌های ماهانه" sub="ستون: بازدید · خط: مسئله و ریسک کشف‌شده" />
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--ms-line)" vertical={false} />
                <XAxis dataKey="label" reversed tick={{ fill: 'var(--ms-ink-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} orientation="right" tick={{ fill: 'var(--ms-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => faNum(v)} />
                <Tooltip
                  contentStyle={{ background: 'var(--ms-panel)', border: '1px solid var(--ms-line-2)', borderRadius: 12, fontFamily: 'Vazirmatn', fontSize: 12 }}
                  labelStyle={{ color: 'var(--ms-ink)', fontWeight: 800 }}
                  formatter={(v, n) => [faNum(Number(v)), n === 'visits' ? 'بازدید' : 'مسئله/ریسک']}
                />
                <Bar dataKey="visits" fill="var(--ms-accent)" radius={[6, 6, 0, 0]} barSize={26} />
                <Line dataKey="findings" type="monotone" stroke="var(--ms-rose)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--ms-rose)' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ projects + people + objectives */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="overflow-hidden p-4 lg:col-span-3">
          <SectionHead eyebrow="پروژه‌ها" title="کدام پروژه توجه بیشتری می‌خواهد؟" />
          {heat.length === 0 ? (
            <p className="ms-muted py-6 text-center text-[12.5px]">پس از اولین گزارش تأییدشده، وضعیت پروژه‌ها اینجا می‌آید.</p>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="ms-table">
                <thead>
                  <tr>
                    <th>پروژه</th>
                    <th>شدت</th>
                    <th>Issue</th>
                    <th>Risk</th>
                    <th>انحراف پیشرفت</th>
                    <th>آخرین بازدید</th>
                  </tr>
                </thead>
                <tbody>
                  {heat.slice(0, 7).map((h) => (
                    <tr key={h.projectId}>
                      <td className="font-bold">{h.name}</td>
                      <td>{h.worst ? <SeverityDot severity={h.worst} withLabel /> : <span className="ms-muted">—</span>}</td>
                      <td>{faNum(h.issues)}</td>
                      <td>{faNum(h.risks)}</td>
                      <td>{h.progressGap == null ? <span className="ms-muted">—</span> : <span style={{ color: h.progressGap >= 10 ? 'var(--ms-bad)' : h.progressGap > 0 ? 'var(--ms-warn)' : 'var(--ms-good)', fontWeight: 800 }}>{h.progressGap > 0 ? `${faNum(h.progressGap)} واحد عقب` : h.progressGap < 0 ? `${faNum(-h.progressGap)} واحد جلوتر` : 'مطابق برنامه'}</span>}</td>
                      <td className="ms-ink2">{shamsi(h.lastVisit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card className="p-4">
            <SectionHead eyebrow="تحقق اهداف" title="اهداف مأموریت‌ها" />
            <div className="flex items-end gap-3">
              <p className="text-[34px] font-black leading-none" style={{ color: objPct == null ? 'var(--ms-muted)' : objPct >= 70 ? 'var(--ms-good)' : 'var(--ms-warn)' }}>
                {objPct == null ? '—' : `${faNum(objPct)}٪`}
              </p>
              <p className="ms-muted pb-1 text-[11.5px] leading-6">از {faNum(kpis.objectivesTotal)} هدف بازدیدهای انجام‌شده، کامل محقق شده</p>
            </div>
            {objMix && (
              <div className="mt-3 flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--ms-panel-2)' }} aria-hidden>
                {([['achieved', 'var(--ms-good)'], ['partial', 'var(--ms-warn)'], ['follow_up', 'var(--ms-orange)'], ['not_achieved', 'var(--ms-bad)']] as const).map(([k, c]) => (
                  <span key={k} style={{ width: `${kpis.objectivesTotal ? (objMix[k] / kpis.objectivesTotal) * 100 : 0}%`, background: c }} />
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionHead eyebrow="کیفیت گزارش" title="گزارش‌های مدیران پروژه" action={kpis.avgQuality != null ? <Pill tone={kpis.avgQuality >= 75 ? 'good' : kpis.avgQuality >= 60 ? 'warn' : 'bad'}>میانگین {faNum(kpis.avgQuality)}</Pill> : undefined} />
            {quality.length === 0 ? (
              <p className="ms-muted py-3 text-center text-[12.5px]">هنوز گزارش امتیازدهی‌شده‌ای نیست.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {quality.slice(0, 5).map((q) => (
                  <li key={q.personId} className="flex items-center gap-3">
                    <Avatar name={q.name} size={26} />
                    <span className="w-24 shrink-0 truncate text-[12px] font-bold">{q.name}</span>
                    <div className="flex-1">
                      <Meter value={q.avg} tone={q.avg >= 75 ? 'good' : q.avg >= 60 ? 'warn' : 'bad'} />
                    </div>
                    <span className="w-6 text-left text-[12.5px] font-black">{faNum(q.avg)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------------ recent */}
      <Card className="p-4">
        <SectionHead eyebrow="آخرین مأموریت‌ها" title="وضعیت مأموریت‌های اخیر" action={<button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={() => go({ kind: 'list' })}>همه مأموریت‌ها</button>} />
        <div className="-mx-2 overflow-x-auto">
          <table className="ms-table">
            <thead>
              <tr><th>کد</th><th>بازدیدکننده</th><th>پروژه</th><th>تاریخ</th><th>وضعیت</th><th>امتیاز گزارش</th></tr>
            </thead>
            <tbody>
              {data.missions.slice(0, 6).map((m) => (
                <tr key={m.id} className="is-click" onClick={() => go({ kind: 'mission', id: m.id })}>
                  <td className="font-bold">{m.code}</td>
                  <td>{m.requesterName}</td>
                  <td>{m.projectName}</td>
                  <td className="ms-ink2">{shamsi(m.startDate)}</td>
                  <td><StatusPill status={m.status} /></td>
                  <td>{m.qualityScore == null ? <span className="ms-muted">—</span> : <b style={{ color: m.qualityScore >= 75 ? 'var(--ms-good)' : m.qualityScore >= 60 ? 'var(--ms-warn)' : 'var(--ms-bad)' }}>{faNum(Math.round(m.qualityScore))}</b>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ms-muted mt-2 text-[11px]">وضعیت‌ها: {ACTIVE_STATUSES.slice(0, 3).map((s) => MISSION_STATUS_LABEL[s]).join('، ')} …</p>
      </Card>
      {user?.isAdmin && data.missions.some((m) => m.locationDetail === DEMO_MARKER) && (
        <p className="ms-muted text-center text-[11.5px]">
          برخی مأموریت‌ها داده نمونه هستند.{' '}
          <button className="underline underline-offset-2" onClick={() => window.confirm('همه مأموریت‌های نمونه حذف شود؟') && clearDemoData()}>حذف داده‌های نمونه</button>
        </p>
      )}
    </div>
  )
}

function InsightRow({ insight, onOpen }: { insight: Insight; onOpen: (missionId?: string) => void }) {
  const Icon = TONE_ICON[insight.tone]
  return (
    <li className="ms-card-flat flex gap-3 p-3.5" style={{ borderRight: `3px solid ${TONE_VAR[insight.tone]}` }}>
      <span className="mt-0.5 shrink-0" style={{ color: TONE_VAR[insight.tone] }}>
        <Icon size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold leading-7">{insight.title}</p>
        {insight.detail && <p className="ms-ink2 text-[12px] leading-7">{insight.detail}</p>}
        {insight.action && (
          <p className="mt-1 flex items-start gap-1.5 text-[11.5px] font-bold leading-6" style={{ color: 'var(--ms-accent)' }}>
            <Sparkles size={12} className="mt-1.5 shrink-0" aria-hidden /> {insight.action}
          </p>
        )}
      </div>
      {insight.missionIds.length > 0 && (
        <button className="ms-btn ms-btn-ghost ms-btn-sm self-center" onClick={() => onOpen(insight.missionIds.length === 1 ? insight.missionIds[0] : undefined)}>
          مشاهده
        </button>
      )}
    </li>
  )
}
