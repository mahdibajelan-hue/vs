import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type { ImIssue, ImIssuePriority, ImIssueStatus, ImProject } from '../types'
import { imIssueFromRow, imIssueToRow, imProjectFromRow, type ImIssueRow, type ImProjectRow } from '../lib/issueData'
import { todayIso } from '../lib/issueRing'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${error.message}`)
  return true
}

interface IssuesState {
  projects: ImProject[]
  issues: ImIssue[]
  loading: boolean

  fetchAll: () => Promise<void>
  createProject: (name: string, description: string) => Promise<string>
  deleteProject: (projectId: string) => Promise<void>
  createIssue: (
    projectId: string,
    data: { title: string; description: string; pursuerId: string | null; approverId: string | null; priority: ImIssuePriority; deadlineDays: number },
  ) => Promise<void>
  setIssueStatus: (issueId: string, status: ImIssueStatus) => Promise<void>
  setActionDate: (issueId: string, iso: string) => Promise<void>
  deleteIssue: (issueId: string) => Promise<void>
}

export const useIssuesStore = create<IssuesState>()((set, get) => ({
  projects: [],
  issues: [],
  loading: true,

  fetchAll: async () => {
    set({ loading: true })
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

  createProject: async (name, description) => {
    const { data, error } = await supabase.rpc('create_im_project_with_admin', { p_name: name, p_description: description })
    if (error || !data) {
      reportError('ایجاد پروژه', error ?? { message: 'خطای نامشخص' })
      throw new Error(error?.message ?? 'خطا در ایجاد پروژه')
    }
    await get().fetchAll()
    return data.id as string
  },

  deleteProject: async (projectId) => {
    const { error } = await supabase.from('im_projects').delete().eq('id', projectId)
    if (reportError('حذف پروژه', error)) return
    set((s) => ({ projects: s.projects.filter((p) => p.id !== projectId), issues: s.issues.filter((i) => i.projectId !== projectId) }))
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

  deleteIssue: async (issueId) => {
    const { error } = await supabase.from('im_issues').delete().eq('id', issueId)
    if (reportError('حذف مشکل', error)) return
    set((s) => ({ issues: s.issues.filter((i) => i.id !== issueId) }))
  },
}))
