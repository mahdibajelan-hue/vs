import { Bolt, Cog, Cylinder, Gauge, PaintBucket, Package, Radiation, Wrench, Zap, Triangle } from 'lucide-react'
import type { ReactElement, SVGProps } from 'react'

type P = { size?: number; className?: string; title?: string }
const base = (size: number): SVGProps<SVGSVGElement> => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true })

/* The four piping glyphs below are drawn in the same 24px / 1.75 stroke grid as the lucide set, because that library has no pipe, elbow, valve or flange. */
const Pipe = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><path d="M5 8h14" /><path d="M5 16h14" /><ellipse cx="5" cy="12" rx="2" ry="4" /><path d="M19 8a2 4 0 0 1 0 8" /></svg>
const Elbow = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><path d="M3 7h9a8 8 0 0 1 8 8v6" /><path d="M3 13h4a4 4 0 0 1 4 4v4" /><path d="M3 7v6" /><path d="M11 21h9" /></svg>
const Valve = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><path d="M4 9v8l8-4-8-4z" /><path d="M20 9v8l-8-4 8-4z" /><path d="M12 13V6" /><path d="M9 6h6" /></svg>
const Flange = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><circle cx="12" cy="6.2" r=".9" /><circle cx="12" cy="17.8" r=".9" /><circle cx="6.2" cy="12" r=".9" /><circle cx="17.8" cy="12" r=".9" /></svg>
const Gasket = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" /><path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" /></svg>

const MAP: Record<string, (p: P) => ReactElement> = {
  pipe: Pipe, fitting: Elbow, valve: Valve, flange: Flange, gasket: Gasket,
  bolt_nut: (p) => <Bolt size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />,
  instrument: (p) => <Gauge size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />,
  equipment: (p) => <Cog size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />,
  support: (p) => <Triangle size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />,
  electrode: (p) => <Zap size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />,
  coating: (p) => <PaintBucket size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />,
  rt_film: (p) => <Radiation size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />,
  gas: (p) => <Cylinder size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />,
  install_cons: (p) => <Wrench size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />,
}
export const COMMODITY_COLOR: Record<string, string> = { pipe: '#38bdf8', fitting: '#818cf8', valve: '#f97316', flange: '#2dd4bf', gasket: '#a3e635', bolt_nut: '#94a3b8', instrument: '#a78bfa', equipment: '#f59e0b', support: '#fb7185', electrode: '#facc15', coating: '#34d399', rt_film: '#f472b6', gas: '#60a5fa', install_cons: '#fb923c', other: '#94a3b8' }

/** Icon of a material group (by the group's code): pipe, elbow, valve, flange, gasket, bolt, gauge, machinery… Unknown codes get a neutral box. */
export function CommodityIcon({ code, size = 16, className, tinted = true }: { code?: string | null; size?: number; className?: string; tinted?: boolean }) {
  const C = (code && MAP[code]) || ((p: P) => <Package size={p.size ?? 16} strokeWidth={1.75} className={p.className} aria-hidden />)
  return <span className="mt-cicon" style={{ ['--ci' as string]: tinted ? COMMODITY_COLOR[code ?? 'other'] ?? COMMODITY_COLOR.other : 'currentColor' }}><C size={size} className={className} /></span>
}
