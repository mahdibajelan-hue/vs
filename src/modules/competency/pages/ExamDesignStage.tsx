import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BrainCircuit, Briefcase, CheckCircle2, Copy, LayoutTemplate, Link2, ListChecks, Loader2, MessagesSquare, RotateCw, Wand2 } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { usePersonalityStore } from '../../personality/store/usePersonalityStore'
import { PersonalityDesignerModal } from '../../personality/components/PersonalityDesignerModal'
import { PERSONALITY_ASSESSMENT_STATUS_LABEL_FA } from '../../personality/types'
import { AssessmentDesignerModal } from '../components/AssessmentDesignerModal'
import type { CompAssessmentBlueprint, CompetencyAssessment } from '../types'
import { fetchMcqTestDetail, generateMcqTest, mcqCandidateUrl, mcqErrorFa, MCQ_TEST_STATUS_LABEL_FA, type McqTestDetail } from '../lib/mcqData'

interface ExamDesignStageProps {
  assessment: CompetencyAssessment
  /** Only an ASSESSMENT_DESIGNER (or module admin) may toggle the two switches below or open either
   * mix designer — everyone else sees the same panel as read-only status badges. */
  isDesigner: boolean
  /** Advances the wizard to the next stage (ارزیابی شخصیت و رفتاری). */
  onContinue: () => void
}

/**
 * "پنل طراحی آزمون‌ها" (spec follow-up, schema.sql Section 44): the assessment designer decides,
 * per candidate, whether a personality/behavioral assessment and/or the technical assessment are
 * required, then configures each one's own question mix from here — the technical mix via the
 * existing AssessmentDesignerModal (unchanged), the personality mix via the personality module's own
 * PersonalityDesignerModal, embedded rather than reached through a separate top-level module.
 * An Assessment Blueprint (schema.sql Section 50) sets all four method toggles at once; the toggles
 * stay individually adjustable afterwards.
 */
export function ExamDesignStage({ assessment, isDesigner, onContinue }: ExamDesignStageProps) {
  const setExamDesign = useCompetencyStore((s) => s.setExamDesign)
  const applyBlueprint = useCompetencyStore((s) => s.applyBlueprint)
  const assessmentBlueprints = useCompetencyStore((s) => s.assessmentBlueprints)
  const fetchAssessmentBlueprints = useCompetencyStore((s) => s.fetchAssessmentBlueprints)
  const assessmentTemplates = useCompetencyStore((s) => s.assessmentTemplates)
  const fetchAssessmentTemplates = useCompetencyStore((s) => s.fetchAssessmentTemplates)

  const personalityAssessments = usePersonalityStore((s) => s.assessments)
  const frameworks = usePersonalityStore((s) => s.frameworks)
  const jobProfiles = usePersonalityStore((s) => s.jobProfiles)
  const fetchCatalog = usePersonalityStore((s) => s.fetchCatalog)
  const fetchPersonalityAssessments = usePersonalityStore((s) => s.fetchAssessments)
  const createPersonalityAssessment = usePersonalityStore((s) => s.createAssessment)

  const [technicalDesignerOpen, setTechnicalDesignerOpen] = useState(false)
  const [personalityDesignerId, setPersonalityDesignerId] = useState<string | null>(null)
  const [creatingPersonality, setCreatingPersonality] = useState(false)
  const [pickedBlueprintId, setPickedBlueprintId] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const panelistScores = useCompetencyStore((s) => s.panelistScores)
  const interviewRatings = useCompetencyStore((s) => s.interviewRatings)
  const fetchInterviewRatings = useCompetencyStore((s) => s.fetchInterviewRatings)
  // N-14: a completed assessment's design is frozen (the server refuses it too — Section 53 lock).
  const completed = assessment.status === 'completed'
  const canEdit = isDesigner && !completed

  const [mcqTest, setMcqTest] = useState<McqTestDetail | null>(null)
  const [mcqLoading, setMcqLoading] = useState(false)
  const refreshMcqTest = async () => {
    setMcqLoading(true)
    const { data } = await fetchMcqTestDetail(assessment.id)
    setMcqTest(data)
    setMcqLoading(false)
  }

  useEffect(() => {
    if (frameworks.length === 0) fetchCatalog()
    // Always refetch: the store is shared across candidates, so a cached list from an earlier visit
    // can predate this candidate's personality assessment (created later, or by the candidate link).
    fetchPersonalityAssessments()
    fetchAssessmentBlueprints()
    if (assessmentTemplates.length === 0) fetchAssessmentTemplates()
    fetchInterviewRatings(assessment.id)
    refreshMcqTest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const roleBlueprints = useMemo(
    () =>
      assessmentBlueprints
        .filter((b) => b.jobRole === assessment.jobRole && b.active)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.title.localeCompare(b.title, 'fa')),
    [assessmentBlueprints, assessment.jobRole],
  )
  const appliedBlueprint = assessmentBlueprints.find((b) => b.id === assessment.blueprintId)
  const selectedBlueprint =
    roleBlueprints.find((b) => b.id === pickedBlueprintId) ??
    roleBlueprints.find((b) => b.id === assessment.blueprintId) ??
    roleBlueprints.find((b) => b.isDefault) ??
    roleBlueprints[0]
  // The designer modals start from the blueprint actually applied to this candidate; before any has
  // been applied, from whichever one is currently picked.
  const templateSource = appliedBlueprint ?? selectedBlueprint
  const designDiffersFromApplied =
    !!appliedBlueprint &&
    (appliedBlueprint.includesTechnical !== assessment.needsTechnicalAssessment ||
      appliedBlueprint.includesPersonality !== assessment.needsPersonalityAssessment ||
      appliedBlueprint.includesStructuredInterview !== assessment.needsStructuredInterview ||
      appliedBlueprint.includesExperience !== assessment.includesExperience ||
      appliedBlueprint.includesOnlineMcq !== assessment.needsOnlineMcq)

  // N-14: which methods already produced evidence for this candidate — switching one of those off
  // makes that evidence "out of design" (it stops counting), so it needs an explicit confirmation.
  const personalityForEvidence = personalityAssessments.find((a) => a.assessmentId === assessment.id)
  const methodEvidence: Record<'personality' | 'technical' | 'interview' | 'experience' | 'onlineMcq', string | null> = {
    technical:
      assessment.selectedQuestionIds.some((id) => assessment.answers[id]?.score != null) ||
      panelistScores.some((ps) => ps.assessmentId === assessment.id && assessment.selectedQuestionIds.some((id) => ps.answers[id]?.score != null))
        ? 'امتیازهای ثبت‌شده‌ی ارزیابی فنی حضوری'
        : null,
    interview: interviewRatings.some((r) => r.assessmentId === assessment.id) ? 'امتیازهای مصاحبه‌ی ساختاریافته' : null,
    personality:
      personalityForEvidence && !['DRAFT', 'DESIGNED', 'GENERATED', 'ASSIGNED'].includes(personalityForEvidence.status)
        ? 'پاسخ‌ها/نتیجه‌ی آزمون شخصیت'
        : null,
    experience:
      assessment.yearsExperienceTotal != null || assessment.yearsExperiencePipeline != null || assessment.certifications.length > 0 || assessment.education.length > 0
        ? 'سوابق و تجربه‌ی ثبت‌شده'
        : null,
    onlineMcq: mcqTest && mcqTest.status !== 'NOT_STARTED' ? 'پاسخ‌ها/نتیجه‌ی آزمون تستی آنلاین' : null,
  }
  const confirmDroppingEvidence = (turnedOff: (keyof typeof methodEvidence)[]) => {
    const lost = turnedOff.map((k) => methodEvidence[k]).filter((x): x is string => x != null)
    if (lost.length === 0) return true
    return window.confirm(
      `برای این متقاضی ${lost.join('، ')} ثبت شده است. با خارج کردن این روش از طرح، این شواهد دیگر در محاسبه‌ی شایستگی حساب نمی‌شوند (حذف نمی‌شوند و با برگرداندن روش دوباره حساب می‌شوند). ادامه می‌دهید؟`,
    )
  }

  const handleApplyBlueprint = async () => {
    if (!selectedBlueprint || !canEdit) return
    const turnedOff = (
      [
        ['personality', assessment.needsPersonalityAssessment && !selectedBlueprint.includesPersonality],
        ['technical', assessment.needsTechnicalAssessment && !selectedBlueprint.includesTechnical],
        ['interview', assessment.needsStructuredInterview && !selectedBlueprint.includesStructuredInterview],
        ['experience', assessment.includesExperience && !selectedBlueprint.includesExperience],
        ['onlineMcq', assessment.needsOnlineMcq && !selectedBlueprint.includesOnlineMcq],
      ] as const
    )
      .filter(([, off]) => off)
      .map(([k]) => k)
    if (!confirmDroppingEvidence([...turnedOff])) return
    setApplying(true)
    await applyBlueprint(assessment.id, selectedBlueprint)
    setApplying(false)
  }

  const toggle = (patch: { personality?: boolean; technical?: boolean; interview?: boolean; experience?: boolean; onlineMcq?: boolean }) => {
    if (!canEdit) return
    const turnedOff = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => patch[k] === false)
    if (!confirmDroppingEvidence(turnedOff)) return
    return setExamDesign(assessment.id, patch.personality ?? assessment.needsPersonalityAssessment, patch.technical ?? assessment.needsTechnicalAssessment, {
      needsStructuredInterview: patch.interview,
      includesExperience: patch.experience,
      needsOnlineMcq: patch.onlineMcq,
    })
  }

  const personalityAssessment = personalityAssessments.find((a) => a.assessmentId === assessment.id)

  const handleOpenPersonalityDesigner = async () => {
    if (personalityAssessment) {
      setPersonalityDesignerId(personalityAssessment.id)
      return
    }
    setCreatingPersonality(true)
    const frameworkId = frameworks.find((f) => f.active)?.id ?? null
    const jobProfileId = jobProfiles.find((p) => p.jobRole === assessment.jobRole && p.active)?.id ?? null
    const id = await createPersonalityAssessment(assessment.id, assessment.jobRole, frameworkId, jobProfileId)
    setCreatingPersonality(false)
    if (id) setPersonalityDesignerId(id)
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <LayoutTemplate size={15} className="text-sky-300" /> الگوی ارزیابی
          </p>
          {appliedBlueprint ? (
            <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[10.5px] font-bold text-sky-200">
              اعمال‌شده: {appliedBlueprint.title} <span className="num">(نسخه {appliedBlueprint.version.toLocaleString('fa-IR')})</span>
            </span>
          ) : (
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10.5px] font-bold text-muted">هنوز الگویی اعمال نشده</span>
          )}
        </div>
        <p className="mb-3 text-[11px] leading-6 text-muted">
          الگوی ارزیابی مشخص می‌کند متقاضی این شغل از کدام روش‌های ارزیابی عبور کند. روشی که در طرح نباشد در محاسبه شایستگی «خارج از طرح» حساب
          می‌شود، نه «فاقد شواهد».
        </p>
        {roleBlueprints.length === 0 ? (
          <p className="text-[11px] text-amber-300/90">برای این شغل هنوز الگوی ارزیابی فعالی تعریف نشده است (تنظیمات ← مدل شایستگی و مشاغل).</p>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[14rem] flex-1">
                <span className="mb-1 block text-[10px] text-muted">الگو</span>
                <select
                  value={selectedBlueprint?.id ?? ''}
                  onChange={(e) => setPickedBlueprintId(e.target.value)}
                  disabled={!canEdit}
                  className="input !py-1.5 text-[11px]"
                >
                  {roleBlueprints.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.title}
                      {b.isDefault ? ' (پیش‌فرض)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {canEdit && (
                <button
                  onClick={handleApplyBlueprint}
                  disabled={applying || !selectedBlueprint}
                  className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white hover:bg-sky-400 disabled:opacity-40"
                >
                  {applying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} اعمال الگو
                </button>
              )}
            </div>
            {selectedBlueprint && (
              <BlueprintSummary
                blueprint={selectedBlueprint}
                technicalTemplateTitle={assessmentTemplates.find((t) => t.id === selectedBlueprint.technicalTemplateId)?.title}
              />
            )}
            {designDiffersFromApplied && (
              <p className="text-[10.5px] text-amber-300/90">طرح این متقاضی پس از اعمال الگو به‌صورت دستی تغییر کرده است.</p>
            )}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-1 text-sm font-bold">طرح ارزیابی این متقاضی</p>
        <p className="mb-3 text-[11px] leading-6 text-muted">
          مشخص کنید این متقاضی به کدام بخش‌های ارزیابی نیاز دارد. برنامه‌ی متقاضی یک بخش <span className="font-bold text-purple-300">حضوری</span> دارد
          (ارزیابی فنی تخصصی، در جلسه‌ی حضوری با پنل مصاحبه‌گران) و دو بخش <span className="font-bold text-teal-300">آنلاین</span> که متقاضی از طریق
          لینک اختصاصی خودش پاسخ می‌دهد (شخصیت و رفتاری، و آزمون تستی). روشی که در طرح نباشد در محاسبه‌ی شایستگی «خارج از طرح» حساب می‌شود، نه «فاقد
          شواهد».
        </p>
        {completed && isDesigner && (
          <p className="mb-3 rounded-xl border border-slate-400/25 bg-white/[0.03] p-2.5 text-[11px] leading-6 text-secondary">
            این ارزیابی ثبت نهایی شده و طرح آن قفل است. برای تغییر، ادمین ماژول باید ابتدا ارزیابی را بازگشایی کند.
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ExamDesignToggle
            icon={<ListChecks size={14} />}
            color="#a855f7"
            title="ارزیابی فنی تخصصی — حضوری"
            description="پرسش‌های تخصصی و مصاحبه با پنل مصاحبه‌گران، در جلسه‌ی حضوری."
            checked={assessment.needsTechnicalAssessment}
            isDesigner={canEdit}
            onChange={(checked) => toggle({ technical: checked })}
          />
          <ExamDesignToggle
            icon={<BrainCircuit size={14} />}
            color="#f472b6"
            title="شخصیت و رفتاری — آنلاین"
            description="سنجش تمایلات رفتاری حرفه‌ای؛ متقاضی از طریق لینک اختصاصی به‌صورت آنلاین پاسخ می‌دهد."
            checked={assessment.needsPersonalityAssessment}
            isDesigner={canEdit}
            onChange={(checked) => toggle({ personality: checked })}
          />
          <ExamDesignToggle
            icon={<ListChecks size={14} />}
            color="#2dd4bf"
            title="آزمون تستی — آنلاین"
            description="آزمون چهارگزینه‌ای برای سنجش جامعیت دانش فنی؛ متقاضی از طریق لینک اختصاصی به‌صورت آنلاین پاسخ می‌دهد."
            checked={assessment.needsOnlineMcq}
            isDesigner={canEdit}
            onChange={(checked) => toggle({ onlineMcq: checked })}
          />
          <ExamDesignToggle
            icon={<MessagesSquare size={14} />}
            color="#38bdf8"
            title="مصاحبه ساختاریافته"
            description="امتیازدهی مستقیم هر داور به شایستگی‌های کلیدی شغل بر اساس سطوح مهارت."
            checked={assessment.needsStructuredInterview}
            isDesigner={canEdit}
            onChange={(checked) => toggle({ interview: checked })}
          />
          <ExamDesignToggle
            icon={<Briefcase size={14} />}
            color="#34d399"
            title="سوابق و تجربه"
            description="سابقه کاری، گواهینامه‌ها و سوابق تحصیلی ثبت‌شده به‌عنوان شواهد شایستگی."
            checked={assessment.includesExperience}
            isDesigner={canEdit}
            onChange={(checked) => toggle({ experience: checked })}
          />
        </div>
      </div>

      {assessment.needsTechnicalAssessment && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <ListChecks size={14} className="text-purple-300" /> ترکیب آزمون فنی
            </p>
            {assessment.selectedQuestionIds.length > 0 && (
              <span className="num rounded-full bg-purple-500/15 px-2.5 py-1 text-[10.5px] font-bold text-purple-200">
                {assessment.selectedQuestionIds.length.toLocaleString('fa-IR')} سؤال انتخاب‌شده
              </span>
            )}
          </div>
          {isDesigner ? (
            <button
              onClick={() => setTechnicalDesignerOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
            >
              <Wand2 size={13} /> طراحی ترکیب آزمون فنی
            </button>
          ) : (
            <p className="text-[11px] text-muted">طراحی ترکیب سؤالات فقط توسط طراح آزمون انجام می‌شود.</p>
          )}
          {technicalDesignerOpen && (
            <AssessmentDesignerModal
              assessmentId={assessment.id}
              jobRole={assessment.jobRole}
              initialTemplateId={templateSource?.technicalTemplateId}
              onClose={() => setTechnicalDesignerOpen(false)}
            />
          )}
        </div>
      )}

      {assessment.needsOnlineMcq && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <ListChecks size={14} className="text-teal-300" /> آزمون تستی آنلاین
            </p>
            {mcqTest && (
              <span className="rounded-full bg-teal-500/15 px-2.5 py-1 text-[10.5px] font-bold text-teal-200">
                {MCQ_TEST_STATUS_LABEL_FA[mcqTest.status]}
                {mcqTest.status === 'SCORED' && mcqTest.scorePercent != null && <span className="num"> — {mcqTest.scorePercent.toLocaleString('fa-IR')}٪</span>}
              </span>
            )}
          </div>
          {mcqLoading ? (
            <Loader2 size={14} className="animate-spin text-muted" />
          ) : isDesigner ? (
            <McqGeneratePanel assessment={assessment} mcqTest={mcqTest} onGenerated={refreshMcqTest} />
          ) : (
            <p className="text-[11px] text-muted">طراحی و تولید آزمون فقط توسط طراح آزمون انجام می‌شود.</p>
          )}
        </div>
      )}

      {assessment.needsPersonalityAssessment && (
        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <BrainCircuit size={14} className="text-pink-300" /> ترکیب آزمون شخصیت و رفتاری
            </p>
            {personalityAssessment && (
              <span className="rounded-full bg-pink-500/15 px-2.5 py-1 text-[10.5px] font-bold text-pink-200">
                {PERSONALITY_ASSESSMENT_STATUS_LABEL_FA[personalityAssessment.status]}
                {personalityAssessment.selectedQuestionIds.length > 0 &&
                  ` — ${personalityAssessment.selectedQuestionIds.length.toLocaleString('fa-IR')} سؤال`}
              </span>
            )}
          </div>
          {isDesigner ? (
            <button
              onClick={handleOpenPersonalityDesigner}
              disabled={creatingPersonality}
              className="flex items-center gap-1.5 rounded-xl bg-pink-500 px-4 py-2 text-xs font-bold text-white hover:bg-pink-400 disabled:opacity-40"
            >
              {creatingPersonality ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {personalityAssessment && personalityAssessment.selectedQuestionIds.length > 0 ? 'ویرایش ترکیب آزمون شخصیت' : 'طراحی آزمون شخصیت'}
            </button>
          ) : (
            <p className="text-[11px] text-muted">طراحی ترکیب سؤالات فقط توسط طراح آزمون انجام می‌شود.</p>
          )}
          {personalityDesignerId && (
            <PersonalityDesignerModal
              personalityAssessmentId={personalityDesignerId}
              jobRole={assessment.jobRole}
              initialTemplateId={templateSource?.personalityTemplateId}
              assessmentCompleted={assessment.status === 'completed'}
              onClose={() => setPersonalityDesignerId(null)}
              onGenerated={() => {
                setPersonalityDesignerId(null)
                fetchPersonalityAssessments()
              }}
            />
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={onContinue} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
          ادامه <ArrowLeft size={13} />
        </button>
      </div>
    </div>
  )
}

const BLUEPRINT_METHODS: {
  key: keyof Pick<CompAssessmentBlueprint, 'includesTechnical' | 'includesPersonality' | 'includesStructuredInterview' | 'includesExperience' | 'includesOnlineMcq'>
  label: string
}[] = [
  { key: 'includesTechnical', label: 'آزمون فنی (حضوری)' },
  { key: 'includesPersonality', label: 'شخصیت و رفتاری (آنلاین، با SJT)' },
  { key: 'includesOnlineMcq', label: 'آزمون تستی (آنلاین)' },
  { key: 'includesStructuredInterview', label: 'مصاحبه ساختاریافته' },
  { key: 'includesExperience', label: 'سوابق و تجربه' },
]

function BlueprintSummary({ blueprint, technicalTemplateTitle }: { blueprint: CompAssessmentBlueprint; technicalTemplateTitle?: string }) {
  return (
    <div className="rounded-xl border border-sky-400/20 bg-sky-500/[0.05] p-3">
      {blueprint.description && <p className="mb-2 text-[10.5px] leading-5 text-secondary">{blueprint.description}</p>}
      <div className="flex flex-wrap gap-1.5">
        {BLUEPRINT_METHODS.map((m) => (
          <span
            key={m.key}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              blueprint[m.key] ? 'bg-sky-500/15 text-sky-200' : 'bg-white/5 text-muted line-through'
            }`}
          >
            {blueprint[m.key] && <CheckCircle2 size={10} />} {m.label}
          </span>
        ))}
        <span className="num rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted">نسخه {blueprint.version.toLocaleString('fa-IR')}</span>
      </div>
      {(blueprint.technicalTemplateId || blueprint.personalityTemplateId) && (
        <p className="mt-2 text-[10px] text-muted">
          {blueprint.technicalTemplateId && <>قالب آزمون فنی: {technicalTemplateTitle ?? '—'}</>}
          {blueprint.technicalTemplateId && blueprint.personalityTemplateId && ' · '}
          {blueprint.personalityTemplateId && <>دارای قالب آزمون شخصیت</>}
        </p>
      )}
    </div>
  )
}

function ExamDesignToggle({
  icon,
  color,
  title,
  description,
  checked,
  isDesigner,
  onChange,
}: {
  icon: React.ReactNode
  color: string
  title: string
  description: string
  checked: boolean
  isDesigner: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: `${color}35`, background: `linear-gradient(150deg, ${color}14, transparent 70%)` }}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11.5px] font-bold" style={{ color }}>
          {icon} {title}
        </p>
        {isDesigner ? (
          <label className="flex shrink-0 items-center gap-1.5 text-[10.5px] font-bold" style={{ color }}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 shrink-0" />
            {checked ? 'لازم است' : 'لازم نیست'}
          </label>
        ) : (
          <span
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
            style={{ background: checked ? `${color}25` : 'rgba(255,255,255,0.06)', color: checked ? color : 'var(--text-muted)' }}
          >
            {checked && <CheckCircle2 size={11} />} {checked ? 'لازم است' : 'لازم نیست'}
          </span>
        )}
      </div>
      <p className="text-[10.5px] leading-5 text-muted">{description}</p>
      {!isDesigner && <p className="mt-1 text-[10px] text-muted/70">توسط طراح آزمون تنظیم می‌شود.</p>}
    </div>
  )
}

/**
 * Generate/regenerate button (with a configurable question count + time limit) and the candidate's
 * copyable link for the online MCQ test — mirrors PersonalityStage's copy-link card. A test the
 * candidate has already started can only be regenerated with an explicit discard confirmation
 * (comp_mcq_generate_test's p_discard_existing), matching the technical designer's own pattern.
 */
function McqGeneratePanel({ assessment, mcqTest, onGenerated }: { assessment: CompetencyAssessment; mcqTest: McqTestDetail | null; onGenerated: () => void }) {
  const [questionCount, setQuestionCount] = useState(30)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(45)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const started = mcqTest != null && mcqTest.status !== 'NOT_STARTED'

  const handleGenerate = async (discardExisting: boolean) => {
    setError(null)
    setGenerating(true)
    const { error: err } = await generateMcqTest(assessment.id, questionCount, timeLimitMinutes, discardExisting)
    setGenerating(false)
    if (err) {
      setError(mcqErrorFa(err))
      return
    }
    onGenerated()
  }

  const handleGenerateClick = () => {
    if (started && !window.confirm('متقاضی این آزمون را شروع کرده یا به پایان رسانده است. با تولید آزمون جدید، پاسخ‌های فعلی کنار گذاشته می‌شوند (در گزارش ممیزی بایگانی می‌مانند). ادامه می‌دهید؟')) {
      return
    }
    handleGenerate(started)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] text-muted">تعداد سؤال</span>
          <input
            type="number"
            min={5}
            max={100}
            value={questionCount}
            onChange={(e) => setQuestionCount(Math.min(100, Math.max(5, Number(e.target.value) || 0)))}
            className="num input w-24 !py-1.5 text-center text-[11px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] text-muted">زمان (دقیقه)</span>
          <input
            type="number"
            min={5}
            max={240}
            value={timeLimitMinutes}
            onChange={(e) => setTimeLimitMinutes(Math.min(240, Math.max(5, Number(e.target.value) || 0)))}
            className="num input w-24 !py-1.5 text-center text-[11px]"
          />
        </label>
        <button
          onClick={handleGenerateClick}
          disabled={generating}
          className="flex items-center gap-1.5 rounded-xl bg-teal-500 px-4 py-2 text-xs font-bold text-white hover:bg-teal-400 disabled:opacity-40"
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : started ? <RotateCw size={13} /> : <Wand2 size={13} />}
          {started ? 'تولید مجدد آزمون' : 'تولید آزمون'}
        </button>
      </div>
      {mcqTest && (
        <p className="text-[10.5px] text-muted">
          {mcqTest.questionCount != null && (
            <>
              آخرین آزمون تولیدشده: <span className="num font-bold text-secondary">{mcqTest.questionCount.toLocaleString('fa-IR')}</span> سؤال، زمان{' '}
              <span className="num font-bold text-secondary">{mcqTest.timeLimitMinutes.toLocaleString('fa-IR')}</span> دقیقه
              {mcqTest.generation.poolSize != null && (
                <>
                  {' '}
                  (از میان <span className="num">{mcqTest.generation.poolSize.toLocaleString('fa-IR')}</span> سؤال تأییدشده‌ی بانک)
                </>
              )}
              .
            </>
          )}
        </p>
      )}
      {error && <p className="text-[10.5px] text-red-300">{error}</p>}

      {mcqTest?.candidateToken && (
        <div className="space-y-1.5 rounded-xl border border-teal-400/20 bg-teal-500/[0.05] p-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold text-teal-200">
            <Link2 size={12} /> لینک آزمون تستی متقاضی
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly dir="ltr" value={mcqCandidateUrl(mcqTest.candidateToken)} className="input flex-1 text-[11px]" onFocus={(e) => e.target.select()} />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(mcqCandidateUrl(mcqTest.candidateToken!))
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
              className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-teal-400"
            >
              <Copy size={12} /> {copied ? 'کپی شد' : 'کپی لینک'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
