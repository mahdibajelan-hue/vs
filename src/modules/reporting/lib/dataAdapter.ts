import { supabase } from '../../../lib/supabaseClient'
import { batchedRows, sortBy } from '../../../lib/batchedQuery'
import { projectFromRow } from '../../../lib/supabaseData'
import type { Project } from '../../../types'
import { rmActionFromRow, rmAssessmentFromRow, rmRiskFromRow, type RmRiskActionRow, type RmRiskAssessmentRow, type RmRiskRow } from '../../risk/lib/riskData'
import type { RmRisk, RmRiskAction, RmRiskAssessment } from '../../risk/types'
import { imIssueFromRow, type ImIssueRow } from '../../issues/lib/issueData'
import type { ImIssue } from '../../issues/types'
import { decisionFromRow, rastaActionFromRow, type DecisionRow, type RastaActionRow } from './reportingData'
import type { Decision, RastaAction } from '../types'

/**
 * Cross-module data bundle for one master project — resolved via rasta_project_mappings
 * (confirmed mappings only) and fetched straight from each module's own tables, reusing
 * that module's own row mappers so this layer never re-implements row parsing.
 */
export interface ProjectIntelligenceBundle {
  masterProjectId: string
  generatedAt: string
  risk: { risks: RmRisk[]; assessments: RmRiskAssessment[]; actions: RmRiskAction[] } | null
  issues: { issues: ImIssue[] } | null
  pipepulse: { project: Project } | null
}

interface MappingRow {
  master_project_id: string
  source_module: string
  source_project_id: string
}

async function resolveConfirmedMappings(masterProjectIds: string[]): Promise<MappingRow[]> {
  if (masterProjectIds.length === 0) return []
  // batched: projects loading together share one query (lib/batchedQuery)
  return (await batchedRows({ table: 'rasta_project_mappings', column: 'master_project_id', select: 'master_project_id, source_module, source_project_id', eq: { status: 'confirmed' } }, masterProjectIds)) as unknown as MappingRow[]
}

/** Aggregates risk data across one or more rm_projects — a single id behaves exactly like the old per-project fetch. */
async function fetchRiskBundle(sourceProjectIds: string[]): Promise<ProjectIntelligenceBundle['risk']> {
  if (sourceProjectIds.length === 0) return null
  const risks = await batchedRows({ table: 'rm_risks', column: 'project_id' }, sourceProjectIds)
  const riskIds = ((risks ?? []) as RmRiskRow[]).map((r) => r.id)
  if (riskIds.length === 0) {
    return { risks: [], assessments: [], actions: [] }
  }
  const [assessments, actions] = await Promise.all([
    batchedRows({ table: 'rm_risk_assessments', column: 'risk_id' }, riskIds),
    batchedRows({ table: 'rm_risk_actions', column: 'risk_id' }, riskIds),
  ])
  return {
    risks: ((risks ?? []) as RmRiskRow[]).map(rmRiskFromRow),
    assessments: ((assessments ?? []) as RmRiskAssessmentRow[]).map(rmAssessmentFromRow),
    actions: ((actions ?? []) as RmRiskActionRow[]).map(rmActionFromRow),
  }
}

/** Aggregates issue data across one or more im_projects — a single id behaves exactly like the old per-project fetch. */
async function fetchIssueBundle(sourceProjectIds: string[]): Promise<ProjectIntelligenceBundle['issues']> {
  if (sourceProjectIds.length === 0) return null
  const data = await batchedRows({ table: 'im_issues', column: 'project_id' }, sourceProjectIds)
  return { issues: (data as unknown as ImIssueRow[]).map(imIssueFromRow) }
}

/**
 * PipePulse's per-project detail (S-curve, milestones, lines) is inherently single-project — a
 * "merged Project" across a whole Program/Portfolio has no coherent meaning, so this stays
 * single-id only. Program/Portfolio-scoped bundles simply carry pipepulse: null; the exec/progress
 * widgets already render their own "no data" state for that (same as an unmapped project today).
 */
async function fetchPipePulseBundle(sourceProjectId: string): Promise<ProjectIntelligenceBundle['pipepulse']> {
  const [[projectRow], lineRows, logRows] = await Promise.all([
    batchedRows({ table: 'projects', column: 'id' }, sourceProjectId),
    batchedRows({ table: 'lines', column: 'project_id' }, sourceProjectId).then((r) => sortBy(r, 'created_at')),
    batchedRows({ table: 'daily_logs', column: 'project_id' }, sourceProjectId).then((r) => sortBy(r, 'date', true)),
  ])
  if (!projectRow) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { project: projectFromRow(projectRow as any, (lineRows ?? []) as any, (logRows ?? []) as any) }
}

export type IntelligenceScope = { type: 'project' | 'program' | 'portfolio'; id: string }

/** Every master_projects row under a Program or Portfolio — the same hierarchy every other module's rollup reads, never redefined here. */
async function resolveMasterProjectIdsForScope(scope: IntelligenceScope): Promise<string[]> {
  if (scope.type === 'project') return [scope.id]
  const column = scope.type === 'program' ? 'program_id' : 'portfolio_id'
  const { data } = await supabase.from('master_projects').select('id').eq(column, scope.id)
  return ((data ?? []) as { id: string }[]).map((r) => r.id)
}

/**
 * Fetches live data from every module with a confirmed mapping under the given scope. For a
 * single project this is identical to the old per-project fetch; for a Program or Portfolio it
 * aggregates risk/issue data across every project underneath (single source of truth — no
 * independent portfolio-level numbers, everything rolls up from the same underlying records).
 */
export async function fetchScopedIntelligence(scope: IntelligenceScope): Promise<ProjectIntelligenceBundle> {
  const masterProjectIds = await resolveMasterProjectIdsForScope(scope)
  const mappings = await resolveConfirmedMappings(masterProjectIds)
  const riskProjectIds = mappings.filter((m) => m.source_module === 'risk').map((m) => m.source_project_id)
  const issueProjectIds = mappings.filter((m) => m.source_module === 'issues').map((m) => m.source_project_id)
  const pipepulseMapping = scope.type === 'project' ? mappings.find((m) => m.source_module === 'pipepulse') : undefined

  const [risk, issues, pipepulse] = await Promise.all([
    fetchRiskBundle(riskProjectIds),
    fetchIssueBundle(issueProjectIds),
    pipepulseMapping ? fetchPipePulseBundle(pipepulseMapping.source_project_id) : Promise.resolve(null),
  ])

  return { masterProjectId: scope.id, generatedAt: new Date().toISOString(), risk, issues, pipepulse }
}

/**
 * Decisions/actions aren't per-module-mapped data (they live directly in rasta_decisions/
 * rasta_actions, keyed to master_projects) — so unlike fetchScopedIntelligence this needs no
 * mapping resolution, just the same scope -> master_project_ids expansion reused above.
 */
export async function fetchScopedDecisionsActions(scope: IntelligenceScope): Promise<{ decisions: Decision[]; actions: RastaAction[] }> {
  const masterProjectIds = await resolveMasterProjectIdsForScope(scope)
  if (masterProjectIds.length === 0) return { decisions: [], actions: [] }
  const [{ data: decisionRows }, { data: actionRows }] = await Promise.all([
    supabase.from('rasta_decisions').select('*').in('master_project_id', masterProjectIds),
    supabase.from('rasta_actions').select('*').in('master_project_id', masterProjectIds),
  ])
  return {
    decisions: ((decisionRows ?? []) as DecisionRow[]).map(decisionFromRow),
    actions: ((actionRows ?? []) as RastaActionRow[]).map(rastaActionFromRow),
  }
}

/**
 * Given a master project, fetches live data from every module it has a confirmed mapping to.
 * A module the master project isn't mapped to yet simply comes back null — widgets for that
 * module render an "unmapped" state rather than erroring.
 */
export function fetchProjectIntelligence(masterProjectId: string): Promise<ProjectIntelligenceBundle> {
  return fetchScopedIntelligence({ type: 'project', id: masterProjectId })
}
