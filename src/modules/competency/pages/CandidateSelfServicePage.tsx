import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, FileText, Loader2, Upload } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { uploadCompDocAsCandidate } from '../lib/compStorage'
import { ProfileForm } from '../components/ProfileForm'
import type { CandidateProfileInput } from '../store/useCompetencyStore'
import { ATTACHMENT_KIND_LABEL_FA, type AttachmentKind } from '../types'

interface SelfServiceRow {
  id: string
  candidate_name: string
  candidate_position: string
  candidate_national_id: string
  candidate_phone: string
  candidate_email: string
  years_experience_total: number | null
  years_experience_pipeline: number | null
  current_employer: string
  education: CandidateProfileInput['education']
  employment_history: CandidateProfileInput['employmentHistory']
  certifications: CandidateProfileInput['certifications']
  notable_projects: string
  self_service_status: string
}

const KINDS: AttachmentKind[] = ['resume', 'education', 'certification', 'national_id', 'insurance', 'other']

/**
 * Public, unauthenticated page reached via a secret-link token (?candidate=<token>). Lets a
 * candidate fill their own profile and upload documents without a RASTA login — everything goes
 * through the comp_self_service_* SECURITY DEFINER RPC functions, which only ever touch the one
 * row matching this exact token (see supabase/schema.sql section 19), never the interview
 * questions or any other candidate's data.
 */
export function CandidateSelfServicePage({ token }: { token: string }) {
  const [row, setRow] = useState<SelfServiceRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [uploadedKinds, setUploadedKinds] = useState<string[]>([])
  const [uploading, setUploading] = useState<AttachmentKind | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingKind, setPendingKind] = useState<AttachmentKind>('resume')

  useEffect(() => {
    supabase
      .rpc('comp_self_service_get', { p_token: token })
      .then(({ data, error }) => {
        setLoading(false)
        if (error || !data || data.length === 0) {
          setNotFound(true)
          return
        }
        const r = data[0] as SelfServiceRow
        setRow(r)
        if (r.self_service_status === 'submitted' || r.self_service_status === 'reviewed') setSubmitted(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleSubmit = async (profile: CandidateProfileInput) => {
    const { error } = await supabase.rpc('comp_self_service_submit', {
      p_token: token,
      p_candidate_name: profile.candidateName,
      p_candidate_national_id: profile.candidateNationalId,
      p_candidate_phone: profile.candidatePhone,
      p_candidate_email: profile.candidateEmail,
      p_years_experience_total: profile.yearsExperienceTotal,
      p_years_experience_pipeline: profile.yearsExperiencePipeline,
      p_current_employer: profile.currentEmployer,
      p_education: profile.education,
      p_employment_history: profile.employmentHistory,
      p_certifications: profile.certifications,
      p_notable_projects: profile.notableProjects,
    })
    if (!error) setSubmitted(true)
  }

  const handleUpload = async (file: File) => {
    setUploading(pendingKind)
    const { path, error } = await uploadCompDocAsCandidate(file, row!.id, token)
    if (path && !error) {
      await supabase.rpc('comp_self_service_add_attachment', { p_token: token, p_kind: pendingKind, p_file_name: file.name, p_storage_path: path })
      setUploadedKinds((k) => [...k, pendingKind])
    }
    setUploading(null)
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={26} className="animate-spin text-purple-400" />
      </div>
    )
  }

  if (notFound || !row) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6 text-center" style={{ background: 'var(--bg-app)' }}>
        <p className="text-sm text-secondary">این لینک نامعتبر است یا منقضی شده. لطفاً با تیم مصاحبه‌کننده تماس بگیرید.</p>
      </div>
    )
  }

  const initial: CandidateProfileInput = {
    candidateName: row.candidate_name,
    candidatePosition: row.candidate_position,
    candidateNationalId: row.candidate_national_id,
    candidatePhone: row.candidate_phone,
    candidateEmail: row.candidate_email,
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
    <div className="min-h-screen p-4 sm:p-6" style={{ background: 'var(--bg-app)' }}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="glass-panel rounded-2xl p-4 text-center">
          <p className="text-sm font-bold">فرم ثبت مشخصات نامزد — ارزیابی شایستگی RASTA</p>
          <p className="mt-1 text-[11px] text-muted">لطفاً مشخصات و سوابق خود را با دقت تکمیل کرده و مدارک لازم را پیوست کنید.</p>
        </div>

        {submitted && (
          <div className="glass-panel flex items-center gap-2 rounded-2xl border border-green-400/25 bg-green-500/[0.05] p-4 text-xs text-green-300">
            <CheckCircle2 size={16} /> اطلاعات شما ثبت شد. می‌توانید در صورت نیاز دوباره فرم را تکمیل و ثبت کنید یا مدارک بیشتری پیوست نمایید.
          </div>
        )}

        <ProfileForm initial={initial} submitLabel="ثبت اطلاعات" onSubmit={handleSubmit} candidateMode />

        <div className="glass-panel space-y-3 rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <FileText size={14} className="text-purple-300" /> پیوست مدارک
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={pendingKind} onChange={(e) => setPendingKind(e.target.value as AttachmentKind)} className="input max-w-[12rem]">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {ATTACHMENT_KIND_LABEL_FA[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={uploading != null}
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
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
                e.target.value = ''
              }}
            />
          </div>
          {uploadedKinds.length > 0 && (
            <div className="space-y-1">
              {uploadedKinds.map((k, i) => (
                <p key={i} className="flex items-center gap-1.5 text-[11px] text-green-300">
                  <CheckCircle2 size={12} /> {ATTACHMENT_KIND_LABEL_FA[k as AttachmentKind]} بارگذاری شد
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
