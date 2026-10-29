import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { BG, BORDER, BORDER_SOFT, INK, INK_SOFT, MUTED_FG, SAFETY, SURFACE, SURFACE_2 } from '../lib/theme'

/** Numeric input. `percent` shows a fraction (0.08) as a percentage (8) — rates are stored as
 * fractions but nobody thinks of contingency as «0٫08». */
export function Field({
  label, value, onChange, unit, step = 1, min = 0, hint, percent = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  unit?: string
  step?: number
  min?: number
  hint?: string
  percent?: boolean
}) {
  const shown = percent ? Math.round(value * 10000) / 100 : value
  return (
    <label className="est-field block mb-3">
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <span className="text-xs font-medium" style={{ color: INK_SOFT }}>{label}</span>
        {(unit || percent) && <span className="text-[10px] shrink-0" style={{ color: MUTED_FG }}>{percent ? '٪' : unit}</span>}
      </div>
      <input
        type="number"
        value={shown}
        step={percent ? Math.max(0.1, step * 100) : step}
        min={min}
        onChange={(e) => { const n = parseFloat(e.target.value || '0'); onChange(percent ? n / 100 : n) }}
        className="est-input est-mono w-full rounded-lg px-2.5 py-2 text-sm"
        style={{ direction: 'ltr', textAlign: 'left', background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK }}
      />
      {hint && <div className="text-[10px] mt-1 leading-relaxed" style={{ color: MUTED_FG }}>{hint}</div>}
    </label>
  )
}

export function TextField({ label, value, onChange, placeholder, autoFocus }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <label className="block mb-3">
      <span className="mb-1 block text-xs font-medium" style={{ color: INK_SOFT }}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="est-input w-full rounded-lg px-3 py-2.5 text-sm"
        style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK }}
      />
    </label>
  )
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 mb-2" style={{ background: SURFACE_2, border: `1px solid ${BORDER}` }}>
      <div>
        <div className="text-sm font-medium" style={{ color: INK }}>{label}</div>
        {hint && <div className="text-[10px] mt-0.5" style={{ color: MUTED_FG }}>{hint}</div>}
      </div>
      <Segmented value={value ? 'y' : 'n'} onChange={(v) => onChange(v === 'y')} options={[['y', 'بله'], ['n', 'خیر']]} />
    </div>
  )
}

/** Two-to-four way switch with a sliding thumb. */
export function Segmented<T extends string>({ value, onChange, options, full = false }: { value: T; onChange: (v: T) => void; options: [T, ReactNode][]; full?: boolean }) {
  const idx = Math.max(0, options.findIndex(([k]) => k === value))
  return (
    <div role="radiogroup" className={`est-seg ${full ? 'w-full' : ''}`} style={{ ['--n' as string]: options.length, ['--i' as string]: idx }}>
      <span className="est-seg-thumb" aria-hidden />
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={k === value} onClick={() => onChange(k)} className={k === value ? 'is-on' : ''}>{l}</button>
      ))}
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="est-stepper" dir="ltr">
      <button type="button" aria-label="کم کردن" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>−</button>
      <span className="est-mono">{value}</span>
      <button type="button" aria-label="زیاد کردن" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>+</button>
    </div>
  )
}

export function Section({ title, icon, subtitle, defaultOpen = false, accent, children, id }: {
  title: string; icon?: ReactNode; subtitle?: string; defaultOpen?: boolean; accent?: string; children: ReactNode; id?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section id={id} className={`est-section ${open ? 'is-open' : ''}`} style={{ ['--acc' as string]: accent ?? SAFETY }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="est-section-head">
        <span className="est-section-icon" aria-hidden>{icon}</span>
        <span className="flex-1 min-w-0 text-right">
          <span className="block text-sm font-bold" style={{ color: INK }}>{title}</span>
          {subtitle && <span className="block text-[11px] mt-0.5 truncate" style={{ color: MUTED_FG }}>{subtitle}</span>}
        </span>
        <ChevronDown size={16} className="est-chev" style={{ color: MUTED_FG }} />
      </button>
      <div className="est-section-body"><div className="est-section-inner">{children}</div></div>
    </section>
  )
}

export function Card({ children, className = '', style, delay = 0 }: { children: ReactNode; className?: string; style?: React.CSSProperties; delay?: number }) {
  return (
    <div
      className={`est-card rounded-2xl p-5 print-card est-fade-in ${className}`}
      style={{ background: SURFACE, border: `1px solid ${BORDER}`, animationDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  )
}

export function CardTitle({ icon, title, hint, right }: { icon?: ReactNode; title: string; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      {icon && <span className="est-title-icon" aria-hidden>{icon}</span>}
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-sm" style={{ color: INK }}>{title}</h2>
        {hint && <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: MUTED_FG }}>{hint}</p>}
      </div>
      {right}
    </div>
  )
}

/** Counts up to the new value whenever it changes (ease-out, ~0.7s); static under reduced motion. */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const start = from.current
    if (reduce || start === value) { setShown(value); from.current = value; return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 700)
      const e = 1 - Math.pow(1 - k, 3)
      const v = start + (value - start) * e
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{format(shown)}</>
}

export function Kpi({ icon, label, value, sub, tone, delay = 0 }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: string; delay?: number }) {
  return (
    <div className="est-kpi est-fade-in" style={{ animationDelay: `${delay}ms`, ['--tone' as string]: tone ?? SAFETY }}>
      <span className="est-kpi-icon" aria-hidden>{icon}</span>
      <span className="text-[11px]" style={{ color: MUTED_FG }}>{label}</span>
      <b className="est-mono text-lg leading-tight" style={{ color: INK }}>{value}</b>
      {sub && <span className="text-[10.5px] leading-snug" style={{ color: MUTED_FG }}>{sub}</span>}
    </div>
  )
}

export function Btn({ children, onClick, kind = 'ghost', disabled, title, type = 'button' }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'ghost' | 'quiet' | 'danger'; disabled?: boolean; title?: string; type?: 'button' | 'submit'
}) {
  return <button type={type} title={title} disabled={disabled} onClick={onClick} className={`est-btn is-${kind}`}>{children}</button>
}

export const EST_GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800;900&family=Fira+Code:wght@400;500;600;700&display=swap');
  .est-font { font-family: 'Vazirmatn', Tahoma, Arial, sans-serif; color: ${INK}; --ease: cubic-bezier(0.23, 1, 0.32, 1); }
  .est-mono { font-family: 'Fira Code', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .est-input { outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
  @media (hover: hover) and (pointer: fine) { .est-input:hover { border-color: #2a3c52 !important; } }
  .est-input:focus { box-shadow: 0 0 0 3px rgba(242,183,5,.18); border-color: ${SAFETY} !important; }
  .est-input::placeholder { color: ${MUTED_FG}; }
  .est-font :focus-visible { outline: 2px solid ${SAFETY}; outline-offset: 2px; }

  @keyframes est-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .est-fade-in { animation: est-fade-up .36s var(--ease) both; }
  .est-card { transition: border-color .2s ease, box-shadow .2s ease; }
  .est-card:hover { border-color: ${BORDER_SOFT}; box-shadow: 0 16px 34px -22px rgba(0,0,0,.7); }

  .est-btn { display: inline-flex; align-items: center; gap: .4rem; border-radius: 10px; padding: .55rem .85rem; font-size: 12px; font-weight: 600; white-space: nowrap; transition: transform .14s var(--ease), background .15s ease, border-color .15s ease, opacity .15s; border: 1px solid transparent; }
  .est-btn:active:not(:disabled) { transform: scale(.97); }
  .est-btn:disabled { opacity: .55; cursor: not-allowed; }
  .est-btn.is-primary { background: ${SAFETY}; color: #1A1400; box-shadow: 0 6px 18px -8px rgba(242,183,5,.6); }
  @media (hover: hover) and (pointer: fine) { .est-btn.is-primary:hover:not(:disabled) { background: #ffc62b; } }
  .est-btn.is-ghost { background: ${SURFACE_2}; color: ${INK}; border-color: ${BORDER}; }
  @media (hover: hover) and (pointer: fine) { .est-btn.is-ghost:hover:not(:disabled) { border-color: #2f4560; } }
  .est-btn.is-quiet { background: transparent; color: ${MUTED_FG}; }
  .est-btn.is-quiet:hover:not(:disabled) { color: ${INK}; background: rgba(255,255,255,.04); }
  .est-btn.is-danger { background: transparent; color: #e66767; border-color: rgba(230,103,103,.35); }

  .est-seg { position: relative; display: inline-grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); background: ${BG}; border: 1px solid ${BORDER}; border-radius: 10px; padding: 3px; }
  .est-seg button { position: relative; z-index: 1; padding: .4rem .8rem; font-size: 12px; font-weight: 600; color: ${MUTED_FG}; transition: color .2s ease; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: .35rem; }
  .est-seg button.is-on { color: #1A1400; }
  .est-seg-thumb { position: absolute; top: 3px; bottom: 3px; inset-inline-start: 3px; width: calc((100% - 6px) / var(--n)); border-radius: 7px; background: ${SAFETY}; transform: translateX(calc(var(--i) * -100%)); transition: transform .28s var(--ease); }
  [dir=ltr] .est-seg-thumb { transform: translateX(calc(var(--i) * 100%)); }

  .est-stepper { display: inline-flex; align-items: center; border: 1px solid ${BORDER}; border-radius: 10px; background: ${BG}; }
  .est-stepper button { width: 30px; height: 30px; font-size: 16px; color: ${INK_SOFT}; transition: transform .12s var(--ease); }
  .est-stepper button:active:not(:disabled) { transform: scale(.9); }
  .est-stepper button:disabled { opacity: .35; }
  .est-stepper span { min-width: 28px; text-align: center; font-weight: 700; color: ${INK}; }

  .est-section { border-bottom: 1px solid ${BORDER}; }
  .est-section:last-child { border-bottom: 0; }
  .est-section-head { width: 100%; display: flex; align-items: center; gap: .75rem; padding: .9rem 0; }
  .est-section-icon { width: 34px; height: 34px; flex-shrink: 0; display: grid; place-items: center; border-radius: 10px; color: var(--acc); background: color-mix(in srgb, var(--acc) 13%, transparent); border: 1px solid color-mix(in srgb, var(--acc) 30%, transparent); }
  .est-chev { transition: transform .25s var(--ease); flex-shrink: 0; }
  .est-section.is-open .est-chev { transform: rotate(180deg); }
  .est-section-body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .3s var(--ease); }
  .est-section.is-open .est-section-body { grid-template-rows: 1fr; }
  .est-section-inner { overflow: hidden; }
  .est-section.is-open .est-section-inner { padding-bottom: 1rem; }

  .est-title-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; color: ${SAFETY}; background: rgba(242,183,5,.1); flex-shrink: 0; }

  .est-kpi { position: relative; display: flex; flex-direction: column; gap: .2rem; padding: .9rem 1rem; border-radius: 14px; background: ${SURFACE}; border: 1px solid ${BORDER}; overflow: hidden; }
  .est-kpi::after { content: ''; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 3px; background: var(--tone); }
  .est-kpi-icon { color: var(--tone); margin-bottom: .2rem; }

  .est-route.is-animated .est-flow { animation: est-flow 1.6s linear infinite; }
  @keyframes est-flow { to { stroke-dashoffset: -24; } }
  .est-route.is-animated .est-wave { animation: est-wave 4s ease-in-out infinite; }
  @keyframes est-wave { 50% { transform: translateX(-10px); } }
  .est-route.is-animated .est-spin { animation: est-spin 2.4s linear infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes est-spin { to { transform: rotate(360deg); } }
  .est-route.is-animated .est-pulse { animation: est-pulse 2.2s var(--ease) infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes est-pulse { from { transform: scale(1); opacity: .6; } to { transform: scale(2.4); opacity: 0; } }
  .est-route.is-animated .est-blink { animation: est-blink 1.8s ease-in-out infinite; }
  @keyframes est-blink { 50% { opacity: .25; } }

  .est-grow { transform-origin: right; animation: est-grow .8s var(--ease) both; }
  @keyframes est-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  .est-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
  .est-scroll::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 8px; }

  @media print {
    .no-print { display: none !important; }
    body { background: ${BG} !important; }
    .print-card { box-shadow: none !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    .est-fade-in, .est-card, .est-grow, .est-route * { animation: none !important; transition: none !important; }
    .est-seg-thumb, .est-section-body, .est-chev { transition: none !important; }
  }
`
