import { useMemo } from 'react'
import { Download, Gauge as GaugeIcon } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { IM_PRIORITY_LABEL_FA } from '../types'
import { KPI_DEFS, agingBuckets, computeKpis, extensionImpact, severityDistribution, stageDistribution, taskStatusDistribution, weeklyTrend } from '../lib/imKpi'
import { clusterByCause } from '../lib/imText'
import { IM_CATEGORY_FA, IM_STAGE_LABEL_FA, IM_TASK_STATUS_LABEL_FA, effectiveDue, isActiveIssue, isClosedIssue } from '../lib/imModel'
import { todayIso } from '../lib/issueRing'
import { useScoped } from '../lib/useScoped'
import { useIssueConfigStore } from '../store/useIssueConfigStore'
import { Donut, Gauge, HBars, Ring, StackBar, Trend, type Slice } from '../components/charts'
import { IssueCode } from '../components/ui'
import { HelpButton } from '../components/Help'

const SEV_COLOR = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#38bdf8' } as const
const STAGE_COLOR: Record<string, string> = { registered: '#a78bfa', validated: '#818cf8', analysis: '#60a5fa', action_plan: '#38bdf8', in_progress: '#f59e0b', resolution_review: '#2dd4bf', effectiveness_check: '#14b8a6', closed: '#34d399', returned: '#fb923c', reopened: '#f472b6', cancelled: '#64748b', duplicate: '#94a3b8' }
const TASK_COLOR: Record<string, string> = { not_started: '#94a3b8', in_progress: '#f59e0b', blocked: '#ef4444', pending_verification: '#8b5cf6', done: '#34d399', cancelled: '#64748b' }

const pct = (v: number | null) => (v === null ? '—' : `${v}٪`)
const num = (v: number | null, unit = '') => (v === null ? '—' : `${v}${unit}`)

export function KpiReportPage({ onSelectIssue }: { onSelectIssue: (id: string) => void }) {
  const sc = useScoped()
  const sla = useIssueConfigStore((s) => s.sla)
  const today = todayIso()
  const k = useMemo(() => computeKpis(sc.issues, sc.tasks, today), [sc.issues, sc.tasks, today])
  const ei = useMemo(() => extensionImpact(sc.issues, sc.extensions), [sc.issues, sc.extensions])
  const aging = useMemo(() => agingBuckets(sc.issues, today), [sc.issues, today])
  const trend = useMemo(() => weeklyTrend(sc.issues, today, 8), [sc.issues, today])
  const clusters = useMemo(() => clusterByCause(sc.issues), [sc.issues])
  const stages = useMemo(() => stageDistribution(sc.issues.filter(isActiveIssue)), [sc.issues])
  const sev = useMemo(() => severityDistribution(sc.issues), [sc.issues])
  const taskDist = useMemo(() => taskStatusDistribution(sc.tasks), [sc.tasks])
  const byCategory = useMemo(() => {
    const m = new Map<string, { n: number; late: number; closed: number }>()
    for (const i of sc.issues) {
      const key = i.category ?? 'none'
      const r = m.get(key) ?? { n: 0, late: 0, closed: 0 }
      r.n++
      if (isClosedIssue(i)) r.closed++
      else if (isActiveIssue(i) && effectiveDue(i) < today) r.late++
      m.set(key, r)
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [sc.issues, today])
  const values: Record<string, string> = {
    onTimeClosure: pct(k.onTimeClosure), onTimeClosureOriginal: pct(k.onTimeClosureOriginal), overdueRate: pct(k.overdueRate), avgResolutionDays: num(k.avgResolutionDays, ' روز'),
    avgAgeOpen: num(k.avgAgeOpen, ' روز'), reopenRate: pct(k.reopenRate), extensionRate: pct(k.extensionRate), rootCauseCoverage: pct(k.rootCauseCoverage),
    blockedCount: String(k.blockedCount), pendingVerification: String(k.pendingVerification), taskOnTime: pct(k.taskOnTime), backlogNetFlow: String(k.backlogNetFlow),
  }
  const exportKpis = () => {
    const rows = [['شاخص', 'مقدار', 'فرمول'], ...KPI_DEFS.map((d) => [d.titleFa, values[d.key], d.formulaFa])]
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `issue-kpis-${today}.csv`
    a.click()
  }
  const overdueList = sc.issues.filter((i) => isActiveIssue(i) && effectiveDue(i) < today).slice(0, 12)
  const targetResolve = sla.find((p) => p.severity === 'medium')?.resolveDays ?? 14

  const stageSlices: Slice[] = stages.map((s) => ({ key: s.stage, label: IM_STAGE_LABEL_FA[s.stage as keyof typeof IM_STAGE_LABEL_FA] ?? s.stage, value: s.count, color: STAGE_COLOR[s.stage] ?? '#94a3b8' }))
  const sevSlices: Slice[] = sev.map((s) => ({ key: s.severity, label: IM_PRIORITY_LABEL_FA[s.severity as keyof typeof IM_PRIORITY_LABEL_FA], value: s.count, color: SEV_COLOR[s.severity as keyof typeof SEV_COLOR] }))
  const taskSlices: Slice[] = taskDist.map((s) => ({ key: s.status, label: IM_TASK_STATUS_LABEL_FA[s.status as keyof typeof IM_TASK_STATUS_LABEL_FA], value: s.count, color: TASK_COLOR[s.status] }))

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title"><GaugeIcon size={22} style={{ color: 'var(--im-mint)' }} />شاخص‌ها و نمودارها</div><div className="im-page-sub">همهٔ شاخص‌ها با فرمول شفاف؛ تمدیدها پنهان نمی‌شوند</div></div>
        <div className="im-actions"><HelpButton topic="kpi" /><button className="im-btn im-btn-ghost im-btn-sm" onClick={exportKpis}><Download size={14} /> خروجی CSV</button></div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">کیفیت پیگیری <span className="im-helper">هر حلقه با فرمول خودش در جدول انتها تعریف شده است</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
          <Ring value={k.onTimeClosure} color="#34d399" label="بستن به‌موقع (مؤثر)" />
          <Ring value={k.onTimeClosureOriginal} color="#2dd4bf" label="بستن به‌موقع (اولیه)" sub="اثر تمدیدها دیده می‌شود" />
          <Ring value={k.rootCauseCoverage} color="#38bdf8" label="پوشش علت ریشه‌ای" />
          <Ring value={k.taskOnTime} color="#a78bfa" label="اقدام‌های به‌موقع" />
          <Ring value={k.reopenRate} color="#fb7185" label="بازگشایی" sub="کمتر بهتر" />
          <Ring value={k.extensionRate} color="#f59e0b" label="تمدید" sub="کمتر بهتر" />
        </div>
      </div>

      <div className="im-chart-grid" style={{ marginBottom: 14 }}>
        <div className="im-card im-chart-card"><div className="im-section-title">مسائل فعال به تفکیک مرحله</div><Donut slices={stageSlices} centerLabel="مسئلهٔ فعال" /></div>
        <div className="im-card im-chart-card"><div className="im-section-title">شدت مسائل فعال</div><Donut slices={sevSlices} centerLabel="مسئلهٔ فعال" /></div>
        <div className="im-card im-chart-card"><div className="im-section-title">وضعیت اقدام‌ها</div><Donut slices={taskSlices} centerLabel="اقدام" /></div>
      </div>

      <div className="im-chart-grid" style={{ marginBottom: 14 }}>
        <div className="im-card im-chart-card"><div className="im-section-title">روند هفتگی: ثبت‌شده و بسته‌شده</div>
          <Trend labels={trend.labels} series={[{ key: 'c', label: 'ثبت‌شده', color: '#f59e0b', values: trend.created }, { key: 'x', label: 'بسته‌شده', color: '#34d399', values: trend.closed }]} /></div>
        <div className="im-card im-chart-card"><div className="im-section-title">سن مسائل باز (روز)</div>
          <HBars rows={aging.map((a, i) => ({ key: a.key, label: a.label, value: a.count, color: ['#34d399', '#2dd4bf', '#f59e0b', '#f97316', '#ef4444'][i] }))} /></div>
        <div className="im-card im-chart-card"><div className="im-section-title">زمان رفع و تأخیر</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
            <Gauge value={k.avgResolutionDays} max={Math.max(targetResolve * 2, 1)} color={k.avgResolutionDays !== null && k.avgResolutionDays > targetResolve ? '#ef4444' : '#34d399'} label={`میانگین زمان رفع (هدف ${targetResolve} روز)`} display={k.avgResolutionDays === null ? undefined : `${k.avgResolutionDays}`} size={160} />
            <Gauge value={k.overdueRate} max={100} color={k.overdueRate !== null && k.overdueRate > 25 ? '#ef4444' : '#f59e0b'} label="نرخ تأخیر فعال" display={k.overdueRate === null ? undefined : `${k.overdueRate}٪`} size={160} />
          </div>
        </div>
      </div>

      <div className="im-chart-grid" style={{ marginBottom: 14 }}>
        <div className="im-card"><div className="im-section-title">به تفکیک دسته</div>
          <HBars rows={byCategory.map(([key, r]) => ({ key, label: key === 'none' ? 'بدون دسته' : IM_CATEGORY_FA[key] ?? key, value: r.n, hint: `${r.closed} بسته · ${r.late} تأخیردار`, color: r.late ? '#f97316' : '#38bdf8' }))} />
          <div className="im-helper">رنگ نارنجی = دستهٔ دارای تأخیر</div></div>
        <div className="im-card"><div className="im-section-title">انضباط تمدید</div>
          <StackBar slices={[{ key: 'a', label: 'تأییدشده', value: ei.approved, color: '#34d399' }, { key: 'p', label: 'در انتظار', value: ei.pending, color: '#f59e0b' }, { key: 'r', label: 'ردشده', value: ei.rejected, color: '#ef4444' }]} />
          <div className="im-kv" style={{ marginTop: 10 }}><span>میانگین جابه‌جایی سررسید</span><b>{num(ei.avgShiftDays, ' روز')}</b></div>
          <div className="im-kv" style={{ borderBottom: 'none' }}><span>مسائل با ≥ ۲ تمدید</span><b style={{ color: ei.repeatOffenders.length ? 'var(--im-coral)' : undefined }}>{ei.repeatOffenders.length}</b></div>
          {ei.repeatOffenders.map((id) => { const i = sc.issues.find((x) => x.id === id); return i ? <button key={id} className="im-check" style={{ width: '100%', marginTop: 6, textAlign: 'right', cursor: 'pointer', color: 'var(--im-text)' }} onClick={() => onSelectIssue(id)}><IssueCode issue={i} /> {i.title}</button> : null })}</div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">علل ریشه‌ای تکرارشونده <span className="im-helper">گروه‌بندی خودکار بر اساس شباهت متن</span></div>
        {clusters.length === 0 ? <div className="im-helper">هنوز علت ریشه‌ای مشابهی در چند مسئله ثبت نشده است.</div> : clusters.map((c) => <div key={c.label} className="im-check" style={{ marginBottom: 6, justifyContent: 'space-between' }}><span>{c.label}</span><span className="im-chip">{c.issueIds.length} مسئله</span></div>)}
      </div>

      <details className="im-card" style={{ marginBottom: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 14 }}>تعریف دقیق و مقدار شاخص‌ها ({KPI_DEFS.length})</summary>
        <div className="im-table-wrap" style={{ border: 'none', marginTop: 10, boxShadow: 'none' }}>
          <table className="im-table"><thead><tr><th>شاخص</th><th>مقدار</th><th>فرمول</th></tr></thead>
            <tbody>{KPI_DEFS.map((d) => <tr key={d.key}><td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{d.titleFa}</td><td style={{ fontWeight: 800, color: 'var(--im-accent)' }}>{values[d.key]}</td><td style={{ color: 'var(--im-muted-2)', fontSize: 12 }}>{d.formulaFa}{d.descriptionFa && <div className="im-helper">{d.descriptionFa}</div>}</td></tr>)}</tbody></table>
        </div>
      </details>

      <div className="im-card">
        <div className="im-section-title">فهرست تأخیردارها</div>
        <div className="im-table-wrap" style={{ border: 'none', boxShadow: 'none' }}><table className="im-table"><thead><tr><th>شناسه</th><th>عنوان</th><th>پروژه</th><th>سررسید</th></tr></thead>
          <tbody>{overdueList.map((i) => <tr key={i.id} className="row" onClick={() => onSelectIssue(i.id)}><td><IssueCode issue={i} /></td><td className="ttl">{i.title}</td><td style={{ color: 'var(--im-muted)' }}>{sc.projects.find((p) => p.id === i.projectId)?.name}</td><td>{formatJalali(effectiveDue(i))}</td></tr>)}</tbody></table>
          {overdueList.length === 0 && <div className="im-empty" style={{ padding: 20 }}>مورد تأخیردار وجود ندارد 🎯</div>}</div>
      </div>
    </div>
  )
}
