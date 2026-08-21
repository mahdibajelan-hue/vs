import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowLeft, Pencil, User } from 'lucide-react'
import { useCompetencyStore, type CandidateProfileInput } from '../store/useCompetencyStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { COMPETENCY_DOMAINS, computeCompletion, questionsForDomain } from '../lib/competencyModel'
import { ProfileForm } from '../components/ProfileForm'
import { QuestionScoreCard, type PanelVote } from '../components/QuestionScoreCard'
import { CapstoneCard } from '../components/CapstoneCard'
import { ScoringGuideBanner } from '../components/ScoringGuideBanner'
import { PanelStage } from './PanelStage'
import { DocumentsStage } from './DocumentsStage'
import { QualificationStage } from './QualificationStage'
import { ResultsStage } from './ResultsStage'
import { formatJalali } from '../../../lib/jalali'

interface AssessmentWizardPageProps {
  assessmentId: string
  onDone: () => void
}

type Stage = 'profile' | 'panel' | 'documents' | 'questions' | 'qualification' | 'results'

const STAGE_LABEL: Record<Stage, string> = {
  profile: 'مشخصات',
  panel: 'پنل مصاحبه‌گران',
  documents: 'مدارک',
  questions: 'نظر نهایی',
  qualification: 'کارت امتیاز',
  results: 'نتیجه',
}

/**
 * Who sees which stages. The three interviewers only ever record their own independent scores
 * (the "panel" stage); the final verdict, scorecard, and report belong to the assessment lead.
 * This matters beyond tidiness: the database rejects writes to comp_assessments from anyone but
 * the lead, so showing an interviewer the final-verdict screen would only hand them a form whose
 * every save fails.
 */
const LEAD_STAGES: Stage[] = ['profile', 'panel', 'documents', 'questions', 'qualification', 'results']
const PANELIST_STAGES: Stage[] = ['profile', 'panel', 'documents']

/** Profile -> panel -> documents -> per-domain scored questions (+ capstone) -> qualification scorecard -> results flow for one assessment. */
export function AssessmentWizardPage({ assessmentId, onDone }: AssessmentWizardPageProps) {
  const assessment = useCompetencyStore((s) => s.assessments.find((a) => a.id === assessmentId))
  const updateProfile = useCompetencyStore((s) => s.updateProfile)
  const setAnswer = useCompetencyStore((s) => s.setAnswer)
  const setCapstone = useCompetencyStore((s) => s.setCapstone)
  const fetchPanelists = useCompetencyStore((s) => s.fetchPanelists)
  const fetchPanelistScores = useCompetencyStore((s) => s.fetchPanelistScores)
  const fetchProfiles = useCompetencyStore((s) => s.fetchProfiles)
  const allPanelists = useCompetencyStore((s) => s.panelists)
  const allPanelistScores = useCompetencyStore((s) => s.panelistScores)
  const profiles = useCompetencyStore((s) => s.profiles)
  const myName = useAuthStore((s) => s.profile?.fullName)
  const myId = useAuthStore((s) => s.profile?.id ?? null)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)

  const [editingProfile, setEditingProfile] = useState(false)
  const [domainIndex, setDomainIndex] = useState(0)

  useEffect(() => {
    fetchProfiles()
    fetchPanelists(assessmentId)
    fetchPanelistScores(assessmentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId])

  const panelists = allPanelists.filter((p) => p.assessmentId === assessmentId)
  const submittedScores = allPanelistScores.filter((p) => p.assessmentId === assessmentId && p.submittedAt)

  const myPanelistRow = allPanelists.find((p) => p.assessmentId === assessmentId && p.userId === myId)
  const isLead = assessment != null && (assessment.createdBy === myId || isAdmin || myPanelistRow?.isLead === true)
  const stages = isLead ? LEAD_STAGES : PANELIST_STAGES
  // Everyone lands on the interviewer panel first — profile is already filled in by the time this
  // page opens, and jumping straight to the final verdict skipped assembling the panel and
  // reviewing documents, which need to happen before there's anything to verdict on.
  const [stage, setStage] = useState<Stage | null>(null)
  const activeStage: Stage = stage && stages.includes(stage) ? stage : 'panel'

  const completion = computeCompletion(assessment?.answers ?? {})

  // What each interviewer recorded, per question — the lead reads this while setting the final
  // score. Only submitted sheets count, so a half-finished interviewer doesn't sway the verdict.
  const panelVotesByQuestion = useMemo(() => {
    const map = new Map<string, PanelVote[]>()
    submittedScores.forEach((sheet) => {
      const name = profiles.find((p) => p.id === sheet.panelistId)?.fullName ?? 'داور'
      Object.entries(sheet.answers).forEach(([key, answer]) => {
        const votes = map.get(key) ?? []
        votes.push({ name, score: answer.score, note: answer.note })
        map.set(key, votes)
      })
    })
    return map
  }, [submittedScores, profiles])

  if (!assessment) {
    return <div className="p-6 text-sm text-muted">ارزیابی یافت نشد.</div>
  }

  const onCapstoneStep = domainIndex === COMPETENCY_DOMAINS.length
  const domain = onCapstoneStep ? null : COMPETENCY_DOMAINS[domainIndex]
  const questions = domain ? questionsForDomain(domain.key) : []
  const isLastDomain = domainIndex === COMPETENCY_DOMAINS.length - 1

  const profileInput: CandidateProfileInput = {
    candidateName: assessment.candidateName,
    candidatePosition: assessment.candidatePosition,
    candidateNationalId: assessment.candidateNationalId,
    candidatePhone: assessment.candidatePhone,
    candidateEmail: assessment.candidateEmail,
    candidateBirthDate: assessment.candidateBirthDate,
    candidateAge: assessment.candidateAge,
    hasDisability: assessment.hasDisability,
    disabilityNote: assessment.disabilityNote,
    yearsExperienceTotal: assessment.yearsExperienceTotal,
    yearsExperiencePipeline: assessment.yearsExperiencePipeline,
    currentEmployer: assessment.currentEmployer,
    education: assessment.education,
    employmentHistory: assessment.employmentHistory,
    certifications: assessment.certifications,
    notableProjects: assessment.notableProjects,
    interviewDate: assessment.interviewDate,
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-purple-400/20 bg-purple-500/[0.06] px-3.5 py-2.5">
        <div className="flex items-center gap-1.5 text-xs text-secondary">
          <User size={13} className="text-purple-300" />
          <span className="font-bold text-primary">{myName ?? '—'}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isLead ? 'bg-amber-500/15 text-amber-300' : 'bg-purple-500/20 text-purple-200'}`}>
            {isLead ? 'مسئول ارزیابی' : 'داور'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-secondary">
          نامزد تحت ارزیابی: <span className="font-bold text-primary">{assessment.candidateName}</span>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button onClick={onDone} className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary">
          <ArrowRight size={14} /> بازگشت به فهرست
        </button>
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
          {stages.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${activeStage === s ? 'bg-purple-500/25 text-purple-300' : 'text-secondary'}`}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {isLead && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2 text-[11px]">
          <span className="text-muted">وضعیت پنل:</span>
          <span className="num font-bold">
            {submittedScores.length.toLocaleString('fa-IR')} از {panelists.length.toLocaleString('fa-IR')} داور امتیاز خود را نهایی کرده‌اند
          </span>
          {panelists.length === 0 ? (
            <span className="text-amber-300">— ابتدا در بخش «پنل مصاحبه‌گران» سه داور را اضافه کنید.</span>
          ) : submittedScores.length < panelists.length ? (
            <span className="text-amber-300">— تا ثبت نهایی همه داوران، نظرات آن‌ها در «نظر نهایی» نمایش داده نمی‌شود.</span>
          ) : (
            <span className="text-green-300">— نظر همه داوران در بخش «نظر نهایی» زیر هر سوال قابل مشاهده است.</span>
          )}
        </div>
      )}

      {activeStage === 'profile' &&
        (editingProfile ? (
          <ProfileForm
            initial={profileInput}
            submitLabel="ذخیره مشخصات"
            onSubmit={async (profile) => {
              await updateProfile(assessment.id, profile)
              setEditingProfile(false)
            }}
          />
        ) : (
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">مشخصات و سوابق نامزد</p>
              <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200">
                <Pencil size={12} /> ویرایش
              </button>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
              <InfoRow label="نام و نام خانوادگی" value={assessment.candidateName} />
              <InfoRow label="سمت مورد ارزیابی" value={assessment.candidatePosition} />
              <InfoRow label="کد ملی" value={assessment.candidateNationalId || '—'} />
              <InfoRow label="شماره تماس" value={assessment.candidatePhone || '—'} />
              <InfoRow label="ایمیل" value={assessment.candidateEmail || '—'} />
              <InfoRow label="سن" value={assessment.candidateAge != null ? `${assessment.candidateAge} سال` : '—'} />
              <InfoRow label="معلولیت جسمی" value={assessment.hasDisability ? assessment.disabilityNote || 'دارد' : 'ندارد'} />
              <InfoRow label="سابقه کل کار" value={assessment.yearsExperienceTotal != null ? `${assessment.yearsExperienceTotal} سال` : '—'} />
              <InfoRow label="سابقه اجرای خط لوله" value={assessment.yearsExperiencePipeline != null ? `${assessment.yearsExperiencePipeline} سال` : '—'} />
              <InfoRow label="کارفرمای فعلی" value={assessment.currentEmployer || '—'} />
              <InfoRow label="تاریخ مصاحبه" value={formatJalali(assessment.interviewDate)} />
            </div>
            {assessment.education.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] text-muted">مدارک تحصیلی</p>
                <ul className="space-y-0.5 text-xs text-secondary">
                  {assessment.education.map((e) => (
                    <li key={e.id}>
                      {e.degree} {e.field && `— ${e.field}`} {e.institution && `(${e.institution})`} {e.year && `— ${e.year}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {assessment.employmentHistory.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] text-muted">سوابق شغلی و بیمه‌ای</p>
                <ul className="space-y-0.5 text-xs text-secondary">
                  {assessment.employmentHistory.map((e) => (
                    <li key={e.id}>
                      {e.employer} — {e.position} ({formatJalali(e.startDate) || '—'} تا {formatJalali(e.endDate) || 'اکنون'})
                      {e.insuranceMonths != null && ` — ${e.insuranceMonths} ماه بیمه`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {assessment.certifications.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] text-muted">گواهینامه‌ها</p>
                <ul className="space-y-0.5 text-xs text-secondary">
                  {assessment.certifications.map((e) => (
                    <li key={e.id}>
                      {e.title} {e.issuer && `— ${e.issuer}`} {e.isPmp && '(صلاحیت حرفه‌ای مدیریت پروژه)'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {assessment.notableProjects && (
              <div>
                <p className="mb-1 text-[11px] text-muted">پروژه‌های شاخص گذشته</p>
                <p className="text-xs leading-6 text-secondary">{assessment.notableProjects}</p>
              </div>
            )}
            <button onClick={() => setStage('panel')} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
              ادامه <ArrowLeft size={13} />
            </button>
          </div>
        ))}

      {activeStage === 'panel' && <PanelStage assessmentId={assessment.id} />}

      {activeStage === 'documents' && <DocumentsStage assessment={assessment} isLead={isLead} />}

      {activeStage === 'questions' && (
        <div className="space-y-3">
          <ScoringGuideBanner />
          {domain && (
            <div className="glass-panel rounded-2xl p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold">
                  {domain.title} <span className="num text-muted">(٪{domain.weight})</span>
                </p>
                <span className="num text-[11px] text-muted">
                  {completion.answered.toLocaleString('fa-IR')} از {completion.total.toLocaleString('fa-IR')} پاسخ داده‌شده
                </span>
              </div>
              <p className="mb-3 text-[11px] leading-5 text-muted">{domain.description}</p>
              <div className="flex flex-wrap gap-1">
                {COMPETENCY_DOMAINS.map((d, i) => (
                  <button
                    key={d.key}
                    onClick={() => setDomainIndex(i)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                      i === domainIndex ? 'bg-purple-500/25 text-purple-300' : 'bg-white/5 text-secondary hover:bg-white/10'
                    }`}
                  >
                    {d.shortTitle}
                  </button>
                ))}
                <button
                  onClick={() => setDomainIndex(COMPETENCY_DOMAINS.length)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    onCapstoneStep ? 'bg-amber-500/25 text-amber-300' : 'bg-white/5 text-secondary hover:bg-white/10'
                  }`}
                >
                  سناریوی پایانی
                </button>
              </div>
            </div>
          )}

          {domain ? (
            <div className="space-y-2.5">
              {questions.map((q, i) => (
                <QuestionScoreCard
                  key={q.key}
                  index={i}
                  question={q}
                  hint={domain.excellentAnswerHint}
                  answer={assessment.answers[q.key]}
                  editable
                  onChange={(score, note) => setAnswer(assessment.id, q.key, score, note)}
                  panelVotes={panelVotesByQuestion.get(q.key)}
                />
              ))}
            </div>
          ) : (
            <CapstoneCard score={assessment.capstoneScore} note={assessment.capstoneNote} editable onChange={(score, note) => setCapstone(assessment.id, score, note)} />
          )}

          <div className="flex items-center justify-between">
            <button
              disabled={domainIndex === 0}
              onClick={() => setDomainIndex((i) => Math.max(0, i - 1))}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs disabled:opacity-30"
            >
              <ArrowRight size={13} /> قبل
            </button>
            {!onCapstoneStep ? (
              <button
                onClick={() => setDomainIndex((i) => i + 1)}
                className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
              >
                {isLastDomain ? 'سناریوی پایانی' : 'حوزه بعد'} <ArrowLeft size={13} />
              </button>
            ) : (
              <button onClick={() => setStage('qualification')} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
                کارت امتیاز شایستگی <ArrowLeft size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {activeStage === 'qualification' && <QualificationStage assessment={assessment} />}

      {activeStage === 'results' && <ResultsStage assessment={assessment} />}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-white/5 py-1">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
