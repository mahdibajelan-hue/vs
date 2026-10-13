import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { DecInput } from '../../material/components/control/DecInput'
import { explain } from '../lib/catalog'
import { useInboxStore } from '../store/useInboxStore'

interface Line { id: string; lineNo: number; title: string; unit: string; qty: number; status: string; approvedQty: number | null; where: string; note: string }
type Dec = 'approved' | 'returned' | 'rejected'
const fa = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 3 })

/** Row-by-row review of a daily report straight from the inbox: approve (optionally a smaller quantity), return or reject each pending row. */
export function ExLinesPanel({ reportId }: { reportId: string }) {
  const [lines, setLines] = useState<Line[] | null>(null)
  const [dec, setDec] = useState<Record<string, { d: Dec; qty: number; note: string }>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const refresh = useInboxStore((s) => s.refresh)

  useEffect(() => {
    let live = true
    void (async () => {
      const { data: ls } = await supabase.from('ex_report_lines').select('id,line_no,activity_id,qty,status,approved_qty,km_from,km_to,location,note,detail').eq('report_id', reportId).order('line_no')
      const ids = [...new Set((ls ?? []).map((l) => l.activity_id).filter(Boolean))] as string[]
      const { data: acts } = ids.length ? await supabase.from('ex_activities').select('id,title,unit,item_no,row_no').in('id', ids) : { data: [] }
      const am = new Map((acts ?? []).map((a) => [a.id as string, a]))
      if (!live) return
      const out: Line[] = (ls ?? []).map((l) => {
        const a = l.activity_id ? am.get(l.activity_id as string) : undefined
        const det = (l.detail ?? {}) as Record<string, unknown>
        return { id: l.id as string, lineNo: l.line_no as number, title: a ? `${a.row_no ? a.row_no + ') ' : ''}${a.title}` : String(det.weldNo ?? det.pipeNo ?? `ردیف ${(l.line_no as number) + 1}`), unit: (a?.unit as string) ?? '', qty: Number(l.qty) || 0, status: l.status as string, approvedQty: l.approved_qty == null ? null : Number(l.approved_qty), where: [l.location, l.km_from != null ? `km ${l.km_from}` : ''].filter(Boolean).join(' · '), note: (l.note as string) ?? '' }
      })
      setLines(out)
    })()
    return () => { live = false }
  }, [reportId])

  if (!lines) return <p className="ib-muted">در حال بارگذاری ردیف‌ها…</p>
  const pending = lines.filter((l) => l.status === 'pending')
  const get = (l: Line) => dec[l.id] ?? { d: 'approved' as Dec, qty: l.qty, note: '' }
  const set = (l: Line, p: Partial<{ d: Dec; qty: number; note: string }>) => setDec((m) => ({ ...m, [l.id]: { ...get(l), ...p } }))
  const submit = async () => {
    const decisions = pending.map((l) => { const x = get(l); return { line_id: l.id, decision: x.d, qty: x.d === 'approved' ? x.qty : null, note: x.note } })
    const bad = pending.find((l) => get(l).d !== 'approved' && !get(l).note.trim())
    if (bad) { setMsg(`برای «${bad.title}» علت رد یا بازگرداندن را بنویسید.`); return }
    setBusy(true); setMsg(null)
    const e = explain((await supabase.rpc('ex_report_review', { p_id: reportId, p_decisions: decisions, p_note: note })).error)
    setBusy(false)
    if (e) { setMsg(e); return }
    useInboxStore.getState().select(null); await refresh()
  }
  return (
    <div className="ib-lines">
      <div className="ib-lines-head"><b>ردیف‌های گزارش</b><span className="ib-muted">{fa(pending.length)} ردیف در انتظار · {fa(lines.length - pending.length)} ردیف قبلاً تصمیم‌گیری شده</span></div>
      <div className="ib-tbl-wrap">
        <table className="ib-tbl">
          <thead><tr><th>ردیف</th><th>کارکرد</th><th>تصمیم</th><th>مقدار تأییدی</th><th>توضیح</th></tr></thead>
          <tbody>{lines.map((l) => {
            const p = l.status === 'pending', x = get(l)
            return (
              <tr key={l.id} className={p ? undefined : 'done'}>
                <td><b>{l.title}</b><small>{l.where}{l.note ? ` · ${l.note}` : ''}</small></td>
                <td className="num">{fa(l.qty)} <small>{l.unit}</small></td>
                <td>{p ? <select value={x.d} onChange={(e) => set(l, { d: e.target.value as Dec })} aria-label="تصمیم"><option value="approved">تأیید</option><option value="returned">برگشت</option><option value="rejected">رد</option></select> : <span className={`ib-pill ${l.status}`}>{l.status === 'approved' ? 'تأییدشده' : l.status === 'rejected' ? 'ردشده' : 'برگشتی'}</span>}</td>
                <td className="num">{p ? (x.d === 'approved' ? <DecInput value={x.qty} onValue={(n) => set(l, { qty: n })} label="مقدار تأییدی" /> : '—') : l.approvedQty != null ? fa(l.approvedQty) : '—'}</td>
                <td>{p && x.d !== 'approved' ? <input value={x.note} onChange={(e) => set(l, { note: e.target.value })} placeholder="علت (الزامی)" dir="auto" aria-label="علت" /> : ''}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {pending.length > 0 && (
        <div className="ib-lines-foot">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="نظر کلی دستگاه نظارت (اختیاری)" dir="auto" aria-label="نظر کلی" />
          <button className="ib-btn good" disabled={busy} onClick={() => void submit()}>{busy ? 'در حال ثبت…' : 'ثبت نتیجهٔ بررسی ردیف‌ها'}</button>
        </div>
      )}
      {msg && <p className="ib-err" role="alert">{msg}</p>}
    </div>
  )
}
