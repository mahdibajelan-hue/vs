import { supabase } from '../../../lib/supabaseClient'
import { HT_FAILED_COLOR, HT_STAGE_COLOR, HT_STAGE_FA, HT_STAGES, type HtStage } from '../lib/htCore'

/** One hydrotest section of the line as a route span (km from the project's chainage origin, ×1000). */
export interface HydroLayerSpan { startMeters: number; endMeters: number; color: string; stage: HtStage; failed: boolean; code: string }

const SECTION_BREAK_M = 200
const PLANNED_ALT = '#94a3b8'
/** the line between sections (test heads / tie-in welds) */
export const HYDRO_GAP_COLOR = '#0b1220'

export const HYDRO_LAYER_LEGEND = [
  ...HT_STAGES.map((s) => ({ key: s as string, color: HT_STAGE_COLOR[s], label: HT_STAGE_FA[s] })),
  { key: 'failed', color: HT_FAILED_COLOR, label: 'مردود' },
]

/** The saved sectioning of the line, each section coloured by its test stage (red when it failed). null = no plan saved. */
export async function loadHydroLayer(masterProjectId: string): Promise<HydroLayerSpan[] | null> {
  const { data, error } = await supabase.from('ht_sections').select('code, km_from, km_to, stage, failed').eq('master_project_id', masterProjectId).order('seq')
  if (error) throw error
  if (!data?.length) return null
  // each section is drawn as its own piece: a short break at its downstream end, and planned neighbours in two shades
  return data.map((r, i) => {
    const a = Number(r.km_from) * 1000, b = Number(r.km_to) * 1000
    const stage = r.stage as HtStage
    return {
      startMeters: a, endMeters: b - Math.min(SECTION_BREAK_M, (b - a) * 0.1), code: String(r.code), stage, failed: !!r.failed,
      color: r.failed ? HT_FAILED_COLOR : stage === 'planned' && i % 2 ? PLANNED_ALT : HT_STAGE_COLOR[stage],
    }
  })
}
