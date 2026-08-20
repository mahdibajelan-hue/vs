import { GraduationCap, Briefcase, BookOpen, Award, MessageSquareText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { computeDomainScores, computeOverallPercent } from '../lib/competencyModel'
import type { CompetencyAssessment } from '../types'

interface QualificationStageProps {
  assessment: CompetencyAssessment
}

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5]

/** Qualification scorecard: education, relevant experience, PM training, and professional certification (PMP etc) are each judged manually by the lead from the candidate's profile/documents; the interview score is auto-derived from the weighted domain average, never re-entered by hand. */
export function QualificationStage({ assessment }: QualificationStageProps) {
  const setQualificationScores = useCompetencyStore((s) => s.setQualificationScores)

  const domainScores = computeDomainScores(assessment.answers)
  const overallPercent = computeOverallPercent(domainScores)
  const interviewScore = overallPercent != null ? Math.round((overallPercent / 20) * 10) / 10 : null

  const set = (patch: Partial<Pick<CompetencyAssessment, 'educationScore' | 'experienceScore' | 'pmTrainingScore' | 'pmCertificationScore'>>) => {
    setQualificationScores(assessment.id, {
      educationScore: assessment.educationScore,
      experienceScore: assessment.experienceScore,
      pmTrainingScore: assessment.pmTrainingScore,
      pmCertificationScore: assessment.pmCertificationScore,
      ...patch,
    })
  }

  return (
    <div className="space-y-3">
      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-1 text-sm font-bold">کارت امتیاز شایستگی</p>
        <p className="text-[11px] leading-5 text-muted">
          هر یک از چهار مؤلفه زیر را با مرور مدارک و پروفایل نامزد، از ۰ تا ۵ امتیاز دهید. امتیاز «نتایج مصاحبه» به‌صورت خودکار از میانگین وزنی حوزه‌های
          مصاحبه محاسبه می‌شود و قابل ویرایش دستی نیست.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QualificationChip
          icon={GraduationCap}
          label="مدرک تحصیلی"
          value={assessment.educationScore}
          onChange={(v) => set({ educationScore: v })}
        />
        <QualificationChip
          icon={Briefcase}
          label="سوابق کاری مرتبط"
          value={assessment.experienceScore}
          onChange={(v) => set({ experienceScore: v })}
        />
        <QualificationChip
          icon={BookOpen}
          label="دوره‌های حرفه‌ای مدیریت پروژه"
          value={assessment.pmTrainingScore}
          onChange={(v) => set({ pmTrainingScore: v })}
        />
        <QualificationChip
          icon={Award}
          label="صلاحیت حرفه‌ای (PMP و مشابه)"
          value={assessment.pmCertificationScore}
          onChange={(v) => set({ pmCertificationScore: v })}
        />
        <div className="glass-panel flex flex-col justify-between rounded-2xl p-3.5">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted">
            <MessageSquareText size={13} className="text-purple-300" /> نتایج مصاحبه (خودکار)
          </div>
          <p className="num text-2xl font-extrabold text-purple-300">{interviewScore != null ? interviewScore.toLocaleString('fa-IR') : '—'} / ۵</p>
          <p className="mt-1 text-[10px] text-muted">{overallPercent != null ? `٪${overallPercent.toLocaleString('fa-IR')} میانگین وزنی حوزه‌ها` : 'هنوز امتیازدهی نشده'}</p>
        </div>
      </div>
    </div>
  )
}

function QualificationChip({ icon: Icon, label, value, onChange }: { icon: LucideIcon; label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="glass-panel rounded-2xl p-3.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted">
        <Icon size={13} className="text-purple-300" /> {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {SCORE_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(value === s ? null : s)}
            className={`num flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold transition-colors ${
              value === s ? 'border-purple-400 bg-purple-500 text-white' : 'border-white/15 text-secondary hover:bg-white/5'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
