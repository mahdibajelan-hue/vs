import type { CSSProperties, ReactNode } from 'react'
import { MapPinned } from 'lucide-react'
import { useLandStore, type ColorMode } from '../store/useLandStore'
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, type DisplayStatus } from '../lib/status'
import { LEVEL_COLOR, LEVEL_LABEL, OWNERSHIP_CLASSES, OWNERSHIP_LABEL } from '../lib/labels'
import { OWNERSHIP_COLOR, progressColor } from '../lib/colors'
import { fmtLen as km, faNum } from '../lib/fa'
import { EmptyState } from './ui'

export function Kpi({ label, value, sub, color, alert, onClick }: { label: string; value: ReactNode; sub?: ReactNode; color?: string; alert?: boolean; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`la-kpi ${alert ? 'is-alert' : ''}`} style={color ? ({ '--c': color } as CSSProperties) : undefined} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="la-kpi-label">{label}</span>
      <span className="la-kpi-value">{value}</span>
      {sub != null && <span className="la-kpi-sub">{sub}</span>}
    </Tag>
  )
}

/** Colour key for the current map mode, with counts. */
export function MapLegend({ mode, counts }: { mode: ColorMode; counts?: Partial<Record<DisplayStatus, number>> }) {
  const items: { color: string; label: string; n?: number }[] =
    mode === 'status'
      ? STATUS_ORDER.map((s) => ({ color: STATUS_COLOR[s], label: STATUS_LABEL[s], n: counts?.[s] }))
      : mode === 'criticality'
        ? (['low', 'medium', 'high', 'critical'] as const).map((l) => ({ color: LEVEL_COLOR[l], label: LEVEL_LABEL[l] }))
        : mode === 'ownership'
          ? OWNERSHIP_CLASSES.map((c) => ({ color: OWNERSHIP_COLOR[c], label: OWNERSHIP_LABEL[c] }))
          : [0, 0.25, 0.5, 0.75, 1].map((p) => ({ color: progressColor(p), label: `${faNum(p * 100)}٪ مراحل` }))
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[11.5px]" style={{ color: 'var(--la-ink-2)' }}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: i.color, boxShadow: '0 0 0 1px var(--la-line-2)' }} />
          {i.label}
          {i.n != null && <span className="la-num" style={{ color: 'var(--la-muted)' }}>{km(i.n)} km</span>}
        </li>
      ))}
    </ul>
  )
}

/** Shown on every page when the project has no route yet: two ways forward, no dead end. */
export function NoRoute() {
  const setTab = useLandStore((s) => s.setTab)
  const loadDemo = useLandStore((s) => s.loadDemo)
  const loading = useLandStore((s) => s.loading)
  return (
    <div className="la-card mx-auto mt-6 max-w-xl">
      <EmptyState
        icon={<MapPinned size={22} />}
        title="مسیر این پروژه هنوز تعریف نشده"
        text="طول مسیر و کیلومتر شروع را ثبت کنید تا مسیر به قطعه‌های کیلومتری شکسته شود. یا برای دیدن ماژول، داده‌های نمونهٔ یک خط لولهٔ ۱۰۰ کیلومتری را بارگذاری کنید (هر زمان قابل پاک‌کردن است)."
        action={
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button className="la-btn la-btn-primary" onClick={() => setTab('settings')}>تعریف مسیر</button>
            <button className="la-btn" disabled={loading} onClick={() => loadDemo()}>{loading ? 'در حال بارگذاری…' : 'بارگذاری داده نمونه'}</button>
          </div>
        }
      />
    </div>
  )
}
