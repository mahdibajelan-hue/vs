import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { useLandStore } from '../store/useLandStore'
import type { StageKey } from '../types'
import { ART9_PRE, REGULAR_ORDER, STAGE_WEIGHT } from '../lib/workflow'
import { STAGE_LABEL } from '../lib/labels'
import { faNum } from '../lib/fa'

type Table = Partial<Record<StageKey, number>>

/**
 * The share of each step in a parcel's progress (and so in the criticality discount and the KPIs). Only the ratios matter:
 * progress = weight of finished steps ÷ weight of the steps that apply to the parcel (Article 9 adds its 3 steps, stations add the title deed).
 */
export function StageWeightsEditor() {
  const route = useLandStore((s) => s.data?.route)
  const saveRoute = useLandStore((s) => s.saveRoute)
  const table: Table = useMemo(() => route?.settings.stageWeights ?? {}, [route?.settings.stageWeights])
  if (!route) return null
  const eff = (k: StageKey) => table[k] ?? STAGE_WEIGHT[k] ?? 0
  const save = (next: Table) => void saveRoute({ ...route, settings: { ...route.settings, stageWeights: next } })
  const set = (k: StageKey, v: number) => {
    const cur = { ...table }
    if (!Number.isFinite(v) || v < 0 || v === STAGE_WEIGHT[k]) delete cur[k]
    else cur[k] = Math.round(v * 10) / 10
    if (cur[k] === table[k] && (k in cur) === (k in table)) return
    save(cur)
  }
  const sum = (keys: StageKey[]) => keys.reduce((n, k) => n + eff(k), 0)
  const regular = sum(REGULAR_ORDER)
  const pct = (k: StageKey, total: number) => (total > 0 ? Math.round((eff(k) / total) * 1000) / 10 : 0)
  const changed = Object.keys(table).length
  const row = (k: StageKey, total: number) => (
    <tr key={k} style={{ borderTop: '1px solid var(--la-line)' }}>
      <td className="px-1.5 py-1 leading-5">{STAGE_LABEL[k]}</td>
      <td className="px-1.5 py-1">
        <input className="la-input la-num" style={{ minHeight: 32, width: 78, textAlign: 'center', borderColor: table[k] != null ? 'var(--la-accent)' : undefined, background: table[k] != null ? 'var(--la-accent-soft)' : undefined }} type="number" min={0} step={0.5} defaultValue={eff(k)} key={`${k}${eff(k)}`} aria-label={`وزن ${STAGE_LABEL[k]}`} onBlur={(e) => set(k, Number(e.target.value))} />
      </td>
      <td className="la-num px-1.5 text-center" style={{ color: 'var(--la-muted)' }}>{faNum(pct(k, total))}٪</td>
    </tr>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--la-muted)' }}><th className="px-1.5 py-1.5 text-right font-semibold">مرحلهٔ ۱۳‌گانه</th><th className="px-1.5 text-center font-semibold">وزن</th><th className="px-1.5 text-center font-semibold">سهم</th></tr></thead>
            <tbody>
              {REGULAR_ORDER.map((k) => row(k, regular))}
              <tr style={{ borderTop: '2px solid var(--la-line-2)' }}><td className="px-1.5 py-1.5 font-bold">جمع ۱۳ مرحله</td><td className="la-num text-center font-bold">{faNum(regular)}</td><td /></tr>
            </tbody>
          </table>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ color: 'var(--la-muted)' }}><th className="px-1.5 py-1.5 text-right font-semibold">مراحل افزوده</th><th className="px-1.5 text-center font-semibold">وزن</th><th className="px-1.5 text-center font-semibold">سهم</th></tr></thead>
            <tbody>
              {ART9_PRE.map((k) => row(k, regular + sum(ART9_PRE)))}
              {row('title_deed', regular + eff('title_deed'))}
            </tbody>
          </table>
          <p className="la-eyebrow mt-2 leading-6">سهم مراحل ماده ۹ نسبت به ۱۳ مرحله + ۳ مرحلهٔ مقدماتی سنجیده می‌شود؛ سند مالکیت فقط برای ایستگاه‌ها به مجموع اضافه می‌شود.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="la-eyebrow m-0">{changed ? `${faNum(changed)} وزن با مقدار متعارف فرق دارد (رنگی).` : 'همهٔ وزن‌ها مقدار متعارف است.'} وزن بیشتر یعنی تأثیر بیشتر آن مرحله در درصد پیشرفت.</p>
        <button className="la-btn la-btn-sm" disabled={!changed} onClick={() => save({})}><RotateCcw size={13} /> بازگشت به مقدار متعارف</button>
      </div>
    </div>
  )
}
