import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { MUTED_FG, SAFETY, STEEL_DARK } from '../lib/theme'

export function Field({
  label, value, onChange, unit, step = 1, min = 0, hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  unit?: string
  step?: number
  min?: number
  hint?: string
}) {
  return (
    <label className="block mb-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
      </div>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
        className="est-input w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono text-right transition-shadow"
        style={{ direction: 'ltr', textAlign: 'left' }}
      />
      {hint && <div className="text-[10px] mt-0.5 leading-relaxed" style={{ color: MUTED_FG, opacity: 0.75 }}>{hint}</div>}
    </label>
  )
}

export function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block mb-3">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="est-input w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
      />
    </label>
  )
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 mb-2">
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {hint && <div className="text-[10px] mt-0.5" style={{ color: MUTED_FG }}>{hint}</div>}
      </div>
      <div className="flex shrink-0 rounded-md overflow-hidden border border-slate-300">
        <button
          type="button"
          onClick={() => onChange(true)}
          className="px-3 py-1 text-xs font-medium transition-colors"
          style={value ? { background: STEEL_DARK, color: '#fff' } : { background: '#fff', color: '#64748b' }}
        >
          بله
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className="px-3 py-1 text-xs font-medium transition-colors border-r border-slate-300"
          style={!value ? { background: STEEL_DARK, color: '#fff' } : { background: '#fff', color: '#64748b' }}
        >
          خیر
        </button>
      </div>
    </div>
  )
}

export function CountField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 mb-2">
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {hint && <div className="text-[10px] mt-0.5" style={{ color: MUTED_FG }}>{hint}</div>}
      </div>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
        className="est-input w-16 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono text-center"
        style={{ direction: 'ltr' }}
      />
    </div>
  )
}

export function Section({ title, defaultOpen = false, accent, children }: { title: string; defaultOpen?: boolean; accent?: string; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-slate-200">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between py-2.5 text-right">
        <span className="text-sm font-bold flex items-center gap-2" style={{ color: STEEL_DARK }}>
          {accent && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: accent }} />}
          {title}
        </span>
        <ChevronDown size={16} className="transition-transform text-slate-400" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  )
}

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`est-card bg-white rounded-xl border border-slate-200 p-5 print-card est-fade-in ${className}`} style={style}>
      {children}
    </div>
  )
}

export const EST_GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  .est-font { font-family: 'Vazirmatn', Tahoma, Arial, sans-serif; }
  .est-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .est-input:focus { outline: none; box-shadow: 0 0 0 2px ${SAFETY}; }

  @keyframes est-hazard-move {
    from { background-position: 0 0; }
    to { background-position: 56px 0; }
  }
  .est-hazard {
    height: 6px;
    background: repeating-linear-gradient(135deg, ${SAFETY} 0 14px, ${STEEL_DARK} 14px 28px);
    animation: est-hazard-move 3.2s linear infinite;
  }

  @keyframes est-fade-up {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .est-fade-in { animation: est-fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }

  @keyframes est-glow-pulse {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 0.6; }
  }
  .est-total-glow {
    position: absolute; inset: -14px -22px;
    background: radial-gradient(closest-side, rgba(242,183,5,0.35), transparent 72%);
    animation: est-glow-pulse 3.4s ease-in-out infinite;
    pointer-events: none;
    z-index: 0;
  }

  .est-card { transition: transform 0.25s ease, box-shadow 0.25s ease; }
  .est-card:hover { transform: translateY(-2px); box-shadow: 0 12px 28px -14px rgba(15,47,65,0.28); }

  @media print {
    .no-print { display: none !important; }
    body { background: white !important; }
    .print-card { box-shadow: none !important; border: 1px solid #ccc !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    .est-hazard, .est-fade-in, .est-total-glow, .est-card { animation: none !important; transition: none !important; }
  }
`
