import { forwardRef, type ReactNode } from 'react'
import { fa } from './common'
import { chainText } from '../lib/chainage'
import type { SectionView, Slot, StrungPipe } from '../lib/sections'

export const THK_COLORS = ['#38bdf8', '#a78bfa', '#f59e0b', '#f43f5e', '#10b981', '#eab308']
/** one colour per wall thickness, thinnest first — the same on the depot, the line and every summary */
export function thicknessColors(thks: (number | null)[]): Map<number, string> {
  const t = [...new Set(thks.filter((x): x is number => x != null))].sort((a, b) => a - b)
  return new Map(t.map((v, i) => [v, THK_COLORS[i % THK_COLORS.length]]))
}

export interface PipeLook { cls?: string; mark?: ReactNode; title?: string; onClick?: () => void; pressed?: boolean }

/**
 * A section of the line as it lies in the field: strung pipes end to end in chainage order (growing to the right),
 * coloured by wall thickness, and between neighbours the place of a joint. What a pipe or a joint place shows and does
 * is the caller's (`look`, `slot`); section ends and gaps are drawn here.
 */
export const LineStrip = forwardRef<HTMLDivElement, { view: SectionView; colors: Map<number, string>; look?: (p: StrungPipe) => PipeLook; slot: (s: Slot) => ReactNode; label: string }>(
  function LineStrip({ view, colors, look, slot, label }, ref) {
    return (
      <div className="sb-strip" ref={ref} dir="ltr" role="list" aria-label={label}>
        {view.pipes.map((p, i) => {
          const s = view.slots.find((x) => x.before.key === p.key)
          const lk = look?.(p) ?? {}
          const style = { ['--c' as string]: p.thkIn != null ? colors.get(p.thkIn) : '#64748b', width: `${Math.max(56, Math.min(96, p.lengthM * 6))}px` }
          const title = lk.title ?? `${p.raw} · ${p.lengthM} m · ${p.thkIn ?? '—'}″ · km ${chainText(p.km)}`
          const inner = <><b>{p.raw}</b><small>{fa(p.lengthM, 2)} م</small>{i % 5 === 0 && <em className="sb-km">{chainText(p.km)}</em>}{lk.mark}</>
          return (
            <span key={p.key} className="sb-cell" role="listitem" data-pipe={p.key}>
              {lk.onClick
                ? <button type="button" className={`sb-pipe sb-pipe-btn ${lk.cls ?? ''}`} style={style} title={title} aria-pressed={lk.pressed} onClick={lk.onClick}>{inner}</button>
                : <span className={`sb-pipe ${lk.cls ?? ''}`} style={style} title={title}>{inner}</span>}
              {s && (s.kind === 'boundary' ? <span className="sb-end" title={s.why}><span>انتهای سکشن</span></span>
                : s.kind === 'gap' ? <span className="sb-gap" title={s.why}><span>≈</span></span>
                : slot(s))}
            </span>
          )
        })}
      </div>
    )
  },
)
