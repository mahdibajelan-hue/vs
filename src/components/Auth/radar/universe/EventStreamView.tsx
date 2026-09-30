import { useState } from 'react'
import { EVENT_KIND_COLOR, type EventChain, type EventKind } from './universeTypes'

/**
 * The Event Stream: every meaningful chain of causation rendered as a connected strip of
 * beacons — Event -> Trigger -> Risk -> Issue -> Impact -> Action -> Decision -> Resolution.
 * A chain that hasn't escalated all the way through simply stops at its current beacon, which
 * itself is informative (still open, not yet resolved).
 */
export function EventStreamView({ chains }: { chains: EventChain[] }) {
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pe-1">
      {chains.map((chain) => {
        const lastKind: EventKind = chain.steps[chain.steps.length - 1].kind
        const resolved = lastKind === 'resolution'
        return (
          <div key={chain.id} className="rounded-2xl border p-3.5" style={{ borderColor: 'var(--border-soft)' }}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[12px] font-bold">{chain.title}</p>
              <span
                className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold"
                style={{
                  borderColor: resolved ? 'color-mix(in srgb, var(--radar-green) 50%, transparent)' : 'var(--border-soft)',
                  color: resolved ? 'var(--radar-green)' : 'var(--radar-amber)',
                }}
              >
                {resolved ? 'RESOLVED' : 'IN PROGRESS'}
              </span>
            </div>
            <div className="relative flex items-start">
              <div className="absolute inset-x-3 top-[9px] h-px" style={{ background: 'var(--border-soft)' }} />
              {chain.steps.map((step, i) => {
                const key = `${chain.id}-${i}`
                const color = EVENT_KIND_COLOR[step.kind]
                const isLast = i === chain.steps.length - 1
                return (
                  <div key={key} className="relative flex flex-1 flex-col items-center gap-1.5">
                    <button
                      onMouseEnter={() => setHovered(key)}
                      onMouseLeave={() => setHovered((v) => (v === key ? null : v))}
                      className="relative z-10 h-[18px] w-[18px] rounded-full border-2 transition-transform hover:scale-125"
                      style={{
                        borderColor: color,
                        background: isLast ? color : `color-mix(in srgb, ${color} 25%, var(--bg-panel-solid))`,
                        boxShadow: isLast ? `0 0 10px 2px color-mix(in srgb, ${color} 55%, transparent)` : undefined,
                      }}
                      aria-label={step.label}
                    />
                    <span
                      className="text-center text-[8.5px] font-bold uppercase tracking-wide"
                      style={{ color: isLast ? color : 'var(--text-muted)' }}
                    >
                      {step.label}
                    </span>
                    {hovered === key && (
                      <span
                        className="pointer-events-none absolute bottom-full z-20 mb-1 whitespace-nowrap rounded-lg border px-2 py-1 text-[10px] font-bold"
                        style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', color: 'var(--text-primary)' }}
                      >
                        {step.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="num mt-2.5 text-[10px] text-muted">{chain.dateLabel}</p>
          </div>
        )
      })}
    </div>
  )
}
