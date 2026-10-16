import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, CornerUpLeft, History, Printer, RotateCcw, X } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { DecInput } from '../../material/components/control/DecInput'
import { useExecutionStore, type ReviewDecision } from '../store/useExecutionStore'
import { useExecutionModel, type ExecutionModel } from '../lib/useExecutionModel'
import { FORM_BY_KEY } from '../lib/formCatalog'
import { cumulative } from '../lib/progress'
import { cumulativeMetrics } from '../lib/forms'
import { DataTable, KpiCard, fmtD, type Col } from '../../finance/components/fn'
import { LineStatusChip, ReportStatusChip, Empty, fa } from '../components/common'
import { PaperModal, type PaperCtx } from '../components/ReportPaper'
import type { Report } from '../types'
import { EmployerPanel } from '../components/epc/EmployerPanel'
import { VersionsCard } from '../components/epc/VersionsCard'
import { epcSettings } from '../lib/epcSettings'

type Dec = { decision: 'approved' | 'rejected' | 'returned'; qty: number; note: string }

/** The supervision's inbox: every sent report, reviewed line by line — approve (even a smaller quantity), reject or send back, always with a written reason. */
export function ReviewPage({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const orgs = useMasterDataStore((s) => s.organizations)
  const [open, setOpen] = useState<string | null>(null)
  const focus = useExecutionStore((x) => x.focusReportId)
  useEffect(() => { if (focus) { setOpen(focus); useExecutionStore.getState().setFocus(null) } }, [focus])
  const [scope, setScope] = useState<'wait' | 'done'>('wait')
  const rows = useMemo(() => m.reports.filter((r) => (scope === 'wait' ? r.status === 'submitted' || r.status === 'partially_approved' : r.status === 'approved' || r.status === 'rejected' || r.status === 'returned')).sort((a, b) => (scope === 'wait' ? (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '') : (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? ''))), [m.reports, scope])
  // bulk approval: only daily work reports whose pending lines raise no doubt (cumulative stays within the contract quantity) are offered
  const [sel, setSel] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const ex0 = useExecutionStore()
  const clean = useMemo(() => {
    const ok = new Set<string>()
    for (const r of rows) {
      if (r.formKey !== 'work') continue
      const ls = (m.linesByReport.get(r.id) ?? []).filter((l) => l.status === 'pending')
      if (!ls.length) continue
      const before = cumulative(m.reports, m.lines, { before: r.reportDate, excludeReportId: r.id, mode: 'approved' })
      const used = new Map<string, number>()
      let fine = true
      for (const l of ls) {
        const a = l.activityId ? m.actById.get(l.activityId) : undefined
        if (!a && l.detail.actionKey && l.qty > 0) continue // an action line has no base quantity to check; it is converted at the statement
        if (!a || !(l.qty > 0)) { fine = false; break }
        const tot = (before.get(a.id) ?? 0) + (used.get(a.id) ?? 0) + l.qty; used.set(a.id, (used.get(a.id) ?? 0) + l.qty)
        const base = m.baseOf(a, r.reportDate)
        if (base > 0 && tot > base * (1 + m.settings.overBasePct / 100) + 1e-9) { fine = false; break }
      }
      if (fine) ok.add(r.id)
    }
    return ok
  }, [rows, m])
  const bulkApprove = async () => {
    const ids = [...sel].filter((id) => clean.has(id))
    if (!ids.length || !window.confirm(`${fa(ids.length)} گزارش بدون مغایرت به‌صورت کامل تأیید شود؟ (ردیف‌ها با مقدار ثبت‌شده تأیید می‌شوند)`)) return
    setBulkBusy(true)
    let done = 0
    for (const id of ids) { if (await ex0.decideWhole(id, 'approved', '')) done += 1; else break }
    setBulkBusy(false); setSel(new Set())
    if (done < ids.length) window.alert(`${fa(done)} از ${fa(ids.length)} گزارش تأیید شد؛ در ادامه خطا رخ داد (پیام بالا).`)
  }
  if (open) return <ReviewPanel reportId={open} model={m} onClose={() => setOpen(null)} />
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? '—'
  const canBulk = scope === 'wait' && ex0.can(projectId, 'review')
  const cols: Col<Report>[] = [
    ...(canBulk ? [{ key: 'sel', label: '', render: (r: Report) => (clean.has(r.id) ? <input type="checkbox" checked={sel.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSel((x) => { const n = new Set(x); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n })} aria-label={`انتخاب ${r.reportNo}`} /> : <span className="sub" title="ردیفی از این گزارش نیازمند بررسی دقیق است">بررسی دقیق</span>) } as Col<Report>] : []),
    { key: 'n', label: 'شماره', render: (r) => <span className="strong fn-code">{r.reportNo}</span> },
    { key: 'f', label: 'فرم', render: (r) => (r.formKey === 'work' ? 'کارکرد روزانه' : FORM_BY_KEY[r.formKey]?.title ?? r.formKey) },
    { key: 'd', label: 'تاریخ گزارش', render: (r) => fmtD(r.reportDate), sort: (r) => r.reportDate },
    { key: 'c', label: 'پیمانکار', render: (r) => orgName(r.contractorOrgId) },
    { key: 'fr', label: 'جبهه', render: (r) => r.front || '—' },
    { key: 'p', label: 'ردیف‌های باقی‌مانده', num: true, render: (r) => { const ls = m.linesByReport.get(r.id) ?? []; return `${fa(ls.filter((l) => l.status === 'pending').length)} از ${fa(ls.length)}` } },
    { key: 'sent', label: 'ارسال', render: (r) => fmtD((r.submittedAt ?? '').slice(0, 10)), sort: (r) => r.submittedAt ?? '' },
    { key: 's', label: 'وضعیت', render: (r) => <ReportStatusChip status={r.status} /> },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="در انتظار بررسی" value={fa(m.reports.filter((r) => r.status === 'submitted').length)} tone={m.reports.some((r) => r.status === 'submitted') ? 'warn' : 'good'} />
        <KpiCard i={1} label="تأیید جزئی" value={fa(m.reports.filter((r) => r.status === 'partially_approved').length)} />
        <KpiCard i={2} label="برگشت‌خورده" value={fa(m.reports.filter((r) => r.status === 'returned').length)} />
        <KpiCard i={3} label="تأییدشده" value={fa(m.reports.filter((r) => r.status === 'approved').length)} tone="good" />
      </div>
      <div className="mt-filters no-print">
        <div className="mt-pills"><button className={`mt-pill${scope === 'wait' ? ' on' : ''}`} onClick={() => setScope('wait')}>در انتظار بررسی</button><button className={`mt-pill${scope === 'done' ? ' on' : ''}`} onClick={() => setScope('done')}>بررسی‌شده</button></div>
        <p className="im-helper" style={{ margin: 0, marginInlineStart: 'auto' }}>تأیید کارکرد روزانه به‌معنای تأیید نهایی کیفیت یا صورت‌وضعیت مالی نیست؛ مبنای گزارش‌های پیشرفت است.</p>
      </div>
      {canBulk && clean.size > 0 && (
        <div className="im-card no-print" style={{ padding: '8px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span><b>{fa(clean.size)}</b> گزارش بدون مغایرت (مقدار مثبت و در محدودهٔ مقدار پیمان) را می‌شود یکجا تأیید کرد؛ بقیه باید ردیف‌به‌ردیف بررسی شوند.</span>
          <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>
            <button className="im-btn im-btn-sm" onClick={() => setSel(sel.size === clean.size ? new Set() : new Set(clean))}>{sel.size === clean.size ? 'برداشتن انتخاب' : 'انتخاب همهٔ بدون مغایرت'}</button>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={bulkBusy || sel.size === 0} onClick={() => void bulkApprove()}><Check size={13} /> {bulkBusy ? 'در حال تأیید…' : `تأیید گروهی (${fa(sel.size)})`}</button>
          </span>
        </div>
      )}
      {rows.length === 0 ? <Empty>{scope === 'wait' ? 'گزارشی در انتظار بررسی نیست.' : 'هنوز گزارشی بررسی نشده است.'}</Empty> : <DataTable cols={cols} rows={rows} rowKey={(r) => r.id} onRow={(r) => setOpen(r.id)} />}
    </div>
  )
}

function ReviewPanel({ reportId, model: m, onClose }: { reportId: string; model: ExecutionModel; onClose: () => void }) {
  const ex = useExecutionStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === m.projectId))
  const r = m.reports.find((x) => x.id === reportId)
  const [dec, setDec] = useState<Record<string, Dec>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [paper, setPaper] = useState(false)
  if (!r) return null
  const epc = epcSettings(m.settings as unknown as Record<string, unknown>)
  const empOn = epc.employerStep !== 'off'
  const form = r.formKey === 'work' ? null : FORM_BY_KEY[r.formKey] ?? null
  const lines = m.linesByReport.get(reportId) ?? []
  const canReview = ex.can(m.projectId, 'review') && (r.status === 'submitted' || r.status === 'partially_approved')
  const canReopen = ex.can(m.projectId, 'reopen') && (r.status === 'approved' || r.status === 'partially_approved' || r.status === 'rejected')
  const before = cumulative(m.reports, m.lines, { before: r.reportDate, excludeReportId: reportId, mode: 'approved' })
  const set = (id: string, p: Partial<Dec>, q: number) => setDec((d) => { const base: Dec = { decision: 'approved', qty: q, note: '' }; return { ...d, [id]: Object.assign(base, d[id], p) } })
  const pending = lines.filter((l) => l.status === 'pending')
  const decided = Object.entries(dec)
  const needNote = decided.some(([, d]) => d.decision !== 'approved' && !d.note.trim())
  const approveAll = () => setDec((d) => { const x = { ...d }; for (const l of pending) if (!x[l.id]) x[l.id] = { decision: 'approved', qty: l.qty, note: '' }; return x })
  const submit = async () => {
    setBusy(true)
    const ds: ReviewDecision[] = decided.map(([lineId, d]) => ({ lineId, decision: d.decision, qty: d.qty, note: d.note }))
    const ok = await ex.reviewReport(reportId, ds, note)
    setBusy(false)
    if (ok) onClose()
  }
  const reopen = async () => { const why = window.prompt('علت بازگشایی گزارش تأییدشده (الزامی):'); if (why?.trim() && (await ex.reopenReport(reportId, why.trim()))) onClose() }
  const orgName = orgs.find((o) => o.id === r.contractorOrgId)?.name ?? '—'
  const hist = m.history.filter((h) => h.reportId === reportId)
  const paperCtx = (): PaperCtx => ({ projectName: project?.officialName ?? '', orgName, people: ex.people, report: r, form, lines, resources: m.resources.filter((x) => x.reportId === reportId), stoppages: m.stoppages.filter((x) => x.reportId === reportId), acts: m.actById, prev: before, baseOf: (a) => m.baseOf(a, r.reportDate), metrics: form ? cumulativeMetrics(form, r, lines, m.reports, m.lines) : undefined })
  const detailText = (l: (typeof lines)[number]) => (form ? form.columns.slice(0, 5).map((c) => { const v = l.detail[c.key]; const o = c.options?.find((x) => x.value === String(v)); return v == null || v === '' ? '' : `${c.label}: ${o ? o.label : String(v)}` }).filter(Boolean).join(' · ') : '')
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mt-filters no-print">
        <button className="im-btn im-btn-sm" onClick={onClose}><ArrowRight size={14} /> بازگشت به کارتابل</button>
        <b style={{ fontSize: 15 }}>{form ? form.title : 'گزارش کارکرد روزانه'} · <span className="fn-code">{r.reportNo}</span></b>
        <ReportStatusChip status={r.status} />
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>
          <button className="im-btn im-btn-sm" onClick={() => setPaper(true)}><Printer size={13} /> چاپ</button>
          {canReopen && <button className="im-btn im-btn-sm" onClick={() => void reopen()}><RotateCcw size={13} /> بازگشایی</button>}
        </span>
      </div>
      <div className="im-card" style={{ padding: '10px 14px', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13 }}>
        <span>تاریخ: <b>{fmtD(r.reportDate)}</b></span><span>پیمانکار: <b>{orgName}</b></span><span>جبهه: <b>{r.front || '—'}</b></span><span>ارسال‌کننده: <b>{ex.people.get(r.submittedBy ?? '') ?? '—'}</b></span><span>ارسال: <b>{fmtD((r.submittedAt ?? '').slice(0, 10))}</b></span>
      </div>
      <div className="im-card" style={{ padding: 0 }}>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
          <table className="ex-lines">
            <thead><tr><th>#</th><th>{form ? 'ردیف' : 'فعالیت'}</th><th className="num">{form ? '' : 'کارکرد گزارش‌شده'}</th>{!form && <th>تجمعی تأییدشده تا قبل</th>}<th>وضعیت</th><th className="num">بررسی نظارت</th>{empOn && <th className="num">کارفرما</th>}{canReview && <th>تصمیم شما</th>}</tr></thead>
            <tbody>{lines.map((l, i) => { const a = l.activityId ? m.actById.get(l.activityId) : undefined; const d = dec[l.id]; const prev = l.activityId ? before.get(l.activityId) ?? 0 : 0; const base = a ? m.baseOf(a, r.reportDate) : 0
              return (
                <tr key={l.id}>
                  <td>{fa(i + 1)}</td>
                  <td style={{ minWidth: 220 }}>{a ? <><b>{a.title}</b><span className="sub fn-code">{a.itemNo}{l.location ? ` · ${l.location}` : ''}{l.kmFrom != null ? ` · km ${l.kmFrom}${l.kmTo != null ? `–${l.kmTo}` : ''}` : ''}</span></> : l.detail.actionKey ? <><b>{String(l.detail.actionTitle ?? l.detail.actionKey)}</b><span className="sub">اقدام کارگاهی{l.location ? ` · ${l.location}` : ''}{l.kmFrom != null ? ` · km ${l.kmFrom}${l.kmTo != null ? `–${l.kmTo}` : ''}` : ''}{Object.entries(l.detail).filter(([k, v]) => !k.startsWith('action') && String(v ?? '').trim()).map(([k, v]) => ` · ${k}: ${v}`).join('')}</span></> : <span>{detailText(l) || '—'}</span>}{l.note && <small className="sub">{l.note}</small>}</td>
                  <td className="num">{form ? '' : <b>{fa(l.qty, 3)} {a?.unit ?? String(l.detail.actionUnit ?? '')}</b>}</td>
                  {!form && <td><div className="ex-cum"><span>{fa(prev, 2)} {a?.unit}</span>{base > 0 && <span>مبنا: {fa(base, 2)} · باقی: {fa(Math.max(0, base - prev), 2)}</span>}</div></td>}
                  <td><LineStatusChip status={l.status} />{l.status === 'approved' && l.approvedQty != null && l.approvedQty !== l.qty && <small className="ex-warn" style={{ display: 'block' }}>تأییدشده: {fa(l.approvedQty, 3)}</small>}{l.reviewNote && <small className="sub">{l.reviewNote}</small>}</td>
                  <td className="num">{l.status === 'approved' ? fa(l.approvedQty ?? l.qty, 3) : '—'}</td>
                  {empOn && <td className="num">{l.employerStatus ? fa(l.employerQty ?? 0, 3) : '—'}</td>}
                  {canReview && <td style={{ minWidth: 300 }}>{l.status === 'pending' ? (
                    <div style={{ display: 'grid', gap: 4 }}>
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className={`im-btn im-btn-sm${d?.decision === 'approved' ? ' im-btn-primary' : ''}`} onClick={() => set(l.id, { decision: 'approved' }, l.qty)}><Check size={12} /> تأیید</button>
                        <button className={`im-btn im-btn-sm${d?.decision === 'returned' ? ' im-btn-primary' : ''}`} onClick={() => set(l.id, { decision: 'returned' }, l.qty)}><CornerUpLeft size={12} /> بازگرداندن</button>
                        <button className={`im-btn im-btn-sm${d?.decision === 'rejected' ? ' im-btn-danger' : ''}`} onClick={() => set(l.id, { decision: 'rejected' }, l.qty)}><X size={12} /> رد</button>
                        {d && <button className="im-btn im-btn-sm" onClick={() => setDec((x) => { const y = { ...x }; delete y[l.id]; return y })}>لغو</button>}
                      </span>
                      {d?.decision === 'approved' && !form && <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>مقدار تأییدی: <DecInput value={d.qty} onValue={(n) => set(l.id, { qty: Math.min(n, l.qty) }, l.qty)} label="مقدار تأییدی" className="fn-cell-input" /> از {fa(l.qty, 3)}</span>}
                      {d && d.decision !== 'approved' && <input placeholder="علت (الزامی)" value={d.note} onChange={(e) => set(l.id, { note: e.target.value }, l.qty)} dir="auto" aria-label="علت" />}
                    </div>) : <span className="sub">—</span>}</td>}
                </tr>) })}</tbody>
          </table>
        </div>
      </div>
      {canReview && (
        <div className="im-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--im-muted)' }}>توضیحات بازرس دربارهٔ کل گزارش<input value={note} onChange={(e) => setNote(e.target.value)} dir="auto" /></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="im-btn im-btn-sm" onClick={approveAll} disabled={!pending.length}>تأیید همهٔ ردیف‌های تصمیم‌نگرفته</button>
            <button className="im-btn im-btn-primary" disabled={busy || decided.length === 0 || needNote} onClick={() => void submit()}>ثبت نتیجهٔ بررسی ({fa(decided.length)} ردیف)</button>
            {needNote && <span className="ex-bad" style={{ alignSelf: 'center' }}>برای رد یا بازگرداندن، علت را بنویسید.</span>}
            {!needNote && decided.length > 0 && decided.length < pending.length && <span className="ex-warn" style={{ alignSelf: 'center' }}>{fa(pending.length - decided.length)} ردیف بدون تصمیم می‌ماند؛ گزارش «تأیید جزئی» می‌شود.</span>}
          </div>
        </div>
      )}
      {empOn && !form && <EmployerPanel reportId={reportId} lines={lines} actById={m.actById} mode={epc.employerStep as 'advisory' | 'binding'} canDecide={isEmployerSide(m.projectId) && (r.status === 'approved' || r.status === 'partially_approved')} />}
      <VersionsCard reportId={reportId} actTitle={(id) => (id ? m.actById.get(id)?.title ?? '—' : '—')} people={ex.people} />
      <div className="im-card" style={{ padding: 14 }}><b><History size={14} style={{ verticalAlign: -2 }} /> سابقه</b><div className="ex-hist" style={{ marginTop: 8 }}>{hist.length === 0 ? <span className="im-helper">—</span> : hist.map((h) => <div key={h.id}><b>{h.action.startsWith('review:') ? `بررسی (${h.action.slice(7)})` : h.action === 'submit' ? 'ارسال' : h.action === 'reopen' ? 'بازگشایی' : h.action}</b><span>{ex.people.get(h.actor ?? '') ?? 'کاربر'}</span><small>{fmtD(h.at.slice(0, 10))} {new Date(h.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</small>{h.note && <span>— {h.note}</span>}</div>)}</div></div>
      {paper && <PaperModal c={paperCtx()} onClose={() => setPaper(false)} />}
    </div>
  )
}

/** the employer step is decided by the employer role or a manager/administrator of the project (same rule as the database function ex_is_employer) */
function isEmployerSide(projectId: string): boolean {
  const ex = useExecutionStore.getState()
  return ex.myRoles(projectId).includes('employer') || ex.can(projectId, '*')
}
