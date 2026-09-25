import { useRef, useState } from 'react'
import { Check, Download, FileUp, Loader2, MessageSquareText, Paperclip, Trash2 } from 'lucide-react'
import { getLifecycleDocSignedUrl, uploadLifecycleDoc } from '../lib/plcStorage'
import { useLifecycleStore } from '../store/useLifecycleStore'
import type { ChecklistItem } from '../types'
import { STATUS_COLOR } from './ui'

/**
 * Where evidence goes.
 *
 * Every checklist item carrying `requiresDocument` gets this panel, so the answer to "where do I
 * upload the document?" is always the same place: directly under the item that demands it. Two
 * inputs, deliberately paired — the file itself, and a short note from the person attaching it.
 * A scanned PDF named `scan_004.pdf` tells a reviewer nothing; the note is what turns an
 * attachment into evidence someone else can judge without opening it.
 */
export function EvidencePanel({ item, onClose }: { item: ChecklistItem; onClose?: () => void }) {
  const updateChecklistItem = useLifecycleStore((s) => s.updateChecklistItem)
  const fileRef = useRef<HTMLInputElement>(null)

  const [label, setLabel] = useState(item.evidenceLabel)
  const [note, setNote] = useState(item.comment)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const hasDoc = Boolean(item.evidenceUrl)
  const dirty = pendingFile !== null || label !== item.evidenceLabel || note !== item.comment

  async function openDoc() {
    const url = await getLifecycleDocSignedUrl(item.evidenceUrl)
    if (url) window.open(url, '_blank', 'noopener')
    else setError('لینک دانلود در دسترس نیست')
  }

  async function save() {
    setBusy(true)
    setError('')
    let evidenceUrl = item.evidenceUrl

    if (pendingFile) {
      const res = await uploadLifecycleDoc(pendingFile, item.projectId)
      if (res.error || !res.path) {
        setError(res.error ?? 'بارگذاری ناموفق بود')
        setBusy(false)
        return
      }
      evidenceUrl = res.path
    }

    await updateChecklistItem(item, {
      evidenceUrl,
      // Falling back to the file name keeps the list readable when the user skips the label.
      evidenceLabel: label.trim() || pendingFile?.name || item.evidenceLabel,
      comment: note.trim(),
    })
    setPendingFile(null)
    setBusy(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onClose?.()
  }

  return (
    <div
      className="mt-2 space-y-2.5 rounded-xl border p-3"
      style={{ borderColor: 'var(--border-soft)', background: 'rgba(255,255,255,0.02)' }}
    >
      {/* Attached document */}
      <div>
        <label className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-secondary">
          <Paperclip size={11} /> مدرک پشتیبان
          {item.requiresDocument && <span style={{ color: STATUS_COLOR.red }}>*</span>}
        </label>

        {hasDoc && !pendingFile ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5"
            style={{ borderColor: `${STATUS_COLOR.green}44`, background: `${STATUS_COLOR.green}0d` }}>
            <Check size={12} style={{ color: STATUS_COLOR.green }} />
            <span className="min-w-0 flex-1 truncate text-[10px]">{item.evidenceLabel || 'مدرک پیوست‌شده'}</span>
            <button onClick={openDoc} className="flex items-center gap-1 text-[10px] text-sky-400 hover:underline">
              <Download size={11} /> دریافت
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="text-[10px] text-muted hover:text-primary"
            >
              جایگزینی
            </button>
          </div>
        ) : pendingFile ? (
          <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
            style={{ borderColor: 'var(--border-soft)' }}>
            <FileUp size={12} className="text-sky-400" />
            <span className="min-w-0 flex-1 truncate text-[10px]">{pendingFile.name}</span>
            <span className="text-[9px] text-muted">{(pendingFile.size / 1024).toFixed(0)} KB</span>
            <button onClick={() => setPendingFile(null)} className="text-muted hover:text-primary">
              <Trash2 size={11} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-[10px] text-muted transition-colors hover:border-sky-400/60 hover:text-sky-400"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <FileUp size={13} /> انتخاب فایل (PDF، تصویر، Word، Excel — حداکثر ۱۵ مگابایت)
          </button>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) { setPendingFile(f); setError(''); if (!label.trim()) setLabel(f.name) }
            e.target.value = ''
          }}
        />
      </div>

      {/* Human-readable title for the document */}
      <label className="block text-[10px] text-muted">
        عنوان مدرک
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="مثلاً: صورتجلسه تأیید طراحی پایه — شماره ۱۲/۴۵"
          className="mt-1 w-full rounded-lg border bg-black/20 px-2.5 py-1.5 text-[11px] outline-none focus:border-sky-400/60"
          style={{ borderColor: 'var(--border-soft)' }}
        />
      </label>

      {/* The short explanatory note */}
      <label className="block text-[10px] text-muted">
        <span className="flex items-center gap-1.5 font-bold text-secondary">
          <MessageSquareText size={11} /> توضیح کوتاه کاربر
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="در یک یا دو جمله بنویسید این مدرک چه چیزی را اثبات می‌کند و چه نکته‌ای برای بازبین دارد."
          className="mt-1 w-full resize-none rounded-lg border bg-black/20 px-2.5 py-2 text-[11px] leading-relaxed outline-none focus:border-sky-400/60"
          style={{ borderColor: 'var(--border-soft)' }}
        />
        <span className="mt-0.5 block text-left text-[9px] text-muted">{note.length}/۵۰۰</span>
      </label>

      {error && <p className="text-[10px]" style={{ color: STATUS_COLOR.red }}>{error}</p>}

      <div className="flex items-center gap-2">
        <button
          disabled={busy || !dirty}
          onClick={save}
          className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-[11px] font-medium text-white transition-opacity disabled:opacity-40"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : null}
          {busy ? 'در حال ذخیره...' : saved ? 'ذخیره شد' : 'ذخیره مدرک و توضیح'}
        </button>
        {onClose && (
          <button onClick={onClose} className="text-[10px] text-muted hover:text-primary">بستن</button>
        )}
      </div>
    </div>
  )
}
