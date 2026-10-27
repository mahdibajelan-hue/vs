import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FilePlus2, RefreshCw } from 'lucide-react'
import { projectParties } from '../lib/projectParties'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { writeXlsx } from '../../material/lib/control/xlsx'
import { FORM_BY_KEY } from '../lib/formCatalog'
import { Chip, DataTable, KpiCard, Section, fmtD, type Col } from '../../finance/components/fn'
import { FormModal } from '../../finance/components/FormModal'
import { Empty, fa } from '../components/common'
import { GAP_KIND_LABEL_FA, GAP_STATUS_LABEL_FA, type Gap, type GapKind, type GapStatus } from '../types'
import type { ExTab } from '../ExecutionApp'

const EX_LABEL: Record<string, string> = { date: 'تاریخ', front: 'جبهه', reportNo: 'شمارهٔ گزارش', status: 'وضعیت', lines: 'ردیف‌ها', sentOn: 'ارسال', returnedOn: 'برگشت', cumulative: 'تجمعی', base: 'مبنا', reports: 'گزارش‌ها', open: 'باز', sheet: 'برگهٔ فرم' }
const exVal = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? fmtD(v.slice(0, 10)) : typeof v === 'number' ? fa(v, 2) : String(v))
const TONE: Record<GapKind, 'bad' | 'warn' | 'neutral'> = { missing_report: 'bad', incomplete: 'warn', inconsistent: 'bad', unreviewed: 'warn', period_open: 'neutral', form_missing: 'neutral' }

/**
 * Completeness of the reporting: expected daily reports that never arrived, reports with missing fields, contradictions, reports waiting too long, periods that closed with open reports.
 * For each gap a supplementary form can be generated, pre-filled from what is known — never with guessed values — and the follow-up (owner, due date, status) is kept until it is closed.
 */
export function GapsPage({ projectId, onGo }: { projectId: string; sub: string; onGo: (t: ExTab, s?: string) => void }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const orgs = useMasterDataStore((s) => s.organizations)
  const [kind, setKind] = useState<GapKind | ''>('')
  const [showClosed, setShowClosed] = useState(false)
  const [edit, setEdit] = useState<Gap | null>(null)
  const [busy, setBusy] = useState(false)
  const synced = useRef('')
  const can = ex.can(projectId, 'manage_gaps') || ex.can(projectId, 'record') || ex.can(projectId, 'review')
  const live = useMemo(() => m.detected.filter((g) => g.kind !== 'form_missing'), [m.detected])
  const sig = useMemo(() => live.map((g) => g.fingerprint).sort().join('|') + '#' + m.gaps.filter((g) => g.status === 'open' || g.status === 'in_progress').map((g) => g.fingerprint).sort().join('|'), [live, m.gaps])
  useEffect(() => {
    if (!can || !ex.loaded || synced.current === sig) return
    synced.current = sig
    const stored = new Set(m.gaps.map((g) => g.fingerprint))
    const fresh = live.some((g) => !stored.has(g.fingerprint) || m.gaps.find((x) => x.fingerprint === g.fingerprint)?.status === 'closed')
    const stale = m.gaps.some((g) => (g.status === 'open' || g.status === 'in_progress') && !live.some((x) => x.fingerprint === g.fingerprint))
    if (fresh || stale) void ex.syncGaps(projectId, live)
  }, [sig, can, ex.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // stored follow-ups plus what was just detected and not saved yet (shown at once; saved by the sync)
  const all: Gap[] = useMemo(() => {
    const stored = new Set(m.gaps.map((g) => g.fingerprint))
    const virt: Gap[] = live.filter((d) => !stored.has(d.fingerprint)).map((d) => ({ id: `virt:${d.fingerprint}`, projectId, fingerprint: d.fingerprint, kind: d.kind, formKey: d.formKey, periodKey: d.periodKey, front: d.front, subject: d.subject, existing: d.existing, missing: d.missing, responsible: null, dueDate: d.dueDate, status: 'open' as GapStatus, note: '', generatedReportId: null }))
    return [...m.gaps, ...virt]
  }, [m.gaps, live, projectId])
  const isOpen = (g: Gap) => g.status === 'open' || g.status === 'in_progress'
  const gaps = all.filter((g) => showClosed || isOpen(g)).filter((g) => !kind || g.kind === kind).sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9'))
  const count = (k: GapKind) => all.filter((g) => g.kind === k && isOpen(g)).length
  const openN = all.filter(isOpen).length
  const overdue = all.filter((g) => isOpen(g) && g.dueDate && g.dueDate < m.today).length
  const unowned = all.filter((g) => isOpen(g) && !g.responsible).length
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId))
  const orgOf = projectParties(project, orgs).contractor?.id ?? ex.roles.find((r) => r.projectId === projectId && r.active && r.organizationId)?.organizationId ?? orgs[0]?.id ?? null

  // the person who has to fix a gap follows from its kind: a missing / incomplete report is the site's (site head, else
  // contractor), an unreviewed one the supervision's — one click instead of a hundred rows edited one by one
  const unownedStored = all.filter((g) => isOpen(g) && !g.responsible && !g.id.startsWith('virt:'))
  const firstOf = (...roles: string[]) => { for (const r of roles) { const x = ex.roles.find((y) => y.projectId === projectId && y.active && y.role === r); if (x) return x.userId } return null }
  const autoAssign = async () => {
    const site = firstOf('site_head', 'contractor'), sup = firstOf('supervision', 'consultant')
    const by = new Map<string, string[]>()
    for (const g of unownedStored) { const who = g.kind === 'unreviewed' ? sup : site; if (who) by.set(who, [...(by.get(who) ?? []), g.id]) }
    if (!by.size) { window.alert('در «تنظیمات ← افراد و نقش‌ها» برای این پروژه سرپرست کارگاه / پیمانکار یا دستگاه نظارت تعریف نشده است.'); return }
    setBusy(true); await ex.assignGaps([...by].map(([responsible, ids]) => ({ responsible, ids }))); setBusy(false)
  }

  const generate = async (g: Gap) => {
    setBusy(true)
    let id: string | null = null
    if (g.kind === 'missing_report') {
      const date = String(g.existing.date ?? g.periodKey)
      id = await ex.createReport({ projectId, formKey: 'work', reportDate: date, front: g.front, contractorOrgId: orgOf, status: 'incomplete', missing: g.missing, dueDate: g.dueDate, notes: 'گزارش تکمیلی — گزارش این روز دریافت نشده بود' })
    } else if ((g.kind === 'incomplete' || g.kind === 'inconsistent') && g.existing.reportNo) {
      const src = m.reports.find((r) => r.reportNo === g.existing.reportNo && r.formKey === g.formKey)
      if (src) {
        if (src.status === 'draft' || src.status === 'returned' || src.status === 'incomplete') { id = src.id }
        else {
          id = await ex.createReport({ projectId, formKey: src.formKey, reportDate: src.reportDate, front: src.front, station: src.station, shift: src.shift, contractorOrgId: src.contractorOrgId, data: src.data, notes: `گزارش تکمیلی ${src.reportNo}`, status: 'incomplete', completionOf: src.id, missing: g.missing, dueDate: g.dueDate })
          if (id) await ex.saveBody(id, { lines: (m.linesByReport.get(src.id) ?? []).map((l) => ({ activityId: l.activityId, qty: l.qty, kmFrom: l.kmFrom, kmTo: l.kmTo, location: l.location, note: l.note, detail: l.detail })) })
        }
      }
    } else if (g.kind === 'unreviewed') {
      const src = m.reports.find((r) => r.reportNo === (g.existing as Record<string, unknown>).reportNo || g.subject.includes(r.reportNo))
      if (src) { ex.setFocus(src.id); onGo(src.status === 'returned' ? 'daily' : 'review', src.formKey === 'work' ? 'work' : 'forms'); setBusy(false); return }
    }
    setBusy(false)
    if (id) { if (!g.id.startsWith('virt:')) await ex.updateGap(g.id, { generatedReportId: id, status: 'in_progress' }); ex.setFocus(id); onGo('daily', m.reports.find((r) => r.id === id)?.formKey === 'work' || g.kind === 'missing_report' ? 'work' : 'forms') }
  }
  const cols: Col<Gap>[] = [
    { key: 'k', label: 'نوع', render: (g) => <Chip tone={TONE[g.kind]}>{GAP_KIND_LABEL_FA[g.kind]}</Chip> },
    { key: 's', label: 'گزارش / فرم', render: (g) => <><span className="strong">{g.subject}</span><span className="sub">{g.formKey === 'work' ? 'کارکرد روزانه' : FORM_BY_KEY[g.formKey]?.title ?? ''}{g.front ? ` · ${g.front}` : ''}</span></> },
    { key: 'e', label: 'اطلاعات موجود', render: (g) => <span className="sub">{Object.entries(g.existing).map(([k, v]) => `${EX_LABEL[k] ?? k}: ${exVal(v)}`).join(' · ') || '—'}</span> },
    { key: 'm', label: 'اطلاعات مفقود', render: (g) => <ul style={{ margin: 0, paddingInlineStart: 16, fontSize: 12 }}>{g.missing.slice(0, 4).map((x) => <li key={x}>{x}</li>)}{g.missing.length > 4 && <li>و {fa(g.missing.length - 4)} مورد دیگر</li>}</ul> },
    { key: 'r', label: 'مسئول تکمیل', render: (g) => (g.responsible ? ex.people.get(g.responsible) ?? 'کاربر' : <span style={{ opacity: .5 }}>تعیین‌نشده</span>) },
    { key: 'd', label: 'مهلت', render: (g) => <span style={{ color: g.dueDate && g.dueDate < m.today && (g.status === 'open' || g.status === 'in_progress') ? 'var(--im-coral)' : undefined }}>{fmtD(g.dueDate)}</span>, sort: (g) => g.dueDate ?? '' },
    { key: 'st', label: 'وضعیت', render: (g) => <Chip tone={g.status === 'closed' ? 'good' : g.status === 'waived' ? 'neutral' : g.status === 'in_progress' ? 'warn' : 'bad'}>{GAP_STATUS_LABEL_FA[g.status]}</Chip> },
    { key: 'a', label: '', render: (g) => (
      <span className="no-print" style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
        {(g.status === 'open' || g.status === 'in_progress') && g.kind !== 'period_open' && <button className="im-btn im-btn-sm im-btn-primary" disabled={busy} onClick={() => void generate(g)}><FilePlus2 size={12} /> {g.kind === 'unreviewed' ? 'باز کردن' : g.generatedReportId ? 'ادامهٔ تکمیل' : 'تولید فرم تکمیلی'}</button>}
        {can && !g.id.startsWith('virt:') && <button className="im-btn im-btn-sm" onClick={() => setEdit(g)}>پیگیری</button>}
      </span>) },
  ]
  const toXlsx = () => writeXlsx(gaps.map((g) => ({ 'نوع': GAP_KIND_LABEL_FA[g.kind], 'گزارش / فرم': g.subject, 'جبهه': g.front, 'اطلاعات مفقود': g.missing.join(' | '), 'مسئول تکمیل': g.responsible ? ex.people.get(g.responsible) ?? '' : '', 'مهلت': g.dueDate ?? '', 'وضعیت': GAP_STATUS_LABEL_FA[g.status], 'یادداشت': g.note })), `کسری-گزارش‌ها-${m.today}.xlsx`, 'کسری‌ها')
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="کسری باز" value={fa(openN)} tone={openN ? 'bad' : 'good'} />
        <KpiCard i={1} label="گزارش دریافت‌نشده" value={fa(count('missing_report'))} tone={count('missing_report') ? 'bad' : 'good'} />
        <KpiCard i={2} label="مهلت‌گذشته" value={fa(overdue)} tone={overdue ? 'bad' : 'good'} sub={unowned ? `${fa(unowned)} بدون مسئول` : undefined} />
        <KpiCard i={3} label="فیلد کاغذی پیاده‌نشده" value={fa(m.detected.filter((g) => g.kind === 'form_missing').length)} sub="ماتریس تطبیق در تنظیمات" onClick={() => onGo('settings', 'forms')} />
      </div>
      <p className="im-helper" style={{ margin: 0 }}>سامانه فقط آنچه را که واقعاً کم است نشان می‌دهد و هیچ مقداری را حدس نمی‌زند. «تولید فرم تکمیلی» فرمی با وضعیت «نیازمند تکمیل» می‌سازد که با اطلاعات موجود پیش‌پر شده و موارد مفقود در آن مشخص است.</p>
      <div className="mt-filters no-print">
        <div className="mt-pills"><button className={`mt-pill${kind === '' ? ' on' : ''}`} onClick={() => setKind('')}>همه<em>{fa(openN)}</em></button>{(['missing_report', 'incomplete', 'inconsistent', 'unreviewed', 'period_open'] as GapKind[]).map((k) => <button key={k} className={`mt-pill${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{GAP_KIND_LABEL_FA[k]}<em>{fa(count(k))}</em></button>)}</div>
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} style={{ width: 'auto' }} /> نمایش بسته‌شده‌ها</label>
          {can && <button className="im-btn im-btn-sm" onClick={() => { synced.current = ''; void ex.syncGaps(projectId, live) }}><RefreshCw size={13} /> همگام‌سازی</button>}
          {can && unownedStored.length > 0 && <button className="im-btn im-btn-sm im-btn-primary" disabled={busy} title="کسری گزارش‌ها به سرپرست کارگاه (یا پیمانکار) و «بررسی‌نشده» به دستگاه نظارت سپرده می‌شود" onClick={() => void autoAssign()}>تعیین مسئول برای {fa(unownedStored.length)} کسری</button>}
          <button className="im-btn im-btn-sm" onClick={() => void toXlsx()}><Download size={13} /> فهرست روزانه (اکسل)</button>
        </span>
      </div>
      {gaps.length === 0 ? <Empty>{m.reports.length ? 'کسری باز نیست.' : 'هنوز گزارشی ثبت نشده است. برای کنترل «گزارش دریافت‌نشده»، جبهه‌های موردانتظار را در تنظیمات تعریف کنید.'}</Empty> : <DataTable cols={cols} rows={gaps} rowKey={(g) => g.id} />}
      <Section title="فهرست کنترل کامل‌بودن" hint="آنچه سامانه برای هر گزارش بررسی می‌کند" flush>
        <ul style={{ margin: 0, padding: '8px 30px 14px', display: 'grid', gap: 3, fontSize: 12.5 }}>
          <li>گزارش کارکرد هر روز کاری برای هر جبههٔ موردانتظار رسیده باشد.</li>
          <li>پیمانکار، جبهه، آب‌وهوا، حداقل یک ردیف کارکرد و نیروی انسانی ثبت شده باشد (در فرم‌های فنی: فیلدهای ستاره‌دار سربرگ و ستون‌های الزامی هر ردیف).</li>
          <li>هر ردیف فعالیت و مقدار مثبت داشته باشد؛ کیلومتر شروع از پایان بزرگ‌تر نباشد.</li>
          <li>کارکرد تجمعی از مقدار مبنا بیشتر نشود و با رد یا برگشت یک ردیف قدیمی، تجمعی‌های بعدی ناسازگار نماند.</li>
          <li>گزارش ارسال‌شده در مهلت بررسی تکلیف شود و گزارش برگشت‌خورده اصلاح شود.</li>
          <li>پایان هر هفته و ماه، همهٔ گزارش‌های آن دوره تأیید نهایی شده باشند.</li>
        </ul>
      </Section>
      {edit && <FormModal title="پیگیری کسری" subtitle={edit.subject} submitLabel="ثبت" onClose={() => setEdit(null)}
        fields={[{ key: 'status', label: 'وضعیت', kind: 'select', required: true, options: (Object.keys(GAP_STATUS_LABEL_FA) as GapStatus[]).map((k) => ({ value: k, label: GAP_STATUS_LABEL_FA[k] })) }, { key: 'responsible', label: 'مسئول تکمیل', kind: 'select', options: [...ex.people].map(([id, n]) => ({ value: id, label: n })) }, { key: 'due', label: 'مهلت', kind: 'date' }, { key: 'note', label: 'یادداشت پیگیری', kind: 'area', span: 2 }]}
        initial={{ status: edit.status, responsible: edit.responsible ?? '', due: edit.dueDate, note: edit.note }}
        onSubmit={async (v) => { await ex.updateGap(edit.id, { status: v.status as GapStatus, responsible: (v.responsible as string) || null, dueDate: (v.due as string) || null, note: String(v.note ?? '') }) }} />}
    </div>
  )
}
