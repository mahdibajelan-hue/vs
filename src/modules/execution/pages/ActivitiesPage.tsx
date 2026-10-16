import { useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, FilePlus2, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { useExecutionStore } from '../store/useExecutionStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { readXlsx, writeXlsx } from '../../material/lib/control/xlsx'
import { weightSums } from '../lib/progress'
import { Chip, DataTable, KpiCard, NumInput, Section, fmtD, parseNum, type Col } from '../../finance/components/fn'
import { FormModal, type FieldDef, type Vals } from '../../finance/components/FormModal'
import { ModalPortal } from '../../../components/common/ModalPortal'
import { ContractImport } from '../components/ContractImport'
import { Bar, Empty, fa } from '../components/common'
import { ACTIVITY_APPROVAL_LABEL_FA, ACTIVITY_KIND_LABEL_FA, type Activity, type ActivityKind, type PriceBook, type PriceItem } from '../types'

export const METRIC_OPTIONS = [{ value: '', label: '—' }, { value: 'weld_joint', label: 'سرجوش جوشکاری‌شده' }, { value: 'rt_joint', label: 'سرجوش رادیوگرافی‌شده' }, { value: 'coat_joint', label: 'سرجوش عایق‌شده' }, { value: 'pipe_m', label: 'طول لوله (متر)' }]
const KIND_OPTS = (Object.keys(ACTIVITY_KIND_LABEL_FA) as ActivityKind[]).map((k) => ({ value: k, label: ACTIVITY_KIND_LABEL_FA[k] }))
const norm = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ')
const pickKey = (row: Record<string, unknown>, names: string[]) => { for (const k of Object.keys(row)) if (names.includes(norm(k).toLowerCase())) return row[k]; return '' }

export function ActivitiesPage({ projectId, sub }: { projectId: string; sub: string }) {
  if (sub === 'books') return <BooksView projectId={projectId} />
  if (sub === 'baselines') return <BaselinesView projectId={projectId} />
  return <ActivitiesView projectId={projectId} />
}

function actFields(): FieldDef[] {
  return [
    { key: 'itemNo', label: 'شمارهٔ ردیف فهرست‌بها / پیمان', kind: 'text', required: true }, { key: 'kind', label: 'نوع ردیف', kind: 'select', required: true, options: KIND_OPTS },
    { key: 'title', label: 'شرح فعالیت', kind: 'text', required: true, span: 2 }, { key: 'unit', label: 'واحد اندازه‌گیری', kind: 'text', required: true }, { key: 'chapter', label: 'فصل / رشته', kind: 'text' },
    { key: 'baseQty', label: 'مقدار مبنا (پیمان)', kind: 'num', required: true }, { key: 'unitPrice', label: 'بهای واحد قراردادی (ریال)', kind: 'money' },
    { key: 'weight', label: 'وزن در پیشرفت (٪)', kind: 'num' }, { key: 'weightGroup', label: 'مبنای وزن‌دهی', kind: 'text' },
    { key: 'area', label: 'بخش اجرایی', kind: 'text' }, { key: 'front', label: 'جبههٔ کاری', kind: 'text' }, { key: 'station', label: 'ایستگاه', kind: 'text' },
    { key: 'kmFrom', label: 'کیلومتر از', kind: 'num' }, { key: 'kmTo', label: 'کیلومتر تا', kind: 'num' },
    { key: 'plannedStart', label: 'شروع برنامه', kind: 'date' }, { key: 'plannedEnd', label: 'پایان برنامه', kind: 'date' },
    { key: 'metric', label: 'شمارندهٔ مصرف (برای ماژول تأمین)', kind: 'select', options: METRIC_OPTIONS, span: 2 },
    { key: 'note', label: 'یادداشت', kind: 'text', span: 2 },
  ]
}
const toVals = (a?: Partial<Activity>): Vals => ({ itemNo: a?.itemNo ?? '', kind: a?.kind ?? 'standard', title: a?.title ?? '', unit: a?.unit ?? '', chapter: a?.chapter ?? '', baseQty: a?.baseQty ?? 0, unitPrice: a?.unitPrice ?? 0, weight: a?.weight ?? 0, weightGroup: a?.weightGroup ?? '', area: a?.area ?? '', front: a?.front ?? '', station: a?.station ?? '', kmFrom: a?.kmFrom ?? null, kmTo: a?.kmTo ?? null, plannedStart: a?.plannedStart ?? null, plannedEnd: a?.plannedEnd ?? null, metric: a?.metric ?? '', note: a?.note ?? '' })

function ActivitiesView({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const [form, setForm] = useState<{ a?: Activity; seed?: Partial<Activity> } | null>(null)
  const [picker, setPicker] = useState(false)
  const [imp, setImp] = useState(false)
  const [q, setQ] = useState('')
  const [bookF, setBookF] = useState('')
  const [openCh, setOpenCh] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const canEdit = ex.can(projectId, 'edit_activities'), canApprove = ex.can(projectId, 'approve_activity')
  const rows = useMemo(() => m.activities.filter((a) => (!bookF || (bookF === '-' ? !a.bookId : a.bookId === bookF)) && (!q || `${a.itemNo} ${a.rowNo} ${a.title} ${a.spec} ${a.remark}`.includes(q))), [m.activities, q, bookF])
  const books = ex.books.filter((b) => b.projectId === projectId)
  const bookName = (id: string | null) => (id ? books.find((b) => b.id === id)?.title ?? 'فهرست‌بها' : 'ردیف‌های دستی و خاص')
  // book → chapter → rows, with contract values
  const groups = useMemo(() => {
    const out = new Map<string, { book: string; chapters: Map<string, { name: string; no: string; rows: Activity[]; value: number }>; value: number }>()
    for (const a of rows) {
      const bk = a.bookId ?? '-'; const g = out.get(bk) ?? { book: bookName(a.bookId), chapters: new Map(), value: 0 }
      const ck = a.chapter || '—'; const c = g.chapters.get(ck) ?? { name: ck, no: a.chapterNo, rows: [], value: 0 }
      c.rows.push(a); c.value += a.baseQty * a.unitPrice; g.value += a.baseQty * a.unitPrice; g.chapters.set(ck, c); out.set(bk, g)
    }
    return [...out.entries()]
  }, [rows, books]) // eslint-disable-line react-hooks/exhaustive-deps
  const searching = q.trim().length > 0 || rows.length <= 40
  const contractValue = m.activities.reduce((s, a) => s + (a.active && a.approval === 'approved' ? a.baseQty * a.unitPrice : 0), 0)
  const sums = weightSums(m.activities)
  const pend = m.activities.filter((a) => a.approval === 'pending')
  const progress = new Map(m.approved.rows.map((r) => [r.activity.id, r]))

  const importFile = async (f: File) => {
    const raw = await readXlsx(f)
    const rowsIn = raw.map((r, i) => ({
      itemNo: norm(pickKey(r, ['شماره ردیف', 'ردیف', 'شماره ردیف پیمان', 'item no', 'item_no', 'item'])), title: norm(pickKey(r, ['شرح', 'شرح فعالیت', 'description', 'title'])), unit: norm(pickKey(r, ['واحد', 'unit'])), chapter: norm(pickKey(r, ['فصل', 'chapter'])),
      kind: (norm(pickKey(r, ['نوع', 'kind'])).includes('ستاره') ? 'starred' : norm(pickKey(r, ['نوع', 'kind'])).includes('خاص') ? 'special' : 'standard') as ActivityKind,
      baseQty: parseNum(String(pickKey(r, ['مقدار', 'مقدار مبنا', 'مقدار پیمان', 'qty', 'quantity']))), unitPrice: parseNum(String(pickKey(r, ['بهای واحد', 'بها', 'قیمت واحد', 'unit price']))), weight: parseNum(String(pickKey(r, ['وزن', 'weight']))), weightGroup: norm(pickKey(r, ['مبنای وزن', 'گروه وزن', 'weight group'])),
      area: norm(pickKey(r, ['بخش', 'بخش اجرایی'])), front: norm(pickKey(r, ['جبهه', 'جبهه کاری'])), station: norm(pickKey(r, ['ایستگاه'])), kmFrom: null, kmTo: null, plannedStart: null, plannedEnd: null, metric: '', active: true, sort: i + 1, note: '',
    })).filter((x) => x.itemNo && x.title)
    if (!rowsIn.length) { window.alert('ردیفی با ستون‌های «شماره ردیف» و «شرح» پیدا نشد.'); return }
    if (window.confirm(`${fa(rowsIn.length)} فعالیت به پروژه افزوده شود؟`)) await ex.importActivities(projectId, rowsIn)
  }
  const cols: Col<Activity>[] = [
    { key: 'rn', label: 'ردیف', render: (a) => (a.rowNo ? <span className="fn-code">{a.rowNo}</span> : '—') },
    { key: 'i', label: 'کد فهرست', render: (a) => <span className="strong fn-code">{a.itemNo}</span>, sort: (a) => a.itemNo },
    { key: 't', label: 'شرح فعالیت', render: (a) => <><span className="strong">{a.title}</span><span className="sub">{[a.area, a.front, a.station, a.kmFrom != null ? `km ${a.kmFrom}–${a.kmTo ?? ''}` : '', a.remark].filter(Boolean).join(' · ')}</span>{a.parentActivityId && <Chip tone="warn">اضافه‌بها{a.surchargePct ? ` ${fa(a.surchargePct, 1)}٪` : ''} — به ردیف {m.actById.get(a.parentActivityId)?.rowNo || m.actById.get(a.parentActivityId)?.itemNo}</Chip>}</> },
    { key: 'u', label: 'واحد', render: (a) => a.unit },
    { key: 'k', label: 'نوع', render: (a) => (a.kind === 'standard' ? <Chip>ردیف</Chip> : <Chip tone="warn">{a.kind === 'starred' ? 'ستاره‌دار' : 'خاص'}</Chip>) },
    { key: 'b', label: 'مقدار مبنا', num: true, render: (a) => fa(a.baseQty, 2), sort: (a) => a.baseQty },
    { key: 'p', label: 'بهای واحد', num: true, render: (a) => fa(a.unitPrice) },
    { key: 'v', label: 'ارزش پیمان (ریال)', num: true, render: (a) => fa(a.baseQty * a.unitPrice), sort: (a) => a.baseQty * a.unitPrice },
    { key: 'w', label: 'وزن ٪', num: true, render: (a) => (a.weight ? fa(a.weight, 2) : '—') },
    { key: 'g', label: 'پیشرفت', render: (a) => { const r = progress.get(a.id); return r ? <><Bar value={r.pct} /><span className="sub">{fa(r.pct * 100, 0)}٪ · {fa(r.cum, 1)} از {fa(r.base.baseQty, 1)}</span></> : <span className="sub">—</span> } },
    { key: 's', label: 'وضعیت', render: (a) => <><Chip tone={a.approval === 'approved' ? 'good' : a.approval === 'rejected' ? 'bad' : 'warn'}>{ACTIVITY_APPROVAL_LABEL_FA[a.approval]}</Chip>{!a.active && <Chip>غیرفعال</Chip>}{a.approvalNote && <span className="sub">{a.approvalNote}</span>}</> },
    { key: 'a', label: '', render: (a) => (
      <span className="no-print" style={{ display: 'inline-flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
        {a.approval === 'pending' && canApprove && <><button className="im-btn im-btn-sm im-btn-primary" onClick={() => void ex.decideActivity(a.id, true)}><Check size={12} /> تأیید</button><button className="im-btn im-btn-sm" style={{ color: 'var(--im-coral)' }} onClick={() => { const n = window.prompt('علت رد:'); if (n?.trim()) void ex.decideActivity(a.id, false, n.trim()) }}><X size={12} /> رد</button></>}
        {canEdit && <button className="im-btn im-btn-sm" aria-label="ویرایش" onClick={() => setForm({ a })}><Pencil size={12} /></button>}
        {canEdit && <button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => { if (window.confirm(`«${a.title}» حذف شود؟`)) void ex.removeActivity(a.id) }}><Trash2 size={12} /></button>}
      </span>) },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="فعالیت‌های فعال" value={fa(m.activities.filter((a) => a.active && a.approval === 'approved').length)} />
        <KpiCard i={1} label="ستاره‌دار و خاص" value={fa(m.activities.filter((a) => a.kind !== 'standard').length)} sub={pend.length ? `${fa(pend.length)} در انتظار تأیید` : undefined} tone={pend.length ? 'warn' : 'neutral'} />
        <KpiCard i={2} label="مبنای وزن‌دهی" value={fa(sums.length)} sub={sums.every((s) => s.ok) ? 'همه ۱۰۰٪' : 'مجموع برخی ۱۰۰ نیست'} tone={sums.length && sums.every((s) => s.ok) ? 'good' : 'warn'} />
        <KpiCard i={3} label="ارزش قرارداد (ردیف‌های فعال)" value={`${(contractValue / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}`} unit="میلیارد ریال" sub={`پیشرفت تأییدشده ${fa(m.approved.overall * 100, 1)}٪`} />
      </div>
      <div className="mt-filters no-print">
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Search size={14} /><input placeholder="جست‌وجوی ردیف، کد یا شرح…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 220 }} aria-label="جست‌وجو" /></label>
        {books.length > 0 && <select value={bookF} onChange={(e) => setBookF(e.target.value)} aria-label="فهرست‌بها"><option value="">همهٔ فهرست‌ها</option>{books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}<option value="-">ردیف‌های دستی و خاص</option></select>}
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="im-btn im-btn-sm" onClick={() => void writeXlsx(m.activities.map((a) => ({ 'شماره ردیف': a.itemNo, 'شرح': a.title, 'واحد': a.unit, 'فصل': a.chapter, 'نوع': ACTIVITY_KIND_LABEL_FA[a.kind], 'مقدار مبنا': a.baseQty, 'بهای واحد': a.unitPrice, 'وزن': a.weight, 'مبنای وزن': a.weightGroup, 'بخش': a.area, 'جبهه': a.front, 'ایستگاه': a.station })), 'فعالیت‌های-پروژه.xlsx', 'فعالیت‌ها')}><Download size={13} /> اکسل</button>
          {canEdit && <><input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} /><button className="im-btn im-btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} /> ورود از اکسل</button>
            <button className="im-btn im-btn-sm" onClick={() => setImp(true)}><Upload size={13} /> ورود فهرست‌بها و مقادیر پیمان</button>
            <button className="im-btn im-btn-sm" onClick={() => setPicker(true)}><FilePlus2 size={13} /> افزودن از فهرست‌بها</button>
            <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm({})}><Plus size={14} /> ردیف خاص / دستی</button></>}
        </span>
      </div>
      {rows.length === 0 ? <Empty>فعالیتی تعریف نشده است. فهرست‌بها و مقادیر پیمان را از اکسل وارد کنید، از فهرست‌بها انتخاب کنید یا ردیف خاص بسازید.</Empty> : groups.map(([bk, g]) => (
        <Section key={bk} title={g.book} hint={`${fa([...g.chapters.values()].reduce((s, c) => s + c.rows.length, 0))} ردیف · ارزش ${(g.value / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} میلیارد ریال`} flush>
          {[...g.chapters.values()].map((c) => { const key = `${bk}|${c.name}`, isOpen = searching || openCh.has(key); return (
            <div key={key}>
              <button className="ex-chapter" onClick={() => setOpenCh((s0) => { const n2 = new Set(s0); if (n2.has(key)) n2.delete(key); else n2.add(key); return n2 })} aria-expanded={isOpen}><span>{isOpen ? '▾' : '◂'}</span><b>{c.name}</b><small>{fa(c.rows.length)} ردیف · {(c.value / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} میلیارد ریال</small></button>
              {isOpen && <DataTable cols={cols} rows={c.rows} rowKey={(a) => a.id} />}
            </div>) })}
        </Section>))}
      {sums.length > 0 && <Section title="مجموع وزن‌ها" hint="در هر مبنای وزن‌دهی مجموع باید ۱۰۰ باشد؛ نسخهٔ مبنا بدون آن تصویب نمی‌شود." flush><DataTable cols={[{ key: 'g', label: 'مبنای وزن‌دهی', render: (s: (typeof sums)[number]) => s.group || 'کل پروژه' }, { key: 's', label: 'مجموع وزن', num: true, render: (s) => fa(s.sum, 2) }, { key: 'o', label: 'وضعیت', render: (s) => <Chip tone={s.ok ? 'good' : 'bad'}>{s.ok ? '۱۰۰٪' : s.sum > 100 ? 'بیش از ۱۰۰' : 'کمتر از ۱۰۰'}</Chip> }]} rows={sums} rowKey={(s) => s.group} /></Section>}
      {form && <FormModal title={form.a ? `ویرایش ${form.a.itemNo}` : form.seed ? 'فعالیت از فهرست‌بها' : 'ردیف خاص / دستی'} subtitle={!form.a ? 'ردیف ستاره‌دار و خاص پس از ثبت، منتظر تأیید کارفرما یا مشاور می‌ماند.' : undefined} submitLabel="ذخیره" fields={actFields()} initial={toVals(form.a ?? form.seed ?? { kind: 'special' })} onClose={() => setForm(null)}
        onSubmit={async (v) => { await ex.saveActivity({ id: form.a?.id, projectId, priceItemId: form.a?.priceItemId ?? (form.seed?.priceItemId ?? null), itemNo: String(v.itemNo), kind: v.kind as ActivityKind, title: String(v.title), unit: String(v.unit), chapter: String(v.chapter ?? ''), baseQty: Number(v.baseQty) || 0, unitPrice: Number(v.unitPrice) || 0, weight: Number(v.weight) || 0, weightGroup: String(v.weightGroup ?? ''), area: String(v.area ?? ''), front: String(v.front ?? ''), station: String(v.station ?? ''), kmFrom: v.kmFrom == null || v.kmFrom === '' ? null : Number(v.kmFrom), kmTo: v.kmTo == null || v.kmTo === '' ? null : Number(v.kmTo), plannedStart: (v.plannedStart as string) || null, plannedEnd: (v.plannedEnd as string) || null, metric: String(v.metric ?? ''), note: String(v.note ?? ''), active: form.a?.active ?? true, sort: form.a?.sort ?? m.activities.length + 1 }) }} />}
      {imp && <ContractImport projectId={projectId} onClose={() => setImp(false)} />}
      {picker && <ItemPicker projectId={projectId} onClose={() => setPicker(false)} onPick={(it, book) => { setPicker(false); setForm({ seed: { priceItemId: it.id, itemNo: it.itemNo, title: it.description, unit: it.unit, chapter: it.chapter || book.discipline, unitPrice: it.unitPrice, kind: it.starred ? 'starred' : 'standard' } }) }} />}
    </div>
  )
}

function ItemPicker({ projectId, onClose, onPick }: { projectId: string; onClose: () => void; onPick: (i: PriceItem, b: PriceBook) => void }) {
  const ex = useExecutionStore()
  const books = ex.books.filter((b) => b.projectId === projectId && b.status === 'active')
  const [bookId, setBookId] = useState(books[0]?.id ?? '')
  const [q, setQ] = useState('')
  const items = useMemo(() => ex.priceItems.filter((i) => i.bookId === bookId && (!q || `${i.itemNo} ${i.description}`.includes(q))).slice(0, 80), [ex.priceItems, bookId, q])
  const book = books.find((b) => b.id === bookId)
  const used = new Set(ex.activities.filter((a) => a.projectId === projectId).map((a) => a.priceItemId))
  return (
    <ModalPortal>
      <div className="im-overlay"><div className="im-modal" style={{ maxWidth: 860 }} role="dialog" aria-modal="true" aria-label="انتخاب از فهرست‌بها">
        <div className="im-modal-head"><div className="im-modal-title">انتخاب ردیف از فهرست‌بها</div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        {books.length === 0 ? <p className="im-helper">ابتدا یک فهرست‌بها در «تنظیمات ← فهرست‌های بها» ثبت کنید.</p> : <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}><select value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="فهرست‌بها">{books.map((b) => <option key={b.id} value={b.id}>{b.title} — نسخه {fa(b.version)}</option>)}</select><input placeholder="شمارهٔ ردیف یا شرح…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} autoFocus aria-label="جست‌وجو" /></div>
          <div className="fn-tbl-wrap" style={{ maxHeight: '50vh' }}><table className="ex-lines"><thead><tr><th>ردیف</th><th>شرح</th><th>واحد</th><th className="num">بهای واحد</th><th /></tr></thead>
            <tbody>{items.map((i) => <tr key={i.id}><td className="fn-code">{i.itemNo}{i.starred ? ' ★' : ''}</td><td>{i.description}</td><td>{i.unit}</td><td className="num">{fa(i.unitPrice)}</td><td>{used.has(i.id) ? <Chip>افزوده شده</Chip> : <button className="im-btn im-btn-sm" onClick={() => book && onPick(i, book)}>انتخاب</button>}</td></tr>)}{items.length === 0 && <tr><td colSpan={5} className="fn-empty">ردیفی پیدا نشد.</td></tr>}</tbody></table></div></>}
      </div></div>
    </ModalPortal>
  )
}

function BooksView({ projectId }: { projectId: string }) {
  const ex = useExecutionStore()
  const books = ex.books.filter((b) => b.projectId === projectId)
  const [sel, setSel] = useState<string>(books[0]?.id ?? '')
  const [form, setForm] = useState<{ b?: PriceBook } | null>(null)
  const [itemForm, setItemForm] = useState<{ i?: PriceItem } | null>(null)
  const [q, setQ] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const can = ex.can(projectId, 'edit_activities')
  const book = books.find((b) => b.id === sel) ?? books[0]
  const items = useMemo(() => ex.priceItems.filter((i) => i.bookId === book?.id && (!q || `${i.itemNo} ${i.description}`.includes(q))), [ex.priceItems, book, q])
  const total = book ? ex.priceItems.filter((i) => i.bookId === book.id).length : 0
  const importFile = async (f: File) => {
    if (!book) return
    const raw = await readXlsx(f)
    const rows = raw.map((r) => ({ itemNo: norm(pickKey(r, ['شماره ردیف', 'ردیف', 'item no', 'item_no', 'item'])), description: norm(pickKey(r, ['شرح', 'شرح ردیف', 'description'])), unit: norm(pickKey(r, ['واحد', 'unit'])), chapter: norm(pickKey(r, ['فصل', 'chapter'])), unitPrice: parseNum(String(pickKey(r, ['بهای واحد', 'بها', 'قیمت', 'unit price']))), starred: /ستاره|\*|yes|1|true/i.test(norm(pickKey(r, ['ستاره', 'ستاره‌دار', 'starred']))) })).filter((x) => x.itemNo && x.description)
    if (!rows.length) { window.alert('ردیفی با ستون‌های «شماره ردیف» و «شرح» پیدا نشد.'); return }
    if (window.confirm(`${fa(rows.length)} ردیف به «${book.title}» افزوده یا به‌روز شود؟`)) await ex.saveItems(book.id, rows)
  }
  const bookFields: FieldDef[] = [{ key: 'title', label: 'عنوان فهرست‌بها', kind: 'text', required: true, span: 2 }, { key: 'discipline', label: 'رشته', kind: 'text' }, { key: 'year', label: 'سال', kind: 'num' }, { key: 'season', label: 'فصل', kind: 'text' }, { key: 'version', label: 'نسخه', kind: 'num' }, { key: 'note', label: 'یادداشت (مثلاً شمارهٔ ابلاغیه)', kind: 'text', span: 2 }]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="mt-filters no-print">
        <select value={book?.id ?? ''} onChange={(e) => setSel(e.target.value)} aria-label="فهرست‌بها">{books.length === 0 && <option value="">هنوز فهرست‌بهایی نیست</option>}{books.map((b) => <option key={b.id} value={b.id}>{b.title} — نسخه {fa(b.version)}{b.status === 'superseded' ? ' (منسوخ)' : ''}</option>)}</select>
        {book && <span className="im-helper" style={{ margin: 0 }}>{[book.discipline, book.year ? `سال ${fa(book.year)}` : '', book.season].filter(Boolean).join(' · ')} · {fa(total)} ردیف</span>}
        <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          {can && book && <button className="im-btn im-btn-sm" onClick={() => setForm({ b: book })}><Pencil size={13} /> ویرایش مشخصات</button>}
          {can && book && book.status === 'active' && <button className="im-btn im-btn-sm" onClick={() => { const n = window.prompt('دلیل نسخهٔ جدید (مثلاً ابلاغیهٔ تغییر بها):'); if (n?.trim()) void ex.newBookVersion(book.id, n.trim()).then((id) => id && setSel(id)) }}><Copy size={13} /> نسخهٔ جدید</button>}
          {can && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm({})}><Plus size={14} /> فهرست‌بهای جدید</button>}
        </span>
      </div>
      <p className="im-helper" style={{ margin: 0 }}>هر پروژه فهرست‌بهای مرجع و نسخهٔ قرارداد خود را دارد. تغییر بها یا ردیف با «نسخهٔ جدید» ثبت می‌شود و نسخهٔ قبلی به‌صورت منسوخ برای ردیابی می‌ماند.</p>
      {book && (
        <>
          <div className="mt-filters no-print"><label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Search size={14} /><input placeholder="جست‌وجوی شمارهٔ ردیف یا شرح…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} aria-label="جست‌وجو" /></label>
            <span style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6 }}>
              <button className="im-btn im-btn-sm" onClick={() => void writeXlsx(ex.priceItems.filter((i) => i.bookId === book.id).map((i) => ({ 'شماره ردیف': i.itemNo, 'فصل': i.chapter, 'شرح': i.description, 'واحد': i.unit, 'بهای واحد': i.unitPrice, 'ستاره': i.starred ? 'ستاره‌دار' : '' })), `${book.title}.xlsx`, 'فهرست‌بها')}><Download size={13} /> اکسل</button>
              {can && book.status === 'active' && <><input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} /><button className="im-btn im-btn-sm" onClick={() => fileRef.current?.click()}><Upload size={13} /> ورود از اکسل</button><button className="im-btn im-btn-sm" onClick={() => setItemForm({})}><Plus size={13} /> ردیف</button></>}
            </span></div>
          <DataTable rows={items.slice(0, 300)} rowKey={(i) => i.id} empty="ردیفی نیست؛ از اکسل وارد کنید." cols={[{ key: 'n', label: 'ردیف', render: (i: PriceItem) => <span className="strong fn-code">{i.itemNo}{i.starred ? ' ★' : ''}</span>, sort: (i) => i.itemNo }, { key: 'c', label: 'فصل', render: (i) => i.chapter || '—' }, { key: 'd', label: 'شرح', render: (i) => i.description }, { key: 'u', label: 'واحد', render: (i) => i.unit }, { key: 'p', label: 'بهای واحد', num: true, render: (i) => fa(i.unitPrice), sort: (i) => i.unitPrice },
            { key: 'a', label: '', render: (i) => can && book.status === 'active' ? <span className="no-print" style={{ display: 'inline-flex', gap: 4 }}><button className="im-btn im-btn-sm" aria-label="ویرایش" onClick={() => setItemForm({ i })}><Pencil size={12} /></button><button className="im-btn im-btn-sm" aria-label="حذف" onClick={() => { if (window.confirm('ردیف حذف شود؟')) void ex.removeItem(i.id) }}><Trash2 size={12} /></button></span> : null }]} />
          {items.length > 300 && <p className="im-helper" style={{ margin: 0 }}>۳۰۰ ردیف اول نشان داده شد؛ جست‌وجو کنید.</p>}
        </>
      )}
      {form && <FormModal title={form.b ? 'ویرایش فهرست‌بها' : 'فهرست‌بهای جدید'} fields={bookFields} initial={{ title: form.b?.title ?? '', discipline: form.b?.discipline ?? '', year: form.b?.year ?? null, season: form.b?.season ?? '', version: form.b?.version ?? 1, note: form.b?.note ?? '' }} submitLabel="ذخیره" onClose={() => setForm(null)}
        onSubmit={async (v) => { const id = await ex.saveBook({ id: form.b?.id, projectId, title: String(v.title), discipline: String(v.discipline ?? ''), year: v.year ? Number(v.year) : null, season: String(v.season ?? ''), version: Number(v.version) || 1, note: String(v.note ?? ''), status: form.b?.status }); if (id) setSel(id) }} />}
      {itemForm && book && <FormModal title={itemForm.i ? 'ویرایش ردیف' : 'ردیف جدید'} fields={[{ key: 'itemNo', label: 'شمارهٔ ردیف', kind: 'text', required: true }, { key: 'chapter', label: 'فصل', kind: 'text' }, { key: 'description', label: 'شرح', kind: 'text', required: true, span: 2 }, { key: 'unit', label: 'واحد', kind: 'text', required: true }, { key: 'unitPrice', label: 'بهای واحد (ریال)', kind: 'money' }, { key: 'starred', label: 'ستاره‌دار', kind: 'select', options: [{ value: 'no', label: 'خیر' }, { value: 'yes', label: 'بله' }] }]}
        initial={{ itemNo: itemForm.i?.itemNo ?? '', chapter: itemForm.i?.chapter ?? '', description: itemForm.i?.description ?? '', unit: itemForm.i?.unit ?? '', unitPrice: itemForm.i?.unitPrice ?? 0, starred: itemForm.i?.starred ? 'yes' : 'no' }} submitLabel="ذخیره" onClose={() => setItemForm(null)}
        onSubmit={async (v) => { await ex.saveItems(book.id, [{ itemNo: String(v.itemNo), chapter: String(v.chapter ?? ''), description: String(v.description), unit: String(v.unit), unitPrice: Number(v.unitPrice) || 0, starred: v.starred === 'yes' }]) }} />}
    </div>
  )
}

function BaselinesView({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const [form, setForm] = useState(false)
  const draft = m.baselines.find((b) => b.status === 'draft')
  const can = ex.can(projectId, 'edit_baseline'), canApprove = ex.can(projectId, 'approve_baseline')
  const dLines = draft ? m.blines.filter((l) => l.baselineId === draft.id) : []
  const sums = (() => { const mm = new Map<string, number>(); for (const l of dLines) if (l.active) mm.set(l.weightGroup, (mm.get(l.weightGroup) ?? 0) + l.weight); return [...mm].map(([group, sum]) => ({ group, sum, ok: Math.abs(sum - 100) < 0.01 })) })()
  const approved = m.baselines.filter((b) => b.status === 'approved').sort((a, b) => b.version - a.version)
  const prev = approved[0]
  const prevMap = new Map(m.blines.filter((l) => l.baselineId === prev?.id).map((l) => [l.activityId, l]))
  const autoWeights = async () => {
    const groups = new Map<string, typeof dLines>()
    for (const l of dLines.filter((x) => x.active)) { const g = groups.get(l.weightGroup); if (g) g.push(l); else groups.set(l.weightGroup, [l]) }
    for (const ls of groups.values()) {
      const vals = ls.map((l) => l.baseQty * l.unitPrice), tot = vals.reduce((a, b) => a + b, 0)
      if (tot <= 0) continue
      let acc = 0
      for (let i = 0; i < ls.length; i++) { const w = i === ls.length - 1 ? Math.round((100 - acc) * 100) / 100 : Math.round((vals[i] / tot) * 10000) / 100; acc += w; await ex.saveBaselineLine(ls[i].id, { weight: w }) }
    }
  }
  const cols: Col<(typeof dLines)[number]>[] = [
    { key: 'i', label: 'ردیف', render: (l) => <span className="fn-code strong">{l.itemNo}</span> },
    { key: 't', label: 'شرح', render: (l) => <><span className="strong">{l.title}</span>{prevMap.get(l.activityId) == null ? <Chip tone="warn">ردیف جدید</Chip> : null}</> },
    { key: 'q', label: 'مقدار مبنا', num: true, render: (l) => <><NumInput value={l.baseQty} label="مقدار مبنا" decimals={3} onCommit={(n) => void ex.saveBaselineLine(l.id, { baseQty: n })} />{prevMap.get(l.activityId) && prevMap.get(l.activityId)!.baseQty !== l.baseQty && <span className="sub">قبلی: {fa(prevMap.get(l.activityId)!.baseQty, 2)}</span>}</> },
    { key: 'w', label: 'وزن ٪', num: true, render: (l) => <><NumInput value={l.weight} label="وزن" decimals={3} onCommit={(n) => void ex.saveBaselineLine(l.id, { weight: n })} />{prevMap.get(l.activityId) && prevMap.get(l.activityId)!.weight !== l.weight && <span className="sub">قبلی: {fa(prevMap.get(l.activityId)!.weight, 2)}</span>}</> },
    { key: 'g', label: 'مبنای وزن', render: (l) => <input className="fn-cell-input" defaultValue={l.weightGroup} aria-label="مبنای وزن" onBlur={(e) => e.target.value !== l.weightGroup && void ex.saveBaselineLine(l.id, { weightGroup: e.target.value })} /> },
    { key: 'a', label: 'فعال', render: (l) => <input type="checkbox" checked={l.active} onChange={(e) => void ex.saveBaselineLine(l.id, { active: e.target.checked })} aria-label="فعال" /> },
  ]
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p className="im-helper" style={{ margin: 0 }}>مقدار مبنا و وزن هر فعالیت نسخه‌بندی می‌شود: گزارش‌های تاریخی همیشه با نسخه‌ای محاسبه می‌شوند که در آن تاریخ مصوب بوده است. نسخهٔ جدید از وضعیت فعلی فعالیت‌ها ساخته می‌شود، ویرایش می‌شود و پس از تأیید مجموع ۱۰۰٪ هر مبنا، به‌عنوان نسخهٔ مصوب اعمال می‌گردد.</p>
      {!draft && can && <div><button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm(true)}><Plus size={14} /> ایجاد نسخهٔ جدید از وضعیت فعلی</button></div>}
      {draft && (
        <Section title={`پیش‌نویس نسخهٔ ${fa(draft.version)} — اعمال از ${fmtD(draft.effectiveDate)}`} hint={draft.reason}
          action={<span style={{ display: 'inline-flex', gap: 6 }}>{can && <button className="im-btn im-btn-sm" onClick={() => void autoWeights()}>وزن‌دهی خودکار بر پایهٔ ارزش (مقدار × بها)</button>}{can && <button className="im-btn im-btn-sm" onClick={() => { if (window.confirm('پیش‌نویس لغو شود؟')) void ex.cancelBaseline(draft.id) }}>لغو</button>}{canApprove && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => void ex.approveBaseline(draft.id)}>تصویب نسخه</button>}</span>} flush>
          <div style={{ padding: '4px 14px 8px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{sums.map((s) => <Chip key={s.group} tone={s.ok ? 'good' : 'bad'}>{s.group || 'کل پروژه'}: {fa(s.sum, 2)}٪</Chip>)}</div>
          <DataTable cols={cols} rows={dLines} rowKey={(l) => l.id} />
        </Section>
      )}
      <Section title="نسخه‌های ثبت‌شده" flush>
        <DataTable rows={m.baselines.slice().sort((a, b) => b.version - a.version)} rowKey={(b) => b.id} empty="هنوز نسخه‌ای نیست؛ بدون نسخهٔ مصوب، مقدارهای فعلی فعالیت‌ها مبنا هستند."
          cols={[{ key: 'v', label: 'نسخه', render: (b) => <span className="strong">{fa(b.version)}</span> }, { key: 'e', label: 'اعمال از', render: (b) => fmtD(b.effectiveDate) }, { key: 'r', label: 'علت', render: (b) => b.reason || '—' }, { key: 'n', label: 'ردیف‌ها', num: true, render: (b) => fa(m.blines.filter((l) => l.baselineId === b.id).length) }, { key: 's', label: 'وضعیت', render: (b) => <Chip tone={b.status === 'approved' ? 'good' : 'warn'}>{b.status === 'approved' ? 'مصوب' : 'پیش‌نویس'}</Chip> }, { key: 'd', label: 'تصویب', render: (b) => fmtD((b.approvedAt ?? '').slice(0, 10)) }]} />
      </Section>
      {form && <FormModal title="نسخهٔ جدید مبنا" fields={[{ key: 'reason', label: 'علت تغییر (الحاقیه، اصلاح مقدار…)', kind: 'text', required: true, span: 2 }, { key: 'eff', label: 'اعمال از تاریخ', kind: 'date', required: true }]} initial={{ reason: '', eff: m.today }} submitLabel="ایجاد" onClose={() => setForm(false)} onSubmit={async (v) => { await ex.createBaseline(projectId, String(v.reason), String(v.eff)) }} />}
    </div>
  )
}
