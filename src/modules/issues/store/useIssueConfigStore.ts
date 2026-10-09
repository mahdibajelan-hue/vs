import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import type { ImIssuePriority, ImStage } from '../types'
import { DEFAULT_SLA, type SlaPolicy } from '../lib/imSla'
import type { CategoryRule, WfTransition } from '../lib/imWorkflow'

export interface ImStageDef { key: ImStage; labelFa: string; sort: number; isTerminal: boolean; color: string; coarse: string }
export interface ImCategoryDef extends CategoryRule { labelFa: string; acceptanceHint: string; sort: number; active: boolean }

export interface ImTemplate { key: string; name: string; category: string | null; defaults: { severity?: ImIssuePriority; urgency?: ImIssuePriority; deadline_days?: number; acceptance_criteria?: string }; tasks: { title: string; offset_days: number }[] }

interface ConfigState {
  templates: ImTemplate[]
  loaded: boolean
  stages: ImStageDef[]
  transitions: WfTransition[]
  categories: ImCategoryDef[]
  sla: SlaPolicy[]
  fetch: () => Promise<void>
  saveSla: (p: SlaPolicy) => Promise<boolean>
  saveCategory: (key: string, patch: Partial<Pick<ImCategoryDef, 'requireEvidence' | 'requireRootCause' | 'active' | 'acceptanceHint' | 'labelFa'>>) => Promise<boolean>
}

export const useIssueConfigStore = create<ConfigState>()((set, get) => ({
  loaded: false, templates: [], stages: [], transitions: [], categories: [], sla: DEFAULT_SLA,

  fetch: async () => {
    const [st, tr, ct, sl, tp] = await Promise.all([
      supabase.from('im_workflow_stages').select('*').eq('workflow_key', 'standard').order('sort'),
      supabase.from('im_workflow_transitions').select('*').eq('workflow_key', 'standard'),
      supabase.from('im_categories').select('*').order('sort'),
      supabase.from('im_sla_policies').select('*'),
      supabase.from('im_templates').select('*').eq('is_active', true).order('name'),
    ])
    set({
      loaded: true,
      templates: ((tp.data ?? []) as Record<string, unknown>[]).map((r) => ({ key: r.key as string, name: r.name as string, category: (r.category as string) ?? null, defaults: (r.defaults as ImTemplate['defaults']) ?? {}, tasks: (r.tasks as ImTemplate['tasks']) ?? [] })),
      stages: ((st.data ?? []) as Record<string, unknown>[]).map((r) => ({ key: r.key as ImStage, labelFa: r.label_fa as string, sort: r.sort as number, isTerminal: !!r.is_terminal, color: (r.color as string) ?? '#888', coarse: r.coarse_status as string })),
      transitions: ((tr.data ?? []) as Record<string, unknown>[]).map((r) => ({ from: r.from_stage as string, to: r.to_stage as string, requiresReason: !!r.requires_reason, allowedRoles: (r.allowed_roles as string[]) ?? [] })),
      categories: ((ct.data ?? []) as Record<string, unknown>[]).map((r) => ({ key: r.key as string, labelFa: r.label_fa as string, requireEvidence: !!r.require_evidence, requireRootCause: !!r.require_root_cause, acceptanceHint: (r.acceptance_hint as string) ?? '', sort: (r.sort as number) ?? 0, active: r.is_active !== false })),
      sla: sl.data?.length ? (sl.data as Record<string, unknown>[]).map((r) => ({ severity: r.severity as ImIssuePriority, responseHours: r.respond_hours as number, resolveDays: r.resolve_days as number })) : DEFAULT_SLA,
    })
  },

  saveSla: async (p) => {
    const { error } = await supabase.from('im_sla_policies').update({ respond_hours: p.responseHours, resolve_days: p.resolveDays }).eq('severity', p.severity)
    if (error) return false
    set({ sla: get().sla.map((x) => (x.severity === p.severity ? p : x)) })
    return true
  },

  saveCategory: async (key, patch) => {
    const row: Record<string, unknown> = {}
    if (patch.requireEvidence !== undefined) row.require_evidence = patch.requireEvidence
    if (patch.requireRootCause !== undefined) row.require_root_cause = patch.requireRootCause
    if (patch.active !== undefined) row.is_active = patch.active
    if (patch.acceptanceHint !== undefined) row.acceptance_hint = patch.acceptanceHint
    if (patch.labelFa !== undefined) row.label_fa = patch.labelFa
    const { error } = await supabase.from('im_categories').update(row).eq('key', key)
    if (error) return false
    set({ categories: get().categories.map((c) => (c.key === key ? { ...c, ...patch } : c)) })
    return true
  },
}))
