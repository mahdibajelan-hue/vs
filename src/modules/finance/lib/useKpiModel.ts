import { useEffect, useMemo } from 'react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { useFinanceControlStore } from '../store/useFinanceControlStore'
import { useProgressStore } from '../store/useProgressStore'
import { currentBudget, currentJalaliYearBudget } from './financeCalc'
import { findExceptions, landBridge, type FinThresholds } from './financeControl'
import { projectKpis, type ProjectKpi } from './financeKpis'
import { useThresholds } from './useThresholds'

export interface ProjectRow { id: string; name: string; kpi: ProjectKpi; exceptions: number; critical: number }

/** KPI rows for every project that has money or contracts in the module, plus the portfolio exceptions — one place so every view shows the same numbers. */
export function useKpiModel() {
  const projects = useMasterDataStore((s) => s.projects)
  const fin = useFinanceStore()
  const ctl = useFinanceControlStore()
  const physical = useProgressStore((s) => s.physical)
  const loadProgress = useProgressStore((s) => s.load)
  const { thresholds } = useThresholds()
  const today = new Date().toISOString().slice(0, 10)
  useEffect(() => { loadProgress(projects) }, [projects, loadProgress])

  return useMemo(() => {
    const exceptionsAll = findExceptions({ contracts: fin.contracts, amendments: fin.amendments, certificates: fin.certificates, guarantees: fin.guarantees, claims: fin.claims, thresholds, today,
      budgetByProject: new Map(), land: new Map([...ctl.land].map(([id, l]) => [id, landBridge(l, thresholds)])) })
    const rows: ProjectRow[] = []
    for (const p of projects) {
      const kpi = financeKpiOf(fin, ctl, p.id, physical.get(p.id) ?? null, thresholds, today)
      if (!kpi) continue
      const ex = exceptionsAll.filter((e) => e.masterProjectId === p.id)
      const budgetEx = kpi.bac > 0 && kpi.committedPct != null && kpi.committedPct >= thresholds.budgetWarnPct ? 1 : 0
      rows.push({ id: p.id, name: p.officialName, kpi, exceptions: ex.length + budgetEx, critical: ex.filter((e) => e.severity === 'critical').length + (kpi.committedPct != null && kpi.committedPct >= thresholds.budgetCriticalPct ? 1 : 0) })
    }
    return { rows, exceptions: exceptionsAll, thresholds, today }
  }, [projects, fin.contracts, fin.amendments, fin.certificates, fin.payments, fin.guarantees, fin.claims, fin.budgets, fin.budgetChanges, fin.annualBudgets, fin.cashflowForecasts, ctl.land, ctl.clearances, ctl.budgetLines, ctl.changes, ctl.plans, physical, thresholds, today])
}

type FinState = Pick<ReturnType<typeof useFinanceStore.getState>, 'contracts' | 'amendments' | 'certificates' | 'payments' | 'guarantees' | 'claims' | 'budgets' | 'budgetChanges' | 'annualBudgets' | 'cashflowForecasts'>
type CtlState = Pick<ReturnType<typeof useFinanceControlStore.getState>, 'land' | 'clearances' | 'budgetLines' | 'changes' | 'plans'>

/** One project's finance indicators (the module's own numbers); null when the project has no money or contracts in the module. Pure. */
export function financeKpiOf(fin: FinState, ctl: CtlState, projectId: string, physical: number | null, thresholds: FinThresholds, today: string): ProjectKpi | null {
  const contracts = fin.contracts.filter((c) => c.masterProjectId === projectId)
  const land = ctl.land.get(projectId) ?? null
  const budgetRow = fin.budgets.find((b) => b.masterProjectId === projectId) ?? null
  if (!contracts.length && !land && !budgetRow) return null
  const ids = new Set(contracts.map((c) => c.id))
  const bac = currentBudget(budgetRow, fin.budgetChanges.filter((c) => c.masterProjectId === projectId))
  return projectKpis({
    contracts, amendments: fin.amendments, certificates: fin.certificates.filter((c) => ids.has(c.contractId)), payments: fin.payments, guarantees: fin.guarantees.filter((g) => ids.has(g.contractId)), claims: fin.claims.filter((c) => ids.has(c.contractId)),
    clearances: ctl.clearances.filter((c) => ids.has(c.contractId)), bac, annual: currentJalaliYearBudget(projectId, fin.annualBudgets), linesTotal: ctl.budgetLines.filter((l) => l.masterProjectId === projectId && l.isActive).reduce((n, l) => n + l.approvedAmount, 0), land,
    changes: ctl.changes.filter((c) => c.masterProjectId === projectId).map((c) => ({ id: c.id, contractId: c.contractId, status: c.status, proposedAmount: c.proposedAmount })), plans: ctl.plans.filter((x) => x.projectId === projectId), manualForecasts: fin.cashflowForecasts.filter((f) => ids.has(f.contractId)),
    physical, thresholds, today,
  })
}
