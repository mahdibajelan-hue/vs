import { useState } from 'react'
import { GraduationCap, Briefcase, BookOpen, Award, MessageSquareText, ThumbsUp, TrendingUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import type { CompetencyAssessment } from '../types'

interface AssessmentCardProps {
  assessment: CompetencyAssessment
}

/** One judge's own strengths/development-area notes (comp_panelist_scores.strengths/
 * developmentAreas), compiled by the caller from every submitted score sheet. */
export interface PanelSummaryNote {
  name: string
  strengths: string
  developmentAreas: string
}

function compilePanelNotes(panelNotes: PanelSummaryNote[], field: 'strengths' | 'developmentAreas'): string {
  return panelNotes
    .map((p) => ({ name: p.name, text: p[field].trim() }))
    .filter((p) => p.text)
    .map((p) => `${p.name}: ${p.text}`)
    .join('\n')
}

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5]

/**
 * Qualification scorecard: education, relevant experience, professional training, and
 * professional certification are each judged manually by the lead from the candidate's
 * profile/documents alone — shown at the very start of the evaluation questions (before any
 * interview scoring) for every job role, so the lead completes it first from the candidate's
 * record, same as the rest of the evaluation process.
 */
export function QualificationScorecardCard({ assessment }: AssessmentCardProps) {
  const setQualificationScores = useCompetencyStore((s) => s.setQualificationScores)

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
          پیش از پاسخ‌دهی به سؤالات مصاحبه، هر یک از چهار مؤلفه زیر را با مرور مدارک و پروفایل نامزد، از ۰ تا ۵ امتیاز دهید.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QualificationChip icon={GraduationCap} label="مدرک تحصیلی" value={assessment.educationScore} onChange={(v) => set({ educationScore: v })} />
        <QualificationChip
          icon={Briefcase}
          label="سوابق کاری مرتبط"
          value={assessment.experienceScore}
          onChange={(v) => set({ experienceScore: v })}
        />
        <QualificationChip
          icon={BookOpen}
          label="دوره‌های حرفه‌ای تخصصی"
          value={assessment.pmTrainingScore}
          onChange={(v) => set({ pmTrainingScore: v })}
          hint={`${assessment.certifications.length.toLocaleString('fa-IR')} گواهینامه/دوره در پروفایل ثبت‌شده`}
        />
        <QualificationChip
          icon={Award}
          label="صلاحیت حرفه‌ای مرتبط"
          value={assessment.pmCertificationScore}
          onChange={(v) => set({ pmCertificationScore: v })}
        />
      </div>
    </div>
  )
}

/**
 * Final wrap-up, shown at the end of the evaluation questions (after the last domain/section):
 * the auto-derived interview score (weighted domain average — never hand-edited, computed by the
 * caller with whichever scoring model this role uses, and already the panel's own average once any
 * judge has submitted) alongside the lead's own narrative strengths/development-areas summary,
 * pre-filled from every judge's own notes so the lead reviews/completes rather than starting from a
 * blank page.
 */
export function EvaluationSummaryCard({
  assessment,
  overallPercent,
  panelNotes = [],
}: AssessmentCardProps & { overallPercent: number | null; panelNotes?: PanelSummaryNote[] }) {
  const setStrengthsAndDevelopment = useCompetencyStore((s) => s.setStrengthsAndDevelopment)

  const interviewScore = overallPercent != null ? Math.round((overallPercent / 20) * 10) / 10 : null

  // Only pre-fill from the judges' notes when the lead hasn't written their own summary yet — an
  // already-saved summary (this candidate's own assessment.strengths/developmentAreas) is never
  // silently overwritten.
  const prefilledStrengths = !assessment.strengths && compilePanelNotes(panelNotes, 'strengths')
  const prefilledDevelopmentAreas = !assessment.developmentAreas && compilePanelNotes(panelNotes, 'developmentAreas')
  const [strengths, setStrengths] = useState(assessment.strengths || prefilledStrengths || '')
  const [developmentAreas, setDevelopmentAreas] = useState(assessment.developmentAreas || prefilledDevelopmentAreas || '')

  return (
    <div className="space-y-3">
      <div className="glass-panel flex flex-col justify-between rounded-2xl p-3.5 sm:max-w-xs">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted">
          <MessageSquareText size={13} className="text-purple-300" /> نتایج مصاحبه (خودکار — میانگین داوران)
        </div>
        <p className="num text-2xl font-extrabold text-purple-300">{interviewScore != null ? interviewScore.toLocaleString('fa-IR') : '—'} / ۵</p>
        <p className="mt-1 text-[10px] text-muted">{overallPercent != null ? `٪${overallPercent.toLocaleString('fa-IR')} میانگین وزنی حوزه‌ها` : 'هنوز امتیازدهی نشده'}</p>
      </div>

      <div className="glass-panel space-y-3 rounded-2xl p-4">
        <p className="text-sm font-bold">جمع‌بندی مسئول ارزیابی</p>
        <p className="text-[11px] leading-5 text-muted">
          {panelNotes.length > 0
            ? 'متن زیر از یادداشت‌های داوران تکمیل شده — آن را مرور، ویرایش و تکمیل کنید تا در پروفایل نامزد ثبت شود.'
            : 'جمع‌بندی روایی خودتان از نامزد — جدا از نقاط قوت/ضعف خودکاری که از امتیاز حوزه‌ها استخراج می‌شود و در گزارش نتیجه نشان داده می‌شود.'}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[11px] text-green-300">
              <ThumbsUp size={12} /> نقاط قوت
            </span>
            <textarea
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              onBlur={() => setStrengthsAndDevelopment(assessment.id, strengths, developmentAreas)}
              rows={3}
              className="input resize-none"
              placeholder="جمع‌بندی نقاط قوت برجستهٔ نامزد…"
            />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-[11px] text-amber-300">
              <TrendingUp size={12} /> زمینه‌های قابل بهبود
            </span>
            <textarea
              value={developmentAreas}
              onChange={(e) => setDevelopmentAreas(e.target.value)}
              onBlur={() => setStrengthsAndDevelopment(assessment.id, strengths, developmentAreas)}
              rows={3}
              className="input resize-none"
              placeholder="زمینه‌هایی که نیاز به توسعه دارند…"
            />
          </label>
        </div>
      </div>
    </div>
  )
}

function QualificationChip({
  icon: Icon,
  label,
  value,
  onChange,
  hint,
}: {
  icon: LucideIcon
  label: string
  value: number | null
  onChange: (v: number | null) => void
  hint?: string
}) {
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
      {hint && <p className="mt-1.5 text-[10px] text-muted">{hint}</p>}
    </div>
  )
}
