import { useMemo } from 'react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../store/useFinanceStore'
import { useFinanceControlStore } from '../store/useFinanceControlStore'
import { certificatePaidTotal, computeContractorScorecard, currentBudget, currentContractValue } from './financeCalc'
import { findExceptions, forecast, landBridge } from './financeControl'
import { buildInsights } from './financeInsights'
import { isoMonthIdx, idxToYM, paidEvents } from './financeCurves'
import { useThresholds } from './useThresholds'
import { JALALI_MONTHS } from '../../../lib/jalali'

/** Everything the portfolio views need, computed once from the loaded stores: per-project forecast, exceptions, pending insights, monthly payments and contractor scores. */
export function usePortfolioModel() {
  const projects = useMasterDataStore((s) => s.projects)
  const fin = useFinanceStore()
  const ctl = useFinanceControlStore()
  const { thresholds } = useThresholds()
  const today = new Date().toISOString().slice(0, 10)
  const model = useMemo(() => {
    const rows = projects.map((p) => {
      const contracts = fin.contracts.filter((c) => c.masterProjectId === p.id)
      if (!contracts.length && !ctl.land.get(p.id)) return null
      const ids = new Set(contracts.map((c) => c.id))
      const certs = fin.certificates.filter((c) => ids.has(c.contractId))
      const land = ctl.land.get(p.id) ?? null
      const budget = currentBudget(fin.budgets.find((b) => b.masterProjectId === p.id) ?? null, fin.budgetChanges.filter((c) => c.masterProjectId === p.id))
      const fc = forecast({ contracts, amendments: fin.amendments, certificates: certs, claims: fin.claims.filter((c) => ids.has(c.contractId)), land, budget, thresholds, paidContracts: certs.reduce((n, c) => n + certificatePaidTotal(c), 0),
        pending: ctl.changes.filter((c) => c.masterProjectId === p.id).map((c) => ({ contractId: c.contractId, status: c.status, proposedAmount: c.proposedAmount })) })
      const commitment = contracts.filter((c) => c.status === 'active' || c.status === 'completed').reduce((n, c) => n + currentContractValue(c, fin.amendments), 0) + (land?.exposure ?? 0)
      return { p, contracts, certs, fc, budget, commitment, land }
    }).filter((r): r is NonNullable<typeof r> => !!r)
    const exceptions = findExceptions({ contracts: fin.contracts, amendments: fin.amendments, certificates: fin.certificates, guarantees: fin.guarantees, claims: fin.claims, thresholds, today,
      budgetByProject: new Map(rows.map((r) => [r.p.id, { budget: r.budget, commitment: r.commitment }])), land: new Map(rows.filter((r) => r.land).map((r) => [r.p.id, landBridge(r.land!, thresholds)])) })
    const insights = buildInsights({ contracts: fin.contracts, amendments: fin.amendments, certificates: fin.certificates, clearances: ctl.clearances, today }).filter((i) => !ctl.reviews.has(i.key))
    const nowIdx = isoMonthIdx(today) ?? 0
    const ev = paidEvents(fin.certificates, fin.payments, { fund: 'rial', currency: 'ریال' })
    const months = Array.from({ length: 6 }, (_, k) => { const idx = nowIdx - 5 + k; const { jy, jm } = idxToYM(idx); return { idx, label: `${JALALI_MONTHS[jm - 1]} ${(jy % 100).toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}`, paid: ev.filter((e) => e.idx === idx).reduce((n, e) => n + e.amount, 0) } })
    const contractors = fin.contracts.filter((c) => c.status === 'active' || c.status === 'completed').map((c) => ({ c, s: computeContractorScorecard(c, fin.certificates, fin.claims, today), project: projects.find((p) => p.id === c.masterProjectId)?.officialName ?? '' })).sort((a, b) => a.s.score - b.s.score)
    return { rows, exceptions, insights, months, contractors }
  }, [projects, fin.contracts, fin.certificates, fin.amendments, fin.budgets, fin.budgetChanges, fin.claims, fin.guarantees, fin.payments, ctl.land, ctl.changes, ctl.clearances, ctl.reviews, thresholds, today])
  return { model, today, projects, thresholds }
}
