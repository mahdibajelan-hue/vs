import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import type { AccountStatus, AuditCategory, AuditEntry, Membership, OverrideEffect, PermissionOverride, ProductKey, UcProject, UcUser, UserType } from '../types'

const MEMBER_TABLE: Record<ProductKey, string> = { pipepulse: 'project_members', risk: 'rm_project_members', issues: 'im_project_members' }
const PROJECT_TABLE: Record<ProductKey, string> = { pipepulse: 'projects', risk: 'rm_projects', issues: 'im_projects' }

export interface Result {
  ok: boolean
  error?: string
  /** The change was saved, but a follow-up step (e.g. closing sign-in at the auth layer) failed. */
  warning?: string
}

interface ProfileRow {
  id: string
  email: string
  full_name: string
  position_title: string
  phone: string
  organization: string | null
  user_type: string | null
  is_admin: boolean
  avatar_url: string
  profile_completed: boolean
  account_status: string | null
  status_reason: string | null
  status_changed_at: string | null
  status_changed_by: string | null
  created_at: string
}
interface AuthInfoRow {
  user_id: string
  last_sign_in_at: string | null
  auth_created_at: string | null
  banned_until: string | null
  email_confirmed_at: string | null
}
interface AuditRow {
  id: number
  at: string
  actor_id: string | null
  target_id: string | null
  category: string
  action: string
  detail: Record<string, unknown> | null
}

function userFromRow(r: ProfileRow, auth?: AuthInfoRow): UcUser {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name ?? '',
    positionTitle: r.position_title ?? '',
    phone: r.phone ?? '',
    organization: r.organization ?? '',
    userType: (r.user_type ?? 'other') as UserType,
    isAdmin: r.is_admin,
    avatarUrl: r.avatar_url ?? '',
    profileCompleted: r.profile_completed,
    accountStatus: (r.account_status ?? 'active') as AccountStatus,
    statusReason: r.status_reason ?? '',
    statusChangedAt: r.status_changed_at,
    statusChangedBy: r.status_changed_by,
    createdAt: r.created_at,
    lastSignInAt: auth?.last_sign_in_at ?? null,
    authCreatedAt: auth?.auth_created_at ?? null,
    bannedUntil: auth?.banned_until ?? null,
    emailConfirmed: !!auth?.email_confirmed_at,
  }
}

/** supabase-js wraps non-2xx edge-function replies; the useful Persian message is in the response body. */
async function edgeCall(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke('uc-admin-ops', { body })
  if (!error) return { ok: true, data: (data ?? {}) as Record<string, unknown> }
  let message = ''
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      message = ((await ctx.json()) as { error?: string }).error ?? ''
    } catch {
      /* body was not JSON */
    }
  }
  return { ok: false, error: message || 'ارتباط با سرویس مدیریت حساب برقرار نشد — دوباره تلاش کنید' }
}

interface UcState {
  users: UcUser[]
  products: UcProject[]
  memberships: Membership[]
  overrides: PermissionOverride[]
  audit: Record<string, AuditEntry[]>
  /** false when the admin-only sign-in info RPC could not be read (last sign-in then shows as unknown). */
  authInfoAvailable: boolean
  loading: boolean
  loaded: boolean
  error: string | null

  load: () => Promise<void>
  loadAudit: (userId: string) => Promise<void>

  updateProfile: (userId: string, patch: Partial<{ full_name: string; position_title: string; phone: string; organization: string; user_type: UserType; is_admin: boolean }>) => Promise<Result>
  setStatus: (userId: string, status: AccountStatus, reason: string) => Promise<Result>
  setPassword: (userId: string, password: string) => Promise<Result>
  sendResetEmail: (email: string) => Promise<Result>
  createUser: (args: { email: string; full_name: string; password?: string; position_title?: string; phone?: string; organization?: string; user_type?: UserType; is_admin?: boolean }) => Promise<Result & { id?: string }>

  setMemberships: (userId: string, product: ProductKey, projectIds: string[], role: string) => Promise<Result>
  removeMemberships: (userId: string, product: ProductKey, projectIds: string[]) => Promise<Result>
  setOverrides: (userId: string, permissionIds: string[], effect: OverrideEffect, note?: string) => Promise<Result>
  clearOverrides: (userId: string, permissionIds: string[]) => Promise<Result>
}

export const useUserCenterStore = create<UcState>()((set, get) => {
  const fail = (error: { message?: string } | null | undefined): Result => ({ ok: false, error: friendlyErrorMessage(error) })

  return {
    users: [],
    products: [],
    memberships: [],
    overrides: [],
    audit: {},
    authInfoAvailable: true,
    loading: false,
    loaded: false,
    error: null,

    load: async () => {
      set({ loading: true, error: null })
      const [profiles, authInfo, pp, rm, im, mPp, mRm, mIm, ov] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.rpc('uc_auth_info'),
        supabase.from(PROJECT_TABLE.pipepulse).select('id, name'),
        supabase.from(PROJECT_TABLE.risk).select('id, name'),
        supabase.from(PROJECT_TABLE.issues).select('id, name'),
        supabase.from(MEMBER_TABLE.pipepulse).select('project_id, user_id, role'),
        supabase.from(MEMBER_TABLE.risk).select('project_id, user_id, role'),
        supabase.from(MEMBER_TABLE.issues).select('project_id, user_id, role'),
        supabase.from('rasta_user_permission_overrides').select('user_id, permission_id, effect, note, created_at'),
        useMasterDataStore.getState().loaded ? Promise.resolve() : useMasterDataStore.getState().fetchAll(),
        useAccessStore.getState().fetchAll(),
      ])
      const failure = profiles.error ?? pp.error ?? rm.error ?? im.error ?? mPp.error ?? mRm.error ?? mIm.error ?? ov.error
      if (failure) {
        set({ loading: false, error: friendlyErrorMessage(failure) })
        return
      }
      const authById = new Map<string, AuthInfoRow>(((authInfo.data ?? []) as AuthInfoRow[]).map((a) => [a.user_id, a]))
      const toProjects = (product: ProductKey, rows: { id: string; name: string }[] | null): UcProject[] => (rows ?? []).map((r) => ({ product, id: r.id, name: r.name }))
      const toMembers = (product: ProductKey, rows: { project_id: string; user_id: string; role: string }[] | null): Membership[] =>
        (rows ?? []).map((r) => ({ product, projectId: r.project_id, userId: r.user_id, role: r.role }))
      set({
        users: ((profiles.data ?? []) as ProfileRow[]).map((r) => userFromRow(r, authById.get(r.id))),
        authInfoAvailable: !authInfo.error,
        products: [...toProjects('pipepulse', pp.data), ...toProjects('risk', rm.data), ...toProjects('issues', im.data)],
        memberships: [...toMembers('pipepulse', mPp.data), ...toMembers('risk', mRm.data), ...toMembers('issues', mIm.data)],
        overrides: ((ov.data ?? []) as { user_id: string; permission_id: string; effect: OverrideEffect; note: string; created_at: string }[]).map((o) => ({
          userId: o.user_id,
          permissionId: o.permission_id,
          effect: o.effect,
          note: o.note,
          createdAt: o.created_at,
        })),
        loading: false,
        loaded: true,
      })
    },

    loadAudit: async (userId) => {
      const { data, error } = await supabase.from('uc_audit').select('*').eq('target_id', userId).order('at', { ascending: false }).limit(300)
      if (error) return
      const entries = ((data ?? []) as AuditRow[]).map<AuditEntry>((r) => ({
        id: r.id,
        at: r.at,
        actorId: r.actor_id,
        targetId: r.target_id,
        category: r.category as AuditCategory,
        action: r.action as AuditEntry['action'],
        detail: r.detail ?? {},
      }))
      set((s) => ({ audit: { ...s.audit, [userId]: entries } }))
    },

    updateProfile: async (userId, patch) => {
      const { error } = await supabase.rpc('uc_admin_update_user', { p_user: userId, p_patch: patch })
      if (error) return fail(error)
      await get().load()
      await get().loadAudit(userId)
      return { ok: true }
    },

    setStatus: async (userId, status, reason) => {
      const { error } = await supabase.rpc('uc_admin_update_user', { p_user: userId, p_patch: { account_status: status, status_reason: reason.trim() } })
      if (error) return fail(error)
      // The profile flag is enforced in the app and by RLS; the auth-level ban additionally stops new sign-ins and token refresh.
      const ban = await edgeCall({ action: 'set_ban', user_id: userId, banned: status !== 'active' })
      await get().load()
      await get().loadAudit(userId)
      return ban.ok ? { ok: true } : { ok: true, warning: `وضعیت حساب ثبت شد اما بستن ورود در سطح احراز هویت انجام نشد: ${ban.error}` }
    },

    setPassword: async (userId, password) => {
      const res = await edgeCall({ action: 'set_password', user_id: userId, password })
      return res.ok ? { ok: true } : { ok: false, error: res.error }
    },

    sendResetEmail: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
      return error ? fail(error) : { ok: true }
    },

    createUser: async (args) => {
      const res = await edgeCall({ action: 'create_user', ...args })
      if (!res.ok) return { ok: false, error: res.error }
      await get().load()
      return { ok: true, id: res.data?.id as string | undefined }
    },

    setMemberships: async (userId, product, projectIds, role) => {
      if (!projectIds.length) return { ok: true }
      const rows = projectIds.map((project_id) => ({ project_id, user_id: userId, role }))
      const { error } = await supabase.from(MEMBER_TABLE[product]).upsert(rows, { onConflict: 'project_id,user_id' })
      if (error) return fail(error)
      set((s) => ({
        memberships: [
          ...s.memberships.filter((m) => !(m.userId === userId && m.product === product && projectIds.includes(m.projectId))),
          ...projectIds.map((projectId) => ({ product, projectId, userId, role })),
        ],
      }))
      await get().loadAudit(userId)
      return { ok: true }
    },

    removeMemberships: async (userId, product, projectIds) => {
      if (!projectIds.length) return { ok: true }
      const { error } = await supabase.from(MEMBER_TABLE[product]).delete().eq('user_id', userId).in('project_id', projectIds)
      if (error) return fail(error)
      set((s) => ({ memberships: s.memberships.filter((m) => !(m.userId === userId && m.product === product && projectIds.includes(m.projectId))) }))
      await get().loadAudit(userId)
      return { ok: true }
    },

    setOverrides: async (userId, permissionIds, effect, note = '') => {
      if (!permissionIds.length) return { ok: true }
      const rows = permissionIds.map((permission_id) => ({ user_id: userId, permission_id, effect, note }))
      const { error } = await supabase.from('rasta_user_permission_overrides').upsert(rows, { onConflict: 'user_id,permission_id' })
      if (error) return fail(error)
      const createdAt = new Date().toISOString()
      set((s) => ({
        overrides: [
          ...s.overrides.filter((o) => !(o.userId === userId && permissionIds.includes(o.permissionId))),
          ...permissionIds.map((permissionId) => ({ userId, permissionId, effect, note, createdAt })),
        ],
      }))
      await get().loadAudit(userId)
      return { ok: true }
    },

    clearOverrides: async (userId, permissionIds) => {
      if (!permissionIds.length) return { ok: true }
      const { error } = await supabase.from('rasta_user_permission_overrides').delete().eq('user_id', userId).in('permission_id', permissionIds)
      if (error) return fail(error)
      set((s) => ({ overrides: s.overrides.filter((o) => !(o.userId === userId && permissionIds.includes(o.permissionId))) }))
      await get().loadAudit(userId)
      return { ok: true }
    },
  }
})
