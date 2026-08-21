import { useEffect, useState } from 'react'
import { fetchScopedDecisionsActions, fetchScopedIntelligence, type IntelligenceScope, type ProjectIntelligenceBundle } from './dataAdapter'
import type { Decision, RastaAction } from '../types'

// Session-scoped: the "previous" state What-Changed/Early-Warning widgets compare against is
// simply the last time this browser tab loaded that scope's live data — not a persisted history
// table. Once a report is generated its payload is frozen into rasta_report_snapshots regardless,
// so this only affects the *live* dashboard's diff, not the permanent record.
const lastBundleCache = new Map<string, ProjectIntelligenceBundle>()

function scopeCacheKey(scope: IntelligenceScope): string {
  return `${scope.type}:${scope.id}`
}

export function useScopedIntelligence(scope: IntelligenceScope | null) {
  const [bundle, setBundle] = useState<ProjectIntelligenceBundle | null>(null)
  const [previousBundle, setPreviousBundle] = useState<ProjectIntelligenceBundle | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!scope) {
      setBundle(null)
      setPreviousBundle(null)
      return
    }
    let cancelled = false
    const key = scopeCacheKey(scope)
    setLoading(true)
    setPreviousBundle(lastBundleCache.get(key) ?? null)
    fetchScopedIntelligence(scope).then((b) => {
      if (cancelled) return
      setBundle(b)
      setLoading(false)
      lastBundleCache.set(key, b)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.type, scope?.id])

  return { bundle, previousBundle, loading }
}

/** Back-compat wrapper — every existing project-scoped caller (Dashboard, Report Builder) keeps working unchanged. */
export function useProjectIntelligence(masterProjectId: string | null) {
  return useScopedIntelligence(masterProjectId ? { type: 'project', id: masterProjectId } : null)
}

/** Decisions/actions across a Portfolio/Program/Project scope — same scope shape as useScopedIntelligence, kept separate since it hits different tables and doesn't need the What-Changed diff cache. */
export function useScopedDecisionsActions(scope: IntelligenceScope | null) {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [actions, setActions] = useState<RastaAction[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!scope) {
      setDecisions([])
      setActions([])
      return
    }
    let cancelled = false
    setLoading(true)
    fetchScopedDecisionsActions(scope).then(({ decisions, actions }) => {
      if (cancelled) return
      setDecisions(decisions)
      setActions(actions)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.type, scope?.id])

  return { decisions, actions, loading }
}
