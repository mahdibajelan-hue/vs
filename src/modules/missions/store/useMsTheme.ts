import { create } from 'zustand'

const KEY = 'ms-theme'

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'dark'
  } catch {
    return false
  }
}

/** Light/dark skin of the missions module (independent of the app-wide theme). Remembered per browser. */
export const useMsTheme = create<{ dark: boolean; toggle: () => void }>((set, get) => ({
  dark: read(),
  toggle: () => {
    const dark = !get().dark
    try {
      localStorage.setItem(KEY, dark ? 'dark' : 'light')
    } catch {
      /* private mode: the choice just isn't remembered */
    }
    set({ dark })
  },
}))
