import { useState } from 'react'
import { Award, Briefcase, BookOpen, CheckCircle2, GraduationCap, Plus, ThumbsUp, TrendingUp, Wand2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCompetencyStore, type QualificationScoresInput } from '../store/useCompetencyStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { COMPETENCY_DOMAINS, questionsForDomain } from '../lib/competencyModel'
import { usesLegacyPmRubric, questionsForAssessment } from '../lib/roleCompetencyModel'
import { jobRoleLabel } from '../lib/competencyData'
import type { CompPanelistScore } from '../types'
import { QuestionScoreCard } from './QuestionScoreCard'
import { RoleQuestionScoreCard } from './RoleQuestionScoreCard'
import { CapstoneCard } from './CapstoneCard'
import { ScoringGuideBanner } from './ScoringGuideBanner'
import { AssessmentDesignerModal } from './AssessmentDesignerModal'

/**
 * Every panelist's own, independent technical-scoring sheet (comp_panelist_scores) — moved here out
 * of PanelStage.tsx (which now only assembles the panel) so it lives in the "ارزیابی فنی تخصصی"
 * ("questions") stage instead: assembling who is on the panel and deciding/scoring the technical
 * exam are two different jobs, and a panelist should not be able to start scoring from inside panel
 * assembly before the lead has even decided (examDesign) whether a technical exam happens at all.
 * Renders nothing when the current viewer isn't on this assessment's panel — the caller decides
 * whether to also show the "you're not on the panel" message.
 */
export function PanelistScoreSheet({ assessmentId }: { assessmentId: string }) {
  const panelists = useCompetencyStore((s) => s.panelists).filter((p) => p.assessmentId === assessmentId)
  const panelistScores = useCompetencyStore((s) => s.panelistScores).filter((p) => p.assessmentId === assessmentId)
  const assessment = useCompetencyStore((s) => s.assessments.find((a) => a.id === assessmentId))
  const setMyPanelistAnswer = useCompetencyStore((s) => s.setMyPanelistAnswer)
  const setMyPanelistCapstone = useCompetencyStore((s) => s.setMyPanelistCapstone)
  const setMyPanelistQualificationScores = useCompetencyStore((s) => s.setMyPanelistQualificationScores)
  const setMyPanelistStrengths = useCompetencyStore((s) => s.setMyPanelistStrengths)
  const submitMyPanelistScore = useCompetencyStore((s) => s.submitMyPanelistScore)
  const questionBank = useCompetencyStore((s) => s.questionBank)
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)

  const myId = useAuthStore((s) => s.profile?.id ?? null)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const myPanelistRow = panelists.find((p) => p.userId === myId)
  const isLead = assessment?.createdBy === myId || isAdmin || myPanelistRow?.isLead === true
  const moduleAdmins = useCompetencyStore((s) => s.moduleAdmins)
  const isModuleAdmin = isAdmin || moduleAdmins.some((m) => m.userId === myId)
  const assessmentLocked = assessment?.status === 'completed'
  const isPM = assessment != null && usesLegacyPmRubric(assessment)

  const [designerOpen, setDesignerOpen] = useState(false)

  const myScore = panelistScores.find((p) => p.panelistId === myId)
  const amPanelist = panelists.some((p) => p.userId === myId)
  const canSubmitMyScore = Boolean(myScore?.strengths.trim()) && Boolean(myScore?.developmentAreas.trim())
  // Mirrors comp_panelist_scores_update (Section 35) + the completed lock (Section 53): after my own
  // final submit only a module admin may still edit my sheet, and nobody may once the assessment is
  // completed (until a module admin reopens it).
  const canEditMySheet = !assessmentLocked && (!myScore?.submittedAt || isModuleAdmin)

  const roleQuestions = assessment && !isPM ? questionsForAssessment(assessment, questionBank) : []
  // PM's fixed rubric questions are seeded into the bank verbatim so a panelist can reveal the
  // same reference-answer material every other role already has — matched by exact question text.
  const pmBankByText = new Map(questionBank.filter((q) => q.jobRole === 'project_manager').map((q) => [q.questionText, q]))

  if (!amPanelist || !assessment) return null

  return (
    <div className="space-y-3">
      <div className="glass-panel rounded-2xl border-purple-400/25 p-3.5">
        <p className="text-xs font-bold">برگه امتیازدهی شما</p>
        <p className="mt-1 text-[11px] leading-6 text-secondary">
          امتیازهای شما مستقل از سایر داوران ثبت می‌شود. پس از پایان، دکمهٔ «ثبت نهایی امتیاز من» را بزنید — تا آن لحظه نظر شما برای مسئول ارزیابی نمایش
          داده نمی‌شود.
        </p>
        {myScore?.submittedAt && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-green-300">
            <CheckCircle2 size={12} />
            {isModuleAdmin && !assessmentLocked
              ? 'امتیاز شما ثبت نهایی شده و برای مسئول ارزیابی قابل مشاهده است. به‌عنوان ادمین ماژول همچنان می‌توانید آن را اصلاح کنید؛ هر تغییر مستقیماً در میانگین رسمی اثر می‌گذارد.'
              : 'امتیاز شما ثبت نهایی شده و برای مسئول ارزیابی قابل مشاهده است. برگهٔ ثبت‌شده دیگر قابل ویرایش نیست؛ برای اصلاح با ادمین ماژول هماهنگ کنید.'}
          </p>
        )}
        {assessmentLocked && (
          <p className="mt-1.5 text-[11px] text-amber-300">این ارزیابی ثبت نهایی شده و برگه‌های امتیاز قفل است؛ اصلاح فقط پس از بازگشایی توسط ادمین ماژول ممکن است.</p>
        )}
      </div>
      <MyQualificationScorecard myScore={myScore} readOnly={!canEditMySheet} onChange={(patch) => setMyPanelistQualificationScores(assessmentId, patch)} />
      <ScoringGuideBanner />
      {isPM ? (
        <>
          {COMPETENCY_DOMAINS.map((domain) => (
            <div key={domain.key} className="glass-panel space-y-2.5 rounded-2xl p-3.5">
              <p className="text-xs font-bold">{domain.title}</p>
              {questionsForDomain(domain.key).map((q, i) => (
                <QuestionScoreCard
                  key={q.key}
                  index={i}
                  question={q}
                  hint={domain.excellentAnswerHint}
                  answer={myScore?.answers[q.key]}
                  editable={canEditMySheet}
                  onChange={(score, note) => setMyPanelistAnswer(assessmentId, q.key, score, note)}
                  bankItem={pmBankByText.get(q.text)}
                />
              ))}
            </div>
          ))}
          <CapstoneCard
            score={myScore?.capstoneScore ?? null}
            note={myScore?.capstoneNote ?? ''}
            editable={canEditMySheet}
            onChange={(score, note) => setMyPanelistCapstone(assessmentId, score, note)}
          />
        </>
      ) : roleQuestions.length === 0 ? (
        <div className="glass-panel rounded-2xl p-5 text-center">
          <p className="mb-3 text-xs text-secondary">
            هنوز سؤالی برای این ارزیابی («{jobRoleLabel(jobRoleConfigs, assessment.jobRole)}») انتخاب نشده است.
          </p>
          {isLead ? (
            <>
              <button
                onClick={() => setDesignerOpen(true)}
                className="mx-auto flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
              >
                <Wand2 size={13} /> طراحی آزمون شایستگی
              </button>
              {designerOpen && <AssessmentDesignerModal assessmentId={assessment.id} jobRole={assessment.jobRole} onClose={() => setDesignerOpen(false)} />}
            </>
          ) : (
            <p className="text-[11px] text-muted">به مسئول ارزیابی اطلاع دهید تا سؤالات را انتخاب کند.</p>
          )}
        </div>
      ) : (
        roleQuestions.map((q, i) => (
          <RoleQuestionScoreCard
            key={q.id}
            index={i}
            question={q}
            answer={myScore?.answers[q.id]}
            editable={canEditMySheet}
            onChange={(score, note, candidateAnswer) => setMyPanelistAnswer(assessmentId, q.id, score, note, candidateAnswer)}
          />
        ))
      )}
      <MyStrengthsCard
        key={myScore?.id ?? 'draft'}
        myScore={myScore}
        readOnly={!canEditMySheet}
        onSave={(strengths, developmentAreas) => setMyPanelistStrengths(assessmentId, strengths, developmentAreas)}
      />
      <div className="flex items-center justify-end gap-2">
        {myScore?.submittedAt ? (
          <span className="flex items-center gap-1.5 rounded-xl bg-green-500/15 px-4 py-2 text-xs font-bold text-green-300">
            <CheckCircle2 size={14} /> امتیاز شما ثبت نهایی شد
          </span>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            {!canSubmitMyScore && <p className="text-[10.5px] text-amber-300">پیش از ثبت نهایی، نقاط قوت و زمینه‌های قابل بهبود را تکمیل کنید.</p>}
            <button
              disabled={!canSubmitMyScore || assessmentLocked}
              onClick={() => submitMyPanelistScore(assessmentId)}
              className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={14} /> ثبت نهایی امتیاز من
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const QUALIFICATION_CHIP_CONFIG: { key: keyof QualificationScoresInput; icon: LucideIcon; label: string; color: string }[] = [
  { key: 'educationScore', icon: GraduationCap, label: 'مدرک تحصیلی', color: '#a855f7' },
  { key: 'experienceScore', icon: Briefcase, label: 'سوابق کاری مرتبط', color: '#38bdf8' },
  { key: 'pmTrainingScore', icon: BookOpen, label: 'دوره‌های حرفه‌ای تخصصی', color: '#f59e0b' },
  { key: 'pmCertificationScore', icon: Award, label: 'صلاحیت حرفه‌ای مرتبط', color: '#34d399' },
]

/** Every panelist's own qualification scorecard — previously only the lead ever saw/filled this, and
 * it lived on the shared comp_assessments row; now each judge scores it independently on their own
 * comp_panelist_scores row, and the final value shown in results is the panel's average. Colorful
 * per-component cards so the card reads as inviting rather than another gray form. */
function MyQualificationScorecard({
  myScore,
  readOnly,
  onChange,
}: {
  myScore: CompPanelistScore | undefined
  readOnly: boolean
  onChange: (patch: QualificationScoresInput) => void
}) {
  const current: QualificationScoresInput = {
    educationScore: myScore?.educationScore ?? null,
    experienceScore: myScore?.experienceScore ?? null,
    pmTrainingScore: myScore?.pmTrainingScore ?? null,
    pmCertificationScore: myScore?.pmCertificationScore ?? null,
  }

  return (
    <div className="glass-panel rounded-2xl p-3.5">
      <p className="mb-2.5 text-xs font-bold">کارت امتیاز شایستگی (بر اساس سوابق و مدارک نامزد)</p>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {QUALIFICATION_CHIP_CONFIG.map(({ key, icon: Icon, label, color }) => {
          const value = current[key]
          return (
            <div key={key} className="rounded-xl border p-2.5" style={{ borderColor: `${color}35`, background: `linear-gradient(150deg, ${color}14, transparent 70%)` }}>
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold" style={{ color }}>
                <Icon size={13} /> {label}
              </div>
              <div className="flex flex-wrap gap-1">
                {[0, 1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChange({ ...current, [key]: value === s ? null : s })}
                    className="num flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] font-bold transition-colors disabled:cursor-not-allowed"
                    style={{
                      borderColor: value === s ? color : `${color}35`,
                      background: value === s ? color : `${color}12`,
                      color: value === s ? '#fff' : color,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Mandatory wrap-up for a panelist's own score sheet — strengths/development-areas must both be
 * filled before "ثبت نهایی امتیاز من" is enabled (see canSubmitMyScore above). Keyed by myScore's
 * id from the parent so local draft state resets cleanly once the fetched row actually arrives. */
function MyStrengthsCard({
  myScore,
  readOnly,
  onSave,
}: {
  myScore: CompPanelistScore | undefined
  readOnly: boolean
  onSave: (strengths: string, developmentAreas: string) => void
}) {
  const [strengths, setStrengths] = useState(myScore?.strengths ?? '')
  const [developmentAreas, setDevelopmentAreas] = useState(myScore?.developmentAreas ?? '')

  return (
    <div className="glass-panel space-y-3 rounded-2xl border-amber-400/20 p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-bold">جمع‌بندی شما — تکمیل این بخش برای ثبت نهایی الزامی است</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] text-green-300">
            <ThumbsUp size={12} /> نقاط قوت
          </span>
          <textarea
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
            onBlur={() => !readOnly && onSave(strengths, developmentAreas)}
            readOnly={readOnly}
            rows={3}
            className="input resize-none"
            placeholder="نقاط قوت برجستهٔ نامزد از دید شما…"
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-[11px] text-amber-300">
            <TrendingUp size={12} /> زمینه‌های قابل بهبود
          </span>
          <textarea
            value={developmentAreas}
            onChange={(e) => setDevelopmentAreas(e.target.value)}
            onBlur={() => !readOnly && onSave(strengths, developmentAreas)}
            readOnly={readOnly}
            rows={3}
            className="input resize-none"
            placeholder="زمینه‌هایی که نیاز به توسعه دارند…"
          />
        </label>
      </div>
    </div>
  )
}
