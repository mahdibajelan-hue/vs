import type { RmCorporateRisk, RmLink, RmRisk, RmRiskAssessment } from '../types'
import { RM_CATEGORY_LABEL_FA } from '../types'
import { RISK_LEVEL_LABEL_FA } from './riskScore'
import { ZONE_LABEL_FA } from './riskPolicy'
import { isActiveRisk, type RiskState } from './riskState'

/**
 * Portfolio-level analysis. Ordinal scores (1–25) are NEVER added up: aggregation uses counts per level, shares, medians and worst-case.
 * Money-like totals exist only for the subset of risks that carry a quantitative assessment (probability % × exposure), and are labelled as such.
 */

const STOP = new Set(['و', 'در', 'به', 'از', 'که', 'با', 'را', 'این', 'آن', 'برای', 'تا', 'یا', 'بر', 'های', 'ها', 'یک', 'است', 'شود', 'می', 'شده', 'بدون', 'عدم', 'تاخیر', 'تأخیر'])
export function tokenize(s: string): Set<string> {
  const t = s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w))
  return new Set(t)
}
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let i = 0
  for (const x of a) if (b.has(x)) i++
  return i / (a.size + b.size - i)
}
export const riskText = (r: RmRisk) => `${r.title} ${r.title} ${r.riskEvent} ${r.cause} ${r.category}`

export interface RiskCluster { id: string; members: RmRisk[]; projectIds: string[]; categories: string[]; similarity: number; keywords: string[] }

/** Union of active risks that look alike across at least `minProjects` different projects (a person confirms — text similarity only). */
export function clusterSimilar(risks: RmRisk[], opts: { threshold?: number; minProjects?: number } = {}): RiskCluster[] {
  const threshold = opts.threshold ?? 0.42
  const minProjects = opts.minProjects ?? 2
  const act = risks.filter(isActiveRisk)
  const tk = act.map((r) => tokenize(riskText(r)))
  const parent = act.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const best = new Map<number, number>()
  for (let i = 0; i < act.length; i++) for (let j = i + 1; j < act.length; j++) {
    if (act[i].projectId === act[j].projectId) continue
    const s = jaccard(tk[i], tk[j])
    if (s >= threshold) { parent[find(i)] = find(j); best.set(i, Math.max(best.get(i) ?? 0, s)); best.set(j, Math.max(best.get(j) ?? 0, s)) }
  }
  const groups = new Map<number, number[]>()
  act.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]))
  const out: RiskCluster[] = []
  for (const idx of groups.values()) {
    const members = idx.map((i) => act[i])
    const projectIds = [...new Set(members.map((m) => m.projectId))]
    if (members.length < 2 || projectIds.length < minProjects) continue
    const counts = new Map<string, number>()
    for (const i of idx) for (const w of tk[i]) counts.set(w, (counts.get(w) ?? 0) + 1)
    const keywords = [...counts.entries()].filter(([, c]) => c >= Math.max(2, Math.ceil(idx.length / 2))).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w)
    out.push({ id: members.map((m) => m.id).sort()[0], members, projectIds, categories: [...new Set(members.map((m) => m.category))], similarity: Math.max(...idx.map((i) => best.get(i) ?? 0)), keywords })
  }
  return out.sort((a, b) => b.projectIds.length - a.projectIds.length || b.members.length - a.members.length)
}
export const repeatedRiskIds = (clusters: RiskCluster[]) => new Set(clusters.flatMap((c) => c.members.map((m) => m.id)))

export type FactorKind = 'contractor' | 'discipline' | 'workPackage' | 'station' | 'category'
export const FACTOR_LABEL_FA: Record<FactorKind, string> = { contractor: 'پیمانکار / تأمین‌کننده', discipline: 'حوزهٔ تخصصی', workPackage: 'بستهٔ کاری', station: 'ایستگاه', category: 'دسته‌بندی' }
export interface Factor { kind: FactorKind; key: string; label: string; projects: number; risks: number; activeShare: number; criticalCount: number; levelMix: Record<string, number>; ids: string[] }

/** Where risk concentrates on ONE common source: a contractor, a specialist unit, a package… across several projects. */
export function sharedFactors(risks: RmRisk[], states: Map<string, RiskState>, minProjects = 2, minRisks = 3): Factor[] {
  const act = risks.filter(isActiveRisk)
  const out: Factor[] = []
  const take = (kind: FactorKind, valueOf: (r: RmRisk) => string, labelOf: (k: string) => string = (k) => k) => {
    const g = new Map<string, RmRisk[]>()
    for (const r of act) { const v = valueOf(r).trim(); if (v) g.set(v, [...(g.get(v) ?? []), r]) }
    for (const [key, rs] of g) {
      const projects = new Set(rs.map((r) => r.projectId)).size
      if (projects < minProjects || rs.length < minRisks) continue
      const mix: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 }
      for (const r of rs) mix[states.get(r.id)?.level ?? 'low']++
      out.push({ kind, key, label: labelOf(key), projects, risks: rs.length, activeShare: act.length ? rs.length / act.length : 0, criticalCount: mix.critical, levelMix: mix, ids: rs.map((r) => r.id) })
    }
  }
  take('contractor', (r) => r.contractor)
  take('discipline', (r) => r.discipline)
  take('workPackage', (r) => r.workPackage)
  take('station', (r) => r.station)
  take('category', (r) => r.category, (k) => RM_CATEGORY_LABEL_FA[k] ?? k)
  return out.sort((a, b) => b.criticalCount - a.criticalCount || b.projects - a.projects || b.risks - a.risks)
}

/** `A depends_on B` ⇒ B is a prerequisite. Returns, for each risk, how many other risks (transitively) depend on it. */
export function dependentCounts(links: RmLink[]): Map<string, number> {
  const dependsOn = new Map<string, string[]>()
  for (const l of links) if (l.relation === 'depends_on' && l.targetType === 'risk') dependsOn.set(l.riskId, [...(dependsOn.get(l.riskId) ?? []), l.targetId])
  const dependents = new Map<string, Set<string>>()
  for (const [a, bs] of dependsOn) for (const b of bs) { const s = dependents.get(b) ?? new Set(); s.add(a); dependents.set(b, s) }
  const memo = new Map<string, Set<string>>()
  const reach = (id: string, seen: Set<string>): Set<string> => {
    if (memo.has(id)) return memo.get(id)!
    const acc = new Set<string>()
    for (const d of dependents.get(id) ?? []) if (!seen.has(d)) { seen.add(d); acc.add(d); for (const x of reach(d, seen)) acc.add(x) }
    return acc
  }
  const out = new Map<string, number>()
  for (const id of dependents.keys()) out.set(id, reach(id, new Set([id])).size)
  return out
}

export interface CorporateRollup { corp: RmCorporateRisk; children: RmRisk[]; projects: number; active: number; levelMix: Record<string, number>; worst: string }
export function corporateRollup(corps: RmCorporateRisk[], risks: RmRisk[], states: Map<string, RiskState>): CorporateRollup[] {
  const order = ['low', 'medium', 'high', 'critical']
  return corps.map((corp) => {
    const children = risks.filter((r) => r.corporateRiskId === corp.id)
    const act = children.filter(isActiveRisk)
    const mix: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 }
    for (const r of act) mix[states.get(r.id)?.level ?? 'low']++
    const worst = [...order].reverse().find((l) => mix[l] > 0) ?? 'low'
    return { corp, children, projects: new Set(children.map((c) => c.projectId)).size, active: act.length, levelMix: mix, worst }
  }).sort((a, b) => order.indexOf(b.worst) - order.indexOf(a.worst) || b.active - a.active)
}

const ZONE_RANK = { acceptable: 0, tolerable: 1, above_tolerance: 2, escalate: 3 } as const
const KRI_RANK = { no_data: 0, normal: 0, warn: 1, critical: 2 } as const

/** Lexicographic priority (no weighted sum of ordinal numbers): tolerance zone → KRI → trend → time to impact → dependents → current score. */
export function comparePriority(a: { risk: RmRisk; state: RiskState }, b: { risk: RmRisk; state: RiskState }, dependents: Map<string, number> = new Map()): number {
  const keys = (x: { risk: RmRisk; state: RiskState }): number[] => [
    ZONE_RANK[x.state.residualZone], ZONE_RANK[x.state.zone], KRI_RANK[x.state.kriWorst], x.state.trend === 'worsening' ? 1 : 0,
    x.risk.timeToImpactDays === null ? 0 : x.risk.timeToImpactDays <= 14 ? 2 : x.risk.timeToImpactDays <= 45 ? 1 : 0, Math.min(3, dependents.get(x.risk.id) ?? 0), x.state.current,
  ]
  const ka = keys(a), kb = keys(b)
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]
  return 0
}

export interface Intervention { risk: RmRisk; state: RiskState; reasons: string[]; level: 'project_manager' | 'management' }
/** Risks that need the project/programme manager or senior management (policy threshold, formal escalation, rising KRI, ineffective controls). */
export function interventions(risks: RmRisk[], states: Map<string, RiskState>): Intervention[] {
  const out: Intervention[] = []
  for (const risk of risks.filter(isActiveRisk)) {
    const state = states.get(risk.id)!
    const reasons: string[] = []
    let level: Intervention['level'] = 'project_manager'
    if (state.residualZone === 'escalate' || state.zone === 'escalate') { reasons.push(`امتیاز در ناحیهٔ «${ZONE_LABEL_FA.escalate}»`); level = 'management' }
    else if (state.residualZone === 'above_tolerance') reasons.push(`باقیماندهٔ ${state.residual} خارج از تحمل است`)
    if (risk.escalationStatus === 'recommended') reasons.push('ارجاع پیشنهاد شده و هنوز اعمال نشده')
    if (risk.escalationStatus === 'escalated') { reasons.push(`در انتظار تصمیم: ${risk.requiredDecision || 'تصمیم مدیریتی'}`); level = 'management' }
    if (state.kriWorst === 'critical') reasons.push('شاخص هشدار در وضعیت بحرانی')
    if (state.completedIneffective) reasons.push('اقدام تکمیل‌شده بی‌اثر بوده')
    if (state.level === 'critical' && !state.hasPlan) reasons.push('بحرانی و بدون برنامهٔ پاسخ')
    if (reasons.length) out.push({ risk, state, reasons, level })
  }
  return out.sort((a, b) => (a.level === b.level ? comparePriority(a, b) : a.level === 'management' ? -1 : 1))
}

export interface QuantExposure { covered: number; total: number; expectedLoss: number; byProject: Record<string, number> }
/** Expected loss = Σ probability% × exposure cost, ONLY over risks whose latest assessment is quantitative. */
export function quantExposure(risks: RmRisk[], assessments: RmRiskAssessment[]): QuantExposure {
  const act = risks.filter(isActiveRisk)
  let sum = 0, covered = 0
  const byProject: Record<string, number> = {}
  for (const r of act) {
    const latest = assessments.filter((a) => a.riskId === r.id).sort((a, b) => (a.reviewDate !== b.reviewDate ? (a.reviewDate < b.reviewDate ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1))[0]
    if (latest && latest.method === 'quantitative' && latest.probabilityPct !== null && latest.exposureCost !== null) {
      const v = (latest.probabilityPct / 100) * latest.exposureCost
      sum += v; covered++; byProject[r.projectId] = (byProject[r.projectId] ?? 0) + v
    }
  }
  return { covered, total: act.length, expectedLoss: Math.round(sum), byProject }
}

export interface OrgAdvice { id: string; title: string; why: string; todo: string; riskIds: string[] }
/** Organisation-level corrective proposals for risks with a common cause. */
export function orgAdvice(clusters: RiskCluster[], factors: Factor[], corps: CorporateRollup[]): OrgAdvice[] {
  const out: OrgAdvice[] = []
  for (const c of clusters.slice(0, 5)) out.push({ id: 'cl-' + c.id, title: `ریسک مشابه در ${c.projectIds.length} پروژه${c.keywords.length ? ': «' + c.keywords.slice(0, 3).join('، ') + '»' : ''}`, why: `${c.members.length} ریسک با متن و علت نزدیک در پروژه‌های مختلف ثبت شده؛ احتمالاً یک علت مشترک دارد.`, todo: 'یک «ریسک مادر» تعریف و ریسک‌های پروژه‌ای را به آن وصل کنید؛ برای علت مشترک یک اقدام سازمانی تعیین شود.', riskIds: c.members.map((m) => m.id) })
  for (const f of factors.filter((x) => x.kind !== 'category').slice(0, 5)) out.push({ id: `f-${f.kind}-${f.key}`, title: `تمرکز ریسک روی «${f.label}» (${FACTOR_LABEL_FA[f.kind]})`, why: `${f.risks} ریسک فعال در ${f.projects} پروژه به یک منبع مشترک برمی‌گردد${f.criticalCount ? `؛ ${f.criticalCount} مورد بحرانی` : ''}.`, todo: f.kind === 'contractor' ? 'جلسهٔ مدیریتی با این پیمانکار/تأمین‌کننده و بازنگری ظرفیت و تضمین‌ها.' : 'بررسی ظرفیت و اولویت‌دهی منابع این منبع مشترک در سطح طرح.', riskIds: f.ids })
  for (const c of corps.filter((x) => x.worst === 'critical' && x.corp.status !== 'closed').slice(0, 3)) out.push({ id: 'corp-' + c.corp.id, title: `ریسک مادر ${c.corp.code} با فرزند بحرانی`, why: `${c.active} ریسک فعال در ${c.projects} پروژه به «${c.corp.title}» وصل است.`, todo: c.corp.correctivePlan ? 'پیگیری برنامهٔ اصلاحی ثبت‌شده در ریسک مادر.' : 'برنامهٔ اصلاحی سازمانی برای ریسک مادر تعریف شود.', riskIds: c.children.map((x) => x.id) })
  return out
}

export const LEVEL_LABEL = RISK_LEVEL_LABEL_FA
