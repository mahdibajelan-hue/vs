import { STAGE_COLOR, STAGE_FA, STAGE_ORDER, type PssrStage } from '../lib/pssrCore'
import { loadPssrSummary } from '../lib/pssrSummary'

/** One stretch of route painted by the commissioning stage of the PSSR system that covers it (metres from the route start). */
export interface PssrLayerSpan { startMeters: number; endMeters: number; color: string; stage: PssrStage; code: string; name: string; openA: number
  /** a point system (station) drawn as a short stretch: not route length (never counted as km under gas) */
  isStation: boolean }

export const PSSR_LAYER_LEGEND = STAGE_ORDER.map((s) => ({ stage: s, color: STAGE_COLOR[s], label: STAGE_FA[s] }))
/** a station has one chainage: it is drawn as a short stretch so it stays visible on a 100-km pipe */
const STATION_METERS = 400

/** The PSSR picture of a master project as route spans; systems without a chainage are listed in `unplaced`. null = no PSSR data. */
export async function loadPssrLayer(masterProjectId: string): Promise<{ spans: PssrLayerSpan[]; unplaced: string[] } | null> {
  const sum = await loadPssrSummary(masterProjectId)
  if (!sum) return null
  const spans: PssrLayerSpan[] = []
  const unplaced: string[] = []
  for (const x of sum.systems) {
    if (x.kmFrom == null) { unplaced.push(x.code); continue }
    const start = x.kmFrom * 1000
    const isStation = !(x.kmTo != null && x.kmTo > x.kmFrom)
    const end = isStation ? start + STATION_METERS : x.kmTo! * 1000
    spans.push({ startMeters: start, endMeters: end, color: STAGE_COLOR[x.status.stage], stage: x.status.stage, code: x.code, name: x.name, openA: x.status.punches.A.open, isStation })
  }
  // stations drawn after the pipeline stretches so a station inside a stretch shows on top of it
  spans.sort((a, b) => (b.endMeters - b.startMeters) - (a.endMeters - a.startMeters))
  return { spans, unplaced }
}
