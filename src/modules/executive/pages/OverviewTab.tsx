import { useMemo, useState } from 'react'
import { Activity, AlertTriangle, Clock3, Flag, Gauge as GaugeIcon, Gavel, HeartPulse, Layers, Scale, Trophy, Wallet } from 'lucide-react'
import { balanceByPhase, decisionQueue, DECISION_FA, HEALTH_FA, QUEUE_REASON_FA, rollup, type PfHealth, type PfProjectView } from '../lib/portfolioCore'
import { Empty, faNum, fmtIdx, fmtMoney, HealthChip, Kpi, Panel } from '../components/pfUi'
import { BarList, Columns, Donut, Gauge, IDX_BANDS, Num, PALETTE, PHASE_COLOR, Seg } from '../components/viz'
import { useDrill } from '../components/DrillSheet'
import { MultiProjectViews } from '../MultiProjectViews'
import { formatJalali } from '../../../lib/jalali'

const todayIso = () => new Date().toISOString().slice(0, 10)
const HEALTH_ORDER: PfHealth[] = ['green', 'yellow', 'red', 'black', 'unknown']

/** The three questions first: how is the portfolio, what needs my decision, where is the money at risk — every tile,
 *  dial, slice and bar opens the projects behind it (the drill sheet), and each project there opens its own detail. */
export function OverviewTab({ views, currency, canGovern, onDecide, onOpenPipeline, onOpenTab }: {
  views: PfProjectView[]; currency: string; canGovern: boolean
  onDecide: (projectId: string) => void; onOpenPipeline: () => void; onOpenTab: (t: 'priority' | 'performance' | 'issues') => void
}) {
  const r = useMemo(() => rollup(views), [views])
  const queue = useMemo(() => decisionQueue(views, todayIso()), [views])
  const balance = useMemo(() => balanceByPhase(views), [views])
  const [balBy, setBalBy] = useState<'bac' | 'count'>('bac')
  const { drill, open } = useDrill()
  const ids = (list: PfProjectView[]) => list.map((v) => v.input.id)
  const overrun = views.filter((v) => v.vac != null && v.vac < 0).sort((a, b) => (a.vac as number) - (b.vac as number))
  const withSnap = views.filter((v) => v.input.snapshot)
  const wsum = withSnap.reduce((n, v) => n + (v.bac || 1), 0)
  const actual = withSnap.length ? withSnap.reduce((n, v) => n + v.input.snapshot!.actual * (v.bac || 1), 0) / wsum : null
  const planned = withSnap.length ? withSnap.reduce((n, v) => n + v.input.snapshot!.planned * (v.bac || 1), 0) / wsum : null
  const atRiskShare = r.bac > 0 ? (overrun.reduce((n, v) => n + (v.bac ?? 0), 0) / r.bac) * 100 : null
  const evm = views.filter((v) => { const s = v.input.snapshot; return s && s.bacEvm > 0 && s.spi != null && s.cpi != null })
  const healthParts = HEALTH_ORDER.map((h) => ({ key: h, label: HEALTH_FA[h].label, value: r.health[h], color: HEALTH_FA[h].color }))
  const top = views.filter((v) => v.rank && v.rank <= 6).sort((a, b) => (a.rank as number) - (b.rank as number))

  return (
    <div className="pf-stack">
      <div className="pf-kpis">
        <Kpi icon={<Layers size={14} />} label="پروژه‌های سبد" value={r.count} sub={`${faNum(r.mandatory)} الزامی · ${faNum(r.decided)} دارای تصمیم سبد`} onClick={() => drill('همهٔ پروژه‌های سبد', ids(views))} />
        <Kpi icon={<Wallet size={14} />} label="بودجهٔ کل (BAC)" value={<Num value={r.bac} format={(n) => fmtMoney(n, '')} />} sub={currency} tone="#0ea5e9" onClick={() => drill('پروژه‌ها به ترتیب بودجه', ids([...views].sort((a, b) => (b.bac ?? 0) - (a.bac ?? 0))))} />
        <Kpi icon={<Wallet size={14} />} label="پیش‌بینی تمام‌شده (EAC)" value={<Num value={r.eac} format={(n) => fmtMoney(n, '')} />} sub={<span className={r.vac < 0 ? 'pf-bad' : 'pf-good'}>{r.vac < 0 ? 'بیش از بودجه ' : 'زیر بودجه '}{fmtMoney(Math.abs(r.vac), '')}</span>} tone={r.vac < 0 ? '#ef4444' : '#22c55e'} onClick={overrun.length ? () => drill('پیش‌بینی بیش از بودجه', ids(overrun)) : undefined} />
        <Kpi icon={<Gavel size={14} />} label="نیازمند تصمیم" value={queue.length} sub={`${faNum(queue.filter((q) => q.reasons.includes('health')).length)} مورد بحرانی`} tone={queue.length ? '#f97316' : '#22c55e'} onClick={queue.length ? () => drill('صف تصمیم سبد', queue.map((q) => q.view.input.id), 'به ترتیب شدت') : undefined} />
        <Kpi icon={<Activity size={14} />} label="دادهٔ EVM" value={r.evmCount} sub={`از ${faNum(r.count)} پروژه؛ پایهٔ SPI و CPI سبد`} tone="#a78bfa" onClick={evm.length ? () => drill('پروژه‌های دارای دادهٔ EVM', ids(evm)) : undefined} />
      </div>

      <div className="pf-grid-2">
        <Panel title="شاخص‌های عملکرد سبد" icon={<GaugeIcon size={15} />} hint="وزن‌دار با بودجه. روی هر عقربه بزنید تا پروژه‌هایی را که زیر هدف هستند ببینید.">
          <div className="vz-gauges">
            <Gauge label="SPI سبد" value={r.spi} min={0.5} max={1.5} bands={IDX_BANDS} target={1} display={fmtIdx(r.spi)} sub="زمان‌بندی" size={150}
              onClick={() => drill('عقب از برنامه (SPI کمتر از ۱)', ids(evm.filter((v) => (v.input.snapshot!.spi as number) < 1)))} />
            <Gauge label="CPI سبد" value={r.cpi} min={0.5} max={1.5} bands={IDX_BANDS} target={1} display={fmtIdx(r.cpi)} sub="هزینه" size={150}
              onClick={() => drill('بیش از هزینه (CPI کمتر از ۱)', ids(evm.filter((v) => (v.input.snapshot!.cpi as number) < 1)))} />
            <Gauge label="پیشرفت چرخهٔ عمر" value={actual} min={0} max={100} target={planned ?? undefined}
              bands={planned == null ? [{ to: 100, color: '#6366f1' }] : [{ to: Math.max(0, planned - 10), color: '#ef4444' }, { to: planned, color: '#f59e0b' }, { to: 100, color: '#22c55e' }]}
              display={actual == null ? '—' : `${faNum(actual, 1)}٪`} sub={planned == null ? undefined : `برنامه ${faNum(planned, 1)}٪`} size={150}
              onClick={() => drill('پیشرفت کمتر از برنامه', ids(withSnap.filter((v) => v.input.snapshot!.actual < v.input.snapshot!.planned)))} />
            <Gauge label="بودجهٔ در معرض خطر" value={atRiskShare} min={0} max={100} bands={[{ to: 10, color: '#22c55e' }, { to: 25, color: '#f59e0b' }, { to: 100, color: '#ef4444' }]}
              display={atRiskShare == null ? '—' : `${faNum(atRiskShare, 1)}٪`} sub="سهم بودجهٔ پروژه‌های بیش از بودجه" size={150}
              onClick={overrun.length ? () => drill('پیش‌بینی بیش از بودجه', ids(overrun)) : undefined} />
          </div>
        </Panel>

        <Panel title="سلامت سبد" icon={<HeartPulse size={15} />} hint="حکم سلامت هر پروژه همان است که در رادار و داشبورد پروژه نشان داده می‌شود؛ روی هر بخش بزنید.">
          <Donut parts={healthParts} sub="پروژه" onPick={(h) => { if (h) drill(`پروژه‌های «${HEALTH_FA[h as PfHealth].label}»`, ids(views.filter((v) => v.health === h))) }} />
          {r.health.unknown > 0 && <p className="pf-note">{faNum(r.health.unknown)} پروژه هنوز دادهٔ عملکرد (برنامهٔ چرخهٔ عمر یا قرارداد EPC) ندارد؛ برای این پروژه‌ها رنگ حدسی نمایش داده نمی‌شود.</p>}
        </Panel>
      </div>

      <div className="pf-grid-2">
        <Panel title="صف تصمیم" icon={<AlertTriangle size={15} />} hint="پروژه‌هایی که تصمیم سبد لازم دارند، به ترتیب شدت. نام پروژه جزئیات آن را باز می‌کند." right={canGovern && queue.length ? <button type="button" className="pf-btn is-primary" onClick={() => onDecide(queue[0].view.input.id)}><Gavel size={14} /> ثبت تصمیم</button> : null}>
          {!queue.length ? <Empty>همهٔ پروژه‌ها تصمیم معتبر دارند و هیچ‌کدام بحرانی نیست.</Empty> : (
            <ol className="pf-queue">
              {queue.slice(0, 7).map(({ view: v, reasons }) => (
                <li key={v.input.id}>
                  <div className="min-w-0">
                    <div className="pf-queue-top"><button type="button" className="vz-link" onClick={() => open(v.input.id)}>{v.input.name}</button><HealthChip health={v.health} /></div>
                    <div className="pf-reasons">{reasons.map((x) => <span key={x} className={`pf-reason is-${x}`}>{QUEUE_REASON_FA[x]}</span>)}</div>
                    {v.health === 'black' && v.input.snapshot?.blockers?.length ? <small className="pf-why">علت: {v.input.snapshot.blockers.slice(0, 2).join(' · ')}{v.input.snapshot.blockers.length > 2 ? ` و ${faNum(v.input.snapshot.blockers.length - 2)} مورد دیگر` : ''}</small> : v.input.snapshot?.drivenBy ? <small className="pf-why">عامل اصلی: {v.input.snapshot.drivenBy}</small> : null}
                    {v.lastDecision && <small className="pf-muted">آخرین تصمیم: {DECISION_FA[v.lastDecision.decision].label} · {formatJalali(v.lastDecision.decidedAt)}{v.lastDecision.reviewBy ? ` · بازبینی ${formatJalali(v.lastDecision.reviewBy)}` : ''}</small>}
                  </div>
                  {canGovern && <button type="button" className="pf-btn" onClick={() => onDecide(v.input.id)}>تصمیم</button>}
                </li>
              ))}
              {queue.length > 7 && <li><button type="button" className="vz-link" onClick={() => drill('صف تصمیم سبد', queue.map((q) => q.view.input.id), 'به ترتیب شدت')}>و {faNum(queue.length - 7)} پروژهٔ دیگر</button></li>}
            </ol>
          )}
        </Panel>

        <Panel title="پول کجا در خطر است" icon={<Wallet size={15} />} hint="درصد فراتر رفتن پیش‌بینی تمام‌شده از بودجه. روی هر ردیف بزنید." right={<button type="button" className="pf-btn" onClick={() => onOpenTab('performance')}>عملکرد و پیش‌بینی</button>}>
          {!overrun.length ? <Empty>هیچ پروژه‌ای پیش‌بینی بیش از بودجه ندارد{r.eacFrom.none ? ` (${faNum(r.eacFrom.none)} پروژه پیش‌بینی هزینه ندارد)` : ''}.</Empty> : (
            <BarList onPick={open} items={overrun.slice(0, 8).map((v) => {
              const pct = v.bac ? (-(v.vac as number) / v.bac) * 100 : 0
              return { key: v.input.id, label: v.input.name, value: pct, display: `+${faNum(pct, 1)}٪`, color: pct > 20 ? '#ef4444' : pct > 10 ? '#f97316' : '#f59e0b', note: `${fmtMoney(-(v.vac as number))} · ${v.eacSource === 'evm' ? 'EVM' : 'دستی'}` }
            })} />
          )}
        </Panel>
      </div>

      <div className="pf-grid-2">
        <Panel title="توازن سبد در چرخهٔ عمر" icon={<Scale size={15} />} hint="تمرکز بیش از حد سبد در یک مرحله، فشار هم‌زمان بر منابع و نقدینگی است. روی هر ستون بزنید."
          right={<div className="flex flex-wrap gap-2"><Seg label="معیار" value={balBy} onChange={setBalBy} options={[{ key: 'bac', label: 'بودجه' }, { key: 'count', label: 'تعداد' }]} /><button type="button" className="pf-btn" onClick={onOpenPipeline}>جزئیات مراحل</button></div>}>
          <Columns height={190} format={balBy === 'bac' ? (n) => fmtMoney(n, '') : (n) => faNum(n)}
            onPick={(code) => { const b = balance.find((x) => x.code === code); drill(`مرحلهٔ ${code} — ${b?.title ?? ''}`, ids(views.filter((v) => (v.input.snapshot?.phase?.code ?? '—') === code))) }}
            items={balance.map((b) => ({ key: b.code, label: b.code, value: balBy === 'bac' ? b.bac : b.count, color: PHASE_COLOR[b.code] ?? '#64748b', note: balBy === 'bac' ? `${faNum(b.count)} پروژه` : fmtMoney(b.bac, '') }))} />
        </Panel>

        <Panel title="اولویت‌های برتر" icon={<Trophy size={15} />} hint="امتیاز اولویت بر اساس معیارها و وزن‌های تب «اولویت‌بندی»." right={<button type="button" className="pf-btn" onClick={() => onOpenTab('priority')}>همهٔ رتبه‌ها</button>}>
          {!top.length ? <Empty>هنوز امتیاز اولویتی محاسبه نشده است.</Empty> : (
            <BarList onPick={open} max={100} items={top.map((v, i) => ({ key: v.input.id, label: <><span className="pf-rank">{faNum(v.rank as number)}</span> {v.input.name}</>, value: v.priority ?? 0, color: PALETTE[i % PALETTE.length], note: HEALTH_FA[v.health].label }))} />
          )}
        </Panel>
      </div>

      <DeliveryPanel views={views} />

      <MultiProjectViews onOpenPipeline={onOpenPipeline} onOpenIssues={() => onOpenTab('issues')} />
      <p className="pf-foot">سلامت، پیشرفت، SPI، CPI و EAC هر پروژه از همان موتور داشبورد پروژه خوانده می‌شود؛ رنگ‌ها: {Object.values(HEALTH_FA).map((h) => h.label).join('، ')}.</p>
    </div>
  )
}

/** milestones and actions running late, per project — from the lifecycle control tower */
function DeliveryPanel({ views }: { views: PfProjectView[] }) {
  const open = useDrill((s) => s.open)
  const rows = views.filter((v) => v.input.delivery && (v.input.delivery.milestonesDelayed || v.input.delivery.overdueActions))
    .sort((a, b) => {
      const x = a.input.delivery!, y = b.input.delivery!
      return (y.criticalMilestonesDelayed + y.criticalOverdueActions) - (x.criticalMilestonesDelayed + x.criticalOverdueActions) || (y.milestonesDelayed + y.overdueActions) - (x.milestonesDelayed + x.overdueActions)
    })
  const known = views.filter((v) => v.input.delivery).length
  const t = rows.reduce((a, v) => { const d = v.input.delivery!; a.ms += d.milestonesDelayed; a.cms += d.criticalMilestonesDelayed; a.ac += d.overdueActions; a.cac += d.criticalOverdueActions; return a }, { ms: 0, cms: 0, ac: 0, cac: 0 })
  return (
    <Panel title="Milestoneها و اقدام‌های عقب‌افتاده" icon={<Flag size={15} />} hint="از برج کنترل چرخهٔ عمر هر پروژه؛ مواردِ بحرانی پروژه را به صف تصمیم می‌برند.">
      {!known ? <Empty>دادهٔ برج کنترل چرخهٔ عمر در حال بارگذاری است یا ثبت نشده.</Empty> : !rows.length ? <Empty>هیچ Milestone یا اقدامی عقب نیفتاده است.</Empty> : (
        <>
          <div className="pf-kpis">
            <Kpi icon={<Flag size={14} />} label="Milestone تأخیرکرده" value={t.ms} sub={`${faNum(t.cms)} مورد بحرانی`} tone="#f97316" />
            <Kpi icon={<Clock3 size={14} />} label="اقدام معوق" value={t.ac} sub={`${faNum(t.cac)} مورد بحرانی`} tone="#f43f5e" />
          </div>
          <BarList onPick={open} items={rows.slice(0, 8).map((v) => {
            const d = v.input.delivery!, crit = d.criticalMilestonesDelayed + d.criticalOverdueActions
            return { key: v.input.id, label: v.input.name, value: d.milestonesDelayed + d.overdueActions, color: crit ? '#ef4444' : '#f59e0b',
              note: `${faNum(d.milestonesDelayed)} Milestone · ${faNum(d.overdueActions)} اقدام${crit ? ` · ${faNum(crit)} بحرانی` : ''}` }
          })} />
          {rows.length > 8 && <p className="pf-note">و {faNum(rows.length - 8)} پروژهٔ دیگر.</p>}
        </>
      )}
    </Panel>
  )
}
