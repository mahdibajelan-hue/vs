import { useMemo } from 'react'
import { useExecutionStore } from '../../store/useExecutionStore'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { physicalProgress, plannedOverall } from '../../lib/progress'
import { pct } from '../common'

/** Managers see every project they are allowed to read side by side (row-level security already filters what is loaded); a click opens that project. */
export function PortfolioStrip({ current, onPick }: { current: string; onPick: (id: string) => void }) {
  const st = useExecutionStore()
  const projects = useMasterDataStore((s) => s.projects)
  const rows = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return projects.map((p) => {
      const activities = st.activities.filter((a) => a.projectId === p.id)
      if (!activities.length) return null
      const baselines = st.baselines.filter((b) => b.projectId === p.id), ids = new Set(baselines.map((b) => b.id)), blines = st.blines.filter((l) => ids.has(l.baselineId))
      const reports = st.reports.filter((r) => r.projectId === p.id), rid = new Set(reports.map((r) => r.id)), lines = st.lines.filter((l) => rid.has(l.reportId))
      const gw = st.settingsByProject.get(p.id)?.groupWeights
      const act = physicalProgress({ activities, baselines, blines, reports, lines, asOf: today, mode: 'approved', groupWeights: gw }).overall
      const plan = plannedOverall({ activities, baselines, blines, asOf: today, groupWeights: gw }).overall
      return { id: p.id, name: p.officialName, act, plan, spi: plan && plan > 0 ? act / plan : null, waiting: reports.filter((r) => r.status === 'submitted' || r.status === 'partially_approved').length }
    }).filter((x): x is NonNullable<typeof x> => !!x)
  }, [projects, st.activities, st.baselines, st.blines, st.reports, st.lines, st.settingsByProject])
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
