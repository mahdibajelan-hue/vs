import { useMemo, useState } from 'react'
import { AlertTriangle, Clock, FileQuestion, Siren } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { HelpButton } from '../../issues/components/Help'
import { Donut, Trend } from '../../issues/components/charts'
import { useRiskData, useRiskDirectory } from '../lib/useRiskData'
import { RK_HELP } from '../lib/help'
import { RiskMatrix, MODE_LABEL, type MatrixMode } from '../components/RiskMatrix'
import { LevelChip, ScoreTriple, StatusChip } from '../components/rk'
import { ZONE_COLOR, ZONE_LABEL_FA, levelOf, type RiskZone } from '../lib/riskPolicy'
import { scoreAt, addDays } from '../lib/riskState'
import { todayIso } from '../lib/riskScore'
import type { PageProps } from '../RiskApp'

const LV_COLOR = { low: '#22c55e', medium: '#eab308', high: '#f97316', critical: '#ef4444' } as const
const LV_LABEL = { low: 'کم', medium: 'متوسط', high: 'زیاد', critical: 'بحرانی' } as const

/** Where exposure stands: the matrix in three views (inherent / current / residual), what needs a (re)assessment, and the trend over months. */
export function AssessmentPage({ onOpenRisk }: PageProps) {
  const d = useRiskData()
  const dir = useRiskDirectory()
  const [mode, setMode] = useState<MatrixMode>('current')
  const [cell, setCell] = useState<{ p: number; i: number } | null>(null)
  const today = todayIso()
  const policy = d.policyFor(d.scope === 'all' ? '' : d.scope)

  const inCell = useMemo(() => {
    if (!cell) return []
    return d.active.filter((r) => {
      const s = d.states.get(r.id)!
      const p = mode === 'inherent' ? r.initialProbability : mode === 'current' ? s.currentP : s.residualP
      const i = mode === 'inherent' ? r.initialImpact : mode === 'current' ? s.currentI : s.residualI
      return p === cell.p && i === cell.i
    })
  }, [cell, mode, d.active, d.states])

  const queue = useMemo(() => d.active.map((r) => ({ r, s: d.states.get(r.id)! })).filter(({ s }) => s.needsReviewRequest || s.reviewOverdue || s.stale || s.assessmentCount === 0)
    .sort((a, b) => Number(b.s.needsReviewRequest) - Number(a.s.needsReviewRequest) || a.s.reviewDaysLeft - b.s.reviewDaysLeft), [d.active, d.states])

  const levelSlices = (['critical', 'high', 'medium', 'low'] as const).map((l) => ({ key: l, label: LV_LABEL[l], color: LV_COLOR[l], value: d.active.filter((r) => d.states.get(r.id)!.level === l).length }))
  const zoneCount = (z: RiskZone) => d.active.filter((r) => d.states.get(r.id)!.residualZone === z).length

  const months = useMemo(() => Array.from({ length: 7 }, (_, k) => addDays(today, -30 * (6 - k))), [today])
  const trend = useMemo(() => {
    const series = (['critical', 'high', 'medium', 'low'] as const).map((l) => ({ key: l, label: LV_LABEL[l], color: LV_COLOR[l], values: months.map((m) => d.risks.filter((r) => { const s = scoreAt(r, d.assessments, m); return s && levelOf(s.current, policy) === l }).length) }))
    return series
  }, [d.risks, d.assessments, months, policy])

  return (
    <div className="im-page">
      <div className="im-topbar"><div><div className="im-page-title">ارزیابی و اولویت‌بندی</div><div className="im-page-sub">ماتریس احتمال × اثر، موعد بازنگری و روند مواجهه</div></div><div className="im-actions"><HelpButton content={RK_HELP.assessment} /></div></div>

      <div className="im-chart-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: 14, marginBottom: 14, alignItems: 'start' }}>
        <div className="im-card">
          <div className="im-section-title" style={{ justifyContent: 'space-between' }}>ماتریس ریسک
            <div className="im-seg" role="tablist">{(['inherent', 'current', 'residual'] as MatrixMode[]).map((m) => <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setCell(null) }}>{MODE_LABEL[m]}</button>)}</div>
          </div>
          <RiskMatrix risks={d.active} states={d.states} policy={policy} mode={mode} selected={cell} onSelect={setCell} />
          <div className="im-legend" style={{ marginTop: 10, justifyContent: 'center' }}>{(['low', 'medium', 'high', 'critical'] as const).map((l) => <span key={l} style={{ ['--c' as string]: LV_COLOR[l] }}><i />{LV_LABEL[l]}</span>)}<span>حلقهٔ سفید = خارج از تحمل</span></div>
        </div>
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="im-card">
            <div className="im-section-title">توزیع سطح (فعلی)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <Donut slices={levelSlices} centerLabel="ریسک فعال" size={140} stroke={20} />
              <div className="im-grid" style={{ gap: 6, flex: 1 }}>{levelSlices.map((s) => <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span><span className="rk-dot" style={{ ['--c' as string]: s.color }} />{s.label}</span><b>{s.value}</b></div>)}</div>
            </div>
          </div>
          <div className="im-card">
            <div className="im-section-title">ناحیهٔ ریسک باقیمانده <span className="im-helper">پذیرش ≤ {policy.appetiteMax} · تحمل ≤ {policy.toleranceMax} · ارجاع ≥ {policy.escalationMin}</span></div>
            <div className="rk-quad">{(Object.keys(ZONE_LABEL_FA) as RiskZone[]).map((z) => <div key={z} className="im-card-flat" style={{ borderTop: `3px solid ${ZONE_COLOR[z]}`, textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 900, color: ZONE_COLOR[z] }}>{zoneCount(z)}</div><div className="im-helper" style={{ fontSize: 10.5 }}>{ZONE_LABEL_FA[z]}</div></div>)}</div>
          </div>
        </div>
      </div>

      {cell && (
        <div className="im-card" style={{ marginBottom: 14 }}>
          <div className="im-section-title">ریسک‌های خانهٔ احتمال {cell.p} × اثر {cell.i} ({MODE_LABEL[mode]}) <span className="im-chip">{inCell.length}</span><button className="im-ghostlink" onClick={() => setCell(null)}>بستن</button></div>
          {inCell.length === 0 ? <div className="im-helper">ریسکی در این خانه نیست.</div> : inCell.map((r) => <button key={r.id} className="im-task" style={{ display: 'flex', width: '100%', textAlign: 'right', justifyContent: 'space-between', gap: 8, marginBottom: 6 }} onClick={() => onOpenRisk(r.id)}><span><span className="im-code">{r.code}</span> <b>{r.title}</b></span><ScoreTriple state={d.states.get(r.id)!} policy={d.policyFor(r.projectId)} /></button>)}
        </div>
      )}

      <div className="im-card" style={{ marginBottom: 14 }}>
        <div className="im-section-title">روند مواجهه (۶ ماه اخیر) <span className="im-helper">تعداد ریسک در هر سطح؛ از آخرین ارزیابی در هر تاریخ</span></div>
        <Trend labels={months.map((m) => formatJalali(m).slice(0, 7))} series={trend} height={170} />
      </div>

      <div className="im-card">
        <div className="im-section-title"><Clock size={16} style={{ color: 'var(--im-amber)' }} /> نیازمند ارزیابی یا بازنگری <span className="im-chip">{queue.length}</span></div>
        {queue.length === 0 ? <div className="im-notice ok">همهٔ ارزیابی‌ها به‌روز است.</div> : (
          <div className="im-table-wrap"><table className="im-table"><thead><tr><th>ریسک</th><th>وضعیت</th><th>امتیاز</th><th>موعد</th><th>دلیل</th></tr></thead><tbody>
            {queue.slice(0, 60).map(({ r, s }) => (
              <tr key={r.id} className="rk-row-click" onClick={() => onOpenRisk(r.id, 'assessment')}>
                <td><span className="im-code">{r.code}</span> <b>{r.title}</b></td>
                <td><StatusChip status={r.status} /></td>
                <td><ScoreTriple state={s} policy={d.policyFor(r.projectId)} /></td>
                <td className="im-helper" style={{ color: s.reviewOverdue ? 'var(--im-coral)' : undefined }}>{formatJalali(s.reviewDue)}</td>
                <td><div className="rk-flags" style={{ marginTop: 0 }}>
                  {s.needsReviewRequest && <span className="rk-flag" style={{ ['--c' as string]: '#ef4444' }}><Siren size={10} />{r.reviewRequestReason || 'درخواست بازنگری'}</span>}
                  {s.reviewOverdue && <span className="rk-flag" style={{ ['--c' as string]: '#f59e0b' }}><AlertTriangle size={10} />{-s.reviewDaysLeft} روز عقب‌افتاده</span>}
                  {s.assessmentCount === 0 && <span className="rk-flag" style={{ ['--c' as string]: '#94a3b8' }}><FileQuestion size={10} />هنوز ارزیابی نشده</span>}
                  {s.stale && s.assessmentCount > 0 && <span className="rk-flag" style={{ ['--c' as string]: '#94a3b8' }}>ارزیابی قدیمی</span>}
                  <LevelChip level={s.level} />
                </div><div className="im-helper">{dir.name(r.monitorId ?? r.ownerId)}</div></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>
    </div>
  )
}
