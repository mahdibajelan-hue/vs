import { useMemo } from 'react'
import { Download } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { useIssuesStore } from '../store/useIssuesStore'
import { useIssueWorkStore } from '../store/useIssueWorkStore'
import { KPI_DEFS, agingBuckets, computeKpis, extensionImpact } from '../lib/imKpi'
import { clusterByCause } from '../lib/imText'
import { IM_CATEGORY_FA, isActiveIssue, isClosedIssue, stageOf } from '../lib/imModel'
import { todayIso } from '../lib/issueRing'
import { IssueCode } from '../components/ui'

export function KpiReportPage({ onSelectIssue }: { onSelectIssue: (id: string) => void }) {
  const issues = useIssuesStore((s) => s.issues)
  const projects = useIssuesStore((s) => s.projects)
  const tasks = useIssueWorkStore((s) => s.tasks)
  const exts = useIssueWorkStore((s) => s.extensions)
  const today = todayIso()
  const k = useMemo(() => computeKpis(issues, tasks, today), [issues, tasks, today])
  const ei = useMemo(() => extensionImpact(issues, exts), [issues, exts])
  const aging = useMemo(() => agingBuckets(issues, today), [issues, today])
  const clusters = useMemo(() => clusterByCause(issues), [issues])
  const byCategory = useMemo(() => {
    const m = new Map<string, { n: number; overdue: number; closed: number }>()
    for (const i of issues) {
      const key = i.category ?? 'none'
      const r = m.get(key) ?? { n: 0, overdue: 0, closed: 0 }
      r.n++
      if (isClosedIssue(i)) r.closed++
      else if (isActiveIssue(i) && (i.resolveDueDate ?? i.deadlineDate) < today) r.overdue++
      m.set(key, r)
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [issues, today])
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
  const overdueList = issues.filter((i) => isActiveIssue(i) && (i.resolveDueDate ?? i.deadlineDate) < today).slice(0, 12)

  return (
    <div>
      <div className="im-topbar">
        <div><div className="im-page-title">گزارش شاخص‌ها</div><div className="im-page-sub">همهٔ شاخص‌ها با فرمول شفاف؛ تمدیدها پنهان نمی‌شوند</div></div>
        <button className="im-btn im-btn-ghost im-btn-sm" onClick={exportKpis}><Download size={14} /> خروجی CSV</button>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">تعریف و مقدار شاخص‌ها</div>
        <div className="im-table-wrap" style={{ border: 'none' }}>
          <table className="im-table"><thead><tr><th>شاخص</th><th>مقدار</th><th>فرمول</th></tr></thead>
            <tbody>{KPI_DEFS.map((d) => <tr key={d.key}><td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{d.titleFa}</td><td style={{ fontWeight: 800, color: 'var(--im-amber)' }}>{values[d.key]}</td><td style={{ color: 'var(--im-muted-2)', fontSize: 12 }}>{d.formulaFa}{d.descriptionFa && <div className="im-helper">{d.descriptionFa}</div>}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="im-row" style={{ marginBottom: 14, alignItems: 'stretch' }}>
        <div className="im-card" style={{ flex: '1 1 300px' }}>
          <div className="im-section-title">انضباط تمدید</div>
          <div className="im-kv"><span>تمدید تأییدشده</span><b>{ei.approved}</b></div>
          <div className="im-kv"><span>در انتظار</span><b>{ei.pending}</b></div>
          <div className="im-kv"><span>ردشده</span><b>{ei.rejected}</b></div>
          <div className="im-kv"><span>میانگین جابه‌جایی سررسید</span><b>{num(ei.avgShiftDays, ' روز')}</b></div>
          <div className="im-kv" style={{ borderBottom: 'none' }}><span>مسائل با ≥ ۲ تمدید</span><b style={{ color: ei.repeatOffenders.length ? 'var(--im-coral)' : undefined }}>{ei.repeatOffenders.length}</b></div>
          {ei.repeatOffenders.map((id) => { const i = issues.find((x) => x.id === id); return i ? <button key={id} className="im-check" style={{ width: '100%', marginTop: 6, textAlign: 'right', cursor: 'pointer', color: 'var(--im-text)' }} onClick={() => onSelectIssue(id)}><IssueCode issue={i} /> {i.title}</button> : null })}
        </div>
        <div className="im-card" style={{ flex: '1 1 300px' }}>
          <div className="im-section-title">سن مسائل باز</div>
          {aging.map((a) => <div className="im-kv" key={a.key}><span>{a.label}</span><b>{a.count}</b></div>)}
        </div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">به تفکیک دسته</div>
        <div className="im-table-wrap" style={{ border: 'none' }}><table className="im-table"><thead><tr><th>دسته</th><th>کل</th><th>بسته‌شده</th><th>تأخیردار</th></tr></thead>
          <tbody>{byCategory.map(([key, r]) => <tr key={key}><td>{key === 'none' ? 'بدون دسته' : IM_CATEGORY_FA[key] ?? key}</td><td>{r.n}</td><td>{r.closed}</td><td style={{ color: r.overdue ? 'var(--im-coral)' : undefined, fontWeight: 700 }}>{r.overdue}</td></tr>)}</tbody></table></div>
      </div>

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">علل ریشه‌ای تکرارشونده <span className="im-helper">گروه‌بندی خودکار بر اساس شباهت متن؛ برای تصمیم، علت را مرور کنید</span></div>
        {clusters.length === 0 ? <div className="im-helper">هنوز علت ریشه‌ای مشابهی در چند مسئله ثبت نشده است.</div> : clusters.map((c) => (
          <div key={c.label} className="im-check" style={{ marginBottom: 6, justifyContent: 'space-between' }}>
            <span>{c.label}</span><span className="im-chip">{c.issueIds.length} مسئله</span>
          </div>
        ))}
      </div>

      <div className="im-card">
        <div className="im-section-title">فهرست تأخیردارها</div>
        <div className="im-table-wrap" style={{ border: 'none' }}><table className="im-table"><thead><tr><th>شناسه</th><th>عنوان</th><th>پروژه</th><th>مرحله</th><th>سررسید</th></tr></thead>
          <tbody>{overdueList.map((i) => <tr key={i.id} className="row" onClick={() => onSelectIssue(i.id)}><td><IssueCode issue={i} /></td><td className="ttl">{i.title}</td><td style={{ color: 'var(--im-muted)' }}>{projects.find((p) => p.id === i.projectId)?.name}</td><td>{stageOf(i)}</td><td>{formatJalali(i.resolveDueDate ?? i.deadlineDate)}</td></tr>)}</tbody></table>
          {overdueList.length === 0 && <div className="im-empty" style={{ padding: 20 }}>مورد تأخیردار وجود ندارد 🎯</div>}</div>
      </div>
    </div>
  )
}
const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('fa-IR')}٪`)
const num = (v: number | null, unit = '') => (v === null ? '—' : `${v.toLocaleString('fa-IR')}${unit}`)
