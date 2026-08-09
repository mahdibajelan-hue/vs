import { supabase } from '../../../lib/supabaseClient'
import { projectFromRow } from '../../../lib/supabaseData'
import type { Project } from '../../../types'
import { rmActionFromRow, rmAssessmentFromRow, rmRiskFromRow, type RmRiskActionRow, type RmRiskAssessmentRow, type RmRiskRow } from '../../risk/lib/riskData'
import type { RmRisk, RmRiskAction, RmRiskAssessment } from '../../risk/types'
import { imIssueFromRow, type ImIssueRow } from '../../issues/lib/issueData'
import type { ImIssue } from '../../issues/types'

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
  source_module: string
  source_project_id: string
}

async function resolveConfirmedMappings(masterProjectId: string): Promise<MappingRow[]> {
  const { data } = await supabase
    .from('rasta_project_mappings')
    .select('source_module, source_project_id')
    .eq('master_project_id', masterProjectId)
    .eq('status', 'confirmed')
  return (data ?? []) as MappingRow[]
}

async function fetchRiskBundle(sourceProjectId: string): Promise<ProjectIntelligenceBundle['risk']> {
  const { data: risks } = await supabase.from('rm_risks').select('*').eq('project_id', sourceProjectId)
  const riskIds = ((risks ?? []) as RmRiskRow[]).map((r) => r.id)
  if (riskIds.length === 0) {
    return { risks: [], assessments: [], actions: [] }
  }
  const [{ data: assessments }, { data: actions }] = await Promise.all([
    supabase.from('rm_risk_assessments').select('*').in('risk_id', riskIds),
    supabase.from('rm_risk_actions').select('*').in('risk_id', riskIds),
  ])
  return {
    risks: ((risks ?? []) as RmRiskRow[]).map(rmRiskFromRow),
    assessments: ((assessments ?? []) as RmRiskAssessmentRow[]).map(rmAssessmentFromRow),
    actions: ((actions ?? []) as RmRiskActionRow[]).map(rmActionFromRow),
  }
}

async function fetchIssueBundle(sourceProjectId: string): Promise<ProjectIntelligenceBundle['issues']> {
  const { data } = await supabase.from('im_issues').select('*').eq('project_id', sourceProjectId)
  return { issues: ((data ?? []) as ImIssueRow[]).map(imIssueFromRow) }
}

async function fetchPipePulseBundle(sourceProjectId: string): Promise<ProjectIntelligenceBundle['pipepulse']> {
  const [{ data: projectRow }, { data: lineRows }, { data: logRows }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', sourceProjectId).single(),
    supabase.from('lines').select('*').eq('project_id', sourceProjectId).order('created_at'),
    supabase.from('daily_logs').select('*').eq('project_id', sourceProjectId).order('date', { ascending: false }),
  ])
  if (!projectRow) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { project: projectFromRow(projectRow as any, (lineRows ?? []) as any, (logRows ?? []) as any) }
}

/**
 * Given a master project, fetches live data from every module it has a confirmed mapping to.
 * A module the master project isn't mapped to yet simply comes back null — widgets for that
 * module render an "unmapped" state rather than erroring.
 */
export async function fetchProjectIntelligence(masterProjectId: string): Promise<ProjectIntelligenceBundle> {
  const mappings = await resolveConfirmedMappings(masterProjectId)
  const riskMapping = mappings.find((m) => m.source_module === 'risk')
  const issueMapping = mappings.find((m) => m.source_module === 'issues')
  const pipepulseMapping = mappings.find((m) => m.source_module === 'pipepulse')

  const [risk, issues, pipepulse] = await Promise.all([
    riskMapping ? fetchRiskBundle(riskMapping.source_project_id) : Promise.resolve(null),
    issueMapping ? fetchIssueBundle(issueMapping.source_project_id) : Promise.resolve(null),
    pipepulseMapping ? fetchPipePulseBundle(pipepulseMapping.source_project_id) : Promise.resolve(null),
  ])

  return { masterProjectId, generatedAt: new Date().toISOString(), risk, issues, pipepulse }
}
