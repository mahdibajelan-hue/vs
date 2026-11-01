import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { BarChart3, ClipboardList, FileSpreadsheet, Hourglass, MessageSquareWarning, PenLine, Printer } from 'lucide-react'
import type { EpcModel } from '../../execution/lib/useEpcModel'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { canonDiscipline } from '../lib/disciplines'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { creditAt } from '../../execution/lib/engine/engineering'
import { jalaliText } from '../../execution/lib/periods'
import { PURPOSE_FA, RESULT_FA, type EngDocRow, type EngPurpose } from '../../execution/epcTypes'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { fa } from '../../execution/components/common'
import { DOC_STATE_COLOR, DOC_STATE_FA, commentsOverdue, consultantOverdue, engStats, notProduced, statusRegister, type WaitRow } from '../lib/engReports'
import { printReport, xlsxDownload, type SheetRow } from '../lib/reportOutput'

type Kind = 'register' | 'consultant' | 'todo' | 'comments' | 'stats'
const KINDS: { id: Kind; label: string; icon: typeof Printer; color: string }[] = [
  { id: 'register', label: 'وضعیت مدارک (مبنای صورت‌وضعیت)', icon: ClipboardList, color: '#6366f1' },
  { id: 'consultant', label: 'معوق نزد مشاور', icon: Hourglass, color: '#0ea5e9' },
  { id: 'todo', label: 'تهیه‌نشده نزد پیمانکار', icon: PenLine, color: '#f97316' },
  { id: 'comments', label: 'رفع کامنت معوق', icon: MessageSquareWarning, color: '#f59e0b' },
  { id: 'stats', label: 'گزارش آماری', icon: BarChart3, color: '#22c55e' },
]
const d = (x: string | null | undefined) => (x ? jalaliText(x) : '—')
const p1 = (v: number | null | undefined) => (v == null ? '—' : `${fa(v * 100, 1)}٪`)
const w3 = (v: number) => fa(v, 3)
const rial = (v: number | null | undefined) => (v == null ? '—' : fa(Math.round(v)))
const purposeShort = (x: string) => (x ? x : '—')

const CSS = `.er{display:grid;gap:12px}.er-kinds{display:flex;gap:8px;flex-wrap:wrap}
.er-kind{display:inline-flex;align-items:center;gap:7px;padding:8px 13px;border-radius:12px;border:1px solid var(--im-line,rgba(148,163,184,.25));background:var(--im-panel,transparent);font-size:12.5px;font-weight:700;color:inherit;cursor:pointer;transition:transform .14s ease-out,border-color .14s,background .14s}
.er-kind:active{transform:scale(.97)}.er-kind[aria-pressed=true]{border-color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--c)}
.er-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;padding:12px 14px}
.er-bar label{display:grid;gap:4px;font-size:11.5px;color:var(--im-muted,#94a3b8)}.er-bar input[type=number]{width:80px}
.er-doc{padding:16px;overflow:auto}.er-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.er-head h2{margin:0;font-size:16px;font-weight:900}.er-head p{margin:2px 0 0;font-size:12px;color:var(--im-muted,#94a3b8)}
.er-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px}
.er-sum>div{border:1px solid var(--im-line,rgba(148,163,184,.25));border-radius:12px;padding:9px 12px;display:grid;gap:2px}
.er-sum small{font-size:11px;color:var(--im-muted,#94a3b8)}.er-sum b{font-size:16px;font-variant-numeric:tabular-nums}
table.er-t{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}
.er-t th{position:sticky;top:0;background:var(--im-panel-2,#1e293b);text-align:right;font-weight:800;font-size:11px;padding:7px 8px;border-bottom:1px solid var(--im-line,rgba(148,163,184,.3));white-space:nowrap}
.er-t td{padding:6px 8px;border-bottom:1px solid var(--im-line,rgba(148,163,184,.14));vertical-align:top}
.er-t td.n{text-align:left;white-space:nowrap;direction:ltr}.er-t td.c{white-space:nowrap}.er-t .code{font-family:'JetBrains Mono',monospace;font-size:11px;direction:ltr;text-align:left;white-space:nowrap}
.er-t tr.g td{background:color-mix(in srgb,var(--im-accent,#6366f1) 10%,transparent);font-weight:800}
.er-t tr.s td{font-weight:800;border-bottom:2px solid var(--im-line,rgba(148,163,184,.35))}
.er-t tfoot td{font-weight:900;background:color-mix(in srgb,var(--im-accent,#6366f1) 16%,transparent);border-top:2px solid var(--im-accent,#6366f1)}
.er-dot{display:inline-block;width:8px;height:8px;border-radius:99px;margin-inline-end:5px;vertical-align:1px}
.er-empty{padding:28px;text-align:center;color:var(--im-muted,#94a3b8)}
.er-sign{display:none}
.er-bars{display:grid;gap:7px}.er-bars>div{display:grid;grid-template-columns:minmax(150px,220px) 1fr 160px;gap:10px;align-items:center;font-size:12px}
.er-bars i{display:block;height:9px;border-radius:9px;background:var(--c)}.er-bars span.n{text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap}
.er-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:12px}
.er-two h3{font-size:13px;margin:0 0 8px;font-weight:900}`

/** گزارش‌های مهندسی — printable, Excel-exportable reports over the document register and its issue / review cycles. */
export function EngReports({ m, projectId }: { m: EpcModel; projectId: string }) {
  const ex = useExecutionStore()
  const settings = ex.settings(projectId)
  const can = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  const [kind, setKind] = useState<Kind>('register')
  const [asOf, setAsOf] = useState(m.today)
  const [from, setFrom] = useState<string>('')
  const [withOld, setWithOld] = useState(false)
  const [disc, setDisc] = useState('')
  const [lateOnly, setLateOnly] = useState(false)
  const [limitC, setLimitC] = useState<number>(settings.engConsultantDays ?? 15)
  const [limitK, setLimitK] = useState<number>(settings.engCommentDays ?? 15)
  const ref = useRef<HTMLDivElement>(null)

  const all = useEpcStore((s) => s.engDocs)
  const rows = useMemo(() => all.filter((x) => x.projectId === projectId), [all, projectId])
  const discOf = (x: EngDocRow) => canonDiscipline(x.discipline, x.docNo) || 'بدون رشته'
  const discs = useMemo(() => [...new Set(rows.map(discOf))].sort((a, b) => a.localeCompare(b)), [rows])
  const shown = useMemo(() => (disc ? rows.filter((r) => discOf(r) === disc) : rows), [rows, disc])
  const credit = (x: EngDocRow, t: string) => { const e = m.docById.get(x.id); return e ? creditAt(e, t, m.rules.credits) : 0 }
  const total = (settings.engAmount ?? 0) > 0 ? (settings.engAmount as number) : rows.reduce((a, x) => a + x.price, 0)
  // amounts are shares of the whole project's live weight, also when a discipline is filtered
  const allW = rows.filter((x) => x.status !== 'superseded').reduce((a, x) => a + x.weight, 0)
  const shownW = shown.filter((x) => x.status !== 'superseded').reduce((a, x) => a + x.weight, 0)
  const shownTotal = allW > 0 ? (total * shownW) / allW : 0

  const saveLimit = (k: 'engConsultantDays' | 'engCommentDays', v: number) => { if (can && Number.isFinite(v) && v >= 0) void ex.saveSettings(projectId, { [k]: Math.round(v) }) }
  const title = KINDS.find((k) => k.id === kind)?.label ?? ''
  const meta = `${project?.officialName ?? ''} · تاریخ گزارش ${d(asOf)}${disc ? ` · رشته: ${disc}` : ''}`

  // ── build the active report once: the screen, the printout and the Excel file share it
  const out = useMemo((): { body: ReactNode; sheet: SheetRow[]; sheetName: string } => {
    if (kind === 'register') {
      const reg = statusRegister(shown, { asOf, credit, total: shownTotal, from: from || null, includeSuperseded: withOld })
      const per = !!from
      const sheet: SheetRow[] = []
      reg.groups.forEach((g) => g.rows.forEach((r, i) => sheet.push({ 'رشته': g.name, 'ردیف': i + 1, 'شماره مدرک': r.docNo, 'عنوان': r.title, 'وزن (٪)': +r.weight.toFixed(4), 'مبلغ (ریال)': r.amount == null ? '' : Math.round(r.amount), 'آخرین ویرایش': r.rev, 'هدف صدور': r.purpose, 'تاریخ صدور': r.issuedOn ? jalaliText(r.issuedOn) : '', 'وضعیت': DOC_STATE_FA[r.state], ...(per ? { 'پیشرفت قبلی (٪)': +((r.prev ?? 0) * 100).toFixed(1) } : {}), 'پیشرفت (٪)': +(r.now * 100).toFixed(1), 'وزن کسب‌شده (٪)': +r.earnedWeight.toFixed(4), 'مبلغ کسب‌شده (ریال)': r.earnedAmount == null ? '' : Math.round(r.earnedAmount), ...(per ? { 'مبلغ این دوره (ریال)': r.periodAmount == null ? '' : Math.round(r.periodAmount) } : {}) })))
      sheet.push({ 'رشته': 'جمع کل', 'ردیف': reg.sum.n, 'وزن (٪)': +reg.sum.weight.toFixed(4), 'مبلغ (ریال)': reg.sum.amount == null ? '' : Math.round(reg.sum.amount), ...(per ? { 'پیشرفت قبلی (٪)': +((reg.sum.prevProgress ?? 0) * 100).toFixed(2) } : {}), 'پیشرفت (٪)': +(reg.sum.progress * 100).toFixed(2), 'وزن کسب‌شده (٪)': +reg.sum.earnedWeight.toFixed(4), 'مبلغ کسب‌شده (ریال)': reg.sum.earnedAmount == null ? '' : Math.round(reg.sum.earnedAmount), ...(per ? { 'مبلغ این دوره (ریال)': reg.sum.periodAmount == null ? '' : Math.round(reg.sum.periodAmount) } : {}) })
      const cols = 11 + (per ? 2 : 0)
      const sumCells = (s: typeof reg.sum) => <>
        <td className="n">{w3(s.weight)}</td><td className="n">{rial(s.amount)}</td><td colSpan={4} />
        {per && <td className="n">{p1(s.prevProgress)}</td>}<td className="n">{p1(s.progress)}</td><td className="n">{w3(s.earnedWeight)}</td><td className="n">{rial(s.earnedAmount)}</td>{per && <td className="n">{rial(s.periodAmount)}</td>}
      </>
      const body = reg.sum.n === 0 ? <div className="er-empty">مدرکی برای این گزارش وجود ندارد.</div> : <>
        <div className="er-sum">
          <div><small>تعداد مدارک</small><b>{fa(reg.sum.n)}</b></div>
          <div><small>جمع وزن</small><b>{w3(reg.sum.weight)}٪</b></div>
          <div><small>جمع مبلغ (ریال)</small><b>{rial(reg.sum.amount)}</b></div>
          <div><small>پیشرفت وزنی</small><b>{p1(reg.sum.progress)}</b></div>
          <div><small>مبلغ کسب‌شده (ریال)</small><b>{rial(reg.sum.earnedAmount)}</b></div>
          {per && <div><small>مبلغ این دوره (ریال)</small><b>{rial(reg.sum.periodAmount)}</b></div>}
        </div>
        <table className="er-t">
          <thead><tr><th>ردیف</th><th>شماره مدرک</th><th>عنوان مدرک</th><th>وزن (٪)</th><th>مبلغ (ریال)</th><th>آخرین ویرایش</th><th>هدف</th><th>تاریخ صدور</th><th>وضعیت</th>{per && <th>پیشرفت قبلی</th>}<th>پیشرفت</th><th>وزن کسب‌شده</th><th>مبلغ کسب‌شده</th>{per && <th>مبلغ این دوره</th>}</tr></thead>
          <tbody>
            {reg.groups.map((g) => <Fragment key={g.name}>
              <tr className="g"><td colSpan={cols}>{g.name} — {fa(g.sum.n)} مدرک</td></tr>
              {g.rows.map((r, i) => <tr key={r.id}>
                <td className="c">{fa(i + 1)}</td><td className="code">{r.docNo}</td><td>{r.title}</td><td className="n">{w3(r.weight)}</td><td className="n">{rial(r.amount)}</td>
                <td className="c">{r.rev ? `Rev ${r.rev}` : '—'}</td><td className="c">{purposeShort(r.purpose)}</td><td className="c">{d(r.issuedOn)}</td>
                <td className="c"><span className="er-dot" style={{ background: DOC_STATE_COLOR[r.state] }} />{DOC_STATE_FA[r.state]}</td>
                {per && <td className="n">{p1(r.prev)}</td>}<td className="n">{p1(r.now)}</td><td className="n">{w3(r.earnedWeight)}</td><td className="n">{rial(r.earnedAmount)}</td>{per && <td className="n">{rial(r.periodAmount)}</td>}
              </tr>)}
              <tr className="s"><td colSpan={3}>جمع {g.name}</td>{sumCells(g.sum)}</tr>
            </Fragment>)}
          </tbody>
          <tfoot><tr><td colSpan={3}>جمع کل ({fa(reg.sum.n)} مدرک)</td>{sumCells(reg.sum)}</tr></tfoot>
        </table>
        <div className="er-sign"><div>پیمانکار</div><div>مشاور</div><div>کارفرما</div></div>
      </>
      return { body, sheet, sheetName: 'وضعیت مدارک' }
    }
    if (kind === 'consultant' || kind === 'comments') {
      const list: WaitRow[] = kind === 'consultant' ? consultantOverdue(shown, asOf, limitC) : commentsOverdue(shown, asOf, limitK)
      const since = kind === 'consultant' ? 'تاریخ ارسال' : 'تاریخ پاسخ مشاور'
      const sheet: SheetRow[] = list.map((r, i) => ({ 'ردیف': i + 1, 'شماره مدرک': r.docNo, 'عنوان': r.title, 'رشته': r.discipline, 'وزن (٪)': +r.weight.toFixed(4), 'ویرایش': r.rev, 'هدف صدور': r.purpose, ...(r.result ? { 'نتیجهٔ بررسی': RESULT_FA[r.result] } : {}), [since]: jalaliText(r.since), 'روزهای انتظار': r.days, 'روز بیش از مهلت': r.over }))
      const body = !list.length ? <div className="er-empty">{kind === 'consultant' ? `هیچ مدرکی بیش از ${fa(limitC)} روز نزد مشاور نمانده است.` : `هیچ مدرکی بیش از ${fa(limitK)} روز منتظر رفع کامنت نمانده است.`}</div> : <>
        <div className="er-sum">
          <div><small>تعداد مدارک</small><b>{fa(list.length)}</b></div>
          <div><small>جمع وزن</small><b>{w3(list.reduce((a, r) => a + r.weight, 0))}٪</b></div>
          <div><small>بیشترین انتظار</small><b>{fa(list[0].days)} روز</b></div>
          <div><small>میانگین انتظار</small><b>{fa(Math.round(list.reduce((a, r) => a + r.days, 0) / list.length))} روز</b></div>
        </div>
        <table className="er-t">
          <thead><tr><th>ردیف</th><th>شماره مدرک</th><th>عنوان مدرک</th><th>رشته</th><th>وزن (٪)</th><th>ویرایش</th><th>هدف</th>{kind === 'comments' && <th>نتیجهٔ بررسی</th>}<th>{since}</th><th>روزهای انتظار</th><th>بیش از مهلت</th></tr></thead>
          <tbody>{list.map((r, i) => <tr key={r.id}>
            <td className="c">{fa(i + 1)}</td><td className="code">{r.docNo}</td><td>{r.title}</td><td className="c">{r.discipline}</td><td className="n">{w3(r.weight)}</td><td className="c">Rev {r.rev}</td><td className="c" title={PURPOSE_FA[r.purpose as EngPurpose]}>{r.purpose}</td>
            {kind === 'comments' && <td className="c">{r.result ? RESULT_FA[r.result] : ''}</td>}<td className="c">{d(r.since)}</td><td className="n"><b>{fa(r.days)}</b></td><td className="n" style={{ color: '#ef4444' }}>{fa(r.over)} روز</td>
          </tr>)}</tbody>
        </table>
      </>
      return { body, sheet, sheetName: kind === 'consultant' ? 'معوق نزد مشاور' : 'رفع کامنت معوق' }
    }
    if (kind === 'todo') {
      const all = notProduced(shown, asOf)
      const list = lateOnly ? all.filter((r) => (r.late ?? 0) > 0) : all
      const sheet: SheetRow[] = list.map((r, i) => ({ 'ردیف': i + 1, 'شماره مدرک': r.docNo, 'عنوان': r.title, 'رشته': r.discipline, 'وزن (٪)': +r.weight.toFixed(4), 'وضعیت': DOC_STATE_FA[r.state], 'تاریخ برنامه‌ای ارسال': r.plannedOn ? jalaliText(r.plannedOn) : '', 'تأخیر (روز)': r.late != null && r.late > 0 ? r.late : '', 'بحرانی': r.critical ? 'بله' : '' }))
      const late = list.filter((r) => (r.late ?? 0) > 0)
      const body = !list.length ? <div className="er-empty">همهٔ مدارک دست‌کم یک بار برای مشاور ارسال شده‌اند.</div> : <>
        <div className="er-sum">
          <div><small>تهیه‌نشده</small><b>{fa(list.length)}</b></div>
          <div><small>جمع وزن</small><b>{w3(list.reduce((a, r) => a + r.weight, 0))}٪</b></div>
          <div><small>از موعد گذشته</small><b style={{ color: late.length ? '#ef4444' : undefined }}>{fa(late.length)}</b></div>
          <div><small>بحرانی</small><b>{fa(list.filter((r) => r.critical).length)}</b></div>
        </div>
        <table className="er-t">
          <thead><tr><th>ردیف</th><th>شماره مدرک</th><th>عنوان مدرک</th><th>رشته</th><th>وزن (٪)</th><th>وضعیت</th><th>تاریخ برنامه‌ای ارسال</th><th>تأخیر</th></tr></thead>
          <tbody>{list.map((r, i) => <tr key={r.id}>
            <td className="c">{fa(i + 1)}</td><td className="code">{r.docNo}</td><td>{r.title}{r.critical && <b style={{ color: '#ef4444', marginInlineStart: 6, fontSize: 10.5 }}>بحرانی</b>}</td><td className="c">{r.discipline}</td><td className="n">{w3(r.weight)}</td>
            <td className="c"><span className="er-dot" style={{ background: DOC_STATE_COLOR[r.state] }} />{DOC_STATE_FA[r.state]}</td><td className="c">{d(r.plannedOn)}</td>
            <td className="n" style={{ color: (r.late ?? 0) > 0 ? '#ef4444' : undefined }}>{r.late == null ? 'بدون تاریخ برنامه' : r.late > 0 ? `${fa(r.late)} روز` : `${fa(-r.late)} روز مانده`}</td>
          </tr>)}</tbody>
        </table>
      </>
      return { body, sheet, sheetName: 'تهیه‌نشده' }
    }
    // statistics
    const s = engStats(shown, { asOf, credit, total: 0 })
    const maxN = Math.max(1, ...s.byState.map((x) => x.n))
    const answered = Object.entries(s.byResult).filter(([k]) => k !== 'pending')
    const sheet: SheetRow[] = [
      ...s.byState.map((x) => ({ 'شاخص': DOC_STATE_FA[x.state], 'تعداد': x.n, 'وزن (٪)': +x.weight.toFixed(4) })),
      { 'شاخص': 'کل مدارک', 'تعداد': s.total, 'وزن (٪)': +s.weight.toFixed(4) },
      { 'شاخص': 'تعداد ارسال‌ها', 'تعداد': s.submissions },
      ...Object.entries(s.byPurpose).map(([k, v]) => ({ 'شاخص': `ارسال ${k}`, 'تعداد': v })),
      ...answered.map(([k, v]) => ({ 'شاخص': `پاسخ: ${RESULT_FA[k as keyof typeof RESULT_FA]}`, 'تعداد': v })),
      { 'شاخص': 'تأیید در نخستین ارسال (٪)', 'تعداد': s.firstTimeRate == null ? '' : +(s.firstTimeRate * 100).toFixed(1) },
      { 'شاخص': 'میانگین تعداد ارسال تا تأیید', 'تعداد': s.avgSubmissionsToApproval == null ? '' : +s.avgSubmissionsToApproval.toFixed(2) },
      { 'شاخص': 'میانهٔ زمان بررسی مشاور (روز)', 'تعداد': s.consultantDays ?? '' },
      { 'شاخص': 'میانهٔ زمان ارسال دوباره پیمانکار (روز)', 'تعداد': s.contractorDays ?? '' },
      ...s.byDiscipline.map((x) => ({ 'شاخص': `رشته ${x.name}`, 'تعداد': x.n, 'وزن (٪)': +x.weight.toFixed(4), 'پیشرفت (٪)': +(x.progress * 100).toFixed(1), 'تأیید نهایی': x.approved, 'نزد مشاور': x.withConsultant, 'برگشتی': x.returned, 'تهیه‌نشده': x.notStarted })),
    ]
    const body = <>
      <div className="er-sum">
        <div><small>کل مدارک</small><b>{fa(s.total)}</b></div>
        <div><small>مدارک فعال / منسوخ</small><b>{fa(s.live)} / {fa(s.superseded)}</b></div>
        <div><small>پیشرفت وزنی</small><b>{p1(s.progress)}</b></div>
        <div><small>تعداد ارسال‌ها</small><b>{fa(s.submissions)}</b></div>
        <div><small>تأیید در نخستین ارسال</small><b>{p1(s.firstTimeRate)}</b></div>
        <div><small>میانگین ارسال تا تأیید</small><b>{s.avgSubmissionsToApproval == null ? '—' : fa(s.avgSubmissionsToApproval, 1)}</b></div>
        <div><small>میانهٔ بررسی مشاور</small><b>{s.consultantDays == null ? '—' : `${fa(s.consultantDays)} روز`}</b></div>
        <div><small>میانهٔ ارسال دوبارهٔ پیمانکار</small><b>{s.contractorDays == null ? '—' : `${fa(s.contractorDays)} روز`}</b></div>
      </div>
      <h3 style={{ fontSize: 13, margin: '4px 0 8px', fontWeight: 900 }}>مدارک به تفکیک وضعیت</h3>
      <div className="er-bars">{s.byState.map((x) => <div key={x.state} style={{ ['--c' as string]: DOC_STATE_COLOR[x.state] }}>
        <span><span className="er-dot" style={{ background: DOC_STATE_COLOR[x.state] }} />{DOC_STATE_FA[x.state]}</span>
        <span><i style={{ width: `${(x.n / maxN) * 100}%`, minWidth: x.n ? 4 : 0 }} /></span>
        <span className="n">{fa(x.n)} مدرک · {w3(x.weight)}٪</span>
      </div>)}</div>
      <div className="er-two">
        <div><h3>ارسال‌ها به تفکیک هدف صدور</h3><table className="er-t"><tbody>{Object.keys(s.byPurpose).length ? Object.entries(s.byPurpose).map(([k, v]) => <tr key={k}><td>{PURPOSE_FA[k as EngPurpose] ?? k}</td><td className="n">{fa(v)}</td></tr>) : <tr><td>ارسالی ثبت نشده است.</td></tr>}</tbody></table></div>
        <div><h3>پاسخ‌های مشاور</h3><table className="er-t"><tbody>{answered.length ? answered.map(([k, v]) => <tr key={k}><td>{RESULT_FA[k as keyof typeof RESULT_FA]}</td><td className="n">{fa(v)}</td></tr>) : <tr><td>پاسخی ثبت نشده است.</td></tr>}<tr><td>در انتظار پاسخ</td><td className="n">{fa(s.byResult.pending ?? 0)}</td></tr></tbody></table></div>
      </div>
      <h3 style={{ fontSize: 13, margin: '14px 0 8px', fontWeight: 900 }}>به تفکیک رشته</h3>
      <table className="er-t">
        <thead><tr><th>رشته</th><th>مدارک</th><th>وزن (٪)</th><th>پیشرفت</th><th>تأیید نهایی</th><th>نزد مشاور</th><th>برگشتی به پیمانکار</th><th>تهیه‌نشده</th></tr></thead>
        <tbody>{s.byDiscipline.map((x) => <tr key={x.name}><td>{x.name}</td><td className="n">{fa(x.n)}</td><td className="n">{w3(x.weight)}</td><td className="n">{p1(x.progress)}</td><td className="n">{fa(x.approved)}</td><td className="n">{fa(x.withConsultant)}</td><td className="n">{fa(x.returned)}</td><td className="n">{fa(x.notStarted)}</td></tr>)}</tbody>
        <tfoot><tr><td>جمع</td><td className="n">{fa(s.live)}</td><td className="n">{w3(s.weight)}</td><td className="n">{p1(s.progress)}</td><td className="n">{fa(s.byDiscipline.reduce((a, x) => a + x.approved, 0))}</td><td className="n">{fa(s.byDiscipline.reduce((a, x) => a + x.withConsultant, 0))}</td><td className="n">{fa(s.byDiscipline.reduce((a, x) => a + x.returned, 0))}</td><td className="n">{fa(s.byDiscipline.reduce((a, x) => a + x.notStarted, 0))}</td></tr></tfoot>
      </table>
    </>
    return { body, sheet, sheetName: 'آمار مدارک' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, shown, asOf, from, withOld, lateOnly, limitC, limitK, shownTotal, m.docById, m.rules])

  const fileBase = `${title.split(' (')[0]} - ${project?.officialName ?? ''} - ${jalaliText(asOf).replace(/\//g, '-')}`
  return (
    <div className="er"><style>{CSS}</style>
      <div className="er-kinds" role="group" aria-label="نوع گزارش">
        {KINDS.map((k) => <button key={k.id} className="er-kind" aria-pressed={kind === k.id} style={{ ['--c' as string]: k.color }} onClick={() => setKind(k.id)}><k.icon size={15} aria-hidden />{k.label}</button>)}
      </div>
      <div className="im-card er-bar">
        <label>تاریخ گزارش<JalaliDateInput value={asOf} onChange={(v) => setAsOf(v > m.today ? m.today : v)} /></label>
        {kind === 'register' && <label>شروع دوره (اختیاری)<span style={{ display: 'flex', gap: 4 }}><JalaliDateInput value={from} onChange={(v) => setFrom(v && v < asOf ? v : '')} />{from && <button className="im-btn im-btn-sm" onClick={() => setFrom('')}>حذف</button>}</span></label>}
        <label>رشته<select value={disc} onChange={(e) => setDisc(e.target.value)} aria-label="رشته"><option value="">همهٔ رشته‌ها</option>{discs.map((x) => <option key={x}>{x}</option>)}</select></label>
        {kind === 'register' && <label style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }}><input type="checkbox" checked={withOld} onChange={(e) => setWithOld(e.target.checked)} />نمایش مدارک منسوخ</label>}
        {kind === 'todo' && <label style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }}><input type="checkbox" checked={lateOnly} onChange={(e) => setLateOnly(e.target.checked)} />فقط مدارکِ از موعد گذشته</label>}
        {kind === 'consultant' && <label>مهلت بررسی مشاور (روز)<input type="number" min={0} value={limitC} onChange={(e) => setLimitC(Number(e.target.value))} onBlur={() => saveLimit('engConsultantDays', limitC)} /></label>}
        {kind === 'comments' && <label>مهلت رفع کامنت (روز)<input type="number" min={0} value={limitK} onChange={(e) => setLimitK(Number(e.target.value))} onBlur={() => saveLimit('engCommentDays', limitK)} /></label>}
        <span style={{ flex: 1 }} />
        <button className="im-btn im-btn-sm" onClick={() => xlsxDownload(out.sheet, out.sheetName, `${fileBase}.xlsx`)} disabled={!out.sheet.length}><FileSpreadsheet size={14} /> خروجی Excel</button>
        <button className="im-btn im-btn-primary im-btn-sm" onClick={() => ref.current && printReport(ref.current, title)}><Printer size={14} /> چاپ</button>
      </div>
      {(kind === 'register' && from) && <p className="im-helper" style={{ margin: '0 4px' }}>«مبلغ این دوره» برابر است با مبلغ هر مدرک × (پیشرفت در تاریخ گزارش − پیشرفت در شروع دوره). این ستون را می‌توان مستقیم در صورت‌وضعیت مهندسی به کار برد.</p>}
      {(kind === 'consultant' || kind === 'comments') && !can && <p className="im-helper" style={{ margin: '0 4px' }}>مهلت تغییر‌یافته فقط برای همین نمایش است؛ ذخیرهٔ آن برای پروژه با کسی است که اجازهٔ پیکربندی پروژه را دارد.</p>}
      <div className="im-card er-doc" ref={ref}>
        <div className="er-head"><div><h2>{title}</h2><p>{meta}</p></div><p style={{ alignSelf: 'end' }}>وزن مراحل: ارسال اول {fa(Math.round(m.rules.credits.first * 100))}٪ · ارسال‌های بعدی {fa(Math.round(m.rules.credits.later * 100))}٪ · تأیید با ملاحظات {fa(Math.round(m.rules.credits.noted * 100))}٪ · تأیید نهایی {fa(Math.round(m.rules.credits.approved * 100))}٪</p></div>
        {out.body}
      </div>
    </div>
  )
}
