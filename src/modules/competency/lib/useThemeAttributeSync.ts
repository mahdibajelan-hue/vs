import { useEffect } from 'react'
import { useStore } from '../../../store/useStore'

/** Keeps <html data-theme> in sync with the app's persisted theme (useStore().theme). App.tsx does
 * the same, but only while the piping app itself is mounted — the competency module and its public
 * pages render without it, so they sync on their own. */
export function useThemeAttributeSync() {
  const theme = useStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  return theme
}
