import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { STOPPAGE_CATEGORY_FA } from '../lib/formCatalog'
import { RESPONSIBILITIES, RESPONSIBILITY_FA, buildDelays, type DelayRow, type Responsibility } from '../lib/delays'
import { Chip, KpiCard, Section, fmtD } from '../../finance/components/fn'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { Empty, fa } from '../components/common'

const NOTICE_CHIP: Record<DelayRow['notice'], { tone: 'good' | 'warn' | 'bad' | 'neutral'; label: string }> = { sent: { tone: 'good', label: 'اخطار به‌موقع' }, late: { tone: 'bad', label: 'اخطار با تأخیر' }, due: { tone: 'warn', label: 'اخطار نشده' }, lost: { tone: 'bad', label: 'مهلت اخطار گذشته' }, na: { tone: 'neutral', label: '—' } }
const RESP_TONE: Record<Responsibility, 'good' | 'warn' | 'bad' | 'neutral'> = { '': 'neutral', employer: 'good', contractor: 'bad', force_majeure: 'warn', third_party: 'warn', shared: 'neutral' }

/** The delay & claim register: every stoppage of the daily reports with its responsibility, critical-path flag and written-notice status — the evidence the delay / claims analyst works from. */
export function DelaysPage({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const [filter, setFilter] = useState<'all' | 'unassessed' | 'notice' | 'claimable'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const d = useMemo(() => buildDelays({ stoppages: m.stoppages, reports: m.reports, today: m.today, noticeDays: m.settings.delayNoticeDays ?? 14, hoursPerDay: m.settings.workdayHours }), [m.stoppages, m.reports, m.today, m.settings.delayNoticeDays, m.settings.workdayHours])
  const canAssess = ex.can(projectId, 'assess_delay'), canNotice = ex.can(projectId, 'notice')
  const shown = d.rows.filter((r) => filter === 'all' || (filter === 'unassessed' && !r.responsibility) || (filter === 'notice' && (r.notice === 'due' || r.notice === 'lost' || r.notice === 'late')) || (filter === 'claimable' && (r.responsibility === 'employer' || r.responsibility === 'third_party' || r.responsibility === 'force_majeure')))
  if (!d.count) return <Empty>در گزارش‌های روزانه هنوز توقفی ثبت نشده است. توقف‌ها در بخش «توقف‌ها، مشکلات اجرایی و HSE» گزارش روزانه ثبت می‌شوند.</Empty>
  const excel = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.rows.map((r) => ({ 'تاریخ': r.date, 'گزارش': r.report.reportNo, 'جبهه': r.report.front, 'عامل': STOPPAGE_CATEGORY_FA[r.category], 'ساعت': r.hours, 'شرح': r.stoppage.description, 'مسئولیت': RESPONSIBILITY_FA[r.responsibility], 'روی مسیر بحرانی': r.critical ? 'بله' : '', 'تاریخ اخطار': r.noticeDate ?? '', 'شمارهٔ نامه': r.stoppage.noticeRef, 'وضعیت اخطار': NOTICE_CHIP[r.notice].label, 'نظر ارزیاب': r.stoppage.assessNote, 'تأخیر همزمان': d.concurrentDates.includes(r.date) && r.critical ? 'بله' : '' }))), 'دفتر تأخیرات')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.windows.map((w) => ({ 'ماه': w.month, 'کل ساعت': w.total, 'قابل ادعا': w.excusable, 'قابل ادعا روی مسیر بحرانی': w.criticalExcusable, 'ناشی از پیمانکار': w.contractor, 'ارزیابی‌نشده': w.unassessed }))), 'پنجره‌های ماهانه')
    XLSX.writeFile(wb, 'دفتر-تأخیرات-و-کلیم.xlsx')
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="کل ساعت توقف" value={fa(d.hours, 1)} sub={`${fa(d.count)} رویداد · ${fa(d.weatherDays)} روز آب‌وهوای نامساعد`} />
        <KpiCard i={1} label="پشتوانهٔ ادعای تمدید زمان" value={`${fa(d.claimableHours, 1)} ساعت`} tone={d.claimableHours ? 'good' : 'neutral'} sub={`${fa(d.criticalHours, 1)} ساعت روی مسیر بحرانی`} />
        <KpiCard i={4} label="برآورد تمدید زمان (روز)" value={fa(d.eot.days, 1)} tone={d.eot.days ? 'good' : 'neutral'} sub={`${fa(d.eot.compensableDays, 1)} روز با هزینه (کارفرما) · هر روز ${fa(d.eot.hoursPerDay)} ساعت`} />
        <KpiCard i={5} label="تأخیر همزمان" value={fa(d.concurrentDates.length)} tone={d.concurrentDates.length ? 'warn' : 'good'} sub="روزهای دارای توقف بحرانی هم از پیمانکار و هم قابل ادعا" />
        <KpiCard i={2} label="ارزیابی‌نشده" value={fa(d.unassessed)} tone={d.unassessed ? 'warn' : 'good'} sub="مسئولیت تأخیر تعیین نشده" onClick={() => setFilter('unassessed')} />
        <KpiCard i={3} label="اخطار کتبی از دست‌رفته یا با تأخیر" value={fa(d.noticeLost)} tone={d.noticeLost ? 'bad' : d.noticeDue ? 'warn' : 'good'} sub={`${fa(d.noticeDue)} مورد در انتظار اخطار · مهلت قرارداد ${fa(m.settings.delayNoticeDays ?? 14)} روز`} onClick={() => setFilter('notice')} />
      </div>
      <Section title="ساعت توقف به‌تفکیک عامل و مسئولیت" hint="ردیف‌های «ارزیابی نشده» را دستگاه نظارت، مشاور، کارفرما یا تحلیلگر تأخیرات تعیین می‌کند" flush>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
          <table className="ex-lines"><thead><tr><th>عامل</th><th className="num">جمع</th>{(['', ...RESPONSIBILITIES] as Responsibility[]).map((k) => <th key={k || 'x'} className="num">{RESPONSIBILITY_FA[k]}</th>)}</tr></thead>
            <tbody>{d.byCategory.map((c) => <tr key={c.category}><td>{STOPPAGE_CATEGORY_FA[c.category]}</td><td className="num"><b>{fa(c.total, 1)}</b></td>{(['', ...RESPONSIBILITIES] as Responsibility[]).map((k) => <td key={k || 'x'} className="num">{c.byResp[k] ? fa(c.byResp[k], 1) : '·'}</td>)}</tr>)}</tbody></table>
        </div>
      </Section>
      {d.windows.length > 0 && (
        <Section title="پنجره‌های ماهانهٔ تأخیر" hint="ساعت توقف هر ماه به‌تفکیک مسئولیت — مبنای تحلیل پنجره‌ای و پیگیری ماهانهٔ ادعا" flush>
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
            <table className="ex-lines"><thead><tr><th>ماه</th><th className="num">کل ساعت</th><th className="num">قابل ادعا</th><th className="num">قابل ادعا روی مسیر بحرانی</th><th className="num">ناشی از پیمانکار</th><th className="num">ارزیابی‌نشده</th></tr></thead>
              <tbody>{d.windows.map((w) => <tr key={w.key}><td>{w.month}</td><td className="num"><b>{fa(w.total, 1)}</b></td><td className="num">{fa(w.excusable, 1)}</td><td className="num">{fa(w.criticalExcusable, 1)}</td><td className="num">{fa(w.contractor, 1)}</td><td className="num" style={w.unassessed ? { color: 'var(--im-amber)' } : undefined}>{fa(w.unassessed, 1)}</td></tr>)}</tbody></table>
          </div>
        </Section>
      )}
      <Section title="دفتر تأخیرات" action={<span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="فیلتر"><option value="all">همهٔ رویدادها</option><option value="unassessed">ارزیابی‌نشده</option><option value="notice">نیازمند اخطار</option><option value="claimable">قابل ادعا (کارفرما، ثالث، فورس‌ماژور)</option></select>
        <button className="im-btn im-btn-sm" onClick={() => void excel()}><Download size={13} /> اکسل</button></span>} flush>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
          <table className="ex-lines"><thead><tr><th>تاریخ</th><th>گزارش / جبهه</th><th>عامل و شرح</th><th className="num">ساعت</th><th>مسئولیت</th><th>اخطار کتبی</th><th /></tr></thead>
            <tbody>{shown.length === 0 ? <tr><td colSpan={7} className="fn-empty">موردی نیست.</td></tr> : shown.map((r) => (
              <DelayLine key={r.id} r={r} concurrent={d.concurrentDates.includes(r.date)} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} canAssess={canAssess} canNotice={canNotice} />
            ))}</tbody></table>
        </div>
      </Section>
      <p className="im-helper" style={{ margin: 0 }}>اخطار کتبی باید ظرف {fa(m.settings.delayNoticeDays ?? 14)} روز از رویداد (طبق قرارداد؛ قابل تغییر در تنظیمات ← قواعد) ارسال شود؛ پس از آن حق ادعای زمان ممکن است ساقط شود. ثبت مسئولیت و اخطار پس از تأیید گزارش هم ممکن است و در سابقهٔ گزارش می‌ماند.</p>
    </div>
  )
}

function DelayLine({ r, concurrent, open, onToggle, canAssess, canNotice }: { r: DelayRow; concurrent: boolean; open: boolean; onToggle: () => void; canAssess: boolean; canNotice: boolean }) {
  const ex = useExecutionStore()
  const [resp, setResp] = useState<Exclude<Responsibility, ''>>((r.responsibility || 'employer') as Exclude<Responsibility, ''>)
  const [crit, setCrit] = useState(r.critical)
  const [note, setNote] = useState(r.stoppage.assessNote)
  const [nd, setNd] = useState(r.noticeDate ?? '')
  const [ref, setRef] = useState(r.stoppage.noticeRef)
  const [busy, setBusy] = useState(false)
  const nc = NOTICE_CHIP[r.notice]
  return (
    <>
      <tr>
        <td>{fmtD(r.date)}</td>
        <td><span className="fn-code strong">{r.report.reportNo}</span><span className="sub" style={{ display: 'block' }}>{r.report.front || '—'}</span></td>
        <td><b>{STOPPAGE_CATEGORY_FA[r.category]}</b><span className="sub" style={{ display: 'block' }}>{r.stoppage.description}</span></td>
        <td className="num">{fa(r.hours, 1)}</td>
        <td><Chip tone={RESP_TONE[r.responsibility]}>{RESPONSIBILITY_FA[r.responsibility]}</Chip>{r.critical && <Chip tone="bad">مسیر بحرانی</Chip>}{concurrent && r.critical && <Chip tone="warn">همزمان</Chip>}{r.stoppage.assessNote && <span className="sub" style={{ display: 'block' }}>{r.stoppage.assessNote}</span>}</td>
        <td><Chip tone={nc.tone}>{nc.label}</Chip>{r.noticeDate ? <span className="sub" style={{ display: 'block' }}>{fmtD(r.noticeDate)}{r.stoppage.noticeRef ? ` · ${r.stoppage.noticeRef}` : ''}</span> : r.noticeDaysLeft != null && <span className="sub" style={{ display: 'block' }}>{r.noticeDaysLeft >= 0 ? `${fa(r.noticeDaysLeft)} روز تا پایان مهلت` : `${fa(-r.noticeDaysLeft)} روز از مهلت گذشته`}</span>}</td>
        <td>{(canAssess || canNotice) && <button className="im-btn im-btn-sm" onClick={onToggle}>{open ? 'بستن' : 'ثبت'}</button>}</td>
      </tr>
      {open && (
        <tr><td colSpan={7}>
          <div className="ex-sheet-grid" style={{ padding: 8 }}>
            {canAssess && <>
              <label>مسئولیت تأخیر<select value={resp} onChange={(e) => setResp(e.target.value as typeof resp)}>{RESPONSIBILITIES.map((k) => <option key={k} value={k}>{RESPONSIBILITY_FA[k]}</option>)}</select></label>
              <label>روی مسیر بحرانی<select value={crit ? '1' : '0'} onChange={(e) => setCrit(e.target.value === '1')}><option value="0">خیر</option><option value="1">بله</option></select></label>
              <label className="wide">نظر ارزیاب<input value={note} onChange={(e) => setNote(e.target.value)} dir="auto" /></label>
              <span><button className="im-btn im-btn-primary im-btn-sm" disabled={busy} onClick={async () => { setBusy(true); await ex.assessStoppage(r.id, resp, crit, note); setBusy(false) }}>ثبت ارزیابی</button></span>
            </>}
            {canNotice && <>
              <label>تاریخ اخطار<JalaliDateInput value={nd} onChange={setNd} /></label>
              <label>شمارهٔ نامه<input value={ref} onChange={(e) => setRef(e.target.value)} dir="auto" /></label>
              <span><button className="im-btn im-btn-sm" disabled={busy || !nd} onClick={async () => { setBusy(true); await ex.noticeStoppage(r.id, nd, ref); setBusy(false) }}>ثبت اخطار</button></span>
            </>}
          </div>
        </td></tr>
      )}
    </>
  )
}
