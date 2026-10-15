import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import { useState } from 'react'
import type { Alert } from '../../lib/engine/alerts'
import type { ExTab } from '../../ExecutionApp'

const ICON = { critical: AlertOctagon, warn: AlertTriangle, info: Info } as const
const COLOR = { critical: 'var(--im-coral)', warn: 'var(--im-amber)', info: 'var(--im-muted)' } as const
const GO: Record<Alert['area'], [ExTab, string?]> = { schedule: ['progress'], forecast: ['productivity', 'forecast'], readiness: ['plan', 'readiness'], blocker: ['plan', 'readiness'], review: ['review'], commitment: ['plan', 'lookahead'], finance: ['reports', 'ledger'], quality: ['productivity', 'rates'] }

/** Rule-based alerts. Each shows the rule and numbers behind it and links to the page with the underlying data. */
export function AlertsPanel({ alerts, onGo }: { alerts: Alert[]; onGo: (t: ExTab, s?: string) => void }) {
  const [all, setAll] = useState(false)
  if (!alerts.length) return <div className="im-card" style={{ padding: '10px 14px' }}>هشداری فعال نیست: شاخص‌ها در محدودهٔ آستانه‌های تنظیم‌شده‌اند.</div>
  const shown = all ? alerts : alerts.slice(0, 6)
  return (
    <div className="im-card" style={{ padding: 0 }}>
      <div style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}><b>هشدارها</b><span className="im-helper" style={{ margin: 0 }}>{alerts.filter((a) => a.severity === 'critical').length} بحرانی · {alerts.filter((a) => a.severity === 'warn').length} هشدار</span></div>
      <div style={{ display: 'grid' }}>
        {shown.map((a) => { const I = ICON[a.severity]; const [t, s] = GO[a.area]; return (
          <button key={a.id} onClick={() => onGo(t, s)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, padding: '8px 14px', borderTop: '1px solid var(--im-line)', alignItems: 'flex-start' }}>
            <I size={16} style={{ color: COLOR[a.severity], flex: 'none', marginTop: 2 }} aria-hidden />
            <span style={{ display: 'grid', gap: 2 }}><b style={{ fontSize: 13 }}>{a.title}</b><small style={{ color: 'var(--im-muted)' }}>چرا: {a.reason}</small></span>
          </button>) })}
      </div>
      {alerts.length > 6 && <div style={{ padding: 8 }}><button className="im-btn im-btn-sm" onClick={() => setAll(!all)}>{all ? 'کمتر' : `همهٔ ${alerts.length} هشدار`}</button></div>}
    </div>
  )
}
