import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { useLandStore } from '../store/useLandStore'
import type { AcqRoute, StageKey } from '../types'
import { ART9_ORDER, REGULAR_ORDER, STAGE_DAYS } from '../lib/workflow'
import { ROUTE_LABEL, STAGE_LABEL } from '../lib/labels'
import { faNum } from '../lib/fa'

type Table = Partial<Record<AcqRoute, Partial<Record<StageKey, number>>>>

/**
 * The days each step is given, per acquisition route. Whatever is not changed uses the typical value; changed values show in colour
 * and feed every estimate: remaining time, start-by dates, and the generated release plan.
 */
export function StepDaysEditor() {
  const route = useLandStore((s) => s.data?.route)
  const saveRoute = useLandStore((s) => s.saveRoute)
  const table: Table = useMemo(() => route?.settings.stepDays ?? {}, [route?.settings.stepDays])
  if (!route) return null
  const eff = (r: AcqRoute, k: StageKey) => table[r]?.[k] ?? STAGE_DAYS[r][k]
  const save = (next: Table) => void saveRoute({ ...route, settings: { ...route.settings, stepDays: next } })
  const set = (r: AcqRoute, k: StageKey, v: number) => {
    const cur = { ...(table[r] ?? {}) }
    if (!Number.isFinite(v) || v < 0 || v === STAGE_DAYS[r][k]) delete cur[k]
    else cur[k] = Math.round(v)
    if (cur[k] === table[r]?.[k] && (k in cur) === (k in (table[r] ?? {}))) return
    save({ ...table, [r]: cur })
  }
  const changed = (['normal', 'dispute', 'art9'] as AcqRoute[]).reduce((n, r) => n + Object.keys(table[r] ?? {}).length, 0)
  const sum = (r: AcqRoute, keys: StageKey[]) => keys.reduce((n, k) => n + eff(r, k), 0)
  const cell = (r: AcqRoute, k: StageKey) => (
    <td className="px-1.5 py-1">
      <input className="la-input la-num" style={{ minHeight: 32, width: 78, textAlign: 'center', borderColor: table[r]?.[k] != null ? 'var(--la-accent)' : undefined, background: table[r]?.[k] != null ? 'var(--la-accent-soft)' : undefined }} type="number" min={0} defaultValue={eff(r, k)} key={`${r}${k}${eff(r, k)}`} aria-label={`${STAGE_LABEL[k]} — ${ROUTE_LABEL[r]}`} onBlur={(e) => set(r, k, Number(e.target.value))} />
    </td>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--la-muted)' }}><th className="px-1.5 py-1.5 text-right font-semibold">مرحلهٔ تحصیل عادی / اختلاف</th><th className="px-1.5 text-center font-semibold">{ROUTE_LABEL.normal.split(' (')[0]}</th><th className="px-1.5 text-center font-semibold">اختلاف</th></tr></thead>
            <tbody>
              {REGULAR_ORDER.map((k) => <tr key={k} style={{ borderTop: '1px solid var(--la-line)' }}><td className="px-1.5 py-1 leading-5">{STAGE_LABEL[k]}</td>{cell('normal', k)}{cell('dispute', k)}</tr>)}
              <tr style={{ borderTop: '2px solid var(--la-line-2)' }}><td className="px-1.5 py-1.5 font-bold">جمع (روز)</td><td className="la-num text-center font-bold">{faNum(sum('normal', REGULAR_ORDER))}</td><td className="la-num text-center font-bold">{faNum(sum('dispute', REGULAR_ORDER))}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--la-muted)' }}><th className="px-1.5 py-1.5 text-right font-semibold">مراحل ماده ۹</th><th className="px-1.5 text-center font-semibold">روز</th></tr></thead>
            <tbody>
              {ART9_ORDER.map((k) => <tr key={k} style={{ borderTop: '1px solid var(--la-line)' }}><td className="px-1.5 py-1 leading-5">{STAGE_LABEL[k]}</td>{cell('art9', k)}</tr>)}
              <tr style={{ borderTop: '2px solid var(--la-line-2)' }}><td className="px-1.5 py-1.5 font-bold">تا تصرف (مقدمات + امضا + جاری‌سازی)</td><td className="la-num text-center font-bold">{faNum(sum('art9', ART9_ORDER.slice(0, 3)))}</td></tr>
            </tbody>
          </table>
          <p className="la-eyebrow mt-2 leading-6">مهلت پرداخت ۳ ماه ماده ۹ قانونی است؛ اگر لازم نیست تغییرش ندهید.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="la-eyebrow m-0">{changed ? `${faNum(changed)} مدت با مقدار متعارف فرق دارد (رنگی).` : 'همهٔ مدت‌ها مقدار متعارف است.'} هر قطعه به‌اندازهٔ پیچیدگی‌اش (۰٫۹ تا ۱٫۳ برابر) این مدت‌ها را می‌گیرد.</p>
        <button className="la-btn la-btn-sm" disabled={!changed} onClick={() => save({})}><RotateCcw size={13} /> بازگشت به مقدار متعارف</button>
      </div>
    </div>
  )
}
