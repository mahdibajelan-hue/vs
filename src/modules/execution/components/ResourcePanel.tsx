import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ClipboardCopy, Plus, Trash2 } from 'lucide-react'
import { DecInput } from '../../material/components/control/DecInput'
import { EQUIP_CATALOG, EQUIP_COLS, MAN_CATALOG, MAN_COLS, blankRes, resProblem, resUsed, type ResField, type ResRow } from '../lib/resourceCatalog'
import { fa } from './common'

type Cols = readonly (readonly [ResField, string])[]
const sum = (rows: ResRow[], f: ResField) => rows.reduce((s, r) => s + r[f], 0)

/**
 * Manpower / machinery list of the daily report, grouped by work section like the contractor's paper sheet:
 * manpower — total, active, leave, stopped, native, non-native; machinery — total, active, inactive, stopped, repair.
 */
export function ResourcePanel({ rows, editable, onChange, onCopyLast, lastLabel }: { rows: ResRow[]; editable: boolean; onChange: (next: ResRow[]) => void; onCopyLast?: () => void; lastLabel?: string }) {
  const [kind, setKind] = useState<'man' | 'equip'>('man')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState<{ section: string; name: string } | null>(null)
  const cols: Cols = kind === 'man' ? MAN_COLS : EQUIP_COLS
  const mine = rows.map((r, i) => ({ r, i })).filter((x) => x.r.kind === kind)
  const sections = useMemo(() => { const m = new Map<string, { r: ResRow; i: number }[]>(); for (const x of mine) { const a = m.get(x.r.section) ?? []; a.push(x); m.set(x.r.section, a) } return [...m.entries()] }, [mine])
  const patch = (i: number, f: ResField, v: number) => onChange(rows.map((r, j) => (j === i ? { ...r, [f]: v } : r)))
  const totals = (list: ResRow[]) => cols.map(([f]) => sum(list, f))
  const all = mine.map((x) => x.r)
  const used = all.filter(resUsed).length
  const problems = all.filter((r) => resUsed(r) && resProblem(r)).length
  const isOpen = (s: string, list: { r: ResRow }[]) => open.has(s) || !!q || (!open.has('!' + s) && list.some((x) => resUsed(x.r)))
  const toggle = (s: string, list: { r: ResRow }[]) => setOpen((o) => { const n = new Set(o); if (isOpen(s, list)) { n.delete(s); n.add('!' + s) } else { n.add(s); n.delete('!' + s) } return n })

  return (
    <div className="im-card" style={{ padding: 0 }}>
      <div className="mt-filters no-print" style={{ padding: '10px 14px' }}>
        <b>لیست نیروی انسانی و ماشین‌آلات</b>
        <span className="ex-seg" role="tablist">
          <button role="tab" aria-selected={kind === 'man'} className={kind === 'man' ? 'on' : ''} onClick={() => setKind('man')}>نیروی انسانی</button>
          <button role="tab" aria-selected={kind === 'equip'} className={kind === 'equip' ? 'on' : ''} onClick={() => setKind('equip')}>ماشین‌آلات و تجهیزات</button>
        </span>
        <input placeholder="جست‌وجوی عنوان…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 150 }} aria-label="جست‌وجو" />
        <span className="im-helper" style={{ margin: 0 }}>{fa(used)} ردیف دارای مقدار{problems > 0 && <b className="ex-bad"> · {fa(problems)} ردیف ناسازگار</b>}</span>
        {editable && onCopyLast && <button className="im-btn im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={onCopyLast} title="فهرست و مقدارهای آخرین گزارش روزانهٔ همین جبهه را وارد می‌کند"><ClipboardCopy size={13} /> کپی از {lastLabel || 'آخرین گزارش'}</button>}
      </div>
      <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}>
        <table className="ex-lines ex-resv">
          <thead><tr><th>{kind === 'man' ? 'نیروی انسانی' : 'تجهیزات'}</th>{cols.map(([f, l]) => <th key={f} className="num">{l}</th>)}<th /></tr></thead>
          <tbody>
            {sections.map(([section, list]) => {
              const shown = list.filter((x) => (!q || x.r.name.includes(q) || section.includes(q)) && (editable || resUsed(x.r)))
              if (!shown.length && !editable) return null
              if (q && !shown.length) return null
              const op = isOpen(section, list)
              const t = totals(list.map((x) => x.r))
              return [
                <tr key={'h' + section} className="ex-sec" onClick={() => toggle(section, list)}>
                  <td><button type="button" className="ex-sec-btn" aria-expanded={op}>{op ? <ChevronDown size={14} /> : <ChevronLeft size={14} />} {section}</button></td>
                  {t.map((v, i) => <td key={i} className="num"><b>{v ? fa(v) : '·'}</b></td>)}<td />
                </tr>,
                ...(op ? shown.map(({ r, i }) => {
                  const pr = resUsed(r) ? resProblem(r) : ''
                  return (
                    <tr key={`${section}|${r.name}|${i}`} className={pr ? 'ex-row-bad' : undefined}>
                      <td style={{ paddingInlineStart: 24 }}>{r.name}{pr && <small className="ex-bad" style={{ display: 'block' }}>{pr}</small>}</td>
                      {cols.map(([f]) => <td key={f} className="num" style={{ width: 74 }}>{editable ? <DecInput value={r[f]} onValue={(n) => patch(i, f, n)} label={`${r.name} — ${cols.find((c) => c[0] === f)?.[1]}`} /> : fa(r[f])}</td>)}
                      <td>{editable && !resUsed(r) && !isCatalog(r) && <button className="im-btn im-btn-sm" aria-label="حذف ردیف" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={12} /></button>}</td>
                    </tr>
                  )
                }) : []),
                ...(op && editable ? [<tr key={'a' + section}><td colSpan={cols.length + 2} style={{ paddingInlineStart: 24 }}>
                  {adding?.section === section
                    ? <span style={{ display: 'flex', gap: 4 }}><input autoFocus placeholder={kind === 'man' ? 'عنوان شغل…' : 'نام تجهیز…'} value={adding.name} onChange={(e) => setAdding({ section, name: e.target.value })} dir="auto" style={{ flex: 1 }} /><button className="im-btn im-btn-sm im-btn-primary" disabled={!adding.name.trim()} onClick={() => { onChange([...rows, blankRes(kind, section, adding.name.trim())]); setAdding(null) }}>افزودن</button><button className="im-btn im-btn-sm" onClick={() => setAdding(null)}>انصراف</button></span>
                    : <button className="im-btn im-btn-sm" onClick={() => setAdding({ section, name: '' })}><Plus size={12} /> ردیف جدید در «{section}»</button>}
                </td></tr>] : []),
              ]
            })}
            <tr className="ex-total"><td><b>جمع کل</b></td>{totals(all).map((v, i) => <td key={i} className="num"><b>{fa(v)}</b></td>)}<td /></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const cat = new Set([...MAN_CATALOG.flatMap((s) => s.items.map((n) => `man|${s.section}|${n}`)), ...EQUIP_CATALOG.flatMap((s) => s.items.map((n) => `equip|${s.section}|${n}`))])
const isCatalog = (r: ResRow) => cat.has(`${r.kind}|${r.section}|${r.name}`)
