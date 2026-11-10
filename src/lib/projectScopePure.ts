/** Pure helpers of lib/projectScope (no store imports, so they can be tested on their own). */

/** null = every project */
export type Scope = string | null

/** which projects a store already holds: every project, or a set of them */
export interface Coverage { all: boolean; projects: ReadonlySet<string> }
export const EMPTY_COVERAGE: Coverage = { all: false, projects: new Set() }
export const covers = (c: Coverage, scope: Scope) => c.all || (scope != null && c.projects.has(scope))
export const addCoverage = (c: Coverage, scope: Scope): Coverage => (scope == null ? { all: true, projects: new Set() } : c.all ? c : { all: false, projects: new Set([...c.projects, scope]) })

/**
 * a child table filtered through its parent's project column, in the same request: add the parent embed to `select`
 * and filter on `__p.<column>`. The extra nested `__p` field is ignored by the row mappers.
 */
export const viaParent = (select: string, parent: string, fk: string, column: string, scope: Scope) =>
  scope ? `${select}, __p:${parent}!${fk}!inner(${column})` : select

/** replace one project's rows (or all rows when scope is null) with freshly read ones */
export function mergeRows<T>(old: T[], fresh: T[], scope: Scope, projectOf: (r: T) => string | null | undefined): T[] {
  if (scope == null) return fresh
  return [...old.filter((r) => projectOf(r) !== scope), ...fresh]
}


// ── table specs: how a table reaches its project ────────────────────────────────────────────────────────────
/** chain of parents from a child table up to the row that holds the project column: [parentTable, foreignKeyName] */
export type ParentPath = [string, string][]
export interface TableScope { col: string; path?: ParentPath }

/**
 * The select and filter key that limit a table to one project in the same request: its own column, or through its
 * parents with nested inner embeds (`__p:parent!fk!inner(__p:grand!fk!inner(col))`, filtered on `__p.__p.col`).
 */
export function scopedSelect(sel: string, ts: TableScope | undefined, sc: Scope): { select: string; key: string | null } {
  if (!sc || !ts) return { select: sel, key: null }
  if (!ts.path?.length) return { select: sel, key: ts.col }
  let inner = ts.col
  for (let i = ts.path.length - 1; i >= 0; i--) inner = `__p:${ts.path[i][0]}!${ts.path[i][1]}!inner(${inner})`
  return { select: `${sel}, ${inner}`, key: `${'__p.'.repeat(ts.path.length)}${ts.col}` }
}

/**
 * Fold a store patch read for one project into the store. A row belongs to the project by its own projectId /
 * masterProjectId, or through its parent list (`children[key] = [field, parentKey]`, any depth). Each patched list keeps
 * the other projects' rows and takes the fresh rows for this one; lists with no project link (shared lookups) are
 * replaced whole. With no scope (every project read) the patch is used as it is.
 */
export function mergePatch<S extends object>(cur: S, patch: Partial<S>, sc: Scope, children: Record<string, [string, string]> = {}): Partial<S> {
  if (!sc) return patch
  type R = Record<string, unknown>
  const list = (k: string) => [...(((cur as R)[k] as R[] | undefined) ?? []), ...(((patch as R)[k] as R[] | undefined) ?? [])]
  const memo = new Map<string, Set<string>>()
  const rule = (k: string, r: R | undefined): 'own' | 'child' | 'none' => (r && ('projectId' in r || 'masterProjectId' in r) ? 'own' : children[k] ? 'child' : 'none')
  const owned = (k: string, r: R): boolean => {
    if ('projectId' in r || 'masterProjectId' in r) return (r.projectId ?? r.masterProjectId) === sc
    const c = children[k]; return c ? idsOf(c[1]).has(r[c[0]] as string) : false
  }
  function idsOf(k: string): Set<string> {
    const hit = memo.get(k); if (hit) return hit
    const s = new Set<string>(); memo.set(k, s)
    for (const r of list(k)) if (owned(k, r)) s.add(r.id as string)
    return s
  }
  const out: R = {}
  for (const [k, v] of Object.entries(patch as R)) {
    const old = (cur as R)[k]
    if (!Array.isArray(v) || !Array.isArray(old)) { out[k] = v; continue }
    const fresh = v as R[], prev = old as R[]
    if (rule(k, fresh[0] ?? prev[0]) === 'none') { out[k] = v; continue }
    out[k] = [...prev.filter((r) => !owned(k, r)), ...fresh]
  }
  return out as Partial<S>
}
