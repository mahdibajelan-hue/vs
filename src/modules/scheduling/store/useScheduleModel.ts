import { useEffect, useMemo } from 'react'
import { buildLiveModel } from '../lib/model'
import { useLinkSources } from './useLinkSources'
import { useSchedulingStore, type VersionBundle } from './useSchedulingStore'
import type { SchVersion } from '../lib/types'

const todayIso = () => new Date().toISOString().slice(0, 10)

/** One project's schedule with every derived figure — computed once from the stored versions and the facts read from the other modules; nothing derived is stored. */
export function useScheduleModel(projectId: string, opts: { live?: boolean; baselineId?: string | null; progressMode?: 'retained' | 'override' } = {}) {
  const st = useSchedulingStore()
  const { sources, ready } = useLinkSources(projectId)
  useEffect(() => { if (st.projectId !== projectId) void st.load(projectId) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const baselineV: SchVersion | undefined = (opts.baselineId ? st.versions.find((v) => v.id === opts.baselineId && v.status !== 'draft') : undefined) ?? st.versions.find((v) => v.isBaseline)
  const currentV: SchVersion | undefined = st.versions.find((v) => v.isCurrent) ?? [...st.versions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  useEffect(() => { if (baselineV) void st.loadBundle(baselineV.id) }, [baselineV?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (currentV) void st.loadBundle(currentV.id) }, [currentV?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const base: VersionBundle | null = baselineV ? st.bundles.get(baselineV.id) ?? null : null
  const cur: VersionBundle | null = currentV ? st.bundles.get(currentV.id) ?? null : null

  return useMemo(() => {
    const today = todayIso()
    if (!currentV || !cur) return { st, ready, today, baselineV, currentV, base, cur, empty: true as const }
    return { st, ready, empty: false as const, ...buildLiveModel({ projectId, today, currentV, baselineV, cur, base, links: st.links, sources, live: !!opts.live, progressMode: opts.progressMode }) }
  }, [st, ready, sources, currentV, baselineV, cur, base, projectId, opts.live, opts.progressMode])
}
export type ScheduleModel = ReturnType<typeof useScheduleModel>
export type LiveModel = Extract<ScheduleModel, { empty: false }>
