import { useMemo } from 'react'
import { ArrowLeft, CalendarRange, Gauge, Ruler } from 'lucide-react'
import type { EstFullInputs, EstProject } from '../types'
import { buildCashFlowTimeline, computeEstimate, estimateKpis, estimateRange, MATURITY, maturityOf } from '../lib/calc'
import { BORDER, fmtEUR, fmtEURm, fmtPct, fmtRialBn, INK, INK_SOFT, MUTED_FG, SAFETY, SECTION_COLOR, SURFACE, toFa } from '../lib/theme'
import { AnimatedNumber, Btn } from './ui'

/** Running total next to the inputs: every change re-prices the project immediately, so the
 * estimator sees which input actually moves the number before going to the report. */
export function LivePanel({ project, inputs, onOpenResults }: { project: EstProject; inputs: EstFullInputs; onOpenResults: () => void }) {
  const results = useMemo(() => computeEstimate(project, inputs), [project, inputs])
  const kpis = useMemo(() => estimateKpis(project, inputs, results, buildCashFlowTimeline(inputs, results)), [project, inputs, results])
  const eur = (usd: number) => usd * inputs.overhead.fxEurPerUsd
  const m = maturityOf(inputs)
  const range = estimateRange(results.grand, m)
  const parts = [...results.sections.map((s) => ({ key: s.key, label: s.chartLabel, v: s.totalUsd, c: SECTION_COLOR[s.key] })),
    { key: 'ind', label: 'مهندسی، مدیریت، بیمه', v: results.indirect, c: '#6B7A8F' },
    { key: 'res', label: 'ذخایر', v: results.contingency + results.escalation, c: '#3F4C5E' }]

  return (
    <>
      <aside className="est-live est-fade-in" aria-label="برآورد زنده">
        <div className="flex items-center justify-between">
          <span className="est-live-tag"><span className="est-live-dot" /> برآورد زنده</span>
          <span className="text-[10.5px]" style={{ color: MUTED_FG }}>مرحلهٔ {MATURITY[m].label}</span>
        </div>
        <div>
          <div className="text-[11px]" style={{ color: MUTED_FG }}>برآورد کل</div>
          <div className="est-mono text-[1.65rem] font-bold leading-tight" style={{ color: SAFETY }}><AnimatedNumber value={eur(results.grand)} format={fmtEUR} /></div>
          <div className="est-mono text-xs mt-0.5" style={{ color: INK_SOFT }}>≈ {fmtRialBn(results.grand * inputs.overhead.fxRialPerUsd)}</div>
        </div>

        <div>
          <div className="flex justify-between text-[10.5px] mb-1" style={{ color: MUTED_FG }}>
            <span>بازهٔ دقت ({fmtPct(range.lowPct)} تا +{fmtPct(range.highPct)})</span>
          </div>
          <div className="est-range"><span style={{ insetInlineStart: `${(-range.lowPct / (range.highPct - range.lowPct)) * 100}%` }} /></div>
          <div className="flex justify-between est-mono text-[11px] mt-1" style={{ color: INK_SOFT }}>
            <span>{fmtEURm(eur(range.low))}</span><span>{fmtEURm(eur(range.high))}</span>
          </div>
        </div>

        <div>
          <div className="text-[10.5px] mb-1.5" style={{ color: MUTED_FG }}>ترکیب هزینه</div>
          <div className="est-stack" dir="ltr">
            {parts.filter((p) => p.v > 0).map((p) => <i key={p.key} title={`${p.label}: ${fmtEURm(eur(p.v))}`} style={{ flexGrow: p.v, background: p.c }} />)}
          </div>
          <ul className="mt-2 space-y-1">
            {parts.filter((p) => p.v > 0).sort((a, b) => b.v - a.v).slice(0, 5).map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1.5 truncate" style={{ color: INK_SOFT }}><i className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: p.c }} />{p.label}</span>
                <span className="est-mono shrink-0" style={{ color: MUTED_FG }}>{fmtPct(p.v / results.grand)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Mini icon={<CalendarRange size={13} />} label="مدت کل" value={`${toFa(kpis.totalMonths)} ماه`} />
          <Mini icon={<Ruler size={13} />} label="هر کیلومتر" value={kpis.usdPerKm ? fmtEURm(eur(kpis.usdPerKm)) : '—'} />
          <Mini icon={<Gauge size={13} />} label="سهم ذخایر" value={fmtPct(kpis.reserveShare)} />
        </div>

        <Btn kind="primary" onClick={onOpenResults}>مشاهدهٔ برآورد و گزارش <ArrowLeft size={14} /></Btn>
      </aside>

      {/* phones: the same number pinned to the bottom */}
      <div className="est-live-bar no-print">
        <div className="min-w-0">
          <div className="text-[10px]" style={{ color: MUTED_FG }}>برآورد زنده</div>
          <div className="est-mono text-base font-bold truncate" style={{ color: SAFETY }}><AnimatedNumber value={eur(results.grand)} format={fmtEUR} /></div>
        </div>
        <Btn kind="primary" onClick={onOpenResults}>گزارش <ArrowLeft size={14} /></Btn>
      </div>
      <style>{LIVE_STYLE}</style>
    </>
  )
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,.03)', border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-1 text-[10px]" style={{ color: MUTED_FG }}>{icon}{label}</div>
      <div className="est-mono text-[12px] font-bold mt-0.5 truncate" style={{ color: INK }}>{value}</div>
    </div>
  )
}

const LIVE_STYLE = `
  .est-live { position: sticky; top: 1rem; display: flex; flex-direction: column; gap: 1rem; padding: 1.1rem; border-radius: 20px; background: linear-gradient(170deg, #112035, ${SURFACE}); border: 1px solid ${BORDER}; box-shadow: 0 24px 50px -36px rgba(0,0,0,.9); }
  .est-live .est-btn { justify-content: center; }
  .est-live-tag { display: inline-flex; align-items: center; gap: .4rem; font-size: 11px; font-weight: 700; color: ${INK}; }
  .est-live-dot { width: 7px; height: 7px; border-radius: 99px; background: #22c55e; box-shadow: 0 0 0 0 rgba(34,197,94,.6); animation: est-live 2s ease-out infinite; }
  @keyframes est-live { to { box-shadow: 0 0 0 8px rgba(34,197,94,0); } }
  .est-range { position: relative; height: 8px; border-radius: 99px; background: linear-gradient(90deg, rgba(57,135,229,.5), rgba(242,183,5,.25) 40%, rgba(230,103,103,.55)); }
  [dir=rtl] .est-range { background: linear-gradient(270deg, rgba(57,135,229,.5), rgba(242,183,5,.25) 40%, rgba(230,103,103,.55)); }
  .est-range span { position: absolute; top: -4px; width: 4px; height: 16px; border-radius: 2px; background: ${SAFETY}; transform: translateX(50%); transition: inset-inline-start .4s var(--ease); }
  .est-stack { display: flex; height: 12px; border-radius: 99px; overflow: hidden; gap: 2px; }
  .est-stack i { display: block; min-width: 3px; transition: flex-grow .45s var(--ease); }
  .est-live-bar { display: none; }
  @media (max-width: 1023px) {
    .est-live { display: none; }
    .est-live-bar { display: flex; align-items: center; justify-content: space-between; gap: .75rem; position: sticky; bottom: 0; z-index: 5; margin: 0 -1rem; padding: .7rem 1rem calc(.7rem + env(safe-area-inset-bottom)); background: rgba(14,24,38,.94); backdrop-filter: blur(10px); border-top: 1px solid ${BORDER}; }
  }
  @media (prefers-reduced-motion: reduce) { .est-live-dot { animation: none; } .est-stack i, .est-range span { transition: none; } }
`
