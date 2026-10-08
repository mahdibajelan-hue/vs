import { Moon, Sun } from 'lucide-react'
import { useAppTheme } from './useAppTheme'

/**
 * The sun / moon switch — the same button in the same spot (beside the profile chip) on the launchpad and in every module.
 * The two icons cross-fade with a small turn (transform + opacity only, ~220ms ease-out); reduced-motion users get the fade only.
 */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const { dark, toggle } = useAppTheme()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={dark}
      aria-label={dark ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'}
      title={dark ? 'تم روشن' : 'تم تاریک'}
      className={`theme-switch relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 transition-colors hover:bg-white/5 ${className}`}
      style={{ color: dark ? '#fcd34d' : '#6d28d9', borderColor: 'var(--border-soft)' }}
    >
      <Sun size={15} className="theme-switch-icon absolute" data-on={dark} aria-hidden />
      <Moon size={15} className="theme-switch-icon absolute" data-on={!dark} aria-hidden />
    </button>
  )
}
