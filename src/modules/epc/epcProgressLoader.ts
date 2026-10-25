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

/** One project's EPC progress from the modules' own computations (percentages). Call after ensureEpcStores. */
export function epcProgressOf(projectId: string, weights: EpcWeights = EQUAL_EPC_WEIGHTS, today = new Date().toISOString().slice(0, 10)): EpcProgress {
  const ex = useExecutionStore.getState(), epc = useEpcStore.getState(), ms = useMaterialStore.getState(), cs = useMaterialControlStore.getState()
  const eng = engCore(epc.engDocs, projectId, today)
  const mat = materialCore(ms, cs, projectId, today)
  const exe = executionCore(ex, epc, projectId, today)
  const pct = (v: number) => Math.round(v * 1000) / 10
  return combineEpc({
    eng: eng.progress.docs > 0 ? { actual: pct(eng.progress.actualScore), planned: pct(eng.progress.plannedScore) } : null,
    proc: mat.items.length > 0 ? { actual: pct(mat.progress.actual), planned: pct(mat.progress.planned) } : null,
    cons: exe.activities.length > 0 ? { actual: pct(exe.approved.overall), planned: exe.planned.overall == null ? null : pct(exe.planned.overall) } : null,
  }, weights)
}

/** Loads the modules if needed, then one project's EPC progress weighted by its Stage-Gate client report (equal otherwise). */
export async function loadEpcProgress(projectId: string, clientReport?: Record<string, unknown> | null): Promise<EpcProgress> {
  await ensureEpcStores()
  return epcProgressOf(projectId, weightsFromReport(clientReport))
}
