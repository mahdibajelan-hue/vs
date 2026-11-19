/**
 * Project profile — what kind of facility a project builds, and therefore which execution model, QC rules and twin it uses.
 *
 *  - pipeline            خط لوله (valve stations, launchers and receivers along the line stay part of it)
 *  - compressor_station  ایستگاه تقویت فشار گاز (one site: shop spools, field piping, equipment, civil, E&I, commissioning)
 *  - hybrid              ترکیبی — both scopes side by side, with separate and total progress
 *
 * The project's free-text type from older records is read leniently, and anything unknown keeps the pipeline behaviour
 * the system always had.
 */
export type ProjectKind = 'pipeline' | 'compressor_station' | 'hybrid'
/** The execution scope a row (activity, daily report) belongs to. */
export type ExScope = 'pipeline' | 'station'
/** What the execution module shows: one scope, or the whole project (hybrid only). */
export type ScopeView = ExScope | 'all'

export const PROJECT_KINDS: ProjectKind[] = ['pipeline', 'compressor_station', 'hybrid']
export const PROJECT_KIND_FA: Record<ProjectKind, string> = {
  pipeline: 'خط لوله',
  compressor_station: 'ایستگاه تقویت فشار گاز',
  hybrid: 'ترکیبی (خط لوله + ایستگاه تقویت فشار)',
}
export const SCOPE_FA: Record<ExScope, string> = { pipeline: 'خط لوله', station: 'ایستگاه تقویت فشار' }
export const SCOPE_VIEW_FA: Record<ScopeView, string> = { ...SCOPE_FA, all: 'کل پروژه' }

const norm = (s: string) => s.replace(/[‌\s_-]+/g, ' ').trim().toLowerCase()

/** The stored type (a code or older free text) as a profile; null when it says nothing we recognise. */
export function parseProjectKind(t?: string | null): ProjectKind | null {
  if (!t) return null
  const s = norm(t)
  if (PROJECT_KINDS.includes(t as ProjectKind)) return t as ProjectKind
  const station = /تقویت فشار|کمپرسور|ایستگاه تقویت|compressor/.test(s)
  const line = /خط لوله|خطوط لوله|خط انتقال|pipeline/.test(s)
  if (/ترکیب|hybrid/.test(s) || (station && line)) return 'hybrid'
  if (station) return 'compressor_station'
  if (line) return 'pipeline'
  return null
}
/** The type as words for read-only views. */
export const projectKindLabel = (t: string | null | undefined) => { const k = parseProjectKind(t); return k ? PROJECT_KIND_FA[k] : t || '—' }
/** The profile in force: unknown or empty types keep the pipeline behaviour. */
export const projectKind = (t?: string | null): ProjectKind => parseProjectKind(t) ?? 'pipeline'

/** The scopes a profile has, in display order. */
export const kindScopes = (k: ProjectKind): ExScope[] => (k === 'hybrid' ? ['pipeline', 'station'] : k === 'compressor_station' ? ['station'] : ['pipeline'])
/** The scope an untagged row belongs to: rows written before scopes existed belong to the project's main scope. */
export const primaryScope = (k: ProjectKind): ExScope => (k === 'compressor_station' ? 'station' : 'pipeline')
export const rowScope = (s: string | null | undefined, k: ProjectKind): ExScope => (s === 'pipeline' || s === 'station' ? s : primaryScope(k))
/** The views offered: a single-scope project has exactly one; a hybrid one adds «کل پروژه». */
export const scopeViews = (k: ProjectKind): ScopeView[] => (k === 'hybrid' ? ['all', 'pipeline', 'station'] : kindScopes(k))
/** A remembered view that the profile no longer has falls back to its first one. */
export const fitView = (v: ScopeView | null | undefined, k: ProjectKind): ScopeView => (v && scopeViews(k).includes(v) ? v : scopeViews(k)[0])
/** Only a hybrid project filters by scope; a single-scope project shows every row, so changing its type never hides data. */
export const inView = (s: string | null | undefined, k: ProjectKind, v: ScopeView) => k !== 'hybrid' || v === 'all' || rowScope(s, k) === v
/**
 * The scope a new row is written with. Single-scope projects write none (the row follows the project's type); a hybrid
 * project writes the view's scope, or the pipeline when the view is «کل پروژه».
 */
export const writeScope = (k: ProjectKind, v: ScopeView): ExScope | null => (k !== 'hybrid' ? null : v === 'all' ? 'pipeline' : v)

/** Whether the project has a scope (decides which modules and tabs appear). */
export const hasScope = (k: ProjectKind, s: ExScope) => kindScopes(k).includes(s)

/** Words the screens use for a location, by scope: kilometre fronts on a line, areas/units on a station site. */
export function scopeTerms(s: ExScope | 'all') {
  return s === 'station'
    ? { front: 'ناحیه / واحد', fronts: 'ناحیه‌ها و واحدها', place: 'محل (ناحیه، واحد، تگ)', km: false }
    : { front: 'جبهه کاری', fronts: 'جبهه‌ها', place: 'محل / کیلومتر', km: true }
}
