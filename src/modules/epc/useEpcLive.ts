import { useEffect, useState } from 'react'
import { useExecutionStore } from '../execution/store/useExecutionStore'
import { useEpcStore } from '../execution/store/useEpcStore'
import { useMaterialStore } from '../material/store/useMaterialStore'
import { useMaterialControlStore } from '../material/store/useMaterialControlStore'
import { engCore } from '../execution/lib/engCore'
import { engRulesOf, forecastEngCurve } from '../execution/lib/engine/engineering'
import { loadLifecycleInputs } from '../projectMetrics/lifecycleInputs'
import { ensureEpcStores, epcProgressOf, epcWindowOf } from './epcProgressLoader'
import { weightsFromReport, type EpcProgress } from './epcProgress'
import { combineForecasts, epcCurves, esForecast, forecastFromPoints, type Curves, type DiscKey, type Forecast } from './epcCurves'
import { todayTehran } from '../../lib/today'
import { onSpEpcChange, spEpcVersion } from '../stationpiping/spEpc'

export interface EpcLive {
  today: string
  /** the EPC contract's progress today — the same call (and weights) as the radar, the project dashboard, the health centre and the reports */
  now: EpcProgress
  window: { start: string; finish: string } | null
  curves: Curves | null
  forecasts: Record<DiscKey, Forecast | { reason: string } | null>
}

/** The EPC progress of one master project, its E / P / C / total S-curves and their forecasts, kept live with the stores. */
export function useEpcLive(projectId: string | null): EpcLive | null | 'loading' {
  const [out, setOut] = useState<EpcLive | null | 'loading'>('loading')
  // recompute when any module's data changes
  const v1 = useEpcStore((s) => s.engDocs), v2 = useExecutionStore((s) => s.lines), v3 = useMaterialControlStore((s) => s.stages), v4 = useMaterialStore((s) => s.poLines), v5 = useExecutionStore((s) => s.settingsByProject)
  const [v6, setV6] = useState(spEpcVersion())
  useEffect(() => onSpEpcChange(() => setV6(spEpcVersion())), [])
  useEffect(() => {
    if (!projectId) { setOut(null); return }
    let live = true
    void (async () => {
      const [lc] = await Promise.all([loadLifecycleInputs(projectId).catch(() => null), ensureEpcStores(projectId)])
      if (!live) return
      // the same weights as the project dashboard: module values, else the client report's E/P/C weights, else equal
      const w = weightsFromReport(lc?.clientReport)
      const today = todayTehran()
      const at = (t: string) => epcProgressOf(projectId, w, t)
      const now = at(today)
      const window = epcWindowOf(projectId)
      const curves = epcCurves(at, window, today)
      const forecasts: EpcLive['forecasts'] = { eng: null, proc: null, cons: null, total: null }
      if (curves?.eng) {
        // engineering: the engineering module's own forecast (submission rate + approval turnaround)
        const ex = useExecutionStore.getState()
        const docs = engCore(useEpcStore.getState().engDocs, projectId, today, ex.settings(projectId)).docs
        const fc = forecastEngCurve(docs, today, engRulesOf(ex.settings(projectId)))
        forecasts.eng = 'reason' in fc ? fc : forecastFromPoints(fc.points.map((p) => ({ date: p.date, value: p.value * 100 })), fc.endDate, fc.plannedEnd, ['همان پیش‌بینی ماژول پیشرفت مهندسی: ' + fc.basis.join('؛ ')])
      }
      if (curves?.proc) forecasts.proc = esForecast(curves.proc, today)
      if (curves?.cons) forecasts.cons = esForecast(curves.cons, today)
      if (curves?.total) {
        const parts = ([['eng', 'مهندسی', now.weights.e], ['proc', 'تأمین کالا', now.weights.p], ['cons', 'اجرا', now.weights.c]] as const)
          .flatMap(([k, label, wt]) => { const f = forecasts[k]; return f && !('reason' in f) && now[k] ? [{ f, w: wt, label }] : [] })
        const missing = ([['eng', 'مهندسی'], ['proc', 'تأمین کالا'], ['cons', 'اجرا']] as const).filter(([k]) => now[k] && (!forecasts[k] || 'reason' in (forecasts[k] as object))).map(([, l]) => l)
        const tp = curves.total.filter((c) => c.planned != null)
        const max = Math.max(0, ...tp.map((c) => c.planned as number))
        const plannedEnd = tp.find((c) => (c.planned as number) >= max - 0.05)?.date ?? null
        forecasts.total = missing.length ? { reason: `برای ${missing.join(' و ')} پیش‌بینی ممکن نیست؛ پیش‌بینی کل به همهٔ بخش‌ها نیاز دارد.` } : combineForecasts(parts, today, plannedEnd)
      }
      setOut({ today, now, window, curves, forecasts })
    })()
    return () => { live = false }
  }, [projectId, v1, v2, v3, v4, v5, v6])
  return out
}
