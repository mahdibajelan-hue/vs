import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Modal } from '../../../components/common/Modal'
import type { Activity } from '../../execution/types'

const PAGE = 80
const norm = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[‌‏]/g, ' ')
    .toLowerCase()

/** A field that opens a searchable wizard instead of a native <select>: price-book rows are long, so the list
 * wraps inside the dialog and can be filtered by item number, any words of the row, chapter and price-book group. */
export function ActivityPicker({ activities, value, onChange, allowEmpty = false, emptyLabel = '—', exclude, title = 'انتخاب فعالیت', width = 280 }: {
  activities: Activity[]
  value: string
  onChange: (id: string) => void
  allowEmpty?: boolean
  emptyLabel?: string
  exclude?: string
  title?: string
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const cur = activities.find((a) => a.id === value)
  return (
    <>
      <button type="button" className="im-btn im-btn-sm" style={{ maxWidth: width, minWidth: 120, justifyContent: 'flex-start', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textAlign: 'right' }} onClick={() => setOpen(true)} title={cur?.title}>
        {cur ? `${cur.itemNo ? `${cur.itemNo} — ` : ''}${cur.title}` : emptyLabel}
      </button>
      {open && <PickerDialog title={title} activities={activities.filter((a) => a.id !== exclude)} value={value} allowEmpty={allowEmpty} emptyLabel={emptyLabel} onPick={(id) => { onChange(id); setOpen(false) }} onClose={() => setOpen(false)} />}
    </>
  )
}

function PickerDialog({ title, activities, value, allowEmpty, emptyLabel, onPick, onClose }: { title: string; activities: Activity[]; value: string; allowEmpty: boolean; emptyLabel: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [chapter, setChapter] = useState('')
  const [group, setGroup] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const chapters = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of activities) { const k = `${a.chapterNo}|${a.chapter}`; if (!m.has(k)) m.set(k, `${a.chapterNo ? `${a.chapterNo} — ` : ''}${a.chapter || 'بدون فصل'}`) }
    return [...m.entries()]
  }, [activities])
  const groups = useMemo(() => [...new Set(activities.map((a) => a.weightGroup).filter(Boolean))], [activities])
  const rows = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return activities.filter((a) => {
      if (chapter && `${a.chapterNo}|${a.chapter}` !== chapter) return false
      if (group && a.weightGroup !== group) return false
      if (!words.length) return true
      const hay = norm([a.itemNo, a.title, a.chapter, a.chapterNo, a.spec, a.remark, a.weightGroup].join(' '))
      return words.every((w) => hay.includes(w))
    })
  }, [activities, q, chapter, group])
  const shown = rows.slice(0, limit)
  return (
    <Modal title={title} subtitle="جست‌وجو بر اساس شمارهٔ فهرست‌بها، بخشی از کلمات ردیف یا عنوان فصل" onClose={onClose} width="max-w-3xl">
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ position: 'relative', display: 'block' }}>
          <Search size={14} style={{ position: 'absolute', insetInlineStart: 10, top: 11, opacity: 0.6 }} aria-hidden />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }} placeholder="مثلاً 510226007 یا جوشکاری یا حفاری کانال…" dir="auto" aria-label="جست‌وجو" style={{ width: '100%', paddingInlineStart: 30 }} />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={chapter} onChange={(e) => { setChapter(e.target.value); setLimit(PAGE) }} aria-label="فصل" style={{ maxWidth: 260 }}><option value="">همهٔ فصل‌ها</option>{chapters.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={group} onChange={(e) => { setGroup(e.target.value); setLimit(PAGE) }} aria-label="فهرست‌بها" style={{ maxWidth: 260 }}><option value="">همهٔ فهرست‌ها</option>{groups.map((g) => <option key={g}>{g}</option>)}</select>
          {(q || chapter || group) && <button type="button" className="im-btn im-btn-sm" onClick={() => { setQ(''); setChapter(''); setGroup(''); setLimit(PAGE) }}><X size={12} /> پاک‌کردن فیلترها</button>}
          <span className="im-helper" style={{ margin: 0, alignSelf: 'center' }}>{rows.length.toLocaleString('fa-IR')} ردیف</span>
        </div>
        <div style={{ maxHeight: '52vh', overflowY: 'auto', display: 'grid', gap: 6 }} role="listbox" aria-label="فعالیت‌ها">
          {allowEmpty && <button type="button" role="option" aria-selected={!value} className="im-card-flat" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => onPick('')}>{emptyLabel}</button>}
          {shown.map((a) => (
            <button key={a.id} type="button" role="option" aria-selected={a.id === value} className="im-card-flat" onClick={() => onPick(a.id)}
              style={{ textAlign: 'right', cursor: 'pointer', display: 'grid', gap: 3, whiteSpace: 'normal', overflowWrap: 'anywhere', outline: a.id === value ? '2px solid var(--accent, #6366f1)' : undefined }}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b dir="ltr" className="fn-code">{a.itemNo || '—'}</b>
                <span className="im-helper" style={{ margin: 0 }}>{a.chapterNo ? `فصل ${a.chapterNo} — ` : ''}{a.chapter}{a.weightGroup ? ` · ${a.weightGroup}` : ''}</span>
                {a.unit && <span className="im-helper" style={{ margin: 0 }}>واحد: {a.unit}</span>}
              </span>
              <span style={{ fontSize: 12.5, lineHeight: 1.7 }}>{a.title}{a.spec ? ` — ${a.spec}` : ''}</span>
            </button>
          ))}
          {!rows.length && <p className="im-helper" style={{ textAlign: 'center' }}>ردیفی با این مشخصات پیدا نشد.</p>}
          {rows.length > shown.length && <button type="button" className="im-btn im-btn-sm" onClick={() => setLimit(limit + PAGE)}>نمایش {PAGE.toLocaleString('fa-IR')} ردیف بعدی ({(rows.length - shown.length).toLocaleString('fa-IR')} باقی‌مانده)</button>}
        </div>
      </div>
    </Modal>
  )
}
