import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type { ImLesson } from '../lib/imKnowledge'

const row = (r: Record<string, unknown>): ImLesson => ({ id: r.id as string, sourceIssueId: (r.source_issue_id as string) ?? null, projectId: (r.project_id as string) ?? null, title: r.title as string, context: (r.context as string) ?? '', rootCause: (r.root_cause as string) ?? '', solution: (r.solution as string) ?? '', prevention: (r.prevention as string) ?? '', category: (r.category as string) ?? null, tags: (r.tags as string[]) ?? [], status: r.status as ImLesson['status'], createdBy: (r.created_by as string) ?? null, createdAt: r.created_at as string })

interface KState {
  lessons: ImLesson[]
  loaded: boolean
  fetchAll: () => Promise<void>
  saveDraft: (l: Omit<ImLesson, 'id' | 'createdBy' | 'createdAt'> & { id?: string }) => Promise<{ ok: boolean; error?: string }>
  setStatus: (id: string, status: ImLesson['status']) => Promise<{ ok: boolean; error?: string }>
}

export const useKnowledgeStore = create<KState>()((set, get) => ({
  lessons: [], loaded: false,
  fetchAll: async () => {
    const { data } = await supabase.from('im_lessons').select('*').order('created_at', { ascending: false }).limit(500)
    set({ lessons: ((data ?? []) as Record<string, unknown>[]).map(row), loaded: true })
  },
  saveDraft: async (l) => {
    const payload = { source_issue_id: l.sourceIssueId, project_id: l.projectId, title: l.title, context: l.context, root_cause: l.rootCause, solution: l.solution, prevention: l.prevention, category: l.category, tags: l.tags, status: 'draft', created_by: useAuthStore.getState().profile?.id }
    const q = l.id ? supabase.from('im_lessons').update({ ...payload, created_by: undefined }).eq('id', l.id) : supabase.from('im_lessons').insert(payload)
    const { error } = await q
    if (error) { const m = error.message.includes('duplicate') ? 'برای این مسئله قبلاً درس‌آموخته ثبت شده است' : error.message; useSystemStore.getState().setStorageError(`خطا در ثبت درس‌آموخته: ${m}`); return { ok: false, error: m } }
    await get().fetchAll()
    return { ok: true }
  },
  setStatus: async (id, status) => {
    const { error } = await supabase.from('im_lessons').update({ status }).eq('id', id)
    if (error) { const m = error.message.includes('only_manager') ? 'فقط مدیر پروژه یا مدیر سیستم می‌تواند منتشر کند' : error.message; useSystemStore.getState().setStorageError(`خطا: ${m}`); return { ok: false, error: m } }
    await get().fetchAll()
    return { ok: true }
  },
}))
