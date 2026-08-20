import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Copy, ExternalLink, FileText, Link2, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { ATTACHMENT_KIND_LABEL_FA, type AttachmentKind, type CompetencyAssessment } from '../types'

interface DocumentsStageProps {
  assessment: CompetencyAssessment
}

const KINDS: AttachmentKind[] = ['resume', 'education', 'certification', 'national_id', 'insurance', 'other']

const SELF_SERVICE_STATUS_LABEL: Record<string, string> = {
  not_sent: 'ارسال نشده',
  pending: 'لینک ارسال شده — در انتظار تکمیل توسط نامزد',
  submitted: 'نامزد اطلاعات را ثبت کرد — در انتظار بررسی',
  reviewed: 'بررسی شد',
}

/** Document attachments (resume, national ID, education/certification scans, insurance records) plus the candidate self-service link — the interview team just reviews what the candidate submits through that link. */
export function DocumentsStage({ assessment }: DocumentsStageProps) {
  const attachments = useCompetencyStore((s) => s.attachments).filter((a) => a.assessmentId === assessment.id)
  const fetchAttachments = useCompetencyStore((s) => s.fetchAttachments)
  const addAttachment = useCompetencyStore((s) => s.addAttachment)
  const deleteAttachment = useCompetencyStore((s) => s.deleteAttachment)
  const uploadPhoto = useCompetencyStore((s) => s.uploadPhoto)
  const regenerateSelfServiceLink = useCompetencyStore((s) => s.regenerateSelfServiceLink)
  const markSelfServiceSent = useCompetencyStore((s) => s.markSelfServiceSent)
  const markReviewed = useCompetencyStore((s) => s.markReviewed)

  const [kind, setKind] = useState<AttachmentKind>('other')
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchAttachments(assessment.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.id])

  const selfServiceUrl = `${window.location.origin}${window.location.pathname}?candidate=${assessment.selfServiceToken}`

  return (
    <div className="space-y-4">
      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Link2 size={14} className="text-brand-300" /> لینک خوداظهاری نامزد
        </p>
        <p className="text-[11px] leading-5 text-muted">
          این لینک را برای نامزد ارسال کنید تا مشخصات و مدارک خود را مستقیماً ثبت کند؛ تیم مصاحبه‌کننده فقط آن‌ها را بررسی می‌کند.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input readOnly value={selfServiceUrl} dir="ltr" className="input flex-1 text-[11px]" onFocus={(e) => e.target.select()} />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(selfServiceUrl)
              setCopied(true)
              markSelfServiceSent(assessment.id)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-brand-400"
          >
            <Copy size={12} /> {copied ? 'کپی شد' : 'کپی لینک'}
          </button>
          <button
            type="button"
            onClick={() => regenerateSelfServiceLink(assessment.id)}
            title="صدور لینک جدید (لینک قبلی غیرفعال می‌شود)"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-secondary hover:bg-white/5"
          >
            <RefreshCw size={12} /> لینک جدید
          </button>
        </div>
        <div className="flex items-center justify-between">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
              assessment.selfServiceStatus === 'submitted'
                ? 'bg-amber-500/15 text-amber-300'
                : assessment.selfServiceStatus === 'reviewed'
                  ? 'bg-green-500/15 text-green-300'
                  : 'bg-white/5 text-muted'
            }`}
          >
            {SELF_SERVICE_STATUS_LABEL[assessment.selfServiceStatus]}
          </span>
          {assessment.selfServiceStatus === 'submitted' && (
            <button
              type="button"
              onClick={() => markReviewed(assessment.id)}
              className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-green-400"
            >
              <CheckCircle2 size={13} /> علامت‌گذاری «بررسی شد»
            </button>
          )}
        </div>
      </div>

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Camera size={14} className="text-brand-300" /> عکس پرسنلی
        </p>
        <div className="flex items-center gap-3">
          <PhotoPreview path={assessment.photoUrl} />
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-[11px] text-secondary hover:bg-white/5"
          >
            <Upload size={13} /> بارگذاری عکس
          </button>
          <input
            ref={photoRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) uploadPhoto(assessment.id, f)
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <FileText size={14} className="text-brand-300" /> مدارک پیوست‌شده
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)} className="input max-w-[12rem]">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {ATTACHMENT_KIND_LABEL_FA[k]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? 'در حال بارگذاری…' : 'بارگذاری مدرک'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) {
                setUploading(true)
                await addAttachment(assessment.id, kind, f)
                setUploading(false)
              }
              e.target.value = ''
            }}
          />
        </div>
        {attachments.length === 0 ? (
          <p className="text-[11px] text-muted">مدرکی بارگذاری نشده است.</p>
        ) : (
          <div className="space-y-1.5">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">{ATTACHMENT_KIND_LABEL_FA[a.kind]}</span>
                  <span className="truncate" dir="ltr">
                    {a.fileName}
                  </span>
                  {a.uploadedByCandidate && <span className="shrink-0 text-[10px] text-amber-300">توسط نامزد</span>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <AttachmentOpenButton path={a.storagePath} />
                  <button onClick={() => deleteAttachment(a.id)} className="text-muted hover:text-red-300">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PhotoPreview({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (path) getCompDocSignedUrl(path).then((u) => active && setUrl(u))
    return () => {
      active = false
    }
  }, [path])
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Camera size={18} className="text-muted" />}
    </div>
  )
}

function AttachmentOpenButton({ path }: { path: string }) {
  const [loading, setLoading] = useState(false)
  return (
    <button
      onClick={async () => {
        setLoading(true)
        const url = await getCompDocSignedUrl(path)
        setLoading(false)
        if (url) window.open(url, '_blank', 'noopener')
      }}
      disabled={loading}
      className="flex items-center gap-1 text-muted hover:text-brand-300 disabled:opacity-50"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
    </button>
  )
}
