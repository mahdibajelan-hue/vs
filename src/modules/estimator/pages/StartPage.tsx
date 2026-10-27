import { useMemo, useState } from 'react'
import { ArrowLeft, BookMarked, Coins, Info, Layers3, Scale, Sigma, Spline } from 'lucide-react'
import type { EstBenchmark, EstFullInputs, EstMaturity, EstMethod, EstProject } from '../types'
import { MATURITY, maturityOf } from '../lib/calc'
import { DEFAULT_WEIGHTS, METHOD_META, runMethods } from '../lib/methods'
import { BORDER, INK, INK_SOFT, MUTED_FG, SAFETY, SURFACE, SURFACE_2, toFa } from '../lib/theme'
import { Btn, Segmented } from '../components/ui'
import { MethodLadder } from '../components/MethodLadder'
import { RouteSchematic } from '../components/RouteSchematic'

const METHOD_ICON: Record<EstMethod, React.ReactNode> = {
  parametric: <Sigma size={20} />, historical: <BookMarked size={20} />, analog: <Spline size={20} />, blended: <Layers3 size={20} />,
}

/** Step 1 of every estimate: the day's euro rate, how mature the definition is, and which method
 * the final number should come from. Nothing else in the module can be reached before the rate is set. */
export function StartPage({ project, inputs, benchmarks, nowYear, onChange, onNext, onOpenLibrary }: {
  project: EstProject; inputs: EstFullInputs; benchmarks: EstBenchmark[]; nowYear: number
  onChange: (next: EstFullInputs) => void; onNext: () => void; onOpenLibrary: () => void
}) {
  const [raw, setRaw] = useState(inputs.overhead.fxRialPerEur ? String(Math.round(inputs.overhead.fxRialPerEur)) : '')
  const [touched, setTouched] = useState(false)
  const rate = Number(raw.replace(/[^\d]/g, '')) || 0
  const valid = rate >= 10_000
  const method = inputs.method ?? 'parametric'
  const weights = inputs.weights ?? DEFAULT_WEIGHTS

  function setRate(text: string) {
    const digits = text.replace(/[^\d۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    setRaw(digits)
    const v = Number(digits) || 0
    onChange({ ...inputs, overhead: { ...inputs.overhead, fxRialPerEur: v || undefined, fxRialPerUsd: v ? v * inputs.overhead.fxEurPerUsd : inputs.overhead.fxRialPerUsd } })
  }

  const preview = useMemo(() => (valid ? runMethods(project, inputs, benchmarks, nowYear) : null), [valid, project, inputs, benchmarks, nowYear])
  const pipelineRows = benchmarks.filter((b) => (project.hasOnshore && b.setting !== 'offshore') || (project.hasOffshore && b.setting !== 'onshore')).length

  return (
    <div className="h-full overflow-y-auto est-scroll">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-5 pb-24 lg:pb-8">
        <section className="est-start-hero est-fade-in">
          <div className="min-w-0">
            <span className="est-eyebrow">گام ۱ از ۳ · شروع برآورد</span>
            <h1>{project.name}</h1>
            <p>پیش از هر چیز نرخ روز یورو در سامانه را وارد کنید؛ همهٔ مبالغ ریالی برآورد با همین نرخ محاسبه و در گزارش ثبت می‌شود. سپس روش برآورد را انتخاب کنید — می‌توانید بعداً در صفحهٔ نتیجه هم روش را عوض کنید.</p>
          </div>
          <div className="est-start-art" aria-hidden><RouteSchematic project={project} height={110} /></div>
        </section>

        {/* euro rate */}
        <section className={`est-rate est-fade-in ${touched && !valid ? 'is-bad' : ''}`} style={{ animationDelay: '60ms' }}>
          <div className="est-rate-icon"><Coins size={24} /></div>
          <div className="flex-1 min-w-0">
            <label htmlFor="est-eur" className="block text-sm font-extrabold" style={{ color: INK }}>نرخ روز یورو در سامانه</label>
            <p className="text-[11.5px] mt-0.5" style={{ color: MUTED_FG }}>ریال به ازای هر یورو — مثلاً ۸۵۰٬۰۰۰. برابری یورو و دلار ({inputs.overhead.fxEurPerUsd} یورو برای هر دلار) از مبانی برآورد خوانده می‌شود.</p>
          </div>
          <div className="est-rate-input">
            <input id="est-eur" inputMode="numeric" autoComplete="off" dir="ltr" value={raw ? Number(raw).toLocaleString('en-US') : ''} placeholder="0"
              onChange={(e) => setRate(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={touched && !valid} aria-describedby="est-eur-err" />
            <span>ریال</span>
          </div>
          {touched && !valid && <p id="est-eur-err" role="alert" className="est-rate-err">نرخ یورو را به ریال وارد کنید (دست‌کم ۱۰٬۰۰۰ ریال).</p>}
        </section>

        {/* maturity */}
        <section className="est-panel est-fade-in" style={{ animationDelay: '120ms' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold" style={{ color: INK }}>مرحلهٔ تعریف پروژه</h2>
              <p className="text-[11.5px] mt-0.5" style={{ color: MUTED_FG }}>{MATURITY[maturityOf(inputs)].hint} — بازهٔ دقت برآورد پارامتریک از همین انتخاب تعیین می‌شود.</p>
            </div>
            <Segmented<EstMaturity> value={maturityOf(inputs)} onChange={(v) => onChange({ ...inputs, maturity: v })}
              options={(Object.keys(MATURITY) as EstMaturity[]).map((k) => [k, MATURITY[k].label])} />
          </div>
        </section>

        {/* method */}
        <section className="est-panel est-fade-in" style={{ animationDelay: '180ms' }}>
          <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-extrabold" style={{ color: INK }}>روش برآورد</h2>
              <p className="text-[11.5px] mt-0.5" style={{ color: MUTED_FG }}>روش‌های تاریخی و قیاسی از کتابخانهٔ پروژه‌های مرجع استفاده می‌کنند ({toFa(pipelineRows)} پروژهٔ مرتبط ثبت شده).</p>
            </div>
            <Btn kind="quiet" onClick={onOpenLibrary}><BookMarked size={14} /> کتابخانهٔ مرجع</Btn>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" role="radiogroup" aria-label="روش برآورد">
            {(Object.keys(METHOD_META) as EstMethod[]).map((k) => {
              const meta = METHOD_META[k]
              const needsLib = k === 'historical' || k === 'analog'
              const off = needsLib && pipelineRows === 0
              return (
                <button key={k} type="button" role="radio" aria-checked={method === k} disabled={off}
                  onClick={() => onChange({ ...inputs, method: k })} className={`est-mcard ${method === k ? 'is-on' : ''}`} style={{ ['--mc' as string]: meta.color }}>
                  <span className="est-mcard-ic">{METHOD_ICON[k]}</span>
                  <b>{meta.label}</b>
                  <span>{meta.hint}</span>
                  {off && <em><Info size={11} /> ابتدا پروژهٔ مرجع ثبت کنید</em>}
                </button>
              )
            })}
          </div>

          {method === 'blended' && (
            <div className="est-weights mt-4">
              <p className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: INK }}><Scale size={14} style={{ color: SAFETY }} /> وزن هر روش در برآورد ترکیبی</p>
              {(['parametric', 'historical', 'analog'] as const).map((k) => (
                <label key={k} className="est-weight">
                  <span style={{ color: METHOD_META[k].color }}>{METHOD_META[k].short}</span>
                  <input type="range" min={0} max={100} step={5} value={Math.round(weights[k] * 100)}
                    onChange={(e) => onChange({ ...inputs, weights: { ...weights, [k]: Number(e.target.value) / 100 } })} style={{ accentColor: METHOD_META[k].color }} />
                  <span className="est-mono">{toFa(Math.round(weights[k] * 100))}</span>
                </label>
              ))}
              <p className="text-[10.5px] mt-1" style={{ color: MUTED_FG }}>وزن‌ها نسبی‌اند؛ روشی که داده ندارد کنار گذاشته و بقیه دوباره نرمال می‌شوند.</p>
            </div>
          )}

          {preview && (
            <div className="mt-5">
              <p className="text-xs font-bold mb-2" style={{ color: INK_SOFT }}>پیش‌نمایش با مشخصات پیش‌فرض (پس از ورود مشخصات دقیق‌تر می‌شود)</p>
              <MethodLadder list={preview.list} chosen={preview.chosen.method} onPick={(m) => onChange({ ...inputs, method: m })} />
            </div>
          )}
        </section>

        <div className="flex justify-end">
          <Btn kind="primary" disabled={!valid} onClick={() => { setTouched(true); if (valid) onNext() }}>ادامه: مشخصات فنی <ArrowLeft size={14} /></Btn>
        </div>
      </div>
      <style>{START_STYLE}</style>
    </div>
  )
}

const START_STYLE = `
  .est-start-hero { display: grid; gap: 1rem; align-items: center; grid-template-columns: 1fr; padding: 1.4rem 1.5rem; border-radius: 22px; border: 1px solid ${BORDER}; background: linear-gradient(135deg, rgba(57,135,229,.12), rgba(14,24,38,.9) 55%); }
  @media (min-width: 900px) { .est-start-hero { grid-template-columns: 1.2fr 1fr; } }
  .est-start-hero h1 { font-size: clamp(1.3rem, 2.4vw, 1.8rem); font-weight: 900; color: ${INK}; margin: .5rem 0 .4rem; line-height: 1.4; }
  .est-start-hero p { font-size: 13px; line-height: 2; color: ${INK_SOFT}; }
  .est-start-art { border-radius: 16px; background: rgba(10,18,28,.6); border: 1px solid ${BORDER}; padding: .3rem .5rem; }
  .est-eyebrow { display: inline-flex; font-size: 11px; font-weight: 700; color: ${SAFETY}; background: rgba(242,183,5,.08); border: 1px solid rgba(242,183,5,.25); padding: .25rem .65rem; border-radius: 99px; }
  .est-rate { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 1.2rem 1.3rem; border-radius: 20px; background: linear-gradient(150deg, rgba(242,183,5,.13), ${SURFACE} 60%); border: 1px solid rgba(242,183,5,.4); box-shadow: 0 0 0 5px rgba(242,183,5,.05); }
  .est-rate.is-bad { border-color: #e66767; box-shadow: 0 0 0 5px rgba(230,103,103,.08); }
  .est-rate-icon { width: 52px; height: 52px; border-radius: 16px; display: grid; place-items: center; color: #1A1400; background: ${SAFETY}; box-shadow: 0 10px 26px -10px rgba(242,183,5,.7); }
  .est-rate-input { display: flex; align-items: center; gap: .5rem; padding: .35rem .9rem; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; min-width: min(100%, 270px); }
  .est-rate-input:focus-within { border-color: ${SAFETY}; box-shadow: 0 0 0 3px rgba(242,183,5,.18); }
  .est-rate-input input { flex: 1; min-width: 0; background: transparent; outline: none; font-family: 'Fira Code', ui-monospace, monospace; font-size: 1.6rem; font-weight: 700; color: ${SAFETY}; text-align: left; padding: .2rem 0; }
  .est-rate-input span { font-size: 12px; color: ${MUTED_FG}; }
  .est-rate-err { flex-basis: 100%; font-size: 12px; font-weight: 600; color: #f08a8a; }
  .est-panel { padding: 1.2rem 1.3rem; border-radius: 20px; background: ${SURFACE}; border: 1px solid ${BORDER}; }
  .est-mcard { position: relative; display: grid; gap: .35rem; align-content: start; text-align: right; padding: 1rem; border-radius: 16px; background: ${SURFACE_2}; border: 1px solid ${BORDER}; min-height: 150px; transition: border-color .18s ease, transform .14s var(--ease), background .18s ease; }
  .est-mcard:hover:not(:disabled) { border-color: color-mix(in srgb, var(--mc) 55%, ${BORDER}); }
  .est-mcard:active:not(:disabled) { transform: scale(.985); }
  .est-mcard:disabled { opacity: .5; cursor: not-allowed; }
  .est-mcard b { font-size: 13px; color: ${INK}; }
  .est-mcard > span:not(.est-mcard-ic) { font-size: 11.5px; line-height: 1.8; color: ${MUTED_FG}; }
  .est-mcard em { font-style: normal; font-size: 10.5px; color: #f0b45a; display: inline-flex; align-items: center; gap: .25rem; }
  .est-mcard-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; color: var(--mc); background: color-mix(in srgb, var(--mc) 14%, transparent); margin-bottom: .2rem; transition: background .2s ease, color .2s ease; }
  .est-mcard.is-on { border-color: var(--mc); background: color-mix(in srgb, var(--mc) 9%, ${SURFACE_2}); box-shadow: 0 14px 34px -24px var(--mc); }
  .est-mcard.is-on .est-mcard-ic { background: var(--mc); color: #fff; }
  .est-weights { padding: .9rem 1rem; border-radius: 14px; background: rgba(242,183,5,.05); border: 1px dashed rgba(242,183,5,.3); }
  .est-weight { display: grid; grid-template-columns: 80px 1fr 34px; align-items: center; gap: .6rem; font-size: 12px; font-weight: 700; padding: .25rem 0; }
  .est-weight input { width: 100%; }
`
