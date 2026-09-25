import type { CSSProperties, ReactNode } from 'react'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'

/**
 * Every module's own "بازگشت به ماژول‌ها" button just deselects the active module while staying
 * signed in — it does not touch the Supabase session. This is the one consistent, explicit way
 * to actually sign out and land back on a guaranteed-fresh login screen (so a different user can
 * sign in), available from the hub and from inside every module.
 */
export function SignOutButton({
  className, style, title, children,
}: {
  className?: string
  style?: CSSProperties
  /** Override the default Persian tooltip — used by English-mode pages. */
  title?: string
  /** Override the default Persian label — used by English-mode pages. */
  children?: ReactNode
}) {
  const signOut = useAuthStore((s) => s.signOut)
  return (
    <button
      onClick={() => signOut()}
      title={title ?? 'خروج از حساب و بازگشت به صفحه ورود'}
      style={style}
      className={
        className ??
        'flex items-center gap-1.5 rounded-lg border border-red-400/25 px-3.5 py-2 text-xs text-red-300 hover:bg-red-500/10 transition-colors'
      }
    >
      <LogOut size={13} /> {children ?? 'خروج از حساب'}
    </button>
  )
}
