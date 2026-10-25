import { useMemo } from 'react'
import { useExecutionStore } from '../../store/useExecutionStore'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { executionCore } from '../../lib/executionCore'
import { useEpcStore } from '../../store/useEpcStore'
import { pct } from '../common'

/** Managers see every project they are allowed to read side by side (row-level security already filters what is loaded); a click opens that project. */
export function PortfolioStrip({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const st = useExecutionStore()
  const projects = useMasterDataStore((s) => s.projects)
  const epc = useEpcStore()
  const rows = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return projects.map((p) => {
      // the module's own computation (same as its pages), not a re-derivation
      const core = executionCore(st, epc, p.id, today)
      if (!core.activities.length) return null
      const act = core.approved.overall
      const plan = core.planned.overall
      const reports = core.reports
      return { id: p.id, name: p.officialName, act, plan, spi: plan && plan > 0 ? act / plan : null, waiting: reports.filter((r) => r.status === 'submitted' || r.status === 'partially_approved').length }
    }).filter((x): x is NonNullable<typeof x> => !!x)
  }, [projects, st, epc])
  if (rows.length < 2) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 14 }}>
      {rows.map((r) => (
        <button key={r.id} onClick={() => onPick(r.id)} className="im-card" aria-current={r.id === current} style={{ textAlign: 'start', padding: '10px 12px', display: 'grid', gap: 5, cursor: 'pointer', borderColor: r.id === current ? 'var(--im-accent)' : undefined }}>
          <b style={{ fontSize: 13 }}>{r.name}</b>
          <div style={{ height: 6, borderRadius: 6, background: 'rgba(148,163,184,.2)', position: 'relative' }}><i style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: `${r.act * 100}%`, background: 'var(--im-accent)', borderRadius: 6 }} />{r.plan != null && <b style={{ position: 'absolute', top: -3, insetInlineStart: `${r.plan * 100}%`, width: 2, height: 12, background: '#64748b' }} />}</div>
          <small style={{ color: 'var(--im-muted)' }}>واقعی {pct(r.act, 0)} · برنامه {pct(r.plan, 0)}{r.spi != null ? ` · SPI ${r.spi.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}` : ''}{r.waiting ? ` · ${r.waiting.toLocaleString('fa-IR')} در انتظار بررسی` : ''}</small>
        </button>))}
    </div>
  )
}
