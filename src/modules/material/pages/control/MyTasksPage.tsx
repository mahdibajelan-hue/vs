import { useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { useMyTasks } from '../../lib/control/useMyTasks'
import { TASK_KIND_LABEL_FA, type MyTask, type TaskKind } from '../../lib/control/myTasks'
import { KpiCard } from '../../../finance/components/fn'
import { fa, openRecord } from '../../components/control/common'
import type { MatTab } from '../../MaterialApp'

/** «کارهای من»: what waits for the signed-in person across the module — stage decisions, rejected stages to fix, stages they own, requisitions to sign, discrepancies, changes and linked risks. */
export function MyTasksPage({ projectId, onGo }: { projectId: string; onGo: (t: MatTab, s?: string) => void }) {
  const m = useMaterialModel(projectId)
  const tasks = useMyTasks(m, projectId)
  const [kind, setKind] = useState<TaskKind | 'all'>('all')
  const kinds = useMemo(() => { const c = new Map<TaskKind, number>(); for (const t of tasks) c.set(t.kind, (c.get(t.kind) ?? 0) + 1); return c }, [tasks])
  const shown = kind === 'all' ? tasks : tasks.filter((t) => t.kind === kind)
  const open = (t: MyTask) => { if (t.go.record) openRecord(t.go.record.type, t.go.record.id, projectId); else onGo(t.go.tab as MatTab, t.go.sub) }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="کارهای باز من" value={fa(tasks.length)} tone={tasks.length ? 'warn' : 'good'} />
        <KpiCard i={1} label="فوری" value={fa(tasks.filter((t) => t.urgent).length)} tone={tasks.some((t) => t.urgent) ? 'bad' : 'good'} sub="دیرکرد یا معطل بیش از ۷ روز" />
        <KpiCard i={2} label="تصمیم و امضا" value={fa(tasks.filter((t) => t.kind === 'stage_decide' || t.kind === 'sign' || t.kind === 'change' || t.kind === 'txn').length)} />
        <KpiCard i={3} label="مرحله‌های من" value={fa(tasks.filter((t) => t.kind === 'stage_do' || t.kind === 'stage_fix').length)} />
      </div>
      <div className="mt-pills no-print">
        <button className={`mt-pill${kind === 'all' ? ' on' : ''}`} onClick={() => setKind('all')}>همه<em>{fa(tasks.length)}</em></button>
        {[...kinds].map(([k, n]) => <button key={k} className={`mt-pill${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{TASK_KIND_LABEL_FA[k]}<em>{fa(n)}</em></button>)}
      </div>
      {shown.length === 0 ? (
        <div className="im-card im-empty" style={{ padding: 30, display: 'grid', gap: 8, justifyItems: 'center' }}><CheckCircle2 size={28} style={{ color: 'var(--im-mint)' }} /><b>کار بازی برای شما نیست</b><span className="im-helper" style={{ margin: 0 }}>وقتی مرحله‌ای برای تصمیم شما برسد، مجوزی منتظر امضای شما باشد یا مرحله‌ای به شما سپرده شود، اینجا می‌آید.</span></div>
      ) : (
        <div className="mt-tasks">
          {shown.map((t) => (
            <button key={t.id} className={`mt-task${t.urgent ? ' urgent' : ''}`} onClick={() => open(t)}>
              <span className="mt-task-k">{TASK_KIND_LABEL_FA[t.kind]}</span>
              <b>{t.title}</b>
              <small>{t.sub}</small>
              <span className="mt-task-go" aria-hidden><ArrowLeft size={15} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
