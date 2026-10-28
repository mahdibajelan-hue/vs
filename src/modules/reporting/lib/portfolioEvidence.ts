/**
 * Portfolio / program evidence report (council phase 3): the same engine run per project, then rolled up. Nothing is
 * recomputed at the portfolio level — every line points back to the project report it came from.
 */
import type { Confidence, EvidenceReport, Finding } from './evidenceReport'

export interface PortfolioEvidence {
  projects: number
  withData: number
  confidence: Record<Confidence, number>
  /** projects that have at least one material finding */
  materialProjects: number
  byKind: { kind: Finding['kind']; label: string; projects: number; findings: number }[]
  /** material findings, worst projects first */
  hotspots: { project: string; projectId: string; material: Finding[]; decisionsOverdue: number; confidence: Confidence }[]
  decisions: { project: string; projectId: string; title: string; level: string; overdue: boolean; owner: string | null }[]
  recommendations: { project: string; projectId: string; text: string; urgency: 'now' | 'soon'; owner: string | null }[]
  /** a cause shared by several projects (same stoppage category or same blocker text) */
  sharedCauses: { text: string; projects: string[] }[]
  headline: string[]
}

export const KIND_FA: Record<Finding['kind'], string> = {
  schedule: 'زمان', cost: 'هزینه', gate: 'گیت مسدود', health: 'ابعاد سلامت', risk: 'ریسک بحرانی', issue: 'مسائل معوق', action: 'اقدام عقب‌افتاده', delay: 'توقف اجرا', decision: 'تصمیم معوق',
}

const fa = (n: number) => n.toLocaleString('fa-IR')

export function rollupEvidence(list: { projectId: string; report: EvidenceReport; hasMetrics: boolean }[]): PortfolioEvidence {
  const confidence: Record<Confidence, number> = { high: 0, medium: 0, low: 0 }
  const kinds = new Map<Finding['kind'], { projects: Set<string>; findings: number }>()
  const causeMap = new Map<string, Set<string>>()
  const hotspots: PortfolioEvidence['hotspots'] = []
  const decisions: PortfolioEvidence['decisions'] = []
  const recs: PortfolioEvidence['recommendations'] = []
  for (const { projectId, report: r } of list) {
    confidence[r.confidence]++
    const material = r.findings.filter((f) => f.materiality === 'material')
    for (const f of material) {
      const k = kinds.get(f.kind) ?? { projects: new Set(), findings: 0 }
      k.projects.add(projectId); k.findings++; kinds.set(f.kind, k)
    }
    for (const c of r.causes) {
      // group by the category / blocker, not by the full sentence (hours differ between projects)
      const key = c.text.match(/«([^»]+)»/)?.[1] ?? c.text.replace(/[\d۰-۹٫,.]+/g, '#').slice(0, 80)
      const s = causeMap.get(key) ?? new Set(); s.add(r.project); causeMap.set(key, s)
    }
    if (material.length) hotspots.push({ project: r.project, projectId, material, decisionsOverdue: r.decisions.filter((d) => d.overdue).length, confidence: r.confidence })
    for (const d of r.decisions) decisions.push({ project: r.project, projectId, title: d.title, level: d.level, overdue: d.overdue, owner: d.owner })
    for (const x of r.recommendations.filter((y) => y.urgency === 'now')) recs.push({ project: r.project, projectId, text: x.text, urgency: x.urgency, owner: x.owner })
  }
  hotspots.sort((a, b) => b.material.length - a.material.length || b.decisionsOverdue - a.decisionsOverdue)
  decisions.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.level === 'portfolio' ? -1 : 1))
  const byKind = [...kinds].map(([kind, v]) => ({ kind, label: KIND_FA[kind], projects: v.projects.size, findings: v.findings })).sort((a, b) => b.projects - a.projects)
  const sharedCauses = [...causeMap].filter(([, s]) => s.size > 1).map(([text, s]) => ({ text, projects: [...s] })).sort((a, b) => b.projects.length - a.projects.length)
  const headline: string[] = []
  if (hotspots.length) headline.push(`${fa(hotspots.length)} پروژه از ${fa(list.length)} دست‌کم یک انحراف مهم دارند.`)
  if (byKind[0]) headline.push(`فراوان‌ترین نوع انحراف مهم: ${byKind[0].label} (${fa(byKind[0].projects)} پروژه).`)
  const od = decisions.filter((d) => d.overdue).length
  if (od) headline.push(`${fa(od)} تصمیم از موعد گذشته است.`)
  if (sharedCauses[0]) headline.push(`علت مشترک در ${fa(sharedCauses[0].projects.length)} پروژه: «${sharedCauses[0].text}».`)
  if (confidence.low) headline.push(`گزارش ${fa(confidence.low)} پروژه اطمینان پایین دارد (دادهٔ کهنه یا ناقص).`)
  if (!headline.length) headline.push('انحراف مهمی در پروژه‌های این محدوده بر پایهٔ آستانه‌ها دیده نشد.')
  return {
    projects: list.length, withData: list.filter((x) => x.hasMetrics).length, confidence, materialProjects: hotspots.length,
    byKind, hotspots, decisions, recommendations: recs, sharedCauses, headline,
  }
}
