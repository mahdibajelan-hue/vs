import { useMemo, useState } from 'react'
import { useTabIndicator } from '../../../components/common/useTabIndicator'
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { isoToJalali, JALALI_MONTHS } from '../../../lib/jalali'
import type { PfProjectView } from '../lib/portfolioCore'
import { gapOf, portfolioTrend } from '../lib/dashboardCore'
import { faNum } from './pfUi'

type Mode = 'projects' | 'trend'
const short = (s: string) => s.replace(/^(پروژهٔ فرضی: |احداث |توسعه |پروژه )/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim()
const monthFa = (iso: string) => { const j = isoToJalali(iso); return j ? `${JALALI_MONTHS[j.jm - 1]} ${faNum(j.jy % 100)}` : iso }
const tone = (gap: number) => (gap >= -3 ? '#16a34a' : gap >= -8 ? '#f59e0b' : '#ef4444')
const tip = { background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 12, fontSize: 12, direction: 'rtl' as const, boxShadow: '0 12px 30px -12px rgb(15 23 42 / .35)' }

/**
 * Progress in two readings. «Plan vs actual» is the one a manager acts on: every project's lifecycle progress beside
 * its plan, worst gap first, the bar coloured by how far behind it is. «Monthly trend» is the budget-weighted EPC
 * curve of the projects that report one — shown with how many projects each month rests on.
 */
export function ProgressChart({ views }: { views: PfProjectView[] }) {
  const [mode, setMode] = useState<Mode>('projects')
  const segInd = useTabIndicator<HTMLDivElement>(mode)
  const rows = useMemo(() => views.filter((v) => v.input.snapshot).map((v) => ({ name: short(v.input.name), full: v.input.name, planned: Number(v.input.snapshot!.planned.toFixed(1)), actual: Number(v.input.snapshot!.actual.toFixed(1)), gap: gapOf(v) ?? 0 }))
    .sort((a, b) => a.gap - b.gap), [views])
  const trend = useMemo(() => portfolioTrend(views).map((p) => ({ label: monthFa(p.date), planned: Number(p.planned.toFixed(1)), earned: p.earned == null ? null : Number(p.earned.toFixed(1)), n: p.n })), [views])
  const reporting = trend.length ? Math.max(...trend.map((t) => t.n)) : 0

  return (
    <div className="pc">
      <div className="pc-head">
        <div ref={segInd.list} className="pc-seg" role="tablist" aria-label="نمای پیشرفت">
          <span ref={segInd.indicator} className="tab-ind pc-seg-ind" aria-hidden />
          <button type="button" role="tab" aria-selected={mode === 'projects'} onClick={() => setMode('projects')}>برنامه در برابر واقعی</button>
          <button type="button" role="tab" aria-selected={mode === 'trend'} onClick={() => setMode('trend')}>روند ماهانه</button>
        </div>
        {mode === 'projects'
          ? <ul className="pc-key"><li><i className="is-plan" />برنامه</li><li><i style={{ background: '#16a34a' }} />تا ۳ واحد عقب</li><li><i style={{ background: '#f59e0b' }} />۳ تا ۸</li><li><i style={{ background: '#ef4444' }} />بیش از ۸</li></ul>
          : <ul className="pc-key"><li><i style={{ background: '#2563eb' }} />برنامه</li><li><i style={{ background: '#16a34a' }} />واقعی</li></ul>}
      </div>

      {mode === 'projects' ? (
        !rows.length ? <p className="pd-empty">شاخص پیشرفت هیچ پروژه‌ای ثبت نشده است.</p> : (
          <div className="pc-chart" dir="ltr" style={{ height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={rows} margin={{ top: 10, right: 6, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="var(--border-soft)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="name" interval={0} tickLine={false} axisLine={{ stroke: 'var(--border-soft)' }} height={78}
                  tick={({ x, y, payload }) => <text x={x} y={y} dy={6} transform={`rotate(-38 ${x} ${y})`} textAnchor="end" fontSize={9.5} fill="var(--text-muted)">{String(payload.value).length > 18 ? `${String(payload.value).slice(0, 18)}…` : payload.value}</text>} />
                {/* a second, hidden category axis lays the actual bar exactly over the centre of the plan bar */}
                <XAxis xAxisId="over" dataKey="name" hide />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${faNum(v)}٪`} tick={{ fontSize: 10.5, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip isAnimationActive={false} cursor={{ fill: 'color-mix(in srgb, var(--text-muted) 8%, transparent)' }} contentStyle={tip} labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string })?.full ?? ''}
                  formatter={(v, k, item) => (k === 'planned' ? [`${faNum(Number(v), 1)}٪`, 'برنامه'] : [`${faNum(Number(v), 1)}٪ (${faNum((item.payload as { gap: number }).gap, 1)} واحد)`, 'واقعی'])} />
                <Bar dataKey="planned" barSize={18} radius={[5, 5, 0, 0]} fill="var(--pc-plan)" isAnimationActive />
                <Bar xAxisId="over" dataKey="actual" barSize={9} radius={[4, 4, 0, 0]} isAnimationActive animationBegin={150}>
                  {rows.map((r, i) => <Cell key={i} fill={tone(r.gap)} />)}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )
      ) : (
        trend.length < 3 ? <p className="pd-empty">برای روند ماهانه دست‌کم سه ماه منحنی پیشرفت EPC لازم است؛ اکنون {faNum(reporting)} پروژه منحنی ماهانه دارند.</p> : (
          <div className="pc-chart" dir="ltr" style={{ height: 250 }}>
            <ResponsiveContainer>
              <ComposedChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pcEarned" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16a34a" stopOpacity={0.28} /><stop offset="100%" stopColor="#16a34a" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-soft)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border-soft)' }} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${faNum(v)}٪`} tick={{ fontSize: 10.5, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={40} />
                <ReferenceLine y={100} stroke="var(--border-soft)" />
                <Tooltip isAnimationActive={false} contentStyle={tip} formatter={(v, k) => [v == null ? '—' : `${faNum(Number(v), 1)}٪`, k === 'planned' ? 'برنامه' : 'واقعی']} labelFormatter={(l, p) => `${l} · ${faNum((p?.[0]?.payload as { n?: number })?.n ?? 0)} پروژه`} />
                <Area type="monotone" dataKey="earned" stroke="#16a34a" strokeWidth={2.4} fill="url(#pcEarned)" connectNulls dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="planned" stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )
      )}
      <p className="pd-note">{mode === 'projects'
        ? `${faNum(rows.length)} پروژه، به ترتیب بیشترین عقب‌ماندگی از چپ به راست. پیشرفت چرخهٔ عمر؛ نوار پهن کم‌رنگ برنامه و نوار باریک واقعی است.`
        : `میانگین وزنی با بودجهٔ EPC؛ هر ماه بر پایهٔ پروژه‌هایی که برای آن ماه منحنی دارند (حداکثر ${faNum(reporting)} پروژه).`}</p>
    </div>
  )
}
