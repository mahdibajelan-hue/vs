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
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** True until the initial getSession() call resolves — avoids flashing the login screen. */
  authLoading: boolean
  /** True while the profiles row for a signed-in session is being fetched. */
  profileLoading: boolean
  isAuthed: boolean

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
  }
}

async function loadProfile(userId: string) {
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    useAuthStore.setState({ profile: data ? profileFromRow(data as ProfileRow) : null, profileLoading: false })
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

  currentUser: () => get().profile,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: translateAuthError(error.message) }
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
