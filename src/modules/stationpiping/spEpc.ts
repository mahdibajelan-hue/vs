import { loadForEpc, type SpSettings, type StationRec } from './repo'
import { useSpStore } from './store/useSpStore'
import { stationProgress, stationsConstruction, weldStats, type Item, type Log, type Weld } from './lib/spCore'

/**
 * The stations' part of the project's EPC construction progress. Every project's stations are loaded once (like the
 * engineering / material / execution stores the EPC progress reads) and kept in step with the station module's store, so
 * a weld or a day's quantity recorded there moves the EPC figure, the radar and the dashboards straight away.
 */
type Data = { stations: StationRec[]; items: Item[]; logs: Log[]; welds: Weld[]; settings: SpSettings }
let cache: Map<string, Data> | null = null
let loading: Promise<void> | null = null
let version = 0
const listeners = new Set<() => void>()

export function ensureSpEpc(): Promise<void> {
  if (cache) return Promise.resolve()
  loading ??= loadForEpc().then((m) => { cache = m; version++; listeners.forEach((f) => f()) }, () => { cache = new Map() }).finally(() => { loading = null })
  return loading
}

// the module's own store is the freshest copy of its project
useSpStore.subscribe((s, prev) => {
  if (!s.projectId || s.loading || s.error) return
  if (s.stations === prev.stations && s.items === prev.items && s.logs === prev.logs && s.welds === prev.welds && s.settings === prev.settings) return
  cache ??= new Map()
  cache.set(s.projectId, { stations: s.stations, items: s.items, logs: s.logs, welds: s.welds, settings: s.settings })
  version++; listeners.forEach((f) => f())
})

/** changes whenever a project's station data changes (for hooks that recompute the EPC progress) */
export const spEpcVersion = () => version
export function onSpEpcChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f) } }

/** the stations as construction progress at a date, with their share of C; null when the project has no station scope or leaves them out */
export function spConstructionOf(projectId: string, asOf: string): { actual: number; planned: number | null; share: number } | null {
  const d = cache?.get(projectId)
  if (!d || !d.settings.inEpc || d.settings.consShare <= 0) return null
  const c = stationsConstruction(d.stations, d.items, d.logs, d.welds, asOf)
  return c ? { ...c, share: d.settings.consShare } : null
}

/** the stations' planned dates, for the EPC phase's window */
export function spDatesOf(projectId: string): string[] {
  const d = cache?.get(projectId)
  if (!d || !d.settings.inEpc) return []
  return [...d.stations.flatMap((s) => [s.plannedStart, s.plannedFinish]), ...d.items.flatMap((i) => [i.plannedStart, i.plannedFinish])].filter((x): x is string => !!x).map((x) => x.slice(0, 10))
}

/** each station's progress today and the project's weld repair rate, for the radar's signals */
export async function spRadarOf(projectId: string, asOf: string) {
  await ensureSpEpc()
  const d = cache?.get(projectId)
  if (!d || !d.stations.length) return null
  const ps = d.stations.map((st) => stationProgress(st, d.items.filter((i) => i.stationId === st.id), d.logs.filter((l) => l.stationId === st.id), d.welds.filter((w) => w.stationId === st.id), asOf))
  return { stations: ps.filter((p) => p.disciplines.some((x) => x.hasScope)), welds: weldStats(d.welds, asOf) }
}
