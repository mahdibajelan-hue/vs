import { useEffect, useMemo } from 'react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { buildProjectSummaries, usePortfolioDashboardRaw } from '../../reporting/lib/portfolioDashboard'
import { usePortfolioStore } from '../store/usePortfolioStore'
import { buildViews, type PfProjectInput } from './portfolioCore'

export interface PortfolioScope { portfolioId: string | null; programId: string | null }

/**
 * Every project of the scope as a portfolio view: master data + the project's own snapshot + its risk level + the
 * governance rows. The same list feeds every tab, so the numbers agree between them.
 */
export function usePortfolioViews(scope: PortfolioScope) {
  const portfolios = useMasterDataStore((s) => s.portfolios)
  const programs = useMasterDataStore((s) => s.programs)
  const projects = useMasterDataStore((s) => s.projects)
  const st = usePortfolioStore()

  const allIds = useMemo(() => projects.map((p) => p.id), [projects])
  const { data: raw } = usePortfolioDashboardRaw(allIds)

  useEffect(() => { if (!usePortfolioStore.getState().loaded) void usePortfolioStore.getState().loadGovernance() }, [])
  useEffect(() => { if (allIds.length) void usePortfolioStore.getState().loadSnapshots(allIds) }, [allIds])

  const summaries = useMemo(() => (raw ? buildProjectSummaries(projects, portfolios, programs, raw) : []), [raw, projects, portfolios, programs])

  const inScope = useMemo(() => projects.filter((p) => (scope.programId ? p.programId === scope.programId : scope.portfolioId ? p.portfolioId === scope.portfolioId : true)), [projects, scope.portfolioId, scope.programId])

  const views = useMemo(() => {
    const inputs: PfProjectInput[] = inScope.map((p) => ({
      id: p.id, name: p.officialName, code: p.projectIdCode, portfolioId: p.portfolioId, programId: p.programId,
      budget: p.contractValue, manualEac: p.forecastCostAtCompletion,
      snapshot: st.snapshots.get(p.id) ?? null,
      riskLevel: summaries.find((s) => s.masterProjectId === p.id)?.highestActiveRiskLevel ?? null,
      score: st.scores.get(p.id) ?? null,
      decisions: st.decisions.filter((d) => d.projectId === p.id),
    }))
    return buildViews(inputs, st.weights)
  }, [inScope, st.snapshots, st.scores, st.decisions, st.weights, summaries])

  const scopedRisks = useMemo(() => (raw ? inScope.flatMap((p) => raw.risksByMaster.get(p.id) ?? []) : []), [raw, inScope])
  const scopedAssessments = useMemo(() => (raw ? scopedRisks.flatMap((r) => raw.assessmentsByRisk.get(r.id) ?? []) : []), [raw, scopedRisks])
  const currency = inScope.find((p) => p.currency)?.currency ?? 'ریال'
  const snapshotsReady = st.snapshotProgress.total > 0 && st.snapshotProgress.done >= st.snapshotProgress.total

  return { views, summaries, scopedRisks, scopedAssessments, currency, rawLoaded: !!raw, snapshotsReady, progress: st.snapshotProgress, inScope }
}
