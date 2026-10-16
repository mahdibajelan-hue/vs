import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { Chip, KpiCard } from '../../finance/components/fn'
import { Tile } from '../../finance/components/charts'
import { ProgressCurve } from '../components/ProgressCurve'
import { Empty, ReportStatusChip, fa, pct } from '../components/common'
import { fmtD } from '../../finance/components/fn'
import { FORM_BY_KEY } from '../lib/formCatalog'
import { GAP_KIND_LABEL_FA } from '../types'
import { buildStatement } from '../lib/statement'
import type { ExTab } from '../ExecutionApp'
import { ExecutionPulse } from '../components/epc/ExecutionPulse'
import { AlertsPanel } from '../components/epc/AlertsPanel'
import { useEpcModel } from '../lib/useEpcModel'

export function DashboardPage({ projectId, onGo }: { projectId: string; sub: string; onGo: (t: ExTab, s?: string) => void }) {
  const m = useExecutionModel(projectId)
  const epc = useEpcModel(projectId)
  const [pulseKind, setPulseKind] = useState<'pipeline' | 'station' | 'all'>('all')
  const ex = useExecutionStore()
  const waiting = m.reports.filter((r) => r.status === 'submitted' || r.status === 'partially_approved')
  const returned = m.reports.filter((r) => r.status === 'returned' || r.status === 'incomplete')
  const todayReports = m.reports.filter((r) => r.reportDate === m.today && r.formKey === 'work')
  const gaps = m.detected.filter((g) => g.kind !== 'form_missing')
  const dev = m.planned.overall == null ? null : m.approved.overall - m.planned.overall
  const recent = useMemo(() => m.reports.slice().sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.createdAt.localeCompare(a.createdAt)).slice(0, 8), [m.reports])
  const mine = ex.myRoles(projectId)
  // contract value of the work done: approved quantities × contract unit price, against the value of the contract quantities; waiting quantities shown apart
  const money = useMemo(() => { const st = buildStatement({ activities: m.activities, reports: m.reports, lines: m.lines }, { from: '0000-01-01', to: m.today }, (a, d) => m.baseOf(a, d), () => ''); const contract = m.activities.filter((a) => a.active && a.approval === 'approved').reduce((t, a) => t + m.baseOf(a, m.today) * a.unitPrice, 0); return { done: st.grand.cumAmt, pending: st.grand.pendingAmt, contract } }, [m])
  if (!m.activities.length && !m.reports.length) return (
    <Empty>
      <b style={{ display: 'block', marginBottom: 6 }}>شروع کار در «مدیریت اجرا»</b>
      ۱) در «تنظیمات ← فهرست‌های بها» فهرست‌بهای قرارداد و ردیف‌های پیمان را تعریف کنید. ۲) در «تنظیمات» نقش‌ها (پیمانکار، دستگاه نظارت…) و جبهه‌های موردانتظار را مشخص کنید. ۳) پیمانکار هر روز «گزارش کارکرد» می‌سازد و ارسال می‌کند؛ دستگاه نظارت ردیف‌ها را تأیید می‌کند و پیشرفت و گزارش‌های هفتگی و ماهانه خودکار ساخته می‌شود.
      <div style={{ marginTop: 10 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={() => onGo('settings', 'rules')}>رفتن به مقادیر پیمان <ArrowLeft size={13} /></button></div>
    </Empty>
  )
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="پیشرفت فیزیکی (تأییدشده)" value={pct(m.approved.overall)} tone="good" sub={m.planned.overall != null ? `برنامه ${pct(m.planned.overall)}` : undefined} />
        <KpiCard i={1} label="انحراف از برنامه" value={dev == null ? '—' : `${dev > 0 ? '+' : ''}${(dev * 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`} tone={dev == null ? 'neutral' : dev < -0.05 ? 'bad' : dev < 0 ? 'warn' : 'good'} onClick={() => onGo('progress')} />
        <KpiCard i={2} label="در انتظار بررسی نظارت" value={fa(waiting.length)} tone={waiting.length ? 'warn' : 'good'} onClick={() => onGo('review')} />
        <KpiCard i={4} label="ارزش کارکرد تأییدشده (ریال)" value={fa(Math.round(money.done))} tone="good" sub={money.contract > 0 ? `${pct(money.done / money.contract, 1)} از ارزش مقدارهای پیمان` : undefined} onClick={() => onGo('reports', 'statement')} />
        <KpiCard i={5} label="کارکرد در انتظار تأیید (ریال)" value={fa(Math.round(money.pending))} tone={money.pending ? 'warn' : 'good'} sub="هنوز در صورت‌وضعیت حساب نمی‌شود" onClick={() => onGo('review')} />
        <KpiCard i={3} label="کسری گزارش‌ها" value={fa(gaps.length)} tone={gaps.length ? 'bad' : 'good'} sub="دریافت‌نشده، ناقص، ناسازگار" onClick={() => onGo('gaps')} />
      </div>
      <Tile title="برنامه در برابر عملکرد واقعی" hint="نمایش زمانی از داده‌های تأییدشده و برنامهٔ مصوب"><div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>{([['all', 'همهٔ شاخص‌ها'], ['pipeline', 'خط لوله'], ['station', 'ایستگاه و تأسیسات']] as const).map(([k, l]) => <button key={k} className={`mt-pill${pulseKind === k ? ' on' : ''}`} onClick={() => setPulseKind(k)}>{l}</button>)}</div><ExecutionPulse m={m} kind={pulseKind} /></Tile>
      {epc.engDocs.length > 0 && (
        <div className="fn-kpis">
          <KpiCard i={0} label="امتیاز پیشرفت مهندسی" value={pct(epc.eng.progress.actualScore)} tone={epc.eng.progress.actualScore + 0.03 >= epc.eng.progress.plannedScore ? 'good' : 'warn'} sub={`برنامه ${pct(epc.eng.progress.plannedScore)}`} />
          <KpiCard i={1} label="مدارک بحرانی باز" value={fa(epc.eng.criticalOpen.length)} tone={epc.eng.criticalOpen.some((c) => c.fc.overdue) ? 'bad' : 'neutral'} sub={`${fa(epc.eng.criticalOpen.filter((c) => c.fc.overdue).length)} عقب‌افتاده`} />
          <KpiCard i={2} label="فعالیت غیرآمادهٔ اجرا (مدارک)" value={fa(epc.eng.notReady.length)} tone={epc.eng.notReady.length ? 'bad' : 'good'} />
          <KpiCard i={3} label="اثر پیش‌بینی‌شدهٔ مدارک بر تکمیل پروژه" value={epc.eng.slipMax == null ? 'نامشخص' : `${fa(epc.eng.slipMax)} روز`} tone={epc.eng.slipMax ? 'bad' : 'neutral'} />
        </div>
      )}
      <AlertsPanel alerts={epc.alerts} onGo={onGo} />
      <div className="mt-two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 12 }}>
        <Tile title="منحنی پیشرفت" hint="برنامه، ثبت‌شده و تأییدشده"><ProgressCurve data={m.curve} h={230} /></Tile>
        <Tile title="کارهای شما" hint={mine.length ? undefined : 'نقشی در این پروژه ندارید (مدیر سامانه همه‌چیز را می‌بیند)'}>
          <div style={{ display: 'grid', gap: 8 }}>
            <button className="ex-form-tile" onClick={() => onGo('daily', 'work')}><b>گزارش امروز: {todayReports.length ? `${fa(todayReports.length)} گزارش ثبت شده` : 'هنوز ثبت نشده'}</b><small>{returned.length ? `${fa(returned.length)} گزارش برگشت‌خورده یا نیازمند تکمیل` : 'گزارش برگشت‌خورده‌ای نیست'}</small></button>
            <button className="ex-form-tile" onClick={() => onGo('review')}><b>کارتابل بررسی: {fa(waiting.length)} گزارش</b><small>{waiting.length ? `قدیمی‌ترین: ${fmtD((waiting.slice().sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))[0]?.submittedAt ?? '').slice(0, 10))}` : 'همه بررسی شده'}</small></button>
            <button className="ex-form-tile" onClick={() => onGo('gaps')}><b>کسری‌های باز: {fa(gaps.length)}</b><small>{gaps.slice(0, 2).map((g) => GAP_KIND_LABEL_FA[g.kind]).join('، ') || 'کسری شناسایی نشده'}</small></button>
          </div>
        </Tile>
      </div>
      {gaps.length > 0 && (
        <div className="im-card" style={{ padding: '10px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderInlineStart: '3px solid var(--im-amber)' }}>
          <AlertTriangle size={16} style={{ color: 'var(--im-amber)' }} />
          <span>{fa(gaps.filter((g) => g.kind === 'missing_report').length)} گزارش دریافت‌نشده · {fa(gaps.filter((g) => g.kind === 'incomplete').length)} گزارش ناقص · {fa(gaps.filter((g) => g.kind === 'inconsistent').length)} ناسازگاری · {fa(gaps.filter((g) => g.kind === 'unreviewed').length)} بررسی‌نشده</span>
          <button className="im-btn im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => onGo('gaps')}>مشاهده و تولید گزارش تکمیلی</button>
        </div>
      )}
      <div className="im-card" style={{ padding: 0 }}>
        <div style={{ padding: '10px 14px' }}><b>آخرین گزارش‌ها</b></div>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><tbody>{recent.map((r) => <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => onGo('daily', r.formKey === 'work' ? 'work' : 'forms')}><td className="fn-code">{r.reportNo}</td><td>{r.formKey === 'work' ? 'کارکرد روزانه' : FORM_BY_KEY[r.formKey]?.title}</td><td>{fmtD(r.reportDate)}</td><td>{r.front || '—'}</td><td><ReportStatusChip status={r.status} /></td></tr>)}{recent.length === 0 && <tr><td className="fn-empty">گزارشی نیست.</td></tr>}</tbody></table></div>
      </div>
      <p className="im-helper" style={{ margin: 0 }}><Chip>{m.baselines.filter((b) => b.status === 'approved').length ? `نسخهٔ مبنای ${fa(Math.max(...m.baselines.filter((b) => b.status === 'approved').map((b) => b.version)))}` : 'بدون نسخهٔ مبنای مصوب'}</Chip> · تأیید کارکرد به‌معنای تأیید کیفیت نهایی یا صورت‌وضعیت مالی نیست.</p>
    </div>
  )
}
