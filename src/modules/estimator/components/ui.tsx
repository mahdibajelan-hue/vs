import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { BG, BORDER, BORDER_SOFT, INK, INK_SOFT, MUTED_FG, SAFETY, SURFACE, SURFACE_2 } from '../lib/theme'

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
        <span className="text-xs font-medium" style={{ color: INK_SOFT }}>{label}</span>
        {unit && <span className="text-[10px]" style={{ color: MUTED_FG }}>{unit}</span>}
      </div>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
        className="est-input est-mono w-full rounded-md px-2 py-1.5 text-sm text-right transition-shadow"
        style={{ direction: 'ltr', textAlign: 'left', background: SURFACE_2, border: `1px solid ${BORDER}`, color: INK }}
      />
      {hint && <div className="text-[10px] mt-0.5 leading-relaxed" style={{ color: MUTED_FG }}>{hint}</div>}
    </label>
  )
}

export function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block mb-3">
      <span className="mb-1 block text-xs font-medium" style={{ color: INK_SOFT }}>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="est-input w-full rounded-md px-3 py-2 text-sm"
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
      <div className="flex shrink-0 rounded-md overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
        <button
          type="button"
          onClick={() => onChange(true)}
          className="px-3 py-1 text-xs font-medium transition-colors"
          style={value ? { background: SAFETY, color: '#1A1400' } : { background: 'transparent', color: MUTED_FG }}
        >
          بله
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className="px-3 py-1 text-xs font-medium transition-colors"
          style={!value ? { background: SAFETY, color: '#1A1400', borderRight: `1px solid ${BORDER}` } : { background: 'transparent', color: MUTED_FG, borderRight: `1px solid ${BORDER}` }}
        >
          خیر
        </button>
      </div>
    </div>
  )
}

export function CountField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 mb-2" style={{ background: SURFACE_2, border: `1px solid ${BORDER}` }}>
      <div>
        <div className="text-sm font-medium" style={{ color: INK }}>{label}</div>
        {hint && <div className="text-[10px] mt-0.5" style={{ color: MUTED_FG }}>{hint}</div>}
      </div>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || '0', 10)))}
        className="est-input est-mono w-16 rounded-md px-2 py-1.5 text-sm text-center"
        style={{ direction: 'ltr', background: SURFACE, border: `1px solid ${BORDER}`, color: INK }}
      />
    </div>
  )
}

export function Section({ title, defaultOpen = false, accent, children }: { title: string; defaultOpen?: boolean; accent?: string; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderBottom: `1px solid ${BORDER}` }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between py-2.5 text-right">
        <span className="text-sm font-bold flex items-center gap-2" style={{ color: INK }}>
          {accent && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: accent }} />}
          {title}
        </span>
        <ChevronDown size={16} className="transition-transform" style={{ color: MUTED_FG, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  )
}

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`est-card rounded-xl p-5 print-card est-fade-in ${className}`}
      style={{ background: SURFACE, border: `1px solid ${BORDER}`, ...style }}
    >
      {children}
    </div>
  )
}

export const EST_GLOBAL_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  .est-font { font-family: 'Vazirmatn', Tahoma, Arial, sans-serif; color: ${INK}; }
  .est-mono { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .est-input { outline: none; }
  .est-input:focus { box-shadow: 0 0 0 2px ${SAFETY}; border-color: ${SAFETY} !important; }
  .est-input::placeholder { color: ${MUTED_FG}; }

  @keyframes est-fade-up {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .est-fade-in { animation: est-fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }

  .est-card { transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease; }
  .est-card:hover { border-color: ${BORDER_SOFT}; box-shadow: 0 12px 28px -16px rgba(0,0,0,0.6); }

  @media print {
    .no-print { display: none !important; }
    body { background: ${BG} !important; }
    .print-card { box-shadow: none !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    .est-fade-in, .est-card { animation: none !important; transition: none !important; }
  }
`
