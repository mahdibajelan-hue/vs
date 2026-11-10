import { useProjectContextStore } from '../store/useProjectContextStore'
import { PROJECT_SCOPED_MODULES, useModuleStore } from '../store/useModuleStore'

/**
 * Project-scoped loading for module stores.
 *
 * A module store keeps one flat list per table and every calculation filters it by project. Reading the whole table
 * grows with every project in the system; inside a project only that project's rows are needed. A store that adopts
 * this reads `scope` rows: the open project (from the project context) unless a caller asks for 'all'
 * (portfolio pages, reports across projects). Rows of other projects already in memory are kept, so going back to a
 * project that was opened before shows it at once while it refreshes.
 */

import type { Scope } from './projectScopePure'
export * from './projectScopePure'

export type ScopeRequest = string | 'all' | undefined

/**
 * The project the person is inside right now: a project module opened from the radar, or the radar of a project.
 * Elsewhere (hub, portfolio, organisation reports) it is null, even though the last project stays remembered.
 */
export function insideProject(): string | null {
  const pid = useProjectContextStore.getState().projectId ?? null
  if (!pid) return null
  const m = useModuleStore.getState()
  if (m.activeModule) return m.workspace === 'project' && PROJECT_SCOPED_MODULES.has(m.activeModule) ? pid : null
  return m.radarOpen ? pid : null
}

/** undefined → the project the person is inside, if any; 'all' → every project; an id → that project */
export function resolveScope(req: ScopeRequest): Scope {
  if (req === 'all') return null
  if (req) return req
  return insideProject()
}

/** calls `fn` whenever the project the person is inside changes (another project, or leaving for the hub/portfolio) */
export function onScopeChange(fn: (scope: Scope) => void) {
  let last = insideProject()
  const check = () => { const now = insideProject(); if (now !== last) { last = now; fn(now) } }
  const a = useProjectContextStore.subscribe(check), b = useModuleStore.subscribe(check)
  return () => { a(); b() }
}
