import { useEffect, useMemo, useState } from 'react'
import { UserPlus, Trash2, Users, Mail, X, ShieldCheck, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuthStore } from '../store/useAuthStore'
import { ROLE_LABEL_FA, type UserRole } from '../types'
import { assignableRoles } from '../lib/permissions'
import { RolePicker } from '../components/Auth/AuthGate'

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
interface MemberRow {
  project_id: string
  user_id: string
  role: UserRole
}
interface InviteRow {
  id: string
  project_id: string
  email: string
  role: UserRole
}

/**
 * Admin-only, cross-project view: every user × every project × their role there, in one place.
 * Backed directly by project_members (the same table the per-project members modal uses) —
 * admin already has full RLS visibility on profiles/projects/project_members/project_invites.
 */
export function AdminUsersPage() {
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const myUserId = useAuthStore((s) => s.profile?.id)

  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [invites, setInvites] = useState<InviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteProjectId, setInviteProjectId] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('contractor')
  const [inviteError, setInviteError] = useState('')

  const [addingForUser, setAddingForUser] = useState<string | null>(null)
  const [addProjectId, setAddProjectId] = useState('')
  const [addRole, setAddRole] = useState<UserRole>('contractor')

  const load = async () => {
    setLoading(true)
    const [{ data: p }, { data: pr }, { data: m }, { data: inv }] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, is_admin').order('email'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('project_members').select('project_id, user_id, role'),
      supabase.from('project_invites').select('id, project_id, email, role').is('accepted_at', null),
    ])
    setProfiles((p ?? []) as ProfileRow[])
    setProjects((pr ?? []) as ProjectRow[])
    setMembers((m ?? []) as MemberRow[])
    setInvites((inv ?? []) as InviteRow[])
    setLoading(false)
  }

  useEffect(() => {
    if (isAdmin) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '—'

  const membersByUser = useMemo(() => {
    const map = new Map<string, MemberRow[]>()
    for (const m of members) {
      const list = map.get(m.user_id) ?? []
      list.push(m)
      map.set(m.user_id, list)
    }
    return map
  }, [members])

  const removeMembership = async (projectId: string, userId: string) => {
    setBusyKey(`rm:${projectId}:${userId}`)
    await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
    await load()
    setBusyKey(null)
  }

  const changeMembershipRole = async (projectId: string, userId: string, role: UserRole) => {
    setBusyKey(`role:${projectId}:${userId}`)
    await supabase.from('project_members').update({ role }).eq('project_id', projectId).eq('user_id', userId)
    await load()
    setBusyKey(null)
  }

  const addMembership = async (userId: string) => {
    if (!addProjectId) return
    setBusyKey(`add:${userId}`)
    await supabase.from('project_members').upsert({ project_id: addProjectId, user_id: userId, role: addRole }, { onConflict: 'project_id,user_id' })
    setAddingForUser(null)
    setAddProjectId('')
    await load()
    setBusyKey(null)
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

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted">این بخش فقط برای ادمین سامانه در دسترس است.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-brand-400" />
            <div>
              <p className="text-sm font-bold">مدیریت کاربران</p>
              <p className="text-[11px] text-muted">فهرست همه اعضا، نقش آن‌ها در هر پروژه، و افزودن یا حذف دسترسی</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} className="rounded-lg p-2 text-secondary hover:bg-white/5 transition-colors" title="بروزرسانی">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowInviteForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
            >
              <UserPlus size={14} /> دعوت کاربر به یک پروژه
            </button>
          </div>
        </div>

        {showInviteForm && (
          <div className="glass-panel rounded-2xl p-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-secondary">ایمیل</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="input"
                placeholder="person@example.com"
                dir="ltr"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-secondary">پروژه</span>
              <select value={inviteProjectId} onChange={(e) => setInviteProjectId(e.target.value)} className="input">
                <option value="">انتخاب پروژه...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <RolePicker value={inviteRole} onChange={setInviteRole} roles={assignableRoles(true)} />
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
              اگر کاربر قبلاً حساب داشته باشد بلافاصله با نقش انتخاب‌شده به پروژه اضافه می‌شود، در غیر این صورت با اولین ورودش دعوت پذیرفته می‌شود.
            </p>
          </div>
        )}

        {invites.length > 0 && (
          <div className="glass-panel rounded-2xl overflow-hidden">
            <p className="px-4 py-2.5 text-xs font-bold text-secondary border-b" style={{ borderColor: 'var(--border-soft)' }}>
              دعوت‌های در انتظار پذیرش
            </p>
            <div className="divide-y" style={{ borderColor: 'var(--border-soft)' }}>
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex items-center gap-2">
                    <Mail size={13} className="shrink-0 text-muted" />
                    <div className="min-w-0">
                      <p className="text-sm truncate">{inv.email}</p>
                      <p className="text-[11px] text-muted">{projectName(inv.project_id)} — {ROLE_LABEL_FA[inv.role]}</p>
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
            {profiles.map((p) => {
              const myMemberships = membersByUser.get(p.id) ?? []
              return (
                <div key={p.id} className="p-4">
                  <div className="mb-2.5 flex items-center gap-2">
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

                  <div className="flex flex-wrap items-center gap-1.5">
                    {myMemberships.map((m) => (
                      <div key={m.project_id} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                        <span className="text-[11px] truncate max-w-[9rem]">{projectName(m.project_id)}</span>
                        <select
                          value={m.role}
                          onChange={(e) => changeMembershipRole(m.project_id, p.id, e.target.value as UserRole)}
                          disabled={busyKey === `role:${m.project_id}:${p.id}`}
                          className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none focus:border-brand-400"
                        >
                          {assignableRoles(true).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL_FA[r]}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => removeMembership(m.project_id, p.id)}
                          disabled={busyKey === `rm:${m.project_id}:${p.id}`}
                          className="text-muted hover:text-red-400 transition-colors disabled:opacity-40"
                          title="حذف از این پروژه"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}

                    {addingForUser === p.id ? (
                      <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand-400/30 bg-brand-500/5 px-2 py-1">
                        <select
                          value={addProjectId}
                          onChange={(e) => setAddProjectId(e.target.value)}
                          className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none focus:border-brand-400"
                        >
                          <option value="">پروژه...</option>
                          {projects
                            .filter((proj) => !myMemberships.some((m) => m.project_id === proj.id))
                            .map((proj) => (
                              <option key={proj.id} value={proj.id}>
                                {proj.name}
                              </option>
                            ))}
                        </select>
                        <select
                          value={addRole}
                          onChange={(e) => setAddRole(e.target.value as UserRole)}
                          className="rounded-md bg-black/20 border border-white/10 px-1.5 py-0.5 text-[10px] outline-none focus:border-brand-400"
                        >
                          {assignableRoles(true).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL_FA[r]}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => addMembership(p.id)}
                          disabled={!addProjectId || busyKey === `add:${p.id}`}
                          className="text-[10px] font-medium text-brand-300 hover:underline disabled:opacity-40"
                        >
                          افزودن
                        </button>
                        <button onClick={() => setAddingForUser(null)} className="text-muted hover:text-current transition-colors">
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAddingForUser(p.id)
                          setAddProjectId('')
                          setAddRole('contractor')
                        }}
                        className="flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2 py-1 text-[11px] text-secondary hover:bg-white/5 transition-colors"
                      >
                        <UserPlus size={11} /> افزودن به پروژه
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
