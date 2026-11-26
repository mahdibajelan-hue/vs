import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCsStore } from '../store/useCsStore'
import { CheckCircle2, Download, FileCheck2, Printer, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { openPrintDocument } from '../../../lib/printWindow'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { useExecutionStore } from '../store/useExecutionStore'
import { jalaliText, periodOf, type Period } from '../lib/periods'
import { DOC_STATUS_FA, REPORT_TYPES, SECTION_LABEL, buildReport, renderReportHtml, typeOf, type BuiltReport, type DocMeta, type PayRow, type SectionKey } from '../lib/reportBuilder'
import { Empty } from '../components/common'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'

interface Tpl { id: string; reportType: string; title: string; docPrefix: string; sections: SectionKey[]; headerLines: string[]; footer: string; distribution: string }
interface Doc { id: string; reportType: string; docNo: string; revision: number; title: string; from: string | null; to: string | null; filters: { front?: string; activityIds?: string[] }; report: BuiltReport; status: string; reason: string; distribution: string
  preparedBy: string | null; preparedAt: string; checkedBy: string | null; checkedAt: string | null; approvedBy: string | null; approvedAt: string | null; templateId: string | null; docKey: string }
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const ALL_SECTIONS = Object.keys(SECTION_LABEL) as SectionKey[]
const ERR: [RegExp, string][] = [[/reason_required/, 'برای بازنگری یک مدرک صادرشده، علت بازنگری را بنویسید.'], [/own_document/, 'تهیه‌کنندهٔ مدرک نمی‌تواند خودش آن را بررسی یا تأیید کند.'],
  [/same_checker/, 'تأییدکننده باید غیر از بررسی‌کننده باشد.'], [/superseded/, 'این بازنگری منسوخ شده است؛ نسخهٔ معتبر را بررسی کنید.'], [/bad_state/, 'ترتیب کار: صدور ← بررسی ← تأیید.'],
  [/not_allowed|42501|permission/i, 'دسترسی این کار را ندارید.'], [/does not exist|schema cache/, 'جدول‌های گزارش‌ساز هنوز در پایگاه داده نصب نشده است (048).']]
const msg = (e: { message: string }) => ERR.find(([r]) => r.test(e.message))?.[1] ?? e.message
const dt = (s: string | null | undefined) => (s ? jalaliText(s.slice(0, 10)) : '')

/** «گزارش‌ساز»: any execution report for any period / front / activity, previewed, printed (PDF), exported (Excel) and formally issued under document control. */
export function ReportBuilderPage({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const [typeKey, setTypeKey] = useState('monthly')
  const type = typeOf(typeKey)
  const [anchor, setAnchor] = useState(m.today)
  const [from, setFrom] = useState(m.today.slice(0, 8) + '01'), [to, setTo] = useState(m.today)
  const [front, setFront] = useState(''), [actId, setActId] = useState('')
  const [sections, setSections] = useState<SectionKey[]>(type.sections)
  const [tplId, setTplId] = useState('')
  const [tpls, setTpls] = useState<Tpl[]>([]), [docs, setDocs] = useState<Doc[]>([])
  const [pay, setPay] = useState<PayRow[] | undefined>(undefined)
  const [busy, setBusy] = useState(''), [flash, setFlash] = useState('')
  const canIssue = ex.can(projectId, 'record') || ex.can(projectId, 'review') || ex.can(projectId, 'configure') || ex.can(projectId, '*')
  const canConfig = ex.can(projectId, 'configure') || ex.can(projectId, '*')

  const period: Period = useMemo(() => {
    if (type.period === 'range') return { kind: 'month', key: `R${from}${to}`, from, to, label: `از ${jalaliText(from)} تا ${jalaliText(to)}` }
    return periodOf(type.period, anchor, m.settings.weekStart)
  }, [type.period, anchor, from, to, m.settings.weekStart])
  const fronts = useMemo(() => [...new Set(m.reports.filter((r) => r.formKey === 'work' && r.front).map((r) => r.front))].sort(), [m.reports])
  const tpl = tpls.find((t) => t.id === tplId) ?? null
  const filters = useMemo(() => ({ ...(front ? { front } : {}), ...(actId ? { activityIds: [actId] } : {}) }), [front, actId])

  const load = useCallback(async () => {
    const [t, d] = await Promise.all([
      supabase.from('ex_report_templates').select('*').eq('project_id', projectId).eq('active', true).order('title'),
      supabase.from('ex_issued_docs').select('*').eq('project_id', projectId).order('prepared_at', { ascending: false }).limit(200),
    ])
    if (t.error || d.error) { setFlash(msg((t.error ?? d.error)!)); return }
    setTpls((t.data as Row[]).map((r) => ({ id: r.id, reportType: r.report_type, title: r.title, docPrefix: r.doc_prefix ?? '', sections: r.sections ?? [], headerLines: r.header?.lines ?? [], footer: r.footer ?? '', distribution: r.distribution ?? '' })))
    setDocs((d.data as Row[]).map((r) => ({ id: r.id, reportType: r.report_type, docNo: r.doc_no, revision: r.revision, title: r.title, from: r.period_from, to: r.period_to, filters: r.filters ?? {}, report: r.content?.report, status: r.status, reason: r.reason ?? '', distribution: r.distribution ?? '',
      preparedBy: r.prepared_by, preparedAt: r.prepared_at, checkedBy: r.checked_by, checkedAt: r.checked_at, approvedBy: r.approved_by, approvedAt: r.approved_at, templateId: r.template_id, docKey: r.doc_key })))
  }, [projectId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setSections(tpl?.sections.length ? tpl.sections : type.sections) }, [typeKey, tplId]) // eslint-disable-line react-hooks/exhaustive-deps
  // the statement basis comes from the server (the same function the statements use)
  useEffect(() => {
    if (!sections.includes('payable')) { setPay(undefined); return }
    let live = true
    void supabase.rpc('ex_payable_basis', { p_project: projectId, p_until: period.to }).then(({ data, error }) => { if (live) setPay(error ? undefined : (data as Row[]).map((r) => ({ activityId: r.activity_id, qty: Number(r.sys_qty), unitPrice: Number(r.unit_price) }))) })
    return () => { live = false }
  }, [sections, projectId, period.to])

  // the station registers (compressor-station projects) feed the DR's piping and mechanical rows
  const hasCs = sections.includes('registers')
  const csLoad = useCsStore((x) => x.load)
  useEffect(() => { if (hasCs) void csLoad(projectId) }, [hasCs, projectId, csLoad])
  const csLines = useCsStore((x) => x.lines), csSpools = useCsStore((x) => x.spools), csWelds = useCsStore((x) => x.welds), csEq = useCsStore((x) => x.equipment), csPacks = useCsStore((x) => x.packs), csRules = useCsStore((x) => x.rules)
  const cs = useMemo(() => ({ lines: csLines, spools: csSpools, welds: csWelds, equipment: csEq, packs: csPacks, rules: csRules }), [csLines, csSpools, csWelds, csEq, csPacks, csRules])
  const report = useMemo(() => buildReport({ activities: m.activities, reports: m.reports, lines: m.lines, resources: m.resources, stoppages: m.stoppages, baselines: m.baselines, blines: m.blines, baseOf: m.baseOf, employer: m.employer, groupWeights: m.settings.groupWeights, cs: hasCs ? cs : undefined },
    period, type, sections, filters, pay), [m.activities, m.reports, m.lines, m.resources, m.stoppages, m.baselines, m.blines, m.employer, period, type, sections, filters, pay, cs, hasCs]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = (id: string | null) => (id ? ex.people.get(id) ?? '—' : '')
  const metaFor = (d: Doc | null, t: Tpl | null): DocMeta => {
    const hist = d ? docs.filter((x) => x.docKey === d.docKey).sort((a, b) => a.revision - b.revision).map((x) => ({ revision: x.revision, date: dt(x.preparedAt), reason: x.reason, status: x.status })) : []
    return { projectName: project?.officialName || project?.shortName || '', projectCode: project?.projectCode ?? '', headerLines: t?.headerLines ?? [], docNo: d?.docNo ?? '', revision: d?.revision ?? null, status: d?.status ?? 'preview',
      issueDate: d ? dt(d.preparedAt) : jalaliText(m.today), prepared: d ? name(d.preparedBy) : '', checked: d ? name(d.checkedBy) : '', approved: d ? name(d.approvedBy) : '',
      preparedAt: dt(d?.preparedAt), checkedAt: dt(d?.checkedAt), approvedAt: dt(d?.approvedAt), distribution: d?.distribution ?? t?.distribution ?? '', attachments: '', footer: t?.footer ?? '', history: hist }
  }
  const previewHtml = useMemo(() => renderReportHtml(report, metaFor(null, tpl)), [report, tpl, project]) // eslint-disable-line react-hooks/exhaustive-deps
  const title = `${type.label} — ${period.label}${front ? ` — ${front}` : ''}${actId ? ` — ${m.activities.find((a) => a.id === actId)?.title ?? ''}` : ''}`

  const printDoc = (r: BuiltReport, meta: DocMeta) => { if (!openPrintDocument(renderReportHtml(r, meta), { print: true })) setFlash('مرورگر پنجرهٔ چاپ را مسدود کرد؛ اجازهٔ پنجرهٔ بازشو بدهید.') }
  const excel = async (r: BuiltReport, file: string) => {
    const XLSX = await import('xlsx'); const wb = XLSX.utils.book_new()
    if (r.kpis.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['شاخص', 'مقدار'], ...r.kpis.map((k) => [k.label, k.value])]), 'خلاصه')
    for (const t of r.tables) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([t.head, ...t.rows.map((row) => row.map((c) => c.v))]), t.title.slice(0, 28))
    XLSX.writeFile(wb, `${file}.xlsx`)
  }
  const issue = async () => {
    const same = docs.find((d) => d.reportType === typeKey && d.from === period.from && d.to === period.to && JSON.stringify(d.filters) === JSON.stringify(filters) && d.status !== 'superseded')
    let reason = ''
    if (same) { const r = window.prompt(`این گزارش قبلاً با شمارهٔ ${same.docNo} (بازنگری ${same.revision}) صادر شده است. علت بازنگری:`); if (!r?.trim()) return; reason = r.trim() }
    else if (!window.confirm('گزارش با شمارهٔ مدرک و بازنگری صفر صادر شود؟ پس از صدور، محتوای آن تغییر نمی‌کند و هر تغییر یک بازنگری جدید است.')) return
    setBusy('issue')
    const { error } = await supabase.rpc('ex_doc_issue', { p_project: projectId, p_template: tpl?.id ?? null, p_type: typeKey, p_title: title, p_from: period.from, p_to: period.to, p_filters: filters, p_content: { report }, p_reason: reason, p_distribution: tpl?.distribution ?? '' })
    setBusy(''); if (error) { setFlash(msg(error)); return }
    setFlash('صادر شد.'); await load()
  }
  const sign = async (d: Doc, step: 'checked' | 'approved') => {
    if (!window.confirm(step === 'checked' ? `بازنگری ${d.revision} مدرک ${d.docNo} بررسی شد؟` : `بازنگری ${d.revision} مدرک ${d.docNo} تأیید شود؟`)) return
    setBusy(d.id); const { error } = await supabase.rpc('ex_doc_sign', { p_doc: d.id, p_step: step }); setBusy('')
    if (error) { setFlash(msg(error)); return }
    await load()
  }
  const saveTpl = async () => {
    const t = window.prompt('عنوان قالب:', tpl?.title ?? type.label); if (!t?.trim()) return
    const prefix = window.prompt('پیشوند شمارهٔ مدرک (مثلاً KDS):', tpl?.docPrefix ?? project?.projectCode ?? '') ?? ''
    const lines = window.prompt('سطرهای سربرگ (با «|» جدا کنید؛ مثلاً نام کارفرما | نام پیمانکار):', tpl?.headerLines.join(' | ') ?? '') ?? ''
    const dist = window.prompt('فهرست توزیع پیش‌فرض:', tpl?.distribution ?? '') ?? ''
    const row = { project_id: projectId, report_type: typeKey, title: t.trim(), doc_prefix: prefix.trim(), sections, header: { lines: lines.split('|').map((x) => x.trim()).filter(Boolean) }, distribution: dist.trim(), footer: tpl?.footer ?? '', updated_at: new Date().toISOString() }
    const { error } = tpl && tpl.reportType === typeKey ? await supabase.from('ex_report_templates').update(row).eq('id', tpl.id) : await supabase.from('ex_report_templates').insert(row)
    if (error) { setFlash(msg(error)); return }
    setFlash('قالب ذخیره شد.'); await load()
  }
  const delTpl = async () => { if (!tpl || !window.confirm(`قالب «${tpl.title}» حذف شود؟ مدارک صادرشده با آن تغییری نمی‌کنند.`)) return; const { error } = await supabase.from('ex_report_templates').update({ active: false }).eq('id', tpl.id); if (error) setFlash(msg(error)); else { setTplId(''); await load() } }

  if (!m.activities.length) return <Empty>ابتدا فعالیت‌ها و گزارش‌های روزانه ثبت شود.</Empty>
  const myDocs = docs.filter((d) => d.reportType === typeKey)
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="im-card" style={{ padding: 12, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label>نوع گزارش <select value={typeKey} onChange={(e) => { setTypeKey(e.target.value); setTplId('') }}>{REPORT_TYPES.filter((t) => t.key !== 'station_daily' || m.kind !== 'pipeline').map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
          {type.period === 'range' ? <><label>از <JalaliDateInput value={from} onChange={setFrom} /></label><label>تا <JalaliDateInput value={to} onChange={setTo} /></label></>
            : <label>{type.period === 'day' ? 'روز' : type.period === 'week' ? 'هفتهٔ شامل' : 'ماه شامل'} <JalaliDateInput value={anchor} onChange={setAnchor} /> <small className="sub">{period.label}</small></label>}
          <label>جبهه <select value={front} onChange={(e) => setFront(e.target.value)}><option value="">همه</option>{fronts.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
          <label>فعالیت <select value={actId} onChange={(e) => setActId(e.target.value)} style={{ maxWidth: 260 }}><option value="">همه</option>{m.activities.filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.itemNo} {a.title}</option>)}</select></label>
          <label>قالب <select value={tplId} onChange={(e) => setTplId(e.target.value)}><option value="">پیش‌فرض</option>{tpls.filter((t) => t.reportType === typeKey).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
          {canConfig && <><button className="im-btn im-btn-sm" onClick={() => void saveTpl()}><Save size={13} /> ذخیرهٔ قالب</button>{tpl && <button className="im-btn im-btn-sm" onClick={() => void delTpl()} aria-label="حذف قالب"><Trash2 size={13} /></button>}</>}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}><legend className="sub" style={{ marginBottom: 4 }}>بخش‌های گزارش</legend>
          {ALL_SECTIONS.map((s) => <label key={s} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={sections.includes(s)} onChange={(e) => setSections((x) => (e.target.checked ? ALL_SECTIONS.filter((k) => x.includes(k) || k === s) : x.filter((k) => k !== s)))} />{SECTION_LABEL[s]}</label>)}
        </fieldset>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="im-btn im-btn-sm" onClick={() => printDoc(report, metaFor(null, tpl))}><Printer size={13} /> چاپ / PDF (پیش‌نمایش)</button>
          <button className="im-btn im-btn-sm" onClick={() => void excel(report, title)}><Download size={13} /> اکسل</button>
          {canIssue && <button className="im-btn im-btn-sm im-btn-primary" disabled={!!busy} onClick={() => void issue()}><FileCheck2 size={13} /> صدور رسمی (شمارهٔ مدرک و بازنگری)</button>}
          {flash && <span className="sub" role="status" style={{ alignSelf: 'center' }}>{flash}</span>}
        </div>
      </div>

      <div className="im-card" style={{ padding: 0, overflow: 'hidden' }}>
        <iframe title="پیش‌نمایش گزارش" srcDoc={previewHtml} style={{ width: '100%', height: 640, border: 0, background: '#fff' }} />
      </div>

      <div className="im-card" style={{ padding: 12 }}>
        <b><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> مدارک صادرشدهٔ «{type.label}»</b>
        {myDocs.length === 0 ? <p className="sub">هنوز گزارشی از این نوع صادر نشده است.</p> : (
          <div className="fn-tbl-wrap" style={{ marginTop: 8 }}><table className="ex-lines">
            <thead><tr><th>شمارهٔ مدرک</th><th>بازنگری</th><th>عنوان</th><th>وضعیت</th><th>تهیه</th><th>بررسی</th><th>تأیید</th><th /></tr></thead>
            <tbody>{myDocs.map((d) => { const t = tpls.find((x) => x.id === d.templateId) ?? null; return (
              <tr key={d.id} style={d.status === 'superseded' ? { opacity: 0.6 } : undefined}>
                <td dir="ltr" style={{ textAlign: 'right' }}>{d.docNo}</td><td>{d.revision}{d.reason && <small className="sub" style={{ display: 'block' }}>{d.reason}</small>}</td><td>{d.title}</td>
                <td>{DOC_STATUS_FA[d.status] ?? d.status}</td><td>{name(d.preparedBy)}<small className="sub" style={{ display: 'block' }}>{dt(d.preparedAt)}</small></td>
                <td>{name(d.checkedBy)}<small className="sub" style={{ display: 'block' }}>{dt(d.checkedAt)}</small></td><td>{name(d.approvedBy)}<small className="sub" style={{ display: 'block' }}>{dt(d.approvedAt)}</small></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {d.report && <button className="im-btn im-btn-sm" onClick={() => printDoc(d.report, metaFor(d, t))} aria-label="چاپ همان نسخهٔ صادرشده"><Printer size={12} /></button>}
                  {d.report && <button className="im-btn im-btn-sm" onClick={() => void excel(d.report, `${d.docNo}-Rev${d.revision}`)} aria-label="اکسل همان نسخه"><Download size={12} /></button>}
                  {d.status === 'issued' && <button className="im-btn im-btn-sm" disabled={busy === d.id} onClick={() => void sign(d, 'checked')}><CheckCircle2 size={12} /> بررسی</button>}
                  {d.status === 'checked' && <button className="im-btn im-btn-sm im-btn-primary" disabled={busy === d.id} onClick={() => void sign(d, 'approved')}><ShieldCheck size={12} /> تأیید</button>}
                </td>
              </tr>) })}</tbody>
          </table></div>)}
        <p className="sub" style={{ marginTop: 6 }}>هر بازنگری جدید همان شمارهٔ مدرک را می‌گیرد و بازنگری قبلی خودکار «منسوخ» می‌شود؛ چاپ هر نسخه همان محتوای زمان صدور را نشان می‌دهد. بررسی‌کننده و تأییدکننده باید غیر از تهیه‌کننده باشند.</p>
      </div>
    </div>
  )
}
