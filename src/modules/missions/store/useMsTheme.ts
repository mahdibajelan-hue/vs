import { useAppTheme } from '../platform'

/** The missions skin follows the app-wide light/dark switch (the one in the shared header). Same call shape as before. */
export function useMsTheme<T>(select: (s: { dark: boolean; toggle: () => void }) => T): T {
  const { dark, toggle } = useAppTheme()
  return select({ dark, toggle })
}
