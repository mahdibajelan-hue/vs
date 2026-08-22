import { useMemo } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { deriveMilestoneStatus } from '../lib/milestones'
import type { DerivedHealth } from '../lib/health'
import type { StageReadiness } from '../lib/readiness'
import {
  HEALTH_DIMENSION_LABEL_FA, MILESTONE_STATUS_LABEL_FA, STAGE_LABEL_FA,
  type Milestone, type MilestoneForecastPoint, type MilestoneStatus, type StageKey,
} from '../types'
import { STATUS_COLOR, faNum } from './ui'

/**
 * The Control Tower's charts. Four different shapes because they answer four different shapes of
 * question, not for variety's sake:
 *
 *   radar  — is the project balanced, or is one dimension dragging everything down?
 *   bars   — which stages are actually finished, and where does readiness fall off a cliff?
 *   donut  — what is the composition of the milestone book right now?
 *   area   — is delay growing over time, i.e. is this a trend or a one-off slip?
 *
 * All four are wrapped in dir="ltr": Recharts positions its axes from a left-to-right assumption,
 * and an RTL parent mirrors the plot away from its labels.
 */

const AXIS = { fill: 'var(--text-muted)', fontSize: 9 }

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(15,23,42,0.96)',
    border: '1px solid rgba(148,163,184,0.25)',
    borderRadius: 10,
    fontSize: 11,
    padding: '6px 10px',
    direction: 'rtl' as const,
  },
  labelStyle: { color: '#e2e8f0', fontWeight: 700, fontSize: 11 },
  itemStyle: { color: '#cbd5e1', fontSize: 11 },
}

/* ------------------------------------------------------------------ radar */

/** Balance across the ten health dimensions. A spiky shape is the interesting one. */
export function HealthRadar({ health }: { health: DerivedHealth[] }) {
  const data = health.map((h) => ({
    dimension: HEALTH_DIMENSION_LABEL_FA[h.dimension],
    score: h.score,
  }))

  return (
    <div dir="ltr" style={{ width: '100%', height: 250 }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="68%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <PolarGrid stroke="rgba(148,163,184,0.18)" />
          <PolarAngleAxis dataKey="dimension" tick={AXIS} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="امتیاز"
            dataKey="score"
            stroke="#38bdf8"
            fill="#38bdf8"
            fillOpacity={0.28}
            strokeWidth={2}
            isAnimationActive
            animationDuration={900}
          />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${faNum(Number(v))} از ۱۰۰`, 'امتیاز']} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------- bars */

/** Readiness per stage, in lifecycle order. Blocked stages are drawn slate, never a warm colour —
 * a 90% blocked stage must not look nearly-open. */
export function StageReadinessBars({
  readiness, stageOrder,
}: {
  readiness: StageReadiness[]
  stageOrder: string[]
}) {
  const data = useMemo(() => {
    const byKey = new Map(readiness.map((r) => [r.stageKey, r]))
    return stageOrder
      .map((k) => {
        const r = byKey.get(k)
        if (!r) return null
        return {
          name: STAGE_LABEL_FA[k as StageKey] ?? k,
          percent: r.percent,
          blocked: r.blockers.length > 0,
          blockers: r.blockers.length,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [readiness, stageOrder])

  if (data.length === 0) return null

  return (
    <div dir="ltr" style={{ width: '100%', height: Math.max(200, data.length * 24) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, bottom: 4, left: 4 }} barSize={10}>
          <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.12)" />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={78} tick={AXIS} axisLine={false} tickLine={false} />
          <ReferenceLine x={100} stroke="rgba(148,163,184,0.35)" strokeDasharray="3 3" />
          <Tooltip
            {...TOOLTIP_STYLE}
            cursor={{ fill: 'rgba(148,163,184,0.06)' }}
            formatter={(v, _n, item) => {
              const p = item?.payload as { blockers: number } | undefined
              return [
                `${faNum(Number(v))}٪${p && p.blockers > 0 ? ` — ${faNum(p.blockers)} مانع عبور` : ''}`,
                'آمادگی',
              ]
            }}
          />
          <Bar dataKey="percent" radius={[0, 5, 5, 0]} fillOpacity={0.82} isAnimationActive animationDuration={800}>
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={d.blocked ? '#64748b' : d.percent >= 80 ? STATUS_COLOR.green : d.percent >= 50 ? STATUS_COLOR.yellow : STATUS_COLOR.red}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ donut */

const MS_COLOR: Record<MilestoneStatus, string> = {
  achieved: STATUS_COLOR.green,
  on_track: '#38bdf8',
  at_risk: STATUS_COLOR.yellow,
  delayed: STATUS_COLOR.red,
  blocked: STATUS_COLOR.black,
}

/** Composition of the milestone book. The centre carries the number that matters — how many are
 * already achieved — so the donut is not just a coloured ring. */
export function MilestoneDonut({ milestones }: { milestones: Milestone[] }) {
  const { data, achieved, total } = useMemo(() => {
    const counts = new Map<MilestoneStatus, number>()
    for (const m of milestones) {
      const s = deriveMilestoneStatus(m)
      counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    return {
      data: [...counts.entries()].map(([status, value]) => ({
        name: MILESTONE_STATUS_LABEL_FA[status],
        value,
        status,
      })),
      achieved: counts.get('achieved') ?? 0,
      total: milestones.length,
    }
  }, [milestones])

  if (total === 0) return <p className="py-10 text-center text-[11px] text-muted">Milestoneای ثبت نشده است</p>

  return (
    <div className="relative" dir="ltr" style={{ width: '100%', height: 230 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive
            animationDuration={800}
          >
            {data.map((d) => <Cell key={d.status} fill={MS_COLOR[d.status]} />)}
          </Pie>
          <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [`${faNum(Number(v))} مورد`, String(n)]} />
          <Legend
            verticalAlign="bottom"
            height={28}
            formatter={(v) => <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-[38%] -translate-y-1/2 text-center" dir="rtl">
        <div className="plc-num text-xl font-extrabold" style={{ color: STATUS_COLOR.green }}>
          {faNum(achieved)}
        </div>
        <div className="text-[9px] text-muted">محقق‌شده از {faNum(total)}</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- area */

/** Forecast drift over time: the running worst-case delay each time a forecast was revised.
 * A rising curve is the whole point — one slip is an event, a rising curve is a trend. */
export function DriftTrendChart({
  history, milestones,
}: {
  history: MilestoneForecastPoint[]
  milestones: Milestone[]
}) {
  const data = useMemo(() => {
    if (history.length === 0) return []
    const critical = new Set(milestones.filter((m) => m.isCritical).map((m) => m.id))
    const sorted = [...history].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))

    // Bucket by revision day; within a day take the largest delay recorded, since the manager
    // cares about the worst outstanding slip, not the average of that day's paperwork.
    const byDay = new Map<string, { max: number; criticalMax: number }>()
    for (const p of sorted) {
      const day = p.recordedAt.slice(0, 10)
      const cur = byDay.get(day) ?? { max: 0, criticalMax: 0 }
      cur.max = Math.max(cur.max, p.varianceDays)
      if (critical.has(p.milestoneId)) cur.criticalMax = Math.max(cur.criticalMax, p.varianceDays)
      byDay.set(day, cur)
    }
    return [...byDay.entries()].map(([day, v], i) => ({
      idx: i + 1,
      day,
      delay: v.max,
      criticalDelay: v.criticalMax,
    }))
  }, [history, milestones])

  if (data.length < 2) {
    return (
      <p className="py-10 text-center text-[11px] text-muted">
        برای رسم روند، حداقل دو بازنگری پیش‌بینی لازم است.
      </p>
    )
  }

  return (
    <div dir="ltr" style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: -18 }}>
          <defs>
            <linearGradient id="plcDrift" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STATUS_COLOR.red} stopOpacity={0.42} />
              <stop offset="100%" stopColor={STATUS_COLOR.red} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="plcDriftCrit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ec835a" stopOpacity={0.36} />
              <stop offset="100%" stopColor="#ec835a" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
          <XAxis dataKey="idx" tick={AXIS} axisLine={false} tickLine={false}
            tickFormatter={(v) => `#${faNum(Number(v))}`} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => faNum(Number(v))} />
          <ReferenceLine y={0} stroke="rgba(148,163,184,0.35)" />
          <Tooltip
            {...TOOLTIP_STYLE}
            labelFormatter={(v) => `بازنگری شماره ${faNum(Number(v))}`}
            formatter={(val, name) => [`${faNum(Number(val))} روز`, name === 'criticalDelay' ? 'بحرانی‌ها' : 'بیشترین تأخیر']}
          />
          <Area type="monotone" dataKey="delay" stroke={STATUS_COLOR.red} strokeWidth={2}
            fill="url(#plcDrift)" isAnimationActive animationDuration={900} />
          <Area type="monotone" dataKey="criticalDelay" stroke="#ec835a" strokeWidth={1.5}
            strokeDasharray="4 3" fill="url(#plcDriftCrit)" isAnimationActive animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
