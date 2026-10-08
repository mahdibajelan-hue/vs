import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type {
  Activity, AuditEntry, ChecklistItem, EarlyWarning, GateDecision, HealthScore, ProgressLogEntry, ProgressSeries, HealthStatus, LifecycleAction,
  LifecycleTemplate, Milestone, MilestoneForecastPoint, ProjectGate, ProjectLifecycle, ProjectStage,
} from '../types'
import {
  actionFromRow, activityFromRow, auditFromRow, checklistFromRow, decisionFromRow, forecastPointFromRow, progressFromRow,
  gateFromRow, healthFromRow, lifecycleFromRow, milestoneFromRow, stageFromRow, templateFromRow,
  warningFromRow,
  type PlcActivityRow, type PlcAuditRow, type PlcChecklistRow, type PlcForecastHistoryRow,
  type PlcDecisionRow, type PlcProgressRow, type PlcGateRow, type PlcHealthRow, type PlcLifecycleRow, type PlcMilestoneRow, type PlcStageRow,
  type PlcTemplateRow, type PlcWarningRow, type RastaActionRow,
} from '../lib/lifecycleData'
import { milestoneVariance } from '../lib/milestones'
import { DEFAULT_STAGE_ORDER } from '../types'
import { TEMPLATE_SEEDS } from '../lib/templates'
import { DECISION_LABEL_FA, decisionToStatus, validateDecision, gateReadiness, type DecisionInput, type GateItemLite } from '../lib/gateModel'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

/** Governance events are written to plc_audit_log by the same call that makes the change. The
 * insert is fire-and-forget on purpose: a failed audit write must never roll back or block the
 * user's actual edit, but it is still surfaced through the shared error banner. */
async function writeAudit(entry: {
  projectId: string
  entityType: string
  entityId?: string | null
  event: string
  field?: string
  oldValue?: string
  newValue?: string
  reason?: string
}) {
  const { error } = await supabase.from('plc_audit_log').insert({
    project_id: entry.projectId,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    event: entry.event,
    field: entry.field ?? '',
    old_value: entry.oldValue ?? '',
    new_value: entry.newValue ?? '',
    reason: entry.reason ?? '',
  })
  if (error) reportError('ثبت سابقه تغییرات', error)
}

function stageMetaRow(s: { phaseGroup?: string; engine?: string; icon?: string; approvalDoc?: string; ownerRole?: string; standardDays?: number }) {
  return {
    phase_group: s.phaseGroup ?? 'execution', engine: s.engine ?? 'step', icon: s.icon ?? '',
    approval_doc: s.approvalDoc ?? '', owner_role: s.ownerRole ?? '', standard_days: s.standardDays ?? 0,
  }
}

/** Re-syncs an existing template's stage metadata and checklist rows with the current seed. */
async function refreshTemplate(templateId: string, seed: (typeof TEMPLATE_SEEDS)[number]) {
  const { data: rows } = await supabase.from('plc_template_stages').select('id, stage_key').eq('template_id', templateId)
  for (const stage of seed.stages) {
    const row = (rows ?? []).find((r) => r.stage_key === stage.stageKey)
    if (!row) continue
    await supabase.from('plc_template_stages').update({
      name_fa: stage.nameFa, name_en: stage.nameEn, gate_name: stage.gateName,
      gate_readiness_threshold: stage.gateReadinessThreshold, ...stageMetaRow(stage),
    }).eq('id', row.id)
    await supabase.from('plc_template_checklist_items').delete().eq('template_stage_id', row.id)
    if (stage.checklist.length > 0) {
      await supabase.from('plc_template_checklist_items').insert(
        stage.checklist.map((c, ci) => ({
          template_stage_id: row.id, category: c.category, title: c.title, is_mandatory: c.isMandatory,
          requires_document: !!c.requiresDocument, requires_approval: !!c.requiresApproval,
          guidance: c.guidance ?? '', sequence: ci, kind: c.kind ?? 'objective',
        })),
      )
    }
  }
}

/** Everything the engines need for one project, loaded in a single pass. */
export interface ProjectLifecycleBundle {
  lifecycle: ProjectLifecycle | null
  stages: ProjectStage[]
  gates: ProjectGate[]
  checklist: ChecklistItem[]
  milestones: Milestone[]
  forecastHistory: MilestoneForecastPoint[]
  activities: Activity[]
  health: HealthScore[]
  warnings: EarlyWarning[]
  actions: LifecycleAction[]
  decisions: GateDecision[]
  progressLog: ProgressLogEntry[]
}

const EMPTY_BUNDLE: ProjectLifecycleBundle = {
  lifecycle: null, stages: [], gates: [], checklist: [], milestones: [],
  forecastHistory: [], activities: [], health: [], warnings: [], actions: [],
  decisions: [], progressLog: [],
}

interface LifecycleState {
  templates: LifecycleTemplate[]
  /** Per-project lifecycle rows for every project — the portfolio/plan dashboards need all of
   * them at once, so they are fetched in bulk rather than project-by-project. */
  allLifecycles: ProjectLifecycle[]
  allMilestones: Milestone[]
  allGates: ProjectGate[]
  allChecklist: ChecklistItem[]
  allActions: LifecycleAction[]
  allHealth: HealthScore[]

  currentProjectId: string | null
  bundle: ProjectLifecycleBundle
  auditTrail: AuditEntry[]

  loadingPortfolio: boolean
  loadingProject: boolean
  saving: boolean

  fetchPortfolioWide: () => Promise<void>
  fetchTemplates: () => Promise<void>
  selectProject: (projectId: string | null) => Promise<void>
  fetchAuditTrail: (projectId: string) => Promise<void>

  seedTemplates: () => Promise<void>
  instantiateTemplate: (projectId: string, templateId: string) => Promise<void>

  updateChecklistItem: (item: ChecklistItem, patch: Partial<ChecklistItem>) => Promise<void>
  updateMilestone: (ms: Milestone, patch: Partial<Milestone>, reason?: string) => Promise<void>
  createMilestone: (projectId: string, data: Partial<Milestone> & { name: string }) => Promise<void>
  deleteMilestone: (id: string, projectId: string) => Promise<void>
  approveGate: (gate: ProjectGate, comments: string) => Promise<void>
  rejectGate: (gate: ProjectGate, comments: string) => Promise<void>
  overrideGate: (gate: ProjectGate, reason: string) => Promise<void>
  /** Pass / Conditional / Return / Cancel — validated by the gate model, logged immutably. */
  decideGate: (gate: ProjectGate, items: GateItemLite[], progress: number, input: DecisionInput) => Promise<string | null>
  logProgress: (gate: ProjectGate, series: ProgressSeries, pct: number, note: string) => Promise<void>
  advanceStage: (projectId: string, fromStageKey: string, toStageKey: string) => Promise<void>
  setHealthOverride: (projectId: string, status: HealthStatus | null, reason: string) => Promise<void>
  createAction: (projectId: string, data: Partial<LifecycleAction> & { title: string }) => Promise<void>
  updateAction: (action: LifecycleAction, patch: Partial<LifecycleAction>) => Promise<void>

  createActivity: (projectId: string, data: Partial<Activity> & { name: string }) => Promise<void>
  updateActivity: (activity: Activity, patch: Partial<Activity>, reason?: string) => Promise<void>
  deleteActivity: (id: string, projectId: string) => Promise<void>
  /** Copies forecast dates onto baseline for every activity that has none yet — the one-shot
   * "freeze the plan" moment a project takes once, usually right after Master Plan is first
   * populated. Rows that already carry a baseline are left untouched, so this is safe to run
   * more than once as new rows are added. */
  lockActivityBaselines: (projectId: string) => Promise<void>
}

export const useLifecycleStore = create<LifecycleState>()((set, get) => ({
  templates: [],
  allLifecycles: [],
  allMilestones: [],
  allGates: [],
  allChecklist: [],
  allActions: [],
  allHealth: [],
  currentProjectId: null,
  bundle: EMPTY_BUNDLE,
  auditTrail: [],
  loadingPortfolio: true,
  loadingProject: false,
  saving: false,

  fetchPortfolioWide: async () => {
    set({ loadingPortfolio: true })
    const [lc, ms, gt, cl, ac, hl] = await Promise.all([
      supabase.from('plc_project_lifecycle').select('*'),
      supabase.from('plc_milestones').select('*'),
      supabase.from('plc_project_gates').select('*'),
      supabase.from('plc_checklist_items').select('*'),
      supabase.from('rasta_actions').select('*'),
      supabase.from('plc_health_scores').select('*'),
    ])
    const firstError = lc.error ?? ms.error ?? gt.error ?? cl.error ?? ac.error ?? hl.error
    if (reportError('بارگذاری داده‌های چرخه عمر', firstError)) {
      set({ loadingPortfolio: false })
      return
    }
    set({
      allLifecycles: ((lc.data ?? []) as PlcLifecycleRow[]).map(lifecycleFromRow),
      allMilestones: ((ms.data ?? []) as PlcMilestoneRow[]).map(milestoneFromRow),
      allGates: ((gt.data ?? []) as PlcGateRow[]).map(gateFromRow),
      allChecklist: ((cl.data ?? []) as PlcChecklistRow[]).map(checklistFromRow),
      allActions: ((ac.data ?? []) as RastaActionRow[]).map(actionFromRow),
      allHealth: ((hl.data ?? []) as PlcHealthRow[]).map(healthFromRow),
      loadingPortfolio: false,
    })
  },

  fetchTemplates: async () => {
    const { data, error } = await supabase.from('plc_templates').select('*').eq('is_active', true).order('name')
    if (reportError('بارگذاری قالب‌های چرخه عمر', error)) return
    set({ templates: ((data ?? []) as PlcTemplateRow[]).map(templateFromRow) })
  },

  selectProject: async (projectId) => {
    if (!projectId) {
      set({ currentProjectId: null, bundle: EMPTY_BUNDLE, auditTrail: [] })
      return
    }
    set({ currentProjectId: projectId, loadingProject: true })

    const [lc, st, gt, cl, ms, act, hl, wn, ac, dc, pl] = await Promise.all([
      supabase.from('plc_project_lifecycle').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('plc_project_stages').select('*').eq('project_id', projectId).order('sequence'),
      supabase.from('plc_project_gates').select('*').eq('project_id', projectId),
      supabase.from('plc_checklist_items').select('*').eq('project_id', projectId).order('sequence'),
      supabase.from('plc_milestones').select('*').eq('project_id', projectId),
      supabase.from('plc_activities').select('*').eq('project_id', projectId).order('sequence'),
      supabase.from('plc_health_scores').select('*').eq('project_id', projectId),
      supabase.from('plc_early_warnings').select('*').eq('project_id', projectId).eq('status', 'open'),
      supabase.from('rasta_actions').select('*').eq('master_project_id', projectId),
      supabase.from('plc_gate_decisions').select('*').eq('project_id', projectId).order('decided_at', { ascending: false }),
      supabase.from('plc_progress_log').select('*').eq('project_id', projectId).order('recorded_at'),
    ])

    const milestones = ((ms.data ?? []) as PlcMilestoneRow[]).map(milestoneFromRow)
    // Forecast history is only needed for this project's milestones — fetched after the
    // milestone ids are known rather than pulling the whole table.
    let forecastHistory: MilestoneForecastPoint[] = []
    if (milestones.length > 0) {
      const { data: fh } = await supabase
        .from('plc_milestone_forecast_history')
        .select('*')
        .in('milestone_id', milestones.map((m) => m.id))
        .order('recorded_at')
      forecastHistory = ((fh ?? []) as PlcForecastHistoryRow[]).map(forecastPointFromRow)
    }

    set((s) =>
      s.currentProjectId !== projectId
        ? { loadingProject: false }
        : {
            loadingProject: false,
            bundle: {
              lifecycle: lc.data ? lifecycleFromRow(lc.data as PlcLifecycleRow) : null,
              stages: ((st.data ?? []) as PlcStageRow[]).map(stageFromRow),
              gates: ((gt.data ?? []) as PlcGateRow[]).map(gateFromRow),
              checklist: ((cl.data ?? []) as PlcChecklistRow[]).map(checklistFromRow),
              milestones,
              forecastHistory,
              activities: ((act.data ?? []) as PlcActivityRow[]).map(activityFromRow),
              health: ((hl.data ?? []) as PlcHealthRow[]).map(healthFromRow),
              warnings: ((wn.data ?? []) as PlcWarningRow[]).map(warningFromRow),
              actions: ((ac.data ?? []) as RastaActionRow[]).map(actionFromRow),
              decisions: ((dc.data ?? []) as PlcDecisionRow[]).map(decisionFromRow),
              progressLog: ((pl.data ?? []) as PlcProgressRow[]).map(progressFromRow),
            },
          },
    )
  },

  fetchAuditTrail: async (projectId) => {
    const { data, error } = await supabase
      .from('plc_audit_log').select('*').eq('project_id', projectId)
      .order('changed_at', { ascending: false }).limit(200)
    if (reportError('بارگذاری سابقه تغییرات', error)) return
    set({ auditTrail: ((data ?? []) as PlcAuditRow[]).map(auditFromRow) })
  },

  /** One-time creation of the built-in templates (admin action). Idempotent by name. */
  seedTemplates: async () => {
    set({ saving: true })
    for (const seed of TEMPLATE_SEEDS) {
      const { data: existing } = await supabase.from('plc_templates').select('id').eq('name', seed.name).maybeSingle()
      if (existing) {
        // The gate-model template is refreshed in place (metadata + objectives/outputs/criteria);
        // running projects keep their own copied rows, so nothing live is rewritten.
        if (seed.stages.some((s) => s.checklist.some((c) => c.kind))) await refreshTemplate(existing.id as string, seed)
        continue
      }

      const { data: tpl, error } = await supabase
        .from('plc_templates')
        .insert({ name: seed.name, description: seed.description, project_type: seed.projectType, is_default: seed.isDefault })
        .select('id').single()
      if (error || !tpl) {
        reportError('ایجاد قالب چرخه عمر', error)
        continue
      }

      for (const [i, stage] of seed.stages.entries()) {
        const { data: st } = await supabase
          .from('plc_template_stages')
          .insert({
            template_id: tpl.id, stage_key: stage.stageKey, name_fa: stage.nameFa, name_en: stage.nameEn,
            sequence: i, typical_duration_months: stage.typicalDurationMonths,
            gate_name: stage.gateName, gate_readiness_threshold: stage.gateReadinessThreshold,
            ...stageMetaRow(stage),
          })
          .select('id').single()
        if (!st) continue

        if (stage.checklist.length > 0) {
          await supabase.from('plc_template_checklist_items').insert(
            stage.checklist.map((c, ci) => ({
              template_stage_id: st.id, category: c.category, title: c.title,
              is_mandatory: c.isMandatory, requires_document: !!c.requiresDocument,
              requires_approval: !!c.requiresApproval, guidance: c.guidance ?? '', sequence: ci,
              kind: c.kind ?? 'objective',
            })),
          )
        }
      }
    }
    set({ saving: false })
    await get().fetchTemplates()
  },

  /** Copies a template's stages/gates/checklists onto a project. Copying (not referencing) is
   * what lets a template evolve without rewriting the governance record of a live project. */
  instantiateTemplate: async (projectId, templateId) => {
    set({ saving: true })

    const { data: stages } = await supabase
      .from('plc_template_stages').select('*').eq('template_id', templateId).order('sequence')
    const templateStages = ((stages ?? []) as { id: string; stage_key: string; name_fa: string; sequence: number; gate_name: string; gate_readiness_threshold: number; phase_group?: string; engine?: string; icon?: string; approval_doc?: string; owner_role?: string; standard_days?: number }[])

    for (const ts of templateStages) {
      await supabase.from('plc_project_stages').upsert({
        project_id: projectId, stage_key: ts.stage_key, name_fa: ts.name_fa, sequence: ts.sequence,
        standard_days: ts.standard_days ?? 0,
      }, { onConflict: 'project_id,stage_key' })

      if (ts.gate_name) {
        await supabase.from('plc_project_gates').upsert({
          project_id: projectId, stage_key: ts.stage_key, name: ts.gate_name,
          readiness_threshold: ts.gate_readiness_threshold,
          phase_group: ts.phase_group ?? 'execution', engine: ts.engine ?? 'step', icon: ts.icon ?? '',
          approval_doc: ts.approval_doc ?? '', owner_role: ts.owner_role ?? '',
        }, { onConflict: 'project_id,stage_key' })
      }

      const { data: items } = await supabase
        .from('plc_template_checklist_items').select('*').eq('template_stage_id', ts.id).order('sequence')
      const list = (items ?? []) as { category: string; title: string; is_mandatory: boolean; requires_document: boolean; requires_approval: boolean; guidance: string; sequence: number; kind?: string }[]
      if (list.length > 0) {
        await supabase.from('plc_checklist_items').insert(
          list.map((c) => ({
            project_id: projectId, stage_key: ts.stage_key, category: c.category, title: c.title,
            is_mandatory: c.is_mandatory, requires_document: c.requires_document,
            requires_approval: c.requires_approval, guidance: c.guidance, sequence: c.sequence,
            kind: c.kind ?? 'objective',
          })),
        )
      }
    }

    await supabase.from('plc_project_lifecycle').upsert({
      project_id: projectId, template_id: templateId,
      current_stage_key: templateStages[0]?.stage_key ?? 'idea',
      stage_entered_at: new Date().toISOString().slice(0, 10),
    }, { onConflict: 'project_id' })

    await writeAudit({ projectId, entityType: 'lifecycle', event: 'template_instantiated', newValue: templateId })
    set({ saving: false })
    await get().selectProject(projectId)
  },

  updateChecklistItem: async (item, patch) => {
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.responsibleId !== undefined) row.responsible_id = patch.responsibleId
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate
    if (patch.completionDate !== undefined) row.completion_date = patch.completionDate
    if (patch.evidenceUrl !== undefined) row.evidence_url = patch.evidenceUrl
    if (patch.evidenceLabel !== undefined) row.evidence_label = patch.evidenceLabel
    if (patch.comment !== undefined) row.comment = patch.comment
    if (patch.submittedBy !== undefined) row.submitted_by = patch.submittedBy
    if (patch.verifiedBy !== undefined) row.verified_by = patch.verifiedBy
    if (patch.verificationDate !== undefined) row.verification_date = patch.verificationDate

    const { error } = await supabase.from('plc_checklist_items').update(row).eq('id', item.id)
    if (reportError('به‌روزرسانی بند چک‌لیست', error)) return

    if (patch.status && patch.status !== item.status) {
      await writeAudit({
        projectId: item.projectId, entityType: 'checklist_item', entityId: item.id,
        event: 'status_change', field: item.title, oldValue: item.status, newValue: patch.status,
      })
    }
    set((s) => ({
      bundle: { ...s.bundle, checklist: s.bundle.checklist.map((c) => (c.id === item.id ? { ...c, ...patch } : c)) },
      allChecklist: s.allChecklist.map((c) => (c.id === item.id ? { ...c, ...patch } : c)),
    }))
  },

  updateMilestone: async (ms, patch, reason) => {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.baselineDate !== undefined) row.baseline_date = patch.baselineDate
    if (patch.forecastDate !== undefined) row.forecast_date = patch.forecastDate
    if (patch.actualDate !== undefined) row.actual_date = patch.actualDate
    if (patch.status !== undefined) row.status = patch.status
    if (patch.ownerId !== undefined) row.owner_id = patch.ownerId
    if (patch.isCritical !== undefined) row.is_critical = patch.isCritical
    if (patch.comments !== undefined) row.comments = patch.comments
    if (patch.evidenceUrl !== undefined) row.evidence_url = patch.evidenceUrl

    const { error } = await supabase.from('plc_milestones').update(row).eq('id', ms.id)
    if (reportError('به‌روزرسانی Milestone', error)) return

    // A moved forecast is appended to the history — this is what makes drift detectable later.
    if (patch.forecastDate !== undefined && patch.forecastDate !== ms.forecastDate) {
      const next = { ...ms, ...patch }
      await supabase.from('plc_milestone_forecast_history').insert({
        milestone_id: ms.id,
        forecast_date: patch.forecastDate,
        variance_days: milestoneVariance(next) ?? 0,
        note: reason ?? '',
      })
      await writeAudit({
        projectId: ms.projectId, entityType: 'milestone', entityId: ms.id,
        event: 'forecast_change', field: ms.name,
        oldValue: ms.forecastDate ?? '—', newValue: patch.forecastDate ?? '—', reason: reason ?? '',
      })
    }
    if (patch.baselineDate !== undefined && patch.baselineDate !== ms.baselineDate) {
      await writeAudit({
        projectId: ms.projectId, entityType: 'milestone', entityId: ms.id,
        event: 'baseline_change', field: ms.name,
        oldValue: ms.baselineDate ?? '—', newValue: patch.baselineDate ?? '—', reason: reason ?? '',
      })
    }

    set((s) => ({
      bundle: { ...s.bundle, milestones: s.bundle.milestones.map((m) => (m.id === ms.id ? { ...m, ...patch } : m)) },
      allMilestones: s.allMilestones.map((m) => (m.id === ms.id ? { ...m, ...patch } : m)),
    }))
    if (patch.forecastDate !== undefined) await get().selectProject(ms.projectId)
  },

  createMilestone: async (projectId, data) => {
    const { error } = await supabase.from('plc_milestones').insert({
      project_id: projectId,
      name: data.name,
      milestone_type: data.milestoneType ?? 'project',
      stage_key: data.stageKey ?? '',
      baseline_date: data.baselineDate ?? null,
      forecast_date: data.forecastDate ?? null,
      is_critical: data.isCritical ?? false,
      owner_id: data.ownerId ?? null,
    })
    if (reportError('ایجاد Milestone', error)) return
    await writeAudit({ projectId, entityType: 'milestone', event: 'created', newValue: data.name })
    await get().selectProject(projectId)
  },

  deleteMilestone: async (id, projectId) => {
    const { error } = await supabase.from('plc_milestones').delete().eq('id', id)
    if (reportError('حذف Milestone', error)) return
    await writeAudit({ projectId, entityType: 'milestone', entityId: id, event: 'deleted' })
    await get().selectProject(projectId)
  },

  approveGate: async (gate, comments) => {
    const { error } = await supabase.from('plc_project_gates').update({
      status: 'approved',
      approval_date: new Date().toISOString().slice(0, 10),
      approved_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      comments,
    }).eq('id', gate.id)
    if (reportError('تصویب گیت', error)) return
    await writeAudit({
      projectId: gate.projectId, entityType: 'gate', entityId: gate.id,
      event: 'gate_approved', field: gate.name, oldValue: gate.status, newValue: 'approved', reason: comments,
    })
    await get().selectProject(gate.projectId)
  },

  rejectGate: async (gate, comments) => {
    const { error } = await supabase.from('plc_project_gates')
      .update({ status: 'rejected', comments }).eq('id', gate.id)
    if (reportError('رد گیت', error)) return
    await writeAudit({
      projectId: gate.projectId, entityType: 'gate', entityId: gate.id,
      event: 'gate_rejected', field: gate.name, oldValue: gate.status, newValue: 'rejected', reason: comments,
    })
    await get().selectProject(gate.projectId)
  },

  /** Passing a gate whose mandatory requirements are unmet. Never silent: user, time and reason
   * are all recorded on the gate row and in the audit trail. */
  overrideGate: async (gate, reason) => {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null
    const { error } = await supabase.from('plc_project_gates').update({
      status: 'approved',
      override_by: userId,
      override_reason: reason,
      override_at: new Date().toISOString(),
      approval_date: new Date().toISOString().slice(0, 10),
      approved_by: userId,
    }).eq('id', gate.id)
    if (reportError('ثبت Override گیت', error)) return
    await writeAudit({
      projectId: gate.projectId, entityType: 'gate', entityId: gate.id,
      event: 'gate_override', field: gate.name, oldValue: gate.status, newValue: 'approved (override)', reason,
    })
    await get().selectProject(gate.projectId)
  },

  decideGate: async (gate, items, progress, input) => {
    const readiness = gateReadiness(items, progress, gate.readinessThreshold)
    const err = validateDecision(input, readiness)
    if (err) return err
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null
    const today = new Date().toISOString().slice(0, 10)
    const status = decisionToStatus(input.kind)
    const gateStatus = status === 'passed' ? 'approved' : status === 'conditional' ? 'conditional' : status === 'blocked' ? 'blocked' : 'in_progress'
    const { error: e1 } = await supabase.from('plc_gate_decisions').insert({
      project_id: gate.projectId, gate_id: gate.id, decision: input.kind, reason: input.reason ?? '',
      condition_text: input.conditionText ?? '', condition_owner_id: input.conditionOwnerId ?? null,
      condition_deadline: input.conditionDeadline ?? null,
    })
    if (reportError('ثبت تصمیم گیت', e1)) return 'ثبت تصمیم ناموفق بود'
    const patch: Record<string, unknown> = { status: gateStatus, comments: input.reason ?? gate.comments }
    if (gateStatus === 'approved' || gateStatus === 'conditional') { patch.approval_date = today; patch.approved_by = userId }
    if (gateStatus === 'conditional') {
      patch.condition_text = input.conditionText ?? ''
      patch.condition_owner_id = input.conditionOwnerId ?? null
      patch.condition_deadline = input.conditionDeadline ?? null
    }
    const { error: e2 } = await supabase.from('plc_project_gates').update(patch).eq('id', gate.id)
    if (reportError('به‌روزرسانی وضعیت گیت', e2)) return 'به‌روزرسانی گیت ناموفق بود'
    await writeAudit({
      projectId: gate.projectId, entityType: 'gate', entityId: gate.id, event: `gate_${input.kind}`,
      field: gate.name, oldValue: gate.status, newValue: gateStatus,
      reason: input.reason || input.conditionText || DECISION_LABEL_FA[input.kind],
    })
    await get().selectProject(gate.projectId)
    return null
  },

  logProgress: async (gate, series, pct, note) => {
    const { error } = await supabase.from('plc_progress_log').insert({
      project_id: gate.projectId, gate_id: gate.id, series, pct: Math.round(pct), note,
    })
    if (reportError('ثبت درصد پیشرفت', error)) return
    await writeAudit({
      projectId: gate.projectId, entityType: 'gate', entityId: gate.id, event: 'progress_logged',
      field: `${gate.name} / ${series}`, newValue: String(Math.round(pct)), reason: note,
    })
    await get().selectProject(gate.projectId)
  },

  advanceStage: async (projectId, fromStageKey, toStageKey) => {
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('plc_project_lifecycle').upsert({
      project_id: projectId, current_stage_key: toStageKey, stage_entered_at: today,
    }, { onConflict: 'project_id' })
    if (reportError('تغییر مرحله پروژه', error)) return

    await supabase.from('plc_project_stages')
      .update({ status: 'completed', actual_finish: today, progress: 100 })
      .eq('project_id', projectId).eq('stage_key', fromStageKey)
    await supabase.from('plc_project_stages')
      .update({ status: 'in_progress', actual_start: today })
      .eq('project_id', projectId).eq('stage_key', toStageKey)

    await writeAudit({
      projectId, entityType: 'lifecycle', event: 'stage_change',
      field: 'current_stage', oldValue: fromStageKey, newValue: toStageKey,
    })
    await get().selectProject(projectId)
    await get().fetchPortfolioWide()
  },

  setHealthOverride: async (projectId, status, reason) => {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null
    const { error } = await supabase.from('plc_project_lifecycle').upsert({
      project_id: projectId,
      current_stage_key: get().bundle.lifecycle?.currentStageKey ?? DEFAULT_STAGE_ORDER[0],
      health_override: status,
      health_override_reason: reason,
      health_override_by: status ? userId : null,
      health_override_at: status ? new Date().toISOString() : null,
    }, { onConflict: 'project_id' })
    if (reportError('ثبت وضعیت سلامت دستی', error)) return
    await writeAudit({
      projectId, entityType: 'lifecycle', event: 'health_override',
      field: 'overall_health', newValue: status ?? 'محاسبه خودکار', reason,
    })
    await get().selectProject(projectId)
    await get().fetchPortfolioWide()
  },

  createAction: async (projectId, data) => {
    const { error } = await supabase.from('rasta_actions').insert({
      master_project_id: projectId,
      title: data.title,
      owner_id: data.ownerId ?? null,
      due_date: data.dueDate ?? null,
      priority: data.priority ?? 'medium',
      source: data.source ?? 'lifecycle',
      related_milestone_id: data.relatedMilestoneId ?? null,
      related_gate_id: data.relatedGateId ?? null,
    })
    if (reportError('ایجاد اقدام', error)) return
    await writeAudit({ projectId, entityType: 'action', event: 'created', newValue: data.title })
    await get().selectProject(projectId)
  },

  updateAction: async (action, patch) => {
    const row: Record<string, unknown> = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.completionPct !== undefined) row.completion_pct = patch.completionPct
    if (patch.ownerId !== undefined) row.owner_id = patch.ownerId
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate
    if (patch.status === 'completed') row.closed_date = new Date().toISOString().slice(0, 10)

    const { error } = await supabase.from('rasta_actions').update(row).eq('id', action.id)
    if (reportError('به‌روزرسانی اقدام', error)) return
    if (patch.status && patch.status !== action.status) {
      await writeAudit({
        projectId: action.projectId, entityType: 'action', entityId: action.id,
        event: 'status_change', field: action.title, oldValue: action.status, newValue: patch.status,
      })
    }
    set((s) => ({
      bundle: { ...s.bundle, actions: s.bundle.actions.map((a) => (a.id === action.id ? { ...a, ...patch } : a)) },
      allActions: s.allActions.map((a) => (a.id === action.id ? { ...a, ...patch } : a)),
    }))
  },

  createActivity: async (projectId, data) => {
    const sequence = get().bundle.activities.length
    const { error } = await supabase.from('plc_activities').insert({
      project_id: projectId,
      wbs_code: data.wbsCode ?? '',
      name: data.name,
      stage_key: data.stageKey ?? '',
      baseline_start: data.baselineStart ?? null,
      baseline_finish: data.baselineFinish ?? null,
      forecast_start: data.forecastStart ?? null,
      forecast_finish: data.forecastFinish ?? null,
      owner_id: data.ownerId ?? null,
      is_critical: data.isCritical ?? false,
      depends_on_id: data.dependsOnId ?? null,
      sequence,
    })
    if (reportError('ایجاد ردیف برنامه زمانی', error)) return
    await writeAudit({ projectId, entityType: 'activity', event: 'created', newValue: data.name })
    await get().selectProject(projectId)
  },

  updateActivity: async (activity, patch, reason) => {
    const row: Record<string, unknown> = {}
    if (patch.name !== undefined) row.name = patch.name
    if (patch.wbsCode !== undefined) row.wbs_code = patch.wbsCode
    if (patch.stageKey !== undefined) row.stage_key = patch.stageKey
    if (patch.baselineStart !== undefined) row.baseline_start = patch.baselineStart
    if (patch.baselineFinish !== undefined) row.baseline_finish = patch.baselineFinish
    if (patch.forecastStart !== undefined) row.forecast_start = patch.forecastStart
    if (patch.forecastFinish !== undefined) row.forecast_finish = patch.forecastFinish
    if (patch.actualStart !== undefined) row.actual_start = patch.actualStart
    if (patch.actualFinish !== undefined) row.actual_finish = patch.actualFinish
    if (patch.progress !== undefined) row.progress = patch.progress
    if (patch.ownerId !== undefined) row.owner_id = patch.ownerId
    if (patch.isCritical !== undefined) row.is_critical = patch.isCritical
    if (patch.dependsOnId !== undefined) row.depends_on_id = patch.dependsOnId
    if (patch.status !== undefined) row.status = patch.status

    const { error } = await supabase.from('plc_activities').update(row).eq('id', activity.id)
    if (reportError('به‌روزرسانی ردیف برنامه زمانی', error)) return

    // A moved forecast is audited the same way a milestone's is — the reason travels with the
    // change rather than sitting only in the UI the user happened to be looking at.
    if (patch.forecastStart !== undefined || patch.forecastFinish !== undefined) {
      await writeAudit({
        projectId: activity.projectId, entityType: 'activity', entityId: activity.id,
        event: 'forecast_change', field: activity.name,
        oldValue: `${activity.forecastStart ?? '—'} → ${activity.forecastFinish ?? '—'}`,
        newValue: `${patch.forecastStart ?? activity.forecastStart ?? '—'} → ${patch.forecastFinish ?? activity.forecastFinish ?? '—'}`,
        reason: reason ?? '',
      })
    }
    if (patch.status && patch.status !== activity.status) {
      await writeAudit({
        projectId: activity.projectId, entityType: 'activity', entityId: activity.id,
        event: 'status_change', field: activity.name, oldValue: activity.status, newValue: patch.status,
      })
    }

    set((s) => ({
      bundle: { ...s.bundle, activities: s.bundle.activities.map((a) => (a.id === activity.id ? { ...a, ...patch } : a)) },
    }))
  },

  deleteActivity: async (id, projectId) => {
    const { error } = await supabase.from('plc_activities').delete().eq('id', id)
    if (reportError('حذف ردیف برنامه زمانی', error)) return
    await writeAudit({ projectId, entityType: 'activity', entityId: id, event: 'deleted' })
    set((s) => ({ bundle: { ...s.bundle, activities: s.bundle.activities.filter((a) => a.id !== id) } }))
  },

  lockActivityBaselines: async (projectId) => {
    const toLock = get().bundle.activities.filter(
      (a) => !a.baselineStart && !a.baselineFinish && (a.forecastStart || a.forecastFinish),
    )
    if (toLock.length === 0) return
    for (const a of toLock) {
      await supabase.from('plc_activities')
        .update({ baseline_start: a.forecastStart, baseline_finish: a.forecastFinish })
        .eq('id', a.id)
    }
    await writeAudit({ projectId, entityType: 'lifecycle', event: 'baseline_locked', newValue: `${toLock.length} ردیف` })
    await get().selectProject(projectId)
  },
}))
