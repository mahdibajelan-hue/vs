import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type {
  Activity, AuditEntry, ChecklistItem, EarlyWarning, HealthScore, HealthStatus, LifecycleAction,
  LifecycleTemplate, Milestone, MilestoneForecastPoint, ProjectGate, ProjectLifecycle, ProjectStage,
} from '../types'
import {
  actionFromRow, activityFromRow, auditFromRow, checklistFromRow, forecastPointFromRow,
  gateFromRow, healthFromRow, lifecycleFromRow, milestoneFromRow, stageFromRow, templateFromRow,
  warningFromRow,
  type PlcActivityRow, type PlcAuditRow, type PlcChecklistRow, type PlcForecastHistoryRow,
  type PlcGateRow, type PlcHealthRow, type PlcLifecycleRow, type PlcMilestoneRow, type PlcStageRow,
  type PlcTemplateRow, type PlcWarningRow, type RastaActionRow,
} from '../lib/lifecycleData'
import { milestoneVariance } from '../lib/milestones'
import { DEFAULT_STAGE_ORDER } from '../types'
import { TEMPLATE_SEEDS } from '../lib/templates'

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
}

const EMPTY_BUNDLE: ProjectLifecycleBundle = {
  lifecycle: null, stages: [], gates: [], checklist: [], milestones: [],
  forecastHistory: [], activities: [], health: [], warnings: [], actions: [],
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
  advanceStage: (projectId: string, fromStageKey: string, toStageKey: string) => Promise<void>
  setHealthOverride: (projectId: string, status: HealthStatus | null, reason: string) => Promise<void>
  createAction: (projectId: string, data: Partial<LifecycleAction> & { title: string }) => Promise<void>
  updateAction: (action: LifecycleAction, patch: Partial<LifecycleAction>) => Promise<void>
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

    const [lc, st, gt, cl, ms, act, hl, wn, ac] = await Promise.all([
      supabase.from('plc_project_lifecycle').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('plc_project_stages').select('*').eq('project_id', projectId).order('sequence'),
      supabase.from('plc_project_gates').select('*').eq('project_id', projectId),
      supabase.from('plc_checklist_items').select('*').eq('project_id', projectId).order('sequence'),
      supabase.from('plc_milestones').select('*').eq('project_id', projectId),
      supabase.from('plc_activities').select('*').eq('project_id', projectId).order('sequence'),
      supabase.from('plc_health_scores').select('*').eq('project_id', projectId),
      supabase.from('plc_early_warnings').select('*').eq('project_id', projectId).eq('status', 'open'),
      supabase.from('rasta_actions').select('*').eq('master_project_id', projectId),
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
      if (existing) continue

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
          })
          .select('id').single()
        if (!st) continue

        if (stage.checklist.length > 0) {
          await supabase.from('plc_template_checklist_items').insert(
            stage.checklist.map((c, ci) => ({
              template_stage_id: st.id, category: c.category, title: c.title,
              is_mandatory: c.isMandatory, requires_document: !!c.requiresDocument,
              requires_approval: !!c.requiresApproval, guidance: c.guidance ?? '', sequence: ci,
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
    const templateStages = ((stages ?? []) as { id: string; stage_key: string; name_fa: string; sequence: number; gate_name: string; gate_readiness_threshold: number }[])

    for (const ts of templateStages) {
      await supabase.from('plc_project_stages').upsert({
        project_id: projectId, stage_key: ts.stage_key, name_fa: ts.name_fa, sequence: ts.sequence,
      }, { onConflict: 'project_id,stage_key' })

      if (ts.gate_name) {
        await supabase.from('plc_project_gates').upsert({
          project_id: projectId, stage_key: ts.stage_key, name: ts.gate_name,
          readiness_threshold: ts.gate_readiness_threshold,
        }, { onConflict: 'project_id,stage_key' })
      }

      const { data: items } = await supabase
        .from('plc_template_checklist_items').select('*').eq('template_stage_id', ts.id).order('sequence')
      const list = (items ?? []) as { category: string; title: string; is_mandatory: boolean; requires_document: boolean; requires_approval: boolean; guidance: string; sequence: number }[]
      if (list.length > 0) {
        await supabase.from('plc_checklist_items').insert(
          list.map((c) => ({
            project_id: projectId, stage_key: ts.stage_key, category: c.category, title: c.title,
            is_mandatory: c.is_mandatory, requires_document: c.requires_document,
            requires_approval: c.requires_approval, guidance: c.guidance, sequence: c.sequence,
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
}))
