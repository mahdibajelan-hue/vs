import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { JalaliDateInput } from '../platform'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import type { Activity } from '../types'
import { ACTIVITY_PRESETS } from '../lib/labels'
import { STATUS_COLOR } from '../lib/status'
import { addDays, diffDays, fmtKm } from '../lib/dates'
import { fmtDateShort, fmtMonth } from '../lib/fa'
import { Card, ConfirmDialog, EmptyState, Field } from '../components/ui'
import { NoRoute } from '../components/shared'

const ACT_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#fb923c', '#94a3b8']

/**
 * Time–distance (linear) schedule. X = chainage, Y = time going down. Each activity is a diagonal (its front moving down the
 * route); each unreleased parcel is a band: the bar shows when the land is expected to be free, the tick when the work needs it.
 * Where the bar sits below the tick, the land holds the schedule up.
 */
export function SchedulePage() {
  const data = useLandStore((s) => s.data)
  const select = useLandStore((s) => s.selectParcel)
  const selectedId = useLandStore((s) => s.selectedId)
  const saveActivity = useLandStore((s) => s.saveActivity)
  const deleteActivity = useLandStore((s) => s.deleteActivity)
  const { rows, today } = useLandAnalysis()
  const [del, setDel] = useState<Activity | null>(null)
  const acts = useMemo(() => data?.activities ?? [], [data?.activities])

  const chart = useMemo(() => {
    if (!data?.route) return null
    const r = data.route
    const dates = [today, ...acts.flatMap((a) => [a.startDate, a.endDate]), ...rows.filter((x) => !x.released).map((x) => x.early.projectedRelease)]
    const t0 = addDays(dates.reduce((m, d) => (d < m ? d : m)), -10)
    const t1 = addDays(dates.reduce((m, d) => (d > m ? d : m)), 15)
    return { r, t0, t1, span: Math.max(1, diffDays(t1, t0)) }
  }, [data?.route, acts, rows, today])

  if (!data?.route || !chart) return <NoRoute />
  const W = 1000, H = 520, L = 56, R = 16, T = 18, B = 34
  const x = (k: number) => L + ((k - chart.r.startKm) / chart.r.totalKm) * (W - L - R)
  const y = (d: string) => T + (diffDays(d, chart.t0) / chart.span) * (H - T - B)
  const months: string[] = []
  for (let d = chart.t0.slice(0, 8) + '01'; d <= chart.t1; d = addDays(d, 31).slice(0, 8) + '01') if (d >= chart.t0) months.push(d)
  const kmTicks: number[] = []
  const step = chart.r.totalKm > 150 ? 20 : chart.r.totalKm > 40 ? 10 : 5
  for (let k = Math.ceil(chart.r.startKm / step) * step; k <= chart.r.startKm + chart.r.totalKm; k += step) kmTicks.push(k)

  const add = () => {
    const last = acts[acts.length - 1]
    const preset = ACTIVITY_PRESETS[acts.length % ACTIVITY_PRESETS.length]
    void saveActivity({ key: preset.key, name: preset.name, kmStart: chart.r.startKm, kmEnd: chart.r.startKm + chart.r.totalKm, startDate: last ? addDays(last.startDate, 20) : today, endDate: last ? addDays(last.endDate, 20) : addDays(today, 180), sequence: acts.length + 1, isDemo: false })
  }

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <Card title="برنامهٔ زمان‌بندی خطی (زمان – کیلومتر)" hint="خطوط مورب پیشروی فعالیت‌ها هستند؛ میله‌های رنگی زمان تخمینی آزادسازی هر قطعه و نشانهٔ سفید زمانی است که فعالیت زمین را لازم دارد">
        {acts.length === 0 ? (
          <EmptyState icon={<Plus size={20} />} title="فعالیتی تعریف نشده" text="فعالیت‌های اجرایی (Clearing، Stringing، Welding، Lowering، Backfilling) را با بازهٔ کیلومتر و تاریخ اضافه کنید تا مهلت آزادسازی هر قطعه محاسبه شود." action={<button className="la-btn la-btn-primary" onClick={add}>افزودن فعالیت</button>} />
        ) : (
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 720, width: '100%', display: 'block', direction: 'ltr' }} role="img" aria-label="نمودار زمان – کیلومتر">
              {months.map((m) => (
                <g key={m}>
                  <line x1={L} x2={W - R} y1={y(m)} y2={y(m)} stroke="var(--la-grid)" />
                  <text x={L - 8} y={y(m) + 3} textAnchor="end" fontSize={10} fill="var(--la-muted)">{fmtMonth(m)}</text>
                </g>
              ))}
              {kmTicks.map((k) => (
                <g key={k}>
                  <line x1={x(k)} x2={x(k)} y1={T} y2={H - B} stroke="var(--la-grid)" />
                  <text x={x(k)} y={H - B + 16} textAnchor="middle" fontSize={10} fill="var(--la-muted)" style={{ fontFamily: 'var(--font-mono)' }}>{k}</text>
                </g>
              ))}
              {/* parcel bands */}
              {rows.map((r) => {
                const sel = r.parcel.id === selectedId
                const x0 = x(r.parcel.kmStart), w = Math.max(1.5, x(r.parcel.kmEnd) - x0)
                const rel = r.early.projectedRelease
                const late = !r.released && r.early.needBy != null && r.early.delayDays > 0
                return (
                  <g key={r.parcel.id} onClick={() => select(r.parcel.id)} style={{ cursor: 'pointer' }}>
                    <rect x={x0} y={T} width={w} height={H - T - B} fill={STATUS_COLOR[r.status]} opacity={sel ? 0.22 : r.released ? 0.05 : 0.1} />
                    {!r.released && <rect x={x0} y={y(rel) - 2} width={w} height={4} fill={late ? '#ef4444' : STATUS_COLOR[r.status]} rx={1} />}
                    {!r.released && r.early.needBy && <rect x={x0} y={y(r.early.needBy) - 1} width={w} height={2} fill="var(--la-ink)" />}
                    {late && <line x1={x0 + w / 2} x2={x0 + w / 2} y1={y(r.early.needBy!)} y2={y(rel)} stroke="#ef4444" strokeWidth={1} opacity={0.8} />}
                  </g>
                )
              })}
              {/* activity diagonals */}
              {acts.map((a, i) => (
                <g key={a.id} style={{ pointerEvents: 'none' }}>
                  <line x1={x(a.kmStart)} y1={y(a.startDate)} x2={x(a.kmEnd)} y2={y(a.endDate)} stroke={ACT_COLORS[i % ACT_COLORS.length]} strokeWidth={3} strokeLinecap="round" />
                  <text x={x(a.kmEnd) - 4} y={y(a.endDate) - 7} textAnchor="end" fontSize={10.5} fontWeight={700} fill={ACT_COLORS[i % ACT_COLORS.length]} stroke="var(--la-surface)" strokeWidth={3} paintOrder="stroke">{a.name}</text>
                </g>
              ))}
              {/* today */}
              <line x1={L} x2={W - R} y1={y(today)} y2={y(today)} stroke="var(--la-accent)" strokeDasharray="5 4" />
              <text x={W - R} y={y(today) - 5} textAnchor="end" fontSize={10.5} fontWeight={700} fill="var(--la-accent)">امروز · {fmtDateShort(today)}</text>
            </svg>
          </div>
        )}
      </Card>

      <Card title="فعالیت‌های اجرایی" hint="هر فعالیت با یک بازهٔ کیلومتر و تاریخ شروع/پایان؛ پیشروی خطی فرض می‌شود" action={<button className="la-btn la-btn-sm" onClick={add}><Plus size={14} /> فعالیت جدید</button>}>
        {acts.length === 0 ? <p className="la-eyebrow">هنوز فعالیتی نیست.</p> : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {acts.map((a) => <ActivityRow key={a.id} a={a} total={chart.r.startKm + chart.r.totalKm} onSave={(patch) => saveActivity({ ...a, ...patch })} onDelete={() => setDel(a)} />)}
          </ul>
        )}
      </Card>
      {del && <ConfirmDialog title="حذف فعالیت" confirmLabel="حذف" description={<>فعالیت <b>{del.name}</b> حذف می‌شود و مهلت آزادسازی قطعه‌ها دوباره محاسبه خواهد شد.</>} onClose={() => setDel(null)} onConfirm={async () => { await deleteActivity(del.id); setDel(null) }} />}
    </div>
  )
}

function ActivityRow({ a, total, onSave, onDelete }: { a: Activity; total: number; onSave: (p: Partial<Activity>) => void; onDelete: () => void }) {
  const bad = a.endDate < a.startDate || a.kmEnd <= a.kmStart
  return (
    <li className="la-card-flat grid grid-cols-2 items-end gap-3 p-3 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto]">
      <Field label="نام فعالیت">
        <input className="la-input" list="la-act-names" defaultValue={a.name} key={a.name} onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && onSave({ name: e.target.value.trim(), key: e.target.value.trim().toLowerCase() })} />
      </Field>
      <Field label="از کیلومتر"><input className="la-input la-num" type="number" step={0.5} defaultValue={a.kmStart} key={`s${a.kmStart}`} onBlur={(e) => onSave({ kmStart: Number(e.target.value) })} /></Field>
      <Field label="تا کیلومتر"><input className="la-input la-num" type="number" step={0.5} max={total} defaultValue={a.kmEnd} key={`e${a.kmEnd}`} onBlur={(e) => onSave({ kmEnd: Number(e.target.value) })} /></Field>
      <Field label="شروع"><JalaliDateInput value={a.startDate} onChange={(v) => onSave({ startDate: v })} /></Field>
      <Field label="پایان"><JalaliDateInput value={a.endDate} onChange={(v) => onSave({ endDate: v })} /></Field>
      <button className="la-btn la-btn-ghost la-btn-icon" onClick={onDelete} aria-label={`حذف ${a.name}`}><Trash2 size={15} /></button>
      {bad && <p className="la-hint col-span-full" style={{ color: 'var(--la-bad)' }}>بازهٔ کیلومتر یا تاریخ معتبر نیست ({fmtKm(a.kmStart)} تا {fmtKm(a.kmEnd)}).</p>}
      <datalist id="la-act-names">{ACTIVITY_PRESETS.map((p) => <option key={p.key} value={p.name} />)}</datalist>
    </li>
  )
}
