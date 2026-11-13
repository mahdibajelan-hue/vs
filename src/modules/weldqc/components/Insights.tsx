import { useMemo, type CSSProperties } from 'react'
import { BrainCircuit, CheckCircle2, Info, TriangleAlert } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { codeOf, fa, useQc } from '../lib/useQc'
import { clockHotspot, filmQuality, patternInsights, repairHold, sameJoint, welderTrends, type ICrewSeg, type IDefect } from '../lib/insights'
import { CODE_FA } from '../lib/api1104'
import { GRADE_COLOR, GRADE_FA, type Health } from '../lib/health'

/** بینش‌های هوشمند — what the project's own records show, each with its evidence */
export function InsightsPanel({ onWelder }: { onWelder?: (key: string) => void }) {
  const st = useWqStore(); const q = useQc()
  const list = useMemo(() => {
    const ds: IDefect[] = st.defects.map((d) => ({ weldId: d.weldId, code: codeOf(d), type: d.type, clock: d.clock, pass: d.pass, quadrant: d.quadrant, welders: d.welders, round: d.round, verdict: d.verdict, removed: d.removed }))
    const results = [...q.welderStats.values()].flatMap((s) => s.results.map((r) => ({ key: s.key, ...r })))
    const segs: ICrewSeg[] = st.crew.filter((c) => !c.removed && c.quadrant > 0).map((c) => ({ weldId: c.weldId, welder: c.welderKey, pass: c.pass, quadrant: c.quadrant }))
    const reps = st.repairs.map((r) => { const nx = q.last.get(`${r.weldId}#${r.round + 1}`); return { performedBy: r.performedBy, ok: nx ? nx.overall === 'accept' : null } })
    return [...welderTrends(results, q.projectRate, q.nameOf), ...sameJoint(segs, ds, q.nameOf), ...clockHotspot(ds), ...patternInsights(ds, (c) => CODE_FA[c]), ...repairHold(reps, q.nameOf), ...filmQuality(st.films)]
  }, [st.defects, st.crew, st.repairs, st.films, q])
  return (
    <section className="wq-card wq-insights wq-rise" style={{ '--i': 2 } as CSSProperties}>
      <header className="wq-card-head"><BrainCircuit size={16} aria-hidden /><h3>بینش‌های هوشمند</h3><small className="ps-meta">از سوابق همین پروژه؛ هر مورد با شواهد و قاعده‌ای که آن را برانگیخته</small></header>
      {list.length ? <ul>{list.map((x) => { const I = x.tone === 'warn' ? TriangleAlert : x.tone === 'good' ? CheckCircle2 : Info; return (
        <li key={x.id} className={`is-${x.tone}`}><I size={18} aria-hidden /><div><b>{x.title}</b><p>{x.body}</p><small>شواهد: {x.evidence}{x.welder && onWelder ? <> · <button type="button" className="ps-link" onClick={() => onWelder(x.welder!)}>کارت جوشکار</button></> : null}</small></div></li>
      ) })}</ul> : <p className="ps-hint">هنوز الگوی معناداری دیده نشده است. با ثبت موقعیت ساعتی ناپیوستگی‌ها و جوشکاران هر ربع، تحلیل‌ها دقیق‌تر می‌شوند (حداقل ۶ عیب برای الگوی موقعیت، ۸ سرجوش برای روند هر جوشکار).</p>}
    </section>
  )
}

/** how the welds of the project spread over the health grades */
export function HealthSpread({ items, onPick }: { items: { id: string; h: Health }[]; onPick?: (g: Health['grade']) => void }) {
  const grades: Health['grade'][] = ['excellent', 'good', 'fair', 'poor', 'na']
  const n = (g: Health['grade']) => items.filter((x) => x.h.grade === g).length
  const scored = items.filter((x) => x.h.score != null)
  const avg = scored.length ? scored.reduce((s, x) => s + (x.h.score as number), 0) / scored.length : null
  return (
    <section className="wq-card wq-rise" style={{ '--i': 3 } as CSSProperties}>
      <header className="wq-card-head"><CheckCircle2 size={16} aria-hidden /><h3>شاخص سلامت سرجوش‌ها</h3><small className="ps-meta">میانگین {avg == null ? '—' : fa(avg)}</small></header>
      <div className="wq-hspread">{grades.map((g) => { const c = n(g); return <button key={g} type="button" style={{ '--c': GRADE_COLOR[g], '--w': `${(c / Math.max(1, items.length)) * 100}%` } as CSSProperties} onClick={() => onPick?.(g)}><b>{fa(c)}</b><span>{GRADE_FA[g]}</span><i /></button> })}</div>
    </section>
  )
}
