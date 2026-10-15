import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useEpcModel } from '../lib/useEpcModel'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { monthOf } from '../lib/periods'
import type { Ledger, MismatchKind } from '../lib/engine/reconcile'
import { Chip, DataTable, KpiCard, Section, type Col } from '../../finance/components/fn'
import { Empty, fa } from '../components/common'
import { EpcGate } from '../components/epc/EpcBanner'

const MM_FA: Record<MismatchKind, string> = { measured_over_approved: 'اندازه‌گیری > تأییدشده', billed_over_measured: 'صورت‌وضعیت > اندازه‌گیری', paid_over_billed: 'پرداخت > صورت‌وضعیت', approved_not_measured: 'تأییدشدهٔ اندازه‌گیری‌نشده', billed_without_certificate: 'بدون ارجاع به صورت‌وضعیت', approved_without_evidence: 'بدون مستند', approved_over_executed: 'تأییدشده > اعلامی' }
const LABEL_KEYS = ['certificate_no', 'number', 'no', 'title', 'name', 'code']

/** Chain of five distinct quantities per activity: executed → approved → measured → billed → paid. A technical approval is never an entitlement to payment; amounts follow the contract, the price list and the approved workflow. */
export function LedgerPage(p: { projectId: string }) { return <EpcGate><Inner {...p} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const m = useEpcModel(projectId)
  const epc = useEpcStore()
  const can = useExecutionStore((s) => s.can(projectId, 'measure'))
  const [certs, setCerts] = useState<{ id: string; label: string }[]>([])
  const [sel, setSel] = useState<string | null>(null)
  useEffect(() => { void supabase.from('fin_payment_certificates').select('*').limit(300).then(({ data }) => setCerts(((data ?? []) as Record<string, unknown>[]).filter((r) => !r.project_id || r.project_id === projectId || r.master_project_id === projectId).map((r) => ({ id: String(r.id), label: String(LABEL_KEYS.map((k) => r[k]).find((v) => v != null && v !== '') ?? String(r.id).slice(0, 8)) })))) }, [projectId])
  if (!m.ledger.length) return <Empty>هنوز فعالیتی با کارکرد تأییدشده یا حجم اندازه‌گیری‌شده وجود ندارد.</Empty>
  const tot = (f: (l: Ledger) => number) => m.ledger.reduce((s, l) => s + f(l), 0)
  const bad = m.ledger.filter((l) => l.mismatches.some((x) => x.kind !== 'approved_not_measured'))
  const cols: Col<Ledger>[] = [
    { key: 't', label: 'فعالیت', render: (l) => <><span className="strong">{l.title}</span><span className="sub">{l.unit}</span></> },
    { key: 'e', label: 'اعلامی (گزارش روزانه)', num: true, render: (l) => fa(l.executed, 2) },
    { key: 'a', label: 'تأییدشده (نظارت)', num: true, render: (l) => fa(l.approved, 2) },
    ...(m.set.employerStep !== 'off' ? [{ key: 'em', label: 'کارفرما', num: true, render: (l: Ledger) => (l.employer == null ? '—' : fa(l.employer, 2)) }] : []),
    { key: 'm', label: 'اندازه‌گیری‌شده', num: true, render: (l) => fa(l.measured, 2) },
    { key: 'b', label: 'صورت‌وضعیت‌شده', num: true, render: (l) => fa(l.billed, 2) },
    { key: 'p', label: 'پرداخت‌شده', num: true, render: (l) => fa(l.paid, 2) },
    { key: 'tm', label: 'مانده برای اندازه‌گیری', num: true, render: (l) => fa(l.toMeasure, 2) },
    { key: 'x', label: 'مغایرت', render: (l) => (l.mismatches.length ? <div className="ex-chiprow">{l.mismatches.map((x, i) => <Chip key={i} tone={x.kind === 'approved_not_measured' ? 'warn' : 'bad'}>{MM_FA[x.kind]}</Chip>)}</div> : <Chip tone="good">منطبق</Chip>) },
  ]
  const cur = sel ? m.ledger.find((l) => l.activityId === sel) : null
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="فعالیت دارای مغایرت" value={fa(bad.length)} tone={bad.length ? 'bad' : 'good'} />
        <KpiCard i={1} label="مجموع مانده برای اندازه‌گیری" value={fa(tot((l) => l.toMeasure), 1)} sub="واحدهای ناهم‌جنس جمع نمی‌شوند؛ جمع فقط راهنماست" />
        <KpiCard i={2} label="فعالیت با مانده برای صورت‌وضعیت" value={fa(m.ledger.filter((l) => l.toBill > 0).length)} />
        <KpiCard i={3} label="فعالیت با مانده برای پرداخت" value={fa(m.ledger.filter((l) => l.toPay > 0).length)} />
      </div>
      <Section title="زنجیرهٔ مقادیر به‌تفکیک فعالیت" hint="برای ثبت حجم اندازه‌گیری/صورت‌وضعیت روی ردیف کلیک کنید" flush><DataTable cols={cols} rows={m.ledger} rowKey={(l) => l.activityId} onRow={(l) => setSel(l.activityId)} /></Section>
      {cur && <Periods ledger={cur} projectId={projectId} can={can} certs={certs} rows={epc.measurements.filter((x) => x.projectId === projectId && x.activityId === cur.activityId)} />}
    </div>
  )
}

function Periods({ ledger, projectId, can, certs, rows }: { ledger: Ledger; projectId: string; can: boolean; certs: { id: string; label: string }[]; rows: ReturnType<typeof useEpcStore.getState>['measurements'] }) {
  const save = useEpcStore((s) => s.saveMeasurement)
  const [key, setKey] = useState(monthOf(new Date().toISOString().slice(0, 10)).key.replace(/^M/, ''))
  const blank = { measured: 0, billed: 0, paid: 0, certificateId: '' as string | null, note: '' }
  const ex = rows.find((r) => r.periodKey === key)
  const [f, setF] = useState(ex ?? blank)
  useEffect(() => { setF(rows.find((r) => r.periodKey === key) ?? blank) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key, rows.length])
  return (
    <Section title={`دوره‌های «${ledger.title}»`} hint="هر دوره یک ردیف؛ ثبت تکراری همان دوره جایگزین می‌شود، نه اضافه">
      <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>دوره</th><th className="num">اندازه‌گیری‌شده</th><th className="num">صورت‌وضعیت‌شده</th><th className="num">پرداخت‌شده</th><th>صورت‌وضعیت</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td>{r.periodKey}</td><td className="num">{fa(r.measured, 2)}</td><td className="num">{fa(r.billed, 2)}</td><td className="num">{fa(r.paid, 2)}</td><td className="sub">{certs.find((c) => c.id === r.certificateId)?.label ?? (r.certificateId ? 'ارجاع نامعتبر' : '—')}</td></tr>)}</tbody></table></div>
      {can && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
          <label className="ex-lab">کلید دوره (ماه شمسی)<input value={key} onChange={(e) => setKey(e.target.value)} dir="ltr" style={{ width: 100 }} /></label>
          <label className="ex-lab">اندازه‌گیری‌شده<input type="number" min={0} value={f.measured} onChange={(e) => setF({ ...f, measured: Number(e.target.value) || 0 })} style={{ width: 110 }} /></label>
          <label className="ex-lab">صورت‌وضعیت‌شده<input type="number" min={0} value={f.billed} onChange={(e) => setF({ ...f, billed: Number(e.target.value) || 0 })} style={{ width: 110 }} /></label>
          <label className="ex-lab">پرداخت‌شده<input type="number" min={0} value={f.paid} onChange={(e) => setF({ ...f, paid: Number(e.target.value) || 0 })} style={{ width: 110 }} /></label>
          <label className="ex-lab">صورت‌وضعیت مالی<select value={f.certificateId ?? ''} onChange={(e) => setF({ ...f, certificateId: e.target.value || null })}><option value="">—</option>{certs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <button className="im-btn im-btn-primary im-btn-sm" onClick={() => void save({ projectId, activityId: ledger.activityId, periodKey: key, measured: f.measured, billed: f.billed, paid: f.paid, certificateId: f.certificateId || null, note: f.note })}>ثبت دوره</button>
        </div>)}
      <p className="im-helper" style={{ margin: '8px 0 0' }}>پایگاه داده اجازه نمی‌دهد مجموع اندازه‌گیری از مقدار تأییدشده، صورت‌وضعیت از اندازه‌گیری یا پرداخت از صورت‌وضعیت بیشتر شود.</p>
    </Section>
  )
}
