import { useEffect, useMemo, useState } from 'react'
import { Mail, RefreshCw, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/useAuthStore'
import { ROLE_LABEL_FA, type UserRole } from '../types'
import { assignableRoles } from '../lib/permissions'
import { RM_ROLE_LABEL_FA, RM_ROLES, type RmUserRole } from '../modules/risk/types'
import { IM_ROLE_LABEL_FA, IM_ROLES, type ImUserRole } from '../modules/issues/types'

interface ProfileRow {
  id: string
  email: string
  full_name: string
  is_admin: boolean
}
interface ProjectRow {
  id: string
  name: string
}
interface PpMemberRow {
  project_id: string
  user_id: string
  role: UserRole
}
interface PpInviteRow {
  id: string
  project_id: string
  email: string
  role: UserRole
}
interface RmMemberRow {
  project_id: string
  user_id: string
  role: RmUserRole
}
interface ImMemberRow {
  project_id: string
  user_id: string
  role: ImUserRole
}

type ProductKey = 'pipepulse' | 'risk' | 'issues'

const PRODUCT_LABEL: Record<ProductKey, string> = { pipepulse: 'PipePulse', risk: 'مدیریت ریسک', issues: 'مدیریت مسائل' }
const PRODUCT_ACCENT: Record<ProductKey, string> = { pipepulse: '#0ea5e9', risk: '#e74c3c', issues: '#a78bfa' }

/**
 * Cross-module, admin-only view: every user, every project across all three products, and their
 * role there — reached directly from the hub (not from inside any single module) so an admin
 * never has to enter a product just to manage who has access to it.
 */
export function UnifiedAdminPage() {
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const myUserId = useAuthStore((s) => s.profile?.id)

  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [ppProjects, setPpProjects] = useState<ProjectRow[]>([])
  const [ppMembers, setPpMembers] = useState<PpMemberRow[]>([])
  const [ppInvites, setPpInvites] = useState<PpInviteRow[]>([])
  const [rmProjects, setRmProjects] = useState<ProjectRow[]>([])
  const [rmMembers, setRmMembers] = useState<RmMemberRow[]>([])
  const [imProjects, setImProjects] = useState<ProjectRow[]>([])
  const [imMembers, setImMembers] = useState<ImMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteProjectId, setInviteProjectId] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('contractor')
  const [inviteError, setInviteError] = useState('')

  const [addingKey, setAddingKey] = useState<string | null>(null)
  const [addProjectId, setAddProjectId] = useState('')
  const [addRole, setAddRole] = useState('')
  const [addError, setAddError] = useState('')

  const load = async () => {
    setLoading(true)
    const [{ data: p }, { data: ppP }, { data: ppM }, { data: ppI }, { data: rmP }, { data: rmM }, { data: imP }, { data: imM }] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, is_admin').order('email'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('project_members').select('project_id, user_id, role'),
      supabase.from('project_invites').select('id, project_id, email, role').is('accepted_at', null),
      supabase.from('rm_projects').select('id, name').order('name'),
      supabase.from('rm_project_members').select('project_id, user_id, role'),
      supabase.from('im_projects').select('id, name').order('name'),
      supabase.from('im_project_members').select('project_id, user_id, role'),
    ])
    setProfiles((p ?? []) as ProfileRow[])
    setPpProjects((ppP ?? []) as ProjectRow[])
    setPpMembers((ppM ?? []) as PpMemberRow[])
    setPpInvites((ppI ?? []) as PpInviteRow[])
    setRmProjects((rmP ?? []) as ProjectRow[])
    setRmMembers((rmM ?? []) as RmMemberRow[])
    setImProjects((imP ?? []) as ProjectRow[])
    setImMembers((imM ?? []) as ImMemberRow[])
    setLoading(false)
  }

  useEffect(() => {
    if (isAdmin) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const projectName = (product: ProductKey, id: string) => {
    const list = product === 'pipepulse' ? ppProjects : product === 'risk' ? rmProjects : imProjects
    return list.find((p) => p.id === id)?.name ?? '—'
  }

  const ppByUser = useMemo(() => groupByUser(ppMembers), [ppMembers])
  const rmByUser = useMemo(() => groupByUser(rmMembers), [rmMembers])
  const imByUser = useMemo(() => groupByUser(imMembers), [imMembers])

  const removeMembership = async (product: ProductKey, projectId: string, userId: string) => {
    const key = `rm:${product}:${projectId}:${userId}`
    setBusyKey(key)
    const table = product === 'pipepulse' ? 'project_members' : product === 'risk' ? 'rm_project_members' : 'im_project_members'
    await supabase.from(table).delete().eq('project_id', projectId).eq('user_id', userId)
    await load()
    setBusyKey(null)
  }

  const changeMembershipRole = async (product: ProductKey, projectId: string, userId: string, role: string) => {
    const key = `role:${product}:${projectId}:${userId}`
    setBusyKey(key)
    const table = product === 'pipepulse' ? 'project_members' : product === 'risk' ? 'rm_project_members' : 'im_project_members'
    await supabase.from(table).update({ role }).eq('project_id', projectId).eq('user_id', userId)
    await load()
    setBusyKey(null)
  }

  const addMembership = async (product: ProductKey, userId: string) => {
    if (!addProjectId || !addRole) return
    setAddError('')
    setBusyKey(`add:${product}:${userId}`)
    const table = product === 'pipepulse' ? 'project_members' : product === 'risk' ? 'rm_project_members' : 'im_project_members'
    const { error } = await supabase.from(table).upsert({ project_id: addProjectId, user_id: userId, role: addRole }, { onConflict: 'project_id,user_id' })
    setBusyKey(null)
    if (error) {
      setAddError('خطا — ' + error.message)
      return
    }
    setAddingKey(null)
    setAddProjectId('')
    await load()
  }

  const cancelInvite = async (id: string) => {
    setBusyKey(`inv:${id}`)
    await supabase.from('project_invites').delete().eq('id', id)
    await load()
    setBusyKey(null)
  }

  const sendInvite = async () => {
    const trimmed = inviteEmail.trim().toLowerCase()
    if (!trimmed || !inviteProjectId) {
      setInviteError('ایمیل و پروژه را مشخص کنید')
      return
    }
    setInviteError('')
    const existing = profiles.find((p) => p.email.toLowerCase() === trimmed)
    if (existing) {
      const { error } = await supabase
        .from('project_members')
        .upsert({ project_id: inviteProjectId, user_id: existing.id, role: inviteRole }, { onConflict: 'project_id,user_id' })
      if (error) {
        setInviteError('خطا — ' + error.message)
        return
      }
    } else {
      const { error } = await supabase
        .from('project_invites')
        .upsert({ project_id: inviteProjectId, email: trimmed, role: inviteRole, invited_by: myUserId }, { onConflict: 'project_id,email' })
      if (error) {
        setInviteError('خطا — ' + error.message)
        return
      }
    }
    setInviteEmail('')
    setInviteProjectId('')
    setShowInviteForm(false)
    await load()
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-extrabold">فهرست کاربران و دسترسی‌ها</p>
            <p className="text-[10px] text-muted">همه اعضا و نقش آن‌ها در هر پروژه، در PipePulse، مدیریت ریسک و مدیریت مسائل</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInviteForm((v) => !v)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2.5 text-xs font-medium text-white hover:bg-brand-400 transition-colors sm:flex-initial"
            >
              <UserPlus size={14} /> دعوت کاربر به یک پروژه PipePulse
            </button>
            <button onClick={load} disabled={loading} className="shrink-0 rounded-lg p-2.5 text-secondary hover:bg-white/5 transition-colors" title="بروزرسانی">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {showInviteForm && (
            <div className="glass-panel rounded-2xl p-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-secondary">ایمیل</span>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="input" placeholder="person@example.com" dir="ltr" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-secondary">پروژه PipePulse</span>
                <select value={inviteProjectId} onChange={(e) => setInviteProjectId(e.target.value)} className="input">
                  <option value="">انتخاب پروژه...</option>
                  {ppProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-secondary">نقش</span>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)} className="input">
                  {assignableRoles(true).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL_FA[r]}
                    </option>
                  ))}
                </select>
              </label>
              {inviteError && <p className="text-xs text-red-400">{inviteError}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowInviteForm(false)} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
                  انصراف
                </button>
                <button onClick={sendInvite} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
                  افزودن / دعوت
                </button>
              </div>
              <p className="text-[11px] text-muted leading-5">
                اگر کاربر قبلاً حساب داشته باشد بلافاصله اضافه می‌شود، در غیر این صورت با اولین ورودش دعوت پذیرفته می‌شود. برای مدیریت ریسک و مدیریت مسائل، کاربر باید پیش‌تر حداقل یک‌بار وارد سامانه شده باشد.
              </p>
            </div>
          )}

          {ppInvites.length > 0 && (
            <div className="glass-panel rounded-2xl overflow-hidden">
              <p className="px-4 py-2.5 text-xs font-bold text-secondary border-b" style={{ borderColor: 'var(--border-soft)' }}>
                دعوت‌های در انتظار پذیرش (PipePulse)
              </p>
              <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
                {ppInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex items-center gap-2">
                      <Mail size={13} className="shrink-0 text-muted" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{inv.email}</p>
                        <p className="text-[11px] text-muted">
                          {projectName('pipepulse', inv.project_id)} — {ROLE_LABEL_FA[inv.role]}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => cancelInvite(inv.id)}
                      disabled={busyKey === `inv:${inv.id}`}
                      className="shrink-0 text-muted hover:text-red-400 transition-colors disabled:opacity-40"
                      title="لغو دعوت"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-panel rounded-2xl overflow-hidden">
            <p className="px-4 py-2.5 text-xs font-bold text-secondary border-b" style={{ borderColor: 'var(--border-soft)' }}>
              کاربران ({profiles.length})
            </p>
            {loading && profiles.length === 0 && <p className="p-4 text-center text-xs text-muted">در حال بارگذاری...</p>}
            <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
              {profiles.map((p) => (
                <div key={p.id} className="p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {p.full_name || p.email} {p.id === myUserId && <span className="text-[10px] text-brand-400">(شما)</span>}
                    </p>
                    {p.is_admin && (
                      <span className="flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                        <ShieldCheck size={10} /> ادمین سامانه
                      </span>
                    )}
                    <p className="text-[11px] text-muted truncate">{p.email}</p>
                  </div>

                  <ProductRow
                    product="pipepulse"
                    userId={p.id}
                    memberships={ppByUser.get(p.id) ?? []}
                    projects={ppProjects}
                    roles={assignableRoles(true)}
                    roleLabel={ROLE_LABEL_FA}
                    projectName={(id) => projectName('pipepulse', id)}
                    busyKey={busyKey}
                    addingKey={addingKey}
                    addProjectId={addProjectId}
                    addRole={addRole}
                    addError={addError}
                    onStartAdd={() => {
                      setAddingKey(`pipepulse:${p.id}`)
                      setAddProjectId('')
                      setAddRole(assignableRoles(true)[0])
                      setAddError('')
                    }}
                    onCancelAdd={() => setAddingKey(null)}
                    onChangeAddProjectId={setAddProjectId}
                    onChangeAddRole={setAddRole}
                    onConfirmAdd={() => addMembership('pipepulse', p.id)}
                    onRemove={(projectId) => removeMembership('pipepulse', projectId, p.id)}
                    onChangeRole={(projectId, role) => changeMembershipRole('pipepulse', projectId, p.id, role)}
                  />
                  <ProductRow
                    product="risk"
                    userId={p.id}
                    memberships={rmByUser.get(p.id) ?? []}
                    projects={rmProjects}
                    roles={RM_ROLES}
                    roleLabel={RM_ROLE_LABEL_FA}
                    projectName={(id) => projectName('risk', id)}
                    busyKey={busyKey}
                    addingKey={addingKey}
                    addProjectId={addProjectId}
                    addRole={addRole}
                    addError={addError}
                    onStartAdd={() => {
                      setAddingKey(`risk:${p.id}`)
                      setAddProjectId('')
                      setAddRole(RM_ROLES[0])
                      setAddError('')
                    }}
                    onCancelAdd={() => setAddingKey(null)}
                    onChangeAddProjectId={setAddProjectId}
                    onChangeAddRole={setAddRole}
                    onConfirmAdd={() => addMembership('risk', p.id)}
                    onRemove={(projectId) => removeMembership('risk', projectId, p.id)}
                    onChangeRole={(projectId, role) => changeMembershipRole('risk', projectId, p.id, role)}
                  />
                  <ProductRow
                    product="issues"
                    userId={p.id}
                    memberships={imByUser.get(p.id) ?? []}
                    projects={imProjects}
                    roles={IM_ROLES}
                    roleLabel={IM_ROLE_LABEL_FA}
                    projectName={(id) => projectName('issues', id)}
                    busyKey={busyKey}
                    addingKey={addingKey}
                    addProjectId={addProjectId}
                    addRole={addRole}
                    addError={addError}
                    onStartAdd={() => {
                      setAddingKey(`issues:${p.id}`)
                      setAddProjectId('')
                      setAddRole(IM_ROLES[0])
                      setAddError('')
                    }}
                    onCancelAdd={() => setAddingKey(null)}
                    onChangeAddProjectId={setAddProjectId}
                    onChangeAddRole={setAddRole}
                    onConfirmAdd={() => addMembership('issues', p.id)}
                    onRemove={(projectId) => removeMembership('issues', projectId, p.id)}
                    onChangeRole={(projectId, role) => changeMembershipRole('issues', projectId, p.id, role)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function groupByUser<T extends { user_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const list = map.get(r.user_id) ?? []
    list.push(r)
    map.set(r.user_id, list)
  }
  return map
}

function ProductRow({
  product,
  userId,
  memberships,
  projects,
  roles,
  roleLabel,
  projectName,
  busyKey,
  addingKey,
  addProjectId,
  addRole,
  addError,
  onStartAdd,
  onCancelAdd,
  onChangeAddProjectId,
  onChangeAddRole,
  onConfirmAdd,
  onRemove,
  onChangeRole,
}: {
  product: ProductKey
  userId: string
  memberships: { project_id: string; role: string }[]
  projects: ProjectRow[]
  roles: string[]
  roleLabel: Record<string, string>
  projectName: (id: string) => string
  busyKey: string | null
  addingKey: string | null
  addProjectId: string
  addRole: string
  addError: string
  onStartAdd: () => void
  onCancelAdd: () => void
  onChangeAddProjectId: (id: string) => void
  onChangeAddRole: (role: string) => void
  onConfirmAdd: () => void
  onRemove: (projectId: string) => void
  onChangeRole: (projectId: string, role: string) => void
}) {
  const isAdding = addingKey === `${product}:${userId}`
  const availableProjects = projects.filter((proj) => !memberships.some((m) => m.project_id === proj.id))

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-bold" style={{ color: PRODUCT_ACCENT[product], minWidth: '5.5rem' }}>
        {PRODUCT_LABEL[product]}
      </span>
      {memberships.map((m) => (
        <div key={m.project_id} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
          <span className="text-[11px] truncate max-w-[9rem]">{projectName(m.project_id)}</span>
          <select
            value={m.role}
            onChange={(e) => onChangeRole(m.project_id, e.target.value)}
            disabled={busyKey === `role:${product}:${m.project_id}:${userId}`}
            className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none focus:border-brand-400"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </select>
          <button
            onClick={() => onRemove(m.project_id)}
            disabled={busyKey === `rm:${product}:${m.project_id}:${userId}`}
            className="text-muted hover:text-red-400 transition-colors disabled:opacity-40"
            title="حذف از این پروژه"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {isAdding ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-brand-400/30 bg-brand-500/5 px-2 py-1">
          <select
            value={addProjectId}
            onChange={(e) => onChangeAddProjectId(e.target.value)}
            className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none focus:border-brand-400"
          >
            <option value="">پروژه...</option>
            {availableProjects.map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name}
              </option>
            ))}
          </select>
          <select
            value={addRole}
            onChange={(e) => onChangeAddRole(e.target.value)}
            className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none focus:border-brand-400"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabel[r]}
              </option>
            ))}
          </select>
          <button onClick={onConfirmAdd} disabled={!addProjectId} className="text-[10px] font-medium text-brand-300 hover:underline disabled:opacity-40">
            افزودن
          </button>
          <button onClick={onCancelAdd} className="text-muted hover:text-current transition-colors">
            <X size={12} />
          </button>
          {addError && <p className="w-full text-[10px] text-red-400">{addError}</p>}
        </div>
      ) : (
        <button
          onClick={onStartAdd}
          disabled={availableProjects.length === 0}
          className="flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2 py-1 text-[11px] text-secondary hover:bg-white/5 transition-colors disabled:opacity-40"
        >
          <UserPlus size={11} /> افزودن
        </button>
      )}
    </div>
  )
}
