import { useEffect, useRef, useState, useCallback } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { IsoLine } from '../../types'
import type { LineProgress } from '../../lib/progress'
import { STATUS_COLOR } from '../../types'

interface IsoViewportProps {
  svgRaw: string
  lines: IsoLine[]
  progressMap: Map<string, LineProgress>
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
}

const MIN_SCALE = 0.3
const MAX_SCALE = 6

export function IsoViewport({ svgRaw, lines, progressMap, selectedLineId, onSelectLine }: IsoViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  })

  // Inject svg once per svgRaw change
  useEffect(() => {
    if (!stageRef.current) return
    stageRef.current.innerHTML = svgRaw
    const svgEl = stageRef.current.querySelector('svg')
    if (svgEl) {
      svgEl.setAttribute('width', '100%')
      svgEl.setAttribute('height', '100%')
      svgEl.style.display = 'block'
      svgEl.style.overflow = 'visible'
    }
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [svgRaw])

  // Colorize + wire up interactivity whenever lines/progress/selection change
  useEffect(() => {
    if (!stageRef.current) return
    const root = stageRef.current

    for (const line of lines) {
      const el = root.querySelector<SVGElement>(`#${cssEscape(line.svgElementId)}`)
      if (!el) continue
      const progress = progressMap.get(line.id)
      const color = STATUS_COLOR[progress?.status ?? line.status]
      el.style.stroke = color
      el.style.color = color
      if (!el.getAttribute('data-orig-width')) {
        el.setAttribute('data-orig-width', el.getAttribute('stroke-width') ?? '3')
      }
      el.classList.add('iso-line-hit')
      el.dataset.lineRef = line.id
      el.classList.toggle('is-selected', line.id === selectedLineId)
    }
  }, [lines, progressMap, selectedLineId])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as SVGElement).closest?.('[data-line-ref]') as HTMLElement | null
      if (target?.dataset.lineRef) {
        onSelectLine(target.dataset.lineRef)
      }
    },
    [onSelectLine],
  )

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = clientX - rect.left
    const cy = clientY - rect.top
    setTransform((t) => {
      const newScale = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE)
      const ratio = newScale / t.scale
      return {
        scale: newScale,
        x: cx - (cx - t.x) * ratio,
        y: cy - (cy - t.y) * ratio,
      }
    })
  }, [])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      zoomAt(e.clientX, e.clientY, factor)
    },
    [zoomAt],
  )

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: transform.x,
      origY: transform.y,
    }
  }, [transform.x, transform.y])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragState.current.dragging) return
      const dx = e.clientX - dragState.current.startX
      const dy = e.clientY - dragState.current.startY
      setTransform((t) => ({ ...t, x: dragState.current.origX + dx, y: dragState.current.origY + dy }))
    }
    function onUp() {
      dragState.current.dragging = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const reset = () => setTransform({ x: 0, y: 0, scale: 1 })

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl" ref={containerRef}>
      <div
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      >
        <div
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%',
            transition: dragState.current.dragging ? 'none' : 'transform 0.05s linear',
          }}
        >
          <div ref={stageRef} className="h-full w-full" style={{ color: '#94a3b8' }} />
        </div>
      </div>

      <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 no-print">
        <button
          onClick={() => zoomAt(containerRef.current!.clientWidth / 2 + containerRef.current!.getBoundingClientRect().left, containerRef.current!.clientHeight / 2 + containerRef.current!.getBoundingClientRect().top, 1.25)}
          className="glass-panel rounded-lg p-2 hover:brightness-125 transition"
          title="بزرگنمایی"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => zoomAt(containerRef.current!.clientWidth / 2 + containerRef.current!.getBoundingClientRect().left, containerRef.current!.clientHeight / 2 + containerRef.current!.getBoundingClientRect().top, 1 / 1.25)}
          className="glass-panel rounded-lg p-2 hover:brightness-125 transition"
          title="کوچک‌نمایی"
        >
          <ZoomOut size={16} />
        </button>
        <button onClick={reset} className="glass-panel rounded-lg p-2 hover:brightness-125 transition" title="بازنشانی نما">
          <Maximize size={16} />
        </button>
      </div>

      <div className="absolute bottom-4 right-4 glass-panel rounded-lg px-3 py-1.5 text-xs text-secondary num no-print">
        {Math.round(transform.scale * 100)}%
      </div>
    </div>
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function cssEscape(id: string) {
  if (window.CSS?.escape) return window.CSS.escape(id)
  return id.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}
