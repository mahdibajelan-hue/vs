import { useEffect } from 'react'
import { useStore } from '../../store/useStore'

/** The one app-wide light/dark choice (persisted by the main store). Every module and the launchpad read it from here. */
export function useAppTheme() {
  const theme = useStore((s) => s.theme)
  const toggle = useStore((s) => s.toggleTheme)
  return { theme, dark: theme === 'dark', toggle }
}

/** Mount once near the root: mirrors the choice onto <html data-theme> so every token set follows it. */
export function useAppThemeSync() {
  const { theme } = useAppTheme()
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
}
