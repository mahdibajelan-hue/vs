import { useMemo, useState } from 'react'
import { AlertTriangle, Gauge, Gavel, Layers, Scale, Wallet } from 'lucide-react'
import { balanceByPhase, decisionQueue, DECISION_FA, HEALTH_FA, QUEUE_REASON_FA, rollup, type PfHealth, type PfProjectView } from '../lib/portfolioCore'
import { Empty, faNum, fmtIdx, fmtMoney, HealthBar, HealthChip, Kpi, Panel } from '../components/pfUi'
import { MultiProjectViews } from '../MultiProjectViews'
import { formatJalali } from '../../../lib/jalali'

const todayIso = () => new Date().toISOString().slice(0, 10)

/** The three questions first: how is the portfolio, what needs my decision, where is the money at risk. */
export function OverviewTab({ views, currency, canGovern, onDecide, onOpenPipeline, onOpenTab }: {
  views: PfProjectView[]; currency: string; canGovern: boolean
  onDecide: (projectId: string) => void; onOpenPipeline: () => void; onOpenTab: (t: 'priority' | 'performance') => void
}) {
  const r = useMemo(() => rollup(views), [views])
  const queue = useMemo(() => decisionQueue(views, todayIso()), [views])
  const balance = useMemo(() => balanceByPhase(views), [views])
  const [healthPick, setHealthPick] = useState<PfHealth | null>(null)
  const overrun = views.filter((v) => v.vac != null && v.vac < 0).sort((a, b) => (a.vac as number) - (b.vac as number))
  const maxBal = Math.max(1, ...balance.map((b) => b.bac))
  const picked = healthPick ? views.filter((v) => v.health === healthPick) : []

  return (
    <div className="pf-stack">
      <div className="pf-kpis">
        <Kpi icon={<Layers size={14} />} label="پروژه‌های سبد" value={faNum(r.count)} sub={`${faNum(r.mandatory)} الزامی · ${faNum(r.decided)} دارای تصمیم سبد`} />
        <Kpi icon={<Wallet size={14} />} label="بودجهٔ کل (BAC)" value={fmtMoney(r.bac, '')} sub={currency} tone="#0ea5e9" />
        <Kpi icon={<Wallet size={14} />} label="پیش‌بینی تمام‌شده (EAC)" value={fmtMoney(r.eac, '')} sub={<span className={r.vac < 0 ? 'pf-bad' : 'pf-good'}>{r.vac < 0 ? 'بیش از بودجه ' : 'زیر بودجه '}{fmtMoney(Math.abs(r.vac), '')}</span>} tone={r.vac < 0 ? '#ef4444' : '#22c55e'} />
        <Kpi icon={<Gauge size={14} />} label="SPI / CPI سبد" value={<span dir="ltr">{fmtIdx(r.spi)} · {fmtIdx(r.cpi)}</span>} sub={`وزن‌دار با بودجه — ${faNum(r.evmCount)} از ${faNum(r.count)} پروژه دادهٔ EVM دارند`} tone="#a78bfa" />
        <Kpi icon={<Gavel size={14} />} label="نیازمند تصمیم" value={faNum(queue.length)} sub={`${faNum(queue.filter((q) => q.reasons.includes('health')).length)} مورد بحرانی`} tone={queue.length ? '#f97316' : '#22c55e'} />
      </div>

      <Panel title="سلامت سبد" icon={<Gauge size={15} />} hint="حکم سلامت هر پروژه همان است که در رادار و داشبورد پروژه نشان داده می‌شود؛ روی هر رنگ بزنید تا پروژه‌هایش را ببینید.">
        <HealthBar counts={r.health} onPick={setHealthPick} active={healthPick} />
        {healthPick && (
          <ul className="pf-mini-list">
            {picked.map((v) => <li key={v.input.id}><b>{v.input.name}</b>{v.health === 'black' && v.input.snapshot?.blockers?.length ? <small>{v.input.snapshot.blockers.slice(0, 2).join(' · ')}</small> : v.input.snapshot?.drivenBy ? <small>عامل اصلی: {v.input.snapshot.drivenBy}</small> : null}</li>)}
          </ul>
        )}
        {r.health.unknown > 0 && <p className="pf-note">{faNum(r.health.unknown)} پروژه هنوز دادهٔ عملکرد (برنامهٔ چرخهٔ عمر یا قرارداد EPC) ندارد؛ برای این پروژه‌ها رنگ حدسی نمایش داده نمی‌شود.</p>}
      </Panel>

      <div className="pf-grid-2">
        <Panel title="صف تصمیم" icon={<AlertTriangle size={15} />} hint="پروژه‌هایی که تصمیم سبد لازم دارند — به ترتیب شدت." right={canGovern && queue.length ? <button type="button" className="pf-btn is-primary" onClick={() => onDecide(queue[0].view.input.id)}><Gavel size={14} /> ثبت تصمیم</button> : null}>
          {!queue.length ? <Empty>همهٔ پروژه‌ها تصمیم معتبر دارند و هیچ‌کدام بحرانی نیست.</Empty> : (
            <ol className="pf-queue">
              {queue.slice(0, 8).map(({ view: v, reasons }) => (
                <li key={v.input.id}>
                  <div className="min-w-0">
                    <div className="pf-queue-top"><b>{v.input.name}</b><HealthChip health={v.health} /></div>
                    <div className="pf-reasons">{reasons.map((x) => <span key={x} className={`pf-reason is-${x}`}>{QUEUE_REASON_FA[x]}</span>)}</div>
                    {v.health === 'black' && v.input.snapshot?.blockers?.length ? <small className="pf-why">علت: {v.input.snapshot.blockers.slice(0, 2).join(' · ')}{v.input.snapshot.blockers.length > 2 ? ` و ${faNum(v.input.snapshot.blockers.length - 2)} مورد دیگر` : ''}</small> : v.input.snapshot?.drivenBy ? <small className="pf-why">عامل اصلی: {v.input.snapshot.drivenBy}</small> : null}
                    {v.lastDecision && <small className="pf-muted">آخرین تصمیم: {DECISION_FA[v.lastDecision.decision].label} · {formatJalali(v.lastDecision.decidedAt)}{v.lastDecision.reviewBy ? ` · بازبینی ${formatJalali(v.lastDecision.reviewBy)}` : ''}</small>}
                  </div>
                  {canGovern && <button type="button" className="pf-btn" onClick={() => onDecide(v.input.id)}>تصمیم</button>}
                </li>
              ))}
              {queue.length > 8 && <li className="pf-muted">و {faNum(queue.length - 8)} پروژهٔ دیگر — در تب «تصمیم‌های سبد».</li>}
            </ol>
          )}
        </Panel>

        <Panel title="پول کجا در خطر است" icon={<Wallet size={15} />} hint="پروژه‌هایی که پیش‌بینی هزینهٔ تمام‌شده از بودجه بیشتر است." right={<button type="button" className="pf-btn" onClick={() => onOpenTab('performance')}>عملکرد و پیش‌بینی</button>}>
          {!overrun.length ? <Empty>هیچ پروژه‌ای پیش‌بینی بیش از بودجه ندارد{r.eacFrom.none ? ` (${faNum(r.eacFrom.none)} پروژه پیش‌بینی هزینه ندارد)` : ''}.</Empty> : (
            <ul className="pf-over">
              {overrun.slice(0, 7).map((v) => {
                const pct = v.bac ? (-(v.vac as number) / v.bac) * 100 : 0
                return (
                  <li key={v.input.id}>
                    <span className="min-w-0 truncate">{v.input.name}</span>
                    <span className="pf-over-bar"><i style={{ width: `${Math.min(100, pct * 3)}%` }} /></span>
                    <b className="pf-bad">+{faNum(pct, 1)}٪</b>
                    <small className="pf-muted">{v.eacSource === 'evm' ? 'EVM' : 'دستی'}</small>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="توازن سبد در چرخهٔ عمر" icon={<Scale size={15} />} hint="بودجه و تعداد پروژه در هر مرحلهٔ جاری — تمرکز بیش از حد سبد در یک مرحله، فشار هم‌زمان بر منابع و نقدینگی است." right={<button type="button" className="pf-btn" onClick={onOpenPipeline}>جزئیات مراحل</button>}>
        <div className="pf-balance">
          {balance.map((b) => (
            <div key={b.code} className="pf-bal-col">
              <div className="pf-bal-bar"><i style={{ height: `${Math.max(4, (b.bac / maxBal) * 100)}%` }} /></div>
              <b>{b.code}</b><small>{b.title}</small><small>{faNum(b.count)} پروژه</small><small className="pf-muted">{fmtMoney(b.bac, '')}</small>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="اولویت‌های برتر" icon={<Layers size={15} />} hint="رتبهٔ اولویت بر اساس معیارها و وزن‌های تب «اولویت‌بندی»." right={<button type="button" className="pf-btn" onClick={() => onOpenTab('priority')}>همهٔ رتبه‌ها</button>}>
        <ol className="pf-top">
          {views.filter((v) => v.rank && v.rank <= 5).sort((a, b) => (a.rank as number) - (b.rank as number)).map((v) => (
            <li key={v.input.id}><span className="pf-rank">{faNum(v.rank as number)}</span><b className="truncate">{v.input.name}</b><span className="pf-score">{faNum(v.priority ?? 0)}</span><HealthChip health={v.health} /></li>
          ))}
        </ol>
      </Panel>

      <MultiProjectViews onOpenPipeline={onOpenPipeline} />
      <p className="pf-foot">سلامت، پیشرفت، SPI، CPI و EAC هر پروژه از همان موتور داشبورد پروژه خوانده می‌شود؛ رنگ‌ها: {Object.values(HEALTH_FA).map((h) => h.label).join('، ')}.</p>
    </div>
  )
}
