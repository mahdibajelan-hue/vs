import { useEffect, useState } from 'react'
import { ArrowLeft, BrainCircuit, CheckCircle2, ListChecks, Loader2, Wand2 } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { usePersonalityStore } from '../../personality/store/usePersonalityStore'
import { PersonalityDesignerModal } from '../../personality/components/PersonalityDesignerModal'
import { PERSONALITY_ASSESSMENT_STATUS_LABEL_FA } from '../../personality/types'
import { AssessmentDesignerModal } from '../components/AssessmentDesignerModal'
import type { CompetencyAssessment } from '../types'

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
 */
export function ExamDesignStage({ assessment, isDesigner, onContinue }: ExamDesignStageProps) {
  const setExamDesign = useCompetencyStore((s) => s.setExamDesign)

  const personalityAssessments = usePersonalityStore((s) => s.assessments)
  const frameworks = usePersonalityStore((s) => s.frameworks)
  const jobProfiles = usePersonalityStore((s) => s.jobProfiles)
  const fetchCatalog = usePersonalityStore((s) => s.fetchCatalog)
  const fetchPersonalityAssessments = usePersonalityStore((s) => s.fetchAssessments)
  const createPersonalityAssessment = usePersonalityStore((s) => s.createAssessment)

  const [technicalDesignerOpen, setTechnicalDesignerOpen] = useState(false)
  const [personalityDesignerId, setPersonalityDesignerId] = useState<string | null>(null)
  const [creatingPersonality, setCreatingPersonality] = useState(false)

  useEffect(() => {
    if (frameworks.length === 0) fetchCatalog()
    if (personalityAssessments.length === 0) fetchPersonalityAssessments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        <p className="mb-1 text-sm font-bold">طرح ارزیابی این متقاضی</p>
        <p className="mb-3 text-[11px] leading-6 text-muted">
          مشخص کنید این متقاضی به کدام بخش‌های ارزیابی نیاز دارد؛ ترتیب مراحل بعدی ویزارد بر همین اساس تنظیم می‌شود.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ExamDesignToggle
            icon={<BrainCircuit size={14} />}
            color="#f472b6"
            title="ارزیابی شخصیت و رفتاری"
            description="سنجش تمایلات رفتاری حرفه‌ای مکمل ارزیابی فنی."
            checked={assessment.needsPersonalityAssessment}
            isDesigner={isDesigner}
            onChange={(checked) => setExamDesign(assessment.id, checked, assessment.needsTechnicalAssessment)}
          />
          <ExamDesignToggle
            icon={<ListChecks size={14} />}
            color="#a855f7"
            title="آزمون فنی تخصصی (مصاحبه + سؤالات)"
            description="پنل مصاحبه‌گران و سؤالات تخصصی شغل مورد ارزیابی."
            checked={assessment.needsTechnicalAssessment}
            isDesigner={isDesigner}
            onChange={(checked) => setExamDesign(assessment.id, assessment.needsPersonalityAssessment, checked)}
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
            <AssessmentDesignerModal assessmentId={assessment.id} jobRole={assessment.jobRole} onClose={() => setTechnicalDesignerOpen(false)} />
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
