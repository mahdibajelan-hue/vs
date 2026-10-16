import { useMemo, useState } from 'react'
import { Archive, Eye } from 'lucide-react'
import { useEpcModel } from '../lib/useEpcModel'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore, repRow, lineRow } from '../store/useExecutionStore'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { FORM_BY_KEY, FORM_GROUP_LABEL_FA, FORMS } from '../lib/formCatalog'
import { cumulativeMetrics } from '../lib/forms'
import { overlayDetail } from '../lib/weldCentral'
import { PaperModal, type PaperCtx } from '../components/ReportPaper'
import { EpcGate } from '../components/epc/EpcBanner'
import { Chip, KpiCard, Section, fmtD } from '../../finance/components/fn'
import { fa } from '../components/common'
import type { ReportResource, Stoppage } from '../types'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (x: unknown) => Number(x ?? 0) || 0

/** The archive of technical forms: a frozen copy (date, form type, category) of every form that supervision has approved — the weld facts as they were that day, even if the central weld record changes later. */
export function ArchivePage({ projectId }: { projectId: string }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const m = useEpcModel(projectId)
  const epc = useEpcStore()
  const ex = useExecutionStore()
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const orgs = useMasterDataStore((s) => s.organizations)
  const can = ex.can(projectId, 'record') || ex.can(projectId, 'review') || ex.can(projectId, '*')
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [cat, setCat] = useState(''), [form, setForm] = useState(''), [q, setQ] = useState('')
  const [busy, setBusy] = useState(false), [ctx, setCtx] = useState<PaperCtx | null>(null)
  const all = useMemo(() => epc.archive.filter((a) => a.projectId === projectId), [epc.archive, projectId])
  // newest version of each report is the one listed; older versions stay reachable through the version number
  const latest = useMemo(() => { const best = new Map<string, (typeof all)[number]>(); for (const a of all) { const b = best.get(a.reportId); if (!b || a.version > b.version) best.set(a.reportId, a) } return [...best.values()] }, [all])
  const rows = latest.filter((a) => (!from || a.reportDate >= from) && (!to || a.reportDate <= to) && (!cat || a.category === cat) && (!form || a.formKey === form) && (!q || `${a.reportNo} ${a.formTitle}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.reportNo.localeCompare(a.reportNo))
  const filed = new Set(all.map((a) => a.reportId))
  const pending = m.ex.reports.filter((r) => r.formKey !== 'work' && (r.status === 'approved' || r.status === 'partially_approved') && !filed.has(r.id))
  const byCat = new Map<string, number>(); for (const a of latest) byCat.set(a.category, (byCat.get(a.category) ?? 0) + 1)
  const forms = FORMS.filter((f) => !cat || f.group === cat)

  const open = async (id: string) => {
    const snap = await epc.loadSnapshot(id); if (!snap) { window.alert('محتوای بایگانی خوانده نشد.'); return }
    const rep = repRow(snap.report as Row), f = FORM_BY_KEY[rep.formKey] ?? null
    const central = (l: Row) => l.central as Record<string, string> | null
    const lines = ((snap.lines as Row[]) ?? []).map((l) => { const x = lineRow(l); return { ...x, detail: overlayDetail(rep.formKey, x.detail, central(l) ?? undefined) } })
    const resources = ((snap.resources as Row[]) ?? []).map((r): ReportResource => ({ id: r.id, reportId: r.report_id, kind: r.kind, section: r.section ?? '', name: r.name, totalQty: n(r.total_qty), activeQty: n(r.active_qty), idleQty: n(r.idle_qty), leaveQty: n(r.leave_qty), stoppedQty: n(r.stopped_qty), nativeQty: n(r.native_qty), nonnativeQty: n(r.nonnative_qty), repairQty: n(r.repair_qty), hours: n(r.hours), note: r.note ?? '' }))
    const stoppages = ((snap.stoppages as Row[]) ?? []).map((r): Stoppage => ({ id: r.id, reportId: r.report_id, category: r.category, hours: n(r.hours), description: r.description ?? '', materialId: r.material_id, issueRef: r.issue_ref, responsibility: r.responsibility ?? '', critical: !!r.critical, noticeDate: r.notice_date ?? null, noticeRef: r.notice_ref ?? '', assessNote: r.assess_note ?? '' }))
    setCtx({ projectName: project?.officialName ?? '', orgName: orgs.find((o) => o.id === rep.contractorOrgId)?.name ?? '', people: ex.people, report: rep, form: f, lines, resources, stoppages, acts: m.ex.actById, metrics: f ? cumulativeMetrics(f, rep, lines, m.ex.reports, m.ex.lines) : undefined })
  }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard label="فرم‌های بایگانی‌شده" value={fa(latest.length)} sub="آخرین نسخهٔ هر گزارش" />
        <KpiCard label="تأییدشده و هنوز بایگانی‌نشده" value={fa(pending.length)} tone={pending.length ? 'warn' : 'good'} />
        {[...byCat].map(([c, k]) => <KpiCard key={c} label={FORM_GROUP_LABEL_FA[c as keyof typeof FORM_GROUP_LABEL_FA] ?? c} value={fa(k)} />)}
      </div>
      <Section title="بایگانی فرم‌های فنی" hint="هر فرم فنیِ تأییدشده خودکار با تاریخ و دستهٔ نوع فرم بایگانی می‌شود؛ محتوا (با مشخصات سرجوش همان روز) تغییرناپذیر است. شمارنده‌های «تا امروز» هنگام نمایش از داده‌های جاری محاسبه می‌شوند."
        action={can && pending.length > 0 ? <button className="im-btn im-btn-primary im-btn-sm" disabled={busy} onClick={async () => { setBusy(true); for (const r of pending) await epc.archiveReport(r.id, true); setBusy(false) }}><Archive size={13} /> بایگانی {fa(pending.length)} فرم تأییدشده</button> : undefined}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <label className="im-helper">از <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="im-helper">تا <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <select value={cat} onChange={(e) => { setCat(e.target.value); setForm('') }} aria-label="دسته"><option value="">همهٔ دسته‌ها</option>{Object.entries(FORM_GROUP_LABEL_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={form} onChange={(e) => setForm(e.target.value)} aria-label="نوع فرم"><option value="">همهٔ فرم‌ها</option>{forms.map((f) => <option key={f.key} value={f.key}>{f.title}</option>)}</select>
          <input placeholder="شمارهٔ گزارش یا عنوان" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجو" />
        </div>
        <div className="fn-tbl-wrap" style={{ maxHeight: 560 }}><table className="ex-lines"><thead><tr><th>تاریخ گزارش</th><th>دسته</th><th>نوع فرم</th><th>شمارهٔ گزارش</th><th>نسخه</th><th>بایگانی در</th><th /></tr></thead>
          <tbody>{rows.slice(0, 400).map((a) => <tr key={a.id}>
            <td>{fmtD(a.reportDate)}</td><td><Chip tone="neutral">{FORM_GROUP_LABEL_FA[a.category as keyof typeof FORM_GROUP_LABEL_FA] ?? a.category}</Chip></td><td>{a.formTitle || FORM_BY_KEY[a.formKey]?.title}</td><td className="fn-code">{a.reportNo}</td><td className="num">{fa(a.version)}</td><td>{fmtD(a.createdAt.slice(0, 10))}</td>
            <td><button className="im-btn im-btn-sm" onClick={() => void open(a.id)}><Eye size={13} /> نمایش / چاپ</button></td></tr>)}
            {rows.length === 0 && <tr><td colSpan={7} className="sub">موردی با این فیلترها بایگانی نشده است.</td></tr>}</tbody></table></div>
        {rows.length > 400 && <p className="im-helper">۴۰۰ مورد اول نمایش داده شد؛ فیلتر کنید.</p>}
      </Section>
      {ctx && <PaperModal c={ctx} onClose={() => setCtx(null)} />}
    </div>
  )
}
