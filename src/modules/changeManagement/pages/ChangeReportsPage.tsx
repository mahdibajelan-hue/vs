import { useEffect, useMemo } from 'react'
import { ArrowRight, BarChart3, Clock, PieChart as PieChartIcon, TrendingUp } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { useChangeStore } from '../store/useChangeStore'
import { computeChangeImpact, computeStageDurations } from '../lib/changeCalc'
import {
  CHANGE_STATUS_COLOR, CHANGE_STATUS_LABEL_FA, CHANGE_TYPE_TAG_LABEL_FA, REVIEW_STAGE_LABEL_FA,
} from '../types'
import type { ChangeRequest, ChangeStatus, ChangeTypeTag } from '../types'

const TOOLTIP_STYLE = {
  background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 10, fontSize: 12,
}
const AXIS_STYLE = { fontSize: 10, fill: 'var(--text-muted)' }

export function ChangeReportsPage({ masterProjectId, projectName, requests, onBack }: {
  masterProjectId: string; projectName: string; requests: ChangeRequest[]; onBack: () => void
}) {
  const allReviews = useChangeStore((s) => s.allReviews)
  const loadingReports = useChangeStore((s) => s.loadingReports)
  const fetchAllReviews = useChangeStore((s) => s.fetchAllReviews)

  useEffect(() => {
    fetchAllReviews(masterProjectId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterProjectId])

  const active = useMemo(() => requests.filter((r) => r.status !== 'rejected'), [requests])
  const totalCost = active.reduce((sum, r) => sum + (r.approvedChangeAmount ?? r.proposedChangeAmount), 0)
  const totalDays = active.reduce((sum, r) => sum + (r.approvedScheduleImpactDays ?? r.proposedScheduleImpactDays), 0)
  const currency = requests[0]?.currency || 'IRR'

  const stageDurations = useMemo(() => computeStageDurations(requests, allReviews), [requests, allReviews])
  const stageChartData = stageDurations.map((d) => ({ name: REVIEW_STAGE_LABEL_FA[d.stage].replace('بررسی ', ''), 'میانگین روز': d.avgDays, count: d.count }))

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of requests) counts[r.status] = (counts[r.status] ?? 0) + 1
    return (Object.keys(counts) as ChangeStatus[]).map((s) => ({ name: CHANGE_STATUS_LABEL_FA[s], value: counts[s], color: CHANGE_STATUS_COLOR[s] }))
  }, [requests])

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<ChangeTypeTag, number>> = {}
    for (const r of requests) for (const t of r.changeTypes) counts[t] = (counts[t] ?? 0) + 1
    return (Object.keys(counts) as ChangeTypeTag[]).map((t) => ({ name: CHANGE_TYPE_TAG_LABEL_FA[t], value: counts[t] ?? 0 }))
  }, [requests])

  const monthlyTrend = useMemo(() => {
    const buckets = new Map<string, number>()
    for (const r of requests) {
      const key = r.createdAt.slice(0, 7)
      buckets.set(key, (buckets.get(key) ?? 0) + 1)
    }
    return [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-12).map(([month, count]) => ({ month, count }))
  }, [requests])

  const topImpact = useMemo(() => {
    return [...requests]
      .map((r) => ({ r, impact: computeChangeImpact(r) }))
      .sort((a, b) => b.impact.costPercent - a.impact.costPercent)
      .slice(0, 5)
  }, [requests])

  return (
    <div className="chg-scope min-h-screen w-screen" style={{ background: 'var(--bg-app)' }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} title="بازگشت" className="flex h-10 w-10 items-center justify-center rounded-xl border hover:bg-white/5" style={{ borderColor: 'var(--border-soft)' }}>
            <ArrowRight size={16} />
          </button>
          <div className="leading-tight">
            <p className="chg-title-gradient text-base font-extrabold tracking-wide">گزارش‌های مدیریت تغییرات</p>
            <p className="text-[10px] font-bold tracking-wide text-muted">CHANGE ANALYTICS &amp; CONTRACT IMPACT</p>
            <p className="text-[11px] text-muted">{projectName}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
        {loadingReports && <p className="text-sm text-muted">در حال بارگذاری…</p>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile icon={BarChart3} label="تعداد کل تغییرات" value={String(requests.length)} tileColor="var(--chg-accent)" />
          <KpiTile icon={TrendingUp} label="مجموع اثر مالی (این قرارداد)" value={money(totalCost, currency)} color={totalCost >= 0 ? '#ef4444' : '#2ecc71'} tileColor="var(--chg-rose)" />
          <KpiTile icon={Clock} label="مجموع اثر زمانی (این قرارداد)" value={`${totalDays > 0 ? '+' : ''}${totalDays} روز`} color={totalDays >= 0 ? '#ef4444' : '#2ecc71'} tileColor="var(--chg-amber)" />
          <KpiTile icon={PieChartIcon} label="میانگین کل چرخه بررسی" value={`${stageDurations.reduce((s, d) => s + d.avgDays, 0).toFixed(1)} روز`} tileColor="var(--chg-violet)" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ReportCard title="مدت زمان در دست بررسی هر واحد (میانگین روز)" icon={Clock}>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
                  <XAxis type="number" tick={AXIS_STYLE} />
                  <YAxis type="category" dataKey="name" width={90} tick={AXIS_STYLE} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, _n, p) => [`${v} روز (${p.payload.count} مورد)`, 'میانگین']} />
                  <Bar dataKey="میانگین روز" fill="var(--chg-accent, #6366f1)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ReportCard>

          <ReportCard title="روند ثبت تغییرات (ماهانه)" icon={TrendingUp}>
            <div style={{ height: 260 }}>
              {monthlyTrend.length === 0 ? (
                <p className="flex h-full items-center justify-center text-xs text-muted">داده‌ای برای نمایش نیست</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyTrend} margin={{ left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                    <XAxis dataKey="month" tick={AXIS_STYLE} />
                    <YAxis allowDecimals={false} tick={AXIS_STYLE} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} تغییر`, 'تعداد']} />
                    <Bar dataKey="count" name="تعداد" fill="#38bdf8" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ReportCard>

          <ReportCard title="توزیع وضعیت تغییرات" icon={PieChartIcon}>
            <div style={{ height: 260 }}>
              {statusCounts.length === 0 ? (
                <p className="flex h-full items-center justify-center text-xs text-muted">داده‌ای برای نمایش نیست</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusCounts} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} strokeWidth={0}>
                      {statusCounts.map((d) => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [`${v} مورد`, name]} />
                    <Legend verticalAlign="bottom" height={24} iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </ReportCard>

          <ReportCard title="توزیع نوع تغییرات" icon={BarChart3}>
            <div style={{ height: 260 }}>
              {typeCounts.length === 0 ? (
                <p className="flex h-full items-center justify-center text-xs text-muted">داده‌ای برای نمایش نیست</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeCounts} margin={{ left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                    <XAxis dataKey="name" tick={AXIS_STYLE} />
                    <YAxis allowDecimals={false} tick={AXIS_STYLE} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} مورد`, 'تعداد']} />
                    <Bar dataKey="value" name="تعداد" fill="#f0a836" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </ReportCard>
        </div>

        <ReportCard title="پرتأثیرترین تغییرات (بر اساس درصد اثر مالی)" icon={TrendingUp}>
          {topImpact.length === 0 ? (
            <p className="text-[11px] text-muted">داده‌ای برای نمایش نیست</p>
          ) : (
            <div className="space-y-1.5">
              {topImpact.map(({ r, impact }) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="num shrink-0 font-bold text-muted">{r.crNumber}</span>
                    <span className="min-w-0 truncate">{r.title || 'بدون عنوان'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num" style={{ color: impact.highFinancialImpact ? '#ef4444' : '#2ecc71' }}>{impact.costPercent.toFixed(2)}٪</span>
                    <span className="rounded-full px-2 py-0.5 text-[9.5px] font-bold" style={{ background: `color-mix(in srgb, ${CHANGE_STATUS_COLOR[r.status]} 18%, transparent)`, color: CHANGE_STATUS_COLOR[r.status] }}>
                      {CHANGE_STATUS_LABEL_FA[r.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ReportCard>

        <p className="text-center text-[9.5px] text-muted">
          «میزان تغییرات هر قرارداد» در محدوده همین پروژه/قرارداد محاسبه شده — تجمیع چندقراردادی مانند رول‌آپ سطح پورتفولیو در سایر ماژول‌ها بعداً قابل افزودن است.
        </p>
      </main>
    </div>
  )
}

function money(n: number, currency: string): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${Math.round(n).toLocaleString('en-US')} ${currency}`
}

function KpiTile({ icon: Icon, label, value, color, tileColor }: { icon: typeof Clock; label: string; value: string; color?: string; tileColor?: string }) {
  return (
    <div className="chg-card chg-kpi-tile rounded-2xl border p-3" style={{ borderColor: 'var(--border-soft)', ['--tile-color' as string]: tileColor }}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon size={13} aria-hidden="true" style={{ color: color ?? tileColor ?? 'var(--chg-accent)' }} />
      </div>
      <p className="num text-lg font-extrabold" style={{ color: color ?? tileColor }}>{value}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  )
}

function ReportCard({ title, icon: Icon, children }: { title: string; icon: typeof Clock; children: React.ReactNode }) {
  return (
    <div className="chg-card glass-panel rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)' }}>
      <p className="mb-3 flex items-center gap-2 text-[12px] font-bold text-muted"><span className="chg-icon-badge"><Icon size={13} /></span> {title}</p>
      {children}
    </div>
  )
}
