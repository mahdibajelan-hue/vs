import { useMemo, useState } from 'react'
import { useExecutionStore } from '../store/useExecutionStore'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { FORM_BY_KEY } from '../lib/formCatalog'
import { Chip, DataTable, KpiCard, Section, fmtD, type Col } from '../../finance/components/fn'
import { fa } from '../components/common'
import { EpcGate } from '../components/epc/EpcBanner'
import type { QcFindingRow } from '../epcTypes'
import type { ExTab } from '../ExecutionApp'

const KIND_FA = { defect: 'عیب جوش/اجرا', nonconformity: 'عدم انطباق', observation: 'مشاهده' } as const
const SEV_FA = { low: 'کم', medium: 'متوسط', high: 'زیاد' } as const
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

/** Quality control view built on the technical forms already recorded: completion/approval of forms, radiography acceptance, repair progress, and the register of findings. */
export function QcPage({ projectId }: { projectId: string; sub: string; onGo: (t: ExTab, s?: string) => void }) { return <EpcGate><Inner projectId={projectId} /></EpcGate> }
function Inner({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const epc = useEpcStore()
  const can = useExecutionStore((s) => s.can(projectId, 'record') || s.can(projectId, 'raise') || s.can(projectId, '*'))
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ kind: 'defect' as QcFindingRow['kind'], severity: 'medium' as QcFindingRow['severity'], weldRef: '', note: '', rep: '' })
  const tech = useMemo(() => m.reports.filter((r) => r.formKey !== 'work' && r.status !== 'rejected'), [m.reports])
  const byForm = useMemo(() => {
    const map = new Map<string, { n: number; ok: number; wait: number }>()
    for (const r of tech) { const x = map.get(r.formKey) ?? { n: 0, ok: 0, wait: 0 }; x.n++; if (r.status === 'approved') x.ok++; else if (r.status === 'submitted' || r.status === 'partially_approved') x.wait++; map.set(r.formKey, x) }
    return [...map.entries()].map(([key, v]) => ({ key, title: FORM_BY_KEY[key]?.title ?? key, ...v })).sort((a, b) => b.n - a.n)
  }, [tech])
  const lines = (key: string) => m.lines.filter((l) => tech.some((r) => r.id === l.reportId && r.formKey === key))
  const rt = lines('rt_report'), rtAcc = rt.filter((l) => l.detail.result === 'acc').length, rtRep = rt.filter((l) => l.detail.result === 'rep').length
  const rp = lines('weld_repair'), rpDone = rp.filter((l) => l.detail.repairDone === 'done').length
  const weldN = lines('welding').length, vtRej = lines('welding').filter((l) => l.detail.vt === 'rej').length
  const mine = epc.findings.filter((x) => x.projectId === projectId), open = mine.filter((x) => x.status === 'open')
  // suggestions: weld results that already say "repair" / "rejected" but have no finding yet
  const suggestions = useMemo(() => {
    const have = new Set(mine.map((x) => `${x.techReportId}|${x.weldRef}`))
    const out: { key: string; reportId: string; weld: string; why: string }[] = []
    for (const l of m.lines) {
      const rep = tech.find((r) => r.id === l.reportId); if (!rep) continue
      const weld = String(l.detail.weldNo ?? '')
      const why = rep.formKey === 'rt_report' && l.detail.result === 'rep' ? `رادیوگرافی: نیاز به تعمیر${l.detail.defect ? ` (${String(l.detail.defect)})` : ''}` : rep.formKey === 'welding' && l.detail.vt === 'rej' ? 'بازرسی چشمی: مردود' : ''
      if (why && weld && !have.has(`${rep.id}|${weld}`)) out.push({ key: l.id, reportId: rep.id, weld, why })
    }
    return out
  }, [m.lines, tech, mine])
  const cols: Col<(typeof byForm)[number]>[] = [
    { key: 'title', label: 'فرم', render: (r) => r.title },
    { key: 'n', label: 'تعداد گزارش', num: true, render: (r) => fa(r.n) },
    { key: 'ok', label: 'تأییدشده', num: true, render: (r) => `${fa(r.ok)} (${fa(pct(r.ok, r.n))}٪)` },
    { key: 'wait', label: 'در انتظار بررسی', num: true, render: (r) => (r.wait ? <Chip tone="warn">{fa(r.wait)}</Chip> : '—') },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard label="گزارش‌های فنی ثبت‌شده" value={fa(tech.length)} sub={`${fa(tech.filter((r) => r.status === 'approved').length)} تأییدشده`} />
        <KpiCard label="قبولی رادیوگرافی" value={rt.length ? `${fa(pct(rtAcc, rtAcc + rtRep))}٪` : '—'} sub={`${fa(rtAcc)} قبول · ${fa(rtRep)} تعمیر`} tone={rtRep > rtAcc * 0.1 && rt.length ? 'warn' : 'good'} />
        <KpiCard label="پیشرفت تعمیرات جوش" value={rp.length ? `${fa(pct(rpDone, rp.length))}٪` : '—'} sub={`${fa(rpDone)} از ${fa(rp.length)} انجام شد`} />
        <KpiCard label="رد بازرسی چشمی جوش" value={weldN ? `${fa(pct(vtRej, weldN))}٪` : '—'} sub={`${fa(vtRej)} از ${fa(weldN)} سرجوش`} tone={vtRej ? 'warn' : 'good'} />
        <KpiCard label="مغایرت‌های باز" value={fa(open.length)} tone={open.length ? 'bad' : 'good'} />
      </div>
      <Section title="وضعیت فرم‌ها"><DataTable cols={cols} rows={byForm} rowKey={(r) => r.key} empty="هنوز فرم فنی ثبت نشده است." /></Section>
      {suggestions.length > 0 && (
        <Section title={`پیشنهاد ثبت مغایرت (${fa(suggestions.length)})`} hint="سرجوش‌هایی که در فرم‌ها مردود یا نیازمند تعمیرند و هنوز مغایرتی برایشان ثبت نشده است.">
          <div className="fn-tbl-wrap" style={{ maxHeight: 280 }}><table className="ex-lines"><tbody>{suggestions.slice(0, 50).map((x) => <tr key={x.key}><td dir="ltr">{x.weld}</td><td>{x.why}</td><td>{m.reports.find((r) => r.id === x.reportId)?.reportNo}</td><td>{can && <button className="im-btn im-btn-sm im-btn-primary" disabled={busy} onClick={async () => { setBusy(true); await epc.saveFinding({ projectId, techReportId: x.reportId, kind: 'defect', severity: 'medium', weldRef: x.weld, note: x.why }); setBusy(false) }}>ثبت مغایرت</button>}</td></tr>)}</tbody></table></div>
        </Section>
      )}
      <Section title="ثبت مغایرت و نتایج بازرسی" hint="مغایرت را به یک گزارش فنی وصل کنید؛ تا بسته‌شدن، در شاخص‌ها باز می‌ماند.">
        {can && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as QcFindingRow['kind'] })} aria-label="نوع">{Object.entries(KIND_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as QcFindingRow['severity'] })} aria-label="شدت">{Object.entries(SEV_FA).map(([k, v]) => <option key={k} value={k}>شدت {v}</option>)}</select>
            <select value={f.rep} onChange={(e) => setF({ ...f, rep: e.target.value })} aria-label="گزارش فنی" style={{ maxWidth: 260 }}><option value="">بدون اتصال به گزارش</option>{tech.map((r) => <option key={r.id} value={r.id}>{r.reportNo} — {FORM_BY_KEY[r.formKey]?.title ?? r.formKey}</option>)}</select>
            <input value={f.weldRef} onChange={(e) => setF({ ...f, weldRef: e.target.value })} placeholder="شمارهٔ سرجوش/لوله" dir="ltr" style={{ width: 150 }} />
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="شرح مغایرت" style={{ flex: 1, minWidth: 200 }} />
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!f.note.trim() || busy} onClick={async () => { setBusy(true); const ok = await epc.saveFinding({ projectId, techReportId: f.rep || null, kind: f.kind, severity: f.severity, weldRef: f.weldRef, note: f.note }); setBusy(false); if (ok) setF({ ...f, weldRef: '', note: '' }) }}>ثبت</button>
          </div>
        )}
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>تاریخ</th><th>نوع</th><th>شدت</th><th>سرجوش</th><th>شرح</th><th>گزارش</th><th>وضعیت</th><th /></tr></thead>
          <tbody>{mine.map((x) => <tr key={x.id}><td>{fmtD(x.createdAt.slice(0, 10))}</td><td>{KIND_FA[x.kind]}</td><td><Chip tone={x.severity === 'high' ? 'bad' : x.severity === 'medium' ? 'warn' : 'neutral'}>{SEV_FA[x.severity]}</Chip></td><td dir="ltr">{x.weldRef || '—'}</td><td>{x.note}</td><td>{m.reports.find((r) => r.id === x.techReportId)?.reportNo ?? '—'}</td><td><Chip tone={x.status === 'open' ? 'bad' : 'good'}>{x.status === 'open' ? 'باز' : 'بسته'}</Chip></td><td>{can && <button className="im-btn im-btn-sm" onClick={() => void epc.closeFinding(x.id, x.status === 'closed')}>{x.status === 'open' ? 'بستن' : 'بازکردن'}</button>}</td></tr>)}
            {mine.length === 0 && <tr><td colSpan={8} className="sub">مغایرتی ثبت نشده است.</td></tr>}</tbody></table></div>
      </Section>
    </div>
  )
}
