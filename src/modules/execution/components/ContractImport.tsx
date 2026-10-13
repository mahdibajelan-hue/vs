import { useState } from 'react'
import { Upload } from 'lucide-react'
import { ModalPortal } from '../../../components/common/ModalPortal'
import { useExecutionStore } from '../store/useExecutionStore'
import { parsePriceWorkbook, type ParsedBook } from '../lib/priceBookImport'
import { readWorkbookGrids } from '../lib/priceBookXlsx'
import { fa } from './common'

interface Entry { id: string; file: string; book: ParsedBook; title: string; group: string; make: boolean; on: boolean }
const toman = (n: number) => `${(n / 1e9).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} میلیارد`

/** Imports price lists with their contract quantities from the estimate workbooks: price-book items + contract rows (activities), weighted by value, each chapter reconciled against the file's own sub-total. */
export function ContractImport({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const ex = useExecutionStore()
  const [list, setList] = useState<Entry[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const pick = async (files: FileList | null) => {
    if (!files) return
    setBusy(true)
    const out: Entry[] = []
    for (const f of Array.from(files)) {
      try {
        const book = parsePriceWorkbook(await readWorkbookGrids(f), f.name)
        const short = [book.discipline.split(' ').slice(0, 4).join(' '), book.year ? String(book.year) : ''].filter(Boolean).join(' ')
        out.push({ id: `${f.name}${f.size}`, file: f.name, book, title: book.title, group: short || f.name, make: book.rows.some((r) => r.qty > 0), on: book.rows.length > 0 })
      } catch { out.push({ id: f.name, file: f.name, book: { title: f.name, discipline: '', year: null, items: [], rows: [], chapters: [], warnings: ['فایل خوانده نشد'] }, title: f.name, group: '', make: false, on: false }) }
    }
    setList((l) => [...l, ...out]); setBusy(false)
  }
  const patch = (id: string, p: Partial<Entry>) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const run = async () => {
    setBusy(true)
    const done: string[] = []
    for (const e of list.filter((x) => x.on)) { const r = await ex.importContract(projectId, e.book, { title: e.title, weightGroup: e.group, createActivities: e.make }); if (r) done.push(`${e.title}: ${fa(r.items)} ردیف فهرست‌بها، ${fa(r.activities)} ردیف پیمان`) }
    setBusy(false); setMsg(done.join('\n'))
  }
  return (
    <ModalPortal>
      <div className="im-overlay"><div className="im-modal" style={{ maxWidth: 980 }} role="dialog" aria-modal="true" aria-label="ورود فهرست‌بها از اکسل">
        <div className="im-modal-head"><div><div className="im-modal-title">ورود فهرست‌بها و مقادیر پیمان از اکسل</div><p className="im-helper" style={{ margin: 0 }}>چند فایل را هم‌زمان انتخاب کنید؛ هر فایل یک فهرست‌بها (رشته) می‌شود.</p></div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        {msg ? <div className="im-card" style={{ padding: 14, whiteSpace: 'pre-line' }}><b>ورود انجام شد</b>{'\n'}{msg}{'\n\n'}اکنون در «نسخه‌های مبنا» یک نسخه بسازید و تصویب کنید تا وزن‌ها (به‌نسبت ارزش) ثبت رسمی شوند.<div className="fn-form-foot"><button className="im-btn im-btn-primary" onClick={onClose}>بستن</button></div></div> : <>
          <label className="im-btn im-btn-sm" style={{ justifySelf: 'start', cursor: 'pointer' }}><Upload size={13} /> انتخاب فایل‌ها<input type="file" accept=".xlsx,.xls" multiple hidden onChange={(e) => { void pick(e.target.files); e.target.value = '' }} /></label>
          <div style={{ display: 'grid', gap: 10, maxHeight: '60vh', overflow: 'auto', marginTop: 8 }}>
            {list.map((e) => {
              const value = e.book.rows.reduce((s, r) => s + r.qty * r.unitPrice, 0)
              const bad = e.book.chapters.filter((c) => !c.ok)
              return (
                <div key={e.id} className="im-card" style={{ padding: 12, display: 'grid', gap: 6 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={e.on} onChange={(ev) => patch(e.id, { on: ev.target.checked })} /><b>{e.file}</b><span className="im-helper" style={{ margin: 0 }}>{e.book.discipline} {e.book.year ?? ''}</span></label>
                  <div className="ex-sheet-grid">
                    <label className="wide">عنوان فهرست‌بها<input value={e.title} onChange={(ev) => patch(e.id, { title: ev.target.value })} dir="auto" /></label>
                    <label>مبنای وزن‌دهی<input value={e.group} onChange={(ev) => patch(e.id, { group: ev.target.value })} dir="auto" /></label>
                    <label style={{ alignContent: 'end' }}><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={e.make} onChange={(ev) => patch(e.id, { make: ev.target.checked })} />ردیف‌های پیمان (فعالیت) هم ساخته شود</span></label>
                  </div>
                  <div className="im-helper" style={{ margin: 0 }}>{fa(e.book.items.length)} ردیف فهرست‌بها · {fa(e.book.rows.length)} ردیف پیمان · {fa(e.book.rows.filter((r) => r.starred).length)} ستاره‌دار · {fa(e.book.rows.filter((r) => r.parentItemNo).length)} اضافه‌بها · ارزش {toman(value)} ریال · {fa(e.book.chapters.length)} فصل</div>
                  {bad.length === 0 ? <span style={{ color: 'var(--im-mint)', fontSize: 12 }}>جمع همهٔ فصل‌ها با جمع‌های چاپ‌شده در فایل می‌خواند.</span> : <ul className="ex-warn" style={{ margin: 0, paddingInlineStart: 18 }}>{e.book.warnings.slice(0, 4).map((w) => <li key={w}>{w}</li>)}</ul>}
                </div>
              )
            })}
            {list.length === 0 && <p className="im-helper">فایلی انتخاب نشده است.</p>}
          </div>
          <div className="fn-form-foot"><button className="im-btn im-btn-ghost" onClick={onClose}>انصراف</button><button className="im-btn im-btn-primary" disabled={busy || !list.some((x) => x.on)} onClick={() => void run()}>{busy ? 'در حال ورود…' : 'ورود به پروژه'}</button></div>
        </>}
      </div></div>
    </ModalPortal>
  )
}
