import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useMaterialModel } from '../../material/lib/control/useMaterialModel'
import { useExecutionModel } from '../lib/useExecutionModel'
import { activityRows, byDimension, dailyMatrix, resourceSummary, statusSummary, stoppageSummary, type Dim } from '../lib/periodReport'
import { addDays, jalaliText, monthOf, periodsBetween, weekOf, type Period } from '../lib/periods'
import { physicalProgress, plannedOverall } from '../lib/progress'
import { Chip, DataTable, KpiCard, Section, fmtD, type Col } from '../../finance/components/fn'
import { Bar, Empty, fa, pct } from '../components/common'
import { REPORT_STATUS_LABEL_FA, LINE_STATUS_LABEL_FA } from '../types'
import { STOPPAGE_CATEGORY_FA } from '../lib/formCatalog'
import type { ActivityPeriodRow } from '../lib/periodReport'

const DIMS: [Dim, string][] = [['contractor', 'پیمانکار'], ['front', 'جبهه کاری'], ['station', 'ایستگاه'], ['km', 'محدودهٔ کیلومتری']]

/** Weekly, monthly and cumulative reports — computed from the daily reports and the supervision's approvals; nothing is entered a second time. */
export function PeriodReportsPage({ projectId, sub }: { projectId: string; sub: string }) {
  const m = useExecutionModel(projectId)
  const orgs = useMasterDataStore((s) => s.organizations)
  const mm = useMaterialModel(projectId)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const [dim, setDim] = useState<Dim>('front')
  const dates = m.reports.filter((r) => r.formKey === 'work').map((r) => r.reportDate).sort()
  const first = m.settings.projectStart || dates[0] || m.today
  const periods = useMemo(() => (sub === 'cum' ? [] : periodsBetween(sub === 'week' ? 'week' : 'month', first, m.today, m.settings.weekStart)), [sub, first, m.today, m.settings.weekStart])
  const [idx, setIdx] = useState<number | null>(null)
  const period: Period = sub === 'cum' ? { kind: 'month', key: 'ALL', label: `از ابتدای پروژه تا ${jalaliText(m.today)}`, from: first, to: m.today } : periods[Math.min(idx ?? periods.length - 1, periods.length - 1)] ?? (sub === 'week' ? weekOf(m.today, m.settings.weekStart) : monthOf(m.today))
  const pi = periods.indexOf(period)
  const ctx = { activities: m.activities, reports: m.reports, lines: m.lines, resources: m.resources, stoppages: m.stoppages }
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? '—'
  const rows = useMemo(() => activityRows(ctx, period, (a) => m.baseOf(a, period.to)), [m.reports, m.lines, m.activities, period.key, period.from, period.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const matrix = useMemo(() => (sub === 'week' ? dailyMatrix(ctx, period) : null), [m.reports, m.lines, m.activities, sub, period.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const dimRows = useMemo(() => byDimension(ctx, period, dim, orgName), [m.reports, m.lines, m.activities, period.key, dim]) // eslint-disable-line react-hooks/exhaustive-deps
  const resRows = useMemo(() => resourceSummary(ctx, period), [m.reports, m.resources, period.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const stopRows = useMemo(() => stoppageSummary(ctx, period), [m.reports, m.stoppages, period.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => statusSummary(ctx, period), [m.reports, m.lines, period.key]) // eslint-disable-line react-hooks/exhaustive-deps
  const base = { activities: m.activities, baselines: m.baselines, blines: m.blines, reports: m.reports, lines: m.lines }
  const actualEnd = physicalProgress({ ...base, asOf: period.to, mode: 'approved', groupWeights: m.settings.groupWeights }).overall
  const actualStart = physicalProgress({ ...base, asOf: period.from === first ? '0000-01-01' : addDays(period.from, -1), mode: 'approved', groupWeights: m.settings.groupWeights }).overall
  const plannedEnd = plannedOverall({ activities: m.activities, baselines: m.baselines, blines: m.blines, asOf: period.to, groupWeights: m.settings.groupWeights }).overall
  const periodGain = actualEnd - (sub === 'cum' ? 0 : actualStart)
  const reps = m.reports.filter((r) => r.formKey === 'work' && r.reportDate >= period.from && r.reportDate <= period.to)

  const cols: Col<ActivityPeriodRow>[] = [
    { key: 'i', label: 'ردیف', render: (r) => <span className="fn-code strong">{r.activity.itemNo}</span> },
    { key: 't', label: 'شرح', render: (r) => r.activity.title },
    { key: 'u', label: 'واحد', render: (r) => r.activity.unit },
    { key: 'b', label: 'مقدار مبنا', num: true, render: (r) => fa(r.base, 2) },
    { key: 'p', label: 'تجمعی تا قبل', num: true, render: (r) => fa(r.prevApproved, 2) },
    { key: 'a', label: 'کارکرد دوره (تأییدشده)', num: true, render: (r) => <b>{fa(r.approved, 2)}</b>, sort: (r) => r.approved },
    { key: 'w', label: 'در انتظار', num: true, render: (r) => (r.pending ? fa(r.pending, 2) : '—') },
    { key: 'x', label: 'ردشده / برگشتی', num: true, render: (r) => (r.rejected + r.returned ? <span className="ex-bad">{fa(r.rejected, 2)} / {fa(r.returned, 2)}</span> : '—') },
    { key: 'c', label: 'تجمعی تأییدشده', num: true, render: (r) => fa(r.cumApproved, 2) },
    { key: 'r', label: 'باقی‌مانده', num: true, render: (r) => fa(r.remaining, 2) },
    { key: 'g', label: 'پیشرفت', render: (r) => <><Bar value={r.pct} /><span className="sub">{pct(r.pct, 0)}</span></> },
  ]
  const excel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const add = (name: string, data: Record<string, string | number>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ '—': '' }]), name.slice(0, 31))
    add('کارکرد به‌تفکیک ردیف', rows.map((r) => ({ 'ردیف': r.activity.itemNo, 'شرح': r.activity.title, 'واحد': r.activity.unit, 'مقدار مبنا': r.base, 'تجمعی تا قبل': r.prevApproved, 'کارکرد دوره (تأییدشده)': r.approved, 'در انتظار': r.pending, 'ردشده': r.rejected, 'برگشتی': r.returned, 'تجمعی تأییدشده': r.cumApproved, 'باقی‌مانده': r.remaining, 'پیشرفت ٪': Math.round(r.pct * 1000) / 10 })))
    if (matrix) add('روزانه', matrix.rows.map((r) => ({ 'ردیف': r.activity.itemNo, 'شرح': r.activity.title, 'واحد': r.activity.unit, ...Object.fromEntries(matrix.days.map((d) => [jalaliText(d), r.byDay[d] ?? 0])), 'جمع': r.total })))
    for (const [k, l] of DIMS) add(`به‌تفکیک ${l}`, byDimension(ctx, period, k, orgName).map((x) => ({ [l]: x.key, 'ردیف': x.activity.itemNo, 'شرح': x.activity.title, 'واحد': x.activity.unit, 'ثبت‌شده': x.registered, 'تأییدشده': x.approved })))
    add('منابع', resRows.map((x) => ({ 'نوع': x.kind === 'man' ? 'نیرو' : 'ماشین', 'عنوان': x.name, 'میانگین فعال': x.avgActive, 'میانگین غیرفعال': x.avgIdle, 'ساعت کار': x.hours, 'روز': x.days })))
    add('توقف‌ها', stopRows.map((x) => ({ 'عامل': STOPPAGE_CATEGORY_FA[x.category], 'ساعت': x.hours, 'دفعات': x.count })))
    XLSX.writeFile(wb, `گزارش-${sub === 'week' ? 'هفتگی' : sub === 'month' ? 'ماهانه' : 'تجمعی'}-${period.from}.xlsx`)
  }
  if (!m.activities.length) return <Empty>ابتدا فعالیت‌ها و گزارش‌های روزانه ثبت شود.</Empty>
  const kindLabel = sub === 'week' ? 'هفتگی' : sub === 'month' ? 'ماهانه' : 'تجمعی'
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mt-filters no-print">
        {sub !== 'cum' && <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <button className="im-btn im-btn-sm" disabled={pi <= 0} onClick={() => setIdx(pi - 1)} aria-label="دورهٔ قبل"><ChevronRight size={14} /></button>
          <select value={pi} onChange={(e) => setIdx(Number(e.target.value))} aria-label="دوره">{periods.map((p, i) => <option key={p.key} value={i}>{p.label}</option>)}</select>
          <button className="im-btn im-btn-sm" disabled={pi >= periods.length - 1} onClick={() => setIdx(pi + 1)} aria-label="دورهٔ بعد"><ChevronLeft size={14} /></button></span>}
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}><button className="im-btn im-btn-sm" onClick={() => void excel()}><Download size={13} /> اکسل</button><button className="im-btn im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ</button></span>
      </div>
      <div className="mt-printable" style={{ display: 'grid', gap: 12 }}>
        <div className="mt-print-head"><div><h2>گزارش {kindLabel} اجرا</h2><p>{project?.officialName} — {period.label}</p></div><p>تاریخ تهیه: {jalaliText(m.today)}</p></div>
        <div className="fn-kpis">
          <KpiCard i={0} label="پیشرفت فیزیکی در پایان دوره" value={pct(actualEnd)} tone="good" sub={plannedEnd != null ? `برنامه ${pct(plannedEnd)}` : undefined} />
          <KpiCard i={1} label={sub === 'cum' ? 'پیشرفت از ابتدا' : 'افزایش پیشرفت در دوره'} value={`${sub === 'cum' ? '' : '+'}${(periodGain * 100).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`} />
          <KpiCard i={2} label="گزارش‌های دوره" value={fa(reps.length)} sub={`${fa(reps.filter((r) => r.status === 'approved').length)} تأییدشده`} />
          <KpiCard i={3} label="انحراف از برنامه" value={plannedEnd == null ? '—' : `${actualEnd - plannedEnd > 0 ? '+' : ''}${((actualEnd - plannedEnd) * 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`} tone={plannedEnd == null ? 'neutral' : actualEnd < plannedEnd - 0.05 ? 'bad' : actualEnd < plannedEnd ? 'warn' : 'good'} />
        </div>
        <Section title="کارکرد به‌تفکیک ردیف فهرست‌بها" hint="مقایسهٔ اجراشده با مقدار مبنای پیمان؛ مقدارهای ناهم‌جنس جمع زده نمی‌شوند." flush><DataTable cols={cols} rows={rows} rowKey={(r) => r.activity.id} empty="در این دوره کارکردی ثبت نشده است." /></Section>
        {matrix && matrix.rows.length > 0 && <Section title="کارکرد روزانه در هفته (ثبت‌شده)" flush><div className="fn-tbl-wrap"><table className="ex-lines"><thead><tr><th>ردیف</th><th>شرح</th>{matrix.days.map((d) => <th key={d} className="num">{jalaliText(d).slice(5)}</th>)}<th className="num">جمع</th></tr></thead><tbody>{matrix.rows.map((r) => <tr key={r.activity.id}><td className="fn-code">{r.activity.itemNo}</td><td>{r.activity.title} <span className="sub">({r.activity.unit})</span></td>{matrix.days.map((d) => <td key={d} className="num">{r.byDay[d] ? fa(r.byDay[d], 1) : '—'}</td>)}<td className="num"><b>{fa(r.total, 1)}</b></td></tr>)}</tbody></table></div></Section>}
        <Section title="به‌تفکیک پیمانکار، جبهه، ایستگاه و کیلومتر" action={<select value={dim} onChange={(e) => setDim(e.target.value as Dim)} aria-label="تفکیک بر پایهٔ">{DIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>} flush>
          <DataTable rows={dimRows} rowKey={(x) => `${x.key}|${x.activity.id}`} empty="داده‌ای نیست." cols={[{ key: 'k', label: DIMS.find((d) => d[0] === dim)![1], render: (x) => <span className="strong">{x.key}</span> }, { key: 'i', label: 'ردیف', render: (x) => <span className="fn-code">{x.activity.itemNo}</span> }, { key: 't', label: 'شرح', render: (x) => x.activity.title }, { key: 'r', label: 'ثبت‌شده', num: true, render: (x) => `${fa(x.registered, 2)} ${x.activity.unit}` }, { key: 'a', label: 'تأییدشده', num: true, render: (x) => fa(x.approved, 2) }]} />
        </Section>
        <div className="mt-two" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <Section title="نیروی انسانی و ماشین‌آلات" hint="میانگین روزانه از گزارش‌های ثبت‌شده" flush><DataTable rows={resRows} rowKey={(x) => `${x.kind}${x.name}`} empty="منابعی ثبت نشده است." cols={[{ key: 'n', label: 'عنوان', render: (x) => <><span className="strong">{x.name}</span><span className="sub">{x.kind === 'man' ? 'نیرو' : 'ماشین'}</span></> }, { key: 'a', label: 'میانگین فعال', num: true, render: (x) => fa(x.avgActive, 1) }, { key: 'i', label: 'میانگین غیرفعال', num: true, render: (x) => fa(x.avgIdle, 1) }, { key: 'h', label: 'ساعت', num: true, render: (x) => fa(x.hours, 1) }]} /></Section>
          <Section title="توقف‌ها و عوامل کاهش کارکرد" flush><DataTable rows={stopRows} rowKey={(x) => x.category} empty="توقفی ثبت نشده است." cols={[{ key: 'c', label: 'عامل', render: (x) => STOPPAGE_CATEGORY_FA[x.category] }, { key: 'h', label: 'ساعت', num: true, render: (x) => fa(x.hours, 1), sort: (x) => x.hours }, { key: 'n', label: 'دفعات', num: true, render: (x) => fa(x.count) }]} /></Section>
        </div>
        {(() => { const ids = new Set(reps.map((r) => r.id)); const rowsM = m.stoppages.filter((x) => ids.has(x.reportId) && x.materialId); return rowsM.length > 0 && (
          <Section title="توقف‌های ناشی از کمبود کالا" hint="از گزارش‌های روزانه؛ وضعیت فعلی کالا از ماژول تأمین" flush>
            <DataTable rows={rowsM} rowKey={(x) => x.id} cols={[{ key: 'm', label: 'کالا', render: (x) => <span className="strong">{mm.materials.find((y) => y.id === x.materialId)?.description ?? '—'}</span> }, { key: 'h', label: 'ساعت توقف', num: true, render: (x) => fa(x.hours, 1) }, { key: 'o', label: 'موجودی فعلی', num: true, render: (x) => fa(mm.positions.get(x.materialId!)?.onHand ?? 0, 1) }, { key: 'g', label: 'کسری بدون پوشش سفارش', num: true, render: (x) => { const g = mm.positions.get(x.materialId!)?.uncoveredGap ?? 0; return g > 0 ? <b style={{ color: 'var(--im-coral)' }}>{fa(g, 1)}</b> : <Chip tone="good">پوشش دارد</Chip> } }, { key: 'd', label: 'شرح', render: (x) => x.description || '—' }]} />
          </Section>) })()}
        <Section title="وضعیت تأیید گزارش‌ها و ردیف‌ها" hint="گزارش‌های دوره به تفکیک تأییدشده، در انتظار، ردشده و اصلاح‌شده" flush>
          <div style={{ padding: '10px 14px', display: 'grid', gap: 8 }}>
            <div className="ex-chiprow">{Object.entries(st.reports).map(([k, v]) => <Chip key={k} tone={k === 'approved' ? 'good' : k === 'rejected' || k === 'returned' ? 'bad' : 'warn'}>{REPORT_STATUS_LABEL_FA[k as keyof typeof REPORT_STATUS_LABEL_FA]}: {fa(v)}</Chip>)}{Object.keys(st.reports).length === 0 && <span className="im-helper">—</span>}</div>
            <div className="ex-chiprow">{Object.entries(st.lines).map(([k, v]) => <Chip key={k} tone={k === 'approved' ? 'good' : k === 'rejected' ? 'bad' : 'neutral'}>ردیف {LINE_STATUS_LABEL_FA[k as keyof typeof LINE_STATUS_LABEL_FA]}: {fa(v)}</Chip>)}</div>
            <span className="im-helper" style={{ margin: 0 }}>بازه: {fmtD(period.from)} تا {fmtD(period.to)}</span>
          </div>
        </Section>
      </div>
    </div>
  )
}
