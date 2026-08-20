import { useState } from 'react'
import { ArrowRight, ArrowLeft, Pencil } from 'lucide-react'
import { useCompetencyStore, type CandidateProfileInput } from '../store/useCompetencyStore'
import { COMPETENCY_DOMAINS, computeCompletion, questionsForDomain } from '../lib/competencyModel'
import { ProfileForm } from '../components/ProfileForm'
import { QuestionScoreCard } from '../components/QuestionScoreCard'
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
  panel: 'پنل داوران',
  documents: 'مدارک',
  questions: 'سوالات',
  qualification: 'کارت امتیاز',
  results: 'نتیجه',
}

/** Profile -> panel -> documents -> per-domain scored questions (+ capstone) -> qualification scorecard -> results flow for one assessment. */
export function AssessmentWizardPage({ assessmentId, onDone }: AssessmentWizardPageProps) {
  const assessment = useCompetencyStore((s) => s.assessments.find((a) => a.id === assessmentId))
  const updateProfile = useCompetencyStore((s) => s.updateProfile)
  const setAnswer = useCompetencyStore((s) => s.setAnswer)
  const setCapstone = useCompetencyStore((s) => s.setCapstone)

  const [stage, setStage] = useState<Stage>('questions')
  const [editingProfile, setEditingProfile] = useState(false)
  const [domainIndex, setDomainIndex] = useState(0)

  const completion = computeCompletion(assessment?.answers ?? {})

  if (!assessment) {
    return <div className="p-6 text-sm text-muted">ارزیابی یافت نشد.</div>
  }

  const domain = COMPETENCY_DOMAINS[domainIndex]
  const questions = questionsForDomain(domain.key)
  const isLastDomain = domainIndex === COMPETENCY_DOMAINS.length - 1
  const onCapstoneStep = domainIndex === COMPETENCY_DOMAINS.length

  const profileInput: CandidateProfileInput = {
    candidateName: assessment.candidateName,
    candidatePosition: assessment.candidatePosition,
    candidateNationalId: assessment.candidateNationalId,
    candidatePhone: assessment.candidatePhone,
    candidateEmail: assessment.candidateEmail,
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button onClick={onDone} className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary">
          <ArrowRight size={14} /> بازگشت به فهرست
        </button>
        <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${stage === s ? 'bg-purple-500/25 text-purple-300' : 'text-secondary'}`}
            >
              {STAGE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      {stage === 'profile' &&
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

      {stage === 'panel' && <PanelStage assessmentId={assessment.id} />}

      {stage === 'documents' && <DocumentsStage assessment={assessment} />}

      {stage === 'questions' && (
        <div className="space-y-3">
          <ScoringGuideBanner />
          {!onCapstoneStep && (
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

          {onCapstoneStep ? (
            <CapstoneCard score={assessment.capstoneScore} note={assessment.capstoneNote} editable onChange={(score, note) => setCapstone(assessment.id, score, note)} />
          ) : (
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
                />
              ))}
            </div>
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

      {stage === 'qualification' && <QualificationStage assessment={assessment} />}

      {stage === 'results' && <ResultsStage assessment={assessment} />}
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
