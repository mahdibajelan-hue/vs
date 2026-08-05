import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { IsoLine } from '../../types'
import type { LineProgress } from '../../lib/progress'
import { STATUS_COLOR } from '../../types'
import { parseSvgCandidates } from '../../lib/svg'
import { indexElementsById } from '../../lib/lineMerge'

interface IsoViewportProps {
  svgRaw: string
  lines: IsoLine[]
  progressMap: Map<string, LineProgress>
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
  fixMode?: boolean
  selectedFragmentIds?: Set<string>
  onToggleFragment?: (elementId: string) => void
  onSvgReady?: (svgRoot: SVGSVGElement | null) => void
  /** Fired when the user drag-selects a rectangle over the canvas in fix mode, with the ids of every fragment it touches. */
  onMarqueeSelect?: (elementIds: string[]) => void
}

const MIN_SCALE = 0.3
const MAX_SCALE = 6

export function IsoViewport({
  svgRaw,
  lines,
  progressMap,
  selectedLineId,
  onSelectLine,
  fixMode = false,
  selectedFragmentIds,
  onToggleFragment,
  onSvgReady,
  onMarqueeSelect,
}: IsoViewportProps) {
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
  const marqueeState = useRef<{ active: boolean; startClientX: number; startClientY: number; endClientX: number; endClientY: number }>({
    active: false,
    startClientX: 0,
    startClientY: 0,
    endClientX: 0,
    endClientY: 0,
  })
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  // Built once per svgRaw injection (single DOM pass) and reused by every lookup below, instead of a fresh
  // querySelector (CSS-selector match) per element on every render — the previous approach turned every click
  // in fix mode into an O(candidate count) DOM scan, which got noticeably slow on CAD exports with hundreds+ fragments.
  const elementIndexRef = useRef<Map<string, SVGGraphicsElement>>(new Map())
  // Last-applied per-element state, so re-renders only touch the handful of elements that actually
  // changed (e.g. one toggled fragment) instead of re-writing style/class on every candidate every time.
  const lastColorStateRef = useRef<Map<string, string>>(new Map())
  const lastFixModeRef = useRef(false)
  const lastFixSelectedRef = useRef<Set<string>>(new Set())

  const candidateIds = useMemo(() => {
    try {
      return parseSvgCandidates(svgRaw).map((c) => c.elementId)
    } catch {
      return []
    }
  }, [svgRaw])

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
    elementIndexRef.current = indexElementsById(stageRef.current)
    lastColorStateRef.current = new Map()
    lastFixModeRef.current = false
    lastFixSelectedRef.current = new Set()
    setTransform({ x: 0, y: 0, scale: 1 })
    onSvgReady?.(svgEl as SVGSVGElement | null)
    // onSvgReady intentionally excluded — re-injecting innerHTML must only happen when the SVG itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgRaw])

  // Colorize + wire up interactivity whenever lines/progress/selection change.
  // Only touches elements whose (color, selected, lineId) actually changed since last run — with hundreds+
  // of fragments, re-writing every element's style/class on every click (e.g. just toggling one selection)
  // was the main source of per-interaction lag.
  useEffect(() => {
    if (!stageRef.current) return
    const index = elementIndexRef.current
    const nextState = new Map<string, string>()

    for (const line of lines) {
      const progress = progressMap.get(line.id)
      const color = STATUS_COLOR[progress?.status ?? line.status]
      const signature = `${color}|${line.id === selectedLineId}|${line.id}`
      for (const elementId of line.svgElementIds) {
        nextState.set(elementId, signature)
      }
    }

    for (const elementId of lastColorStateRef.current.keys()) {
      if (nextState.has(elementId)) continue
      const el = index.get(elementId)
      if (!el) continue
      el.style.stroke = ''
      el.style.color = ''
      el.classList.remove('iso-line-hit', 'is-selected')
      delete el.dataset.lineRef
    }

    for (const [elementId, signature] of nextState) {
      if (lastColorStateRef.current.get(elementId) === signature) continue
      const el = index.get(elementId)
      if (!el) continue
      const [color, isSelected, lineId] = signature.split('|')
      el.style.stroke = color
      el.style.color = color
      if (!el.getAttribute('data-orig-width')) {
        el.setAttribute('data-orig-width', el.getAttribute('stroke-width') ?? '3')
      }
      el.classList.add('iso-line-hit')
      el.dataset.lineRef = lineId
      el.classList.toggle('is-selected', isSelected === 'true')
    }

    lastColorStateRef.current = nextState
  }, [lines, progressMap, selectedLineId])

  // Fix-mode: make every identifiable fragment clickable for multi-select, independent of line assignment.
  // Candidate-class setup happens once per fix-mode entry; only the selection diff runs on every click.
  useEffect(() => {
    if (!stageRef.current) return
    const index = elementIndexRef.current

    if (!fixMode) {
      if (lastFixModeRef.current) {
        for (const id of candidateIds) {
          const el = index.get(id)
          if (!el) continue
          el.classList.remove('iso-fix-candidate', 'is-fix-selected')
          delete el.dataset.fixRef
        }
        lastFixModeRef.current = false
        lastFixSelectedRef.current = new Set()
      }
      return
    }

    if (!lastFixModeRef.current) {
      for (const id of candidateIds) {
        const el = index.get(id)
        if (!el) continue
        el.classList.add('iso-fix-candidate')
        el.dataset.fixRef = id
      }
      lastFixModeRef.current = true
    }

    const nextSelected = selectedFragmentIds ?? new Set<string>()
    for (const id of lastFixSelectedRef.current) {
      if (nextSelected.has(id)) continue
      index.get(id)?.classList.remove('is-fix-selected')
    }
    for (const id of nextSelected) {
      if (lastFixSelectedRef.current.has(id)) continue
      index.get(id)?.classList.add('is-fix-selected')
    }
    lastFixSelectedRef.current = new Set(nextSelected)
  }, [candidateIds, fixMode, selectedFragmentIds])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (fixMode) {
        const target = (e.target as SVGElement).closest?.('[data-fix-ref]') as HTMLElement | null
        if (target?.dataset.fixRef) onToggleFragment?.(target.dataset.fixRef)
        return
      }
      const target = (e.target as SVGElement).closest?.('[data-line-ref]') as HTMLElement | null
      if (target?.dataset.lineRef) {
        onSelectLine(target.dataset.lineRef)
      }
    },
    [fixMode, onToggleFragment, onSelectLine],
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      if (fixMode) {
        marqueeState.current = {
          active: true,
          startClientX: e.clientX,
          startClientY: e.clientY,
          endClientX: e.clientX,
          endClientY: e.clientY,
        }
        return
      }
      dragState.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        origX: transform.x,
        origY: transform.y,
      }
    },
    [transform.x, transform.y, fixMode],
  )

  const finishMarquee = useCallback(() => {
    const { startClientX, startClientY, endClientX, endClientY } = marqueeState.current
    const width = Math.abs(endClientX - startClientX)
    const height = Math.abs(endClientY - startClientY)
    if (width < 4 || height < 4) return // treat as a plain click, not a drag
    const left = Math.min(startClientX, endClientX)
    const right = Math.max(startClientX, endClientX)
    const top = Math.min(startClientY, endClientY)
    const bottom = Math.max(startClientY, endClientY)
    const index = elementIndexRef.current
    const matched: string[] = []
    for (const id of candidateIds) {
      const el = index.get(id)
      if (!el) continue
      const box = el.getBoundingClientRect()
      const intersects = box.left < right && box.right > left && box.top < bottom && box.bottom > top
      if (intersects) matched.push(id)
    }
    if (matched.length > 0) onMarqueeSelect?.(matched)
  }, [candidateIds, onMarqueeSelect])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragState.current.dragging) {
        const dx = e.clientX - dragState.current.startX
        const dy = e.clientY - dragState.current.startY
        setTransform((t) => ({ ...t, x: dragState.current.origX + dx, y: dragState.current.origY + dy }))
      }
      if (marqueeState.current.active) {
        marqueeState.current.endClientX = e.clientX
        marqueeState.current.endClientY = e.clientY
        const rect = containerRef.current?.getBoundingClientRect()
        if (rect) {
          const { startClientX, startClientY } = marqueeState.current
          setMarqueeRect({
            left: Math.min(startClientX, e.clientX) - rect.left,
            top: Math.min(startClientY, e.clientY) - rect.top,
            width: Math.abs(e.clientX - startClientX),
            height: Math.abs(e.clientY - startClientY),
          })
        }
      }
    }
    function onUp() {
      dragState.current.dragging = false
      if (marqueeState.current.active) {
        finishMarquee()
        marqueeState.current.active = false
        setMarqueeRect(null)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [finishMarquee])

  const reset = () => setTransform({ x: 0, y: 0, scale: 1 })

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl" ref={containerRef}>
      <div
        className={`h-full w-full active:cursor-grabbing ${fixMode ? 'cursor-pointer' : 'cursor-grab'}`}
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

      {marqueeRect && (
        <div
          className="pointer-events-none absolute rounded-sm border border-brand-400 bg-brand-400/15"
          style={{ left: marqueeRect.left, top: marqueeRect.top, width: marqueeRect.width, height: marqueeRect.height }}
        />
      )}

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
