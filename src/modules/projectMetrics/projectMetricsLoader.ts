import { useExecutionStore } from '../execution/store/useExecutionStore'
import { STOPPAGE_CATEGORY_FA } from '../execution/lib/formCatalog'
import { ensureEpcStores, epcProgressOf, epcWindowOf } from '../epc/epcProgressLoader'
import { weightsFromReport } from '../epc/epcProgress'
import { useFinanceStore } from '../finance/store/useFinanceStore'
import { useFinanceControlStore } from '../finance/store/useFinanceControlStore'
import { currentBudget, currentContractValue } from '../finance/lib/financeCalc'
import { FIN_CONTRACT_ROLE_LABEL_FA } from '../finance/types'
import { useMasterDataStore } from '../masterdata/store/useMasterDataStore'
import { fetchProjectIntelligence } from '../reporting/lib/dataAdapter'
import { currentState, riskLevel } from '../risk/lib/riskScore'
import type { RmRiskAssessment } from '../risk/types'
import { loadLifecycleInputs } from './lifecycleInputs'
import { projectMetrics, type ProjectMetrics, type Slice } from './projectMetricsCore'

const ACTIVE_RISK = new Set(['open', 'monitoring', 'escalated'])
const LEVELS: [string, string][] = [['critical', 'بحرانی'], ['high', 'بالا'], ['medium', 'متوسط'], ['low', 'کم']]

async function ensureFinance() {
  const f = useFinanceStore.getState(), c = useFinanceControlStore.getState()
  await Promise.all([f.loaded ? null : f.fetchAll(), c.loaded ? null : c.fetchAll()]).catch(() => undefined)
}

/** Active risks of the project by level — the same scoring (current state → level) the radar and the risk module use. */
async function riskSlices(masterProjectId: string): Promise<Slice[]> {
  try {
    const b = await fetchProjectIntelligence(masterProjectId)
    const risks = (b.risk?.risks ?? []).filter((r) => ACTIVE_RISK.has(r.status))
    const by = new Map<string, RmRiskAssessment[]>()
    for (const a of b.risk?.assessments ?? []) by.set(a.riskId, [...(by.get(a.riskId) ?? []), a])
    const count = new Map<string, number>()
    for (const r of risks) { const l = riskLevel(currentState(r, by.get(r.id) ?? []).score); count.set(l, (count.get(l) ?? 0) + 1) }
    return LEVELS.map(([key, label]) => ({ key, label, value: count.get(key) ?? 0 }))
  } catch { return [] }
}

/** Everything the project dashboard shows, from the modules' own data and engines. */
export async function loadProjectMetrics(masterProjectId: string): Promise<ProjectMetrics | null> {
  const [lc] = await Promise.all([loadLifecycleInputs(masterProjectId), ensureEpcStores(), ensureFinance()])
  if (!lc) return null
  const risks = await riskSlices(masterProjectId)
  const today = new Date().toISOString().slice(0, 10)
  const weights = weightsFromReport(lc.clientReport)

  // finance: the module's own definitions (live contracts, certified amounts of non-rejected certificates)
  const fin = useFinanceStore.getState(), ctl = useFinanceControlStore.getState()
  const live = fin.contracts.filter((c) => c.masterProjectId === masterProjectId && c.status !== 'draft' && c.status !== 'replaced')
  const ids = new Set(live.map((c) => c.id))
  const certs = fin.certificates.filter((c) => ids.has(c.contractId) && c.status !== 'rejected' && c.status !== 'draft')
  const budgetRow = fin.budgets.find((b) => b.masterProjectId === masterProjectId) ?? null
  const typeLabel = (key: string, role: string) => ctl.configItems.find((i) => i.kind === 'contract_type' && i.key === key)?.label ?? FIN_CONTRACT_ROLE_LABEL_FA[role as keyof typeof FIN_CONTRACT_ROLE_LABEL_FA] ?? 'سایر'
  const cat = new Map<string, number>()
  for (const c of certs) { const k = live.find((x) => x.id === c.contractId); const l = k ? typeLabel(k.contractType, k.contractRole) : 'سایر'; cat.set(l, (cat.get(l) ?? 0) + (c.certifiedAmount ?? 0)) }

  // delays: stoppage hours of the project's daily reports by cause
  const ex = useExecutionStore.getState()
  const reps = new Set(ex.reports.filter((r) => r.projectId === masterProjectId).map((r) => r.id))
  const hours = new Map<string, number>()
  for (const s of ex.stoppages) if (reps.has(s.reportId)) hours.set(s.category, (hours.get(s.category) ?? 0) + s.hours)

  const master = useMasterDataStore.getState().projects.find((p) => p.id === masterProjectId)
  return projectMetrics({
    lc, today,
    epcAt: (t) => epcProgressOf(masterProjectId, weights, t),
    epcWindow: epcWindowOf(masterProjectId),
    finance: {
      budget: currentBudget(budgetRow, fin.budgetChanges.filter((c) => c.masterProjectId === masterProjectId)),
      contractsValue: live.filter((c) => c.status !== 'terminated').reduce((n, c) => n + currentContractValue(c, fin.amendments), 0),
      masterValue: master?.contractValue ?? 0,
      certificates: certs.map((c) => ({ date: (c.certificateDate ?? '').slice(0, 10), amount: c.certifiedAmount ?? 0 })).filter((c) => c.date),
      byCategory: [...cat].map(([label, value]) => ({ key: label, label, value })),
    },
    risks,
    delays: [...hours].map(([k, v]) => ({ key: k, label: STOPPAGE_CATEGORY_FA[k] ?? k, value: v })),
  })
}
