import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { DraftLine, PlacedSymbol } from '../../types'
import type { Point } from '../../lib/isoGeometry'
import { buildPathD } from '../../lib/isoGeometry'
import { SYMBOL_DEFS } from '../../data/pipingSymbols'

export interface CanvasSelection {
  kind: 'line' | 'symbol'
  id: string
}

export interface CanvasTarget {
  kind: 'background' | 'line' | 'symbol'
  id?: string
}

interface IsoCanvasProps {
  lines: DraftLine[]
  symbols: PlacedSymbol[]
  draftPoints: Point[]
  selection: CanvasSelection | null
  onCanvasClick: (point: Point, target: CanvasTarget) => void
  onHoverPoint?: (point: Point | null) => void
  hoverPreview?: Point | null
  onSymbolMove?: (id: string, point: Point) => void
}

export const CANVAS_WIDTH = 1200
export const CANVAS_HEIGHT = 700
const MIN_SCALE = 0.4
const MAX_SCALE = 4
const DRAG_THRESHOLD = 3

interface DragState {
  id: string
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  moved: boolean
  liveX: number
  liveY: number
}

export function IsoCanvas({ lines, symbols, draftPoints, selection, onCanvasClick, onHoverPoint, hoverPreview, onSymbolMove }: IsoCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)

  const toCanvasPoint = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = containerRef.current!.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left - transform.x) / transform.scale,
        y: (e.clientY - rect.top - transform.y) / transform.scale,
      }
    },
    [transform],
  )

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const cx = clientX - rect.left
    const cy = clientY - rect.top
    setTransform((t) => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor))
      const ratio = newScale / t.scale
      return { scale: newScale, x: cx - (cx - t.x) * ratio, y: cy - (cy - t.y) * ratio }
    })
  }, [])

  const zoomAtCenter = (factor: number) => {
    const rect = containerRef.current!.getBoundingClientRect()
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  const reset = () => setTransform({ x: 0, y: 0, scale: 1 })

  const startSymbolDrag = (e: React.MouseEvent, s: PlacedSymbol) => {
    e.stopPropagation()
    const next: DragState = {
      id: s.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: s.x,
      startY: s.y,
      moved: false,
      liveX: s.x,
      liveY: s.y,
    }
    dragRef.current = next
    setDrag(next)
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      const dx = (e.clientX - d.startClientX) / transform.scale
      const dy = (e.clientY - d.startClientY) / transform.scale
      const moved = d.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD
      const next = { ...d, moved, liveX: d.startX + dx, liveY: d.startY + dy }
      dragRef.current = next
      setDrag(next)
    }
    function onUp() {
      const d = dragRef.current
      if (!d) return
      if (d.moved) onSymbolMove?.(d.id, { x: d.liveX, y: d.liveY })
      else onCanvasClick({ x: d.startX, y: d.startY }, { kind: 'symbol', id: d.id })
      dragRef.current = null
      setDrag(null)
    }
    if (drag) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, transform.scale])

  return (
    <div className="relative h-full w-full overflow-auto rounded-2xl bg-black/10" dir="ltr" ref={containerRef}>
      <div
        className="cursor-crosshair"
        onWheel={handleWheel}
        onMouseMove={(e) => onHoverPoint?.(toCanvasPoint(e))}
        onMouseLeave={() => onHoverPoint?.(null)}
        onClick={(e) => onCanvasClick(toCanvasPoint(e), { kind: 'background' })}
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
        }}
      >
        <svg width={CANVAS_WIDTH} height={CANVAS_HEIGHT} viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}>
          <defs>
            <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="rgba(148,163,184,0.35)" />
            </pattern>
          </defs>
          <rect x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#dotgrid)" />

          {lines.map((line) => {
            const isSelected = selection?.kind === 'line' && selection.id === line.id
            const mid = line.points[Math.floor(line.points.length / 2)]
            return (
              <g key={line.id}>
                <path
                  d={buildPathD(line.points)}
                  fill="none"
                  stroke={isSelected ? '#38bdf8' : '#94a3b8'}
                  strokeWidth={isSelected ? 4.5 : 3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCanvasClick(toCanvasPoint(e), { kind: 'line', id: line.id })
                  }}
                />
                {mid && (
                  <text x={mid.x} y={mid.y - 8} fontSize="12" fill="#94a3b8" style={{ pointerEvents: 'none' }}>
                    {line.svgElementId}
                    {line.size ? ` (${line.size})` : ''}
                  </text>
                )}
              </g>
            )
          })}

          {draftPoints.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              <path d={buildPathD(draftPoints)} fill="none" stroke="#38bdf8" strokeWidth={2.5} strokeDasharray="6 4" />
              {hoverPreview && (
                <line
                  x1={draftPoints[draftPoints.length - 1].x}
                  y1={draftPoints[draftPoints.length - 1].y}
                  x2={hoverPreview.x}
                  y2={hoverPreview.y}
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
              )}
              {draftPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#38bdf8" />
              ))}
            </g>
          )}

          {symbols.map((s) => {
            const isSelected = selection?.kind === 'symbol' && selection.id === s.id
            const isDragging = drag?.id === s.id
            const px = isDragging ? drag.liveX : s.x
            const py = isDragging ? drag.liveY : s.y
            return (
              <g key={s.id} opacity={isDragging ? 0.75 : 1}>
                <g
                  transform={`translate(${px} ${py}) rotate(${s.rotation})`}
                  style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => startSymbolDrag(e, s)}
                  dangerouslySetInnerHTML={{ __html: SYMBOL_DEFS[s.type].markup }}
                />
                {isSelected && (
                  <circle cx={px} cy={py} r={16} fill="none" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 3" style={{ pointerEvents: 'none' }} />
                )}
                {s.type === 'fitting-tee' && (s.mainSize || s.branchSize) && (
                  <text x={px + 8} y={py - 10} fontSize="10" fill="#94a3b8" style={{ pointerEvents: 'none' }}>
                    {s.mainSize || '—'}x{s.branchSize || '—'}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 no-print">
        <button onClick={() => zoomAtCenter(1.25)} className="glass-panel rounded-lg p-2 hover:brightness-125 transition" title="بزرگنمایی">
          <ZoomIn size={16} />
        </button>
        <button onClick={() => zoomAtCenter(1 / 1.25)} className="glass-panel rounded-lg p-2 hover:brightness-125 transition" title="کوچک‌نمایی">
          <ZoomOut size={16} />
        </button>
        <button onClick={reset} className="glass-panel rounded-lg p-2 hover:brightness-125 transition" title="بازنشانی نما">
          <Maximize size={16} />
        </button>
      </div>
    </div>
  )
}
