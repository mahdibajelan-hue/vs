import { createContext, useContext } from 'react'

export type View =
  | { kind: 'dashboard' }
  | { kind: 'list'; filter?: string }
  | { kind: 'form'; id?: string }
  | { kind: 'mission'; id: string }
  | { kind: 'interview'; id: string }
  | { kind: 'summary'; id: string }
  | { kind: 'report'; id: string }
  | { kind: 'findings' }
  | { kind: 'sets' }

export interface Nav {
  view: View
  go: (v: View) => void
}

export const NavContext = createContext<Nav>({ view: { kind: 'dashboard' }, go: () => undefined })
export const useNav = () => useContext(NavContext)
