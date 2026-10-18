import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, FileDown } from 'lucide-react'
import { jalaliText } from '../../execution/lib/periods'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { PB, Tile, axisProps, gridProps } from '../../finance/components/charts'
import { fa } from '../../execution/components/common'
import { sCurve } from '../lib/evm'
import { downloadText, downloadWorkbook } from '../lib/exportXlsx'
import { qualityChecks, qualityScore } from '../lib/quality'
import { wbsRollup } from '../lib/rollup'
import { exportXer } from '../lib/xerExport'
import { useSchedulingStore } from '../store/useSchedulingStore'
import type { LiveModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const pct = (v: number | null, n = 1) => (v == null ? '—' : `${fa(v, n)}٪`)

/** Schedule health (DCMA-style checks), S-curve with earned value / earned schedule, WBS roll-up and exports. */
export function SchHealth({ projectId, m }: { projectId: string; m: LiveModel }) {
  const st = useSchedulingStore()
  const [depth, setDepth] = useState(2)
  const checks = useMemo(() => qualityChecks(m.cur!.activities, m.cur!.relations, m.forecast, m.dataDate), [m.cur, m.forecast, m.dataDate])
  const score = qualityScore(checks)
  const baseActs = m.base?.activities ?? m.cur!.activities
  const ev = useMemo(() => sCurve({ baseline: baseActs, current: m.cur!.activities, forecast: m.forecast, dataDate: m.dataDate }), [baseActs, m.cur, m.forecast, m.dataDate])
  const roll = useMemo(() => wbsRollup({ baseline: baseActs, current: m.cur!.activities, forecast: m.forecast, rows: m.progress.rows, dataDate: m.dataDate, depth }), [baseActs, m.cur, m.forecast, m.progress.rows, m.dataDate, depth])
  const tone = (s: string) => (s === 'good' ? 'good' : s === 'warn' ? 'warn' : 'bad') as 'good' | 'warn' | 'bad'
  const money = (v: number | null) => (v == null ? '—' : fa(Math.round(v)))

  const exportActivities = () => {
    const base = new Map(baseActs.map((a) => [a.uid, a]))
    void downloadWorkbook(`schedule-${m.today}.xlsx`, {
      'فعالیت‌ها': [['کد', 'نام', 'WBS', 'شروع مبنا', 'پایان مبنا', 'شروع پیش‌بینی', 'پایان پیش‌بینی', 'تاخیر پایان (روز)', 'شناوری کل', 'بحرانی', 'وضعیت', '٪ پیشرفت'],
        ...m.cur!.activities.filter((a) => a.type === 'task' || a.type === 'milestone').map((a) => { const f = m.forecast.byId.get(a.id), b = base.get(a.uid); return [a.code, a.name, a.wbsPath, b?.plannedStart ?? null, b?.plannedFinish ?? null, f?.start ?? null, f?.finish ?? null, b?.plannedFinish && f?.finish ? Math.round((Date.parse(f.finish) - Date.parse(b.plannedFinish)) / 86400000) : null, f?.totalFloat ?? null, f?.critical ? 'بله' : '', f?.status ?? '', a.actualFinish ? 100 : a.pctComplete] })],
      'خلاصه WBS': [['WBS', 'فعالیت', 'برنامه‌ای ٪', 'واقعی ٪', 'پایان مبنا', 'پایان پیش‌بینی', 'تاخیر (روز)', 'بحرانی', 'عقب‌افتاده'], ...roll.map((r) => [r.key, r.tasks, r.planned == null ? null : Math.round(r.planned * 10) / 10, r.actual == null ? null : Math.round(r.actual * 10) / 10, r.baselineFinish, r.forecastFinish, r.slip, r.critical, r.overdue])],
      'کنترل کیفیت': [['کنترل', 'تعداد', 'کل', 'درصد', 'حد مجاز ٪', 'وضعیت'], ...checks.map((c) => [c.title, c.count, c.total, Math.round(c.pct * 10) / 10, c.limitPct, c.status])],
    })
  }
  const exportXerFile = () => downloadText(`schedule-${m.currentV.label.replace(/\s+/g, '_')}.xer`, exportXer({ projectName: m.currentV.label, dataDate: m.dataDate, activities: m.cur!.activities, relations: m.cur!.relations, calendars: m.cur!.calendars }))

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label={<span>امتیاز کیفیت برنامه <Hint id="health" /></span>} value={`${fa(score)}٪`} tone={score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad'} sub={`${fa(checks.filter((c) => c.status === 'bad').length)} کنترل رد شده`} />
        <KpiCard i={1} label={<span>SPI زمانی (Earned Schedule) <Hint id="earned-schedule" /></span>} value={ev?.spiT == null ? '—' : fa(ev.spiT, 2)} sub={ev?.earnedScheduleDate ? `پیشرفت واقعی معادل برنامهٔ ${d(ev.earnedScheduleDate)}` : undefined} tone={ev?.spiT == null ? 'neutral' : ev.spiT >= 0.95 ? 'good' : ev.spiT >= 0.8 ? 'warn' : 'bad'} />
        <KpiCard i={2} label="ارزش برنامه‌ای PV (ریال)" value={money(ev?.pv ?? null)} sub={ev ? `${pct(ev.plannedAtDD)} از کل` : undefined} />
        <KpiCard i={3} label="ارزش کسب‌شده EV (ریال)" value={money(ev?.ev ?? null)} sub={ev?.sv == null ? 'بودجهٔ همهٔ فعالیت‌ها لازم است' : `انحراف زمانی ${ev.sv >= 0 ? '+' : ''}${money(ev.sv)}`} tone={ev?.sv == null ? 'neutral' : ev.sv >= 0 ? 'good' : 'bad'} />
      </div>

      {ev && (
        <Tile title={<span>منحنی S: برنامه‌ای، واقعی و پیش‌بینی <Hint id="scurve" /></span>} hint={`تاریخ وضعیت ${d(m.dataDate)} · وزن بر پایهٔ ${ev.byBudget ? 'بودجه' : 'مدت'}`}>
          <div style={{ height: 280 }} dir="ltr"><ResponsiveContainer width="100%" height="100%"><LineChart data={ev.points.map((p) => ({ x: jalaliText(p.date), date: p.date, planned: p.planned, actual: p.actual, forecast: p.forecast }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} /><XAxis dataKey="x" {...axisProps} interval="preserveStartEnd" /><YAxis {...axisProps} width={36} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v, n) => [`${fa(Number(v), 1)}٪`, n === 'planned' ? 'برنامه‌ای (خط مبنا)' : n === 'actual' ? 'واقعی' : 'پیش‌بینی']} />
            <ReferenceLine x={jalaliText(m.dataDate)} stroke={PB.slate} strokeDasharray="4 3" label={{ value: 'وضعیت', fontSize: 10, fill: PB.slate }} />
            <Line type="monotone" dataKey="planned" stroke={PB.blue} dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="forecast" stroke={PB.coral} strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="actual" stroke={PB.teal} dot={false} strokeWidth={2.5} isAnimationActive={false} connectNulls />
          </LineChart></ResponsiveContainer></div>
          <p className="im-helper" style={{ margin: '6px 0 0' }}>هزینهٔ واقعی (AC) در این ماژول نیست و از ماژول مالی خوانده نمی‌شود؛ بنابراین CPI محاسبه نمی‌شود. EV بر پایهٔ پیشرفت و بودجهٔ هر فعالیت است.</p>
        </Tile>
      )}

      <Section title="پیشرفت و تاخیر به تفکیک WBS" hint="بخش یا شیرخانه‌ای که بیشترین تاخیر را دارد بالاتر است" flush>
        <div style={{ padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center' }}><span className="sub">سطح:</span>{[1, 2, 3].map((n) => <button key={n} className={`im-btn im-btn-sm${depth === n ? ' im-btn-primary' : ''}`} onClick={() => setDepth(n)}>{fa(n)}</button>)}
          <span style={{ flex: 1 }} /><button className="im-btn im-btn-sm" onClick={exportActivities}><Download size={13} /> Excel</button>{st.canEdit !== undefined && <button className="im-btn im-btn-sm" onClick={exportXerFile}><FileDown size={13} /> XER (P6)</button>}</div>
        <div className="fn-tbl-wrap" style={{ maxHeight: 360 }}><table className="ex-lines"><thead><tr><th>WBS</th><th className="num">فعالیت</th><th className="num">برنامه‌ای</th><th className="num">واقعی</th><th>پایان مبنا</th><th>پایان پیش‌بینی</th><th className="num">تاخیر</th><th className="num">بحرانی</th><th className="num">عقب‌افتاده</th></tr></thead><tbody>
          {roll.map((r) => <tr key={r.key}><td style={{ whiteSpace: 'normal' }}>{r.name}</td><td className="num">{fa(r.tasks)}</td><td className="num">{pct(r.planned)}</td><td className="num">{pct(r.actual)}</td><td>{d(r.baselineFinish)}</td><td>{d(r.forecastFinish)}</td><td className="num">{r.slip == null ? '—' : <b className={r.slip > 0 ? 'ex-bad' : undefined}>{fa(r.slip, 0)}</b>}</td><td className="num">{fa(r.critical)}</td><td className="num">{r.overdue ? <b className="ex-bad">{fa(r.overdue)}</b> : '۰'}</td></tr>)}
        </tbody></table></div>
      </Section>

      <Section title={<span>کنترل کیفیت برنامه (الگوی DCMA) <Hint id="health" /></span>} hint="روی برنامهٔ جاری؛ فعالیت‌های ناقص‌ترین منطق اول" flush>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>کنترل</th><th className="num">تعداد</th><th className="num">درصد</th><th className="num">حد مجاز</th><th>وضعیت</th><th>فعالیت‌ها</th></tr></thead><tbody>
          {checks.map((c) => <tr key={c.id}><td style={{ whiteSpace: 'normal', minWidth: 200 }}><b>{c.title}</b><div className="sub">{c.hint}</div></td><td className="num">{fa(c.count)}</td><td className="num">{fa(c.pct, 1)}٪</td><td className="num">{c.limitPct == null ? '۰' : `${fa(c.limitPct)}٪`}</td><td><Chip tone={tone(c.status)}>{c.status === 'good' ? 'قبول' : c.status === 'warn' ? 'هشدار' : 'رد'}</Chip></td><td className="sub" style={{ whiteSpace: 'normal' }}>{c.codes.slice(0, 12).join('، ')}{c.count > 12 ? ' …' : ''}</td></tr>)}
        </tbody></table></div>
      </Section>
      <span hidden>{projectId}</span>
    </div>
  )
}
