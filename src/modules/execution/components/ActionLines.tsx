import { Copy, Trash2 } from 'lucide-react'
import { DecInput } from '../../material/components/control/DecInput'
import { fa, LineStatusChip } from './common'
import type { WorkAction } from '../lib/workActions'

export interface ALine { key: string; location: string; kmFrom: number | null; kmTo: number | null; qty: number; note: string; detail: Record<string, unknown>; status: string; approvedQty: number | null; reviewNote: string }

/** Daily-report rows entered by ACTION: the person picks "welding", "trench excavation" …, writes the quantity in the action's own unit and fills the action's fields. No price-book row is involved here — the statement maps actions to price items later. */
export function ActionLines<T extends ALine>({ rows, actions, locked, editable, cum, onPatch, onDetail, onCopy, onDelete }: {
  rows: T[]; actions: WorkAction[]; locked: (l: T) => boolean; editable: boolean; cum: (actionKey: string, qtyToday: number) => { prev: number; total: number }
  onPatch: (key: string, p: Partial<Pick<ALine, "location" | "kmFrom" | "kmTo" | "qty" | "note">>) => void; onDetail: (key: string, k: string, v: unknown) => void; onCopy: (l: T) => void; onDelete: (key: string) => void
}) {
  const by = new Map(actions.map((a) => [a.key, a]))
  return (
    <table className="ex-lines">
      <thead><tr><th>#</th><th>اقدام</th><th>مشخصات اقدام</th><th>محل / کیلومتر</th><th className="num">مقدار امروز *</th><th>تجمعی</th><th>توضیحات</th><th>وضعیت</th><th /></tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={9} className="fn-empty">هنوز ردیفی نیست. اقدام را از بالا انتخاب کنید.</td></tr> : rows.map((l, i) => {
        const key = String(l.detail.actionKey ?? ''), a = by.get(key), dis = locked(l), c = cum(key, l.qty)
        return (
          <tr key={l.key} className={dis ? 'locked' : undefined}>
            <td>{fa(i + 1)}</td>
            <td style={{ minWidth: 150 }}><b>{String(l.detail.actionTitle ?? a?.title ?? key)}</b><span className="sub">{String(l.detail.actionUnit ?? a?.unit ?? '')}</span></td>
            <td style={{ minWidth: 220 }}><div style={{ display: 'grid', gap: 3 }}>{(a?.fields ?? []).map((f) => f.kind === 'select'
              ? <select key={f.key} disabled={dis} value={String(l.detail[f.key] ?? '')} onChange={(e) => onDetail(l.key, f.key, e.target.value)} aria-label={f.label}><option value="">{f.label}…</option>{f.options?.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : f.kind === 'num' ? <DecInput key={f.key} value={Number(l.detail[f.key]) || 0} onValue={(n) => !dis && onDetail(l.key, f.key, n || '')} label={f.label} placeholder={f.label} />
              : <input key={f.key} disabled={dis} value={String(l.detail[f.key] ?? '')} onChange={(e) => onDetail(l.key, f.key, e.target.value)} placeholder={f.label} aria-label={f.label} dir="auto" />)}
              {!a && <span className="ex-warn">این اقدام دیگر در فهرست اقدام‌های پروژه نیست.</span>}</div></td>
            <td style={{ minWidth: 190 }}><div style={{ display: 'grid', gap: 3 }}><input disabled={dis} placeholder="محل دقیق" value={l.location} onChange={(e) => onPatch(l.key, { location: e.target.value })} dir="auto" aria-label="محل" />
              <span style={{ display: 'flex', gap: 3 }}><DecInput className="" value={l.kmFrom ?? 0} onValue={(n) => !dis && onPatch(l.key, { kmFrom: n || null })} label="از کیلومتر" placeholder="از km" /><DecInput className="" value={l.kmTo ?? 0} onValue={(n) => !dis && onPatch(l.key, { kmTo: n || null })} label="تا کیلومتر" placeholder="تا km" /></span></div></td>
            <td className="num" style={{ minWidth: 100 }}>{dis ? <b>{fa(l.qty, 3)}</b> : <DecInput value={l.qty} onValue={(n) => onPatch(l.key, { qty: n })} label="مقدار امروز" />}{l.status === 'approved' && l.approvedQty != null && l.approvedQty !== l.qty && <small className="ex-warn" style={{ display: 'block' }}>تأییدشده: {fa(l.approvedQty, 3)}</small>}</td>
            <td style={{ minWidth: 130 }}><div className="ex-cum"><span>تا روز قبل: <b>{fa(c.prev, 2)}</b></span><span>تجمعی جدید: <b>{fa(c.total, 2)}</b></span></div></td>
            <td style={{ minWidth: 140 }}><input disabled={dis} value={l.note} onChange={(e) => onPatch(l.key, { note: e.target.value })} dir="auto" aria-label="توضیح" /></td>
            <td style={{ minWidth: 100 }}><LineStatusChip status={l.status as never} />{l.reviewNote && <small className="sub">{l.reviewNote}</small>}</td>
            <td style={{ whiteSpace: 'nowrap' }}>{editable && l.status !== 'approved' && <><button className="im-btn im-btn-sm" aria-label="کپی ردیف" onClick={() => onCopy(l)}><Copy size={12} /></button> <button className="im-btn im-btn-sm" aria-label="حذف ردیف" onClick={() => onDelete(l.key)}><Trash2 size={12} /></button></>}</td>
          </tr>
        )
      })}</tbody>
    </table>
  )
}
