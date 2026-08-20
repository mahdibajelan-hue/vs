import { useMemo, useState } from 'react'
import { ArrowRight, ArrowLeft, CheckCircle2, Pencil } from 'lucide-react'
import { useCompetencyStore, type CandidateProfileInput } from '../store/useCompetencyStore'
import { COMPETENCY_DOMAINS, computeCompletion, computeDomainScores, computeOverallPercent, overallRatingLabel, questionsForDomain } from '../lib/competencyModel'
import { ProfileForm } from '../components/ProfileForm'
import { QuestionScoreCard } from '../components/QuestionScoreCard'
import { CompetencyRadarChart } from '../components/CompetencyRadarChart'
import { formatJalali } from '../../../lib/jalali'

interface AssessmentWizardPageProps {
  assessmentId: string
  onDone: () => void
}

type Stage = 'profile' | 'questions' | 'results'

/** Profile -> per-domain scored questions -> results (radar chart + breakdown) flow for one assessment. */
export function AssessmentWizardPage({ assessmentId, onDone }: AssessmentWizardPageProps) {
  const assessment = useCompetencyStore((s) => s.assessments.find((a) => a.id === assessmentId))
  const updateProfile = useCompetencyStore((s) => s.updateProfile)
  const setAnswer = useCompetencyStore((s) => s.setAnswer)
  const setStatus = useCompetencyStore((s) => s.setStatus)

  const [stage, setStage] = useState<Stage>('questions')
  const [editingProfile, setEditingProfile] = useState(false)
  const [domainIndex, setDomainIndex] = useState(0)

  const domainScores = useMemo(() => computeDomainScores(assessment?.answers ?? {}), [assessment?.answers])
  const overall = computeOverallPercent(domainScores)
  const completion = computeCompletion(assessment?.answers ?? {})

  if (!assessment) {
    return <div className="p-6 text-sm text-muted">ارزیابی یافت نشد.</div>
  }

  const domain = COMPETENCY_DOMAINS[domainIndex]
  const questions = questionsForDomain(domain.key)

  const profileInput: CandidateProfileInput = {
    candidateName: assessment.candidateName,
    candidatePosition: assessment.candidatePosition,
    yearsExperienceTotal: assessment.yearsExperienceTotal,
    yearsExperiencePipeline: assessment.yearsExperiencePipeline,
    currentEmployer: assessment.currentEmployer,
    education: assessment.education,
    certifications: assessment.certifications,
    notableProjects: assessment.notableProjects,
    interviewDate: assessment.interviewDate,
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onDone} className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary">
          <ArrowRight size={14} /> بازگشت به فهرست
        </button>
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(['profile', 'questions', 'results'] as Stage[]).map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${stage === s ? 'bg-brand-500/25 text-brand-300' : 'text-secondary'}`}
            >
              {s === 'profile' ? 'مشخصات' : s === 'questions' ? 'سوالات' : 'نتیجه'}
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
              <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1 text-xs text-brand-300 hover:text-brand-200">
                <Pencil size={12} /> ویرایش
              </button>
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
              <InfoRow label="نام و نام خانوادگی" value={assessment.candidateName} />
              <InfoRow label="سمت مورد ارزیابی" value={assessment.candidatePosition} />
              <InfoRow label="سابقه کل کار" value={assessment.yearsExperienceTotal != null ? `${assessment.yearsExperienceTotal} سال` : '—'} />
              <InfoRow label="سابقه اجرای خط لوله" value={assessment.yearsExperiencePipeline != null ? `${assessment.yearsExperiencePipeline} سال` : '—'} />
              <InfoRow label="کارفرمای فعلی" value={assessment.currentEmployer || '—'} />
              <InfoRow label="تاریخ مصاحبه" value={formatJalali(assessment.interviewDate)} />
              <InfoRow label="تحصیلات" value={assessment.education || '—'} />
              <InfoRow label="گواهینامه‌ها" value={assessment.certifications || '—'} />
            </div>
            {assessment.notableProjects && (
              <div>
                <p className="mb-1 text-[11px] text-muted">پروژه‌های شاخص گذشته</p>
                <p className="text-xs leading-6 text-secondary">{assessment.notableProjects}</p>
              </div>
            )}
            <button onClick={() => setStage('questions')} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400">
              شروع سوالات <ArrowLeft size={13} />
            </button>
          </div>
        ))}

      {stage === 'questions' && (
        <div className="space-y-3">
          <div className="glass-panel rounded-2xl p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold">{domain.title}</p>
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
                    i === domainIndex ? 'bg-brand-500/25 text-brand-300' : 'bg-white/5 text-secondary hover:bg-white/10'
                  }`}
                >
                  {d.shortTitle}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {questions.map((q, i) => (
              <QuestionScoreCard
                key={q.key}
                index={i}
                question={q}
                answer={assessment.answers[q.key]}
                editable
                onChange={(score, note) => setAnswer(assessment.id, q.key, score, note)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              disabled={domainIndex === 0}
              onClick={() => setDomainIndex((i) => Math.max(0, i - 1))}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs disabled:opacity-30"
            >
              <ArrowRight size={13} /> حوزه قبل
            </button>
            {domainIndex < COMPETENCY_DOMAINS.length - 1 ? (
              <button
                onClick={() => setDomainIndex((i) => Math.min(COMPETENCY_DOMAINS.length - 1, i + 1))}
                className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400"
              >
                حوزه بعد <ArrowLeft size={13} />
              </button>
            ) : (
              <button onClick={() => setStage('results')} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400">
                مشاهده نتیجه <ArrowLeft size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      {stage === 'results' && (
        <div className="space-y-3">
          <div className="glass-panel rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">{assessment.candidateName}</p>
                <p className="text-[11px] text-muted">{assessment.candidatePosition}</p>
              </div>
              <div className="text-left">
                <p className="num text-2xl font-extrabold">{overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}</p>
                <p className="text-[11px] text-muted">{overallRatingLabel(overall)}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted">
              {completion.answered.toLocaleString('fa-IR')} از {completion.total.toLocaleString('fa-IR')} سوال پاسخ داده شده ({completion.percent.toLocaleString('fa-IR')}٪)
            </p>
          </div>

          <div className="glass-panel rounded-2xl p-4">
            <CompetencyRadarChart domainScores={domainScores} />
          </div>

          <div className="glass-panel space-y-2 rounded-2xl p-4">
            <p className="mb-1 text-xs font-bold">امتیاز به تفکیک حوزه</p>
            {domainScores.map((d) => (
              <div key={d.domain.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[11px] text-secondary">{d.domain.shortTitle}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${d.percentScore ?? 0}%` }} />
                </div>
                <span className="num w-16 shrink-0 text-left text-[11px] text-muted">
                  {d.percentScore != null ? `٪${d.percentScore.toLocaleString('fa-IR')}` : '—'} ({d.answeredCount.toLocaleString('fa-IR')}/{d.totalCount.toLocaleString('fa-IR')})
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setStage('questions')} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs">
              <ArrowRight size={13} /> بازگشت به سوالات
            </button>
            {assessment.status === 'completed' ? (
              <span className="flex items-center gap-1.5 rounded-xl bg-green-500/15 px-4 py-2 text-xs font-bold text-green-300">
                <CheckCircle2 size={14} /> تکمیل‌شده
              </span>
            ) : (
              <button
                onClick={() => setStatus(assessment.id, 'completed')}
                className="flex items-center gap-1.5 rounded-xl bg-green-500 px-4 py-2 text-xs font-bold text-white hover:bg-green-400"
              >
                <CheckCircle2 size={14} /> ثبت نهایی ارزیابی
              </button>
            )}
          </div>
        </div>
      )}
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
