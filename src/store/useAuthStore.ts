import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export interface Profile {
  id: string
  email: string
  fullName: string
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  /** True until the initial getSession() call resolves — avoids flashing the login screen. */
  authLoading: boolean
  isAuthed: boolean

  currentUser: () => Profile | null

  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
}

function profileFromSession(session: Session | null): Profile | null {
  if (!session?.user) return null
  return {
    id: session.user.id,
    email: session.user.email ?? '',
    fullName: (session.user.user_metadata?.full_name as string | undefined) ?? '',
  }
}

export const useAuthStore = create<AuthState>()((_set, get) => ({
  session: null,
  profile: null,
  authLoading: true,
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
}))

function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) return 'ایمیل یا رمز عبور اشتباه است'
  if (message.includes('User already registered')) return 'این ایمیل قبلاً ثبت‌نام کرده است'
  if (message.includes('Password should be at least')) return 'رمز عبور باید حداقل ۶ کاراکتر باشد'
  if (message.includes('Unable to validate email')) return 'ایمیل وارد شده معتبر نیست'
  return message
}

supabase.auth.onAuthStateChange((_event, session) => {
  useAuthStore.setState({ session, profile: profileFromSession(session), isAuthed: !!session, authLoading: false })
})

supabase.auth.getSession().then(({ data }) => {
  useAuthStore.setState({
    session: data.session,
    profile: profileFromSession(data.session),
    isAuthed: !!data.session,
    authLoading: false,
  })
})
