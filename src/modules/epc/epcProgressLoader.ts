import { useExecutionStore } from '../execution/store/useExecutionStore'
import { useEpcStore } from '../execution/store/useEpcStore'
import { useMaterialStore } from '../material/store/useMaterialStore'
import { useMaterialControlStore } from '../material/store/useMaterialControlStore'
import { executionCore } from '../execution/lib/executionCore'
import { engCore } from '../execution/lib/engCore'
import { materialCore } from '../material/lib/control/materialCore'
import { combineEpc, EQUAL_EPC_WEIGHTS, weightsFromReport, type EpcProgress, type EpcWeights } from './epcProgress'

let loading: Promise<void> | null = null
/** Loads the engineering / material / execution stores once (they hold every project the user may read). */
export function ensureEpcStores(): Promise<void> {
  const ex = useExecutionStore.getState(), epc = useEpcStore.getState(), ms = useMaterialStore.getState(), cs = useMaterialControlStore.getState()
  if (ex.coreLoaded && epc.loaded && ms.loaded && cs.loaded) return Promise.resolve()
  loading ??= Promise.all([
    ex.coreLoaded ? null : ex.fetchAll({ lite: true }),
    epc.loaded ? null : epc.fetchAll(),
    ms.loaded ? null : ms.fetchAll(),
    cs.loaded ? null : cs.fetchAll(),
  ]).then(() => undefined, () => undefined).finally(() => { loading = null })
  return loading
}

/**
 * Each discipline's value in rial, from its own module: engineering = the documents' prices, procurement = the package
 * items' value (qty × unit price × rate), construction = the approved activities' contract quantity × unit price.
 * These are the E/P/C weights — a pipeline's engineering is a sliver of its value, procurement most of it.
 */
export function epcValuesOf(projectId: string, today = new Date().toISOString().slice(0, 10)): EpcWeights {
  const ex = useExecutionStore.getState(), epc = useEpcStore.getState(), ms = useMaterialStore.getState(), cs = useMaterialControlStore.getState()
  const e = epc.engDocs.filter((d) => d.projectId === projectId && d.status !== 'superseded').reduce((s, d) => s + (d.price || 0), 0)
  const p = materialCore(ms, cs, projectId, today).progress.value
  const exe = executionCore(ex, epc, projectId, today)
  const c = exe.approved.rows.reduce((s, r) => s + r.base.baseQty * (r.base.unitPrice || 0), 0)
  return { e, p, c }
}

const weightCache = new Map<string, { w: EpcWeights; source: 'value' | 'report' | 'equal'; values: EpcWeights }>()
/** The weights a project's EPC progress uses: the modules' values when every discipline that has data also has a value;
 * otherwise the client report's E/P/C weights; otherwise equal shares. Fixed for the session so curves stay comparable. */
export function epcWeightsOf(projectId: string, fallback?: EpcWeights | null): { w: EpcWeights; source: 'value' | 'report' | 'equal'; values: EpcWeights } {
  const hit = weightCache.get(projectId)
  if (hit) return hit
  const today = new Date().toISOString().slice(0, 10)
  const ex = useExecutionStore.getState(), epc = useEpcStore.getState(), ms = useMaterialStore.getState(), cs = useMaterialControlStore.getState()
  const has = { e: epc.engDocs.some((d) => d.projectId === projectId), p: materialCore(ms, cs, projectId, today).items.length > 0, c: ex.activities.some((a) => a.projectId === projectId) }
  const values = epcValuesOf(projectId, today)
  const ok = (has.e || has.p || has.c) && (!has.e || values.e > 0) && (!has.p || values.p > 0) && (!has.c || values.c > 0)
  const out = ok ? { w: values, source: 'value' as const, values }
    : fallback && fallback !== EQUAL_EPC_WEIGHTS ? { w: fallback, source: 'report' as const, values }
    : { w: EQUAL_EPC_WEIGHTS, source: 'equal' as const, values }
  if (ex.coreLoaded && epc.loaded && ms.loaded && cs.loaded) weightCache.set(projectId, out)
  return out
}

/** One project's EPC progress from the modules' own computations (percentages), weighted by the disciplines' values
 * (see epcWeightsOf; `fallback` = the client report's weights when values are missing). Call after ensureEpcStores. */
export function epcProgressOf(projectId: string, fallback?: EpcWeights | null, today = new Date().toISOString().slice(0, 10)): EpcProgress {
  const ex = useExecutionStore.getState(), epc = useEpcStore.getState(), ms = useMaterialStore.getState(), cs = useMaterialControlStore.getState()
  const eng = engCore(epc.engDocs, projectId, today)
  const mat = materialCore(ms, cs, projectId, today)
  const exe = executionCore(ex, epc, projectId, today)
  const pct = (v: number) => Math.round(v * 1000) / 10
  const ws = epcWeightsOf(projectId, fallback)
  return { ...combineEpc({
    eng: eng.progress.docs > 0 ? { actual: pct(eng.progress.actualScore), planned: pct(eng.progress.plannedScore) } : null,
    proc: mat.items.length > 0 ? { actual: pct(mat.progress.actual), planned: pct(mat.progress.planned) } : null,
    cons: exe.activities.length > 0 ? { actual: pct(exe.approved.overall), planned: exe.planned.overall == null ? null : pct(exe.planned.overall) } : null,
  }, ws.w), weightSource: ws.source, values: ws.values }
}

/** Loads the modules if needed, then one project's EPC progress weighted by its Stage-Gate client report (equal otherwise). */
export async function loadEpcProgress(projectId: string, clientReport?: Record<string, unknown> | null): Promise<EpcProgress> {
  await ensureEpcStores()
  return epcProgressOf(projectId, weightsFromReport(clientReport))
}

/** The EPC phase's planned window, from the modules' own plans: engineering documents' planned milestones, material
 * stages' planned dates and execution activities' planned start / end. null when no module has dates. */
export function epcWindowOf(projectId: string): { start: string; finish: string } | null {
  const ex = useExecutionStore.getState(), epc = useEpcStore.getState(), ms = useMaterialStore.getState(), cs = useMaterialControlStore.getState()
  const dates: string[] = []
  for (const d of epc.engDocs) if (d.projectId === projectId) for (const v of [d.plannedPrepared, d.plannedApproved]) if (v) dates.push(v.slice(0, 10))
  const mat = materialCore(ms, cs, projectId)
  for (const s of mat.stages) if (s.plannedDate) dates.push(s.plannedDate.slice(0, 10))
  for (const a of ex.activities) if (a.projectId === projectId) for (const v of [a.plannedStart, a.plannedEnd]) if (v) dates.push(v.slice(0, 10))
  if (!dates.length) return null
  dates.sort()
  return { start: dates[0], finish: dates[dates.length - 1] }
}
