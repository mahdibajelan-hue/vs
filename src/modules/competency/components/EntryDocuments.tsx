import { useEffect, useRef, useState } from 'react'
import { ExternalLink, File, FileImage, FileText, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import { COMP_DOC_ACCEPT, validateCompDoc } from '../lib/compStorage'
import type { DocCategory } from '../types'
import { docsFor, formatFileSizeFa, type ProfileDocItem, type ProfileDocuments } from '../lib/profileDocuments'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif']

/** The «بارگذاری مدرک» button of one entry (or of the national-ID / résumé slot) with a chip per
 * uploaded file. Validates type and the 300 KB limit before anything is sent. */
export function DocumentSlot({
  docs,
  category,
  entryRef = null,
  buttonLabel = 'بارگذاری مدرک',
  emptyHint,
}: {
  docs: ProfileDocuments
  category: DocCategory
  entryRef?: string | null
  buttonLabel?: string
  emptyHint?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const items = docsFor(docs, category, entryRef)

  const handleFile = async (file: File) => {
    const invalid = validateCompDoc(file)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setBusy(true)
    const failed = await docs.upload(category, entryRef, file)
    setBusy(false)
    if (failed) setError(failed)
  }

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => (
          <DocChip
            key={item.id}
            item={item}
            signedUrl={docs.signedUrl}
            onRemove={
              docs.editable && docs.canRemove(item)
                ? async () => {
                    setError(null)
                    const failed = await docs.remove(item)
                    if (failed) setError(failed)
                  }
                : undefined
            }
          />
        ))}
        {docs.editable ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2.5 py-1.5 text-[10.5px] text-secondary hover:bg-white/5 disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {busy ? 'در حال بارگذاری…' : buttonLabel}
          </button>
        ) : (
          items.length === 0 && <span className="text-[10px] text-muted">{emptyHint ?? 'مدرکی پیوست نشده است.'}</span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={COMP_DOC_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {docs.editable && items.length === 0 && !error && <p className="text-[9.5px] text-muted">PDF یا تصویر JPG/PNG — حداکثر ۳۰۰ کیلوبایت</p>}
      {error && <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10.5px] text-red-200">{error}</p>}
    </div>
  )
}

/** Compact file chip: image thumbnail (or a file-type icon), file name + size, open and remove. */
export function DocChip({
  item,
  signedUrl,
  onRemove,
}: {
  item: ProfileDocItem
  signedUrl: (path: string) => Promise<string | null>
  onRemove?: () => void
}) {
  const ext = item.fileName.split('.').pop()?.toLowerCase() ?? ''
  const isImage = IMAGE_EXTENSIONS.includes(ext)
  const [thumb, setThumb] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    let active = true
    if (isImage) signedUrl(item.storagePath).then((u) => active && setThumb(u))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.storagePath, isImage])

  const open = async () => {
    const url = thumb ?? (await signedUrl(item.storagePath))
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="flex max-w-full items-center gap-1.5 rounded-lg border border-purple-400/20 bg-purple-500/[0.06] py-1 pl-1.5 pr-1">
      <button type="button" onClick={open} className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-white/5" title="مشاهده">
        {isImage && thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : isImage ? (
          <FileImage size={13} className="text-purple-300" />
        ) : ext === 'pdf' ? (
          <FileText size={13} className="text-purple-300" />
        ) : (
          <File size={13} className="text-purple-300" />
        )}
      </button>
      <div className="min-w-0">
        <p className="max-w-[10rem] truncate text-[10.5px]" dir="ltr" title={item.fileName}>
          {item.fileName}
        </p>
        {item.fileSize != null && <p className="text-[9px] text-muted">{formatFileSizeFa(item.fileSize)}</p>}
      </div>
      <button type="button" onClick={open} className="text-muted hover:text-purple-300" title="باز کردن">
        <ExternalLink size={11} />
      </button>
      {onRemove && (
        <button
          type="button"
          disabled={removing}
          onClick={async () => {
            setRemoving(true)
            await onRemove()
            setRemoving(false)
          }}
          className="text-muted hover:text-red-300 disabled:opacity-50"
          title="حذف مدرک"
        >
          {removing ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
        </button>
      )}
    </div>
  )
}

/** Small header used by the national-ID and résumé slots. */
export function DocSlotHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11.5px] font-bold">
        <Paperclip size={12} className="text-purple-300" /> {title}
      </p>
      {hint && <p className="mt-0.5 text-[10px] leading-5 text-muted">{hint}</p>}
    </div>
  )
}
