import { Moon, Sun } from 'lucide-react'
import { useStore } from '../../../store/useStore'
import { useThemeAttributeSync } from '../lib/useThemeAttributeSync'

/** Sun/moon switch for the competency module header — the same global theme store and toggle the
 * rest of the app uses (no module-local theme). */
export function ThemeToggle() {
  const theme = useThemeAttributeSync()
  const toggleTheme = useStore((s) => s.toggleTheme)
  const isDark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'تغییر به تم روشن' : 'تغییر به تم تاریک'}
      title={isDark ? 'تم روشن' : 'تم تاریک'}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400"
      style={{ borderColor: 'var(--border-soft)', color: isDark ? '#fcd34d' : '#6d28d9', background: 'color-mix(in srgb, var(--bg-panel-solid) 70%, transparent)' }}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
