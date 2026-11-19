import { useMemo } from 'react'
import { useExecutionStore } from '../store/useExecutionStore'
import { useEpcStore } from '../store/useEpcStore'
import { executionCore } from '../lib/executionCore'
import { SCOPE_FA, kindScopes, type ExScope, type ProjectKind } from '../../../lib/projectProfile'
import { useScopeStore } from '../store/useScopeStore'
import { pct } from './common'

/** A hybrid project: progress of the pipeline and of the compressor station side by side, next to the whole project's figure. */
export function ScopeSplit({ projectId, kind, total }: { projectId: string; kind: ProjectKind; total: number }) {
  const st = useExecutionStore()
  const welds = useEpcStore((x) => x.welds), lineWelds = useEpcStore((x) => x.lineWelds), actionRules = useEpcStore((x) => x.actionRules), workActions = useEpcStore((x) => x.workActions)
  const setView = useScopeStore((s) => s.setView)
  const rows = useMemo(() => kindScopes(kind).map((s: ExScope) => {
    const c = executionCore(st, { welds, lineWelds, actionRules, workActions }, projectId, undefined, { kind, view: s })
    return { s, approved: c.approved.overall, planned: c.planned.overall, acts: c.activities.length }
  }), [st, welds, lineWelds, actionRules, workActions, projectId, kind])
  return (
    <section className="im-card ex-split" aria-label="پیشرفت به تفکیک محدوده">
      <div className="ex-split-head"><b>پیشرفت به تفکیک محدوده</b><span>کل پروژه: <b>{pct(total)}</b></span></div>
      <div className="ex-split-rows">
        {rows.map((r) => (
          <button key={r.s} type="button" className="ex-split-row" onClick={() => setView(projectId, r.s)} title={`نمایش فقط ${SCOPE_FA[r.s]}`}>
            <span className="ex-split-name">{SCOPE_FA[r.s]}<small>{r.acts.toLocaleString('fa-IR')} ردیف</small></span>
            <span className="ex-split-bar" aria-hidden><i style={{ width: `${Math.min(100, r.approved * 100)}%` }} />{r.planned != null && <em style={{ insetInlineStart: `${Math.min(100, r.planned * 100)}%` }} />}</span>
            <span className="ex-split-val">{pct(r.approved)}{r.planned != null && <small>برنامه {pct(r.planned)}</small>}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
