import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, FileText, Loader2, Lock, Upload } from 'lucide-react'
import { FARIN_NAME_FA } from '../../../components/common/Logo'
import { compAnonClient, compDocErrorFa, getCompDocSignedUrl, removeCompDocObject, uploadCandidateDocument, uploadCompDocAsCandidate, validateCompDoc } from '../lib/compStorage'
import { ProfileForm } from '../components/ProfileForm'
import { DocumentsGallery } from '../components/DocumentsGallery'
import type { ProfileDocItem, ProfileDocuments } from '../lib/profileDocuments'
import type { CandidateProfileInput } from '../store/useCompetencyStore'
import type { AttachmentKind, DocCategory } from '../types'

// Every call on this page goes through the session-less client (see compAnonClient): the candidate
// storage policies are anon-only, and a staff session left in this browser must not change that.
const supabase = compAnonClient()

interface SelfServiceAttachment {
  id: string
  kind: string
  category: string | null
  entry_ref: string | null
  file_name: string
  storage_path: string
  file_size: number | null
  uploaded_by_candidate: boolean
  created_at: string
}

function toDocItem(a: SelfServiceAttachment): ProfileDocItem {
  return {
    id: a.id,
    kind: a.kind as AttachmentKind,
    category: (a.category as DocCategory | null) ?? 'OTHER',
    entryRef: a.entry_ref,
    fileName: a.file_name,
    storagePath: a.storage_path,
    fileSize: a.file_size,
    uploadedByCandidate: a.uploaded_by_candidate,
  }
}

interface SelfServiceRow {
  id: string
  candidate_name: string
  candidate_position: string
  candidate_national_id: string
  candidate_phone: string
  candidate_email: string
  candidate_birth_date: string | null
  candidate_age: number | null
  has_disability: boolean
  disability_note: string
  years_experience_total: number | null
  years_experience_pipeline: number | null
  current_employer: string
  education: CandidateProfileInput['education']
  employment_history: CandidateProfileInput['employmentHistory']
  certifications: CandidateProfileInput['certifications']
  notable_projects: string
  self_service_status: string
  photo_url: string | null
  /** False once staff marked the form reviewed or the assessment is completed (schema.sql Section 53,
   * M-7) — every write RPC refuses then, so the page stops offering the form. */
  self_service_editable: boolean
  /** Why the form is closed: 'reviewed' (staff confirmed and closed it) or 'completed' (Section 55). */
  self_service_closed_reason?: 'reviewed' | 'completed' | null
}

type LinkIssue = 'malformed' | 'rotated' | 'unknown' | 'network'

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** The token is a uuid, but links pass through messengers and RTL text: a trailing «.»/«)», an
 * invisible RTL mark (U+200F), spaces or a second copy of the URL glued on used to reach the RPC
 * verbatim, fail the uuid cast and show «لینک نامعتبر». Take the first uuid in the value instead. */
function normalizeToken(raw: string): string | null {
  const cleaned = raw
    .normalize('NFKC')
    // Persian / Arabic-Indic digits some keyboards and messengers substitute.
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\s]/g, '')
  const m = cleaned.match(UUID_RE)
  return m ? m[0].toLowerCase() : null
}

const LINK_ISSUE_TEXT: Record<LinkIssue, { title: string; body: string }> = {
  malformed: {
    title: 'لینک ناقص است',
    body: 'به نظر می‌رسد بخشی از لینک هنگام کپی یا ارسال جا افتاده است. لطفاً لینک کامل را دوباره از پیام اصلی باز کنید یا از تیم ارزیابی بخواهید آن را دوباره ارسال کند.',
  },
  rotated: {
    title: 'لینک جدیدی برای شما صادر شده است',
    body: 'این لینک قدیمی است و تیم ارزیابی لینک تازه‌ای برای همین فرم صادر کرده است. لطفاً از آخرین لینکی که برایتان ارسال شده استفاده کنید؛ اطلاعات و مدارکی که قبلاً ثبت کرده‌اید حفظ شده‌اند.',
  },
  unknown: {
    title: 'این لینک معتبر نیست',
    body: 'فرمی با این لینک پیدا نشد (ممکن است لینک اشتباه وارد شده یا پرونده حذف شده باشد). لطفاً با تیم مصاحبه‌کننده تماس بگیرید.',
  },
  network: {
    title: 'ارتباط با سامانه برقرار نشد',
    body: 'لینک شما معتبر است اما اطلاعات بارگذاری نشد. اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.',
  },
}

const CLOSED_TEXT: Record<'reviewed' | 'completed', string> = {
  reviewed:
    'این فرم توسط کارشناس بررسی و بسته شده است؛ اطلاعات و مدارک شما دریافت و تأیید شده و دیگر نیازی به تکمیل آن نیست. اگر نیاز به اصلاح دارید، با تیم ارزیابی تماس بگیرید تا فرم را برایتان بازگشایی کنند.',
  completed: 'ارزیابی شما تکمیل شده است و این فرم دیگر قابل ویرایش نیست. اطلاعات ثبت‌شده‌ی شما در زیر قابل مشاهده است.',
}

/**
 * Public, unauthenticated page reached via a secret-link token (?candidate=<token>). Lets a
 * candidate fill their own profile and upload documents without a FARIN login — everything goes
 * through the comp_self_service_* SECURITY DEFINER RPC functions, which only ever touch the one
 * row matching this exact token (see supabase/schema.sql section 19), never the interview
 * questions or any other candidate's data.
 */
export function CandidateSelfServicePage({ token: rawToken }: { token: string }) {
  const token = normalizeToken(rawToken) ?? ''
  const [row, setRow] = useState<SelfServiceRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [linkIssue, setLinkIssue] = useState<LinkIssue | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [loadErrorDetail, setLoadErrorDetail] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<SelfServiceAttachment[]>([])
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // N-13: upload / registration failures are shown to the candidate instead of failing silently.
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  // Re-fetched after every upload (not just once on mount) so the list on screen always reflects
  // what's actually saved — this used to be a plain unpersisted React array that reset to empty on
  // every reload even though the files themselves were saved correctly all along.
  const refreshAttachments = () => {
    supabase
      .rpc('comp_self_service_list_attachments', { p_token: token })
      .then(({ data }) => setAttachments((data ?? []) as SelfServiceAttachment[]))
  }

  useEffect(() => {
    if (!token) {
      setLoading(false)
      setLinkIssue('malformed')
      return
    }
    setLoading(true)
    setLinkIssue(null)
    supabase
      .rpc('comp_self_service_get', { p_token: token })
      .then(async ({ data, error }) => {
        if (error) {
          setLoading(false)
          setLinkIssue('network')
          // Surfaced only in the "جزئیات فنی" disclosure below — the one place that can tell us WHY
          // the page failed (network, revoked grant, schema) instead of «invalid or expired».
          setLoadErrorDetail(`${error.code ?? ''} ${error.message}`.trim())
          return
        }
        if (!data || data.length === 0) {
          // No form for this token: a link replaced by «لینک جدید» says so instead of «invalid».
          const { data: state } = await supabase.rpc('comp_self_service_link_state', { p_token: token })
          setLoading(false)
          setLinkIssue(state === 'rotated' ? 'rotated' : 'unknown')
          return
        }
        setLoading(false)
        const r = data[0] as SelfServiceRow
        setRow(r)
        if (r.self_service_status === 'submitted' || r.self_service_status === 'reviewed') setSubmitted(true)
        if (r.photo_url) getCompDocSignedUrl(r.photo_url, supabase).then((u) => u && setPhotoPreview(u))
      })
    refreshAttachments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reloadKey])

  const handleSubmit = async (profile: CandidateProfileInput) => {
    setSubmitError(null)
    const { error } = await supabase.rpc('comp_self_service_submit', {
      p_token: token,
      p_candidate_name: profile.candidateName,
      p_candidate_national_id: profile.candidateNationalId,
      p_candidate_phone: profile.candidatePhone,
      p_candidate_email: profile.candidateEmail,
      p_candidate_birth_date: profile.candidateBirthDate || null,
      p_candidate_age: profile.candidateAge,
      p_has_disability: profile.hasDisability,
      p_disability_note: profile.disabilityNote,
      p_years_experience_total: profile.yearsExperienceTotal,
      p_years_experience_pipeline: profile.yearsExperiencePipeline,
      p_current_employer: profile.currentEmployer,
      p_education: profile.education,
      p_employment_history: profile.employmentHistory,
      p_certifications: profile.certifications,
      p_notable_projects: profile.notableProjects,
    })
    if (error) {
      if (/self_service_closed/.test(error.message)) {
        // Closed while the candidate was filling it in — reload to show the specific reason.
        setReloadKey((k) => k + 1)
        return
      }
      setSubmitError(`${error.code ?? ''} ${error.message}`.trim())
      return
    }
    setSubmitted(true)
  }

  const uploadFailure = (message: string | null | undefined) =>
    message && /self_service_closed/.test(message)
      ? 'این فرم دیگر قابل ویرایش نیست (بررسی شده یا ارزیابی تکمیل شده است).'
      : 'بارگذاری انجام نشد. اتصال اینترنت و حجم/نوع فایل را بررسی کنید و دوباره تلاش کنید.'

  const handlePhotoUpload = async (file: File) => {
    const previous = photoPreview
    setPhotoPreview(URL.createObjectURL(file))
    setPhotoError(null)
    setUploadingPhoto(true)
    const { path, error } = await uploadCompDocAsCandidate(file, row!.id, token)
    let failed: string | null = null
    if (!path || error) {
      failed = uploadFailure(error)
    } else {
      const { error: rpcError } = await supabase.rpc('comp_self_service_set_photo', { p_token: token, p_storage_path: path })
      if (rpcError) failed = uploadFailure(rpcError.message)
    }
    if (failed) {
      setPhotoError(failed)
      setPhotoPreview(previous)
    }
    setUploadingPhoto(false)
  }

  // Per-item documents (national ID, résumé, one per education / employment / course entry) — the
  // same ProfileDocuments contract the staff form uses, backed by the token RPCs.
  const documents: ProfileDocuments | undefined = row
    ? {
        items: attachments.map(toDocItem),
        editable: row.self_service_editable,
        upload: async (category, entryRef, file) => {
          const invalid = validateCompDoc(file)
          if (invalid) return invalid
          const { path, error } = await uploadCandidateDocument(file, row.id, token)
          if (!path || error) return compDocErrorFa(error)
          const { error: rpcError } = await supabase.rpc('comp_self_service_add_document', {
            p_token: token,
            p_category: category,
            p_entry_ref: entryRef,
            p_file_name: file.name,
            p_storage_path: path,
          })
          if (rpcError) {
            await removeCompDocObject(path, supabase)
            if (/self_service_closed/.test(rpcError.message)) setReloadKey((k) => k + 1)
            return compDocErrorFa(rpcError.message)
          }
          refreshAttachments()
          return null
        },
        remove: async (item) => {
          const { data, error } = await supabase.rpc('comp_self_service_remove_document', { p_token: token, p_attachment_id: item.id })
          if (error) return compDocErrorFa(error.message)
          await removeCompDocObject((data as string | null) ?? '', supabase)
          refreshAttachments()
          return null
        },
        canRemove: (item) => item.uploadedByCandidate,
        signedUrl: (path) => getCompDocSignedUrl(path, supabase),
      }
    : undefined

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <Loader2 size={26} className="animate-spin text-purple-400" />
      </div>
    )
  }

  if (linkIssue || !row) {
    const text = LINK_ISSUE_TEXT[linkIssue ?? 'unknown']
    return (
      <div className="flex min-h-screen w-screen items-center justify-center p-6 text-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <div className="glass-panel max-w-md space-y-2 rounded-2xl p-5">
          <p className="text-sm font-bold">{text.title}</p>
          <p className="text-xs leading-6 text-secondary">{text.body}</p>
          {linkIssue === 'network' && (
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mx-auto mt-1 rounded-lg bg-purple-500 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400"
            >
              تلاش دوباره
            </button>
          )}
          {loadErrorDetail && (
            <details className="mt-3 text-right text-[10px] text-muted">
              <summary className="cursor-pointer">جزئیات فنی</summary>
              <p dir="ltr" className="mt-1 break-all rounded-lg bg-black/20 p-2">
                {loadErrorDetail}
              </p>
            </details>
          )}
        </div>
      </div>
    )
  }

  const initial: CandidateProfileInput = {
    // Self-service never touches job_role (candidateMode hides the field and comp_self_service_submit
    // below doesn't forward it) — the RPC row deliberately excludes it, so this value is unused.
    jobRole: 'project_manager',
    candidateName: row.candidate_name,
    candidatePosition: row.candidate_position,
    candidateNationalId: row.candidate_national_id,
    candidatePhone: row.candidate_phone,
    candidateEmail: row.candidate_email,
    candidateBirthDate: row.candidate_birth_date ?? '',
    candidateAge: row.candidate_age,
    hasDisability: row.has_disability,
    disabilityNote: row.disability_note ?? '',
    yearsExperienceTotal: row.years_experience_total,
    yearsExperiencePipeline: row.years_experience_pipeline,
    currentEmployer: row.current_employer,
    education: row.education ?? [],
    employmentHistory: row.employment_history ?? [],
    certifications: row.certifications ?? [],
    notableProjects: row.notable_projects,
    interviewDate: '',
  }

  return (
    <div className="comp-shell min-h-screen p-4 sm:p-6" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="glass-panel rounded-2xl p-4 text-center">
          <p className="text-sm font-bold">فرم ثبت مشخصات نامزد — ارزیابی شایستگی {FARIN_NAME_FA}</p>
          <p className="mt-1 text-[11px] text-muted">لطفاً مشخصات و سوابق خود را با دقت تکمیل کرده و مدارک لازم را پیوست کنید.</p>
        </div>

        {!row.self_service_editable && (
          <div className="glass-panel flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/[0.06] p-4 text-xs leading-6 text-amber-200">
            <Lock size={16} className="mt-0.5 shrink-0" />
            <span>{CLOSED_TEXT[row.self_service_closed_reason ?? 'reviewed']}</span>
          </div>
        )}

        {submitted && row.self_service_editable && (
          <div className="glass-panel flex items-center gap-2 rounded-2xl border border-green-400/25 bg-green-500/[0.05] p-4 text-xs text-green-300">
            <CheckCircle2 size={16} /> اطلاعات شما ثبت شد. می‌توانید در صورت نیاز دوباره فرم را تکمیل و ثبت کنید یا مدارک بیشتری پیوست نمایید.
          </div>
        )}

        {submitError && (
          <div className="glass-panel rounded-2xl border border-red-400/25 bg-red-500/[0.05] p-4 text-xs text-red-300">
            ثبت اطلاعات با خطا مواجه شد. لطفاً دوباره تلاش کنید یا با تیم مصاحبه‌کننده تماس بگیرید.
            <details className="mt-2 text-[10px] text-red-200/70">
              <summary className="cursor-pointer">جزئیات فنی</summary>
              <p dir="ltr" className="mt-1 break-all rounded-lg bg-black/20 p-2">
                {submitError}
              </p>
            </details>
          </div>
        )}

        <div className="glass-panel flex items-center gap-3 rounded-2xl p-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
            {photoPreview ? <img src={photoPreview} alt="" className="h-full w-full object-cover" /> : <Camera size={20} className="text-muted" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold">عکس پرسنلی</p>
            <p className="mt-0.5 text-[10.5px] leading-5 text-muted">یک عکس پرسنلی واضح و رسمی بارگذاری کنید.</p>
          </div>
          <button
            type="button"
            disabled={uploadingPhoto || !row.self_service_editable}
            onClick={() => photoRef.current?.click()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 text-[11px] text-secondary hover:bg-white/5 disabled:opacity-50"
          >
            {uploadingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploadingPhoto ? 'در حال بارگذاری…' : 'بارگذاری عکس'}
          </button>
          <input
            ref={photoRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handlePhotoUpload(f)
              e.target.value = ''
            }}
          />
          {photoError && <p className="w-full text-center text-[11px] text-red-300">{photoError}</p>}
        </div>

        {row.self_service_editable && <ProfileForm initial={initial} submitLabel="ثبت اطلاعات" onSubmit={handleSubmit} candidateMode documents={documents} />}

        {/* Uploads live per item inside the form now (Section 55). What stays here: a read-only view of
            everything on file once the form is closed, and — while it is open — files that belong to
            no item (e.g. uploaded through the old general «پیوست مدارک» box). */}
        {documents && (!row.self_service_editable || documents.items.some((d) => d.category === 'OTHER')) && (
          <div className="glass-panel space-y-3 rounded-2xl p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <FileText size={14} className="text-purple-300" /> {row.self_service_editable ? 'سایر مدارک ثبت‌شده' : 'مدارک ثبت‌شده'}
            </p>
            <DocumentsGallery
              items={row.self_service_editable ? documents.items.filter((d) => d.category === 'OTHER') : documents.items}
              education={row.education ?? []}
              employment={row.employment_history ?? []}
              certifications={row.certifications ?? []}
              signedUrl={documents.signedUrl}
            />
          </div>
        )}
      </div>
    </div>
  )
}
