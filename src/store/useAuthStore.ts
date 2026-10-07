import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { useModuleStore } from './useModuleStore'
import { useModuleAccessStore } from './useModuleAccessStore'

export interface Profile {
  id: string
  email: string
  fullName: string
  avatarUrl: string
  positionTitle: string
  phone: string
  isAdmin: boolean
  profileCompleted: boolean
  accountStatus: 'active' | 'disabled' | 'blocked'
}

interface ProfileRow {
  id: string
  email: string
  full_name: string
  avatar_url: string
  position_title: string
  phone: string
  is_admin: boolean
  profile_completed: boolean
  account_status?: 'active' | 'disabled' | 'blocked' | null
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** True until the initial getSession() call resolves — avoids flashing the login screen. */
  authLoading: boolean
  /** True while the profiles row for a signed-in session is being fetched. */
  profileLoading: boolean
  isAuthed: boolean
  /** Why the last session was ended by the app itself (e.g. the account was disabled) — shown on the login card. */
  authNotice: string | null

  currentUser: () => Profile | null

  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
  updatePassword: (newPassword: string) => Promise<{ ok: boolean; error?: string }>
  refreshProfile: () => Promise<void>
}

function profileFromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    positionTitle: row.position_title,
    phone: row.phone,
    isAdmin: row.is_admin,
    profileCompleted: row.profile_completed,
    accountStatus: row.account_status ?? 'active',
  }
}

const INACTIVE_NOTICE = {
  disabled: 'حساب شما غیرفعال شده است. برای فعال‌سازی با مدیر سیستم تماس بگیرید.',
  blocked: 'حساب شما مسدود شده است. برای اطلاع از دلیل با مدیر سیستم تماس بگیرید.',
} as const

async function loadProfile(userId: string) {
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    const row = data as ProfileRow | null
    // A disabled / blocked account (changed by an admin, possibly mid-session) must not stay signed in.
    if (row && row.account_status && row.account_status !== 'active') {
      useAuthStore.setState({ authNotice: INACTIVE_NOTICE[row.account_status], profile: null, profileLoading: false })
      await supabase.auth.signOut()
      return
    }
    useAuthStore.setState({ profile: row ? profileFromRow(row) : null, profileLoading: false })
  } catch {
    // Never leave profileLoading stuck true — that would hang RootApp's loading spinner forever.
    useAuthStore.setState({ profileLoading: false })
  }
}

export const useAuthStore = create<AuthState>()((_set, get) => ({
  session: null,
  profile: null,
  authLoading: true,
  profileLoading: false,
  isAuthed: false,
  authNotice: null,

  currentUser: () => get().profile,

  signIn: async (email, password) => {
    useAuthStore.setState({ authNotice: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: translateAuthError(error.message) }
    // Tell a disabled / blocked user why right here, instead of flashing "success" and signing them out again.
    const { data: row } = await supabase.from('profiles').select('account_status').eq('id', data.user.id).maybeSingle()
    const status = (row as { account_status?: 'active' | 'disabled' | 'blocked' } | null)?.account_status
    if (status && status !== 'active') {
      await supabase.auth.signOut()
      return { ok: false, error: INACTIVE_NOTICE[status] }
    }
    return { ok: true }
  },

  signOut: async () => {
    await supabase.auth.signOut()
  },

  updatePassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { ok: false, error: translateAuthError(error.message) }
    return { ok: true }
  },

  refreshProfile: async () => {
    const userId = get().session?.user.id
    if (userId) await loadProfile(userId)
  },
}))

function translateAuthError(message: string): string {
  if (/banned|user is banned/i.test(message)) return INACTIVE_NOTICE.blocked
  if (message.includes('Invalid login credentials')) return 'ایمیل یا رمز عبور اشتباه است'
  if (message.includes('User already registered')) return 'این ایمیل قبلاً ثبت‌نام کرده است'
  if (message.includes('Password should be at least')) return 'رمز عبور باید حداقل ۶ کاراکتر باشد'
  if (message.includes('Unable to validate email')) return 'ایمیل وارد شده معتبر نیست'
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return 'ارتباط با سرور برقرار نشد — اتصال اینترنت خود را بررسی و دوباره تلاش کنید'
  }
  return 'خطایی در ورود رخ داد — لطفاً دوباره تلاش کنید'
}

supabase.auth.onAuthStateChange((_event, session) => {
  const prevUserId = useAuthStore.getState().session?.user.id
  useAuthStore.setState({ session, isAuthed: !!session, authLoading: false })
  if (session?.user && session.user.id !== prevUserId) {
    // A new sign-in (or a different user than before) must never inherit whichever module the
    // previous session happened to be sitting in — always land back on the hub.
    useModuleStore.getState().exitToHub()
    useAuthStore.setState({ profileLoading: true })
    loadProfile(session.user.id)
    useModuleAccessStore.getState().fetchAccess()
  } else if (!session) {
    useModuleStore.getState().exitToHub()
    useAuthStore.setState({ profile: null, profileLoading: false })
    useModuleAccessStore.getState().reset()
  }
})

supabase.auth
  .getSession()
  .then(({ data }) => {
    useAuthStore.setState({ session: data.session, isAuthed: !!data.session, authLoading: false })
    if (data.session?.user) {
      useAuthStore.setState({ profileLoading: true })
      loadProfile(data.session.user.id)
      useModuleAccessStore.getState().fetchAccess()
    }
  })
  .catch(() => {
    // If the initial session check itself fails (network hiccup, etc.), don't leave the app
    // stuck on the loading spinner forever — fall back to the login screen.
    useAuthStore.setState({ authLoading: false })
  })
