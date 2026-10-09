import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type { ImIssue, ImIssuePriority, ImIssueStatus, ImProject } from '../types'
import { imIssueFromRow, imIssueToRow, imProjectFromRow, type ImIssueRow, type ImProjectRow } from '../lib/issueData'
import { todayIso } from '../lib/issueRing'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

interface IssuesState {
  projects: ImProject[]
  issues: ImIssue[]
  loading: boolean
  /** Header project picker: 'all' or an im_projects id. Pages read it through useScoped(). */
  scopeProjectId: string
  setScope: (id: string) => void

  fetchAll: () => Promise<void>
  createIssue: (
    projectId: string,
    data: { title: string; description: string; pursuerId: string | null; approverId: string | null; priority: ImIssuePriority; deadlineDays: number },
  ) => Promise<void>
  updateIssue: (
    issueId: string,
    data: { title: string; description: string; priority: ImIssuePriority; pursuerId: string | null; approverId: string | null },
  ) => Promise<void>
  setIssueStatus: (issueId: string, status: ImIssueStatus) => Promise<void>
  setActionDate: (issueId: string, iso: string) => Promise<void>
  deleteIssue: (issueId: string) => Promise<void>
  /** Re-read one row after a server-side transition (stage, due dates, counters change in triggers). */
  refreshIssue: (issueId: string) => Promise<void>
  createIssueV2: (projectId: string, data: NewIssueV2) => Promise<{ id?: string; error?: string }>
  /** Whitelisted column patch (snake_case). Due dates are NOT patchable here — they move only through approved extensions. */
  patchIssue: (issueId: string, row: Record<string, unknown>, action?: string) => Promise<boolean>
}

export interface NewIssueV2 {
  title: string; description: string; pursuerId: string | null; approverId: string | null; ownerId?: string | null; followUpId?: string | null
  severity: ImIssuePriority; urgency: ImIssuePriority; category: string | null; discipline?: string; location?: string; deadlineDays: number
  acceptanceCriteria?: string; impacts?: { timeDays?: number; cost?: number; quality?: number; safety?: number; contract?: number; objectives?: string }; identifiedAt?: string | null
}

export const useIssuesStore = create<IssuesState>()((set, get) => ({
  projects: [],
  issues: [],
  loading: true,
  scopeProjectId: 'all',
  setScope: (id) => set({ scopeProjectId: id }),

  fetchAll: async () => {
    set({ loading: true })
    // Projects are owned by Master Data: platform admins keep the issue projects in step with it (names, new projects).
    if (useAuthStore.getState().profile?.isAdmin) await supabase.rpc('im_sync_master_projects')
    const { data: projectRows, error: projectError } = await supabase.from('im_projects').select('*').order('created_at', { ascending: false })
    if (reportError('بارگذاری پروژه‌ها', projectError)) {
      set({ loading: false })
      return
    }
    const projects = ((projectRows ?? []) as ImProjectRow[]).map(imProjectFromRow)
    const projectIds = projects.map((p) => p.id)
    if (projectIds.length === 0) {
      set({ projects, issues: [], loading: false })
      return
    }
    const { data: issueRows, error: issueError } = await supabase.from('im_issues').select('*').in('project_id', projectIds).order('created_at', { ascending: false })
    if (reportError('بارگذاری مشکلات', issueError)) {
      set({ projects, loading: false })
      return
    }
    set({ projects, issues: ((issueRows ?? []) as ImIssueRow[]).map(imIssueFromRow), loading: false })
  },

  createIssue: async (projectId, data) => {
    const createdAt = new Date().toISOString()
    const row = {
      ...imIssueToRow(projectId, {
        title: data.title,
        description: data.description,
        pursuerId: data.pursuerId,
        approverId: data.approverId,
        priority: data.priority,
        deadlineDays: data.deadlineDays,
      }),
      created_by: useAuthStore.getState().profile?.id ?? null,
      created_at: createdAt,
    }
    const { data: inserted, error } = await supabase.from('im_issues').insert(row).select().single()
    if (reportError('ثبت مشکل', error) || !inserted) return
    set((s) => ({ issues: [imIssueFromRow(inserted as ImIssueRow), ...s.issues] }))
  },

  // Previously title/description/priority/assignment were write-once at creation — an issue
  // could not be corrected afterward. rowless fields (project, dates) are left untouched here.
  updateIssue: async (issueId, data) => {
    const row = imIssueToRow('', {
      title: data.title,
      description: data.description,
      priority: data.priority,
      pursuerId: data.pursuerId,
      approverId: data.approverId,
    })
    delete row.project_id
    const { error } = await supabase.from('im_issues').update({ ...row, updated_at: new Date().toISOString() }).eq('id', issueId)
    if (reportError('ویرایش مشکل', error)) return
    set((s) => ({ issues: s.issues.map((i) => (i.id === issueId ? { ...i, ...data } : i)) }))
  },

  setIssueStatus: async (issueId, status) => {
    const closedAt = status === 'approved' ? todayIso() : null
    const { error } = await supabase.from('im_issues').update({ status, closed_at: closedAt, updated_at: new Date().toISOString() }).eq('id', issueId)
    if (reportError('به‌روزرسانی وضعیت', error)) return
    set((s) => ({ issues: s.issues.map((i) => (i.id === issueId ? { ...i, status, closedAt } : i)) }))
  },

  setActionDate: async (issueId, iso) => {
    const { error } = await supabase.from('im_issues').update({ action_date: iso, updated_at: new Date().toISOString() }).eq('id', issueId)
    if (reportError('ثبت تاریخ اقدام', error)) return
    set((s) => ({ issues: s.issues.map((i) => (i.id === issueId ? { ...i, actionDate: iso } : i)) }))
  },

  patchIssue: async (issueId, row, action = 'ویرایش مشکل') => {
    const allowed = ['title', 'description', 'priority', 'severity', 'urgency', 'category', 'discipline', 'location', 'pursuer_id', 'approver_id', 'owner_id', 'follow_up_id', 'acceptance_criteria', 'resolution_summary', 'tags', 'identified_at', 'corporate_issue_id']
    const clean = Object.fromEntries(Object.entries(row).filter(([k]) => allowed.includes(k)))
    const { error } = await supabase.from('im_issues').update(clean).eq('id', issueId)
    if (reportError(action, error)) return false
    await get().refreshIssue(issueId)
    return true
  },

  refreshIssue: async (issueId) => {
    const { data } = await supabase.from('im_issues').select('*').eq('id', issueId).maybeSingle()
    if (!data) return
    const next = imIssueFromRow(data as ImIssueRow)
    set((s) => ({ issues: s.issues.some((i) => i.id === issueId) ? s.issues.map((i) => (i.id === issueId ? next : i)) : [next, ...s.issues] }))
  },

  createIssueV2: async (projectId, d) => {
    const imp = d.impacts ?? {}
    const row: Record<string, unknown> = {
      project_id: projectId, title: d.title, description: d.description, pursuer_id: d.pursuerId, approver_id: d.approverId,
      owner_id: d.ownerId ?? useAuthStore.getState().profile?.id ?? null, follow_up_id: d.followUpId ?? null,
      priority: d.severity, severity: d.severity, urgency: d.urgency, category: d.category, discipline: d.discipline ?? '', location: d.location ?? '',
      deadline_days: d.deadlineDays, acceptance_criteria: d.acceptanceCriteria ?? '',
      impact_time_days: imp.timeDays ?? null, impact_cost: imp.cost ?? null, impact_quality: imp.quality ?? 0, impact_safety: imp.safety ?? 0, impact_contract: imp.contract ?? 0, impact_objectives: imp.objectives ?? '',
      created_by: useAuthStore.getState().profile?.id ?? null,
    }
    if (d.identifiedAt) row.identified_at = d.identifiedAt // omitted = database default (now)
    const { data, error } = await supabase.from('im_issues').insert(row).select().single()
    if (error || !data) {
      const raw = error?.message ?? 'خطای نامشخص'
      const error2 = /row-level security|permission/i.test(raw) ? 'دسترسی ثبت مسئله در این پروژه را ندارید' : /null value in column "?(\w+)"?/.test(raw) ? `فیلد «${raw.match(/column "?(\w+)"?/)?.[1]}» خالی است` : friendlyErrorMessage({ message: raw })
      return { error: error2 }
    }
    const created = imIssueFromRow(data as ImIssueRow)
    set((s) => ({ issues: [created, ...s.issues] }))
    return { id: created.id }
  },

  deleteIssue: async (issueId) => {
    const { error } = await supabase.from('im_issues').delete().eq('id', issueId)
    if (reportError('حذف مشکل', error)) return
    set((s) => ({ issues: s.issues.filter((i) => i.id !== issueId) }))
  },
}))
