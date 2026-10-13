import { Fragment, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { jalaliText, periodsBetween, type Period } from '../lib/periods'
import { buildStatement, type StatementTotals } from '../lib/statement'
import { Chip, KpiCard } from '../../finance/components/fn'
import { Empty, fa, pct } from '../components/common'

const money = (n: number) => fa(Math.round(n))
const T = ({ t }: { t: StatementTotals }) => (
  <>
    <td colSpan={5} className="num sub">ارزش پیمان: {money(t.contractAmt)}</td>
    <td className="num"><b>{money(t.periodAmt)}</b></td><td className="num"><b>{money(t.cumAmt)}</b></td>
    <td className="num">{t.contractAmt > 0 ? pct(t.cumAmt / t.contractAmt, 1) : '—'}</td><td className="num sub">{t.pendingAmt ? money(t.pendingAmt) : '—'}</td>
  </>
)

/** The work-done statement of a month, priced from the supervision-approved quantities — the starting point of the payment-statement reviewer. */
export function StatementPage({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const dates = m.reports.filter((r) => r.formKey === 'work').map((r) => r.reportDate).sort()
  const first = m.settings.projectStart || dates[0] || m.today
  const periods = useMemo(() => periodsBetween('month', first, m.today, m.settings.weekStart), [first, m.today, m.settings.weekStart])
  const [idx, setIdx] = useState<number | null>(null)
  const pi = Math.min(idx ?? periods.length - 1, periods.length - 1)
  const period: Period | undefined = periods[pi]
  const bookTitle = (id: string | null) => ex.books.find((b) => b.id === id)?.title ?? 'بدون فهرست‌بها'
  const st = useMemo(() => (period ? buildStatement({ activities: m.activities, reports: m.reports, lines: m.lines }, period, (a, d) => m.baseOf(a, d), bookTitle, m.settings.overBasePct) : null), [m.activities, m.reports, m.lines, period?.key]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!period || !st) return <Empty>ابتدا فعالیت‌ها و گزارش‌های روزانه ثبت شود.</Empty>
  const contractAll = m.activities.filter((a) => a.active && a.approval === 'approved').reduce((s, a) => s + m.baseOf(a, period.to) * a.unitPrice, 0)

  const excel = async () => {
    const XLSX = await import('xlsx')
    const out: Record<string, string | number>[] = []
    for (const b of st.books) for (const c of b.chapters) for (const r of c.rows) out.push({ 'فهرست‌بها': b.title, 'فصل': c.title, 'ردیف': r.activity.rowNo, 'کد': r.activity.itemNo, 'شرح': r.activity.title, 'واحد': r.activity.unit, 'مقدار پیمان': r.base, 'قیمت واحد': r.unitPrice, 'مقدار تا قبل': r.prev, 'مقدار این دوره': r.period, 'مقدار تجمعی': r.cum, 'مبلغ این دوره': r.periodAmt, 'مبلغ تجمعی': r.cumAmt, 'درصد پیشرفت': Math.round(r.pct * 1000) / 10, 'در انتظار تأیید (مقدار)': r.pending, 'بیش از مقدار پیمان': r.over ? 'بله' : '' })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out.length ? out : [{ '—': '' }]), 'صورت‌وضعیت کارکرد')
    XLSX.writeFile(wb, `صورت-وضعیت-کارکرد-${period.from}.xlsx`)
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mt-filters no-print">
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <button className="im-btn im-btn-sm" disabled={pi <= 0} onClick={() => setIdx(pi - 1)} aria-label="ماه قبل"><ChevronRight size={14} /></button>
          <select value={pi} onChange={(e) => setIdx(Number(e.target.value))} aria-label="دوره">{periods.map((p, i) => <option key={p.key} value={i}>{p.label}</option>)}</select>
          <button className="im-btn im-btn-sm" disabled={pi >= periods.length - 1} onClick={() => setIdx(pi + 1)} aria-label="ماه بعد"><ChevronLeft size={14} /></button>
        </span>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}><button className="im-btn im-btn-sm" onClick={() => void excel()}><Download size={13} /> اکسل</button><button className="im-btn im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ</button></span>
      </div>
      <div className="mt-printable" style={{ display: 'grid', gap: 12 }}>
        <div className="mt-print-head"><div><h2>صورت‌وضعیت کارکرد (پیش‌نویس از گزارش‌های روزانه)</h2><p>{project?.officialName} — {period.label}</p></div><p>تاریخ تهیه: {jalaliText(m.today)}</p></div>
        <div className="fn-kpis">
          <KpiCard i={0} label="مبلغ کارکرد تأییدشدهٔ دوره" value={money(st.grand.periodAmt)} sub="ریال" tone="good" />
          <KpiCard i={1} label="مبلغ تجمعی تا پایان دوره" value={money(st.grand.cumAmt)} sub={contractAll > 0 ? `${pct(st.grand.cumAmt / contractAll, 1)} از ارزش پیمان` : 'ریال'} />
          <KpiCard i={2} label="در انتظار تأیید نظارت (جدا از صورت‌وضعیت)" value={money(st.grand.pendingAmt)} sub="ریال — هنوز جمع نشده" tone={st.grand.pendingAmt ? 'warn' : 'good'} />
          <KpiCard i={3} label="ردیف بیش از مقدار پیمان" value={fa(st.overRows)} tone={st.overRows ? 'bad' : 'good'} sub={st.overRows ? 'نیازمند دستور تغییر یا اصلاح مقدار' : undefined} />
        </div>
        {st.rowCount === 0 ? <Empty>در این دوره و پیش از آن کارکرد تأییدشده‌ای نیست.</Empty> : (
          <div className="im-card" style={{ padding: 0 }}>
            <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
              <table className="ex-lines">
                <thead><tr><th>ردیف</th><th>کد</th><th>شرح</th><th>واحد</th><th className="num">مقدار پیمان</th><th className="num">قیمت واحد</th><th className="num">تا قبل</th><th className="num">این دوره</th><th className="num">تجمعی</th><th className="num">مبلغ این دوره</th><th className="num">مبلغ تجمعی</th><th className="num">پیشرفت</th><th className="num">در انتظار</th></tr></thead>
                <tbody>
                  {st.books.map((b) => (
                    <Fragment key={b.key}>
                      <tr className="ex-sec"><td colSpan={13}><b>{b.title}</b></td></tr>
                      {b.chapters.map((c) => (
                        <Fragment key={c.key}>
                          <tr style={{ background: 'color-mix(in srgb, var(--im-line, #94a3b8) 14%, transparent)' }}><td colSpan={13}><b>{c.title}</b></td></tr>
                          {c.rows.map((r) => (
                            <tr key={r.activity.id} className={r.over ? 'ex-row-bad' : undefined}>
                              <td>{r.activity.rowNo}</td><td className="fn-code">{r.activity.itemNo}</td>
                              <td>{r.activity.title}{r.activity.parentActivityId && <Chip>اضافه‌بها</Chip>}{r.over && <small className="ex-bad" style={{ display: 'block' }}>تجمعی بیش از مقدار پیمان ({fa(r.base, 2)})</small>}</td>
                              <td>{r.activity.unit}</td><td className="num">{fa(r.base, 2)}</td><td className="num">{money(r.unitPrice)}</td>
                              <td className="num">{fa(r.prev, 2)}</td><td className="num"><b>{fa(r.period, 2)}</b></td><td className="num">{fa(r.cum, 2)}</td>
                              <td className="num"><b>{money(r.periodAmt)}</b></td><td className="num">{money(r.cumAmt)}</td><td className="num">{pct(r.pct, 0)}</td>
                              <td className="num sub">{r.pending ? fa(r.pending, 2) : '—'}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '1px solid var(--im-line)' }}><td colSpan={4}>جمع فصل «{c.title}»</td><T t={c.totals} /></tr>
                        </Fragment>
                      ))}
                      <tr className="ex-total"><td colSpan={4}><b>جمع فهرست‌بها</b></td><T t={b.totals} /></tr>
                    </Fragment>
                  ))}
                  <tr className="ex-total"><td colSpan={4}><b>جمع کل صورت‌وضعیت</b></td><T t={st.grand} /></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="im-helper" style={{ margin: 0 }}>فقط مقدارهای تأییدشدهٔ دستگاه نظارت جمع می‌شوند. این برگه جایگزین صورت‌وضعیت مالی نیست؛ مبنای بررسی کارشناس صورت‌وضعیت است و مبلغ‌ها بر پایهٔ بهای واحد قرارداد (بدون تعدیل و کسورات) محاسبه شده‌اند.</p>
      </div>
    </div>
  )
}
