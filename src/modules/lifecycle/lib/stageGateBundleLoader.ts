import { loadEpcProgress } from '../../epc/epcProgressLoader'
import { supabase } from '../../../lib/supabaseClient'
import { batchedRows, shared, sortBy } from '../../../lib/batchedQuery'
import type { ProjectLifecycleBundle } from '../store/useLifecycleStore'
import { buildStageGateBundle, type SgItemDef } from './stageGateBundle'
import {
  actionFromRow, forecastPointFromRow, healthFromRow, milestoneFromRow, warningFromRow,
  type PlcForecastHistoryRow, type PlcHealthRow, type PlcMilestoneRow, type PlcWarningRow, type RastaActionRow,
} from './lifecycleData'

type Row = Record<string, unknown>
const s = (v: unknown) => (v == null ? '' : String(v))
const sn = (v: unknown) => (v == null || v === '' ? null : String(v))

/** The control-tower bundle of a master project, built from its linked Stage-Gate project (null when it has none). */
export async function loadStageGateBundle(masterProjectId: string): Promise<ProjectLifecycleBundle | null> {
  // batched: every project loading at the same time shares one query per table (see lib/batchedQuery)
  const [proj] = await batchedRows({ table: 'sg_projects', column: 'master_project_id', select: 'name, master_project_id' }, masterProjectId)
  const project = sn((proj as Row | undefined)?.name)
  if (!project) return null
  const byName = (table: string) => batchedRows({ table, column: 'project_name' }, project).then((data) => ({ data }))
  const byId = (table: string, column = 'project_id', eq?: Record<string, string>) => batchedRows({ table, column, eq }, masterProjectId).then((data) => ({ data }))
  const [ph, du, ob, out, cr, it, dc, pr, sc, hi, ms, hl, wn, ac, lcRows, rep] = await Promise.all([
    shared('sg_lifecycle_phases:active', () => supabase.from('sg_lifecycle_phases').select('*').eq('is_active', true).order('sort_order')),
    shared('sg_lifecycle_phase_durations', () => supabase.from('sg_lifecycle_phase_durations').select('phase_code, duration_days')),
    shared('sg_lifecycle_objectives', () => supabase.from('sg_lifecycle_objectives').select('id, phase_code, seq, title, description').eq('is_active', true)),
    shared('sg_lifecycle_outputs', () => supabase.from('sg_lifecycle_outputs').select('id, phase_code, seq, title, description').eq('is_active', true)),
    shared('sg_lifecycle_criteria', () => supabase.from('sg_lifecycle_criteria').select('id, phase_code, seq, title, description, is_mandatory').eq('is_active', true)),
    byName('sg_project_phase_items'),
    byName('sg_lifecycle_gate_decisions'),
    byName('sg_project_lifecycle_phases'),
    byName('sg_lifecycle_schedule_items'),
    byName('sg_lifecycle_progress_history'),
    byId('plc_milestones'),
    byId('plc_health_scores'),
    byId('plc_early_warnings', 'project_id', { status: 'open' }),
    byId('rasta_actions', 'master_project_id'),
    byId('plc_project_lifecycle'),
    byName('sg_client_reports').then((r) => ({ data: sortBy(r.data, 'created_at', true).slice(0, 1) })),
  ])
  const lc = { data: (lcRows.data[0] ?? null) as Row | null }
  if (ph.error) return null
  const milestones = ((ms.data ?? []) as PlcMilestoneRow[]).map(milestoneFromRow)
  const fh = { data: sortBy(milestones.length ? await batchedRows({ table: 'plc_milestone_forecast_history', column: 'milestone_id' }, milestones.map((m) => m.id)) : [], 'recorded_at') }
  const days = new Map(((du.data ?? []) as Row[]).map((r) => [s(r.phase_code), Number(r.duration_days)]))
  const def = (kind: SgItemDef['kind']) => (r: Row): SgItemDef => ({ id: Number(r.id), phase: s(r.phase_code), kind, seq: Number(r.seq), title: s(r.title).replace(/\s*\[NEEDS REVIEW\]/i, ''), description: s(r.description), mandatory: kind === 'criterion' ? r.is_mandatory !== false : false })
  const lcRow = lc.data as Row | null
  return buildStageGateBundle({
    masterProjectId, project,
    phases: ((ph.data ?? []) as Row[]).map((r) => ({
      code: s(r.code), sort: Number(r.sort_order), title: s(r.title), gateName: s(r.gate_name).replace(/\s*\[NEEDS REVIEW\]/i, ''),
      threshold: r.gate_threshold_pct == null ? null : Number(r.gate_threshold_pct), group: s(r.phase_group), engine: s(r.progress_engine), icon: s(r.icon_key), responsible: s(r.responsible),
      standardDays: days.get(s(r.code)) ?? null,
    })),
    defs: [...((ob.data ?? []) as Row[]).map(def('objective')), ...((out.data ?? []) as Row[]).map(def('output')), ...((cr.data ?? []) as Row[]).map(def('criterion'))],
    items: ((it.data ?? []) as Row[]).map((r) => ({
      project, phase: s(r.phase_code), kind: s(r.kind), itemId: Number(r.item_id), status: s(r.status), updatedAt: sn(r.updated_at), updatedBy: sn(r.updated_by),
      owner: sn(r.owner), dueDate: sn(r.due_date), completionDate: sn(r.completion_date), evidence: s(r.evidence), evidenceUrl: s(r.evidence_file_url), comment: s(r.comment),
      submittedBy: sn(r.submitted_by), verifiedBy: sn(r.verified_by), verificationDate: sn(r.verification_date),
    })),
    decisions: ((dc.data ?? []) as Row[]).map((r) => ({ project, phase: s(r.phase_code), decision: s(r.decision), decidedAt: s(r.decided_at), decidedBy: sn(r.decided_by), reason: s(r.reason), conditionText: s(r.condition_text), conditionDue: sn(r.condition_due_date) })),
    phaseRows: ((pr.data ?? []) as Row[]).map((r) => ({ project, phase: s(r.phase_code), gateStatus: sn(r.gate_status), actualStart: sn(r.actual_start), actualFinish: sn(r.actual_finish), plannedStart: sn(r.planned_start), plannedFinish: sn(r.planned_finish), manualPct: r.manual_actual_pct == null ? null : Number(r.manual_actual_pct), weightPct: r.weight_pct == null ? null : Number(r.weight_pct) })),
    clientReport: ((rep.data ?? []) as Row[])[0] ?? null,
    epcLive: (await loadEpcProgress(masterProjectId, ((rep.data ?? []) as Row[])[0] ?? null)).overall,
    schedule: ((sc.data ?? []) as Row[]).map((r) => ({ id: Number(r.id), phase: s(r.phase_code), parentId: r.parent_id == null ? null : Number(r.parent_id), seq: Number(r.seq ?? 0), title: s(r.title), plannedStart: sn(r.planned_start), plannedFinish: sn(r.planned_finish), weight: r.weight_pct == null ? null : Number(r.weight_pct), manualPct: r.manual_actual_pct == null ? null : Number(r.manual_actual_pct) })),
    progress: ((hi.data ?? []) as Row[]).map((r) => ({ id: Number(r.id), phase: s(r.phase_code), newPct: Number(r.new_pct ?? 0), comment: s(r.comment), recordedBy: sn(r.recorded_by), recordedAt: s(r.recorded_at) })),
    milestones,
    forecastHistory: ((fh.data ?? []) as PlcForecastHistoryRow[]).map(forecastPointFromRow),
    health: ((hl.data ?? []) as PlcHealthRow[]).map(healthFromRow),
    warnings: ((wn.data ?? []) as PlcWarningRow[]).map(warningFromRow),
    actions: ((ac.data ?? []) as RastaActionRow[]).map(actionFromRow),
    healthOverride: lcRow ? { healthOverride: (lcRow.health_override as never) ?? null, healthOverrideReason: s(lcRow.health_override_reason), healthOverrideBy: sn(lcRow.health_override_by), healthOverrideAt: sn(lcRow.health_override_at) } : null,
  })
}
