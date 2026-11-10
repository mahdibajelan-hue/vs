import { useId, useMemo, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, CircleCheck, CircleHelp, Eye, Minus, Siren, TriangleAlert } from 'lucide-react'
import { Spark, useCountUp } from '../../executive/components/viz'
import { DEF, STATUS_COLOR, STATUS_FA, rangeText, type Band, type HealthResult, type Indicator, type OrganKey, type Status } from '../lib/healthCore'
import { pressable } from '../../../lib/pressable'

export const fa = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('fa-IR', { maximumFractionDigits: d }))
export const valueText = (id: string, v: number | null) => (v == null ? 'داده ناقص' : fa(v, DEF[id]?.digits ?? 0))

/** is a higher value better for this indicator? */
const upIsGood = (b: Band) => b.good > b.bad

export function Trend({ id, ind, band }: { id: string; ind: Indicator; band: Band }) {
  if (ind.value == null || ind.prev == null) return <span className="phc-trend is-none">بدون سابقه</span>
  const d = ind.value - ind.prev
  if (Math.abs(d) < 1e-9) return <span className="phc-trend is-flat"><Minus size={12} aria-hidden /> بدون تغییر</span>
  const better = upIsGood(band) ? d > 0 : d < 0
  return (
    <span className={`phc-trend ${better ? 'is-up' : 'is-down'}`} title={`آزمایش قبلی: ${valueText(id, ind.prev)}`}>
      {d > 0 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
      {fa(Math.abs(d), DEF[id]?.digits ?? 0)}
    </span>
  )
}

const STATUS_ICON = { good: CircleCheck, watch: Eye, bad: TriangleAlert, critical: Siren, none: CircleHelp } as const
export function StatusIcon({ status, size = 13 }: { status: Status; size?: number }) {
  const Icon = STATUS_ICON[status]
  return <Icon size={size} strokeWidth={2} aria-hidden />
}

export function StatusChip({ status, flag }: { status: Status; flag?: string }) {
  return (
    <span className="phc-chip" style={{ ['--c' as string]: STATUS_COLOR[status] }}>
      <StatusIcon status={status} size={12} />{STATUS_FA[status]}{flag ? <b>{flag}</b> : null}
    </span>
  )
}

/* ── the health index: a holographic ring ─────────────────────────── */

export function HoloRing({ value, color, label, sub }: { value: number; color: string; label: string; sub: ReactNode }) {
  const shown = useCountUp(value, 900)
  const R = 84, C = 2 * Math.PI * R
  const ticks = useMemo(() => Array.from({ length: 60 }, (_, i) => i), [])
  return (
    <div className="phc-holo" style={{ ['--c' as string]: color }} role="img" aria-label={`شاخص سلامت ${fa(value)} از ۱۰۰، ${label}`}>
      <svg viewBox="0 0 220 220">
        <circle cx="110" cy="110" r="104" className="phc-holo-halo" />
        {ticks.map((i) => {
          const a = (i / 60) * Math.PI * 2 - Math.PI / 2, r1 = 98, r2 = i % 5 ? 94 : 90
          return <line key={i} x1={110 + r1 * Math.cos(a)} y1={110 + r1 * Math.sin(a)} x2={110 + r2 * Math.cos(a)} y2={110 + r2 * Math.sin(a)} className={i / 60 <= value / 100 ? 'on' : ''} />
        })}
        <circle cx="110" cy="110" r={R} className="phc-holo-track" />
        <circle cx="110" cy="110" r={R} className="phc-holo-val" strokeDasharray={`${(C * shown) / 100} ${C}`} transform="rotate(-90 110 110)" />
        <circle cx="110" cy="110" r="66" className="phc-holo-inner" />
      </svg>
      <div className="phc-holo-txt">
        <b>{fa(Math.round(shown))}</b>
        <small>از ۱۰۰</small>
        <span>{label}</span>
        <em>{sub}</em>
      </div>
    </div>
  )
}

/* ── vital signs ──────────────────────────────────────────────────── */

/** an ECG trace: one PQRST beat per measured period, the R wave as tall as that period's earned progress */
export function Ecg({ beats, color }: { beats: number[]; color: string }) {
  const id = useId()
  const W = 300, H = 70, base = 44
  const max = Math.max(...beats.map((b) => Math.abs(b)), 0.0001)
  const list = beats.length ? beats.slice(-8) : []
  const step = list.length ? W / list.length : W
  let d = `M0,${base}`
  list.forEach((b, i) => {
    const x = i * step, amp = 6 + (Math.max(0, b) / max) * 34
    d += ` L${x + step * 0.2},${base} q${step * 0.05},-5 ${step * 0.1},0 L${x + step * 0.38},${base} l${step * 0.04},5 l${step * 0.05},${-amp - 5} l${step * 0.05},${amp + 13} l${step * 0.04},-8 L${x + step * 0.66},${base} q${step * 0.08},-9 ${step * 0.16},0 L${x + step},${base}`
  })
  return (
    <svg className="phc-ecg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`ecg${id}`} x1="0" x2="1">
          <stop offset="0" stopColor={color} stopOpacity=".15" />
          <stop offset=".85" stopColor={color} stopOpacity="1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="1" />
        </linearGradient>
      </defs>
      {list.length ? <path d={d} fill="none" stroke={`url(#ecg${id})`} strokeWidth="2" strokeLinejoin="round" className="phc-ecg-line" /> : <path d={`M0,${base} L${W},${base}`} stroke={color} strokeOpacity=".4" strokeDasharray="4 6" />}
    </svg>
  )
}

export interface VitalView { key: string; id: string; title: string; medical: string; display: ReactNode; unit: string; range: string; ind: Indicator; color: string; chart: ReactNode }

export function VitalCard({ v, band, onOpen }: { v: VitalView; band: Band; onOpen: () => void }) {
  return (
    <button type="button" className="phc-vital" style={{ ['--c' as string]: v.color }} onClick={onOpen}>
      <span className="phc-vital-head">
        <span className="phc-vital-med">{v.medical}</span>
        <span className="phc-vital-name">{v.title}</span>
      </span>
      <span className="phc-vital-val"><b>{v.display}</b><small>{v.unit}</small></span>
      <span className="phc-vital-chart">{v.chart}</span>
      <span className="phc-vital-foot">
        <span>{v.range}</span>
        <Trend id={v.id} ind={v.ind} band={band} />
      </span>
    </button>
  )
}

export const spark = (values: number[], color: string) => (values.length >= 2 ? <Spark values={values} color={color} width={240} height={46} /> : <span className="phc-nochart">سری زمانی کافی نیست</span>)

/* ── the blood test ───────────────────────────────────────────────── */

export const LAB_ORDER = ['ncr_open', 'manpower_cap', 'manpower_util', 'platelets', 'crp', 'esr', 'cash_flow', 'payables', 'vac_pct', 'resource_balance']
export const LAB_CODE: Record<string, string> = { ncr_open: 'WBC', manpower_cap: 'RBC', manpower_util: 'HGB', platelets: 'PLT', crp: 'CRP', esr: 'ESR', cash_flow: 'GLU', payables: 'CREA', vac_pct: 'ALB', resource_balance: 'ELEC' }

/** H / L flag on an out-of-range result, the way a lab report marks it */
export function labFlag(ind: Indicator, b: Band): string | undefined {
  if (ind.value == null || ind.status === 'good') return undefined
  return ind.value > b.good ? 'H' : 'L'
}

export function LabTable({ r, bands, onOpen }: { r: HealthResult; bands: Record<string, Band>; onOpen: (id: string) => void }) {
  return (
    <div className="phc-lab-wrap">
      <table className="phc-lab">
        <thead>
          <tr><th>آزمایش</th><th>نتیجه</th><th>محدودهٔ مرجع</th><th>واحد</th><th>وضعیت</th><th>نسبت به آزمایش قبل</th></tr>
        </thead>
        <tbody>
          {LAB_ORDER.map((id) => {
            const d = DEF[id], ind = r.indicators[id], b = bands[id]
            return (
              <tr key={id} className={ind.status === 'critical' || ind.status === 'bad' ? 'is-out' : ''} {...pressable(() => onOpen(id), { row: true })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id) } }}>
                <td><span className="phc-lab-code">{LAB_CODE[id]}</span><span className="phc-lab-name"><b>{d.medical}</b><small>{d.label}</small></span></td>
                <td className="phc-lab-val" style={{ color: STATUS_COLOR[ind.status] }}>{valueText(id, ind.value)}</td>
                <td className="phc-lab-range">{rangeText(id, b)}</td>
                <td className="phc-lab-unit">{d.unit}</td>
                <td><StatusChip status={ind.status} flag={labFlag(ind, b)} /></td>
                <td><Trend id={id} ind={ind} band={b} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── organs on a holographic body ─────────────────────────────────── */

export const ORGAN_FA: Record<OrganKey, { name: string; role: string }> = {
  brain: { name: 'مغز', role: 'مدیریت و تصمیم‌گیری' },
  heart: { name: 'قلب', role: 'برنامه‌ریزی و کنترل پروژه' },
  lungs: { name: 'ریه‌ها', role: 'تأمین کالا و تجهیزات' },
  muscles: { name: 'عضلات', role: 'پیمانکار و توان اجرایی' },
  skeleton: { name: 'اسکلت', role: 'ساختار قرارداد و سازمان' },
  nerves: { name: 'سیستم عصبی', role: 'ارتباطات و جریان اطلاعات' },
  immune: { name: 'سیستم ایمنی', role: 'مدیریت ریسک' },
}
/* ── a small score ring (immune system) ───────────────────────────── */
export function ScoreRing({ score, label, value, size = 92, onClick }: { score: number | null; label: string; value: string; size?: number; onClick?: () => void }) {
  const st: Status = score == null ? 'none' : score >= 80 ? 'good' : score >= 55 ? 'watch' : score >= 30 ? 'bad' : 'critical'
  const R = 38, C = 2 * Math.PI * R
  return (
    <button type="button" className="phc-sring" style={{ ['--c' as string]: STATUS_COLOR[st] }} onClick={onClick}>
      <svg viewBox="0 0 92 92" width={size} height={size} aria-hidden>
        <circle cx="46" cy="46" r={R} className="phc-sring-track" />
        <circle cx="46" cy="46" r={R} className="phc-sring-val" strokeDasharray={`${(C * (score ?? 0)) / 100} ${C}`} transform="rotate(-90 46 46)" />
        <text x="46" y="51" textAnchor="middle">{score == null ? '—' : fa(score)}</text>
      </svg>
      <b>{label}</b>
      <small>{value}</small>
    </button>
  )
}
