import { useMemo, useState } from 'react'
import { Download, Printer, Search } from 'lucide-react'
import { useEpcModel } from '../lib/useEpcModel'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { EpcGate } from '../components/epc/EpcBanner'
import { cumulative } from '../lib/progress'
import { periodOf, periodsBetween, jalaliText } from '../lib/periods'
import { calcRow, executedGroups, ruleLabel, totals, type StRow } from '../lib/contractStatement'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { Empty, fa } from '../components/common'

const money = (n: number) => fa(Math.round(n))
const NumCell = ({ value, disabled, onCommit, placeholder }: { value: number | null; disabled: boolean; onCommit: (n: number | null) => void; placeholder?: string }) => (
  <input key={String(value)} type="number" step="any" min="0" disabled={disabled} defaultValue={value ?? ''} placeholder={placeholder} dir="ltr" style={{ width: 96 }} onBlur={(e) => { const t = e.target.value.trim(), n = t === '' ? null : Number(t); if (n !== value && (n === null || Number.isFinite(n))) onCommit(n) }} />
)

/** Contract statement: (1) link every contract row to the executed quantities it is made of — once; (2) each month the statement fills itself: system value (approved, from those links), contractor request, consultant opinion, previous statement → month = cumulative − previous; all money follows the consultant. */
export function ContractStatementPage({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const [tab, setTab] = useState<'statement' | 'link'>('statement')
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>{([['statement', 'صورت‌وضعیت ماهانه'], ['link', 'اتصال ردیف‌های پیمان به مقادیر اجرا']] as const).map(([k, l]) => <button key={k} className={`im-btn im-btn-sm${tab === k ? ' im-btn-primary' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'link' ? <LinkRows projectId={projectId} /> : <Monthly projectId={projectId} />}
    </div>
  )
}

function LinkRows({ projectId }: { projectId: string }) {
  const m = useEpcModel(projectId), epc = useEpcStore(), ex = useExecutionStore()
  const can = ex.can(projectId, '*') || ex.can(projectId, 'configure') || ex.can(projectId, 'edit_activities')
  const [q, setQ] = useState(''), [book, setBook] = useState(''), [unlinked, setUnlinked] = useState(false), [open, setOpen] = useState('')
  const [gq, setGq] = useState(''), [gg, setGg] = useState(''), [gAll, setGAll] = useState(false)
  const actions = epc.workActions.filter((a) => a.projectId === projectId)
  const rules = epc.actionRules.filter((r) => r.projectId === projectId)
  const rows = m.ex.activities.filter((a) => a.active && a.approval === 'approved')
  const cum = useMemo(() => cumulative(m.ex.reports, m.ex.lines, { mode: 'approved' }), [m.ex.reports, m.ex.lines])
  const month = periodOf('month', m.ex.today, m.ex.settings.weekStart)
  const dateOf = useMemo(() => { const d = new Map(m.ex.reports.map((r) => [r.id, r.reportDate])); return (id: string) => d.get(id) ?? '' }, [m.ex.reports])
  const raw = useMemo(() => [...m.ex.linesByReport.values()].flat(), [m.ex.linesByReport])
  const groups = useMemo(() => executedGroups(raw, actions, dateOf, month.from, month.to), [raw, actions, dateOf, month.from, month.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const books = [...new Set(rows.map((a) => a.bookId ?? ''))]
  const bookTitle = (id: string) => ex.books.find((b) => b.id === id)?.title ?? 'بدون فهرست‌بها'
  const list = rows.filter((a) => (!book || (a.bookId ?? '') === book) && (!unlinked || !rules.some((r) => r.activityId === a.id)) && (!q || `${a.title} ${a.itemNo} ${a.rowNo}`.toLowerCase().includes(q.toLowerCase())))
  const linkedCount = (g: { actionKey: string; fieldKey: string; value: string }) => rules.filter((r) => r.actionKey === g.actionKey && r.whenField === g.fieldKey && r.whenValue === g.value).length
  const gl = groups.filter((g) => (gAll || g.cum > 0) && (!gg || g.group === gg) && (!gq || `${g.actionTitle} ${g.fieldLabel} ${g.value}`.toLowerCase().includes(gq.toLowerCase())))
  return (
    <Section title="اتصال ردیف‌های پیمان به مقادیر اجرا" hint="هر ردیف فهرست‌بهای پیمان را یک‌بار به مقدارهای اجرایی تأییدشده وصل کنید (جست‌وجو و فیلتر در مقادیر اجرا)؛ از آن پس مقدار سیستمی هر ماه خودکار در جای خودش می‌نشیند.">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
        <span style={{ position: 'relative' }}><Search size={13} style={{ position: 'absolute', insetInlineStart: 8, top: 9, opacity: .5 }} /><input placeholder="جست‌وجوی ردیف پیمان (عنوان، کد، شماره ردیف)" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingInlineStart: 26, minWidth: 280 }} aria-label="جست‌وجو" /></span>
        {books.length > 1 && <select value={book} onChange={(e) => setBook(e.target.value)} aria-label="فهرست‌بها"><option value="">همهٔ فهرست‌ها</option>{books.map((b) => <option key={b} value={b}>{bookTitle(b)}</option>)}</select>}
        <label className="im-helper"><input type="checkbox" checked={unlinked} onChange={(e) => setUnlinked(e.target.checked)} /> فقط بدون اتصال</label>
        <span className="im-helper">{fa(list.length)} ردیف · {fa(rows.filter((a) => rules.some((r) => r.activityId === a.id)).length)} ردیف متصل</span>
      </div>
      <div className="fn-tbl-wrap" style={{ maxHeight: 620 }}><table className="ex-lines"><thead><tr><th>ردیف پیمان</th><th>واحد</th><th className="num">مقدار سیستمی تا امروز</th><th>اتصال‌ها (منبع مقدار)</th><th /></tr></thead><tbody>
        {list.slice(0, 300).map((a) => { const mine = rules.filter((r) => r.activityId === a.id); return (
          <tr key={a.id}><td style={{ minWidth: 260 }}><b>{a.title}</b><span className="sub fn-code">{a.rowNo ? `ردیف ${a.rowNo} · ` : ''}{a.itemNo}{a.parentActivityId ? ' · اضافه‌بها' : ''}</span></td><td>{a.unit}</td><td className="num">{fa(cum.get(a.id) ?? 0, 2)}</td>
            <td style={{ minWidth: 300 }}>{mine.length === 0 ? <span className="im-helper">{(cum.get(a.id) ?? 0) > 0 ? 'اجرای مستقیم با همین ردیف' : '—'}</span> : mine.map((r) => <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '2px 0' }}>
              <Chip tone="good">{ruleLabel(r, actions)}</Chip>
              {can ? <label className="im-helper">ضریب <input key={r.factor} type="number" step="any" min="0" defaultValue={r.factor} style={{ width: 64 }} onBlur={(e) => { const n = Number(e.target.value); if (n > 0 && n !== r.factor) void epc.updateRule(r.id, { factor: n }) }} /></label> : <span className="im-helper">× {fa(r.factor, 4)}</span>}
              {r.multFields && <span className="im-helper">× {r.multFields.split(',').map((k) => actions.find((x) => x.key === r.actionKey)?.fields.find((f) => f.key === k)?.label ?? k).join(' × ')}</span>}
              {can && <button className="im-btn im-btn-sm" aria-label="حذف اتصال" onClick={() => void epc.removeRule(r.id)}>×</button>}</div>)}</td>
            <td>{can && <button className="im-btn im-btn-sm" onClick={() => setOpen(open === a.id ? '' : a.id)}>{open === a.id ? 'بستن' : 'افزودن منبع'}</button>}</td></tr>) })}
        {list.length === 0 && <tr><td colSpan={5} className="sub">ردیفی با این فیلتر نیست.</td></tr>}
      </tbody></table></div>
      {open && (() => { const a = rows.find((x) => x.id === open); if (!a) return null; return (
        <div className="im-card" style={{ padding: 10, marginTop: 10, display: 'grid', gap: 8 }}>
          <b>منبع مقدار برای «{a.title}» ({a.unit})</b>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input placeholder="جست‌وجو در مقادیر اجرا (اقدام، فیلد، مقدار)" value={gq} onChange={(e) => setGq(e.target.value)} style={{ minWidth: 260 }} aria-label="جست‌وجوی مقادیر اجرا" />
            <select value={gg} onChange={(e) => setGg(e.target.value)} aria-label="گروه اقدام"><option value="">همهٔ گروه‌ها</option>{[...new Set(groups.map((g) => g.group))].map((g) => <option key={g} value={g}>{g || 'سایر'}</option>)}</select>
            <label className="im-helper"><input type="checkbox" checked={gAll} onChange={(e) => setGAll(e.target.checked)} /> شامل اقدام‌های بدون مقدار تأییدشده</label>
          </div>
          <div className="fn-tbl-wrap" style={{ maxHeight: 300 }}><table className="ex-lines"><thead><tr><th>اقدام</th><th>تفکیک</th><th>واحد</th><th className="num">تجمعی تأییدشده</th><th className="num">ماه جاری</th><th>قبلاً به</th><th /></tr></thead><tbody>
            {gl.map((g) => <tr key={g.id}><td><b>{g.actionTitle}</b><span className="sub">{g.group}</span></td><td>{g.fieldKey ? `${g.fieldLabel}: ${g.value}` : 'کل اقدام'}</td><td>{g.unit}</td><td className="num">{fa(g.cum, 2)}</td><td className="num">{fa(g.month, 2)}</td><td className="num">{linkedCount(g) ? `${fa(linkedCount(g))} ردیف` : '—'}</td>
              <td><button className="im-btn im-btn-primary im-btn-sm" disabled={rules.some((r) => r.activityId === a.id && r.actionKey === g.actionKey && r.whenField === g.fieldKey && r.whenValue === g.value)} onClick={() => void epc.saveRule(projectId, { actionKey: g.actionKey, activityId: a.id, factor: 1, whenField: g.fieldKey, whenValue: g.value })}>اتصال</button></td></tr>)}
            {gl.length === 0 && <tr><td colSpan={7} className="sub">مقدار اجرایی تأییدشده‌ای با این فیلتر نیست. (ثبت «بر اساس اقدام» باید روشن باشد.)</td></tr>}
          </tbody></table></div>
          <span className="im-helper">پس از اتصال، ضریب تبدیل واحد (و ضرب در عرض/عمق در «تنظیمات ← اقدام‌ها») را در همین جدول ببینید و اصلاح کنید.</span>
        </div>) })()}
    </Section>
  )
}

function Monthly({ projectId }: { projectId: string }) {
  const m = useEpcModel(projectId), epc = useEpcStore(), ex = useExecutionStore()
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const roles = ex.myRoles(projectId), cfg = ex.can(projectId, '*') || ex.can(projectId, 'configure')
  const canReq = roles.includes('contractor') || cfg, canCon = roles.includes('consultant') || roles.includes('supervision') || cfg, canMake = canReq || canCon || roles.includes('planner')
  const dates = m.ex.reports.filter((r) => r.formKey === 'work').map((r) => r.reportDate).sort()
  const first = m.ex.settings.projectStart || dates[0] || m.ex.today
  const periods = useMemo(() => periodsBetween('month', first, m.ex.today, m.ex.settings.weekStart), [first, m.ex.today, m.ex.settings.weekStart])
  const [idx, setIdx] = useState<number | null>(null), [q, setQ] = useState(''), [onlyVal, setOnlyVal] = useState(true), [busy, setBusy] = useState(false)
  const pi = Math.min(idx ?? periods.length - 1, periods.length - 1), period = periods[pi]
  const sts = epc.statements.filter((s) => s.projectId === projectId)
  const st = period ? sts.find((s) => s.periodFrom === period.from) : undefined
  const draft = sts.find((s) => s.status === 'draft')
  const acts = m.ex.activities.filter((a) => a.active && a.approval === 'approved').sort((a, b) => a.sort - b.sort)
  const bookTitle = (id: string | null) => ex.books.find((b) => b.id === id)?.title ?? 'بدون فهرست‌بها'
  // system values: supervision-approved quantities up to the period end, with the action links already applied
  const payload = () => { const cum = cumulative(m.ex.reports, m.ex.lines, { until: period.to, mode: 'approved' }); return acts.map((a) => ({ activity_id: a.id, sys: cum.get(a.id) ?? 0, unit_price: a.unitPrice, base_qty: m.ex.baseOf(a, period.to) })) }
  const lines = useMemo(() => (st ? epc.statementLines.filter((l) => l.statementId === st.id) : []), [epc.statementLines, st])
  const byAct = new Map(lines.map((l) => [l.activityId, l]))
  const rowsAll: { a: (typeof acts)[number]; l: (typeof lines)[number]; r: StRow }[] = acts.flatMap((a) => { const l = byAct.get(a.id); return l ? [{ a, l, r: { activityId: a.id, unitPrice: l.unitPrice, baseQty: l.baseQty, sys: l.sys, req: l.req, con: l.con, prevSys: l.prevSys, prevReq: l.prevReq, prevCon: l.prevCon } }] : [] })
  const view = rowsAll.filter(({ a, l }) => (!onlyVal || l.sys > 0 || (l.req ?? 0) > 0 || (l.con ?? 0) > 0 || l.prevCon > 0 || l.prevSys > 0) && (!q || `${a.title} ${a.itemNo} ${a.rowNo}`.toLowerCase().includes(q.toLowerCase())))
  const tot = totals(rowsAll.map((x) => x.r), m.ex.settings.overBasePct)
  const isFirst = !!st && !sts.some((s) => s.no < st.no)
  if (!period) return <Empty>ابتدا فعالیت‌ها و گزارش‌های روزانه ثبت شود.</Empty>
  const locked = st?.status === 'finalized'
  const excel = async () => {
    const XLSX = await import('xlsx')
    const out = view.map(({ a, l, r }) => { const c = calcRow(r); return { 'فهرست‌بها': bookTitle(a.bookId), 'فصل': a.chapter, 'ردیف': a.rowNo, 'کد': a.itemNo, 'شرح': a.title, 'واحد': a.unit, 'فهای واحد': l.unitPrice, 'مقدار پیمان': l.baseQty,
      'سیستمی تجمعی': l.sys, 'درخواست پیمانکار تجمعی': l.req ?? '', 'نظر مشاور تجمعی': l.con ?? '', 'قبلی (مشاور)': l.prevCon, 'کارکرد ماه (سیستمی)': c.sysMonth, 'کارکرد ماه (درخواست)': c.reqMonth, 'کارکرد ماه (مشاور)': c.conMonth, 'مبلغ ماه (مشاور)': c.monthAmt, 'مبلغ تجمعی (مشاور)': c.cumAmt } })
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out.length ? out : [{ '—': '' }]), 'صورت‌وضعیت پیمان'); XLSX.writeFile(wb, `صورت-وضعیت-پیمان-${st?.no ?? ''}-${period.from}.xlsx`)
  }
  let lastCh = ''
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mt-filters no-print">
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <select value={pi} onChange={(e) => setIdx(Number(e.target.value))} aria-label="دوره">{periods.map((p, i) => <option key={p.key} value={i}>{p.label}{sts.some((s) => s.periodFrom === p.from) ? ` — صورت‌وضعیت ${fa(sts.find((s) => s.periodFrom === p.from)!.no)}` : ''}</option>)}</select>
        </span>
        {!st && canMake && <button className="im-btn im-btn-primary im-btn-sm" disabled={busy || !!draft} title={draft ? 'ابتدا صورت‌وضعیت پیش‌نویس باز را نهایی کنید' : undefined} onClick={async () => { setBusy(true); await epc.createStatement(projectId, period.from, period.to, payload()); setBusy(false) }}>ایجاد صورت‌وضعیت این ماه (مقادیر سیستمی خودکار)</button>}
        {st && !locked && canMake && <button className="im-btn im-btn-sm" disabled={busy} onClick={async () => { setBusy(true); await epc.refreshStatement(st.id, payload()); setBusy(false) }}>به‌روزرسانی مقادیر سیستمی</button>}
        {st && !locked && canCon && <button className="im-btn im-btn-sm" onClick={async () => { const n = await epc.acceptRequests(st.id); if (n != null) window.alert(`${n} ردیف: نظر مشاور = درخواست پیمانکار ثبت شد (فقط ردیف‌های خالی).`) }}>پذیرش مقادیر درخواستی (ردیف‌های خالی)</button>}
        {st && !locked && canCon && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => { if (window.confirm(`صورت‌وضعیت ${st.no} نهایی شود؟ پس از آن قابل ویرایش نیست و مقادیر «قبلی» صورت‌وضعیت بعدی خواهد شد.`)) void epc.finalizeStatement(st.id) }}>نهایی‌کردن</button>}
        {st && locked && cfg && <button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('صورت‌وضعیت بازگشایی شود؟ (فقط وقتی صورت‌وضعیت بعدی ندارد)')) void epc.reopenStatement(st.id) }}>بازگشایی</button>}
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>{st && <><button className="im-btn im-btn-sm" onClick={() => void excel()}><Download size={13} /> اکسل</button><button className="im-btn im-btn-sm" onClick={() => window.print()}><Printer size={13} /> چاپ</button></>}</span>
      </div>
      {!st ? <Empty>برای {period.label} هنوز صورت‌وضعیتی ساخته نشده است.{!sts.some((s) => s.status === 'finalized') ? ' این اولین صورت‌وضعیت است؛ مقادیر «قبلی» (اگر قبلاً صورت‌وضعیت دیگری داده شده) پس از ساخت قابل ورود است.' : ''}</Empty> : <>
        <div className="fn-kpis">
          <KpiCard i={0} label={`مبلغ کارکرد ماه (نظر مشاور) — صورت‌وضعیت ${fa(st.no)}`} value={money(tot.month)} sub="ریال" tone="good" />
          <KpiCard i={1} label="مبلغ تجمعی (نظر مشاور)" value={money(tot.cum)} sub="ریال" />
          <KpiCard i={2} label="مبلغ صورت‌وضعیت‌های قبلی" value={money(tot.prev)} sub="ریال" />
          <KpiCard i={3} label="ردیف دارای مقدار سیستمی ولی بدون نظر مشاور" value={fa(tot.missing)} tone={tot.missing ? 'warn' : 'good'} hint="تا ثبت نظر مشاور، مبلغ آن ردیف صفر حساب می‌شود" />
          {tot.over > 0 && <KpiCard i={4} label="ردیف بیش از مقدار پیمان" value={fa(tot.over)} tone="bad" />}
        </div>
        <div className="mt-filters no-print">
          <input placeholder="جست‌وجوی ردیف" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجو" style={{ minWidth: 240 }} />
          <label className="im-helper"><input type="checkbox" checked={onlyVal} onChange={(e) => setOnlyVal(e.target.checked)} /> فقط ردیف‌های دارای مقدار</label>
          <Chip tone={locked ? 'good' : 'warn'}>{locked ? 'نهایی‌شده' : 'پیش‌نویس'}</Chip>
        </div>
        <div className="mt-printable">
          <div className="mt-print-head"><div><h2>صورت‌وضعیت پیمان شمارهٔ {fa(st.no)}</h2><p>{project?.officialName} — {period.label} ({jalaliText(period.from)} تا {jalaliText(period.to)})</p></div></div>
          <div className="fn-tbl-wrap" style={{ maxHeight: 640 }}><table className="ex-lines">
            <thead><tr><th rowSpan={2}>ردیف</th><th rowSpan={2}>واحد</th><th rowSpan={2} className="num">فهرست‌بها</th><th colSpan={3}>مقدار تجمعی تا پایان دوره</th><th rowSpan={2} className="num">قبلی (مشاور)</th><th colSpan={3}>کارکرد ماه</th><th rowSpan={2} className="num">مبلغ ماه (مشاور)</th></tr>
              <tr><th className="num">سیستمی</th><th className="num">درخواست پیمانکار</th><th className="num">نظر مشاور</th><th className="num">سیستمی</th><th className="num">درخواست</th><th className="num">مشاور</th></tr></thead>
            <tbody>{view.slice(0, 400).flatMap(({ a, l, r }) => { const c = calcRow(r, m.ex.settings.overBasePct), ch = `${a.bookId ?? ''}|${a.chapterNo || a.chapter}`, head = ch !== lastCh; lastCh = ch
              return [head && <tr key={`h${ch}${a.id}`}><td colSpan={11} className="sub" style={{ fontWeight: 600 }}>{bookTitle(a.bookId)} — {a.chapterNo ? `فصل ${a.chapterNo} ` : ''}{a.chapter}</td></tr>,
                <tr key={a.id}><td style={{ minWidth: 240 }}><b>{a.title}</b><span className="sub fn-code">{a.rowNo ? `ردیف ${a.rowNo} · ` : ''}{a.itemNo}</span></td><td>{a.unit}</td><td className="num">{money(l.unitPrice)}</td>
                  <td className="num">{fa(l.sys, 2)}</td>
                  <td className="num">{locked || !canReq ? fa(l.req ?? 0, 2) : <NumCell value={l.req} disabled={false} onCommit={(n) => void epc.setStatementCell(l.id, 'req', n)} />}</td>
                  <td className="num">{locked || !canCon ? (l.con == null ? <span className="im-helper">—</span> : fa(l.con, 2)) : <NumCell value={l.con} disabled={false} placeholder="—" onCommit={(n) => void epc.setStatementCell(l.id, 'con', n)} />}{c.over && <small className="ex-bad" style={{ display: 'block' }}>بیش از پیمان</small>}</td>
                  <td className="num">{isFirst && !locked && cfg ? <NumCell value={l.prevCon} disabled={false} onCommit={(n) => void epc.setStatementCell(l.id, 'prev_con', n)} /> : fa(l.prevCon, 2)}</td>
                  <td className="num">{fa(c.sysMonth, 2)}</td><td className="num">{fa(c.reqMonth, 2)}</td><td className="num"><b>{fa(c.conMonth, 2)}</b></td><td className="num"><b>{money(c.monthAmt)}</b></td></tr>] })}
              {view.length === 0 && <tr><td colSpan={11} className="sub">ردیفی نیست.</td></tr>}</tbody>
          </table></div>
          {view.length > 400 && <p className="im-helper">۴۰۰ ردیف اول نمایش داده شد؛ جست‌وجو کنید.</p>}
          <p className="im-helper">محاسبهٔ مبالغ بر اساس ستون «نظر مشاور» است. کارکرد ماه = مقدار تجمعی − مقدار قبلی (از صورت‌وضعیت نهایی ماه قبل). هر سه مقدار (سیستمی، درخواست، نظر مشاور) ثبت و نگهداری می‌شود.</p>
        </div>
      </>}
    </div>
  )
}
