import { useEffect, useMemo, useState } from 'react'
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
import { useResourceStore, type CostSource } from '../store/useResourceStore'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
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
  const rs = useResourceStore()
  useEffect(() => { if (rs.projectId !== projectId) void rs.load(projectId) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [src, setSrc] = useState<CostSource>('manual')
  const [cDate, setCDate] = useState(''), [cAmt, setCAmt] = useState(0), [cNote, setCNote] = useState('')
  const costs = useMemo(() => (src === 'finance' ? rs.financeCosts : rs.costs.map((c) => ({ date: c.date, amount: c.amount }))), [src, rs.financeCosts, rs.costs])
  const ev = useMemo(() => sCurve({ baseline: baseActs, current: m.cur!.activities, forecast: m.forecast, dataDate: m.dataDate, costs }), [baseActs, m.cur, m.forecast, m.dataDate, costs])
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
          <div style={{ height: 280 }} dir="ltr"><ResponsiveContainer width="100%" height="100%"><LineChart data={ev.points.map((p) => ({ x: jalaliText(p.date), date: p.date, planned: p.planned, actual: p.actual, forecast: p.forecast, cost: p.cost ?? null }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} /><XAxis dataKey="x" {...axisProps} interval="preserveStartEnd" /><YAxis {...axisProps} width={36} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip formatter={(v, n) => [`${fa(Number(v), 1)}٪`, n === 'planned' ? 'برنامه‌ای (خط مبنا)' : n === 'actual' ? 'پیشرفت واقعی' : n === 'cost' ? 'هزینهٔ واقعی (٪ بودجه)' : 'پیش‌بینی']} />
            <ReferenceLine x={jalaliText(m.dataDate)} stroke={PB.slate} strokeDasharray="4 3" label={{ value: 'وضعیت', fontSize: 10, fill: PB.slate }} />
            <Line type="monotone" dataKey="planned" stroke={PB.blue} dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="forecast" stroke={PB.coral} strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="cost" stroke={PB.violet} strokeDasharray="2 3" dot={false} strokeWidth={2} isAnimationActive={false} connectNulls />
            <Line type="monotone" dataKey="actual" stroke={PB.teal} dot={false} strokeWidth={2.5} isAnimationActive={false} connectNulls />
          </LineChart></ResponsiveContainer></div>
          <p className="im-helper" style={{ margin: '6px 0 0' }}>EV بر پایهٔ پیشرفت وزنی (بودجهٔ فعالیت‌ها) است. CPI = EV ÷ AC فقط با بودجهٔ همهٔ فعالیت‌ها و ثبت هزینهٔ واقعی محاسبه می‌شود.</p>
        </Tile>
      )}

      <Section title={<span>هزینهٔ واقعی و شاخص عملکرد هزینه (CPI) <Hint id="cpi" /></span>} hint="منبع هزینهٔ واقعی را انتخاب کنید؛ هیچ داده‌ای از ماژول مالی کپی نمی‌شود">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="ex-lab">منبع هزینهٔ واقعی<select value={src} onChange={(e) => setSrc(e.target.value as CostSource)}><option value="manual">ثبت دستی در این ماژول</option><option value="finance">صورت‌وضعیت‌های کارکرد (ماژول مالی)</option></select></label>
          {src === 'manual' && st.canEdit && <>
            <label className="ex-lab">تاریخ<JalaliDateInput value={cDate} onChange={setCDate} /></label>
            <label className="ex-lab">مبلغ (ریال)<input type="number" value={cAmt || ''} onChange={(e) => setCAmt(Number(e.target.value))} /></label>
            <label className="ex-lab" style={{ flex: '1 1 160px' }}>یادداشت<input value={cNote} onChange={(e) => setCNote(e.target.value)} dir="auto" /></label>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!cDate || !cAmt} onClick={() => void rs.addCost(cDate, cAmt, cNote).then((ok) => { if (ok) { setCAmt(0); setCNote('') } })}>ثبت هزینه</button>
          </>}
        </div>
        {src === 'finance' && <p className="im-helper" style={{ margin: '6px 0 0' }}>مبلغ تأییدشدهٔ (در نبود آن، ناخالص) صورت‌وضعیت‌های «کارکرد» غیر از پیش‌نویس و ردشده، به تاریخ هر صورت‌وضعیت. {rs.financeCosts.length === 0 ? 'صورت‌وضعیتی برای این پروژه پیدا نشد.' : `${fa(rs.financeCosts.length)} صورت‌وضعیت.`}</p>}
        <div className="fn-kpis" style={{ marginTop: 8 }}>
          <KpiCard i={0} label="AC تا تاریخ وضعیت (ریال)" value={money(ev?.ac ?? null)} sub={costs.length ? `${fa(costs.length)} ردیف` : 'هزینه‌ای ثبت نشده'} />
          <KpiCard i={1} label="CPI" value={ev?.cpi == null ? '—' : fa(ev.cpi, 2)} tone={ev?.cpi == null ? undefined : ev.cpi >= 1 ? 'good' : ev.cpi >= 0.9 ? 'warn' : 'bad'} sub={ev?.cpi == null ? 'به بودجهٔ همهٔ فعالیت‌ها و هزینهٔ واقعی نیاز است' : ev.cpi >= 1 ? 'هزینه کمتر از ارزش کسب‌شده' : 'هزینه بیش از ارزش کسب‌شده'} />
          <KpiCard i={2} label="EAC = BAC ÷ CPI (ریال)" value={money(ev?.eac ?? null)} sub={ev?.bac != null ? `BAC ${money(ev.bac)}` : undefined} />
          <KpiCard i={3} label="VAC = BAC − EAC (ریال)" value={money(ev?.vac ?? null)} tone={ev?.vac == null ? undefined : ev.vac >= 0 ? 'good' : 'bad'} />
        </div>
        {src === 'manual' && rs.costs.length > 0 && <div className="fn-tbl-wrap" style={{ maxHeight: 180, marginTop: 8 }}><table className="ex-lines"><tbody>{[...rs.costs].reverse().slice(0, 30).map((c) => <tr key={c.id}><td>{d(c.date)}</td><td className="num">{fa(Math.round(c.amount))}</td><td style={{ whiteSpace: 'normal' }}>{c.note}</td><td>{st.canEdit && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف" onClick={() => void rs.removeCost(c.id)}>×</button>}</td></tr>)}</tbody></table></div>}
      </Section>

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
