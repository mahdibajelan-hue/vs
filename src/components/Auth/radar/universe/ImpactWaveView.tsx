import { useMemo } from 'react'
import { ISSUE_COLOR, SEVERITY_COLOR, SEVERITY_LABEL, type ImpactDimensions, type IssueUniverseNode, type RiskUniverseNode } from './universeTypes'

const DIMENSIONS: { key: keyof ImpactDimensions; label: string }[] = [
  { key: 'time', label: 'Time' },
  { key: 'cost', label: 'Cost' },
  { key: 'scope', label: 'Scope' },
  { key: 'quality', label: 'Quality' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'contract', label: 'Contract' },
]

function axisPoint(index: number, radiusFrac: number) {
  const angle = (index / DIMENSIONS.length) * 2 * Math.PI - Math.PI / 2
  return { x: 50 + radiusFrac * 42 * Math.cos(angle), y: 50 + radiusFrac * 42 * Math.sin(angle) }
}

export type ImpactSource =
  | { kind: 'risk'; node: RiskUniverseNode }
  | { kind: 'issue'; node: IssueUniverseNode }

/**
 * IMPACT mode: whichever Risk or Issue is selected becomes the epicenter, radiating its effect
 * across the six dimensions the brief calls out (Time/Cost/Scope/Quality/Procurement/Contract) as
 * a wave polygon, with expanding ripple rings whose speed encodes how fast the wave is spreading.
 * Generalized so either object family can be the source — a Risk shows its *projected* wave if
 * left unmanaged, an Issue shows the wave it has *already* created.
 */
export function ImpactWaveView({
  sources, selectedKey, onSelect, riskCodeById,
}: {
  sources: ImpactSource[]
  selectedKey: string | null
  onSelect: (key: string) => void
  riskCodeById: (id: string) => string | undefined
}) {
  const keyOf = (s: ImpactSource) => `${s.kind}:${s.node.id}`
  const selected = sources.find((s) => keyOf(s) === selectedKey) ?? sources[0] ?? null

  const { color, escalation, label, impact } = useMemo(() => {
    if (!selected) return { color: '#888', escalation: 0, label: '', impact: null as ImpactDimensions | null }
    if (selected.kind === 'issue') {
      return { color: ISSUE_COLOR, escalation: selected.node.escalation, label: 'ISSUE · ACTUAL IMPACT', impact: selected.node.impact }
    }
    return { color: SEVERITY_COLOR[selected.node.severity], escalation: selected.node.criticality, label: 'RISK · PROJECTED IMPACT', impact: selected.node.impact }
  }, [selected])

  if (!selected || !impact) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">No risks or issues to visualize.</div>
  }

  const polygonPoints = DIMENSIONS.map((d, i) => axisPoint(i, impact[d.key] / 100))
  const polygonPath = polygonPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
  const rippleDuration = Math.max(1.4, 3.2 - (escalation / 100) * 2.2)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {sources.map((s) => {
          const k = keyOf(s)
          const c = s.kind === 'issue' ? ISSUE_COLOR : SEVERITY_COLOR[s.node.severity]
          const active = k === keyOf(selected)
          return (
            <button
              key={k}
              onClick={() => onSelect(k)}
              className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors"
              style={{
                borderColor: active ? c : 'var(--border-soft)',
                color: active ? c : undefined,
                background: active ? `color-mix(in srgb, ${c} 12%, transparent)` : undefined,
              }}
            >
              {s.node.code}
            </button>
          )
        })}
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[480px] flex-1">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {[0.33, 0.66, 1].map((r) => (
            <circle key={r} cx="50" cy="50" r={r * 42} fill="none" stroke="var(--radar-grid)" strokeWidth="0.2" />
          ))}
          {DIMENSIONS.map((_, i) => {
            const p = axisPoint(i, 1)
            return <line key={i} x1="50" y1="50" x2={p.x} y2={p.y} stroke="var(--radar-grid)" strokeWidth="0.2" />
          })}

          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx="50" cy="50" r="4" fill="none" stroke={color} strokeWidth="0.6"
              className="universe-shockwave-ring"
              style={{ animationDuration: `${rippleDuration}s`, animationDelay: `${(i * rippleDuration) / 3}s` }}
            />
          ))}

          <path d={polygonPath} fill={`color-mix(in srgb, ${color} 22%, transparent)`} stroke={color} strokeWidth="0.6" strokeLinejoin="round" />
          {polygonPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="1.3" fill={color} />
          ))}
          <circle cx="50" cy="50" r="3.2" fill={color} opacity={0.9} />
        </svg>

        {DIMENSIONS.map((d, i) => {
          const p = axisPoint(i, 1.16)
          return (
            <span
              key={d.key}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-muted"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              {d.label} <span className="num" style={{ color }}>{impact[d.key]}</span>
            </span>
          )
        })}

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 translate-y-3 flex-col items-center text-center">
          <span className="num text-[11px] font-extrabold" style={{ color }}>{selected.node.code}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px]">
        <span className="rounded-full px-2 py-0.5 text-[9px] font-extrabold" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
          {label}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
        >
          {SEVERITY_LABEL[selected.node.severity]}
        </span>
        <span className="font-bold">{selected.node.title}</span>
        {selected.kind === 'issue' ? (
          <span className="num text-muted">· Aging {selected.node.agingDays}d · Escalation {selected.node.escalation}/100</span>
        ) : (
          <span className="num text-muted">· Criticality {selected.node.criticality}/100</span>
        )}
        {selected.kind === 'issue' && selected.node.causedByRiskIds.length > 0 && (
          <span className="text-muted">
            · Caused by{' '}
            {selected.node.causedByRiskIds.map((rid, i) => (
              <span key={rid} className="num font-bold" style={{ color: 'var(--radar-amber)' }}>
                {i > 0 && ', '}{riskCodeById(rid) ?? rid}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
