import { useRef, useState } from 'react'
import { ArrowLeft, Camera, CheckCircle2, Copy, FileText, Link2, Lock, LockOpen, RefreshCw, Upload, Loader2 } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { COMP_DOC_ACCEPT } from '../lib/compStorage'
import { CandidatePhoto } from '../components/CandidatePhoto'
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
  submitted: 'نامزد اطلاعات را ثبت کرد — در انتظار تأیید',
  reviewed: 'تأیید و بسته شد',
}

/** Document attachments (resume, national ID, education/certification scans, insurance records) plus the candidate self-service link — the interview team just reviews what the candidate submits through that link. */
export function DocumentsStage({ assessment, isLead, canSetPhoto, onContinue }: DocumentsStageProps) {
  const canManageDocuments = canSetPhoto
  const documents = useStaffProfileDocuments(assessment.id, assessment.status, canManageDocuments)
  const uploadPhoto = useCompetencyStore((s) => s.uploadPhoto)
  const regenerateSelfServiceLink = useCompetencyStore((s) => s.regenerateSelfServiceLink)
  const markSelfServiceSent = useCompetencyStore((s) => s.markSelfServiceSent)
  const markReviewed = useCompetencyStore((s) => s.markReviewed)
  const reopenSelfService = useCompetencyStore((s) => s.reopenSelfService)
  const [confirmClose, setConfirmClose] = useState(false)
  const [busy, setBusy] = useState(false)
  const status = assessment.selfServiceStatus
  const completed = assessment.status === 'completed'

  const [docError, setDocError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const linkFor = (token: string) => `${window.location.origin}${window.location.pathname}?candidate=${encodeURIComponent(token)}`
  const selfServiceUrl = linkFor(assessment.selfServiceToken)

  // Copies the CURRENT link: comp_mark_self_service_sent returns the token stored right now, so a tab
  // opened before someone pressed «لینک جدید» (or before the new-candidate read-back) can no longer
  // hand the candidate a link that is already dead.
  const copyLink = async () => {
    const fresh = await markSelfServiceSent(assessment.id)
    const url = linkFor(fresh ?? assessment.selfServiceToken)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // Clipboard blocked (non-secure context / permissions): the field below still shows the link.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400"
          >
            <Copy size={12} /> {copied ? 'کپی شد' : 'کپی لینک'}
          </button>
          {isLead && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'با صدور لینک جدید، لینک قبلی دیگر فرم را باز نمی‌کند (نامزد با باز کردن آن پیام «لینک جدیدی برای شما صادر شده است» می‌بیند). اطلاعات و مدارک ثبت‌شده حفظ می‌شوند. ادامه می‌دهید؟',
                  )
                )
                  regenerateSelfServiceLink(assessment.id)
              }}
              title="صدور لینک جدید (لینک قبلی غیرفعال می‌شود)"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-secondary hover:bg-white/5"
            >
              <RefreshCw size={12} /> لینک جدید
            </button>
          )}
        </div>
        <p className="text-[10px] leading-5 text-muted">
          لینک تاریخ انقضا ندارد. فقط در این حالت‌ها فرم را باز نمی‌کند: صدور «لینک جدید» (لینک قبلی باطل می‌شود)، تأیید و بستن فرم توسط مسئول ارزیابی، یا
          نهایی شدن ارزیابی — و در هر حالت نامزد پیام مشخص همان حالت را می‌بیند.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          {isLead && !completed && (status === 'submitted' || status === 'pending') && (
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold ${
                status === 'submitted' ? 'bg-green-500 text-white hover:bg-green-400' : 'border border-white/10 text-secondary hover:bg-white/5'
              }`}
            >
              <CheckCircle2 size={13} /> تأیید و بستن فرم خوداظهاری
            </button>
          )}
          {isLead && !completed && status === 'reviewed' && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm('فرم دوباره برای نامزد باز می‌شود تا اطلاعات یا مدارکش را اصلاح کند (با همان لینک). پس از ثبت دوباره، باید مجدداً تأیید و بسته شود. ادامه می‌دهید؟')) return
                setBusy(true)
                await reopenSelfService(assessment.id)
                setBusy(false)
              }}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-50"
            >
              <LockOpen size={13} /> بازگشایی فرم برای نامزد
            </button>
          )}
          {!isLead && status === 'submitted' && <span className="text-[10px] text-muted">تأیید و بستن فرم خوداظهاری فقط توسط مسئول ارزیابی انجام می‌شود</span>}
        </div>
        <p className="text-[10px] leading-5 text-muted">
          «تأیید و بستن» یعنی مشخصات و مدارک نامزد بررسی شد و درست است: فرم برای نامزد قفل می‌شود تا اطلاعات زیر دست داوران تغییر نکند، مرحله‌ی «غربالگری اولیه»
          با تاریخ تأیید ثبت می‌شود و کار «تأیید فرم خوداظهاری» از فهرست اقدامات داشبورد حذف می‌شود. در صورت نیاز می‌توانید فرم را دوباره باز کنید.
        </p>
      </div>

      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="glass-panel w-full max-w-md space-y-3 rounded-2xl p-5">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Lock size={15} className="text-amber-300" /> تأیید و بستن فرم خوداظهاری
            </p>
            <ul className="list-disc space-y-1 pr-5 text-[11.5px] leading-6 text-secondary">
              <li>فرم نامزد قفل می‌شود؛ با همان لینک دیگر نمی‌تواند مشخصات را تغییر دهد یا مدرکی بارگذاری/حذف کند و پیام «این فرم توسط کارشناس بررسی و بسته شده است» را می‌بیند.</li>
              <li>مرحله‌ی «غربالگری اولیه» با نام شما و تاریخ امروز ثبت می‌شود و این نامزد از فهرست «نیازمند اقدام» داشبورد خارج می‌شود.</li>
              <li>شما همچنان می‌توانید مشخصات و مدارک را از بخش «ویرایش» اصلاح کنید و در صورت نیاز فرم را برای نامزد بازگشایی کنید.</li>
            </ul>
            {status === 'pending' && <p className="text-[11px] text-amber-300">نامزد هنوز فرم را ثبت نکرده است؛ با بستن فرم دیگر نمی‌تواند آن را تکمیل کند.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmClose(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-secondary hover:bg-white/5">
                انصراف
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await markReviewed(assessment.id)
                  setBusy(false)
                  setConfirmClose(false)
                }}
                className="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-green-400 disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} تأیید و بستن فرم
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Camera size={14} className="text-purple-300" /> عکس پرسنلی
        </p>
        <div className="flex items-center gap-3">
          <CandidatePhoto path={assessment.photoUrl} size={56} />
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
