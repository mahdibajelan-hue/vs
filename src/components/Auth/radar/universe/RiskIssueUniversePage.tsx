import { useMemo, useState } from 'react'
import {
  ArrowRight, Calendar, ChevronRight, Filter, MoreHorizontal, Plus,
  Radar as RadarIcon, TrendingDown, TrendingUp, X,
} from 'lucide-react'
import { RingGauge } from '../RadarPanels'
import { RiskOrbitView } from './RiskOrbitView'
import { IssueShockwaveView } from './IssueShockwaveView'
import { EventStreamView } from './EventStreamView'
import { ProjectIntelligencePanel } from './ProjectIntelligencePanel'
import {
  SEVERITY_COLOR, SEVERITY_LABEL, buildMockUniverseData,
  type IssueUniverseNode, type RiskUniverseNode, type UniverseSeverity,
} from './universeTypes'

type ViewMode = 'risk' | 'issue' | 'event'

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'risk', label: 'Risk Universe' },
  { key: 'issue', label: 'Issue Wave' },
  { key: 'event', label: 'Event Stream' },
]

const SEVERITY_ORDER: UniverseSeverity[] = ['critical', 'high', 'medium', 'low']

function threatColor(pct: number): string {
  return pct >= 70 ? '#ef4444' : pct >= 45 ? 'var(--radar-amber)' : 'var(--radar-green)'
}
function threatLabel(pct: number): string {
  return pct >= 70 ? 'High Pressure' : pct >= 45 ? 'Moderate Pressure' : 'Low Pressure'
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${className}`} style={{ borderColor: 'var(--border-soft)' }}>
      {children}
    </div>
  )
}

function SeveritySummaryCard({ title, summary }: { title: string; summary: Record<UniverseSeverity, number> }) {
  return (
    <Card>
      <h3 className="mb-2.5 text-[11px] font-bold tracking-wide text-muted">{title}</h3>
      <ul className="space-y-1.5">
        {SEVERITY_ORDER.map((sev) => (
          <li key={sev} className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[sev] }} />
              {SEVERITY_LABEL[sev]}
            </span>
            <span className="num font-extrabold">{summary[sev]}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function TopRiskRow({ risk }: { risk: RiskUniverseNode }) {
  const Trend = risk.trend === 'up' ? TrendingUp : risk.trend === 'down' ? TrendingDown : null
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[risk.severity] }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold">{risk.code} <span className="font-medium text-secondary">{risk.title}</span></p>
      </div>
      <span className="num flex shrink-0 items-center gap-1 text-[11px] font-extrabold" style={{ color: SEVERITY_COLOR[risk.severity] }}>
        {risk.criticality} {Trend && <Trend size={11} />}
      </span>
    </li>
  )
}

function TopIssueRow({ issue }: { issue: IssueUniverseNode }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[issue.severity] }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold">{issue.code} <span className="font-medium text-secondary">{issue.title}</span></p>
      </div>
      <span className="num shrink-0 text-[10px] text-muted">{issue.agingDays}d</span>
    </li>
  )
}

function StatTile({ label, value, delta }: { label: string; value: number; delta: number }) {
  return (
    <Card className="text-center">
      <p className="num text-xl font-extrabold">{value}</p>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-muted">{label}</p>
      {delta !== 0 && (
        <p className="num mt-1 flex items-center justify-center gap-0.5 text-[9.5px] font-bold" style={{ color: 'var(--radar-amber)' }}>
          <TrendingUp size={10} /> {delta} vs Last Week
        </p>
      )}
    </Card>
  )
}

const CATEGORY_OPTIONS = ['Procurement', 'Engineering', 'Construction', 'Commercial', 'HSE', 'Regulatory']
const IMPACT_AREA_OPTIONS = ['Time', 'Cost', 'Scope', 'Quality', 'Procurement', 'Contract']
const LEVEL_OPTIONS = ['Low', 'Medium', 'High', 'Critical']

function AddRiskIssueForm({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<'risk' | 'issue'>('risk')
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-bold tracking-wide text-muted">ADD NEW RISK / ISSUE</h3>
        <button onClick={onClose} className="text-muted hover:text-primary"><X size={14} /></button>
      </div>
      <div className="mb-3 flex gap-1.5">
        {(['risk', 'issue'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className="rounded-full border px-3 py-1 text-[11px] font-bold capitalize"
            style={{
              borderColor: kind === k ? 'var(--radar-cyan)' : 'var(--border-soft)',
              color: kind === k ? 'var(--radar-cyan)' : undefined,
              background: kind === k ? 'color-mix(in srgb, var(--radar-cyan) 12%, transparent)' : undefined,
            }}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="sm:col-span-3 flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Title
          <input className="input" placeholder={`Enter ${kind} title...`} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Category
          <select className="input" defaultValue="">
            <option value="" disabled>Select category</option>
            {CATEGORY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Impact Area
          <select className="input" defaultValue="">
            <option value="" disabled>Select impact area</option>
            {IMPACT_AREA_OPTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          {kind === 'risk' ? 'Probability' : 'Severity'}
          <select className="input" defaultValue="">
            <option value="" disabled>Select</option>
            {LEVEL_OPTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Impact
          <select className="input" defaultValue="">
            <option value="" disabled>Select</option>
            {LEVEL_OPTIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Owner
          <input className="input" placeholder="Select owner" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Due Date
          <input type="date" className="input" />
        </label>
        <label className="sm:col-span-3 flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
          Description
          <textarea className="input" rows={3} placeholder={`Describe the ${kind}...`} />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border px-4 py-2 text-[11px] font-bold" style={{ borderColor: 'var(--border-soft)' }}>Cancel</button>
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-[11px] font-bold text-white" style={{ background: 'var(--radar-cyan)' }}>Save</button>
      </div>
    </Card>
  )
}

/**
 * Risk, Issue & Event Universe — a second lens on the same project data the classic Risk/Issue
 * Management modules already track (those modules are untouched; this is additive). Reached from
 * Project Radar's own sidebar and swapped in locally rather than navigated to as a separate
 * top-level module, so it reads as a natural extension of Radar rather than a different app.
 */
export function RiskIssueUniversePage({ projectName, seed, onBack }: { projectName: string; seed: string; onBack: () => void }) {
  const data = useMemo(() => buildMockUniverseData(seed), [seed])
  const [viewMode, setViewMode] = useState<ViewMode>('risk')
  const [addFormOpen, setAddFormOpen] = useState(false)

  const topRisks = useMemo(() => [...data.risks].sort((a, b) => b.criticality - a.criticality).slice(0, 5), [data.risks])
  const topIssues = useMemo(() => [...data.issues].sort((a, b) => b.escalation - a.escalation).slice(0, 5), [data.issues])
  const riskCodeById = (id: string) => data.risks.find((r) => r.id === id)?.code

  return (
    <div dir="ltr" className="radar-en relative min-h-screen w-screen" style={{ background: 'var(--bg-app)' }}>
      <div className="radar-page-texture" aria-hidden="true" />
      <div className="relative z-10 p-4 sm:p-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <button
              onClick={onBack}
              title="Back to Radar"
              className="flex h-10 w-10 items-center justify-center rounded-xl border transition-colors hover:bg-white/5"
              style={{ borderColor: 'var(--border-soft)' }}
            >
              <ArrowRight size={16} className="rotate-180" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border" style={{ borderColor: 'color-mix(in srgb, var(--radar-green) 40%, transparent)', background: 'color-mix(in srgb, var(--radar-green) 10%, transparent)' }}>
              <RadarIcon size={19} style={{ color: 'var(--radar-green)' }} />
            </div>
            <div className="leading-tight">
              <p className="text-base font-extrabold tracking-wide">PROJECT RADAR</p>
              <p className="text-[9px] font-bold tracking-wide text-muted">RISK &amp; ISSUE UNIVERSE</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="rounded-lg border px-2.5 py-1.5 font-bold" style={{ borderColor: 'var(--border-soft)' }}>{projectName}</span>
            <span className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-bold text-muted" style={{ borderColor: 'var(--border-soft)' }}>
              Universe View <ChevronRight size={12} className="rotate-90" />
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setAddFormOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-bold text-white"
              style={{ background: 'var(--radar-cyan)' }}
            >
              <Plus size={14} /> Add Risk / Issue
            </button>
            <button className="flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--border-soft)' }} title="Filter"><Filter size={14} /></button>
            <button className="flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--border-soft)' }} title="Date range"><Calendar size={14} /></button>
            <button className="flex h-9 w-9 items-center justify-center rounded-xl border" style={{ borderColor: 'var(--border-soft)' }} title="More"><MoreHorizontal size={14} /></button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_280px]">
          <div className="flex flex-col gap-4">
            <Card className="text-center">
              <h3 className="mb-2 text-[11px] font-bold tracking-wide text-muted">THREAT PRESSURE INDEX</h3>
              <div className="flex justify-center">
                <RingGauge
                  pct={data.threatPressureIndex} size={110} stroke={8} color={threatColor(data.threatPressureIndex)}
                  center={
                    <div className="flex flex-col items-center leading-tight">
                      <span className="num text-2xl font-extrabold">{data.threatPressureIndex}</span>
                      <span className="text-[8px] font-bold text-muted">/100</span>
                    </div>
                  }
                />
              </div>
              <p className="num mt-2 text-[11px] font-extrabold" style={{ color: threatColor(data.threatPressureIndex) }}>
                {threatLabel(data.threatPressureIndex)}
              </p>
            </Card>
            <SeveritySummaryCard title="RISK SUMMARY" summary={data.riskSummary} />
            <SeveritySummaryCard title="ISSUE SUMMARY" summary={data.issueSummary} />
          </div>

          <div className="flex flex-col">
            <div className="mb-3 flex flex-wrap justify-center gap-1.5">
              {VIEW_MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setViewMode(m.key)}
                  className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-bold"
                  style={{
                    borderColor: viewMode === m.key ? 'var(--radar-green)' : 'var(--border-soft)',
                    color: viewMode === m.key ? 'var(--radar-green)' : undefined,
                    background: viewMode === m.key ? 'color-mix(in srgb, var(--radar-green) 10%, transparent)' : undefined,
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="min-h-[420px] flex-1 p-2">
              {viewMode === 'risk' && <RiskOrbitView risks={data.risks} />}
              {viewMode === 'issue' && <IssueShockwaveView issues={data.issues} riskCodeById={riskCodeById} />}
              {viewMode === 'event' && <EventStreamView chains={data.eventChains} />}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <div className="mb-1 flex items-baseline justify-between">
                <h3 className="text-[11px] font-bold tracking-wide text-muted">TOP RISKS</h3>
                <span className="cursor-default text-[9px] font-bold" style={{ color: 'var(--radar-cyan)' }}>VIEW ALL</span>
              </div>
              <ul className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
                {topRisks.map((r) => <TopRiskRow key={r.id} risk={r} />)}
              </ul>
            </Card>
            <Card>
              <div className="mb-1 flex items-baseline justify-between">
                <h3 className="text-[11px] font-bold tracking-wide text-muted">TOP ISSUES</h3>
                <span className="cursor-default text-[9px] font-bold" style={{ color: 'var(--radar-cyan)' }}>VIEW ALL</span>
              </div>
              <ul className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
                {topIssues.map((i) => <TopIssueRow key={i.id} issue={i} />)}
              </ul>
            </Card>
            <Card>
              <h3 className="mb-2 text-[11px] font-bold tracking-wide text-muted">REPORTS</h3>
              <ul>
                {data.reports.map((r) => (
                  <li key={r.id}>
                    <button className="flex w-full items-center justify-between rounded-lg px-1.5 py-2 text-left text-[11px] font-bold hover:bg-white/5">
                      {r.title}
                      <ChevronRight size={13} className="text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>

        <div className="mt-4">
          <ProjectIntelligencePanel insights={data.insights} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Total Risks" value={data.stats.totalRisks} delta={data.stats.totalRisksDelta} />
          <StatTile label="Total Issues" value={data.stats.totalIssues} delta={data.stats.totalIssuesDelta} />
          <StatTile label="Open Actions" value={data.stats.openActions} delta={data.stats.openActionsDelta} />
          <StatTile label="Due This Week" value={data.stats.dueThisWeek} delta={data.stats.dueThisWeekDelta} />
          <StatTile label="Overdue" value={data.stats.overdue} delta={data.stats.overdueDelta} />
          <StatTile label="Resolved (30D)" value={data.stats.resolved30d} delta={data.stats.resolved30dDelta} />
        </div>

        {addFormOpen && (
          <div className="mt-4">
            <AddRiskIssueForm onClose={() => setAddFormOpen(false)} />
          </div>
        )}
      </div>
    </div>
  )
}
