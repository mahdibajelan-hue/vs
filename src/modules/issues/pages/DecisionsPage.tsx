import { useEffect, useMemo, useState } from 'react'
import { formatJalali } from '../../../lib/jalali'
import { useAuthStore } from '../../../store/useAuthStore'
import { useDecisionStore } from '../store/useDecisionStore'
import { DECISION_STATUS_FA, decisionHealth, decisionLateDays, delayImpact } from '../lib/imDecisions'
import { todayIso } from '../lib/issueRing'
import { useScoped } from '../lib/useScoped'
import { useUserDirectory } from '../lib/useUsers'
import { Kpi, Segmented } from '../components/ui'

const COLOR = { on_time: 'var(--im-mint)', due_soon: 'var(--im-amber)', overdue: 'var(--im-coral)', closed: 'var(--im-muted)' } as const

export function DecisionsPage({ onOpenIssue }: { onOpenIssue: (issueId: string) => void }) {
  const { loaded, fetchAll } = useDecisionStore()
  const { decisions, issues, projects, tasks } = useScoped()
  const users = useUserDirectory()
  const me = useAuthStore((s) => s.profile?.id)
  const [scope, setScope] = useState<'pending' | 'mine' | 'all'>('pending')
  const today = todayIso()
  useEffect(() => { if (!loaded) fetchAll() }, [loaded, fetchAll])

  const rows = useMemo(() => decisions.filter((d) => (scope === 'all' ? true : scope === 'mine' ? d.deciderId === me && d.status === 'pending' : d.status === 'pending')), [decisions, scope, me])
  const pending = decisions.filter((d) => d.status === 'pending')
  const overdue = pending.filter((d) => decisionHealth(d, today) === 'overdue')
  const waste = pending.reduce((s, d) => s + delayImpact(d.id, tasks, today).taskDays, 0)
  const decided = decisions.filter((d) => d.status === 'decided')
  const avgLate = decided.length ? Math.round((decided.reduce((s, d) => s + decisionLateDays(d, today), 0) / decided.length) * 10) / 10 : 0

  return (
    <div className="im-page">
      <div className="im-topbar">
        <div><div className="im-page-title">تصمیم‌ها</div><div className="im-page-sub">تصمیم‌های منتظر، معوق و هزینهٔ انتظار آن‌ها</div></div>
        <Segmented value={scope} onChange={setScope} options={[{ id: 'pending', label: 'منتظر تصمیم' }, { id: 'mine', label: 'با من' }, { id: 'all', label: 'همه' }]} />
      </div>
      <div className="im-kpi-grid">
        <Kpi label="منتظر تصمیم" value={pending.length} />
        <Kpi label="معوق" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} />
        <Kpi label="روز-اقدام تلف‌شده (مسدود)" value={waste} tone={waste ? 'warn' : 'good'} hint="مجموع روزهایی که اقدام‌ها منتظر تصمیم‌های باز مانده‌اند" />
        <Kpi label="میانگین تأخیر تصمیم‌های اتخاذشده (روز)" value={avgLate} />
      </div>
      {rows.length === 0 ? <div className="im-empty"><div className="im-big">⚖️</div>تصمیمی در این فهرست نیست</div> : (
        <div className="im-table-wrap"><table className="im-table"><thead><tr><th>شناسه</th><th>تصمیم</th><th>پروژه</th><th>تصمیم‌گیرنده</th><th>موعد</th><th>وضعیت</th><th>اثر انتظار</th></tr></thead>
          <tbody>{rows.map((d) => {
            const h = decisionHealth(d, today)
            const imp = delayImpact(d.id, tasks, today)
            const iss = issues.find((i) => i.id === d.issueId)
            return (
              <tr key={d.id} className="row" onClick={() => d.issueId && onOpenIssue(d.issueId)}>
                <td><span className="im-code">{d.code}</span></td>
                <td className="ttl" title={d.title}>{d.title}{iss && <div className="im-helper">{iss.code} · {iss.title}</div>}</td>
                <td style={{ color: 'var(--im-muted)' }}>{projects.find((p) => p.id === d.projectId)?.name}</td>
                <td>{users.name(d.deciderId)}</td>
                <td style={{ color: COLOR[h], whiteSpace: 'nowrap' }}>{d.neededBy ? formatJalali(d.neededBy) : '—'}</td>
                <td><span className="im-chip" style={{ color: COLOR[h] }}>{DECISION_STATUS_FA[d.status]}{decisionLateDays(d, today) > 0 && ` · ${decisionLateDays(d, today)} روز تأخیر`}</span></td>
                <td>{imp.blockedTasks ? `${imp.blockedTasks} اقدام · ${imp.taskDays} روز` : '—'}</td>
              </tr>
            )
          })}</tbody></table></div>
      )}
    </div>
  )
}
