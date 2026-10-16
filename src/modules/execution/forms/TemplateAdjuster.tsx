import { useMemo, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Redo2, Save, Undo2, WrapText } from 'lucide-react'
import { GridSheet } from './GridTemplate'
import { LIMITS, scaleCols, scaleRows, setColWidth, setRowHeight, styleCells, type Scope, type StylePatch } from './gridAdjust'
import { type CellBinding, type GridTemplate } from './gridTypes'

const parse = (a: string): [number, number] => { const m = /^([A-Z]+)(\d+)$/.exec(a)!; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return [Number(m[2]) - 1, c - 1] }
const SCOPES: { v: Scope; t: string }[] = [{ v: 'cell', t: 'همین سلول' }, { v: 'row', t: 'کل ردیف' }, { v: 'col', t: 'کل ستون' }, { v: 'all', t: 'کل فرم' }]

/** View a registered sheet exactly as frozen, and — when allowed — make small look-only changes (row heights, column widths, alignment, font size / weight, wrapping). The result is saved as a NEW draft version; it still has to be approved and its mapping confirmed. Mapped cells are highlighted. */
export function TemplateAdjuster({ base, bindings, fromVersion, canEdit, slots = [], onSave }: { base: GridTemplate; bindings: CellBinding[]; fromVersion: number | null; canEdit: boolean; /** signature slots of this form: a signature box cell can be bound to one */ slots?: { slotKey: string; label: string }[]; onSave: (layout: GridTemplate, bindings: CellBinding[]) => Promise<boolean> }) {
  const [hist, setHist] = useState<GridTemplate[]>([base])
  const [at, setAt] = useState(0) // index of the working copy in hist
  const [sel, setSel] = useState<string>('')
  const [scope, setScope] = useState<Scope>('cell')
  const [zoom, setZoom] = useState(0.8)
  const [busy, setBusy] = useState(false)
  const work = hist[at]
  const [bnd, setBnd] = useState<CellBinding[]>(bindings)
  const [slot, setSlot] = useState('')
  const mark = useMemo(() => new Set(bnd.map((b) => b.cell)), [bnd])
  const [r, c] = sel ? parse(sel) : [-1, -1]
  const cell = sel ? work.cells.find((x) => x.r === r && x.c === c) : undefined
  const st = cell ? work.styles[cell.s] : undefined
  const push = (t: GridTemplate) => { if (t === work) return; setHist([...hist.slice(0, at + 1), t]); setAt(at + 1) }
  const style = (p: StylePatch) => { if (sel) push(styleCells(work, scope, [r, c], p)) }
  const bindingsChanged = JSON.stringify(bnd) !== JSON.stringify(bindings)
  const dirty = at > 0 || bindingsChanged
  const num = (v: string, d: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d }
  const btn = (on: boolean) => ({ className: `im-btn im-btn-sm${on ? ' im-btn-primary' : ''}`, disabled: !canEdit || !sel })
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="im-helper">بزرگ‌نمایی <input type="range" min={0.4} max={1.4} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /> {Math.round(zoom * 100)}٪</label>
        <span className="im-helper">سلول‌های زردرنگ به داده نگاشت شده‌اند. {canEdit ? 'برای اصلاح، یک سلول را انتخاب کنید.' : 'برای اصلاح ظاهر، دسترسی تنظیمات لازم است.'}</span>
      </div>
      {canEdit && (
        <div className="no-print im-card" style={{ display: 'grid', gap: 8, padding: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="im-helper">{sel ? <>انتخاب: <b dir="ltr">{sel}</b> — اعمال روی</> : 'سلولی انتخاب نشده — اعمال روی'}</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="دامنهٔ اعمال">{SCOPES.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}</select>
            <button {...btn(st?.a[0] === 'right')} onClick={() => style({ h: 'right' })} aria-label="راست‌چین"><AlignRight size={14} /></button>
            <button {...btn(st?.a[0] === 'center')} onClick={() => style({ h: 'center' })} aria-label="وسط‌چین"><AlignCenter size={14} /></button>
            <button {...btn(st?.a[0] === 'left')} onClick={() => style({ h: 'left' })} aria-label="چپ‌چین"><AlignLeft size={14} /></button>
            <select disabled={!sel} value="" onChange={(e) => e.target.value && style({ v: e.target.value as 'top' | 'center' | 'bottom' })} aria-label="تراز عمودی"><option value="">تراز عمودی…</option><option value="top">بالا</option><option value="center">وسط</option><option value="bottom">پایین</option></select>
            <button {...btn(!!st?.f[2])} onClick={() => style({ bold: !st?.f[2] })} aria-label="ضخیم"><Bold size={14} /></button>
            <button {...btn(!!st?.a[2])} onClick={() => style({ wrap: !st?.a[2] })} aria-label="شکستن خط"><WrapText size={14} /></button>
            <button {...btn(false)} onClick={() => style({ sizeDelta: -1 })}>A−</button>
            <button {...btn(false)} onClick={() => style({ sizeDelta: 1 })}>A+</button>
            <label className="im-helper">فونت <input type="number" step={0.5} min={LIMITS.font[0]} max={LIMITS.font[1]} disabled={!sel} value={st?.f[1] ?? ''} onChange={(e) => style({ size: num(e.target.value, st?.f[1] ?? 11) })} style={{ width: 62 }} /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="im-helper">ارتفاع ردیف {sel ? r + 1 : ''} <input type="number" min={LIMITS.row[0]} max={LIMITS.row[1]} disabled={!sel} value={sel ? Math.round(work.rows[r]?.h ?? 0) : ''} onChange={(e) => sel && push(setRowHeight(work, [r], num(e.target.value, work.rows[r].h)))} style={{ width: 70 }} /></label>
            <label className="im-helper">عرض ستون {sel ? c + 1 : ''} <input type="number" min={LIMITS.col[0]} max={LIMITS.col[1]} disabled={!sel} value={sel ? Math.round(work.cols[c]?.w ?? 0) : ''} onChange={(e) => sel && push(setColWidth(work, [c], num(e.target.value, work.cols[c].w)))} style={{ width: 70 }} /></label>
            <button className="im-btn im-btn-sm" onClick={() => push(scaleRows(work, 110))}>ردیف‌ها +۱۰٪</button>
            <button className="im-btn im-btn-sm" onClick={() => push(scaleRows(work, 90))}>ردیف‌ها −۱۰٪</button>
            <button className="im-btn im-btn-sm" onClick={() => push(scaleCols(work, 110))}>ستون‌ها +۱۰٪</button>
            <button className="im-btn im-btn-sm" onClick={() => push(scaleCols(work, 90))}>ستون‌ها −۱۰٪</button>
            <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
              <button className="im-btn im-btn-sm" disabled={at === 0} onClick={() => setAt(at - 1)} aria-label="بازگردانی"><Undo2 size={14} /></button>
              <button className="im-btn im-btn-sm" disabled={at >= hist.length - 1} onClick={() => setAt(at + 1)} aria-label="از نو"><Redo2 size={14} /></button>
              <button className="im-btn im-btn-sm" disabled={!dirty} onClick={() => { setHist([base]); setAt(0); setBnd(bindings) }}>برگشت به نسخهٔ پایه</button>
              <button className="im-btn im-btn-primary im-btn-sm" disabled={!dirty || busy} onClick={async () => {
                if (!window.confirm('اصلاحات به‌صورت یک نسخهٔ پیش‌نویس جدید ثبت می‌شود؛ متن و ادغام سلول‌ها تغییر نمی‌کند. بعد از ثبت باید نسخه را تأیید و نگاشت را تأیید کنید. ادامه؟')) return
                setBusy(true); const ok = await onSave({ ...work, adjusted: { fromVersion, ops: [...(work.adjusted?.ops ?? []), ...(bindingsChanged ? ['اتصال جعبه‌های امضا'] : [])] } }, bnd); setBusy(false); if (ok) { setHist([base]); setAt(0); setSel('') }
              }}><Save size={13} /> ثبت به‌عنوان نسخهٔ پیش‌نویس جدید</button>
            </span>
          </div>
          {slots.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="im-helper">جعبهٔ امضا:</span>
              <select value={slot} onChange={(e) => setSlot(e.target.value)} aria-label="جایگاه امضا"><option value="">جایگاه امضا…</option>{slots.map((x) => <option key={x.slotKey} value={x.slotKey}>{x.label}</option>)}</select>
              <button className="im-btn im-btn-sm" disabled={!sel || !slot} onClick={() => setBnd((b) => [...b.filter((x) => x.cell !== sel && x.source !== `sign:${slot}`), { cell: sel, source: `sign:${slot}`, mode: 'replace', note: `امضای الکترونیکی: ${slots.find((x) => x.slotKey === slot)?.label ?? slot}` }])}>اتصال امضا به خانهٔ انتخاب‌شده</button>
              {bnd.filter((x) => x.source.startsWith('sign:')).map((x) => <Chip2 key={x.cell} text={`${x.cell} ← ${slots.find((s) => `sign:${s.slotKey}` === x.source)?.label ?? x.source}`} onRemove={() => setBnd((b) => b.filter((y) => y !== x))} />)}
            </div>
          )}
          {dirty && <details><summary className="im-helper">{work.adjusted?.ops.length} اصلاح انجام‌شده</summary><ol style={{ margin: '4px 0', paddingInlineStart: 20 }}>{work.adjusted?.ops.map((o, i) => <li key={i} className="im-helper">{o}</li>)}</ol></details>}
        </div>
      )}
      <div style={{ overflow: 'auto', maxHeight: 560, border: '1px solid var(--im-line, #e2e8f0)', borderRadius: 8, background: '#f1f5f9', padding: 8 }}>
        <div style={{ zoom, width: 'fit-content' }}>
          <GridSheet tpl={work} mark={mark} selected={sel} onCell={canEdit ? (a) => setSel(a) : undefined} />
        </div>
      </div>
    </div>
  )
}

const Chip2 = ({ text, onRemove }: { text: string; onRemove: () => void }) => <span className="im-chip" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }} dir="auto">{text}<button className="im-btn im-btn-sm" aria-label="حذف اتصال" onClick={onRemove}>×</button></span>
