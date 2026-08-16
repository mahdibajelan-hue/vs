import type { Pipe, Route } from '../types'

interface RouteInfoBarProps {
  route: Route
  pipe: Pipe
}

/** A compact strip of the project's real physical parameters — every value here comes directly from the route/pipe records, nothing decorative. */
export function RouteInfoBar({ route, pipe }: RouteInfoBarProps) {
  const items = [
    { label: 'طول مسیر', value: `${(route.lengthMeters / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} km` },
    { label: 'قطر', value: `Ø${pipe.diameterInch.toLocaleString('fa-IR')}″` },
    { label: 'ضخامت جدار', value: `${pipe.wallThicknessMm.toLocaleString('fa-IR')} mm` },
    { label: 'جنس', value: pipe.material },
    { label: 'فشار طراحی', value: `${pipe.designPressureBar.toLocaleString('fa-IR')} bar` },
    { label: 'سیال', value: pipe.fluidType },
  ]

  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-white/10 bg-[rgba(10,14,20,0.82)] px-4 py-2.5 backdrop-blur-md">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col leading-tight">
          <span className="num text-[11px] font-bold text-white">{it.value}</span>
          <span className="text-[9px] text-muted">{it.label}</span>
        </div>
      ))}
    </div>
  )
}
