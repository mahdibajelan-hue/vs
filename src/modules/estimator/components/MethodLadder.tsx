import type { EstMethod } from '../types'
import { METHOD_META, type MethodResult } from '../lib/methods'
import { BORDER, fmtEURm, INK, INK_SOFT, MUTED_FG, SURFACE_2 } from '../lib/theme'

/**
 * Every estimating method on one shared axis: a bar from its low to its high bound with a marker
 * at its estimate, so agreement (overlapping bars) or disagreement between methods is visible at
 * a glance. Methods without library data stay listed, greyed, with the reason — and every row
 * carries its numbers as text so colour is never the only cue.
 */
export function MethodLadder({ list, chosen, onPick }: { list: MethodResult[]; chosen?: EstMethod; onPick?: (m: EstMethod) => void }) {
  const avail = list.filter((m) => m.available)
  const lo = Math.min(...avail.map((m) => m.low)) * 0.92
  const hi = Math.max(...avail.map((m) => m.high)) * 1.04
  const pos = (v: number) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50)

  return (
    <div className="est-ladder" role="list">
      {list.map((m, i) => {
        const meta = METHOD_META[m.method]
        const on = chosen === m.method
        const Row = onPick ? 'button' : 'div'
        return (
          <Row key={m.method} role="listitem" type={onPick ? 'button' : undefined} disabled={onPick ? !m.available : undefined}
            onClick={onPick && m.available ? () => onPick(m.method) : undefined}
            className={`est-ladder-row ${on ? 'is-on' : ''} ${m.available ? '' : 'is-off'}`} style={{ ['--mc' as string]: meta.color, animationDelay: `${i * 70}ms` }}>
            <div className="est-ladder-label">
              <span className="est-ladder-dot" />
              <span className="min-w-0">
                <b>{meta.short}</b>
                <small>{m.available ? m.note : m.reason}</small>
              </span>
            </div>
            <div className="est-ladder-track" dir="ltr">
              {m.available && <>
                <span className="est-ladder-range" style={{ left: `${pos(m.low)}%`, width: `${Math.max(1, pos(m.high) - pos(m.low))}%` }} />
                <span className="est-ladder-mark" style={{ left: `${pos(m.eur)}%` }} />
              </>}
            </div>
            <div className="est-ladder-val est-mono">
              {m.available ? <><b>{fmtEURm(m.eur)}</b><small>{fmtEURm(m.low)} – {fmtEURm(m.high)}</small></> : <small>بدون داده</small>}
            </div>
          </Row>
        )
      })}
      <style>{LADDER_STYLE}</style>
    </div>
  )
}

const LADDER_STYLE = `
  .est-ladder { display: grid; gap: .45rem; }
  .est-ladder-row { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 2fr) auto; align-items: center; gap: .9rem; width: 100%; padding: .7rem .85rem; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; text-align: right; transition: border-color .18s ease, background .18s ease, transform .14s var(--ease); animation: est-fade-up .5s var(--ease) both; }
  button.est-ladder-row:hover:not(:disabled) { border-color: color-mix(in srgb, var(--mc) 55%, ${BORDER}); }
  button.est-ladder-row:active:not(:disabled) { transform: scale(.99); }
  .est-ladder-row.is-on { border-color: var(--mc); background: color-mix(in srgb, var(--mc) 9%, ${SURFACE_2}); box-shadow: 0 0 0 3px color-mix(in srgb, var(--mc) 14%, transparent); }
  .est-ladder-row.is-off { opacity: .55; }
  .est-ladder-label { display: flex; align-items: center; gap: .55rem; min-width: 0; }
  .est-ladder-label b { display: block; font-size: 13px; color: ${INK}; }
  .est-ladder-label small { display: block; font-size: 10.5px; color: ${MUTED_FG}; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .est-ladder-dot { width: 10px; height: 10px; border-radius: 3px; background: var(--mc); flex-shrink: 0; }
  .est-ladder-track { position: relative; height: 14px; border-radius: 99px; background: rgba(255,255,255,.04); }
  .est-ladder-range { position: absolute; top: 3px; bottom: 3px; border-radius: 99px; background: color-mix(in srgb, var(--mc) 45%, transparent); transform-origin: left; animation: est-grow .7s var(--ease) both; }
  .est-ladder-mark { position: absolute; top: -3px; width: 4px; height: 20px; margin-left: -2px; border-radius: 2px; background: var(--mc); box-shadow: 0 0 10px color-mix(in srgb, var(--mc) 70%, transparent); }
  .est-ladder-val { text-align: left; display: grid; }
  .est-ladder-val b { font-size: 14px; color: ${INK}; }
  .est-ladder-val small { font-size: 10.5px; color: ${INK_SOFT}; }
  @media (max-width: 640px) { .est-ladder-row { grid-template-columns: 1fr auto; } .est-ladder-track { grid-column: 1 / -1; grid-row: 2; } }
`
