import { createSupabaseRepo } from '../repo/supabaseRepo'
import { analyze } from '../lib/kpis'
import { DEFAULT_SETTINGS } from '../types'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, type DisplayStatus } from '../lib/status'
import { todayIso } from '../lib/dates'

/** One coloured stretch of route, in metres from the route start — what a 3D / map viewer needs to paint the Land Acquisition Layer. */
export interface LandLayerSpan {
  startMeters: number
  endMeters: number
  color: string
  status: DisplayStatus
  label: string
  code: string
}

export const LAND_LAYER_LEGEND = STATUS_ORDER.map((s) => ({ status: s, color: STATUS_COLOR[s], label: STATUS_LABEL[s] }))

/** Land status of every parcel of a master project, expressed as route spans (null when the project has no land route yet). */
export async function loadLandLayer(masterProjectId: string): Promise<LandLayerSpan[] | null> {
  const data = await createSupabaseRepo().load(masterProjectId)
  if (!data.route || data.parcels.length === 0) return null
  const settings = { ...DEFAULT_SETTINGS, ...data.route.settings }
  const startKm = data.route.startKm
  return analyze(data.parcels, data.activities, todayIso(), settings).map((r) => ({
    startMeters: Math.max(0, (r.parcel.kmStart - startKm) * 1000),
    endMeters: Math.max(0, (r.parcel.kmEnd - startKm) * 1000),
    color: STATUS_COLOR[r.status],
    status: r.status,
    label: STATUS_LABEL[r.status],
    code: r.parcel.code,
  }))
}
