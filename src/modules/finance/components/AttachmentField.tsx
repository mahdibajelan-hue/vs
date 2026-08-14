import { useRef, useState } from 'react'
import { FileText, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { financeDocFileName, getFinanceDocSignedUrl, uploadFinanceDoc } from '../lib/financeStorage'

/** Upload/replace/remove control for a finance document attachment, used in Certificate/Guarantee forms. */
export function AttachmentField({ folder, value, onChange }: { folder: string; value: string; onChange: (path: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const pick = async (file: File) => {
    setUploading(true)
    setError('')
    const { path, error: err } = await uploadFinanceDoc(file, folder)
    setUploading(false)
    if (err || !path) {
      setError('خطا در بارگذاری سند — ' + (err ?? ''))
      return
    }
    onChange(path)
  }

  return (
    <div>
      <span className="mb-1 block text-xs fin-text-secondary">سند پیوست (قرارداد، تاییدیه، فاکتور و ...)</span>
      {value ? (
        <div className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px]" style={{ borderColor: 'var(--fin-divider)' }}>
          <FileText size={13} className="shrink-0 fin-text-muted" />
          <span className="min-w-0 flex-1 truncate fin-text-secondary" dir="ltr">
            {financeDocFileName(value)}
          </span>
          <button type="button" onClick={() => onChange('')} className="shrink-0 fin-text-muted hover:text-red-400">
            <Trash2 size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-[11px] fin-text-secondary hover:opacity-70 disabled:opacity-50"
          style={{ borderColor: 'var(--fin-divider)' }}
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
          {uploading ? 'در حال بارگذاری...' : 'بارگذاری سند'}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) pick(f)
          e.target.value = ''
        }}
      />
      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

/** Small "view document" trigger that resolves a signed URL on demand (the bucket is private). */
export function AttachmentLink({ path }: { path: string }) {
  const [loading, setLoading] = useState(false)
  if (!path) return null

  const open = async () => {
    setLoading(true)
    const url = await getFinanceDocSignedUrl(path)
    setLoading(false)
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <button onClick={open} disabled={loading} className="flex items-center gap-1 text-[10.5px] fin-text-secondary hover:underline disabled:opacity-50">
      <Paperclip size={11} /> {loading ? 'در حال باز کردن...' : 'مشاهده سند'}
    </button>
  )
}
