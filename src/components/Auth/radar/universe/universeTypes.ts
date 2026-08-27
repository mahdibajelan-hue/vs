/**
 * Risk, Issue & Event Universe — a second, deliberately non-classic visualization layered on top
 * of Project Radar's existing Risk/Issue Management modules (which are untouched and still the
 * system of record). Everything here is mock, deterministically seeded off the project id, same
 * pattern as radarTypes.ts's buildMockRadarData — a real data-adapter would fill this exact shape
 * later without any component here needing to change.
 */

export type UniverseSeverity = 'critical' | 'high' | 'medium' | 'low'
export type Trend = 'up' | 'down' | 'flat'

export const SEVERITY_COLOR: Record<UniverseSeverity, string> = {
  critical: '#ef4444',
  high: '#f0a836',
  medium: '#eab308',
  low: '#38bdf8',
}

export const SEVERITY_LABEL: Record<UniverseSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/** One risk as a gravity object in the Risk Universe: exposure drives its size, criticality pulls
 * it toward the core, velocity drives how fast it pulses, and trend hints at where it's heading. */
export interface RiskUniverseNode {
  id: string
  code: string
  title: string
  category: string
  severity: UniverseSeverity
  /** 0-100 — drives node size. */
  exposure: number
  /** 0-100 — higher pulls the node closer to Project Core. */
  criticality: number
  /** 0-100 — drives pulse speed; a fast-pulsing risk is accelerating. */
  velocity: number
  trend: Trend
  windowLabel: string
  /** Probability (0-1) this risk converts into an issue, per Project Intelligence. */
  conversionProbability: number
  relatedIssueIds: string[]
}

/** One issue as a shockwave source: impact drives wave amplitude, escalation drives how fast the
 * wave spreads across the six impact dimensions. */
export interface IssueUniverseNode {
  id: string
  code: string
  title: string
  severity: UniverseSeverity
  agingDays: number
  /** 0-100 per dimension — how hard this issue is hitting each area. */
  impact: { time: number; cost: number; scope: number; quality: number; procurement: number; contract: number }
  /** 0-100 — how fast the wave is still spreading. */
  escalation: number
  causedByRiskIds: string[]
}

export type EventKind = 'event' | 'trigger' | 'risk' | 'issue' | 'impact' | 'action' | 'decision' | 'resolution'

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  event: 'Event',
  trigger: 'Trigger',
  risk: 'Risk',
  issue: 'Issue',
  impact: 'Impact',
  action: 'Action',
  decision: 'Decision',
  resolution: 'Resolution',
}

export const EVENT_KIND_COLOR: Record<EventKind, string> = {
  event: '#38bdf8',
  trigger: '#a78bfa',
  risk: '#ef4444',
  issue: '#f0a836',
  impact: '#eab308',
  action: '#22ff9e',
  decision: '#38bdf8',
  resolution: '#22ff9e',
}

/** One causal chain, rendered as a connected strip of beacons: Event -> Trigger -> Risk -> Issue
 * -> Impact -> Action -> Decision -> Resolution. Real chains vary in length — not every event
 * has escalated all the way to a resolution yet. */
export interface EventChain {
  id: string
  title: string
  dateLabel: string
  steps: { kind: EventKind; label: string }[]
}

export type InsightKind = 'emerging_risk' | 'velocity' | 'conversion' | 'impact' | 'relationship' | 'recommendation'

export const INSIGHT_KIND_LABEL: Record<InsightKind, string> = {
  emerging_risk: 'Emerging Risk',
  velocity: 'Risk Velocity',
  conversion: 'Conversion Forecast',
  impact: 'Impact Detected',
  relationship: 'Discovered Relationship',
  recommendation: 'Recommended Action',
}

export const INSIGHT_KIND_COLOR: Record<InsightKind, string> = {
  emerging_risk: '#ef4444',
  velocity: '#f0a836',
  conversion: '#eab308',
  impact: '#a78bfa',
  relationship: '#38bdf8',
  recommendation: '#22ff9e',
}

export interface ProjectIntelligenceInsight {
  id: string
  kind: InsightKind
  text: string
  relatedCode?: string
}

export interface UniverseStats {
  totalRisks: number
  totalRisksDelta: number
  totalIssues: number
  totalIssuesDelta: number
  openActions: number
  openActionsDelta: number
  dueThisWeek: number
  dueThisWeekDelta: number
  overdue: number
  overdueDelta: number
  resolved30d: number
  resolved30dDelta: number
}

export interface UniverseReport {
  id: string
  title: string
}

export interface UniverseData {
  threatPressureIndex: number
  riskSummary: Record<UniverseSeverity, number>
  issueSummary: Record<UniverseSeverity, number>
  risks: RiskUniverseNode[]
  issues: IssueUniverseNode[]
  eventChains: EventChain[]
  insights: ProjectIntelligenceInsight[]
  stats: UniverseStats
  reports: UniverseReport[]
}

function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RISK_TEMPLATES: { code: string; title: string; category: string }[] = [
  { code: 'R-105', title: 'Valve Procurement Delay', category: 'Procurement' },
  { code: 'R-092', title: 'Steel Price Increase', category: 'Commercial' },
  { code: 'R-087', title: 'Design Approval Delay', category: 'Engineering' },
  { code: 'R-110', title: 'Contractor Productivity', category: 'Construction' },
  { code: 'R-073', title: 'ROW Acquisition Delay', category: 'HSE' },
  { code: 'R-064', title: 'Welding Crew Shortage', category: 'Construction' },
  { code: 'R-058', title: 'Currency Exchange Exposure', category: 'Commercial' },
  { code: 'R-041', title: 'Permit Renewal Delay', category: 'Regulatory' },
]

const ISSUE_TEMPLATES: { code: string; title: string }[] = [
  { code: 'IS-024', title: 'Valve Delivery Delay' },
  { code: 'IS-017', title: 'NCR – Weld Quality' },
  { code: 'IS-011', title: 'IFC Drawing Delay' },
  { code: 'IS-009', title: 'Coating Damage' },
  { code: 'IS-005', title: 'Material Shortage' },
]

const EVENT_CHAIN_TEMPLATES: { title: string; steps: EventKind[] }[] = [
  { title: 'Compressor package CP-04 shipment slip', steps: ['event', 'trigger', 'risk', 'issue', 'impact', 'action'] },
  { title: 'Weld inspection line 08 non-conformance', steps: ['event', 'risk', 'issue', 'impact', 'action', 'decision', 'resolution'] },
  { title: 'Steel mill price notice received', steps: ['event', 'trigger', 'risk'] },
  { title: 'ROW landowner dispute reopened', steps: ['event', 'trigger', 'risk', 'issue'] },
  { title: 'Contractor EOT claim submitted', steps: ['event', 'risk', 'issue', 'impact', 'decision'] },
]

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]
}

export function buildMockUniverseData(seed: string): UniverseData {
  const rand = seededRandom(seed)

  const riskCount = 6 + Math.floor(rand() * 3)
  const risks: RiskUniverseNode[] = Array.from({ length: riskCount }, (_, i) => {
    const t = pick(RISK_TEMPLATES, i)
    const severityRoll = rand()
    const severity: UniverseSeverity = severityRoll < 0.2 ? 'critical' : severityRoll < 0.5 ? 'high' : severityRoll < 0.8 ? 'medium' : 'low'
    const criticality = severity === 'critical' ? 75 + rand() * 25 : severity === 'high' ? 50 + rand() * 30 : severity === 'medium' ? 25 + rand() * 30 : rand() * 25
    const exposure = Math.round(40 + rand() * 60)
    const velocity = Math.round(rand() * 100)
    const windowDays = 7 + Math.floor(rand() * 40)
    return {
      id: `risk-${i}`,
      code: t.code,
      title: t.title,
      category: t.category,
      severity,
      exposure,
      criticality: Math.round(criticality),
      velocity,
      trend: velocity > 60 ? 'up' : velocity < 30 ? 'down' : 'flat',
      windowLabel: `0-${windowDays}d`,
      conversionProbability: Math.round((criticality / 100) * (velocity / 100) * 100) / 100,
      relatedIssueIds: [],
    }
  })

  const issueCount = 3 + Math.floor(rand() * 3)
  const issues: IssueUniverseNode[] = Array.from({ length: issueCount }, (_, i) => {
    const t = pick(ISSUE_TEMPLATES, i)
    const severityRoll = rand()
    const severity: UniverseSeverity = severityRoll < 0.25 ? 'critical' : severityRoll < 0.55 ? 'high' : severityRoll < 0.85 ? 'medium' : 'low'
    const causedBy = risks.length > 0 ? [pick(risks, i + Math.floor(rand() * risks.length)).id] : []
    causedBy.forEach((rid) => {
      const r = risks.find((rr) => rr.id === rid)
      if (r) r.relatedIssueIds.push(`issue-${i}`)
    })
    return {
      id: `issue-${i}`,
      code: t.code,
      title: t.title,
      severity,
      agingDays: 3 + Math.floor(rand() * 30),
      impact: {
        time: Math.round(rand() * 100),
        cost: Math.round(rand() * 100),
        scope: Math.round(rand() * 100),
        quality: Math.round(rand() * 100),
        procurement: Math.round(rand() * 100),
        contract: Math.round(rand() * 100),
      },
      escalation: Math.round(rand() * 100),
      causedByRiskIds: causedBy,
    }
  })

  const eventChains: EventChain[] = EVENT_CHAIN_TEMPLATES.map((t, i) => ({
    id: `chain-${i}`,
    title: t.title,
    dateLabel: `${1 + Math.floor(rand() * 27)} days ago`,
    steps: t.steps.map((kind) => ({ kind, label: EVENT_KIND_LABEL[kind] })),
  }))

  const topRisk = [...risks].sort((a, b) => b.criticality - a.criticality)[0]
  const topIssue = [...issues].sort((a, b) => b.escalation - a.escalation)[0]
  const fastestRisk = [...risks].sort((a, b) => b.velocity - a.velocity)[0]

  const insights: ProjectIntelligenceInsight[] = [
    topRisk && {
      id: 'insight-emerging',
      kind: 'emerging_risk',
      text: `${topRisk.code} — ${topRisk.title} has moved closer to Project Core this week; criticality now ${topRisk.criticality}/100.`,
      relatedCode: topRisk.code,
    },
    fastestRisk && {
      id: 'insight-velocity',
      kind: 'velocity',
      text: `${fastestRisk.code} is accelerating fastest (velocity ${fastestRisk.velocity}/100) — worth a closer look before next review.`,
      relatedCode: fastestRisk.code,
    },
    topRisk && {
      id: 'insight-conversion',
      kind: 'conversion',
      text: `${topRisk.code} has a ${Math.round(topRisk.conversionProbability * 100)}% estimated chance of turning into an open issue within 2 weeks.`,
      relatedCode: topRisk.code,
    },
    topIssue && {
      id: 'insight-impact',
      kind: 'impact',
      text: `${topIssue.code} — ${topIssue.title} is now hitting Cost and Schedule the hardest among open issues.`,
      relatedCode: topIssue.code,
    },
    topIssue && topIssue.causedByRiskIds.length > 0 && {
      id: 'insight-relationship',
      kind: 'relationship',
      text: `${topIssue.code} traces back to ${risks.find((r) => r.id === topIssue.causedByRiskIds[0])?.code ?? 'an earlier risk'} — same root cause pattern seen twice this quarter.`,
      relatedCode: topIssue.code,
    },
    {
      id: 'insight-recommendation',
      kind: 'recommendation',
      text: topRisk
        ? `Escalate ${topRisk.code} to the next steering committee — criticality and velocity are both trending up together.`
        : 'No critical risks currently trending — maintain routine review cadence.',
      relatedCode: topRisk?.code,
    },
  ].filter(Boolean) as ProjectIntelligenceInsight[]

  const riskSummary: Record<UniverseSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  risks.forEach((r) => { riskSummary[r.severity]++ })
  const issueSummary: Record<UniverseSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  issues.forEach((i) => { issueSummary[i.severity]++ })

  const avgCriticality = risks.reduce((s, r) => s + r.criticality, 0) / Math.max(1, risks.length)
  const avgEscalation = issues.reduce((s, i) => s + i.escalation, 0) / Math.max(1, issues.length)
  const threatPressureIndex = Math.round(avgCriticality * 0.6 + avgEscalation * 0.4)

  return {
    threatPressureIndex,
    riskSummary,
    issueSummary,
    risks,
    issues,
    eventChains,
    insights,
    stats: {
      totalRisks: 20 + Math.floor(rand() * 20),
      totalRisksDelta: 3 + Math.floor(rand() * 8),
      totalIssues: 12 + Math.floor(rand() * 15),
      totalIssuesDelta: 2 + Math.floor(rand() * 6),
      openActions: 10 + Math.floor(rand() * 15),
      openActionsDelta: 1 + Math.floor(rand() * 5),
      dueThisWeek: 3 + Math.floor(rand() * 8),
      dueThisWeekDelta: Math.floor(rand() * 4),
      overdue: 2 + Math.floor(rand() * 8),
      overdueDelta: Math.floor(rand() * 4),
      resolved30d: 8 + Math.floor(rand() * 12),
      resolved30dDelta: 2 + Math.floor(rand() * 6),
    },
    reports: [
      { id: 'rep-risk-register', title: 'Risk Register Report' },
      { id: 'rep-issue-register', title: 'Issue Register Report' },
      { id: 'rep-risk-heatmap', title: 'Risk Heat Map' },
      { id: 'rep-issue-aging', title: 'Issue Aging Report' },
      { id: 'rep-action-tracker', title: 'Action Tracker Report' },
    ],
  }
}
