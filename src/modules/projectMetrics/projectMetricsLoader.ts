import { useExecutionStore } from '../execution/store/useExecutionStore'
import { STOPPAGE_CATEGORY_FA } from '../execution/lib/formCatalog'
import { ensureEpcStores, epcProgressOf, epcWindowOf } from '../epc/epcProgressLoader'
import { weightsFromReport } from '../epc/epcProgress'
import { useFinanceStore } from '../finance/store/useFinanceStore'
import { useFinanceControlStore } from '../finance/store/useFinanceControlStore'
import { currentContractValue } from '../finance/lib/financeCalc'
import { FIN_CONTRACT_ROLE_LABEL_FA } from '../finance/types'
import { fetchProjectIntelligence } from '../reporting/lib/dataAdapter'
import { currentState, riskLevel } from '../risk/lib/riskScore'
import type { RmRiskAssessment } from '../risk/types'
import { loadLifecycleInputs } from './lifecycleInputs'
import { projectMetrics, type ProjectMetrics, type Slice } from './projectMetricsCore'
import { loadStageGateBundle } from '../lifecycle/lib/stageGateBundleLoader'
import { analyseProject, type ExternalCounts } from '../lifecycle/lib/useProjectAnalysis'
import type { DerivedHealth, OverallHealth } from '../lifecycle/lib/health'

const ACTIVE_RISK = new Set(['open', 'monitoring', 'escalated'])
const LEVELS: [string, string][] = [['critical', 'بحرانی'], ['high', 'بالا'], ['medium', 'متوسط'], ['low', 'کم']]

async function ensureFinance() {
  const f = useFinanceStore.getState(), c = useFinanceControlStore.getState()
  await Promise.all([f.loaded ? null : f.fetchAll(), c.loaded ? null : c.fetchAll()]).catch(() => undefined)
}

const OPEN_ISSUE = new Set(['open', 'in_progress', 'pending_approval'])
interface RiskPicture { slices: Slice[]; openCriticalRisks: number; openCriticalIssues: number }
/** Active risks by level and the critical counts the health engine needs — the same scoring (current state → level)
 * and the same open-issue rule the radar and the risk / issue modules use. */
async function riskPicture(masterProjectId: string): Promise<RiskPicture> {
  try {
    const b = await fetchProjectIntelligence(masterProjectId)
    const risks = (b.risk?.risks ?? []).filter((r) => ACTIVE_RISK.has(r.status))
    const by = new Map<string, RmRiskAssessment[]>()
    for (const a of b.risk?.assessments ?? []) by.set(a.riskId, [...(by.get(a.riskId) ?? []), a])
    const count = new Map<string, number>()
    for (const r of risks) { const l = riskLevel(currentState(r, by.get(r.id) ?? []).score); count.set(l, (count.get(l) ?? 0) + 1) }
    return {
      slices: LEVELS.map(([key, label]) => ({ key, label, value: count.get(key) ?? 0 })),
      openCriticalRisks: count.get('critical') ?? 0,
      openCriticalIssues: (b.issues?.issues ?? []).filter((i) => OPEN_ISSUE.has(i.status) && i.priority === 'critical').length,
    }
  } catch { return { slices: [], openCriticalRisks: 0, openCriticalIssues: 0 } }
}

export interface ProjectHealth extends OverallHealth { dims: DerivedHealth[]; /** why a gate is blocked (a black verdict) */ blockers: string[] }
export type ProjectSnapshot = ProjectMetrics & { health: ProjectHealth | null }

/** Performance indexes (actual ÷ planned) the health engine scores: each EPC discipline, the lifecycle, the EPC CPI. */
export function perfOf(m: ProjectMetrics): NonNullable<ExternalCounts['perf']> {
  const ratio = (d: { actual: number; planned: number | null } | null | undefined) => (d && d.planned != null && d.planned > 0 ? d.actual / d.planned : null)
  return { engineering: ratio(m.epc.eng), procurement: ratio(m.epc.proc), construction: ratio(m.epc.cons), schedule: ratio(m.lifecycle), cost: m.evm.cpi }
}

/** Everything the project dashboard shows, from the modules' own data and engines. */
export async function loadProjectMetrics(masterProjectId: string): Promise<ProjectSnapshot | null> {
  const [lc, risk, bundle] = await Promise.all([loadLifecycleInputs(masterProjectId), riskPicture(masterProjectId), loadStageGateBundle(masterProjectId).catch(() => null), ensureEpcStores(), ensureFinance()])
  if (!lc) return null
  const today = new Date().toISOString().slice(0, 10)
  const weights = weightsFromReport(lc.clientReport)

  // finance: the module's own definitions (live contracts, certified amounts of non-rejected certificates)
  const fin = useFinanceStore.getState(), ctl = useFinanceControlStore.getState()
  const live = fin.contracts.filter((c) => c.masterProjectId === masterProjectId && c.status !== 'draft' && c.status !== 'replaced')
  const ids = new Set(live.map((c) => c.id))
  const certs = fin.certificates.filter((c) => ids.has(c.contractId) && c.status !== 'rejected' && c.status !== 'draft')
  // the EPC contract(s): EVM is measured on the EPC scope only
  const epcLive = live.filter((c) => c.contractRole === 'main_epc' || c.contractType === 'epc')
  const epcIds = new Set(epcLive.map((c) => c.id))
  const typeLabel = (key: string, role: string) => ctl.configItems.find((i) => i.kind === 'contract_type' && i.key === key)?.label ?? FIN_CONTRACT_ROLE_LABEL_FA[role as keyof typeof FIN_CONTRACT_ROLE_LABEL_FA] ?? 'سایر'
  const cat = new Map<string, number>()
  for (const c of certs) { const k = live.find((x) => x.id === c.contractId); const l = k ? typeLabel(k.contractType, k.contractRole) : 'سایر'; cat.set(l, (cat.get(l) ?? 0) + (c.certifiedAmount ?? 0)) }

  // delays: stoppage hours of the project's daily reports by cause
  const ex = useExecutionStore.getState()
  const reps = new Set(ex.reports.filter((r) => r.projectId === masterProjectId).map((r) => r.id))
  const hours = new Map<string, number>()
  for (const s of ex.stoppages) if (reps.has(s.reportId)) hours.set(s.category, (hours.get(s.category) ?? 0) + s.hours)

  const m = projectMetrics({
    lc, today,
    epcAt: (t) => epcProgressOf(masterProjectId, weights, t),
    epcWindow: epcWindowOf(masterProjectId),
    finance: {
      epcContractsValue: epcLive.filter((c) => c.status !== 'terminated').reduce((n, c) => n + currentContractValue(c, fin.amendments), 0),
      epcCertificates: certs.filter((c) => epcIds.has(c.contractId)).map((c) => ({ date: (c.certificateDate ?? '').slice(0, 10), amount: c.certifiedAmount ?? 0 })).filter((c) => c.date),
      byCategory: [...cat].map(([label, value]) => ({ key: label, label, value })),
    },
    risks: risk.slices,
    delays: [...hours].map(([k, v]) => ({ key: k, label: STOPPAGE_CATEGORY_FA[k] ?? k, value: v })),
  })
  // health: the lifecycle health engine, with engineering / procurement / construction / schedule / cost scored from the
  // modules' own performance indexes above — the radar shows exactly this
  let health: ProjectHealth | null = null
  if (bundle) {
    const a = analyseProject(bundle, { openCriticalRisks: risk.openCriticalRisks, criticalRisksWithoutMitigation: risk.openCriticalRisks, openCriticalIssues: risk.openCriticalIssues, perf: perfOf(m) })
    const blocked = new Set([...a.gateStatuses].filter(([, st]) => st === 'blocked').map(([k]) => k))
    const blockers = a.readiness.filter((r) => blocked.has(r.stageKey)).flatMap((r) => r.blockers.filter((b) => b.kind === 'critical_issue' || b.kind === 'milestone_not_achieved').map((b) => `${r.stageKey}: ${b.label}`))
    health = { ...a.overall, dims: a.health, blockers }
  }
  return { ...m, health }
}
