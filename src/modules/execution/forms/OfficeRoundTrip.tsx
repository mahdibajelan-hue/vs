import { useRef, useState } from 'react'
import { Download, Save, Upload } from 'lucide-react'
import { GridSheet } from './GridTemplate'
import { compareLayouts, gridToWorkbook, workbookToGrid, type Diff } from './xlsxBridge'
import type { CellBinding, GridTemplate } from './gridTypes'

export const downloadWorkbook = async (tpl: GridTemplate, name: string, meta: { title: string; version: number | null }) => {
  const buf = await gridToWorkbook(tpl, meta)
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Open a form in Excel, change it there, bring it back as a NEW draft version (for an existing form) or as a new form (no `base`). The file's cell mapping is never guessed: an existing form keeps its approved bindings, a new form starts unmapped. */
export function OfficeRoundTrip({ formKey, title, base, bindings = [], version, strict, canEdit, onSave }: { formKey: string; title: string; base?: GridTemplate; bindings?: CellBinding[]; version?: number | null; strict?: boolean; canEdit: boolean; onSave: (layout: GridTemplate) => Promise<boolean> }) {
  const file = useRef<HTMLInputElement>(null)
  const [res, setRes] = useState<{ layout: GridTemplate; warnings: string[]; diff: Diff | null; name: string } | null>(null)
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const pick = async (f: File | undefined) => {
    if (!f) return
    setErr(''); setRes(null)
    try {
      const r = await workbookToGrid(await f.arrayBuffer(), f.name, { formKey, base })
      setRes({ ...r, diff: base ? compareLayouts(base, r.layout, bindings) : null, name: f.name })
    } catch (e) { setErr(`خواندن فایل ممکن نشد: ${(e as Error).message}`) }
    if (file.current) file.current.value = ''
  }
  const blocked = !!res?.diff?.structural && !!strict
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {base && <button className="im-btn im-btn-sm" onClick={() => void downloadWorkbook(base, `${formKey}${version ? `-v${version}` : ''}.xlsx`, { title, version: version ?? null })}><Download size={13} /> دریافت فایل Excel برای ویرایش در آفیس</button>}
        {canEdit && <><input ref={file} type="file" accept=".xlsx" hidden onChange={(e) => void pick(e.target.files?.[0])} /><button className="im-btn im-btn-sm" onClick={() => file.current?.click()}><Upload size={13} /> {base ? 'بارگذاری فایل ویرایش‌شده' : 'بارگذاری فایل Excel فرم'}</button></>}
        <span className="im-helper">فایل باید .xlsx باشد؛ ستون‌ها و ردیف‌ها، ادغام، فونت، تراز، کادر و رنگ‌ها خوانده می‌شوند. فرمول محاسبه نمی‌شود.</span>
      </div>
      {err && <p role="alert" style={{ color: '#dc2626', margin: 0 }}>{err}</p>}
      {res && (
        <div className="im-card" style={{ padding: 10, display: 'grid', gap: 8 }}>
          <b>پیش‌نمایش فایل «{res.name}»</b>
          <span className="im-helper">{res.layout.stats.cells} سلول · {res.layout.stats.merged} ادغام · {res.layout.rows.length} ردیف × {res.layout.cols.length} ستون</span>
          {res.warnings.map((w, i) => <span key={i} className="im-helper" style={{ color: '#b45309' }}>⚠ {w}</span>)}
          {res.diff && <>
            <span className="im-helper">تغییر نسبت به نسخهٔ مبنا: {res.diff.textChanges.length} سلول با متن متفاوت · ردیف {res.diff.rowsDelta >= 0 ? '+' : ''}{res.diff.rowsDelta} · ستون {res.diff.colsDelta >= 0 ? '+' : ''}{res.diff.colsDelta} · ادغام {res.diff.mergedDelta >= 0 ? '+' : ''}{res.diff.mergedDelta}</span>
            {res.diff.structural && <span className="im-helper" style={{ color: '#b45309' }}>⚠ تعداد ردیف یا ستون عوض شده؛ جای سلول‌ها جابه‌جا می‌شود و نگاشت باید از نو بررسی شود.{strict ? ' این فرم چیدمان چاپ ثابتِ وابسته به آدرس سلول دارد، پس ثبت آن مجاز نیست؛ ردیف/ستون را کم و زیاد نکنید.' : ''}</span>}
            {res.diff.bindingIssues.length > 0 && <details><summary className="im-helper" style={{ color: '#b45309' }}>⚠ {res.diff.bindingIssues.length} سلول نگاشت‌شده تغییر متن داده</summary><ul style={{ margin: 0 }}>{res.diff.bindingIssues.map((x) => <li key={x} className="im-helper" dir="auto">{x}</li>)}</ul></details>}
          </>}
          <div style={{ overflow: 'auto', maxHeight: 420, border: '1px solid var(--im-line, #e2e8f0)', background: '#f1f5f9', padding: 6 }}><div style={{ zoom: 0.7, width: 'fit-content' }}><GridSheet tpl={res.layout} mark={new Set(bindings.map((b) => b.cell))} /></div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!canEdit || busy || blocked} onClick={async () => {
              if (!window.confirm(base ? 'فایل به‌عنوان نسخهٔ پیش‌نویس جدید ثبت می‌شود. بعد از ثبت باید نسخه را تأیید و نگاشت را تأیید کنید. ادامه؟' : 'فرم جدید به‌عنوان پیش‌نویس (بدون نگاشت) ثبت می‌شود. ادامه؟')) return
              setBusy(true); const ok = await onSave(res.layout); setBusy(false); if (ok) setRes(null)
            }}><Save size={13} /> ثبت به‌عنوان نسخهٔ پیش‌نویس {base ? 'جدید' : 'فرم جدید'}</button>
            <button className="im-btn im-btn-sm" onClick={() => setRes(null)}>انصراف</button>
          </div>
        </div>
      )}
    </div>
  )
}
