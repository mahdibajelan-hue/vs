import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, CheckCircle2, Copy, FileText, Link2, RefreshCw, Upload, Loader2 } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { COMP_DOC_ACCEPT, getCompDocSignedUrl } from '../lib/compStorage'
import { DocumentsGallery } from '../components/DocumentsGallery'
import { useStaffProfileDocuments } from '../components/useStaffProfileDocuments'
import type { CompetencyAssessment } from '../types'

interface DocumentsStageProps {
  assessment: CompetencyAssessment
  /** Only the team lead may confirm the candidate's self-declared documents/profile are correct. */
  isLead: boolean
  /** Lead or assessment designer — the only standing comp_set_photo accepts (schema.sql Section 53),
   * and the same standing comp_add_attachment / comp_remove_attachment require (Section 55). */
  canSetPhoto: boolean
  /** Advances the wizard to the next stage (پنل مصاحبه‌گران) — omitted only when the caller has no
   * further stage to send this viewer to. */
  onContinue?: () => void
}

const SELF_SERVICE_STATUS_LABEL: Record<string, string> = {
  not_sent: 'ارسال نشده',
  pending: 'لینک ارسال شده — در انتظار تکمیل توسط نامزد',
  submitted: 'نامزد اطلاعات را ثبت کرد — در انتظار بررسی',
  reviewed: 'بررسی شد',
}

/** Document attachments (resume, national ID, education/certification scans, insurance records) plus the candidate self-service link — the interview team just reviews what the candidate submits through that link. */
export function DocumentsStage({ assessment, isLead, canSetPhoto, onContinue }: DocumentsStageProps) {
  const canManageDocuments = canSetPhoto
  const documents = useStaffProfileDocuments(assessment.id, assessment.status, canManageDocuments)
  const uploadPhoto = useCompetencyStore((s) => s.uploadPhoto)
  const regenerateSelfServiceLink = useCompetencyStore((s) => s.regenerateSelfServiceLink)
  const markSelfServiceSent = useCompetencyStore((s) => s.markSelfServiceSent)
  const markReviewed = useCompetencyStore((s) => s.markReviewed)

  const [docError, setDocError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const selfServiceUrl = `${window.location.origin}${window.location.pathname}?candidate=${assessment.selfServiceToken}`

  return (
    <div className="space-y-4">
      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Link2 size={14} className="text-purple-300" /> لینک خوداظهاری نامزد
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
            className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400"
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
          {assessment.selfServiceStatus === 'submitted' &&
            (isLead ? (
              <button
                type="button"
                onClick={() => markReviewed(assessment.id)}
                className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-green-400"
              >
                <CheckCircle2 size={13} /> علامت‌گذاری «بررسی شد»
              </button>
            ) : (
              <span className="text-[10px] text-muted">تایید اطلاعات خوداظهاری فقط توسط مسئول تیم انجام می‌شود</span>
            ))}
        </div>
      </div>

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Camera size={14} className="text-purple-300" /> عکس پرسنلی
        </p>
        <div className="flex items-center gap-3">
          <PhotoPreview path={assessment.photoUrl} />
          {canSetPhoto ? (
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-[11px] text-secondary hover:bg-white/5"
          >
            <Upload size={13} /> بارگذاری عکس
          </button>
          ) : (
            <span className="text-[10.5px] text-muted">بارگذاری عکس توسط مسئول ارزیابی یا طراح آزمون انجام می‌شود.</span>
          )}
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
          <FileText size={14} className="text-purple-300" /> مدارک نامزد
        </p>
        <p className="text-[10.5px] leading-5 text-muted">
          مدارک هر ردیف (تحصیلات، سوابق شغلی، دوره‌ها) و کارت ملی و رزومه در خود فرم مشخصات بارگذاری می‌شوند — توسط نامزد از طریق لینک خوداظهاری یا
          توسط مسئول ارزیابی در «ویرایش» مشخصات. این‌جا همه‌ی آن‌ها به تفکیک دسته و ردیف دیده می‌شوند.
        </p>
        <DocumentsGallery
          items={documents.items}
          education={assessment.education}
          employment={assessment.employmentHistory}
          certifications={assessment.certifications}
          onDelete={documents.editable ? (d) => documents.remove(d).then((err) => setDocError(err)) : undefined}
        />
        {documents.editable && (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
            <span className="text-[10.5px] text-muted">مدرک دیگری که به ردیف خاصی مربوط نیست:</span>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-1.5 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-50"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? 'در حال بارگذاری…' : 'بارگذاری در «سایر»'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={COMP_DOC_ACCEPT}
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                setUploading(true)
                setDocError(await documents.upload('OTHER', null, f))
                setUploading(false)
              }}
            />
          </div>
        )}
        {docError && <p className="rounded-lg border border-red-400/30 bg-red-500/10 p-2 text-[11px] text-red-200">{docError}</p>}
      </div>

      {onContinue && (
        <div className="flex justify-end">
          <button onClick={onContinue} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
            ادامه <ArrowLeft size={13} />
          </button>
        </div>
      )}
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
