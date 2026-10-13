import { Plus, Trash2 } from 'lucide-react'
import { DecInput } from '../../material/components/control/DecInput'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { fa } from './common'

export interface NextDayRow { op: string; kmFrom: number; kmTo: number; unit: string; qty: number; crew: string; note: string }
export interface NextDay { date: string; hours: number; condition: string; rows: NextDayRow[] }
export const NEXT_DAY_OPS = ['نقشه‌برداری', 'مسیرسازی', 'تسطیح و اصلاح مسیر دسترسی', 'حفاری کانال', 'اصلاح و رگلاژ کانال', 'حمل و ریسه لوله', 'خمکاری', 'جوشکاری اتصال نهایی', 'تعمیرات جوشکاری', 'رادیوگرافی', 'سندبلاست و عایق‌کاری', 'لوله‌گذاری', 'بکفیل و گرده‌ماهی', 'خاک سرندی', 'فیبر نوری', 'تقاطعات CCW / CAS / UG.Casing', 'نصب دیوار بتنی پیش‌ساخته', 'تست هیدرواستاتیک', 'مکانیکال ایستگاه', 'سیویل ایستگاه']
export const EMPTY_NEXT: NextDay = { date: '', hours: 0, condition: '', rows: [] }
export const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])
export const asNext = (v: unknown): NextDay => { const o = (v && typeof v === 'object' ? v : {}) as Partial<NextDay>; return { date: o.date ?? '', hours: Number(o.hours) || 0, condition: o.condition ?? '', rows: Array.isArray(o.rows) ? o.rows : [] } }

/** Numbered free-text lines of the paper sheet: «شرح عملیات» (up to 12) and «موانع و مشکلات» (up to 3+). */
export function NumberedLines({ title, hint, value, max, editable, onChange }: { title: string; hint?: string; value: string[]; max: number; editable: boolean; onChange: (v: string[]) => void }) {
  const rows = editable ? [...value, ...Array(Math.max(0, Math.min(max, value.length + 1) - value.length)).fill('')] : value.filter((x) => x.trim())
  const set = (i: number, t: string) => { const n = [...value]; while (n.length <= i) n.push(''); n[i] = t; while (n.length && !n[n.length - 1].trim()) n.pop(); onChange(n) }
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <b>{title}</b>{hint && <span className="im-helper" style={{ margin: 0 }}>{hint}</span>}
      {rows.length === 0 && <span className="im-helper" style={{ margin: 0 }}>—</span>}
      {rows.map((t, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 6, alignItems: 'center' }}><span className="sub" style={{ textAlign: 'center' }}>{fa(i + 1)}</span>{editable ? <input value={t} onChange={(e) => set(i, e.target.value)} dir="auto" aria-label={`${title} ${i + 1}`} /> : <span>{t}</span>}</div>)}
      {editable && value.length >= max && <span className="im-helper" style={{ margin: 0 }}>حداکثر {fa(max)} ردیف</span>}
    </div>
  )
}

/** «گزارش پیش‌بینی عملیات اجرایی روز آینده» — what is planned for tomorrow, by operation type, kilometre range, quantity and crew. */
export function NextDayPlan({ value, editable, onChange }: { value: NextDay; editable: boolean; onChange: (v: NextDay) => void }) {
  const set = (p: Partial<NextDay>) => onChange({ ...value, ...p })
  const patch = (i: number, p: Partial<NextDayRow>) => set({ rows: value.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) })
  return (
    <div className="im-card" style={{ padding: 14, display: 'grid', gap: 10 }}>
      <b>پیش‌بینی عملیات اجرایی روز آینده</b>
      <div className="ex-sheet-grid">
        <label>تاریخ پیش‌بینی<JalaliDateInput value={value.date} onChange={(x) => editable && set({ date: x })} /></label>
        <label>جمع ساعت کار<DecInput value={value.hours} onValue={(n) => editable && set({ hours: n })} label="جمع ساعت کار پیش‌بینی" /></label>
        <label className="wide">شرط اجرا<input disabled={!editable} value={value.condition} onChange={(e) => set({ condition: e.target.value })} placeholder="مثلاً: عملیات برنامه‌ریزی‌شده در صورت مساعد بودن شرایط جوی" dir="auto" /></label>
      </div>
      {(value.rows.length > 0 || editable) && (
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
          <table className="ex-lines">
            <thead><tr><th>نوع عملیات</th><th>کیلومتراژ از</th><th>تا</th><th>واحد</th><th className="num">مقدار</th><th>نفر / اکیپ اجرا</th><th>ملاحظات</th><th /></tr></thead>
            <tbody>
              {value.rows.length === 0 && <tr><td colSpan={8} className="fn-empty">هنوز ردیفی نیست.</td></tr>}
              {value.rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 170 }}><input disabled={!editable} list="ex-next-ops" value={r.op} onChange={(e) => patch(i, { op: e.target.value })} dir="auto" aria-label="نوع عملیات" /></td>
                  <td style={{ width: 90 }}><DecInput value={r.kmFrom} onValue={(n) => editable && patch(i, { kmFrom: n })} label="کیلومتر از" /></td>
                  <td style={{ width: 90 }}><DecInput value={r.kmTo} onValue={(n) => editable && patch(i, { kmTo: n })} label="کیلومتر تا" /></td>
                  <td style={{ width: 80 }}><input disabled={!editable} value={r.unit} onChange={(e) => patch(i, { unit: e.target.value })} aria-label="واحد" dir="auto" /></td>
                  <td className="num" style={{ width: 100 }}><DecInput value={r.qty} onValue={(n) => editable && patch(i, { qty: n })} label="مقدار" /></td>
                  <td style={{ minWidth: 120 }}><input disabled={!editable} value={r.crew} onChange={(e) => patch(i, { crew: e.target.value })} aria-label="اکیپ" dir="auto" /></td>
                  <td style={{ minWidth: 120 }}><input disabled={!editable} value={r.note} onChange={(e) => patch(i, { note: e.target.value })} aria-label="ملاحظات" dir="auto" /></td>
                  <td>{editable && <button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => set({ rows: value.rows.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="ex-next-ops">{NEXT_DAY_OPS.map((o) => <option key={o} value={o} />)}</datalist>
        </div>
      )}
      {editable && <button className="im-btn im-btn-sm" style={{ justifySelf: 'start' }} onClick={() => set({ rows: [...value.rows, { op: '', kmFrom: 0, kmTo: 0, unit: 'متر', qty: 0, crew: '', note: '' }] })}><Plus size={13} /> افزودن عملیات</button>}
    </div>
  )
}
