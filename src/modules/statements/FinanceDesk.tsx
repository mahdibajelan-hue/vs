import { Suspense, lazy, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useFinanceStore } from '../finance/store/useFinanceStore'
import { useFinanceControlStore } from '../finance/store/useFinanceControlStore'
import type { ReportId } from '../finance/pages/v3/ReportsCenter'
import '../issues/issues.css'
import '../finance/finance-dashboard.css'

// the finance register's own pages, now hosted here: final approval, payments and the statement / payment reports of the project
const PipelinePage = lazy(() => import('../finance/pages/control/PipelinePage').then((m) => ({ default: m.PipelinePage })))
const BillingManage = lazy(() => import('../finance/pages/v3/BillingManage').then((m) => ({ default: m.BillingManage })))
const ReportsCenter = lazy(() => import('../finance/pages/v3/ReportsCenter').then((m) => ({ default: m.ReportsCenter })))
const STATEMENT_REPORTS: ReportId[] = ['delay', 'matrix', 'aging', 'flow', 'advance', 'contractors']

function useFinanceData() {
  const loaded = useFinanceStore((s) => s.loaded), ctl = useFinanceControlStore((s) => s.loaded)
  useEffect(() => { if (!useFinanceStore.getState().loaded) void useFinanceStore.getState().fetchAll(); if (!useFinanceControlStore.getState().loaded) void useFinanceControlStore.getState().fetchAll() }, [])
  return loaded && ctl
}
const Wait = () => <div className="pst-empty"><Loader2 className="animate-spin" /> در حال بارگذاری دفتر صورت‌وضعیت‌ها و پرداخت‌ها…</div>

type View = 'pipeline' | 'certificates' | 'payments'
const VIEWS: [View, string, string][] = [
  ['pipeline', 'گردش', 'هر صورت‌وضعیت در کدام مرحله است و چند روز آن‌جا مانده'],
  ['certificates', 'تأیید نهایی', 'صورت‌وضعیت‌های قرارداد: تأیید کارکرد، تصویب نهایی، ویرایش کسور'],
  ['payments', 'ثبت پرداخت', 'پرداخت هر صورت‌وضعیت؛ وضعیت «پرداخت‌شده / پرداخت جزئی» از روی پرداخت‌ها به‌روز می‌شود'],
]

/** تأیید نهایی و پرداخت — every payment statement of the project's contracts (generated here or recorded earlier) */
export function PaymentDesk({ projectId }: { projectId: string }) {
  const ready = useFinanceData()
  const [view, setView] = useState<View>('certificates')
  return (
    <div className="ps-stack">
      <div className="pst-bar-actions" role="tablist" aria-label="نماها">
        {VIEWS.map(([k, l, h]) => <button key={k} type="button" role="tab" aria-selected={view === k} title={h} className={`ps-btn ${view === k ? 'is-primary' : ''}`} onClick={() => setView(k)}>{l}</button>)}
        <span className="sp" /><small style={{ color: 'var(--text-muted)' }}>{VIEWS.find((v) => v[0] === view)![2]}</small>
      </div>
      <div className="im-root fn-root pst-fin">
        {!ready ? <Wait /> : <Suspense fallback={<Wait />}>{view === 'pipeline' ? <PipelinePage masterProjectId={projectId} /> : <BillingManage masterProjectId={projectId} view={view} />}</Suspense>}
      </div>
    </div>
  )
}

/** reports of statements and payments (budget, contract and guarantee reports stay in «قراردادها و مالی») */
export function StatementReports({ projectId }: { projectId: string }) {
  const ready = useFinanceData()
  return <div className="im-root fn-root pst-fin">{!ready ? <Wait /> : <Suspense fallback={<Wait />}><ReportsCenter masterProjectId={projectId} only={STATEMENT_REPORTS} /></Suspense>}</div>
}
