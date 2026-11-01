import { useState } from 'react'
import { CheckCircle2, Loader2, RotateCcw, Send } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { jalaliText } from '../../execution/lib/periods'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { PURPOSE_FA, RESULT_COLOR, RESULT_FA, type EngCycleResult, type EngDocRow, type EngPurpose } from '../../execution/epcTypes'
import type { EngLens } from '../lib/roles'
import { todayTehran } from '../../../lib/today'

const today = () => todayTehran()
/** the next revision letter after the last submission: A → B → C …, 0 → 1 → 2 … */
export function nextRev(doc: Pick<EngDocRow, 'cycles' | 'rev'>): string {
  const last = [...doc.cycles].filter((c) => c.result !== 'withdrawn').sort((a, b) => b.seq - a.seq)[0]?.rev
  if (!last) return 'A'
  if (/^\d+$/.test(last)) return String(Number(last) + 1)
  if (/^[A-Y]$/i.test(last)) return String.fromCharCode(last.toUpperCase().charCodeAt(0) + 1)
  return last
}
export const lastCycle = (doc: Pick<EngDocRow, 'cycles'>) => [...doc.cycles].filter((c) => c.result !== 'withdrawn').sort((a, b) => b.seq - a.seq)[0] ?? null
/** a one-line state of the document from its cycle: «Rev B · IFA · در انتظار بررسی مشاور» */
export function cycleLine(doc: Pick<EngDocRow, 'cycles'>): string | null {
  const c = lastCycle(doc)
  return c ? `Rev ${c.rev || '—'} · ${c.purpose} · ${RESULT_FA[c.result].replace(/\s*\(.*\)$/, '')}` : null
}
const RESULTS: { k: Exclude<EngCycleResult, 'pending' | 'withdrawn'>; tone: string }[] = [
  { k: 'approved', tone: ' im-btn-primary' }, { k: 'approved_as_noted', tone: '' }, { k: 'commented', tone: '' }, { k: 'rejected', tone: ' im-btn-danger' },
]

/**
 * گردش مدرک — the submissions of a document and the consultant's answers, without technical comment text. The contractor
 * sends a revision for a purpose (IFI / IFR / IFA / IFC); the consultant answers Commented, Rejected, Approved as Noted or
 * Approved. The database checks the role of each step.
 */
export function DocCycle({ doc, lens, canSubmit, compact = false }: { doc: EngDocRow; lens: EngLens; canSubmit: boolean; compact?: boolean }) {
  const epc = useEpcStore()
  const last = lastCycle(doc)
  const pending = last?.result === 'pending'
  const done = last?.result === 'approved'
  const [rev, setRev] = useState(nextRev(doc))
  const [purpose, setPurpose] = useState<EngPurpose>(last?.result === 'approved_as_noted' ? 'IFC' : (['IFI', 'IFR', 'IFA', 'IFC'].includes(doc.targetIssue) ? doc.targetIssue as EngPurpose : 'IFA'))
  const [date, setDate] = useState(today())
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const contractorTurn = (lens === 'contractor' || lens === 'manager') && canSubmit && !pending && !done && doc.status !== 'superseded'
  const consultantTurn = (lens === 'consultant' || lens === 'manager') && pending
  const run = async (key: string, f: () => Promise<string | null>) => { setBusy(key); setErr(''); const e = await f(); setBusy(''); if (e) setErr(e) }
  const history = [...doc.cycles].sort((a, b) => a.seq - b.seq)

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {!compact && <b style={{ fontSize: 12 }}>گردش مدرک</b>}
      {!compact && (history.length ? (
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
          <table className="ex-lines"><thead><tr><th>#</th><th>Rev</th><th>هدف صدور</th><th>ارسال</th><th>نتیجهٔ بررسی</th><th>تاریخ نتیجه</th></tr></thead>
            <tbody>{history.map((c) => (
              <tr key={c.id} style={c.result === 'withdrawn' ? { opacity: 0.55 } : undefined}>
                <td>{c.seq.toLocaleString('fa-IR')}</td><td dir="ltr"><b>{c.rev || '—'}</b></td><td>{PURPOSE_FA[c.purpose]}</td><td>{jalaliText(c.submittedOn)}</td>
                <td><b style={{ color: RESULT_COLOR[c.result] }}>{RESULT_FA[c.result]}</b></td><td>{c.resultOn && c.result !== 'withdrawn' ? jalaliText(c.resultOn) : '—'}</td>
              </tr>
            ))}</tbody></table>
        </div>
      ) : <span className="sub">هنوز ارسالی ثبت نشده است.</span>)}

      {contractorTurn && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="ex-lab">Rev<input value={rev} onChange={(e) => setRev(e.target.value)} dir="ltr" style={{ width: 56 }} /></label>
          <label className="ex-lab">هدف صدور<select value={purpose} onChange={(e) => setPurpose(e.target.value as EngPurpose)}>{(Object.keys(PURPOSE_FA) as EngPurpose[]).map((k) => <option key={k} value={k}>{PURPOSE_FA[k]}</option>)}</select></label>
          <label className="ex-lab">تاریخ ارسال<JalaliDateInput value={date} onChange={(v) => setDate(v || today())} /></label>
          <button className="im-btn im-btn-sm im-btn-primary" disabled={!!busy} onClick={() => void run('send', () => epc.submitDoc(doc.id, rev.trim(), purpose, date))}>{busy === 'send' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} ارسال برای مشاور</button>
        </div>
      )}
      {consultantTurn && last && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <span className="im-helper" style={{ margin: 0, alignSelf: 'center' }}>Rev {last.rev || '—'} برای {last.purpose} — نتیجهٔ بررسی:</span>
          <label className="ex-lab">تاریخ نتیجه<JalaliDateInput value={date} onChange={(v) => setDate(v || today())} /></label>
          {RESULTS.map((r) => <button key={r.k} className={`im-btn im-btn-sm${r.tone}`} disabled={!!busy} onClick={() => void run(r.k, () => epc.reviewDoc(doc.id, r.k, date))} style={{ ['--c' as string]: RESULT_COLOR[r.k] }}>{busy === r.k ? <Loader2 size={13} className="animate-spin" /> : r.k === 'approved' ? <CheckCircle2 size={13} /> : null} {RESULT_FA[r.k]}</button>)}
        </div>
      )}
      {!compact && last && ((pending && (lens === 'contractor' || lens === 'manager') && canSubmit) || (!pending && (lens === 'consultant' || lens === 'manager'))) && (
        <button className="im-btn im-btn-sm" style={{ justifySelf: 'start' }} disabled={!!busy} title={pending ? 'ارسالی که هنوز بررسی نشده پس گرفته می‌شود' : 'نتیجهٔ آخرین بررسی برداشته می‌شود و مدرک دوباره منتظر بررسی می‌ماند'}
          onClick={() => window.confirm(pending ? 'آخرین ارسال پس گرفته شود؟' : 'نتیجهٔ آخرین بررسی برداشته شود؟') && void run('undo', () => epc.undoDoc(doc.id))}><RotateCcw size={12} /> {pending ? 'پس گرفتن آخرین ارسال' : 'برداشتن آخرین نتیجه'}</button>
      )}
      {done && <span className="im-helper" style={{ margin: 0, color: '#16a34a' }}>تأیید نهایی شده است.</span>}
      {err && <span className="ex-bad" style={{ fontSize: 12 }}>{err}</span>}
    </div>
  )
}
