import { useId, useMemo, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { Spark, useCountUp } from '../../executive/components/viz'
import { DEF, STATUS_COLOR, STATUS_FA, rangeText, type Band, type HealthResult, type Indicator, type OrganKey, type Status } from '../lib/healthCore'

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

export function StatusChip({ status, flag }: { status: Status; flag?: string }) {
  return (
    <span className="phc-chip" style={{ ['--c' as string]: STATUS_COLOR[status] }}>
      <i aria-hidden />{STATUS_FA[status]}{flag ? <b>{flag}</b> : null}
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
              <tr key={id} className={ind.status === 'critical' || ind.status === 'bad' ? 'is-out' : ''} onClick={() => onOpen(id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(id) } }}>
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
/** hotspot positions on the 200×400 body, and which side the label sits on */
const SPOT: Record<OrganKey, { x: number; y: number; side: 'l' | 'r' }> = {
  brain: { x: 100, y: 40, side: 'r' }, nerves: { x: 100, y: 92, side: 'l' }, lungs: { x: 80, y: 130, side: 'l' }, heart: { x: 114, y: 136, side: 'r' },
  immune: { x: 100, y: 196, side: 'r' }, muscles: { x: 42, y: 180, side: 'l' }, skeleton: { x: 84, y: 300, side: 'l' },
}

export function OrganBody({ r, picked, onPick }: { r: HealthResult; picked: OrganKey | null; onPick: (k: OrganKey) => void }) {
  return (
    <div className="phc-body">
      <svg viewBox="0 0 200 400" className="phc-body-svg" aria-hidden>
        <defs>
          <linearGradient id="phcBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#22d3ee" stopOpacity=".28" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity=".06" />
          </linearGradient>
        </defs>
        <g className="phc-body-shape">
          <ellipse cx="100" cy="42" rx="24" ry="28" />
          <path d="M90 68 h20 v14 h-20 Z" />
          <path d="M58 88 Q100 74 142 88 L150 150 Q146 210 134 236 L66 236 Q54 210 50 150 Z" />
          <path d="M58 90 Q40 96 36 140 L30 214 L42 216 L52 150 Z" />
          <path d="M142 90 Q160 96 164 140 L170 214 L158 216 L148 150 Z" />
          <path d="M68 236 L64 380 L88 380 L98 252 L102 252 L112 380 L136 380 L132 236 Z" />
        </g>
        {/* spine and nerves */}
        <path d="M100 70 L100 236" className="phc-body-spine" />
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M100 ${92 + i * 12} l${i % 2 ? 10 : -10} 4`} className="phc-body-nerve" />)}
        {/* ribs */}
        {Array.from({ length: 5 }, (_, i) => <path key={i} d={`M66 ${110 + i * 12} Q100 ${100 + i * 12} 134 ${110 + i * 12}`} className="phc-body-rib" />)}
        <path d="M84 120 q-14 6 -12 34 q8 6 18 -2 Z M116 120 q14 6 12 34 q-8 6 -18 -2 Z" className="phc-body-lung" />
        <path d="M78 300 L82 360 M122 300 L118 360" className="phc-body-rib" />
        <line x1="0" x2="200" y1="0" y2="0" className="phc-body-scan" />
      </svg>
      {r.organs.map((o) => {
        const s = SPOT[o.key], c = STATUS_COLOR[o.status]
        return (
          <button key={o.key} type="button" className={`phc-organ is-${s.side}${picked === o.key ? ' is-picked' : ''}`} style={{ left: `${(s.x / 200) * 100}%`, top: `${(s.y / 400) * 100}%`, ['--c' as string]: c }} onClick={() => onPick(o.key)} aria-label={`${ORGAN_FA[o.key].name} — ${ORGAN_FA[o.key].role}: ${o.score == null ? 'داده ناقص' : `${fa(o.score)} از ۱۰۰`}`}>
            <i aria-hidden />
            <span className="phc-organ-tag"><b>{ORGAN_FA[o.key].name}</b><small>{o.score == null ? 'ناقص' : fa(o.score)}</small></span>
          </button>
        )
      })}
    </div>
  )
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
