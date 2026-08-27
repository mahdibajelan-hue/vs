import { useMemo, useState } from 'react'
import { SEVERITY_COLOR, SEVERITY_LABEL, type IssueUniverseNode } from './universeTypes'

const DIMENSIONS: { key: keyof IssueUniverseNode['impact']; label: string }[] = [
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

/**
 * The Issue Shockwave: a single issue at the epicenter, radiating impact across the six
 * dimensions the brief calls out (Time/Cost/Scope/Quality/Procurement/Contract) as a wave
 * polygon, plus expanding ripple rings whose speed encodes how fast the issue is escalating.
 */
export function IssueShockwaveView({
  issues, riskCodeById,
}: {
  issues: IssueUniverseNode[]
  riskCodeById: (id: string) => string | undefined
}) {
  const sorted = useMemo(() => [...issues].sort((a, b) => b.escalation - a.escalation), [issues])
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null)
  const selected = issues.find((i) => i.id === selectedId) ?? sorted[0] ?? null

  if (!selected) {
    return <div className="flex h-full items-center justify-center text-sm text-muted">No open issues right now.</div>
  }

  const color = SEVERITY_COLOR[selected.severity]
  const polygonPoints = DIMENSIONS.map((d, i) => axisPoint(i, selected.impact[d.key] / 100))
  const polygonPath = polygonPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z'
  const rippleDuration = Math.max(1.4, 3.2 - (selected.escalation / 100) * 2.2)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {sorted.map((iss) => (
          <button
            key={iss.id}
            onClick={() => setSelectedId(iss.id)}
            className="rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors"
            style={{
              borderColor: iss.id === selected.id ? SEVERITY_COLOR[iss.severity] : 'var(--border-soft)',
              color: iss.id === selected.id ? SEVERITY_COLOR[iss.severity] : undefined,
              background: iss.id === selected.id ? `color-mix(in srgb, ${SEVERITY_COLOR[iss.severity]} 12%, transparent)` : undefined,
            }}
          >
            {iss.code}
          </button>
        ))}
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[520px] flex-1">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
          {[0.33, 0.66, 1].map((r) => (
            <circle key={r} cx="50" cy="50" r={r * 42} fill="none" stroke="var(--radar-grid)" strokeWidth="0.2" />
          ))}
          {DIMENSIONS.map((_, i) => {
            const p = axisPoint(i, 1)
            return <line key={i} x1="50" y1="50" x2={p.x} y2={p.y} stroke="var(--radar-grid)" strokeWidth="0.2" />
          })}

          {/* Expanding ripple rings — speed encodes escalation. */}
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
              {d.label} <span className="num" style={{ color }}>{selected.impact[d.key]}</span>
            </span>
          )
        })}

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 translate-y-3 flex-col items-center text-center">
          <span className="num text-[11px] font-extrabold" style={{ color }}>{selected.code}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[11px]">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-extrabold"
          style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
        >
          {SEVERITY_LABEL[selected.severity]}
        </span>
        <span className="font-bold">{selected.title}</span>
        <span className="num text-muted">· Aging {selected.agingDays}d · Escalation {selected.escalation}/100</span>
        {selected.causedByRiskIds.length > 0 && (
          <span className="text-muted">
            · Caused by{' '}
            {selected.causedByRiskIds.map((rid, i) => (
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
