import { useMemo } from 'react'
import { AlertTriangle, CalendarClock, Coins, FileClock, Gavel, Hourglass } from 'lucide-react'
import { HelpButton } from '../../issues/components/Help'
import { Donut, HBars } from '../../issues/components/charts'
import { Kpi } from '../../issues/components/ui'
import { useChangeStore } from '../store/useChangeStore'
import { useChangeCtx } from '../lib/useChangeData'
import { cumulativeByContract, dwellByRole, endDateImpact, overdueSteps, stalled, summarize } from '../lib/changeKpi'
import { STATUS_COLOR, STATUS_FA, STATUS_ORDER, TYPE_FA, type ChangeType } from '../types'
import { CM_HELP } from '../lib/help'
import { jd } from '../components/RouteTrack'
import { StatusChip, money, nf, pct } from '../components/cm'
import type { PageProps } from '../ChangeApp'

export function DashboardPage({ onOpen }: PageProps) {
  const ctx = useChangeCtx()
  const scope = useChangeStore((s) => s.scopeProjectId)
  const allReqs = useChangeStore((s) => s.requests)
  const allSteps = useChangeStore((s) => s.steps)
  const reqs = useMemo(() => allReqs.filter((r) => scope === 'all' || r.masterProjectId === scope), [allReqs, scope])
  const steps = useMemo(() => { const ids = new Set(reqs.map((r) => r.id)); return allSteps.filter((s) => ids.has(s.requestId)) }, [allSteps, reqs])
  const now = new Date().toISOString()
  const sm = useMemo(() => summarize(reqs), [reqs])
  const thresholds = useMemo(() => [...new Set((ctx.activeRules?.rules ?? []).filter((r) => r.dimension === 'cost' && r.active).flatMap((r) => [r.pctMin, r.pctMax]).filter((x): x is number => x != null))].sort((a, b) => a - b), [ctx.activeRules])
  const agg = useMemo(() => cumulativeByContract(reqs, ctx.baseOf, thresholds), [reqs, ctx, thresholds])
  const baseSum = agg.reduce((s, a) => s + (a.base ?? 0), 0)
  const approvedOnBase = agg.filter((a) => a.base).reduce((s, a) => s + a.approvedAmount, 0)
  const live = reqs.filter((r) => r.status === 'awaiting_approval')
  const activeSteps = steps.filter((s) => s.status === 'active' && live.some((r) => r.id === s.requestId && r.attempt === s.attempt))
  const overdue = overdueSteps(activeSteps, now)
  const stuck = stalled(reqs, now, 14)
  const dw = dwellByRole(steps, now)
  const byRole = new Map<string, number>(); for (const s of activeSteps) byRole.set(s.roleName, (byRole.get(s.roleName) ?? 0) + 1)
  const blocked = reqs.filter((r) => r.routeStatus === 'blocked' && r.status === 'evaluating')
  const proj = scope !== 'all' ? ctx.project(scope) : undefined
  const eff = proj ? endDateImpact(proj.end, sm.approvedDays) : null
  const slices = STATUS_ORDER.map((s) => ({ key: s, label: STATUS_FA[s], value: reqs.filter((r) => r.status === s).length, color: STATUS_COLOR[s] })).filter((x) => x.value > 0)
  const need = [...overdue.map((s) => ({ id: s.requestId, why: `مهلت مرحلهٔ «${s.label || s.roleName}» گذشته (${jd(s.dueAt)})` })), ...blocked.map((r) => ({ id: r.id, why: 'مسیر تصویب تعیین نشد؛ نیازمند اصلاح قواعد' })), ...stuck.filter((r) => !overdue.some((s) => s.requestId === r.id)).map((r) => ({ id: r.id, why: `بیش از ۱۴ روز در مرحلهٔ «${STATUS_FA[r.status]}»` }))]
  const byId = new Map(reqs.map((r) => [r.id, r]))
  const needU = need.filter((n, i) => need.findIndex((m) => m.id === n.id) === i)

  return (
    <div className="im-page" style={{ display: 'grid', gap: 16 }}>
      <div className="im-row" style={{ justifyContent: 'space-between' }}><div><div className="im-page-title">داشبورد تغییرات</div><div className="im-page-sub">{scope === 'all' ? 'همهٔ پروژه‌های در دسترس شما' : ctx.projectName(scope)} · درصدها نسبت به مبلغ اولیهٔ قرارداد</div></div><HelpButton content={CM_HELP.dashboard} /></div>

      <div className="im-kpi-grid">
        <Kpi index={0} icon={FileClock} label="درخواست باز" value={sm.open} hint="ثبت‌شده، در ارزیابی، در انتظار تصویب یا عودت‌شده" />
        <Kpi index={1} icon={Gavel} label="در انتظار تصویب" value={sm.awaiting} tone={overdue.length ? 'warn' : undefined} hint={overdue.length ? `${overdue.length} مرحله از مهلت گذشته` : undefined} />
        <Kpi index={2} icon={Coins} label="مبلغ مصوب" value={money(sm.approvedAmount)} hint={baseSum ? `${pct(approvedOnBase / baseSum * 100)} مبلغ اولیهٔ قراردادها` : 'مبلغ پایه نامشخص'} color="#22c55e" />
        <Kpi index={3} icon={Hourglass} label="مبلغ در انتظار" value={money(sm.pendingAmount)} hint={baseSum ? `${pct(sm.pendingAmount / baseSum * 100)} مبلغ اولیه` : undefined} color="#f59e0b" />
        <Kpi index={4} icon={CalendarClock} label="تمدید مصوب (روز)" value={nf(sm.approvedDays)} hint={eff ? `پایان قراردادی ${jd(eff.from)} ← ${jd(eff.to)}` : `در انتظار: ${nf(sm.pendingDays)} روز`} color="#6366f1" />
        <Kpi index={5} icon={AlertTriangle} label="مغایر با مصوبه" value={sm.implementedWithDeviation} tone={sm.implementedWithDeviation ? 'bad' : 'good'} />
      </div>

      {needU.length > 0 && (
        <div className="im-card">
          <div className="im-section-title">نیازمند توجه <span className="im-helper">{needU.length} مورد</span></div>
          <div className="im-grid" style={{ gap: 6 }}>{needU.slice(0, 8).map((n, i) => { const r = byId.get(n.id); return r ? (
            <button key={i} type="button" className="im-card-flat" style={{ textAlign: 'start', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }} onClick={() => onOpen(r.id, 'flow')}>
              <span><span className="im-code">{r.crNumber}</span> {r.title}<div className="im-helper">{ctx.projectName(r.masterProjectId)} · {n.why}</div></span><StatusChip status={r.status} /></button>) : null })}</div>
        </div>
      )}

      <div className="cm-cols">
        <div className="im-card">
          <div className="im-section-title">تغییر تجمعی قراردادها</div>
          {agg.length === 0 ? <div className="im-empty">هنوز تغییری ثبت نشده است.</div> : (
            <div className="im-grid" style={{ gap: 10 }}>{agg.slice(0, 8).map((a) => {
              const p = ctx.project(a.masterProjectId); const c = a.contractId ? ctx.contract(a.contractId) : undefined
              const max = Math.max(30, ...thresholds, (a.withPendingPct ?? 0) + 3)
              return (
                <div key={a.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}><b>{p?.name ?? '—'}{c ? ' · ' + (c.number || c.title) : ''}</b><span className="cm-mono" style={{ color: a.crossed != null ? 'var(--im-coral)' : undefined }}>{a.base ? `${pct(a.approvedPct)} مصوب · ${pct(a.withPendingPct)} با در انتظار` : 'مبلغ پایه نامشخص'}</span></div>
                  <div className="cm-pctbar" style={{ marginTop: 4 }}>
                    <i style={{ width: `${Math.min(100, (a.withPendingPct ?? 0) / max * 100)}%`, background: '#f59e0b55' }} /><i style={{ width: `${Math.min(100, (a.approvedPct ?? 0) / max * 100)}%`, background: a.crossed != null ? 'var(--im-coral)' : 'var(--im-accent)' }} />
                    {thresholds.map((t) => <b key={t} style={{ insetInlineStart: `${t / max * 100}%` }} />)}
                  </div>
                  <div className="im-helper">{a.count} درخواست · تمدید مصوب {nf(a.approvedDays)} روز{a.crossed != null ? ` · از حد ${a.crossed}٪ گذشته` : a.next != null ? ` · تا حد ${a.next}٪ مانده` : ''}</div>
                </div>)
            })}</div>
          )}
        </div>
        <div className="im-card">
          <div className="im-section-title">وضعیت درخواست‌ها</div>
          <Donut slices={slices} centerLabel="درخواست" size={150} stroke={22} />
        </div>
      </div>

      <div className="cm-cols">
        <div className="im-card"><div className="im-section-title">بر اساس نوع تغییر</div>
          <HBars rows={[...sm.byType].map(([k, v]) => ({ key: k, label: TYPE_FA[k as ChangeType] ?? k, value: v })).sort((a, b) => b.value - a.value)} />
        </div>
        <div className="im-card"><div className="im-section-title">منتظر تصمیم نزد هر مرجع</div>
          {byRole.size === 0 ? <div className="im-empty">درخواستی در انتظار تصمیم نیست.</div> : <HBars rows={[...byRole].map(([k, v]) => ({ key: k, label: k, value: v, hint: dw.waiting.find((w) => w.role === k) ? `میانگین توقف ${dw.waiting.find((w) => w.role === k)!.avgDays} روز` : undefined })).sort((a, b) => b.value - a.value)} />}
        </div>
      </div>
      {dw.decided.length > 0 && (
        <div className="im-card"><div className="im-section-title">میانگین زمان تصمیم‌گیری (روز)</div><HBars rows={dw.decided.map((d) => ({ key: d.role, label: d.role, value: d.avgDays, hint: `${d.n} تصمیم · بیشینه ${Math.round(d.maxDays * 10) / 10} روز` }))} /></div>
      )}
    </div>
  )
}
