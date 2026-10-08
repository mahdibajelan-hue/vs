import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, BrainCircuit, Check, Copy, Hourglass, Link2, Send, Wand2 } from 'lucide-react'
import { usePersonalityStore } from '../../personality/store/usePersonalityStore'
import { PersonalityFingerprintPanel } from '../../personality/components/PersonalityFingerprintPanel'
import { PERSONALITY_ASSESSMENT_STATUS_LABEL_FA, type PersonalityAssessmentStatus } from '../../personality/types'
import { tone } from '../lib/tone'
import type { CompetencyAssessment } from '../types'
import '../styles/farinTheme.css'

const SCORED_STATUSES: PersonalityAssessmentStatus[] = ['FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED']

/** The candidate-side journey shown on the in-progress card, each step with its own hue. */
const JOURNEY: { label: string; statuses: PersonalityAssessmentStatus[]; color: string }[] = [
  { label: 'طراحی آزمون', statuses: ['DRAFT', 'DESIGNED', 'GENERATED'], color: '#8b5cf6' },
  { label: 'ارسال لینک', statuses: ['ASSIGNED'], color: '#6366f1' },
  { label: 'پاسخ‌گویی متقاضی', statuses: ['STARTED', 'IN_PROGRESS'], color: '#0ea5e9' },
  { label: 'ثبت و اعتبارسنجی', statuses: ['SUBMITTED', 'VALIDITY_CHECK', 'SCORING'], color: '#f59e0b' },
  { label: 'اثرانگشت رفتاری', statuses: SCORED_STATUSES, color: '#10b981' },
]

interface PersonalityStageProps {
  assessment: CompetencyAssessment
  /** Advances the wizard to the next stage (ارزیابی فنی تخصصی). */
  onContinue: () => void
  /** Sends the viewer back to «پنل طراحی آزمون‌ها» — shown when the personality assessment hasn't
   * been designed yet. */
  onGoToExamDesign: () => void
}

/**
 * «ارزیابی شخصیت و رفتاری» wizard stage (schema.sql Section 44): the not-required / not-designed /
 * in-progress states, then the scored behavioral fingerprint (PersonalityFingerprintPanel).
 * Themed with the scoped FARIN tokens (light + dark).
 */
export function PersonalityStage({ assessment, onContinue, onGoToExamDesign }: PersonalityStageProps) {
  const personalityAssessments = usePersonalityStore((s) => s.assessments)
  const fetchPersonalityAssessments = usePersonalityStore((s) => s.fetchAssessments)

  useEffect(() => {
    // Always refetch: the store is shared across candidates.
    fetchPersonalityAssessments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const personalityAssessment = useMemo(() => personalityAssessments.find((a) => a.assessmentId === assessment.id), [personalityAssessments, assessment.id])

  if (!assessment.needsPersonalityAssessment) {
    return (
      <StateCard icon={BrainCircuit} color="#94a3b8" title="ارزیابی شخصیت و رفتاری لازم نیست" text="این متقاضی بر اساس طرح ارزیابی به ارزیابی شخصیت و رفتاری نیاز ندارد.">
        <button onClick={onContinue} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500">
          رفتن به ارزیابی فنی <ArrowLeft size={13} />
        </button>
      </StateCard>
    )
  }

  if (!personalityAssessment || personalityAssessment.selectedQuestionIds.length === 0) {
    return (
      <StateCard icon={Wand2} color="#ec4899" title="آزمون هنوز طراحی نشده است" text="آزمون شخصیت و رفتاری این متقاضی هنوز طراحی نشده است. طراح آزمون می‌تواند آن را از «طراحی آزمون‌ها» بسازد.">
        {/* A second way forward: only a designer can design it, so a non-designer lead still gets a way out. */}
        <button onClick={onGoToExamDesign} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-pink-600 px-4 py-2 text-xs font-bold text-white hover:bg-pink-500">
          <Wand2 size={13} /> رفتن به پنل طراحی آزمون‌ها
        </button>
        <button onClick={onContinue} className="fx-sub flex min-h-11 items-center gap-1.5 px-4 py-2 text-xs font-bold hover:brightness-110">
          ادامه بدون انتظار <ArrowLeft size={13} />
        </button>
      </StateCard>
    )
  }

  if (!SCORED_STATUSES.includes(personalityAssessment.status)) {
    return <PersonalityInProgressCard assessment={personalityAssessment} onContinue={onContinue} />
  }

  return (
    <PersonalityFingerprintPanel
      personalityAssessmentId={personalityAssessment.id}
      candidateName={assessment.candidateName}
      candidatePosition={assessment.candidatePosition}
      onContinue={onContinue}
    />
  )
}

function StateCard({ icon: Icon, color, title, text, children }: { icon: typeof Wand2; color: string; title: string; text: string; children: ReactNode }) {
  return (
    <div className="fx fx-remap">
      <div className="fx-card fx-tone-wash flex flex-col items-center gap-3 p-8 text-center" style={tone(color)}>
        <span className="fx-tone-bg-strong fx-tone-text flex h-14 w-14 items-center justify-center rounded-2xl">
          <Icon size={26} />
        </span>
        <p className="text-[15px] font-extrabold">{title}</p>
        <p className="fx-text-2 max-w-lg text-[12.5px] leading-7">{text}</p>
        <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      </div>
    </div>
  )
}

/** Generated but not yet scored — the candidate hasn't started or finished. Shows where the
 * candidate is in the journey and the copyable candidate link. */
function PersonalityInProgressCard({ assessment, onContinue }: { assessment: { status: PersonalityAssessmentStatus; candidateToken: string }; onContinue: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = `${window.location.origin}${window.location.pathname}?p_candidate=${assessment.candidateToken}`
  const currentStep = Math.max(0, JOURNEY.findIndex((j) => j.statuses.includes(assessment.status)))
  return (
    <div className="fx fx-remap space-y-4">
      <div className="fx-card fx-tone-wash p-5" style={tone('#ec4899')}>
        <div className="mb-4 flex items-start gap-3">
          <span className="fx-tone-bg-strong fx-tone-text flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
            <Hourglass size={22} />
          </span>
          <div>
            <p className="text-[15px] font-black">ارزیابی شخصیت و رفتاری در جریان است</p>
            <p className="fx-text-2 mt-1 text-[12px] leading-6">
              اثرانگشت رفتاری پس از ثبت پاسخ‌ها و اعتبارسنجی آن‌ها نمایش داده می‌شود. وضعیت فعلی: <b>{PERSONALITY_ASSESSMENT_STATUS_LABEL_FA[assessment.status]}</b>
            </p>
          </div>
        </div>

        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5" aria-label="مراحل ارزیابی شخصیت">
          {JOURNEY.map((j, i) => {
            const done = i < currentStep
            const current = i === currentStep
            return (
              <li
                key={j.label}
                aria-current={current ? 'step' : undefined}
                className={`fx-sub flex items-center gap-2 p-2.5 sm:flex-col sm:text-center ${current ? 'fx-tone-border border-2' : ''} ${!done && !current ? 'opacity-60' : ''}`}
                style={tone(j.color)}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${done || current ? 'fx-tone-bg-strong fx-tone-text' : 'fx-muted'}`}>
                  {done ? <Check size={15} /> : (i + 1).toLocaleString('fa-IR')}
                </span>
                <span className={`text-[11.5px] font-bold ${current ? 'fx-tone-text' : ''}`}>{j.label}</span>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="fx-card space-y-3 p-5" style={tone('#6366f1')}>
        <p className="flex items-center gap-1.5 text-[13.5px] font-extrabold">
          <Link2 size={15} className="fx-tone-text" /> لینک ورود متقاضی به ارزیابی شخصیت
        </p>
        <p className="fx-text-2 text-[12px] leading-6">این لینک را برای متقاضی ارسال کنید تا گویه‌های ارزیابی شخصیت و رفتاری را پاسخ دهد. لینک نیاز به ورود به سامانه ندارد.</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input readOnly dir="ltr" aria-label="لینک ورود متقاضی" value={url} className="input flex-1 text-[11.5px]" onFocus={(e) => e.target.select()} />
          <button
            onClick={() => {
              navigator.clipboard?.writeText(url)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            }}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-[12px] font-bold text-white hover:bg-indigo-500"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'کپی شد' : 'کپی لینک'}
          </button>
          <a
            href={`mailto:?subject=${encodeURIComponent('لینک ارزیابی شخصیت و رفتاری — فرین')}&body=${encodeURIComponent(url)}`}
            className="fx-sub flex min-h-11 items-center justify-center gap-1.5 px-4 text-[12px] font-bold hover:brightness-110"
          >
            <Send size={14} /> ارسال با ایمیل
          </a>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={onContinue} className="fx-sub flex min-h-11 items-center gap-1.5 px-4 py-2 text-xs font-bold hover:brightness-110">
          رفتن به ارزیابی فنی (بدون انتظار) <ArrowLeft size={13} />
        </button>
      </div>
    </div>
  )
}
