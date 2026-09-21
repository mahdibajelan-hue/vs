import { useEffect, useState } from 'react'
import { ExternalLink, File, FileImage, FileText, Loader2, Trash2 } from 'lucide-react'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { ATTACHMENT_KIND_LABEL_FA, type AttachmentKind } from '../types'

const KIND_COLOR: Record<AttachmentKind, string> = {
  resume: '#a855f7',
  education: '#38bdf8',
  certification: '#f59e0b',
  national_id: '#34d399',
  insurance: '#fb7185',
  other: '#94a3b8',
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif']

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

interface AttachmentPreviewCardProps {
  kind: AttachmentKind
  fileName: string
  storagePath: string
  uploadedByCandidate?: boolean
  onDelete?: () => void
}

/** Small thumbnail card for one uploaded document — an actual image preview for image files, a
 * colored file-type icon otherwise, with the document kind written bold in its own accent color so
 * a row of attachments reads at a glance instead of as a plain list of filenames. */
export function AttachmentPreviewCard({ kind, fileName, storagePath, uploadedByCandidate, onDelete }: AttachmentPreviewCardProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const color = KIND_COLOR[kind] ?? KIND_COLOR.other
  const ext = extensionOf(fileName)
  const isImage = IMAGE_EXTENSIONS.includes(ext)

  useEffect(() => {
    let active = true
    if (isImage) getCompDocSignedUrl(storagePath).then((u) => active && setUrl(u))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storagePath, isImage])

  const handleOpen = async () => {
    setOpening(true)
    const signed = url ?? (await getCompDocSignedUrl(storagePath))
    setOpening(false)
    if (signed) window.open(signed, '_blank', 'noopener')
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl border p-2" style={{ borderColor: `${color}30`, background: `${color}0a` }}>
      <button
        type="button"
        onClick={handleOpen}
        disabled={opening}
        className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border"
        style={{ borderColor: `${color}35`, background: `${color}12` }}
        title="مشاهده"
      >
        {opening ? (
          <Loader2 size={16} className="animate-spin" style={{ color }} />
        ) : isImage && url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : isImage ? (
          <FileImage size={18} style={{ color }} />
        ) : ext === 'pdf' ? (
          <FileText size={18} style={{ color }} />
        ) : (
          <File size={18} style={{ color }} />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] font-extrabold" style={{ color }}>
          {ATTACHMENT_KIND_LABEL_FA[kind]}
        </p>
        <p className="truncate text-[10px] text-muted" dir="ltr">
          {fileName}
        </p>
        {uploadedByCandidate && <span className="text-[9.5px] text-amber-300">توسط نامزد</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button onClick={handleOpen} disabled={opening} className="text-muted hover:text-purple-300" title="باز کردن">
          <ExternalLink size={13} />
        </button>
        {onDelete && (
          <button onClick={onDelete} className="text-muted hover:text-red-300" title="حذف">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
