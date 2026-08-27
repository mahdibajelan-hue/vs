import { useMemo, useState } from 'react'
import {
  ArrowRight, Clock3, FileText, Filter, History, Plus,
  Radar as RadarIcon, Sparkles, TrendingDown, TrendingUp, X,
} from 'lucide-react'
import { RingGauge } from '../RadarPanels'
import { UniverseCanvas, type UniverseSelection } from './UniverseCanvas'
import { ImpactWaveView, type ImpactSource } from './ImpactWaveView'
import { EventStreamView } from './EventStreamView'
import { ProjectIntelligencePanel } from './ProjectIntelligencePanel'
import {
  ISSUE_COLOR, SEVERITY_COLOR, SEVERITY_LABEL, buildMockUniverseData,
  type IssueUniverseNode, type RiskUniverseNode, type UniverseSeverity,
} from './universeTypes'

type Mode = 'universe' | 'timeline' | 'impact'

const MODES: { key: Mode; label: string }[] = [
  { key: 'universe', label: 'UNIVERSE' },
  { key: 'timeline', label: 'TIMELINE' },
  { key: 'impact', label: 'IMPACT' },
]

const ALL_SEVERITIES: UniverseSeverity[] = ['critical', 'high', 'medium', 'low']

function threatColor(pct: number): string {
  return pct >= 70 ? '#ef4444' : pct >= 45 ? 'var(--radar-amber)' : 'var(--radar-green)'
}
function threatLabel(pct: number): string {
  return pct >= 70 ? 'HIGH PRESSURE' : pct >= 45 ? 'MODERATE PRESSURE' : 'LOW PRESSURE'
}

/** Floating glass panel — thin border, translucent blur, no hard card edges — the chrome style
 * used for every overlay on top of the hero canvas. */
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border p-3 backdrop-blur-md ${className}`}
      style={{
        borderColor: 'var(--border-soft)',
        background: 'color-mix(in srgb, var(--bg-panel-solid) 58%, transparent)',
        boxShadow: '0 10px 34px rgba(0,0,0,0.38)',
      }}
    >
      {children}
    </div>
  )
}

function IconButton({ onClick, title, active, children }: { onClick: () => void; title: string; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-9 w-9 items-center justify-center rounded-xl border transition-colors hover:bg-white/5"
      style={{
        borderColor: active ? 'var(--radar-cyan)' : 'var(--border-soft)',
        color: active ? 'var(--radar-cyan)' : undefined,
        background: active ? 'color-mix(in srgb, var(--radar-cyan) 12%, transparent)' : undefined,
      }}
    >
      {children}
    </button>
  )
}

function TopRiskRow({ risk, onClick }: { risk: RiskUniverseNode; onClick: () => void }) {
  const Trend = risk.trend === 'up' ? TrendingUp : risk.trend === 'down' ? TrendingDown : null
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-white/5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[risk.severity] }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold">{risk.code} <span className="font-medium text-secondary">{risk.title}</span></p>
        </div>
        <span className="num flex shrink-0 items-center gap-1 text-[11px] font-extrabold" style={{ color: SEVERITY_COLOR[risk.severity] }}>
          {risk.criticality} {Trend && <Trend size={11} />}
        </span>
      </button>
    </li>
  )
}

function TopIssueRow({ issue, onClick }: { issue: IssueUniverseNode; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-white/5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ISSUE_COLOR }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold">{issue.code} <span className="font-medium text-secondary">{issue.title}</span></p>
        </div>
        <span className="num shrink-0 text-[10px] font-bold text-muted">{issue.agingDays}d</span>
      </button>
    </li>
  )
}

const ADD_TABS = ['risk', 'issue', 'event'] as const
type AddTab = (typeof ADD_TABS)[number]

function AddModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<AddTab>('risk')
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border p-4" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)' }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[12px] font-bold tracking-wide text-muted">ADD TO PROJECT THREAT INTELLIGENCE</h3>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={15} /></button>
        </div>
        <div className="mb-3 flex gap-1.5">
          {ADD_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 rounded-full border py-1.5 text-[11px] font-bold uppercase tracking-wide"
              style={{
                borderColor: tab === t ? 'var(--radar-cyan)' : 'var(--border-soft)',
                color: tab === t ? 'var(--radar-cyan)' : undefined,
                background: tab === t ? 'color-mix(in srgb, var(--radar-cyan) 12%, transparent)' : undefined,
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="space-y-2.5">
          <input className="input" placeholder={`${tab === 'risk' ? 'Risk' : tab === 'issue' ? 'Issue' : 'Event'} title...`} />
          {tab !== 'event' && (
            <select className="input" defaultValue="">
              <option value="" disabled>Severity</option>
              {ALL_SEVERITIES.map((s) => <option key={s}>{SEVERITY_LABEL[s]}</option>)}
            </select>
          )}
          <textarea className="input" rows={3} placeholder="Short description..." />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-[11px] font-bold" style={{ borderColor: 'var(--border-soft)' }}>Cancel</button>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-[11px] font-bold text-white" style={{ background: 'var(--radar-cyan)' }}>Save</button>
        </div>
      </div>
    </div>
  )
}

function ReportsModal({ reports, onClose }: { reports: { id: string; title: string }[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-2xl border p-3" style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)' }}>
        <div className="mb-2 flex items-center justify-between px-1">
          <h3 className="text-[11px] font-bold tracking-wide text-muted">REPORTS</h3>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={14} /></button>
        </div>
        <ul>
          {reports.map((r) => (
            <li key={r.id}>
              <button onClick={onClose} className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[11px] font-bold hover:bg-white/5">
                {r.title}
                <FileText size={12} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SlideOver({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="radar-callout absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l p-4"
        style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)' }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[12px] font-bold tracking-wide text-muted">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={15} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function DetailDrawer({
  selection, risks, issues, riskCodeById, onClose,
}: {
  selection: UniverseSelection
  risks: RiskUniverseNode[]
  issues: IssueUniverseNode[]
  riskCodeById: (id: string) => string | undefined
  onClose: () => void
}) {
  if (!selection) return null
  const risk = selection.type === 'risk' ? risks.find((r) => r.id === selection.id) : undefined
  const issue = selection.type === 'issue' ? issues.find((i) => i.id === selection.id) : undefined
  if (!risk && !issue) return null
  const color = risk ? SEVERITY_COLOR[risk.severity] : ISSUE_COLOR

  return (
    <div className="radar-callout absolute bottom-4 right-4 z-30 w-64 rounded-2xl border p-3.5" style={{ borderColor: color, background: 'color-mix(in srgb, var(--bg-panel-solid) 94%, transparent)', boxShadow: `0 0 24px color-mix(in srgb, ${color} 25%, transparent)` }}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
          {risk ? `${SEVERITY_LABEL[risk.severity]} RISK` : 'ISSUE'}
        </span>
        <button onClick={onClose} className="text-muted hover:text-primary"><X size={14} /></button>
      </div>
      <p className="text-[13px] font-extrabold">{risk?.code ?? issue?.code} — {risk?.title ?? issue?.title}</p>
      {risk && (
        <div className="mt-2.5 space-y-1.5 border-t pt-2.5 text-[10.5px] leading-5" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="flex items-center justify-between"><span className="text-muted">Exposure</span><span className="num font-bold">{risk.exposure}/100</span></p>
          <p className="flex items-center justify-between"><span className="text-muted">Criticality</span><span className="num font-bold">{risk.criticality}/100</span></p>
          <p className="flex items-center justify-between"><span className="text-muted">Velocity</span><span className="num font-bold">{risk.velocity}/100</span></p>
          <p className="font-bold" style={{ color: 'var(--radar-green)' }}>Issue conversion forecast: {Math.round(risk.conversionProbability * 100)}%</p>
        </div>
      )}
      {issue && (
        <div className="mt-2.5 space-y-1.5 border-t pt-2.5 text-[10.5px] leading-5" style={{ borderColor: 'var(--border-soft)' }}>
          <p className="flex items-center justify-between"><span className="text-muted">Aging</span><span className="num font-bold">{issue.agingDays}d</span></p>
          <p className="flex items-center justify-between"><span className="text-muted">Escalation</span><span className="num font-bold">{issue.escalation}/100</span></p>
          {issue.causedByRiskIds.length > 0 && (
            <p className="text-muted">Caused by <span className="num font-bold" style={{ color: 'var(--radar-amber)' }}>{riskCodeById(issue.causedByRiskIds[0]) ?? issue.causedByRiskIds[0]}</span></p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * RISK UNIVERSE — Project Threat Intelligence. A hero orbital canvas (Project Core + risks/issues
 * as physically-orbiting objects + transient event beacons) with exactly three modes
 * (UNIVERSE / TIMELINE / IMPACT) and everything else demoted to compact floating panels or
 * on-demand drawers, so overall threat status reads in seconds without a single table.
 */
export function RiskIssueUniversePage({ projectName, seed, onBack }: { projectName: string; seed: string; onBack: () => void }) {
  const data = useMemo(() => buildMockUniverseData(seed), [seed])
  const projectCode = useMemo(() => seed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'PRJ-01', [seed])

  const [mode, setMode] = useState<Mode>('universe')
  const [selection, setSelection] = useState<UniverseSelection>(null)
  const [impactKey, setImpactKey] = useState<string | null>(null)
  const [hiddenSeverities, setHiddenSeverities] = useState<Set<UniverseSeverity>>(new Set())
  const [showIssues, setShowIssues] = useState(true)
  const [showEvents, setShowEvents] = useState(true)
  const [filterOpen, setFilterOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [reportsOpen, setReportsOpen] = useState(false)
  const [intelOpen, setIntelOpen] = useState(false)
  const [eventLogOpen, setEventLogOpen] = useState(false)

  const topRisks = useMemo(() => [...data.risks].sort((a, b) => b.criticality - a.criticality).slice(0, 5), [data.risks])
  const topIssues = useMemo(() => [...data.issues].sort((a, b) => b.escalation - a.escalation).slice(0, 5), [data.issues])
  const riskCodeById = (id: string) => data.risks.find((r) => r.id === id)?.code

  const impactSources: ImpactSource[] = useMemo(
    () => [
      ...[...data.risks].sort((a, b) => b.criticality - a.criticality).slice(0, 4).map((r) => ({ kind: 'risk', node: r }) as ImpactSource),
      ...[...data.issues].sort((a, b) => b.escalation - a.escalation).map((i) => ({ kind: 'issue', node: i }) as ImpactSource),
    ],
    [data.risks, data.issues],
  )

  function selectRisk(id: string) {
    setSelection({ type: 'risk', id })
    setImpactKey(`risk:${id}`)
  }
  function selectIssue(id: string) {
    setSelection({ type: 'issue', id })
    setImpactKey(`issue:${id}`)
    if (mode === 'timeline') setMode('universe')
  }

  function toggleSeverity(sev: UniverseSeverity) {
    setHiddenSeverities((prev) => {
      const next = new Set(prev)
      if (next.has(sev)) next.delete(sev)
      else next.add(sev)
      return next
    })
  }

  return (
    <div dir="ltr" className="radar-en relative flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <div className="radar-page-texture" aria-hidden="true" />

      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} title="Back to Radar" className="flex h-10 w-10 items-center justify-center rounded-xl border transition-colors hover:bg-white/5" style={{ borderColor: 'var(--border-soft)' }}>
            <ArrowRight size={16} className="rotate-180" />
          </button>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border" style={{ borderColor: 'color-mix(in srgb, var(--radar-cyan) 40%, transparent)', background: 'color-mix(in srgb, var(--radar-cyan) 10%, transparent)' }}>
            <RadarIcon size={19} style={{ color: 'var(--radar-cyan)' }} />
          </div>
          <div className="leading-tight">
            <p className="text-base font-extrabold tracking-[0.14em]">RISK UNIVERSE</p>
            <p className="text-[9px] font-bold tracking-wide text-muted">PROJECT THREAT INTELLIGENCE</p>
          </div>
          <span className="ml-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold" style={{ borderColor: 'var(--border-soft)' }}>{projectName}</span>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[11px] font-bold text-white" style={{ background: 'var(--radar-cyan)' }}>
            <Plus size={14} /> Add Risk / Issue
          </button>
          <div className="relative">
            <IconButton onClick={() => setFilterOpen((v) => !v)} title="Filter" active={filterOpen}><Filter size={14} /></IconButton>
            {filterOpen && (
              <Panel className="absolute right-0 top-11 z-30 w-56">
                <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-muted">Severity</p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {ALL_SEVERITIES.map((s) => {
                    const active = !hiddenSeverities.has(s)
                    return (
                      <button
                        key={s}
                        onClick={() => toggleSeverity(s)}
                        className="rounded-full border px-2 py-0.5 text-[9.5px] font-bold"
                        style={{ borderColor: active ? SEVERITY_COLOR[s] : 'var(--border-soft)', color: active ? SEVERITY_COLOR[s] : 'var(--text-muted)', opacity: active ? 1 : 0.5 }}
                      >
                        {SEVERITY_LABEL[s]}
                      </button>
                    )
                  })}
                </div>
                <label className="mb-1.5 flex items-center justify-between text-[10.5px] font-bold">
                  Show Issues
                  <input type="checkbox" checked={showIssues} onChange={(e) => setShowIssues(e.target.checked)} />
                </label>
                <label className="flex items-center justify-between text-[10.5px] font-bold">
                  Show Events
                  <input type="checkbox" checked={showEvents} onChange={(e) => setShowEvents(e.target.checked)} />
                </label>
              </Panel>
            )}
          </div>
          <IconButton onClick={() => setIntelOpen(true)} title="Project Intelligence"><Sparkles size={14} /></IconButton>
          <IconButton onClick={() => setEventLogOpen(true)} title="Event Log"><History size={14} /></IconButton>
          <button onClick={() => setReportsOpen(true)} className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-bold" style={{ borderColor: 'var(--border-soft)' }}>
            <FileText size={13} /> Reports
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
          <div className="pointer-events-auto flex gap-1.5 rounded-full border p-1 backdrop-blur-md" style={{ borderColor: 'var(--border-soft)', background: 'color-mix(in srgb, var(--bg-panel-solid) 65%, transparent)' }}>
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-extrabold tracking-wide"
                style={{
                  color: mode === m.key ? '#04141a' : 'var(--text-secondary)',
                  background: mode === m.key ? 'var(--radar-cyan)' : 'transparent',
                }}
              >
                {m.key === 'timeline' && <Clock3 size={12} />}
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="absolute left-4 top-16 z-10 w-40 sm:w-44">
          <Panel className="text-center">
            <h3 className="mb-1.5 text-[9px] font-bold tracking-wide text-muted">THREAT PRESSURE INDEX</h3>
            <div className="flex justify-center">
              <RingGauge
                pct={data.threatPressureIndex} size={92} stroke={7} color={threatColor(data.threatPressureIndex)}
                center={
                  <div className="flex flex-col items-center leading-tight">
                    <span className="num text-xl font-extrabold">{data.threatPressureIndex}</span>
                    <span className="text-[7px] font-bold text-muted">/100</span>
                  </div>
                }
              />
            </div>
            <p className="num mt-1.5 text-[9.5px] font-extrabold" style={{ color: threatColor(data.threatPressureIndex) }}>{threatLabel(data.threatPressureIndex)}</p>
          </Panel>
        </div>

        <div className="absolute right-4 top-16 z-10 flex w-56 flex-col gap-3 sm:w-64">
          <Panel>
            <h3 className="mb-1 px-1 text-[9px] font-bold tracking-wide text-muted">TOP RISKS</h3>
            <ul>{topRisks.map((r) => <TopRiskRow key={r.id} risk={r} onClick={() => selectRisk(r.id)} />)}</ul>
          </Panel>
          <Panel>
            <h3 className="mb-1 px-1 text-[9px] font-bold tracking-wide text-muted">TOP ISSUES</h3>
            <ul>{topIssues.map((i) => <TopIssueRow key={i.id} issue={i} onClick={() => selectIssue(i.id)} />)}</ul>
          </Panel>
        </div>

        <div className="h-full w-full px-3 pb-3 pt-14 sm:px-6">
          {mode !== 'impact' ? (
            <UniverseCanvas
              projectCode={projectCode}
              risks={data.risks}
              issues={data.issues}
              beacons={data.beacons}
              timeline={mode === 'timeline'}
              hiddenSeverities={hiddenSeverities}
              showIssues={showIssues}
              showEvents={showEvents}
              selected={selection}
              onSelect={setSelection}
            />
          ) : (
            <div className="mx-auto h-full max-w-[900px] px-2 sm:px-16">
              <ImpactWaveView sources={impactSources} selectedKey={impactKey} onSelect={setImpactKey} riskCodeById={riskCodeById} />
            </div>
          )}
        </div>

        {mode !== 'impact' && (
          <DetailDrawer selection={selection} risks={data.risks} issues={data.issues} riskCodeById={riskCodeById} onClose={() => setSelection(null)} />
        )}
      </div>

      {addOpen && <AddModal onClose={() => setAddOpen(false)} />}
      {reportsOpen && <ReportsModal reports={data.reports} onClose={() => setReportsOpen(false)} />}
      {intelOpen && (
        <SlideOver title="PROJECT INTELLIGENCE" onClose={() => setIntelOpen(false)}>
          <ProjectIntelligencePanel insights={data.insights} />
        </SlideOver>
      )}
      {eventLogOpen && (
        <SlideOver title="EVENT LOG" onClose={() => setEventLogOpen(false)}>
          <EventStreamView chains={data.eventChains} />
        </SlideOver>
      )}
    </div>
  )
}
