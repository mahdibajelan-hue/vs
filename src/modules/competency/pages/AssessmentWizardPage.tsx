import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowLeft, Pencil, User, Wand2 } from 'lucide-react'
import { useCompetencyStore, type CandidateProfileInput } from '../store/useCompetencyStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { COMPETENCY_DOMAINS, computeCompletion, computeDomainScores, computeOverallPercent, questionsForDomain } from '../lib/competencyModel'
import { usesLegacyPmRubric, computeCategoryScores, computeRoleCompletion, questionsForAssessment, resolveOfficialAnswers, resolveOfficialCapstone } from '../lib/roleCompetencyModel'
import { jobRoleLabel } from '../lib/competencyData'
import type { QuestionType } from '../types'
import { ProfileForm } from '../components/ProfileForm'
import { useStaffProfileDocuments } from '../components/useStaffProfileDocuments'
import { CandidatePhoto } from '../components/CandidatePhoto'
import { QuestionScoreCard, type PanelVote } from '../components/QuestionScoreCard'
import { RoleQuestionScoreCard } from '../components/RoleQuestionScoreCard'
import { CapstoneCard } from '../components/CapstoneCard'
import { ScoringGuideBanner } from '../components/ScoringGuideBanner'
import { PanelistScoreSheet } from '../components/PanelistScoreSheet'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { AssessmentDesignerModal } from '../components/AssessmentDesignerModal'
import { computeEvaluationStages } from '../lib/evaluationStages'
import { EducationCards, EmploymentCards, CertificationCards } from '../components/CandidateCredentialCards'
import { PanelStage } from './PanelStage'
import { DocumentsStage } from './DocumentsStage'
import { ExamDesignStage } from './ExamDesignStage'
import { McqStage } from './McqStage'
import { PersonalityStage } from './PersonalityStage'
import { StructuredInterviewStage } from './StructuredInterviewStage'
import { QualificationScorecardCard, EvaluationSummaryCard } from './QualificationStage'
import { ResultsStage } from './ResultsStage'
import { CandidateAiAnalysisStage } from './CandidateAiAnalysisStage'
import { DevelopmentPlanStage } from './DevelopmentPlanStage'
import { AssessmentChainNav } from '../components/AssessmentChainNav'
import { formatJalali } from '../../../lib/jalali'

// Every QuestionType must appear in exactly one section here or its questions would silently
// never be shown to the evaluator — HSE/BEHAVIORAL and JUDGMENT fold into the same sections as
// their scoring bucket (see CATEGORY_BUCKET in roleCompetencyModel.ts) for consistency.
const ROLE_SECTIONS: { key: string; label: string; types: QuestionType[] }[] = [
  { key: 'roleGeneral', label: 'عمومی شغلی', types: ['GENERAL', 'HSE', 'BEHAVIORAL'] },
  { key: 'roleTechnical', label: 'تخصصی', types: ['TECHNICAL'] },
  { key: 'roleScenario', label: 'سناریو و حل مسئله', types: ['SCENARIO', 'PROBLEM_SOLVING', 'CASE_STUDY', 'IMAGE_BASED'] },
  { key: 'roleExperience', label: 'تجربه و قضاوت حرفه‌ای', types: ['EXPERIENCE_BASED', 'JUDGMENT'] },
]

interface AssessmentWizardPageProps {
  assessmentId: string
  onDone: () => void
  onExitToHub: () => void
  onNew?: () => void
  /** The module-wide sidebar destinations (بانک سؤالات/گزارش‌ها/تنظیمات) built once in CompetencyApp
   * and merged into every page's own nav map, so they behave identically everywhere. */
  moduleNav?: Partial<Record<CompetencySection, () => void>>
  /** Opens another assessment of the same candidate's reassessment chain (Phase 5), optionally on a
   * given stage. */
  onOpenAssessment?: (id: string, stage?: 'results' | 'idp' | 'profile') => void
  /** Which stage to land on when this page opens (defaults to the profile). */
  initialStage?: 'results' | 'idp' | 'profile'
}

type Stage = 'profile' | 'panel' | 'documents' | 'personality' | 'mcq' | 'questions' | 'interview' | 'results' | 'aiAnalysis' | 'idp'

const SECTION_TITLE: Record<Stage, string> = {
  profile: 'مشخصات و سوابق نامزد',
  panel: 'پنل مصاحبه‌گران و طراحی آزمون‌ها',
  documents: 'بارگذاری مدارک',
  personality: 'ارزیابی شخصیت و رفتاری',
  mcq: 'آزمون تستی آنلاین',
  questions: 'ارزیابی فنی تخصصی',
  interview: 'مصاحبه ساختاریافته',
  results: 'نتیجه',
  aiAnalysis: 'تحلیل جامع هوش مصنوعی',
  idp: 'برنامه توسعه فردی',
}

/**
 * Who sees which stages. "panel" (schema.sql Section 44) is a single merged screen: panel assembly
 * (add/remove panelists, mark a lead — PanelStage) stacked with the exam-design plan (which of the
 * five assessment methods are required, and each one's mix — ExamDesignStage), for lead/designer
 * viewers only; a plain panelist sees only the panel-assembly half (ExamDesignStage is never rendered
 * for them — see the render logic below). Deciding/scoring the technical exam is a different job from
 * assembling who is on the panel, so it never lives here: every panelist's own independent scoring
 * sheet is rendered inside "questions" instead (PanelistScoreSheet) — the lead sees the panel-vote
 * average there too, via resolveOfficialAnswers. This matters beyond tidiness: the database rejects
 * writes to comp_assessments from anyone but the lead, so showing an interviewer the final-verdict
 * screen would only hand them a form whose every save fails. "personality" and "mcq" sit right after
 * the panel is assembled and are lead/designer-only exactly like results (see isDesigner below, which
 * only gates the interactive controls within those two stages plus the exam-design half of "panel").
 * "interview" (schema.sql Section 50) is the one scoring stage panelists share with the lead: every
 * panelist rates each competency independently (one comp_interview_ratings row per rater), which
 * RLS already scopes to their own row. "idp" (Individual Development Plan, schema.sql Section 52) comes
 * last, after the AI analysis whose training recommendations it can merge in.
 */
const LEAD_STAGES: Stage[] = ['profile', 'documents', 'panel', 'personality', 'mcq', 'questions', 'interview', 'results', 'aiAnalysis', 'idp']
const PANELIST_STAGES: Stage[] = ['profile', 'documents', 'panel', 'questions', 'interview']
const DESIGNER_STAGES: Stage[] = ['profile', 'documents', 'panel', 'personality', 'mcq', 'interview']

/**
 * Profile -> documents (self-service link) -> panel -> questions flow for one assessment. The
 * candidate's self-declared profile/documents are meant to be collected before the interview panel
 * ever meets them, so that stage comes right after the profile summary. For the project-manager
 * role, "questions" itself opens on the qualification scorecard (education/experience/training/
 * certification, judged from the candidate's record alone) before any domain is shown, and closes
 * with the lead's strengths/development-areas summary after the capstone scenario — see
 * QualificationScorecardCard / EvaluationSummaryCard below.
 */
export function AssessmentWizardPage({ assessmentId, onDone, onExitToHub, onNew, moduleNav, onOpenAssessment, initialStage }: AssessmentWizardPageProps) {
  const assessment = useCompetencyStore((s) => s.assessments.find((a) => a.id === assessmentId))
  const updateProfile = useCompetencyStore((s) => s.updateProfile)
  const setAnswer = useCompetencyStore((s) => s.setAnswer)
  const setCapstone = useCompetencyStore((s) => s.setCapstone)
  const fetchPanelists = useCompetencyStore((s) => s.fetchPanelists)
  const fetchPanelistScores = useCompetencyStore((s) => s.fetchPanelistScores)
  const fetchProfiles = useCompetencyStore((s) => s.fetchProfiles)
  const questionBank = useCompetencyStore((s) => s.questionBank)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBank)
  const allPanelists = useCompetencyStore((s) => s.panelists)
  const allPanelistScores = useCompetencyStore((s) => s.panelistScores)
  const profiles = useCompetencyStore((s) => s.profiles)
  const moduleAdmins = useCompetencyStore((s) => s.moduleAdmins)
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const assessmentDesigners = useCompetencyStore((s) => s.assessmentDesigners)
  const fetchAssessmentDesigners = useCompetencyStore((s) => s.fetchAssessmentDesigners)
  const myName = useAuthStore((s) => s.profile?.fullName)
  const myId = useAuthStore((s) => s.profile?.id ?? null)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)

  const [editingProfile, setEditingProfile] = useState(false)
  const [domainIndex, setDomainIndex] = useState(0)
  const [roleSectionIndex, setRoleSectionIndex] = useState(0)
  const [designerOpen, setDesignerOpen] = useState(false)

  const isPM = assessment != null && usesLegacyPmRubric(assessment)

  useEffect(() => {
    fetchProfiles()
    fetchPanelists(assessmentId)
    fetchPanelistScores(assessmentId)
    if (questionBank.length === 0) fetchQuestionBank()
    if (assessmentDesigners.length === 0) fetchAssessmentDesigners()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessmentId])

  const panelists = allPanelists.filter((p) => p.assessmentId === assessmentId)
  const submittedScores = allPanelistScores.filter((p) => p.assessmentId === assessmentId && p.submittedAt)

  const myPanelistRow = allPanelists.find((p) => p.assessmentId === assessmentId && p.userId === myId)
  // Module admins are leads of every assessment — exactly what comp_is_lead() / comp_can_access_assessment()
  // grant them in the DB. Without this a module admin who didn't create the candidate only got the
  // panelist view (profile/panel/documents) and "had no access" despite the role.
  const isModuleAdminViewer = isAdmin || moduleAdmins.some((m) => m.userId === myId)
  const isLead = assessment != null && (assessment.createdBy === myId || isModuleAdminViewer || myPanelistRow?.isLead === true)
  // Same standing as CompetencyApp's isModuleAdmin, but for the ASSESSMENT_DESIGNER role — gates the
  // interactive controls inside the exam-design half of "panel" and the personality/mcq stages
  // (toggling what's needed, opening either mix designer). A non-designer lead still reaches all of
  // them, just read-only.
  const isDesigner = isModuleAdminViewer || assessmentDesigners.some((d) => d.userId === myId)
  // An assessment designer who isn't the lead still needs the exam-design and personality stages
  // (comp_set_exam_design / the mix designers are gated on the designer role, not on being lead).
  const stages = isLead ? LEAD_STAGES : isDesigner ? DESIGNER_STAGES : PANELIST_STAGES
  // Per-item documents in the staff profile form — same component and lock rules as the candidate's
  // self-service form (schema.sql Section 55).
  const profileDocuments = useStaffProfileDocuments(assessmentId, assessment?.status, isLead || isDesigner)
  // Opening a candidate from the dashboard always lands on their profile first — the natural
  // starting point before assembling the panel or scoring anything.
  const [stage, setStage] = useState<Stage | null>(initialStage ?? null)
  const activeStage: Stage = stage && stages.includes(stage) ? stage : 'profile'

  // Which of the shared shell's sections this viewer can reach from here — a panelist only ever
  // sees profile/documents/panel/questions/interview (see PANELIST_STAGES above); the lead sees
  // every stage.
  const nav: Partial<Record<CompetencySection, () => void>> = { dashboard: onDone, ...moduleNav }
  if (stages.includes('profile')) nav.profile = () => setStage('profile')
  if (stages.includes('panel')) nav.panel = () => setStage('panel')
  if (stages.includes('documents')) nav.documents = () => setStage('documents')
  if (stages.includes('personality')) nav.personality = () => setStage('personality')
  if (stages.includes('mcq')) nav.mcq = () => setStage('mcq')
  if (stages.includes('questions')) nav.questions = () => setStage('questions')
  if (stages.includes('interview')) nav.interview = () => setStage('interview')
  if (stages.includes('results')) nav.results = () => setStage('results')
  if (stages.includes('aiAnalysis')) nav.aiAnalysis = () => setStage('aiAnalysis')
  if (stages.includes('idp')) nav.idp = () => setStage('idp')
  const openAssessment = onOpenAssessment ?? (() => undefined)
  // Only a lead or a designer sees the exam-design half of the merged "panel" screen (the toggles +
  // mix builders) — a plain panelist reaches "panel" purely to assemble the interview panel, exactly
  // as before this stage absorbed examDesign's content.
  const showExamDesign = isLead || isDesigner

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

  // Judges' own strengths/development-area notes, compiled so the lead's final summary can start
  // from them instead of being written from scratch — see EvaluationSummaryCard.
  const panelNotes = useMemo(
    () =>
      submittedScores.map((s) => ({
        name: profiles.find((p) => p.id === s.panelistId)?.fullName ?? 'داور',
        strengths: s.strengths,
        developmentAreas: s.developmentAreas,
      })),
    [submittedScores, profiles],
  )

  if (!assessment) {
    return <div className="p-6 text-sm text-muted">ارزیابی یافت نشد.</div>
  }

  // Once any judge has submitted, the official score for every question is that panel's own
  // average (see resolveOfficialAnswers) — the lead is no longer asked to enter a separate score,
  // only reads/reviews the average. Before any submission (e.g. scoring solo, no panel assigned),
  // the lead's own entry is still what counts, exactly as resolveOfficialAnswers falls back to it.
  const hasOfficialScore = submittedScores.length > 0
  const officialAnswers = resolveOfficialAnswers(assessment.answers, submittedScores)
  const officialCapstone = resolveOfficialCapstone(assessment.capstoneScore, assessment.capstoneNote, submittedScores)
  const completion = computeCompletion(officialAnswers)

  // The results dashboard is a full-screen experience with its own right-hand sidebar (see
  // ResultsStage) — it replaces this page's narrow max-w-3xl wizard chrome entirely rather than
  // nesting inside it.
  if (activeStage === 'results') {
    return (
      <ResultsStage
        assessment={assessment}
        nav={nav}
        onExitToHub={onExitToHub}
        onNew={onNew}
        onGoToAiAnalysis={() => setStage('aiAnalysis')}
        onGoToIdp={stages.includes('idp') ? () => setStage('idp') : undefined}
        onOpenAssessment={openAssessment}
      />
    )
  }

  // The unified candidate AI analysis (spec follow-up) is its own dedicated, full-screen panel —
  // reached from ResultsStage's excerpt link or the sidebar — same self-contained-page pattern as
  // ResultsStage above rather than nesting inside this wizard's narrower chrome.
  if (activeStage === 'aiAnalysis') {
    return <CandidateAiAnalysisStage assessment={assessment} nav={nav} onExitToHub={onExitToHub} />
  }

  // Individual Development Plan (Phase 5) — full-screen like the two stages above. Editing mirrors
  // comp_can_manage_development_plan: the lead, an ASSESSMENT_DESIGNER or a module admin.
  if (activeStage === 'idp') {
    return (
      <DevelopmentPlanStage
        assessment={assessment}
        nav={nav}
        onExitToHub={onExitToHub}
        canManage={isLead || isDesigner}
        onOpenAssessment={openAssessment}
      />
    )
  }

  const roleQuestions = isPM ? [] : questionsForAssessment(assessment, questionBank)
  // PM's fixed rubric questions are seeded into the bank verbatim so the lead can reveal the same
  // reference-answer material every other role already has — matched by exact question text. Not
  // memoized: this runs after the early returns above, so a hook here would violate hook-order
  // rules when activeStage flips to 'results'.
  const pmBankByText = new Map(questionBank.filter((q) => q.jobRole === 'project_manager').map((q) => [q.questionText, q]))
  const roleCompletion = computeRoleCompletion(roleQuestions, officialAnswers)
  const evalStages = computeEvaluationStages(assessment, isPM ? completion.percent : roleCompletion.percent, panelists.length, submittedScores.length)
  const currentDomainScores = isPM ? computeDomainScores(officialAnswers) : computeCategoryScores(roleQuestions, officialAnswers)
  const currentOverallPercent = computeOverallPercent(currentDomainScores)
  const currentRoleSection = ROLE_SECTIONS[roleSectionIndex]
  const roleSectionQuestions = roleQuestions.filter((q) => (currentRoleSection.types as string[]).includes(q.category))
  const isLastRoleSection = roleSectionIndex === ROLE_SECTIONS.length - 1

  const onCapstoneStep = domainIndex === COMPETENCY_DOMAINS.length
  const domain = onCapstoneStep ? null : COMPETENCY_DOMAINS[domainIndex]
  const questions = domain ? questionsForDomain(domain.key) : []
  const isLastDomain = domainIndex === COMPETENCY_DOMAINS.length - 1

  const profileInput: CandidateProfileInput = {
    jobRole: assessment.jobRole,
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

  const headerRight = (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-secondary">
      {/* The candidate's photo on every wizard stage, for every judge — not only on the lead-only results page. */}
      <CandidatePhoto path={assessment.photoUrl} size={26} />
      <AssessmentChainNav assessment={assessment} onOpen={(id) => openAssessment(id, 'profile')} />
      <User size={13} className="text-purple-300" />
      <span className="font-bold text-primary">{myName ?? '—'}</span>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isLead ? 'bg-amber-500/15 text-amber-300' : 'bg-purple-500/20 text-purple-200'}`}>
        {isLead ? 'مسئول ارزیابی' : 'داور'}
      </span>
    </div>
  )

  return (
    <CompetencySidebarShell
      active={activeStage}
      nav={nav}
      title={`${SECTION_TITLE[activeStage]} — ${assessment.candidateName}`}
      stageStrip={evalStages}
      onExitToHub={onExitToHub}
      headerRight={headerRight}
    >
      {isLead && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 px-3.5 py-2 text-[11px]">
          <span className="text-muted">وضعیت پنل:</span>
          <span className="num font-bold">
            {submittedScores.length.toLocaleString('fa-IR')} از {panelists.length.toLocaleString('fa-IR')} داور امتیاز خود را نهایی کرده‌اند
            {assessment.panelSize > 0 && panelists.length !== assessment.panelSize && (
              <span className="font-normal text-muted"> (اندازه‌ی پنل: {assessment.panelSize.toLocaleString('fa-IR')} داور)</span>
            )}
          </span>
          {panelists.length === 0 ? (
            <span className="text-amber-300">
              — ابتدا در بخش «پنل مصاحبه‌گران» {Math.max(1, assessment.panelSize).toLocaleString('fa-IR')} داور را اضافه کنید.
            </span>
          ) : !hasOfficialScore ? (
            <span className="text-amber-300">— تا ثبت نهایی حداقل یک داور، امتیاز هر سوال را خودتان در بخش «ارزیابی» ثبت می‌کنید.</span>
          ) : (
            <span className="text-green-300">
              — امتیاز نهایی هر سوال اکنون میانگین نظرات {submittedScores.length.toLocaleString('fa-IR')} داور ثبت‌شده است؛ دیگر نیازی به ثبت جداگانه توسط شما نیست.
            </span>
          )}
        </div>
      )}

      {activeStage === 'profile' &&
        (editingProfile ? (
          <ProfileForm
            initial={profileInput}
            documents={profileDocuments}
            submitLabel="ذخیره مشخصات"
            onSubmit={async (profile) => {
              await updateProfile(assessment.id, profile)
              setEditingProfile(false)
            }}
          />
        ) : (
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CandidatePhoto path={assessment.photoUrl} size={64} />
                <p className="text-sm font-bold">مشخصات و سوابق نامزد</p>
              </div>
              {/* Only the lead can save the profile (comp_assessments update = comp_is_lead). */}
              {isLead && (
                <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1 text-xs text-purple-300 hover:text-purple-200">
                  <Pencil size={12} /> ویرایش
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
              <InfoRow label="نام و نام خانوادگی" value={assessment.candidateName} />
              <InfoRow label="شغل مورد ارزیابی" value={jobRoleLabel(jobRoleConfigs, assessment.jobRole)} />
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <EducationCards value={assessment.education} />
              <EmploymentCards value={assessment.employmentHistory} />
              <CertificationCards value={assessment.certifications} />
            </div>
            {assessment.notableProjects && (
              <div>
                <p className="mb-1 text-[11px] text-muted">پروژه‌های شاخص گذشته</p>
                <p className="text-xs leading-6 text-secondary">{assessment.notableProjects}</p>
              </div>
            )}
            <button onClick={() => setStage('documents')} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
              ادامه <ArrowLeft size={13} />
            </button>
          </div>
        ))}

      {activeStage === 'documents' && (
        <DocumentsStage assessment={assessment} isLead={isLead} canSetPhoto={isLead || isDesigner} onContinue={() => setStage('panel')} />
      )}

      {activeStage === 'panel' && (
        <div className="space-y-4">
          {/* Panel assembly only — deciding/scoring the technical exam moved out to "questions" (see
              PanelistScoreSheet below) so a panelist can never start scoring from in here. When the
              exam-design half also renders (lead/designer), it carries its own "ادامه" button, so the
              panel-assembly component's own continue button is only wired up for a plain panelist. */}
          <PanelStage assessmentId={assessment.id} onContinue={showExamDesign ? undefined : () => setStage('questions')} />
          {showExamDesign && <ExamDesignStage assessment={assessment} isDesigner={isDesigner} onContinue={() => setStage('personality')} />}
        </div>
      )}

      {activeStage === 'interview' && (
        <StructuredInterviewStage
          assessment={assessment}
          isLead={isLead}
          onContinue={stages.includes('results') ? () => setStage('results') : undefined}
        />
      )}

      {activeStage === 'personality' && (
        <PersonalityStage assessment={assessment} onContinue={() => setStage('mcq')} onGoToExamDesign={() => setStage('panel')} />
      )}

      {activeStage === 'mcq' && <McqStage assessment={assessment} isDesigner={isDesigner} onContinue={() => setStage('questions')} />}

      {/* Every panelist's own independent technical-scoring sheet (moved out of the "panel" stage,
          which now only assembles who is on the panel) — renders nothing when the current viewer
          isn't on this assessment's panel, e.g. a lead who isn't also a panelist. */}
      {activeStage === 'questions' && <PanelistScoreSheet assessmentId={assessment.id} />}

      {/* The exam design left the technical exam out: without this the stage fell through to the
          "no questions selected yet → design the exam" card (or, for project_manager, the legacy
          rubric) with no way forward except the sidebar — the personality stage's «رفتن به ارزیابی
          فنی» button led straight into that dead end. The official-answers views below write directly
          to comp_assessments (RLS: lead only), so they stay lead-gated — a panelist's own sheet is
          PanelistScoreSheet above, not this. */}
      {activeStage === 'questions' && isLead && !assessment.needsTechnicalAssessment && (
        <div className="glass-panel space-y-3 rounded-2xl p-6 text-center">
          <p className="text-xs text-secondary">آزمون فنی تخصصی در طرح ارزیابی این متقاضی قرار ندارد.</p>
          <button
            onClick={() => setStage('interview')}
            className="mx-auto flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
          >
            مصاحبه ساختاریافته <ArrowLeft size={13} />
          </button>
        </div>
      )}

      {activeStage === 'questions' && isLead && assessment.needsTechnicalAssessment && !isPM && (
        <div className="space-y-3">
          {roleSectionIndex === 0 && <QualificationScorecardCard assessment={assessment} />}
          {roleQuestions.length === 0 ? (
            <div className="glass-panel rounded-2xl p-6 text-center">
              <p className="mb-3 text-xs text-secondary">هنوز سؤالی برای این ارزیابی («{jobRoleLabel(jobRoleConfigs, assessment.jobRole)}») انتخاب نشده است.</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => setDesignerOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
                >
                  <Wand2 size={13} /> طراحی آزمون شایستگی
                </button>
                <button
                  onClick={() => setStage('interview')}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs text-secondary hover:bg-white/5"
                >
                  رفتن به مصاحبه ساختاریافته <ArrowLeft size={13} />
                </button>
              </div>
              {designerOpen && (
                <AssessmentDesignerModal assessmentId={assessment.id} jobRole={assessment.jobRole} onClose={() => setDesignerOpen(false)} />
              )}
            </div>
          ) : (
            <>
              <ScoringGuideBanner />
              <div className="glass-panel rounded-2xl p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold">{currentRoleSection.label}</p>
                  <span className="num text-[11px] text-muted">
                    {roleCompletion.answered.toLocaleString('fa-IR')} از {roleCompletion.total.toLocaleString('fa-IR')} پاسخ داده‌شده
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {ROLE_SECTIONS.map((sec, i) => (
                    <button
                      key={sec.key}
                      onClick={() => setRoleSectionIndex(i)}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                        i === roleSectionIndex ? 'bg-purple-500/25 text-purple-300' : 'bg-white/5 text-secondary hover:bg-white/10'
                      }`}
                    >
                      {sec.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                {roleSectionQuestions.map((q, i) => (
                  <RoleQuestionScoreCard
                    key={q.id}
                    index={i}
                    question={q}
                    answer={officialAnswers[q.id]}
                    editable={!hasOfficialScore}
                    onChange={(score, note, candidateAnswer) => setAnswer(assessment.id, q.id, score, note, candidateAnswer)}
                    panelVotes={panelVotesByQuestion.get(q.id)}
                  />
                ))}
              </div>

              {isLastRoleSection && <EvaluationSummaryCard assessment={assessment} overallPercent={currentOverallPercent} panelNotes={panelNotes} />}

              <div className="flex items-center justify-between">
                <button
                  disabled={roleSectionIndex === 0}
                  onClick={() => setRoleSectionIndex((i) => Math.max(0, i - 1))}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 px-4 py-2 text-xs disabled:opacity-30"
                >
                  <ArrowRight size={13} /> قبل
                </button>
                {!isLastRoleSection ? (
                  <button
                    onClick={() => setRoleSectionIndex((i) => i + 1)}
                    className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
                  >
                    حوزه بعد <ArrowLeft size={13} />
                  </button>
                ) : (
                  <button onClick={() => setStage('interview')} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
                    مصاحبه ساختاریافته <ArrowLeft size={13} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeStage === 'questions' && isLead && assessment.needsTechnicalAssessment && isPM && (
        <div className="space-y-3">
          <ScoringGuideBanner />
          {domainIndex === 0 && <QualificationScorecardCard assessment={assessment} />}
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
                  answer={officialAnswers[q.key]}
                  editable={!hasOfficialScore}
                  onChange={(score, note) => setAnswer(assessment.id, q.key, score, note)}
                  panelVotes={panelVotesByQuestion.get(q.key)}
                  bankItem={pmBankByText.get(q.text)}
                />
              ))}
            </div>
          ) : (
            <CapstoneCard
              score={officialCapstone.score}
              note={officialCapstone.note}
              editable={!hasOfficialScore}
              onChange={(score, note) => setCapstone(assessment.id, score, note)}
            />
          )}

          {onCapstoneStep && <EvaluationSummaryCard assessment={assessment} overallPercent={currentOverallPercent} panelNotes={panelNotes} />}

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
              <button onClick={() => setStage('interview')} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
                مصاحبه ساختاریافته <ArrowLeft size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </CompetencySidebarShell>
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
