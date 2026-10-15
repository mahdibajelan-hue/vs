import { useMemo, useState } from 'react'
import { CheckCircle2, Undo2 } from 'lucide-react'
import { addDays } from '../../execution/lib/periods'
import type { EpcModel } from '../../execution/lib/useEpcModel'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { KpiCard } from '../../finance/components/fn'
import { fa } from '../../execution/components/common'
import { COURT_COLOR, COURT_LABEL_FA, TASK_KIND_LABEL_FA, buildEngTasks, courtOf, nextMoves, type TaskKind } from '../lib/roles'
import { LensBar, useLens } from '../components/LensBar'

/** «کارهای من»: the documents whose next move belongs to the viewer's role — with the allowed moves right on the card (the database re-checks the role). */
export function EngMyTasks({ m, projectId }: { m: EpcModel; projectId: string }) {
  const epc = useEpcStore()
  const { lens, setLens, canSwitch, real } = useLens(projectId)
  const docs = epc.engDocs.filter((x) => x.projectId === projectId)
  const blocked = useMemo(() => new Set(m.impacts.filter((i) => i.state !== 'ok' && i.state !== 'restricted' && (!i.needDate || i.needDate <= addDays(m.today, 21))).map((i) => i.docId)), [m.impacts, m.today])
  const tasks = useMemo(() => buildEngTasks(docs, lens, m.today, blocked), [docs, lens, m.today, blocked])
  const [kind, setKind] = useState<TaskKind | 'all'>('all')
  const [note, setNote] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const kinds = useMemo(() => { const c = new Map<TaskKind, number>(); for (const t of tasks) c.set(t.kind, (c.get(t.kind) ?? 0) + 1); return c }, [tasks])
  const shown = kind === 'all' ? tasks : tasks.filter((t) => t.kind === kind)
  const byId = new Map(docs.map((x) => [x.id, x]))
  const move = async (id: string, to: Parameters<typeof epc.transitionDoc>[1]) => { setBusy(id); await epc.transitionDoc(id, to, note[id] ?? ''); setBusy('') }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <LensBar lens={lens} setLens={setLens} canSwitch={canSwitch} real={real} />
      <div className="fn-kpis">
        <KpiCard i={0} label="کارهای باز من" value={fa(tasks.length)} tone={tasks.length ? 'warn' : 'good'} />
        <KpiCard i={1} label="فوری" value={fa(tasks.filter((t) => t.urgent).length)} tone={tasks.some((t) => t.urgent) ? 'bad' : 'good'} sub="معوق، بحرانی یا مانع اجرا" />
        <KpiCard i={2} label="مانع اجرا" value={fa(tasks.filter((t) => t.blocking).length)} tone={tasks.some((t) => t.blocking) ? 'bad' : 'good'} />
        <KpiCard i={3} label="معوق" value={fa(tasks.filter((t) => t.overdueDays > 0).length)} tone={tasks.some((t) => t.overdueDays > 0) ? 'bad' : 'good'} />
      </div>
      <div className="mt-pills no-print">
        <button className={`mt-pill${kind === 'all' ? ' on' : ''}`} onClick={() => setKind('all')}>همه<em>{fa(tasks.length)}</em></button>
        {[...kinds].map(([k, n]) => <button key={k} className={`mt-pill${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{TASK_KIND_LABEL_FA[k]}<em>{fa(n)}</em></button>)}
      </div>
      {shown.length === 0 ? (
        <div className="im-card im-empty" style={{ padding: 30, display: 'grid', gap: 8, justifyItems: 'center' }}><CheckCircle2 size={28} style={{ color: 'var(--im-mint)' }} /><b>کار بازی برای شما نیست</b><span className="im-helper" style={{ margin: 0 }}>وقتی مدرکی به نوبت شما برسد یا از موعد بگذرد اینجا می‌آید.</span></div>
      ) : (
        <div className="mt-tasks">
          {shown.map((t) => {
            const row = byId.get(t.docId); if (!row) return null
            const moves = nextMoves(row.status, lens)
            return (
              <div key={t.id} className={`mt-task${t.urgent ? ' urgent' : ''}`} style={{ display: 'grid', gap: 6, cursor: 'default' }}>
                <span className="mt-task-k">{TASK_KIND_LABEL_FA[t.kind]}{t.blocking ? ' · مانع اجرا' : ''}{t.critical ? ' · بحرانی' : ''}</span>
                <b style={{ overflowWrap: 'anywhere' }}>{t.title}</b>
                <small style={{ overflowWrap: 'anywhere' }}>{t.sub}{t.overdueDays > 0 ? ` · ${fa(t.overdueDays)} روز معوق` : ''}</small>
                <small style={{ color: COURT_COLOR[courtOf(row.status)] }}>توپ دست: {COURT_LABEL_FA[courtOf(row.status)]}</small>
                {moves.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <input placeholder="توضیح (برای بازگشت یا محدودیت)" dir="auto" value={note[t.id] ?? ''} onChange={(e) => setNote({ ...note, [t.id]: e.target.value })} style={{ flex: '1 1 160px', minWidth: 0 }} aria-label="توضیح" />
                    {moves.map((mv) => <button key={mv.to + mv.label} disabled={busy === t.id} className={`im-btn im-btn-sm${mv.tone === 'go' ? ' im-btn-primary' : mv.tone === 'back' ? ' im-btn-danger' : ''}`} onClick={() => void move(t.id, mv.to)}>{mv.tone === 'back' && <Undo2 size={12} />} {mv.label}</button>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
