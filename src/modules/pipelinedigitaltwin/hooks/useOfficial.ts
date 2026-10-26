import { useEffect, useState } from 'react'
import { loadProjectMetrics, type ProjectSnapshot } from '../../projectMetrics/projectMetricsLoader'
import { loadLandLayer, type LandLayerSpan } from '../../landacq/integration/layer'
import { loadPssrLayer, type PssrLayerSpan } from '../../pssr/integration/layer'
import { openNcrCount } from '../repo'

/** land statuses that still stand in the way of construction */
const BLOCKING = new Set(['acquiring', 'risk', 'critical', 'review'])

export interface Official {
  loading: boolean
  /** the project snapshot every dashboard uses (lifecycle, EPC, EVM, health) — same numbers as the radar */
  metrics: ProjectSnapshot | null
  /** open NCRs of the execution module (the official count) */
  ncrOpen: number | null
  /** km of route whose land is not yet free, from the land module */
  landBlockedKm: number | null
  land: LandLayerSpan[] | null
  /** PSSR systems on the route; km under gas = stretches whose system is «live» */
  pssr: PssrLayerSpan[] | null
  kmUnderGas: number
}

const EMPTY: Official = { loading: true, metrics: null, ncrOpen: null, landBlockedKm: null, land: null, pssr: null, kmUnderGas: 0 }

/**
 * The figures other modules own, read for the twin so it never shows its own version of them: construction progress
 * (execution module), NCRs, land release, commissioning. Each source fails on its own without blanking the rest.
 */
export function useOfficial(projectId: string | null): Official {
  const [o, setO] = useState<Official>(EMPTY)
  useEffect(() => {
    if (!projectId) { setO({ ...EMPTY, loading: false }); return }
    let alive = true
    setO(EMPTY)
    const safe = <T,>(p: Promise<T>) => p.catch(() => null)
    void Promise.all([safe(loadProjectMetrics(projectId)), safe(openNcrCount(projectId)), safe(loadLandLayer(projectId)), safe(loadPssrLayer(projectId))]).then(([metrics, ncrOpen, land, pssr]) => {
      if (!alive) return
      const landBlockedKm = land ? land.filter((s) => BLOCKING.has(s.status)).reduce((n, s) => n + (s.endMeters - s.startMeters) / 1000, 0) : null
      const spans = pssr?.spans ?? null
      const kmUnderGas = (spans ?? []).filter((s) => s.stage === 'live' && !s.isStation).reduce((n, s) => n + (s.endMeters - s.startMeters) / 1000, 0)
      setO({ loading: false, metrics, ncrOpen, landBlockedKm, land, pssr: spans, kmUnderGas })
    })
    return () => { alive = false }
  }, [projectId])
  return o
}
