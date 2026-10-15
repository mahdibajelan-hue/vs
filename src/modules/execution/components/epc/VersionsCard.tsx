import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { useEpcStore } from '../../store/useEpcStore'
import { REPORT_STATUS_LABEL_FA, type ReportStatus } from '../../types'
import { fa } from '../common'

type SnapLine = { id: string; line_no: number; activity_id: string | null; qty: number; approved_qty: number | null; status: string; employer_qty?: number | null }
/** Every status change keeps a snapshot; the first «ارسال‌شده» version is the contractor's original, so later changes by the supervision can always be compared with it. */
export function VersionsCard({ reportId, actTitle, people }: { reportId: string; actTitle: (id: string | null) => string; people: Map<string, string> }) {
  const available = useEpcStore((s) => s.available)
  const all = useEpcStore((s) => s.versions)
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<number | null>(null)
  useEffect(() => { if (open && available) void useEpcStore.getState().loadVersions(reportId) }, [open, available, reportId])
  if (!available) return null
  const vs = all.filter((v) => v.reportId === reportId).sort((a, b) => a.version - b.version)
  const first = vs.find((v) => v.status === 'submitted')
  const cur = vs.find((v) => v.version === pick) ?? vs[vs.length - 1]
  const linesOf = (v?: (typeof vs)[number]): SnapLine[] => ((v?.snapshot as { lines?: SnapLine[] } | undefined)?.lines ?? [])
  const orig = new Map(linesOf(first).map((l) => [l.id, l]))
  return (
    <div className="im-card" style={{ padding: 14 }}>
      <button className="im-btn im-btn-sm" onClick={() => setOpen(!open)}><History size={13} /> نسخه‌های گزارش و مقایسه با اعلام اولیهٔ پیمانکار</button>
      {open && (vs.length === 0 ? <p className="im-helper">نسخه‌ای ثبت نشده است (نسخه با هر تغییر وضعیت ساخته می‌شود).</p> : (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div className="ex-chiprow">{vs.map((v) => <button key={v.id} className={`mt-pill${cur?.version === v.version ? ' on' : ''}`} onClick={() => setPick(v.version)}>نسخهٔ {fa(v.version)} · {REPORT_STATUS_LABEL_FA[v.status as ReportStatus] ?? v.status}</button>)}</div>
          {cur && <small className="ex-hist">{new Date(cur.at).toLocaleString('fa-IR')} · {people.get(cur.actor ?? '') ?? '—'}</small>}
          <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>فعالیت</th><th className="num">اعلام اولیهٔ پیمانکار</th><th className="num">در این نسخه</th><th className="num">تأیید نظارت</th>{linesOf(cur).some((l) => l.employer_qty != null) && <th className="num">کارفرما</th>}<th>وضعیت ردیف</th></tr></thead>
            <tbody>{linesOf(cur).map((l) => { const o = orig.get(l.id); return <tr key={l.id}><td>{actTitle(l.activity_id)}</td><td className="num">{o ? fa(o.qty, 3) : '—'}</td><td className="num">{fa(l.qty, 3)}{o && o.qty !== l.qty && <small className="ex-warn" style={{ display: 'block' }}>تغییر یافته</small>}</td><td className="num">{l.approved_qty == null ? '—' : fa(l.approved_qty, 3)}</td>{linesOf(cur).some((x) => x.employer_qty != null) && <td className="num">{l.employer_qty == null ? '—' : fa(l.employer_qty, 3)}</td>}<td>{l.status}</td></tr> })}</tbody></table></div>
        </div>))}
    </div>
  )
}
