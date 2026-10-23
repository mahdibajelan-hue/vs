import { Moon, Sun } from 'lucide-react'
import { useAppTheme } from './useAppTheme'
import { TOOLBAR_ACCENTS } from './ToolbarGuide'

/**
 * The sun / moon switch — the same button in the same spot on the launchpad and in every module. In the shortcut bar it is
 * labelled («تم روشن» / «تم تیره»); `compact` keeps the old round icon for tight headers.
 * The two icons cross-fade with a small turn (transform + opacity only, ~220ms ease-out); reduced-motion users get the fade only.
 */
export function ThemeSwitch({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { dark, toggle } = useAppTheme()
  const icons = <>
    <Sun size={compact ? 15 : 16} className="theme-switch-icon absolute" data-on={dark} aria-hidden />
    <Moon size={compact ? 15 : 16} className="theme-switch-icon absolute" data-on={!dark} aria-hidden />
  </>
  if (!compact) return (
    <button type="button" onClick={toggle} aria-pressed={dark} aria-label={dark ? 'تغییر به تم روشن' : 'تغییر به تم تیره'} title={dark ? 'تم روشن' : 'تم تیره'}
      className={`tb-act theme-switch ${className}`} style={{ ['--acc' as string]: dark ? TOOLBAR_ACCENTS.theme : '#7c3aed' }}>
      <span className="tb-ico relative overflow-hidden" aria-hidden>{icons}</span>
      <span className="tb-cap" aria-hidden>{dark ? 'تم روشن' : 'تم تیره'}</span>
    </button>
  )
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
      {icons}
    </button>
  )
}
