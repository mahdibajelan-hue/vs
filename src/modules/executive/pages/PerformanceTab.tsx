import { useMemo } from 'react'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { Activity, Table2 } from 'lucide-react'
import { quadrantOf, QUADRANT_FA, rollup, type PfProjectView, type Quadrant } from '../lib/portfolioCore'
import { Empty, faNum, fmtIdx, fmtMoney, HealthChip, Panel } from '../components/pfUi'
import { ScheduleStatusCard } from '../ScheduleStatusCard'

/** SPI × CPI with the budget as bubble size, the BAC / EAC / VAC table, and the schedule status of each project. */
export function PerformanceTab({ views, currency }: { views: PfProjectView[]; currency: string }) {
  const r = useMemo(() => rollup(views), [views])
  const evm = views.filter((v) => v.input.snapshot && v.input.snapshot.spi != null && v.input.snapshot.cpi != null && v.input.snapshot.bacEvm > 0)
  const points = evm.map((v) => ({ id: v.input.id, name: v.input.name, spi: v.input.snapshot!.spi as number, cpi: v.input.snapshot!.cpi as number, bac: v.input.snapshot!.bacEvm, q: quadrantOf(v.input.snapshot!.spi as number, v.input.snapshot!.cpi as number) }))
  const byQ = (q: Quadrant) => points.filter((p) => p.q === q)
  const maxAxis = Math.max(1.4, ...points.flatMap((p) => [p.spi, p.cpi]).map((x) => Math.min(2, x + 0.1)))
  const minAxis = Math.min(0.6, ...points.flatMap((p) => [p.spi, p.cpi]).map((x) => Math.max(0, x - 0.1)))
  const table = [...views].sort((a, b) => (a.vac ?? 0) - (b.vac ?? 0))

  return (
    <div className="pf-stack">
      <div className="pf-grid-2">
        <Panel title="ربع عملکرد سبد (SPI × CPI)" icon={<Activity size={15} />} hint={<>هر حباب یک پروژه است و اندازه‌اش بودجهٔ قرارداد EPC. خطوط ۱ مرز برنامه و بودجه است؛ تا ۰٫۹۵ «مطابق» شمرده می‌شود. {faNum(points.length)} از {faNum(views.length)} پروژه دادهٔ EVM دارند.</>}>
          {!points.length ? <Empty>هنوز هیچ پروژه‌ای قرارداد EPC با پیشرفت و صورت‌وضعیت تأییدشده ندارد؛ پس از ثبت، این نمودار پر می‌شود.</Empty> : (
            <>
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 10, right: 16, bottom: 18, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
                    <XAxis type="number" dataKey="spi" name="SPI" domain={[minAxis, maxAxis]} tickFormatter={(v) => Number(v).toFixed(2)} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} label={{ value: 'SPI — زمان', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--text-secondary)' }} />
                    <YAxis type="number" dataKey="cpi" name="CPI" domain={[minAxis, maxAxis]} tickFormatter={(v) => Number(v).toFixed(2)} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={44} />
                    <ZAxis type="number" dataKey="bac" range={[60, 600]} />
                    <ReferenceLine x={1} stroke="var(--text-muted)" strokeDasharray="4 4" />
                    <ReferenceLine y={1} stroke="var(--text-muted)" strokeDasharray="4 4" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                      const p = payload?.[0]?.payload as (typeof points)[number] | undefined
                      return p ? <div className="pf-tip" dir="rtl"><b>{p.name}</b><div dir="ltr">SPI {p.spi.toFixed(2)} · CPI {p.cpi.toFixed(2)}</div><div>{QUADRANT_FA[p.q].label}</div></div> : null
                    }} />
                    {(Object.keys(QUADRANT_FA) as Quadrant[]).map((q) => <Scatter key={q} data={byQ(q)} fill={QUADRANT_FA[q].color} fillOpacity={0.8} />)}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="pf-quads">
                {(Object.keys(QUADRANT_FA) as Quadrant[]).map((q) => <span key={q}><i style={{ background: QUADRANT_FA[q].color }} />{QUADRANT_FA[q].label}: <b>{faNum(byQ(q).length)}</b></span>)}
              </div>
            </>
          )}
        </Panel>

        <Panel title="جمع‌بندی مالی سبد" icon={<Table2 size={15} />} hint="EAC هر پروژه از EVM (بودجه ÷ CPI) خوانده می‌شود؛ اگر پروژه دادهٔ EVM نداشته باشد، از پیش‌بینی ثبت‌شده در شناسنامهٔ پروژه.">
          <dl className="pf-dl">
            <div><dt>بودجهٔ کل (BAC)</dt><dd>{fmtMoney(r.bac, currency)}</dd></div>
            <div><dt>پیش‌بینی تمام‌شده (EAC)</dt><dd>{fmtMoney(r.eac, currency)}</dd></div>
            <div><dt>انحراف در پایان (VAC)</dt><dd className={r.vac < 0 ? 'pf-bad' : 'pf-good'}>{fmtMoney(r.vac, currency)}</dd></div>
            <div><dt>SPI / CPI وزن‌دار سبد</dt><dd dir="ltr">{fmtIdx(r.spi)} / {fmtIdx(r.cpi)}</dd></div>
            <div><dt>منبع EAC</dt><dd>{faNum(r.eacFrom.evm)} پروژه EVM · {faNum(r.eacFrom.manual)} دستی · {faNum(r.eacFrom.none)} بدون پیش‌بینی</dd></div>
          </dl>
        </Panel>
      </div>

      <Panel title="عملکرد پروژه‌ها" icon={<Table2 size={15} />} hint="مرتب‌شده از بیشترین بیش‌هزینه. پیشرفت = پیشرفت وزنی کل چرخهٔ عمر (برنامه در برابر واقعی).">
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>پروژه</th><th>سلامت</th><th>پیشرفت واقعی / برنامه</th><th>SPI</th><th>CPI</th><th>BAC</th><th>EAC</th><th>VAC</th></tr></thead>
            <tbody>
              {table.map((v) => {
                const s = v.input.snapshot
                return (
                  <tr key={v.input.id}>
                    <td><b>{v.input.name}</b>{v.health === 'black' && s?.blockers?.length ? <small className="pf-muted block">{s.blockers[0]}</small> : s?.drivenBy ? <small className="pf-muted block">عامل: {s.drivenBy}</small> : null}</td>
                    <td><HealthChip health={v.health} /></td>
                    <td>{s ? <ProgressPair actual={s.actual} planned={s.planned} /> : <span className="pf-muted">—</span>}</td>
                    <td className={s?.spi != null && s.spi < 0.95 ? 'pf-bad' : ''} dir="ltr">{fmtIdx(s?.spi)}</td>
                    <td className={s?.cpi != null && s.cpi < 0.95 ? 'pf-bad' : ''} dir="ltr">{fmtIdx(s?.cpi)}</td>
                    <td className="pf-nowrap">{fmtMoney(v.bac, '')}</td>
                    <td className="pf-nowrap">{fmtMoney(v.eac, '')}{v.eacSource && <small className="pf-muted block">{v.eacSource === 'evm' ? 'EVM' : 'دستی'}</small>}</td>
                    <td className={`pf-nowrap ${v.vac != null && v.vac < 0 ? 'pf-bad' : ''}`}>{fmtMoney(v.vac, '')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="pf-note">مبالغ به {currency}.</p>
      </Panel>

      <ScheduleStatusCard />
    </div>
  )
}

function ProgressPair({ actual, planned }: { actual: number; planned: number }) {
  const behind = actual + 0.5 < planned
  return (
    <div className="pf-prog" title={`واقعی ${faNum(actual, 1)}٪ · برنامه ${faNum(planned, 1)}٪`}>
      <span className="pf-prog-track"><i className="is-plan" style={{ width: `${Math.min(100, planned)}%` }} /><i className={behind ? 'is-behind' : 'is-ok'} style={{ width: `${Math.min(100, actual)}%` }} /></span>
      <small>{faNum(actual, 0)}٪ / {faNum(planned, 0)}٪</small>
    </div>
  )
}
