import { addDays, daysBetween } from '../../execution/lib/periods'
import { computeSchedule, type ScheduleInput, type ScheduleResult } from './schedule'
import type { LinkTarget, SchLink } from './types'

/** Plain facts read from the other modules (the adapters in the store build these; this file never touches a store). */
export interface ExecInfo { id: string; title: string; approvedPct: number | null; reportedPct: number | null; rejectedQty: number }
export interface DocInfo { id: string; docNo: string; title: string; status: string; plannedApproved: string | null; actualApproved: string | null; expectedApproval: string | null; critical: boolean }
export interface PackageInfo { id: string; code: string; title: string; status: string; delivery: 'delivered' | 'partial' | 'pending'; expectedDelivery: string | null; plannedDelivery: string | null }
export interface RiskInfo { id: string; code: string; title: string; open: boolean }
export interface IssueInfo { id: string; title: string; open: boolean }
export interface LinkSources {
  exec: Map<string, ExecInfo>; docs: Map<string, DocInfo>; packages: Map<string, PackageInfo>; risks: Map<string, RiskInfo>; issues: Map<string, IssueInfo>
}
export const emptySources = (): LinkSources => ({ exec: new Map(), docs: new Map(), packages: new Map(), risks: new Map(), issues: new Map() })

export type Severity = 'high' | 'medium' | 'low'
export interface Blocker { kind: LinkTarget; refId: string; severity: Severity; text: string; /** date by which it was needed */ needDate: string | null }
export interface ActivityIntegration {
  uid: string
  execApproved: number | null
  execReported: number | null
  execRejectedQty: number
  docsTotal: number; docsReady: number
  supplyTotal: number; supplyDelivered: number
  openRisks: number; openIssues: number
  blockers: Blocker[]
  readiness: 'ready' | 'at_risk' | 'blocked' | 'unknown'
  /** the activity cannot start before this date because of late supply (null = no constraint) */
  startNoEarlier: string | null
}

const DOC_OK = new Set(['approved'])
const DOC_OK_RESTRICTED = new Set(['approved', 'restricted'])

/**
 * Per activity: what the linked records say. Rules (documented in the user guide):
 *  - actual progress comes ONLY from linked execution activities; the supervision-approved figure is kept apart from the merely reported one and from rejected quantity;
 *  - an approved document is a prerequisite that is satisfied — it does NOT complete the activity (its own progress is independent);
 *  - a document or package needed by a date and not ready by then blocks; if it is only expected after that date it is at risk;
 *  - a package expected later than the activity's forecast start sets «start no earlier than» for the CPM (the effect on the project finish is computed there, never assumed).
 */
export function integrateActivity(uid: string, links: SchLink[], src: LinkSources, o: { today: string; forecastStart: string | null; allowRestricted?: boolean; horizonDays?: number }): ActivityIntegration {
  const mine = links.filter((l) => l.activityUid === uid)
  const horizon = o.horizonDays ?? 21
  const res: ActivityIntegration = { uid, execApproved: null, execReported: null, execRejectedQty: 0, docsTotal: 0, docsReady: 0, supplyTotal: 0, supplyDelivered: 0, openRisks: 0, openIssues: 0, blockers: [], readiness: 'unknown', startNoEarlier: null }
  if (!mine.length) return res
  const ex = mine.filter((l) => l.targetType === 'exec_activity').map((l) => src.exec.get(l.targetId)).filter((x): x is ExecInfo => !!x)
  if (ex.length) {
    const ap = ex.map((e) => e.approvedPct).filter((x): x is number => x != null), rp = ex.map((e) => e.reportedPct).filter((x): x is number => x != null)
    res.execApproved = ap.length ? ap.reduce((a, b) => a + b, 0) / ap.length : null
    res.execReported = rp.length ? rp.reduce((a, b) => a + b, 0) / rp.length : null
    res.execRejectedQty = ex.reduce((a, e) => a + e.rejectedQty, 0)
  }
  const okSet = o.allowRestricted ? DOC_OK_RESTRICTED : DOC_OK
  for (const l of mine) {
    const need = l.needDate ?? (l.needKind === 'finish' ? null : o.forecastStart)
    if (l.targetType === 'eng_doc') {
      const d = src.docs.get(l.targetId); if (!d) continue
      res.docsTotal++
      if (okSet.has(d.status)) { res.docsReady++; continue }
      const expected = d.expectedApproval ?? d.plannedApproved
      if (need && need < o.today) res.blockers.push({ kind: 'eng_doc', refId: d.id, severity: d.critical ? 'high' : 'high', needDate: need, text: `مدرک ${d.docNo} (${d.title}) تأیید نشده و تاریخ نیاز آن (${need}) گذشته است.` })
      else if (need && expected && expected > need) res.blockers.push({ kind: 'eng_doc', refId: d.id, severity: 'medium', needDate: need, text: `تأیید مدرک ${d.docNo} برای ${expected} پیش‌بینی شده، بعد از تاریخ نیاز (${need}).` })
      else if (need && daysBetween(o.today, need) <= horizon) res.blockers.push({ kind: 'eng_doc', refId: d.id, severity: 'low', needDate: need, text: `مدرک ${d.docNo} هنوز تأیید نشده و تاریخ نیاز نزدیک است (${need}).` })
    } else if (l.targetType === 'mtl_package') {
      const p = src.packages.get(l.targetId); if (!p) continue
      res.supplyTotal++
      if (p.delivery === 'delivered') { res.supplyDelivered++; continue }
      const expected = p.expectedDelivery ?? p.plannedDelivery
      if (need && need < o.today && !expected) res.blockers.push({ kind: 'mtl_package', refId: p.id, severity: 'high', needDate: need, text: `بستهٔ ${p.code} (${p.title}) تحویل نشده و تاریخ نیاز (${need}) گذشته است.` })
      else if (need && expected && expected > need) {
        res.blockers.push({ kind: 'mtl_package', refId: p.id, severity: need < o.today ? 'high' : 'medium', needDate: need, text: `تحویل بستهٔ ${p.code} برای ${expected} پیش‌بینی شده، بعد از تاریخ نیاز (${need}).` })
        res.startNoEarlier = !res.startNoEarlier || expected > res.startNoEarlier ? expected : res.startNoEarlier
      } else if (!expected && need && daysBetween(o.today, need) <= horizon) res.blockers.push({ kind: 'mtl_package', refId: p.id, severity: 'low', needDate: need, text: `برای بستهٔ ${p.code} تاریخ تحویل پیش‌بینی ثبت نشده و تاریخ نیاز نزدیک است.` })
    } else if (l.targetType === 'risk') { if (src.risks.get(l.targetId)?.open) res.openRisks++ }
    else if (l.targetType === 'issue') { if (src.issues.get(l.targetId)?.open) res.openIssues++ }
  }
  if (res.openIssues > 0) res.blockers.push({ kind: 'issue', refId: '', severity: 'medium', needDate: null, text: `${res.openIssues} مسئلهٔ باز به این فعالیت وصل است.` })
  res.readiness = res.blockers.some((b) => b.severity === 'high') ? 'blocked' : res.blockers.length || res.openRisks ? 'at_risk' : 'ready'
  return res
}

export interface DelayImpact { activityId: string; code: string; startNoEarlier: string; /** days the project finish moves because of this one constraint (0 = absorbed by float) */ projectSlipDays: number; absorbed: boolean }
/** Honest effect of late supply on the project finish: re-run the forecast with each activity's «start no earlier than» and compare — a late item is not a project delay by itself. */
export function supplyDelayImpact(base: ScheduleInput, integration: Map<string, ActivityIntegration>, idOfUid: Map<string, string>, codeOf: Map<string, string>): { overall: number | null; items: DelayImpact[]; forecast: ScheduleResult } {
  const clean = computeSchedule({ ...base, startNoEarlier: undefined })
  const bounds = new Map<string, string>()
  for (const [uid, i] of integration) if (i.startNoEarlier) { const id = idOfUid.get(uid); if (id) bounds.set(id, i.startNoEarlier) }
  if (!bounds.size || !clean.ok) return { overall: bounds.size ? null : 0, items: [], forecast: clean }
  const all = computeSchedule({ ...base, startNoEarlier: bounds })
  const items: DelayImpact[] = []
  for (const [id, d] of [...bounds].slice(0, 40)) {
    const one = computeSchedule({ ...base, startNoEarlier: new Map([[id, d]]) })
    const slip = clean.projectFinish && one.projectFinish ? daysBetween(clean.projectFinish, one.projectFinish) : 0
    items.push({ activityId: id, code: codeOf.get(id) ?? id, startNoEarlier: d, projectSlipDays: Math.max(0, slip), absorbed: slip <= 0 })
  }
  return { overall: clean.projectFinish && all.projectFinish ? daysBetween(clean.projectFinish, all.projectFinish) : null, items: items.sort((a, b) => b.projectSlipDays - a.projectSlipDays), forecast: all }
}

export const addDaysIso = addDays
