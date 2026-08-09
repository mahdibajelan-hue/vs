import { useEffect, useState } from 'react'
import { fetchProjectIntelligence, type ProjectIntelligenceBundle } from './dataAdapter'

// Session-scoped: the "previous" state a project's What-Changed/Early-Warning widgets compare
// against is simply the last time this browser tab loaded that project's live data — not a
// persisted history table. Once a report is generated its payload is frozen into
// rasta_report_snapshots regardless, so this only affects the *live* dashboard's diff, not the
// permanent record.
const lastBundleCache = new Map<string, ProjectIntelligenceBundle>()

export function useProjectIntelligence(masterProjectId: string | null) {
  const [bundle, setBundle] = useState<ProjectIntelligenceBundle | null>(null)
  const [previousBundle, setPreviousBundle] = useState<ProjectIntelligenceBundle | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!masterProjectId) {
      setBundle(null)
      setPreviousBundle(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setPreviousBundle(lastBundleCache.get(masterProjectId) ?? null)
    fetchProjectIntelligence(masterProjectId).then((b) => {
      if (cancelled) return
      setBundle(b)
      setLoading(false)
      lastBundleCache.set(masterProjectId, b)
    })
    return () => {
      cancelled = true
    }
  }, [masterProjectId])

  return { bundle, previousBundle, loading }
}
