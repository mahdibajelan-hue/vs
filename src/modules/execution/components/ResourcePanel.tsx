import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronLeft, ClipboardCopy, Minus, Plus, Search, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { DecInput } from '../../material/components/control/DecInput'
import { iconForRole, iconForSection, Truck, Users } from '../lib/resIcons'
import { EQUIP_CATALOG, EQUIP_COLS, MAN_CATALOG, MAN_COLS, blankRes, resProblem, resUsed, type ResField, type ResRow } from '../lib/resourceCatalog'
import { fa } from './common'

type Cols = readonly (readonly [ResField, string])[]
const sum = (rows: ResRow[], f: ResField) => rows.reduce((s, r) => s + r[f], 0)
const key = (r: Pick<ResRow, 'kind' | 'section' | 'name'>) => `${r.kind}|${r.section}|${r.name}`
const sig = (r: ResRow | undefined) => (r ? [r.totalQty, r.activeQty, r.idleQty, r.leaveQty, r.stoppedQty, r.repairQty].join(',') : '0,0,0,0,0,0')
const cat = new Set([...MAN_CATALOG.flatMap((s) => s.items.map((n) => `man|${s.section}|${n}`)), ...EQUIP_CATALOG.flatMap((s) => s.items.map((n) => `equip|${s.section}|${n}`))])
const isCatalog = (r: ResRow) => cat.has(key(r))

/**
 * Manpower / machinery of the day. The standing roster is carried over from the previous report, so the day's work is only the CHANGES:
 * a summary with icons, the list of what differs from yesterday, and the full grouped list (collapsed) for editing.
 */
export function ResourcePanel({ rows, editable, onChange, baseline, baselineLabel, onCopyLast }: { rows: ResRow[]; editable: boolean; onChange: (next: ResRow[]) => void; baseline: ResRow[] | null; baselineLabel?: string; onCopyLast?: () => void }) {
  const [kind, setKind] = useState<'man' | 'equip'>('man')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState<{ section: string; name: string } | null>(null)
  const cols: Cols = kind === 'man' ? MAN_COLS : EQUIP_COLS
  const base = useMemo(() => new Map((baseline ?? []).map((r) => [key(r), r])), [baseline])
  const idx = useMemo(() => rows.map((r, i) => ({ r, i })), [rows])

  const stats = (k: 'man' | 'equip') => { const l = rows.filter((r) => r.kind === k); const b = (baseline ?? []).filter((r) => r.kind === k); return { total: sum(l, 'totalQty'), active: sum(l, 'activeQty'), idle: k === 'man' ? sum(l, 'leaveQty') : sum(l, 'idleQty'), stopped: sum(l, 'stoppedQty'), prevTotal: sum(b, 'totalQty'), prevActive: sum(b, 'activeQty') } }
  const sm = stats('man'), se = stats('equip')
  const changed = useMemo(() => idx.filter(({ r }) => baseline && sig(r) !== sig(base.get(key(r)))).map(({ r, i }) => ({ r, i, prev: base.get(key(r)) })), [idx, baseline, base])
  const mine = idx.filter((x) => x.r.kind === kind)
  const sections = useMemo(() => { const m = new Map<string, { r: ResRow; i: number }[]>(); for (const x of mine) { const a = m.get(x.r.section) ?? []; a.push(x); m.set(x.r.section, a) } return [...m.entries()] }, [mine])
  const patch = (i: number, f: ResField, v: number) => onChange(rows.map((r, j) => (j === i ? { ...r, [f]: v } : r)))
  const bump = (i: number, f: ResField, d: number) => { const r = rows[i]; const v = Math.max(0, r[f] + d); onChange(rows.map((x, j) => (j === i ? { ...x, [f]: v, ...(f === 'totalQty' && d > 0 && x.activeQty === x.totalQty ? { activeQty: v } : {}), ...(f === 'totalQty' && d < 0 && x.activeQty > v ? { activeQty: v } : {}) } : x))) }
  const problems = rows.filter((r) => resUsed(r) && resProblem(r)).length
  const toggle = (s: string) => setOpen((o) => { const n = new Set(o); if (n.has(s)) n.delete(s); else n.add(s); return n })
  const delta = (a: number, b: number) => (b === 0 && a === 0 ? null : a - b)

  const tile = (k: 'man' | 'equip', x: ReturnType<typeof stats>, color: string) => {
    const d = baseline ? delta(x.active, x.prevActive) : null
    const I = k === 'man' ? Users : Truck
    return (
      <button key={k} type="button" className={`rp-tile${kind === k ? ' on' : ''}`} style={{ ['--c' as string]: color }} onClick={() => setKind(k)} aria-pressed={kind === k}>
        <span className="rp-tile-ico"><I size={22} strokeWidth={1.8} /></span>
        <span className="rp-tile-main"><small>{k === 'man' ? 'نیروی انسانی فعال' : 'ماشین‌آلات فعال'}</small><b>{fa(x.active)}<em> از {fa(x.total)}</em></b></span>
        <span className="rp-tile-side">
          {x.idle > 0 && <small>{k === 'man' ? 'مرخصی' : 'غیرفعال'} {fa(x.idle)}</small>}
          {x.stopped > 0 && <small>متوقف {fa(x.stopped)}</small>}
          {d != null && d !== 0 && <small className={d > 0 ? 'up' : 'down'}>{d > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{d > 0 ? '+' : '−'}{fa(Math.abs(d))} نسبت به قبل</small>}
        </span>
      </button>
    )
  }

  return (
    <div className="im-card rp" style={{ padding: 0 }}>
      <div className="rp-head">
        <div className="rp-tiles">{tile('man', sm, '#38bdf8')}{tile('equip', se, '#f97316')}</div>
        {editable && onCopyLast && <button className="im-btn im-btn-sm" onClick={onCopyLast} title="فهرست و مقدارهای آخرین گزارش همین جبهه را جایگزین می‌کند"><ClipboardCopy size={13} /> {baselineLabel ? `مثل ${baselineLabel}` : 'مثل گزارش قبلی'}</button>}
      </div>

      <div className="rp-changes" aria-live="polite">
        {baseline == null
          ? <p className="rp-hint">گزارش قبلی برای مقایسه نیست؛ مقدارها را برای اولین بار وارد کنید — از فردا فقط تغییرات را ثبت می‌کنید.</p>
          : changed.length === 0
            ? <p className="rp-hint ok">✅ مثل {baselineLabel || 'گزارش قبلی'} — تغییری ثبت نشده است. اگر چیزی تغییر کرده، از لیست زیر (بخش مربوط را باز کنید) اصلاح کنید.</p>
            : <><b className="rp-ch-title">تغییرات نسبت به {baselineLabel || 'گزارش قبلی'} ({fa(changed.length)})</b>
              <div className="rp-chips">{changed.map(({ r, i, prev }) => { const I = iconForRole(r.name, r.kind); const a = prev?.activeQty ?? 0; const t = prev?.totalQty ?? 0; return (
                <button key={key(r) + i} className="rp-chip" onClick={() => { setKind(r.kind); setOpen((o) => new Set(o).add(r.section)) }} title={`${r.section} — ${r.name}`}>
                  <I size={14} /><span>{r.name}</span>
                  <em>{r.totalQty !== t ? `کل ${fa(t)}←${fa(r.totalQty)}` : `فعال ${fa(a)}←${fa(r.activeQty)}`}</em>
                </button>) })}</div></>}
        {problems > 0 && <p className="rp-hint bad">{fa(problems)} ردیف ناسازگار دارد (مجموع اجزا از تعداد کل بیشتر است).</p>}
      </div>

      <div className="rp-bar no-print">
        <label className="rp-search"><Search size={13} /><input placeholder="جست‌وجوی شغل یا تجهیز…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجو" /></label>
        <span className="rp-bar-note">{kind === 'man' ? 'نیروی انسانی' : 'ماشین‌آلات و تجهیزات'} — بخش را باز کنید و فقط ردیف تغییرکرده را اصلاح کنید</span>
      </div>

      <div className="rp-secs" data-kind={kind}>
        {sections.map(([section, list]) => {
          const used = list.filter((x) => resUsed(x.r)), unused = list.filter((x) => !resUsed(x.r))
          const hit = (x: { r: ResRow }) => !q || x.r.name.includes(q) || section.includes(q)
          const shownUsed = used.filter(hit), shownUnused = unused.filter(hit)
          if (q && !shownUsed.length && !shownUnused.length) return null
          if (!editable && !used.length) return null
          const op = open.has(section) || !!q
          const SI = iconForSection(section)
          const nChanged = list.filter((x) => baseline && sig(x.r) !== sig(base.get(key(x.r)))).length
          const act = sum(list.map((x) => x.r), 'activeQty'), tot = sum(list.map((x) => x.r), 'totalQty')
          return (
            <section key={section} className={`rp-sec${op ? ' open' : ''}`}>
              <button type="button" className="rp-sec-head" onClick={() => toggle(section)} aria-expanded={op}>
                <span className="rp-sec-ico"><SI size={16} strokeWidth={1.8} /></span>
                <b>{section}</b>
                {nChanged > 0 && <span className="rp-badge">{fa(nChanged)} تغییر</span>}
                <span className="rp-sec-sum">{tot ? <><b>{fa(act)}</b> / {fa(tot)}</> : '—'}</span>
                {op ? <ChevronDown size={15} /> : <ChevronLeft size={15} />}
              </button>
              {op && (
                <div className="rp-rows">
                  <div className="rp-cols"><span /> {cols.map(([f, l]) => <i key={f}>{l}</i>)}<span /></div>
                  {[...shownUsed, ...(editable ? shownUnused.slice(0, q ? 99 : 0) : [])].map(({ r, i }) => renderRow(r, i))}
                  {editable && !q && shownUnused.length > 0 && (
                    <details className="rp-more"><summary>{fa(shownUnused.length)} مورد دیگر این بخش (بدون مقدار)</summary>{shownUnused.map(({ r, i }) => renderRow(r, i))}</details>
                  )}
                  {editable && (adding?.section === section
                    ? <span className="rp-add"><input autoFocus placeholder={kind === 'man' ? 'عنوان شغل…' : 'نام تجهیز…'} value={adding.name} onChange={(e) => setAdding({ section, name: e.target.value })} dir="auto" /><button className="im-btn im-btn-sm im-btn-primary" disabled={!adding.name.trim()} onClick={() => { onChange([...rows, blankRes(kind, section, adding.name.trim())]); setAdding(null) }}>افزودن</button><button className="im-btn im-btn-sm" onClick={() => setAdding(null)}>انصراف</button></span>
                    : <button className="im-btn im-btn-sm rp-addbtn" onClick={() => setAdding({ section, name: '' })}><Plus size={12} /> ردیف جدید در این بخش</button>)}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )

  function renderRow(r: ResRow, i: number) {
    const I = iconForRole(r.name, r.kind)
    const pr = resUsed(r) ? resProblem(r) : ''
    const prev = base.get(key(r))
    const ch = baseline != null && sig(r) !== sig(prev)
    return (
      <div key={key(r) + i} className={`rp-row${pr ? ' bad' : ''}${ch ? ' ch' : ''}`}>
        <span className="rp-name"><span className="rp-ico"><I size={15} strokeWidth={1.8} /></span><span>{r.name}{pr && <small className="ex-bad" style={{ display: 'block' }}>{pr}</small>}{ch && prev && <small className="rp-was"><ArrowLeft size={10} /> قبلاً: کل {fa(prev.totalQty)} · فعال {fa(prev.activeQty)}</small>}</span></span>
        {cols.map(([f]) => (
          <span key={f} className="rp-cell">
            {editable && f === 'totalQty' && <button type="button" className="rp-step" aria-label="کم کردن" onClick={() => bump(i, f, -1)}><Minus size={11} /></button>}
            {editable ? <DecInput value={r[f]} onValue={(n) => patch(i, f, n)} label={`${r.name} — ${cols.find((c) => c[0] === f)?.[1]}`} /> : <b>{fa(r[f])}</b>}
            {editable && f === 'totalQty' && <button type="button" className="rp-step" aria-label="زیاد کردن" onClick={() => bump(i, f, 1)}><Plus size={11} /></button>}
          </span>
        ))}
        <span>{editable && !resUsed(r) && !isCatalog(r) && <button className="im-btn im-btn-sm" aria-label="حذف ردیف" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={12} /></button>}</span>
      </div>
    )
  }
}
