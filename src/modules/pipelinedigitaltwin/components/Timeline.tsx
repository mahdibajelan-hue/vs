import { useMemo, useRef, useState } from 'react'
import { CalendarClock, Flag } from 'lucide-react'
import { usePdtStore } from '../store/usePdtStore'
import { formatJalali } from '../../../lib/jalali'
import { computeTimelineSeries, type TimelineGranularity, type TimelinePoint } from '../lib/timelineSeries'

const WIDTH = 1000
const ROW_H = 30
const LABEL_W = 190
const PAD_TOP = 26
const PAD_BOTTOM = 10

interface Lane {
  key: keyof Omit<TimelinePoint, 'atIso'>
  label: string
  color: string
}

const LANES: Lane[] = [
  { key: 'overallPercent', label: 'پیشرفت کلی', color: '#94a3b8' },
  { key: 'weldingPercent', label: 'جوشکاری', color: '#38bdf8' },
  { key: 'coatingPercent', label: 'پوشش', color: '#f59e0b' },
  { key: 'loweringPercent', label: 'پایین‌آوری', color: '#a78bfa' },
  { key: 'backfillPercent', label: 'خاک‌ریزی', color: '#2ecc71' },
]

const GRANULARITIES: { value: TimelineGranularity; label: string }[] = [
  { value: 'day', label: 'روز' },
  { value: 'week', label: 'هفته' },
  { value: 'month', label: 'ماه' },
]

/**
 * Real per-activity progress lanes built from every joint's own append-only history log
 * (lib/timelineSeries.ts) — dot size/opacity encodes the actual sampled completion % at that
 * point in time, not a decorative milestone marker. Dragging anywhere on the chart scrubs the
 * whole dashboard (pipe color, joint markers, KPI numbers, elevation dots) to that moment, the
 * same `scrubDate` mechanism the header slider used before.
 */
export function Timeline() {
  const joints = usePdtStore((s) => s.joints)
  const projectCreatedAt = usePdtStore((s) => s.projectCreatedAt)
  const scrubDate = usePdtStore((s) => s.scrubDate)
  const setScrubDate = usePdtStore((s) => s.setScrubDate)
  const [granularity, setGranularity] = useState<TimelineGranularity>('week')
  const [showMilestones, setShowMilestones] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)

  const nowIso = useMemo(() => new Date().toISOString(), [])
  const startMs = useMemo(() => new Date(projectCreatedAt).getTime(), [projectCreatedAt])
  const nowMs = useMemo(() => new Date(nowIso).getTime(), [nowIso])
  const totalMs = Math.max(1, nowMs - startMs)

  const series = useMemo(() => computeTimelineSeries(joints, projectCreatedAt, nowIso, granularity), [joints, projectCreatedAt, nowIso, granularity])

  const chartW = WIDTH - LABEL_W
  const toX = (iso: string) => LABEL_W + ((new Date(iso).getTime() - startMs) / totalMs) * chartW

  const currentMs = scrubDate ? new Date(scrubDate).getTime() : nowMs
  const cursorX = LABEL_W + Math.min(1, Math.max(0, (currentMs - startMs) / totalMs)) * chartW

  const tickCount = 6
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => startMs + (totalMs * i) / tickCount)

  const handlePointer = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const fx = (clientX - rect.left) / rect.width
    const px = fx * WIDTH
    const t = Math.min(1, Math.max(0, (px - LABEL_W) / chartW))
    const ms = startMs + t * totalMs
    if (ms >= nowMs - 1000) {
      setScrubDate(null)
    } else {
      setScrubDate(new Date(ms).toISOString())
    }
  }

  const height = PAD_TOP + LANES.length * ROW_H + PAD_BOTTOM

  return (
    <div className="glass-panel shrink-0 rounded-2xl px-4 py-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-secondary">
          <CalendarClock size={13} /> جدول زمانی اجرا
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMilestones((v) => !v)}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${showMilestones ? 'border-brand-400/50 bg-brand-500/15 text-brand-300' : 'border-white/10 text-muted'}`}
          >
            <Flag size={10} /> نقاط عطف
          </button>
          <div className="flex overflow-hidden rounded-full border border-white/10">
            {GRANULARITIES.map((g) => (
              <button
                key={g.value}
                onClick={() => setGranularity(g.value)}
                className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${granularity === g.value ? 'bg-brand-500 text-white' : 'text-muted hover:bg-white/5'}`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full cursor-pointer select-none"
        style={{ height: `${height * 0.72}px` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          handlePointer(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) handlePointer(e.clientX)
        }}
      >
        {ticks.map((ms, i) => (
          <g key={i}>
            <line x1={LABEL_W + (chartW * i) / tickCount} y1={PAD_TOP - 10} x2={LABEL_W + (chartW * i) / tickCount} y2={height - PAD_BOTTOM} stroke="rgba(255,255,255,0.06)" />
            <text x={LABEL_W + (chartW * i) / tickCount} y={12} fontSize={9} fill="var(--text-muted, #7d8aa3)" textAnchor="middle" className="num">
              {formatJalali(new Date(ms).toISOString().slice(0, 10))}
            </text>
          </g>
        ))}

        {LANES.map((lane, li) => {
          const y = PAD_TOP + li * ROW_H + ROW_H / 2
          const latest = series[series.length - 1]?.[lane.key] ?? 0
          return (
            <g key={lane.key}>
              <text x={LABEL_W - 12} y={y + 3} fontSize={10} fontWeight={600} fill="#e5e9f0" textAnchor="end">
                {lane.label}
              </text>
              <text x={LABEL_W - 12} y={y + 3} fontSize={9} textAnchor="end" dx={-58} className="num" fill={lane.color}>
                {latest}%
              </text>
              <line x1={LABEL_W} y1={y} x2={WIDTH} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />
              {showMilestones &&
                series.map((p, pi) => {
                  const value = p[lane.key]
                  const filled = value >= 100
                  return <circle key={pi} cx={toX(p.atIso)} cy={y} r={filled ? 4 : 3} fill={filled ? lane.color : 'rgba(17,21,28,1)'} stroke={lane.color} strokeWidth={1.5} opacity={0.35 + (value / 100) * 0.65} />
                })}
            </g>
          )
        })}

        <line x1={cursorX} y1={PAD_TOP - 10} x2={cursorX} y2={height - PAD_BOTTOM} stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="3 2" />
        <rect x={cursorX - 20} y={PAD_TOP - 24} width={40} height={13} rx={6} fill="#38bdf8" />
        <text x={cursorX} y={PAD_TOP - 15} fontSize={8.5} fontWeight={700} fill="#0b1220" textAnchor="middle">
          {scrubDate ? 'گذشته' : 'امروز'}
        </text>
      </svg>
    </div>
  )
}
