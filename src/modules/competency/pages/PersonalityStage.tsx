import { useEffect, useState } from 'react'
import { ArrowLeft, Copy, Link2, Wand2 } from 'lucide-react'
import { usePersonalityStore } from '../../personality/store/usePersonalityStore'
import { PersonalityFingerprintPanel } from '../../personality/components/PersonalityFingerprintPanel'
import { PERSONALITY_ASSESSMENT_STATUS_LABEL_FA, type PersonalityAssessmentStatus } from '../../personality/types'
import type { CompetencyAssessment } from '../types'

const SCORED_STATUSES: PersonalityAssessmentStatus[] = ['FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED']

interface PersonalityStageProps {
  assessment: CompetencyAssessment
  /** Advances the wizard to the next stage (ارزیابی فنی تخصصی) — used both by the "not required"
   * shortcut and by the normal continue button once results have been reviewed. */
  onContinue: () => void
  /** Sends the viewer back to «پنل طراحی آزمون‌ها» — shown when the personality assessment hasn't
   * been designed yet. */
  onGoToExamDesign: () => void
}

/**
 * The candidate's personality/behavioral stage, embedded directly in the competency wizard (spec
 * follow-up, schema.sql Section 44) rather than reached through the old standalone Personality
 * module. Mirrors PersonalityResultsPage's content once the assessment is scored — same trait/
 * dimension bars, computed patterns/watchpoints, AI analysis card and print button — just laid out
 * inside CompetencySidebarShell's content area instead of its own full-page shell.
 */
export function PersonalityStage({ assessment, onContinue, onGoToExamDesign }: PersonalityStageProps) {
  const personalityAssessments = usePersonalityStore((s) => s.assessments)
  const fetchPersonalityAssessments = usePersonalityStore((s) => s.fetchAssessments)

  useEffect(() => {
    if (personalityAssessments.length === 0) fetchPersonalityAssessments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const personalityAssessment = personalityAssessments.find((a) => a.assessmentId === assessment.id)

  if (!assessment.needsPersonalityAssessment) {
    return (
      <div className="glass-panel space-y-3 rounded-2xl p-6 text-center">
        <p className="text-xs text-secondary">این متقاضی برای این شغل به ارزیابی شخصیت نیاز ندارد.</p>
        <button
          onClick={onContinue}
          className="mx-auto flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
        >
          رفتن به ارزیابی فنی <ArrowLeft size={13} />
        </button>
      </div>
    )
  }

  if (!personalityAssessment || personalityAssessment.selectedQuestionIds.length === 0) {
    return (
      <div className="glass-panel space-y-3 rounded-2xl p-6 text-center">
        <p className="text-xs text-secondary">آزمون شخصیت و رفتاری این متقاضی هنوز طراحی نشده است.</p>
        <button
          onClick={onGoToExamDesign}
          className="mx-auto flex items-center gap-1.5 rounded-xl bg-pink-500 px-4 py-2 text-xs font-bold text-white hover:bg-pink-400"
        >
          <Wand2 size={13} /> رفتن به پنل طراحی آزمون‌ها
        </button>
      </div>
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

function copyLink(token: string) {
  const url = `${window.location.origin}${window.location.pathname}?p_candidate=${token}`
  navigator.clipboard?.writeText(url)
}

/** Assessment generated (question mix chosen) but not yet scored — the candidate either hasn't
 * started or hasn't finished answering. Shown alongside the same copy-link affordance
 * PersonalityDashboardPage used to offer, since a lead now reaches it from here instead. */
function PersonalityInProgressCard({ assessment, onContinue }: { assessment: { status: PersonalityAssessmentStatus; candidateToken: string }; onContinue: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="glass-panel space-y-3 rounded-2xl p-4">
      <p className="flex items-center gap-1.5 text-sm font-bold">
        <Link2 size={14} className="text-pink-300" /> لینک ورود متقاضی به ارزیابی شخصیت
      </p>
      <p className="text-[11px] leading-6 text-muted">این لینک را برای متقاضی ارسال کنید تا گویه‌های ارزیابی شخصیت و رفتاری را پاسخ دهد.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          dir="ltr"
          value={`${window.location.origin}${window.location.pathname}?p_candidate=${assessment.candidateToken}`}
          className="input flex-1 text-[11px]"
          onFocus={(e) => e.target.select()}
        />
        <button
          onClick={() => {
            copyLink(assessment.candidateToken)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="flex items-center gap-1.5 rounded-lg bg-pink-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-pink-400"
        >
          <Copy size={12} /> {copied ? 'کپی شد' : 'کپی لینک'}
        </button>
      </div>
      <span className="inline-flex w-fit rounded-full bg-pink-500/15 px-2.5 py-1 text-[10.5px] font-bold text-pink-200">
        وضعیت فعلی: {PERSONALITY_ASSESSMENT_STATUS_LABEL_FA[assessment.status]}
      </span>
      <div className="flex justify-end">
        <button onClick={onContinue} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs text-secondary hover:bg-white/5">
          رفتن به ارزیابی فنی (بدون انتظار) <ArrowLeft size={13} />
        </button>
      </div>
    </div>
  )
}

