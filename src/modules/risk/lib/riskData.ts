import type {
  RmActionStatus,
  RmProject,
  RmProjectPhase,
  RmProjectStatus,
  RmResponseStrategy,
  RmRisk,
  RmRiskAction,
  RmRiskAssessment,
  RmRiskCategory,
  RmRiskHistoryEntry,
  RmRiskStatus,
  RmRiskType,
  RmTrend,
} from '../types'

export interface RmProjectRow {
  id: string
  name: string
  client: string
  project_manager_id: string | null
  start_date: string | null
  finish_date: string | null
  status: string
  created_by: string | null
  created_at: string
}

export function rmProjectFromRow(r: RmProjectRow): RmProject {
  return {
    id: r.id,
    name: r.name,
    client: r.client,
    projectManagerId: r.project_manager_id,
    startDate: r.start_date,
    finishDate: r.finish_date,
    status: r.status as RmProjectStatus,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export interface RmRiskRow {
  id: string
  project_id: string
  code: string
  title: string
  description: string
  category: string
  risk_type: string
  owner_id: string | null
  identified_date: string
  status: string
  response_strategy: string
  project_phase: string | null
  time_to_impact_days: number | null
  initial_probability: number
  initial_impact: number
  initial_score: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export function rmRiskFromRow(r: RmRiskRow): RmRisk {
  return {
    id: r.id,
    projectId: r.project_id,
    code: r.code,
    title: r.title,
    description: r.description,
    category: r.category as RmRiskCategory,
    riskType: r.risk_type as RmRiskType,
    ownerId: r.owner_id,
    identifiedDate: r.identified_date,
    status: r.status as RmRiskStatus,
    responseStrategy: r.response_strategy as RmResponseStrategy,
    projectPhase: r.project_phase as RmProjectPhase | null,
    timeToImpactDays: r.time_to_impact_days,
    initialProbability: r.initial_probability,
    initialImpact: r.initial_impact,
    initialScore: r.initial_score,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function rmRiskToRow(projectId: string, r: Partial<RmRisk>) {
  const row: Record<string, unknown> = { project_id: projectId }
  if (r.title !== undefined) row.title = r.title
  if (r.description !== undefined) row.description = r.description
  if (r.category !== undefined) row.category = r.category
  if (r.riskType !== undefined) row.risk_type = r.riskType
  if (r.ownerId !== undefined) row.owner_id = r.ownerId
  if (r.identifiedDate !== undefined) row.identified_date = r.identifiedDate
  if (r.status !== undefined) row.status = r.status
  if (r.responseStrategy !== undefined) row.response_strategy = r.responseStrategy
  if (r.projectPhase !== undefined) row.project_phase = r.projectPhase
  if (r.timeToImpactDays !== undefined) row.time_to_impact_days = r.timeToImpactDays
  if (r.initialProbability !== undefined) row.initial_probability = r.initialProbability
  if (r.initialImpact !== undefined) row.initial_impact = r.initialImpact
  return row
}

export interface RmRiskAssessmentRow {
  id: string
  risk_id: string
  review_date: string
  current_probability: number
  current_impact: number
  current_score: number
  residual_probability: number
  residual_impact: number
  residual_score: number
  trend: string
  reviewer_comment: string
  created_by: string | null
  created_at: string
}

export function rmAssessmentFromRow(r: RmRiskAssessmentRow): RmRiskAssessment {
  return {
    id: r.id,
    riskId: r.risk_id,
    reviewDate: r.review_date,
    currentProbability: r.current_probability,
    currentImpact: r.current_impact,
    currentScore: r.current_score,
    residualProbability: r.residual_probability,
    residualImpact: r.residual_impact,
    residualScore: r.residual_score,
    trend: r.trend as RmTrend,
    reviewerComment: r.reviewer_comment,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export interface RmRiskActionRow {
  id: string
  risk_id: string
  description: string
  owner_id: string | null
  due_date: string | null
  status: string
  completion_percentage: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export function rmActionFromRow(r: RmRiskActionRow): RmRiskAction {
  return {
    id: r.id,
    riskId: r.risk_id,
    description: r.description,
    ownerId: r.owner_id,
    dueDate: r.due_date,
    status: r.status as RmActionStatus,
    completionPercentage: r.completion_percentage,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function rmActionToRow(riskId: string, a: Partial<RmRiskAction>) {
  const row: Record<string, unknown> = { risk_id: riskId }
  if (a.description !== undefined) row.description = a.description
  if (a.ownerId !== undefined) row.owner_id = a.ownerId
  if (a.dueDate !== undefined) row.due_date = a.dueDate
  if (a.status !== undefined) row.status = a.status
  if (a.completionPercentage !== undefined) row.completion_percentage = a.completionPercentage
  return row
}

export interface RmRiskHistoryRow {
  id: string
  risk_id: string
  user_id: string | null
  activity: string
  previous_value: unknown
  new_value: unknown
  comment: string
  created_at: string
}

export function rmHistoryFromRow(r: RmRiskHistoryRow): RmRiskHistoryEntry {
  return {
    id: r.id,
    riskId: r.risk_id,
    userId: r.user_id,
    activity: r.activity,
    previousValue: r.previous_value,
    newValue: r.new_value,
    comment: r.comment,
    createdAt: r.created_at,
  }
}
