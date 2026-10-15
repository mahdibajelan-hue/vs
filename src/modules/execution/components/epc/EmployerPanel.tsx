import { useState } from 'react'
import { Check, CornerUpLeft, X } from 'lucide-react'
import { DecInput } from '../../../material/components/control/DecInput'
import { useEpcStore } from '../../store/useEpcStore'
import { useExecutionStore } from '../../store/useExecutionStore'
import type { Activity, ReportLine } from '../../types'
import { fa } from '../common'

type Dec = { decision: 'approved' | 'rejected' | 'returned'; qty: number; note: string }
/** Employer step: his own decision and quantity on the lines the supervision approved — never above the supervision's quantity. His value is stored apart; the supervision's stays visible. */
export function EmployerPanel({ reportId, lines, actById, mode, canDecide }: { reportId: string; lines: ReportLine[]; actById: Map<string, Activity>; mode: 'advisory' | 'binding'; canDecide: boolean }) {
  const [dec, setDec] = useState<Record<string, Dec>>({})
  const [busy, setBusy] = useState(false)
  const approved = lines.filter((l) => l.status === 'approved')
  if (!approved.length) return null
  const set = (id: string, p: Partial<Dec>, q: number) => setDec((d) => { const base: Dec = { decision: 'approved', qty: q, note: '' }; return { ...d, [id]: Object.assign(base, d[id], p) } })
  const needNote = Object.values(dec).some((d) => d.decision !== 'approved' && !d.note.trim())
  const submit = async () => {
    setBusy(true)
    const ok = await useEpcStore.getState().employerReview(reportId, Object.entries(dec).map(([lineId, d]) => ({ lineId, decision: d.decision, qty: d.qty, note: d.note })))
    if (ok) { setDec({}); await useExecutionStore.getState().fetchAll() }
    setBusy(false)
  }
  return (
    <div className="im-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
      <b>بررسی کارفرما</b>
      <p className="im-helper" style={{ margin: 0 }}>{mode === 'binding' ? 'مرحلهٔ کارفرما الزام‌آور است: تا تأیید کارفرما، ردیف در پیشرفت تجمعی و گزارش‌ها لحاظ نمی‌شود.' : 'مرحلهٔ کارفرما مشورتی است: مقدار او نمایش داده می‌شود ولی مبنای تجمعی همچنان تأیید نظارت است.'}</p>
      <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>فعالیت</th><th className="num">اعلامی پیمانکار</th><th className="num">تأیید نظارت</th><th className="num">مقدار کارفرما</th><th>نظر / تصمیم</th></tr></thead>
        <tbody>{approved.map((l) => { const a = l.activityId ? actById.get(l.activityId) : undefined; const d = dec[l.id]; const sup = l.approvedQty ?? l.qty
          return (<tr key={l.id}><td>{a?.title ?? '—'}</td><td className="num">{fa(l.qty, 3)}</td><td className="num">{fa(sup, 3)}</td>
            <td className="num">{l.employerStatus ? <b>{fa(l.employerQty ?? 0, 3)}</b> : '—'}{l.employerStatus && l.employerStatus !== 'approved' && <small className="ex-bad" style={{ display: 'block' }}>{l.employerStatus === 'rejected' ? 'ردشده' : 'بازگردانده'}: {l.employerNote}</small>}{l.employerStatus === 'approved' && (l.employerQty ?? 0) < sup && <small className="ex-warn" style={{ display: 'block' }}>اختلاف با نظارت: {fa(sup - (l.employerQty ?? 0), 3)}</small>}</td>
            <td style={{ minWidth: 280 }}>{canDecide ? (
              <div style={{ display: 'grid', gap: 4 }}>
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button className={`im-btn im-btn-sm${d?.decision === 'approved' ? ' im-btn-primary' : ''}`} onClick={() => set(l.id, { decision: 'approved' }, sup)}><Check size={12} /> تأیید</button>
                  <button className={`im-btn im-btn-sm${d?.decision === 'returned' ? ' im-btn-primary' : ''}`} onClick={() => set(l.id, { decision: 'returned' }, sup)}><CornerUpLeft size={12} /> بازگرداندن</button>
                  <button className={`im-btn im-btn-sm${d?.decision === 'rejected' ? ' im-btn-danger' : ''}`} onClick={() => set(l.id, { decision: 'rejected' }, sup)}><X size={12} /> رد</button>
                </span>
                {d?.decision === 'approved' && <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>مقدار کارفرما: <DecInput value={d.qty} onValue={(n) => set(l.id, { qty: Math.min(n, sup) }, sup)} label="مقدار کارفرما" /></span>}
                {d && d.decision !== 'approved' && <input placeholder="علت (الزامی)" value={d.note} onChange={(e) => set(l.id, { note: e.target.value }, sup)} dir="auto" aria-label="علت" />}
              </div>) : <span className="sub">{l.employerStatus ? '' : 'در انتظار کارفرما'}</span>}</td></tr>) })}</tbody></table></div>
      {canDecide && <div><button className="im-btn im-btn-primary" disabled={busy || needNote || !Object.keys(dec).length} onClick={() => void submit()}>ثبت نظر کارفرما ({fa(Object.keys(dec).length)} ردیف)</button>{needNote && <span className="ex-bad" style={{ marginInlineStart: 10 }}>برای رد یا بازگرداندن، علت را بنویسید.</span>}</div>}
    </div>
  )
}
