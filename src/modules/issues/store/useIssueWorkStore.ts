import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type { ImExtension, ImStage, ImTask, ImTaskStatus } from '../types'
import {
  imEventFromRow, imExtensionFromRow, imTaskFromRow,
  type ImAttachment, type ImCapa, type ImEvent, type ImEventRow, type ImExtensionRow, type ImLink, type ImRca, type ImTaskRow,
} from '../lib/issueDataV2'
import { useIssuesStore } from './useIssuesStore'

/** Tasks / extensions / audit trail / RCA / CAPA / links / evidence for the v2 issue model. All writes go through
 * RLS + guard triggers (or the im_* RPCs) — the client never decides alone what is allowed. */

export interface WorkResult<T = void> { ok: boolean; error?: string; data?: T }

/** Server guard messages are machine keys; show a readable Persian explanation. */
export function explainServerError(message: string): string {
  const map: [RegExp, string][] = [
    [/cannot_close: (.*)/, 'بستن ممکن نیست: $1'],
    [/transition_not_allowed: (\S+) -> (\S+)/, 'انتقال $1 به $2 در گردش‌کار مجاز نیست'],
    [/transition_role_denied/, 'نقش شما اجازهٔ این انتقال را ندارد'],
    [/reason_required/, 'ثبت دلیل الزامی است'],
    [/only_approver_or_admin_may_decide/, 'فقط مسئول تأیید یا مدیر می‌تواند دربارهٔ تمدید تصمیم بگیرد'],
    [/cannot_decide_own_request/, 'تصمیم دربارهٔ درخواست خودتان مجاز نیست'],
    [/new_date_must_be_later/, 'تاریخ جدید باید بعد از سررسید فعلی باشد'],
    [/dependency_cycle/, 'وابستگی حلقوی بین اقدامات مجاز نیست'],
    [/due_date_change_requires_extension/, 'تغییر سررسید فقط از مسیر «درخواست تمدید» ممکن است'],
    [/self_verification_not_allowed/, 'مجری نمی‌تواند اقدام خودش را تأیید کند'],
    [/blocked_reason_required/, 'برای مسدود کردن، دلیل انسداد را مشخص کنید'],
    [/not_authorized|permission denied|row-level security/i, 'دسترسی لازم برای این عملیات را ندارید'],
  ]
  for (const [re, fa] of map) { const m = message.match(re); if (m) return fa.replace(/\$(\d)/g, (_, n) => m[Number(n)] ?? '') }
  return friendlyErrorMessage({ message })
}

function fail(action: string, error: { message: string }): WorkResult<never> {
  const msg = explainServerError(error.message)
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${msg}`)
  return { ok: false, error: msg }
}

interface WorkState {
  tasks: ImTask[]
  extensions: ImExtension[]
  loadingAll: boolean
  eventsByIssue: Record<string, ImEvent[]>
  linksByIssue: Record<string, ImLink[]>
  attachmentsByIssue: Record<string, ImAttachment[]>
  rcaByIssue: Record<string, ImRca | null>
  capaByIssue: Record<string, ImCapa[]>
  depsByTask: Record<string, string[]>

  fetchAll: () => Promise<void>
  fetchIssueDetail: (issueId: string) => Promise<void>

  transition: (issueId: string, to: ImStage, reason: string, patch?: Record<string, unknown>) => Promise<WorkResult>
  addTask: (issueId: string, t: { title: string; executorId: string | null; approverId: string | null; dueDate: string | null; startDate?: string | null }) => Promise<WorkResult>
  setTaskStatus: (taskId: string, status: ImTaskStatus, extra?: { blockedKind?: string; blockedNote?: string }) => Promise<WorkResult>
  setTaskProgress: (taskId: string, progress: number) => Promise<WorkResult>
  verifyTask: (taskId: string, accept: boolean) => Promise<WorkResult>
  setTaskDeps: (taskId: string, dependsOn: string[]) => Promise<WorkResult>
  requestExtension: (issueId: string, taskId: string | null, to: string, reason: string, impact?: string) => Promise<WorkResult>
  decideExtension: (extId: string, approve: boolean, note: string) => Promise<WorkResult>

  saveRca: (issueId: string, rca: { method: ImRca['method']; data: Record<string, unknown>; rootCause: string; confirmed: boolean }) => Promise<WorkResult>
  addCapa: (issueId: string, c: { kind: ImCapa['kind']; description: string; ownerId: string | null; dueDate: string | null }) => Promise<WorkResult>
  setCapaStatus: (capaId: string, status: string, effectiveness?: string | null, note?: string) => Promise<WorkResult>
  addLink: (issueId: string, l: { targetType: string; targetId: string; targetLabel: string; relation: string }) => Promise<WorkResult>
  removeLink: (issueId: string, linkId: string) => Promise<WorkResult>
  uploadEvidence: (issueId: string, file: File, kind: 'resolution_evidence' | 'attachment', taskId?: string | null) => Promise<WorkResult>
  evidenceUrl: (a: ImAttachment) => Promise<string | null>
}

const uid = () => useAuthStore.getState().profile?.id ?? null

async function refreshIssue(issueId: string) {
  await useIssuesStore.getState().refreshIssue(issueId)
}

export const useIssueWorkStore = create<WorkState>()((set, get) => ({
  tasks: [], extensions: [], loadingAll: false,
  eventsByIssue: {}, linksByIssue: {}, attachmentsByIssue: {}, rcaByIssue: {}, capaByIssue: {}, depsByTask: {},

  fetchAll: async () => {
    set({ loadingAll: true })
    const ids = useIssuesStore.getState().issues.map((i) => i.id)
    if (!ids.length) { set({ tasks: [], extensions: [], loadingAll: false }); return }
    // chunk the IN() list to keep URLs short
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150))
    const tasks: ImTask[] = []
    const exts: ImExtension[] = []
    for (const ch of chunks) {
      const [t, e] = await Promise.all([
        supabase.from('im_issue_tasks').select('*').in('issue_id', ch),
        supabase.from('im_extensions').select('*').in('issue_id', ch),
      ])
      if (t.error) { fail('بارگذاری اقدامات', t.error); break }
      tasks.push(...((t.data ?? []) as ImTaskRow[]).map(imTaskFromRow))
      exts.push(...((e.data ?? []) as ImExtensionRow[]).map(imExtensionFromRow))
    }
    set({ tasks, extensions: exts, loadingAll: false })
  },

  fetchIssueDetail: async (issueId) => {
    const [ev, ln, at, rc, cp] = await Promise.all([
      supabase.from('im_issue_events').select('*').eq('issue_id', issueId).order('at', { ascending: false }).limit(300),
      supabase.from('im_issue_links').select('*').eq('issue_id', issueId),
      supabase.from('im_attachments').select('*').eq('issue_id', issueId).order('uploaded_at', { ascending: false }),
      supabase.from('im_rca').select('*').eq('issue_id', issueId).maybeSingle(),
      supabase.from('im_capa').select('*').eq('issue_id', issueId).order('created_at'),
    ])
    const taskIds = get().tasks.filter((t) => t.issueId === issueId).map((t) => t.id)
    const deps = taskIds.length ? await supabase.from('im_task_deps').select('*').in('task_id', taskIds) : { data: [] as { task_id: string; depends_on_task_id: string }[] }
    const depsByTask: Record<string, string[]> = { ...get().depsByTask }
    for (const id of taskIds) depsByTask[id] = []
    for (const d of (deps.data ?? []) as { task_id: string; depends_on_task_id: string }[]) (depsByTask[d.task_id] ??= []).push(d.depends_on_task_id)
    set((s) => ({
      depsByTask,
      eventsByIssue: { ...s.eventsByIssue, [issueId]: ((ev.data ?? []) as ImEventRow[]).map(imEventFromRow) },
      linksByIssue: { ...s.linksByIssue, [issueId]: ((ln.data ?? []) as Record<string, string>[]).map((r) => ({ id: r.id, issueId: r.issue_id, targetType: r.target_type, targetId: r.target_id, targetLabel: r.target_label, relation: r.relation })) },
      attachmentsByIssue: { ...s.attachmentsByIssue, [issueId]: ((at.data ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, issueId: r.issue_id as string, taskId: (r.task_id as string) ?? null, kind: r.kind as string, storagePath: r.storage_path as string, fileName: r.file_name as string, mime: r.mime as string, sizeBytes: Number(r.size_bytes), note: (r.note as string) ?? '', uploadedAt: r.uploaded_at as string })) },
      rcaByIssue: { ...s.rcaByIssue, [issueId]: rc.data ? { id: rc.data.id, issueId, method: rc.data.method, data: rc.data.data ?? {}, rootCause: rc.data.root_cause ?? '', confirmed: !!rc.data.confirmed } : null },
      capaByIssue: { ...s.capaByIssue, [issueId]: ((cp.data ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, issueId, kind: r.kind as ImCapa['kind'], description: r.description as string, ownerId: (r.owner_id as string) ?? null, dueDate: (r.due_date as string) ?? null, status: r.status as string, effectiveness: (r.effectiveness as string) ?? null, effectivenessNote: (r.effectiveness_note as string) ?? '' })) },
    }))
  },

  transition: async (issueId, to, reason, patch = {}) => {
    const { error } = await supabase.rpc('im_transition', { p_issue: issueId, p_to: to, p_reason: reason, p_patch: patch })
    if (error) return fail('تغییر مرحله', error)
    await refreshIssue(issueId)
    await get().fetchIssueDetail(issueId)
    return { ok: true }
  },

  addTask: async (issueId, t) => {
    const { data, error } = await supabase.from('im_issue_tasks').insert({
      issue_id: issueId, title: t.title, executor_id: t.executorId, approver_id: t.approverId, due_date: t.dueDate, start_date: t.startDate ?? null, created_by: uid(),
    }).select().single()
    if (error) return fail('ثبت اقدام', error)
    set((s) => ({ tasks: [...s.tasks, imTaskFromRow(data as ImTaskRow)] }))
    return { ok: true }
  },

  setTaskStatus: async (taskId, status, extra) => {
    const patch: Record<string, unknown> = { status }
    if (status === 'blocked') { patch.blocked_kind = extra?.blockedKind ?? ''; patch.blocked_note = extra?.blockedNote ?? '' }
    if (status === 'pending_verification') { patch.completion_claimed_at = new Date().toISOString(); patch.completion_claimed_by = uid() }
    const { data, error } = await supabase.from('im_issue_tasks').update(patch).eq('id', taskId).select().single()
    if (error) return fail('تغییر وضعیت اقدام', error)
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? imTaskFromRow(data as ImTaskRow) : t)) }))
    return { ok: true }
  },

  setTaskProgress: async (taskId, progress) => {
    const { data, error } = await supabase.from('im_issue_tasks').update({ progress: Math.max(0, Math.min(100, Math.round(progress))), last_progress_at: new Date().toISOString() }).eq('id', taskId).select().single()
    if (error) return fail('ثبت پیشرفت', error)
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? imTaskFromRow(data as ImTaskRow) : t)) }))
    return { ok: true }
  },

  // Independent verification: only the verifier flips pending_verification → done (or back to in_progress with a reason in the audit log).
  verifyTask: async (taskId, accept) => {
    const patch = accept ? { status: 'done', verified_by: uid(), verified_at: new Date().toISOString() } : { status: 'in_progress', completion_claimed_at: null }
    const { data, error } = await supabase.from('im_issue_tasks').update(patch).eq('id', taskId).select().single()
    if (error) return fail('تأیید اقدام', error)
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? imTaskFromRow(data as ImTaskRow) : t)) }))
    return { ok: true }
  },

  setTaskDeps: async (taskId, dependsOn) => {
    const del = await supabase.from('im_task_deps').delete().eq('task_id', taskId)
    if (del.error) return fail('ثبت وابستگی', del.error)
    if (dependsOn.length) {
      const { error } = await supabase.from('im_task_deps').insert(dependsOn.map((d) => ({ task_id: taskId, depends_on_task_id: d })))
      if (error) { await supabase.from('im_task_deps').insert(get().depsByTask[taskId]?.map((d) => ({ task_id: taskId, depends_on_task_id: d })) ?? []); return fail('ثبت وابستگی', error) }
    }
    set((s) => ({ depsByTask: { ...s.depsByTask, [taskId]: dependsOn } }))
    return { ok: true }
  },

  requestExtension: async (issueId, taskId, to, reason, impact = '') => {
    const { error } = await supabase.rpc('im_request_extension', { p_issue: issueId, p_task: taskId, p_to: to, p_reason: reason, p_impact: impact })
    if (error) return fail('درخواست تمدید', error)
    await get().fetchAll()
    await get().fetchIssueDetail(issueId)
    return { ok: true }
  },

  decideExtension: async (extId, approve, note) => {
    const issueId = get().extensions.find((e) => e.id === extId)?.issueId
    const { error } = await supabase.rpc('im_decide_extension', { p_ext: extId, p_approve: approve, p_note: note })
    if (error) return fail('تصمیم دربارهٔ تمدید', error)
    await get().fetchAll()
    if (issueId) { await refreshIssue(issueId); await get().fetchIssueDetail(issueId) }
    return { ok: true }
  },

  saveRca: async (issueId, r) => {
    const row = { issue_id: issueId, method: r.method, data: r.data, root_cause: r.rootCause, confirmed: r.confirmed, confirmed_by: r.confirmed ? uid() : null, confirmed_at: r.confirmed ? new Date().toISOString() : null, created_by: uid() }
    const { error } = await supabase.from('im_rca').upsert(row, { onConflict: 'issue_id' })
    if (error) return fail('ثبت تحلیل علت', error)
    // keep the issue-level mirror in sync (summary + confirmation drive the closing check)
    await supabase.from('im_issues').update({ root_cause_summary: r.rootCause, root_cause_confirmed: r.confirmed }).eq('id', issueId)
    await refreshIssue(issueId)
    await get().fetchIssueDetail(issueId)
    return { ok: true }
  },

  addCapa: async (issueId, c) => {
    const { error } = await supabase.from('im_capa').insert({ issue_id: issueId, kind: c.kind, description: c.description, owner_id: c.ownerId, due_date: c.dueDate, created_by: uid() })
    if (error) return fail('ثبت اقدام اصلاحی/پیشگیرانه', error)
    await get().fetchIssueDetail(issueId)
    return { ok: true }
  },

  setCapaStatus: async (capaId, status, effectiveness = null, note = '') => {
    const { error } = await supabase.from('im_capa').update({ status, effectiveness, effectiveness_note: note }).eq('id', capaId)
    if (error) return fail('به‌روزرسانی CAPA', error)
    const issueId = Object.entries(get().capaByIssue).find(([, l]) => l.some((c) => c.id === capaId))?.[0]
    if (issueId) await get().fetchIssueDetail(issueId)
    return { ok: true }
  },

  addLink: async (issueId, l) => {
    const { error } = await supabase.from('im_issue_links').insert({ issue_id: issueId, target_type: l.targetType, target_id: l.targetId, target_label: l.targetLabel, relation: l.relation, created_by: uid() })
    if (error) return fail('ثبت پیوند', error)
    await get().fetchIssueDetail(issueId)
    return { ok: true }
  },

  removeLink: async (issueId, linkId) => {
    const { error } = await supabase.from('im_issue_links').delete().eq('id', linkId)
    if (error) return fail('حذف پیوند', error)
    await get().fetchIssueDetail(issueId)
    return { ok: true }
  },

  uploadEvidence: async (issueId, file, kind, taskId = null) => {
    if (file.size > 20 * 1024 * 1024) return fail('بارگذاری', { message: 'حجم فایل بیش از ۲۰ مگابایت است' })
    const safe = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-80)
    const path = `${issueId}/${crypto.randomUUID()}-${safe}`
    const up = await supabase.storage.from('issue-evidence').upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (up.error) return fail('بارگذاری فایل', up.error)
    const { error } = await supabase.from('im_attachments').insert({ issue_id: issueId, task_id: taskId, kind, storage_path: path, file_name: file.name, mime: file.type || '', size_bytes: file.size, uploaded_by: uid() })
    if (error) { await supabase.storage.from('issue-evidence').remove([path]); return fail('ثبت پیوست', error) }
    await get().fetchIssueDetail(issueId)
    return { ok: true }
  },

  evidenceUrl: async (a) => {
    const { data } = await supabase.storage.from('issue-evidence').createSignedUrl(a.storagePath, 120)
    return data?.signedUrl ?? null
  },
}))
