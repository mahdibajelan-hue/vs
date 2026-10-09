import type { ReactNode } from 'react'
import { RISK_LEVEL_LABEL_FA, type RiskLevel } from '../lib/riskScore'
import { ZONE_COLOR, ZONE_LABEL_FA, levelOf, type RiskZone } from '../lib/riskPolicy'
import type { RiskState } from '../lib/riskState'
import { RM_CATEGORY_LABEL_FA, RM_RISK_STATUS_COLOR, RM_RISK_STATUS_LABEL_FA, type RmPolicy, type RmRisk } from '../types'
import { DEFAULT_POLICY } from '../lib/riskPolicy'
import { useRiskStore } from '../store/useRiskStore'

export const LEVELS: RiskLevel[] = ['low', 'medium', 'high', 'critical']

export function LevelChip({ level }: { level: RiskLevel }) {
  return <span className={`im-chip rk-lv-${level}`} style={{ color: 'var(--c)', borderColor: 'color-mix(in srgb, var(--c) 40%, transparent)' }}><span className="im-chip-dot" style={{ background: 'var(--c)' }} />{RISK_LEVEL_LABEL_FA[level]}</span>
}

export function ZoneBadge({ zone }: { zone: RiskZone }) {
  return <span className="rk-flag" style={{ ['--c' as string]: ZONE_COLOR[zone] }}>{ZONE_LABEL_FA[zone]}</span>
}

export function StatusChip({ status }: { status: RmRisk['status'] }) {
  const c = RM_RISK_STATUS_COLOR[status]
  return <span className="rk-flag" style={{ ['--c' as string]: c }}>{RM_RISK_STATUS_LABEL_FA[status]}</span>
}

export function ScoreBox({ score, label, policy = DEFAULT_POLICY }: { score: number; label?: string; policy?: RmPolicy }) {
  return <span className={`rk-sc rk-lv-${levelOf(score, policy)}`}>{score}{label && <small>{label}</small>}</span>
}

/** Inherent → current → residual, side by side; the three are different numbers with different meaning and are never merged. */
export function ScoreTriple({ state, policy = DEFAULT_POLICY, large }: { state: Pick<RiskState, 'inherent' | 'current' | 'residual'>; policy?: RmPolicy; large?: boolean }) {
  return (
    <span className={`rk-s3 ${large ? 'lg' : ''}`} title="ذاتی ← فعلی ← باقیمانده" role="group" aria-label={`ذاتی ${state.inherent}، فعلی ${state.current}، باقیمانده ${state.residual}`}>
      <ScoreBox score={state.inherent} label="ذاتی" policy={policy} /><span className="arr" aria-hidden>‹</span>
      <ScoreBox score={state.current} label="فعلی" policy={policy} /><span className="arr" aria-hidden>‹</span>
      <ScoreBox score={state.residual} label="باقیمانده" policy={policy} />
    </span>
  )
}

export function useCategoryLabel() {
  const cats = useRiskStore((s) => s.categories)
  return (key: string | null | undefined) => (key ? cats.find((c) => c.key === key)?.labelFa ?? RM_CATEGORY_LABEL_FA[key] ?? key : '—')
}

export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="im-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <div className="im-err" role="alert">{error}</div> : hint ? <div className="im-helper">{hint}</div> : null}
    </div>
  )
}

export function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return <section className="rk-sect"><h3>{icon}{title}</h3>{children}</section>
}

/** 1…5 button scale with anchors; `colorOf` tints the selected value. */
export function Scale({ value, onChange, labels, anchors, disabled }: { value: number; onChange: (v: number) => void; labels?: string[]; anchors?: string[]; disabled?: boolean }) {
  return (
    <div className="rk-scale" role="radiogroup">
      {[1, 2, 3, 4, 5].map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled} className={value === v ? 'on' : ''} onClick={() => onChange(v)} title={anchors?.[v - 1]}>
          {v}
          {labels && <small>{labels[v - 1]}</small>}
        </button>
      ))}
    </div>
  )
}

export function Sparkline({ values, color = 'var(--im-accent)', height = 44, thresholds }: { values: number[]; color?: string; height?: number; thresholds?: number[] }) {
  if (values.length < 2) return <div className="im-helper" style={{ height }}>داده کافی برای روند نیست</div>
  const w = 240
  const all = [...values, ...(thresholds ?? [])]
  const min = Math.min(...all), max = Math.max(...all), span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * w
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="rk-spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ ['--c' as string]: color, height }} aria-hidden>
      {thresholds?.map((t) => <line key={t} x1="0" x2={w} y1={y(t)} y2={y(t)} />)}
      <path className="a" d={`${d} L${w} ${height} L0 ${height} Z`} />
      <path className="l" d={d} />
    </svg>
  )
}

export function PersonSelect({ value, onChange, people, placeholder = '— انتخاب نشده —', id, disabled }: { value: string | null; onChange: (v: string | null) => void; people: { userId: string; name: string; position?: string }[]; placeholder?: string; id?: string; disabled?: boolean }) {
  return (
    <select id={id} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {people.map((p) => <option key={p.userId} value={p.userId}>{p.name}{p.position ? ' · ' + p.position : ''}</option>)}
    </select>
  )
}

export const nf = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'))
export const digitsOnly = (v: string): number => Number(v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^\d]/g, '')) || 0
