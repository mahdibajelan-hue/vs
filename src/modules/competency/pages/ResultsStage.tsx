import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  Banknote,
  BarChart3,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Copy,
  Download,
  Fingerprint,
  GitCompareArrows,
  Globe,
  GraduationCap,
  HardHat,
  History,
  ListChecks,
  ListTree,
  Loader2,
  Mail,
  MessagesSquare,
  Plus,
  Printer,
  Puzzle,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  Target,
  Trophy,
  User,
  Users,
  Wrench,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { useRoleGuidanceStore } from '../store/useRoleGuidanceStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { usePersonalityStore } from '../../personality/store/usePersonalityStore'
import { PersonalityFingerprintPanel } from '../../personality/components/PersonalityFingerprintPanel'
import { buildFingerprintSnapshot } from '../../personality/lib/fingerprintModel'
import { PERSONALITY_ASSESSMENT_STATUS_LABEL_FA, type PersonalityAssessmentStatus } from '../../personality/types'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { formatJalali } from '../../../lib/jalali'
import { CompetencyRadarChart } from '../components/CompetencyRadarChart'
import { CompetencyPrintReport, type PrintPersonality } from '../components/CompetencyPrintReport'
import { ApprovalMedal } from '../components/ApprovalMedal'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { computeEvaluationStages } from '../lib/evaluationStages'
import { generatePersonalityProfile } from '../lib/personalityAnalysis'
import { APPROVAL_LABEL, approvalLevel, computeDomainScores, computeOverallPercent, CONDITIONAL_COLOR, isConditionalScore, tierColor } from '../lib/competencyModel'
import { OpenToWorkRing, WorkStatusChip } from '../components/OpenToWorkRing'
import { WorkStatusEditor } from '../components/WorkStatusEditor'
import { computeCategoryScores, questionsForAssessment, resolveOfficialAnswers, usesLegacyPmRubric } from '../lib/roleCompetencyModel'
import { jobRoleLabel as resolveJobRoleLabel } from '../lib/competencyData'
import { buildGapRows, evidenceMethodMix, isAiAnalysisStale, isCriticalGap, isDevelopmentGap } from '../lib/competencyGap'
import { buildInterviewSummary, buildResultsModel, fa } from '../lib/resultsModel'
import { exportReportPdf, printReportNode } from '../lib/reportExport'
import { CompetencyGapAnalysis } from '../components/CompetencyGapAnalysis'
import { FinalizeAssessmentDialog } from '../components/FinalizeAssessmentDialog'
import { DevelopmentPlanSummary } from '../components/DevelopmentPlanSummary'
import { ReassessmentComparison } from '../components/ReassessmentComparison'
import { AssessmentChainNav } from '../components/AssessmentChainNav'
import { McqResultsSection } from '../components/results/McqResultsSection'
import {
  CategoryHeading,
  EmptyNote,
  EvidenceMixCard,
  ExamDesignCard,
  InterviewResults,
  KeyProjects,
  MaturityCard,
  PanelBreakdown,
  PatternCard,
  ProfileSummary,
  QualificationScorecard,
  ScoreRing,
  SectionHeading,
  SectionNav,
  StatusCard,
} from '../components/results/ResultsSections'
import { tone } from '../lib/tone'
import type { CompReassessmentComparison, CompetencyAssessment, CompetencyDomainKey, DomainScore } from '../types'
import '../styles/farinTheme.css'

interface ResultsStageProps {
  assessment: CompetencyAssessment
  /** Which of the shared shell's sections are reachable from here — built once by
   * AssessmentWizardPage so the "who can see what" logic (lead vs. panelist) lives in one place. */
  nav: Partial<Record<CompetencySection, () => void>>
  onExitToHub: () => void
  onNew?: () => void
  /** Sends the viewer to the dedicated "تحلیل جامع هوش مصنوعی" stage — this page only ever shows a
   * brief excerpt of that analysis, never the full generation UI. */
  onGoToAiAnalysis: () => void
  /** Sends the viewer to the «برنامه توسعه فردی» stage (Phase 5); omitted for viewers without it. */
  onGoToIdp?: () => void
  /** Opens another assessment of this candidate's reassessment chain. */
  onOpenAssessment: (id: string, stage?: 'results' | 'idp' | 'profile') => void
}

const PM_DOMAIN_ICON: Partial<Record<CompetencyDomainKey, typeof Compass>> = {
  governance: Compass,
  planning: Calendar,
  cost: Banknote,
  hse: HardHat,
  quality: ShieldCheck,
  changeRisk: AlertTriangle,
  stakeholder: Users,
  execution: Wrench,
}

const ROLE_BUCKET_ICON: Record<string, typeof Compass> = {
  roleGeneral: Briefcase,
  roleTechnical: GraduationCap,
  roleScenario: Puzzle,
  roleExperience: History,
  roleHse: ShieldCheck,
  roleBehavioral: Users,
  roleJudgment: Compass,
}

const PEER_SERIES_COLORS = ['#38bdf8', '#34d399']
const CANDIDATE_SERIES = '#a855f7'

// Personality statuses that carry real, scored dimension data — matches PersonalityStage.
const PERSONALITY_SCORED_STATUSES: PersonalityAssessmentStatus[] = ['FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED']

// A decorative accent per KPI tile (independent of the tier color used for the score itself).
const DOMAIN_ACCENT_PALETTE = ['#a855f7', '#0ea5e9', '#f59e0b', '#10b981', '#f43f5e', '#06b6d4', '#6366f1', '#eab308']

const LOGO_URL = new URL(`${import.meta.env.BASE_URL}farin-mark.webp`, window.location.origin).href

/**
 * «نتیجه ارزیابی» — the candidate's complete result, in reading order: profile, exam design,
 * status + role-aware maturity interpretation, technical scores (per area, per judge, judges'
 * comments, capstone), structured interview, behavioral fingerprint + role alignment + validity,
 * competency gaps, AI excerpt, IDP, reassessment comparison and approval. Every number comes from
 * buildResultsModel, which the full PDF («گزارش کامل», CompetencyPrintReport) renders too.
 * Light/dark via the app theme (farinTheme.css tokens); the PDF itself is light-only.
 */
export function ResultsStage({ assessment, nav, onExitToHub, onNew, onGoToAiAnalysis, onGoToIdp, onOpenAssessment }: ResultsStageProps) {
  // ---- competency store (stable references only; everything derived in memos below)
  const setStatus = useCompetencyStore((s) => s.setStatus)
  const setApproved = useCompetencyStore((s) => s.setApproved)
  const regenerateResultsShareLink = useCompetencyStore((s) => s.regenerateResultsShareLink)
  const reopenAssessment = useCompetencyStore((s) => s.reopenAssessment)
  const requestReopen = useCompetencyStore((s) => s.requestReopen)
  const moduleAdmins = useCompetencyStore((s) => s.moduleAdmins)
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const allAssessments = useCompetencyStore((s) => s.assessments)
  const allPanelists = useCompetencyStore((s) => s.panelists)
  const allPanelistScores = useCompetencyStore((s) => s.panelistScores)
  const profiles = useCompetencyStore((s) => s.profiles)
  // Category/weight/text-only classification — never the evaluator-only reference answers.
  const questionBank = useCompetencyStore((s) => s.questionBankPublic)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBankPublic)
  const showDemoData = useCompetencyStore((s) => s.showDemoData)
  const assessmentDesigners = useCompetencyStore((s) => s.assessmentDesigners)
  const candidateAiAnalysis = useCompetencyStore((s) => s.candidateAiAnalysisByAssessment[assessment.id])
  const fetchCandidateAiAnalysis = useCompetencyStore((s) => s.fetchCandidateAiAnalysis)
  const ensureCompetencyProfile = useCompetencyStore((s) => s.ensureCompetencyProfile)
  const competencyProfile = useCompetencyStore((s) => s.competencyProfileByAssessment[assessment.id])
  const competencyCatalog = useCompetencyStore((s) => s.competencies)
  const fetchCompetencies = useCompetencyStore((s) => s.fetchCompetencies)
  const jobCompetencyRequirements = useCompetencyStore((s) => s.jobCompetencyRequirements)
  const fetchJobCompetencyRequirements = useCompetencyStore((s) => s.fetchJobCompetencyRequirements)
  const evidenceSources = useCompetencyStore((s) => s.evidenceSources)
  const fetchEvidenceSources = useCompetencyStore((s) => s.fetchEvidenceSources)
  const interviewRatings = useCompetencyStore((s) => s.interviewRatings)
  const fetchInterviewRatings = useCompetencyStore((s) => s.fetchInterviewRatings)
  const fetchReassessmentComparison = useCompetencyStore((s) => s.fetchReassessmentComparison)
  const developmentPlan = useCompetencyStore((s) => s.developmentPlans.find((p) => p.assessmentId === assessment.id && p.status !== 'CANCELLED'))
  const developmentActions = useCompetencyStore((s) => (developmentPlan ? s.developmentActionsByPlan[developmentPlan.id] : undefined))
  const guidanceRows = useRoleGuidanceStore((s) => s.rows)
  const fetchGuidance = useRoleGuidanceStore((s) => s.fetch)
  const myProfile = useAuthStore((s) => s.profile)

  // ---- personality store
  const personalityAssessments = usePersonalityStore((s) => s.assessments)
  const fetchPersonalityAssessments = usePersonalityStore((s) => s.fetchAssessments)
  const personalityScores = usePersonalityStore((s) => s.dimensionScores)
  const validityResults = usePersonalityStore((s) => s.validityResults)
  const traits = usePersonalityStore((s) => s.traits)
  const dimensions = usePersonalityStore((s) => s.dimensions)
  const personalityRequirements = usePersonalityStore((s) => s.jobRequirements)
  const fetchPersonalityCatalog = usePersonalityStore((s) => s.fetchCatalog)
  const fetchDimensionScores = usePersonalityStore((s) => s.fetchDimensionScores)
  const fetchValidityResult = usePersonalityStore((s) => s.fetchValidityResult)

  // ---- local state
  const printRef = useRef<HTMLDivElement>(null)
  const compareRef = useRef<HTMLDivElement>(null)
  const competencyProfileRequestedRef = useRef(false)
  const [exporting, setExporting] = useState(false)
  const [settingApproval, setSettingApproval] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [requestingReopen, setRequestingReopen] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [reassessment, setReassessment] = useState<CompReassessmentComparison | null>(null)

  const isModuleAdmin = Boolean(myProfile?.isAdmin) || moduleAdmins.some((m) => m.userId === myProfile?.id)
  const canComputeCompetencyProfile =
    isModuleAdmin || (!!myProfile?.id && assessment.createdBy === myProfile.id) || allPanelists.some((p) => p.assessmentId === assessment.id && p.userId === myProfile?.id)
  const isLeadViewer =
    isModuleAdmin ||
    (!!myProfile?.id && assessment.createdBy === myProfile.id) ||
    allPanelists.some((p) => p.assessmentId === assessment.id && p.userId === myProfile?.id && p.isLead)
  const isDesignerViewer = isModuleAdmin || assessmentDesigners.some((d) => d.userId === myProfile?.id)
  const canRecomputeCompetencyProfile = canComputeCompetencyProfile && (isLeadViewer || isDesignerViewer)

  const personalityAssessment = useMemo(() => personalityAssessments.find((a) => a.assessmentId === assessment.id), [personalityAssessments, assessment.id])
  const personalityScored = !!personalityAssessment && PERSONALITY_SCORED_STATUSES.includes(personalityAssessment.status)
  const showPersonalityFingerprint = assessment.needsPersonalityAssessment && personalityScored

  // ---- loading
  useEffect(() => {
    if (questionBank.length === 0) fetchQuestionBank()
    // Always refetch: the store is shared across candidates.
    fetchPersonalityAssessments()
    if (candidateAiAnalysis === undefined) fetchCandidateAiAnalysis(assessment.id)
    fetchGuidance()
    if (competencyCatalog.length === 0) fetchCompetencies()
    if (jobCompetencyRequirements.length === 0) fetchJobCompetencyRequirements()
    if (evidenceSources.length === 0) fetchEvidenceSources()
    fetchInterviewRatings(assessment.id)
    if (traits.length === 0) fetchPersonalityCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.id])

  useEffect(() => {
    if (!personalityAssessment?.id || !personalityScored) return
    fetchDimensionScores(personalityAssessment.id)
    fetchValidityResult(personalityAssessment.id)
  }, [personalityAssessment?.id, personalityScored, fetchDimensionScores, fetchValidityResult])

  useEffect(() => {
    let active = true
    if (assessment.photoUrl) getCompDocSignedUrl(assessment.photoUrl).then((u) => active && setPhotoUrl(u))
    else setPhotoUrl(null)
    return () => {
      active = false
    }
  }, [assessment.photoUrl])

  useEffect(() => {
    let active = true
    if (assessment.previousAssessmentId) fetchReassessmentComparison(assessment.id).then((d) => active && setReassessment(d))
    return () => {
      active = false
    }
  }, [assessment.id, assessment.previousAssessmentId, fetchReassessmentComparison])

  // Evidence/Competency Engine (Section 49/53): make sure the evidence-backed profile exists and is
  // current — only for viewers comp_can_access_assessment would accept (one-shot, see N-9).
  useEffect(() => {
    if (!canComputeCompetencyProfile || competencyProfileRequestedRef.current) return
    competencyProfileRequestedRef.current = true
    ensureCompetencyProfile(assessment.id)
  }, [canComputeCompetencyProfile, assessment.id, ensureCompetencyProfile])

  // ---- derived data
  const roleLabel = resolveJobRoleLabel(jobRoleConfigs, assessment.jobRole)
  const gapRows = useMemo(
    () => (competencyProfile ? buildGapRows(competencyProfile.scores, competencyProfile.evidence, competencyCatalog) : []),
    [competencyProfile, competencyCatalog],
  )
  const gapLabels = useMemo(
    () =>
      gapRows
        .filter((r) => isCriticalGap(r.score) || isDevelopmentGap(r.score))
        .sort((a, b) => Number(isCriticalGap(b.score)) - Number(isCriticalGap(a.score)))
        .map((r) => r.labelFa),
    [gapRows],
  )
  const model = useMemo(
    () =>
      buildResultsModel({
        assessment,
        questionBank,
        panelists: allPanelists,
        panelistScores: allPanelistScores,
        profiles,
        roleLabel,
        guidanceRows,
        gapLabels,
      }),
    [assessment, questionBank, allPanelists, allPanelistScores, profiles, roleLabel, guidanceRows, gapLabels],
  )
  const { domainScores, overall, completion, status, strengths, weaknesses, isPM } = model
  const approval = approvalLevel(assessment.isApproved, overall)

  const interviewRows = useMemo(
    () =>
      buildInterviewSummary({
        assessment,
        competencies: competencyCatalog,
        requirements: jobCompetencyRequirements,
        evidenceSources,
        ratings: interviewRatings,
        profiles,
      }),
    [assessment, competencyCatalog, jobCompetencyRequirements, evidenceSources, interviewRatings, profiles],
  )

  const personalityForPrint: PrintPersonality | null = useMemo(() => {
    if (!assessment.needsPersonalityAssessment) return null
    if (!personalityAssessment) return { snapshot: null, statusLabel: 'طراحی نشده' }
    if (!personalityScored) return { snapshot: null, statusLabel: PERSONALITY_ASSESSMENT_STATUS_LABEL_FA[personalityAssessment.status] }
    return {
      statusLabel: PERSONALITY_ASSESSMENT_STATUS_LABEL_FA[personalityAssessment.status],
      snapshot: buildFingerprintSnapshot({
        assessment: personalityAssessment,
        scores: personalityScores.filter((s) => s.personalityAssessmentId === personalityAssessment.id),
        traits,
        dimensions,
        requirements: personalityRequirements,
        validity: validityResults.find((v) => v.personalityAssessmentId === personalityAssessment.id),
      }),
    }
  }, [assessment.needsPersonalityAssessment, personalityAssessment, personalityScored, personalityScores, traits, dimensions, personalityRequirements, validityResults])

  // Peers: other candidates of the same job role, computed with the same official resolution.
  // N-15: demo/test candidates are not peers of real ones unless the viewer opts in.
  const peers = useMemo(() => {
    return allAssessments
      .filter((a) => a.id !== assessment.id && a.jobRole === assessment.jobRole && (showDemoData || !a.isDemo))
      .map((a) => {
        const aIsPM = usesLegacyPmRubric(a)
        const aRoleQuestions = aIsPM ? [] : questionsForAssessment(a, questionBank)
        const aOfficial = resolveOfficialAnswers(
          a.answers,
          allPanelistScores.filter((s) => s.assessmentId === a.id),
        )
        const aDomainScores = aIsPM ? computeDomainScores(aOfficial) : computeCategoryScores(aRoleQuestions, aOfficial)
        return { assessment: a, domainScores: aDomainScores, overall: computeOverallPercent(aDomainScores) }
      })
      .filter((p) => p.overall != null)
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
  }, [allAssessments, allPanelistScores, assessment.id, assessment.jobRole, questionBank, showDemoData])

  const benchmarkScores: DomainScore[] | undefined =
    peers.length > 0
      ? domainScores.map((d, i) => {
          const values = peers.map((p) => p.domainScores[i]?.percentScore).filter((v): v is number => typeof v === 'number')
          return { ...d, percentScore: values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null }
        })
      : undefined
  const allOveralls = [overall, ...peers.map((p) => p.overall)].filter((v): v is number => typeof v === 'number')
  const rank = overall != null ? allOveralls.filter((v) => v > overall).length + 1 : null
  const avgOverall = allOveralls.length > 0 ? Math.round(allOveralls.reduce((a, b) => a + b, 0) / allOveralls.length) : null
  const maxOverall = allOveralls.length > 0 ? Math.max(...allOveralls) : null
  const topPeers = peers.slice(0, 2)
  const comparisonData = domainScores.map((d, i) => {
    const row: Record<string, string | number> = { domain: d.domain.shortTitle, [assessment.candidateName]: d.percentScore ?? 0 }
    topPeers.forEach((p) => {
      row[p.assessment.candidateName] = p.domainScores[i]?.percentScore ?? 0
    })
    return row
  })

  const kpiTiles = [...domainScores, ...model.extendedFingerprint].map((d, i) => ({
    domain: d,
    Icon: isPM ? (PM_DOMAIN_ICON[d.domain.key as CompetencyDomainKey] ?? Compass) : (ROLE_BUCKET_ICON[d.domain.key] ?? Compass),
    accent: DOMAIN_ACCENT_PALETTE[i % DOMAIN_ACCENT_PALETTE.length],
  }))

  const patternParagraphs = generatePersonalityProfile(domainScores, overall, assessment, isPM)
  const aiStale = isAiAnalysisStale(candidateAiAnalysis, competencyProfile?.scores)
  const evidenceMix = useMemo(() => evidenceMethodMix(competencyProfile?.evidence ?? []), [competencyProfile])

  const panelists = allPanelists.filter((p) => p.assessmentId === assessment.id)
  const submittedCount = model.panel.filter((p) => p.submitted).length
  const finalizeChecklist = {
    pendingPanelists: model.panel.filter((p) => !p.submitted).map((p) => p.name),
    unscoredQuestions: completion.total - completion.answered,
    totalQuestions: completion.total,
    personalityUnfinished: assessment.needsPersonalityAssessment && !personalityScored,
  }
  const stages = computeEvaluationStages(assessment, completion.percent, panelists.length, submittedCount)

  const qualificationChips = [
    { label: 'مدرک تحصیلی', icon: GraduationCap, value: model.officialQualification.educationScore },
    { label: 'سوابق کاری مرتبط', icon: Briefcase, value: model.officialQualification.experienceScore },
    { label: 'دوره‌های حرفه‌ای', icon: BookOpen, value: model.officialQualification.pmTrainingScore },
    { label: 'صلاحیت حرفه‌ای', icon: Award, value: model.officialQualification.pmCertificationScore },
  ]

  // ---- actions
  const handlePrint = () => {
    if (printRef.current) printReportNode(printRef.current, `گزارش-کامل-${assessment.candidateName}`)
  }
  const handlePdf = async () => {
    if (!printRef.current) return
    setExporting(true)
    try {
      await exportReportPdf(printRef.current, `گزارش-کامل-${assessment.candidateName}.pdf`)
    } finally {
      setExporting(false)
    }
  }
  const handleApprove = async () => {
    setSettingApproval(true)
    await setApproved(assessment.id, !assessment.isApproved)
    setSettingApproval(false)
  }
  const resultsShareUrl = `${window.location.origin}${window.location.pathname}?results=${assessment.resultsShareToken}`
  const handleSend = () => {
    const subject = encodeURIComponent(`نتیجه ارزیابی شایستگی — ${assessment.candidateName}`)
    const body = encodeURIComponent(
      `با سلام\n\nنتیجه ارزیابی شایستگی جناب/سرکار خانم ${assessment.candidateName}:\nامتیاز کلی: ${overall != null ? `${overall}٪${status.state !== 'final' ? ' (موقت)' : ''}` : '—'}\nوضعیت: ${status.label}\n\nبرای گزارش کامل، فایل PDF پیوست را مشاهده کنید.\n\nفرین (FARIN)`,
    )
    window.location.href = `mailto:${assessment.candidateEmail}?subject=${subject}&body=${body}`
  }

  const headerRight = (
    <>
      <AssessmentChainNav assessment={assessment} onOpen={(id) => onOpenAssessment(id, 'results')} />
      {onNew && (
        <button onClick={onNew} className="flex min-h-9 items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-500">
          <Plus size={14} /> ارزیابی جدید
        </button>
      )}
    </>
  )

  // Grouped by category (ResultsStage's five bold-titled sections) so the quick nav reads the same
  // "topic → sub-topic" structure as the page itself, not a flat, uncategorized list of 11 anchors.
  const navItems = [
    { id: 'r-design', label: 'طرح ارزیابی', color: '#64748b' },
    { id: 'r-technical', label: 'فنی و تخصصی', color: '#a855f7' },
    { id: 'r-mcq', label: '↳ آزمون تستی آنلاین', color: '#a855f7' },
    { id: 'r-behavior', label: 'شخصیت و رفتاری', color: '#ec4899' },
    { id: 'r-interview', label: 'مصاحبه ساختاریافته', color: '#0ea5e9' },
    { id: 'r-experience', label: 'سوابق و تجربه', color: '#f59e0b' },
    { id: 'r-summary', label: 'جمع‌بندی و تحلیل', color: '#6366f1' },
    { id: 'r-gap', label: '↳ شکاف شایستگی', color: '#6366f1' },
    { id: 'r-ai', label: '↳ تحلیل هوشمند', color: '#6366f1' },
    { id: 'r-idp', label: '↳ برنامه توسعه', color: '#6366f1' },
    ...(assessment.previousAssessmentId ? [{ id: 'r-reassess', label: '↳ مقایسه با قبل', color: '#6366f1' }] : []),
    { id: 'r-final', label: 'تأیید نهایی', color: '#10b981' },
  ]

  const btnGhost = 'fx-sub flex min-h-10 items-center gap-1.5 px-3.5 py-2 text-xs font-bold transition-colors hover:brightness-110 disabled:opacity-50'

  return (
    <CompetencySidebarShell active="results" nav={nav} title={`نتیجه ارزیابی — ${assessment.candidateName}`} stageStrip={stages} onExitToHub={onExitToHub} headerRight={headerRight}>
      <div className="fx fx-remap space-y-4">
        {/* Toolbar */}
        <div className="no-print flex flex-wrap items-center justify-end gap-2">
          <button onClick={handlePrint} className={btnGhost} title="در پنجره چاپ، «ذخیره به‌صورت PDF» را انتخاب کنید — متن قابل انتخاب و کیفیت برداری">
            <Printer size={14} /> چاپ / ذخیره PDF گزارش کامل
          </button>
          <button onClick={handlePdf} disabled={exporting} className={btnGhost} title="فایل PDF تصویری، بدون پنجره چاپ">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {exporting ? 'در حال ساخت PDF…' : 'دانلود سریع PDF'}
          </button>
          <button
            onClick={handleSend}
            disabled={!assessment.candidateEmail}
            title={!assessment.candidateEmail ? 'ابتدا ایمیل نامزد را در بخش مشخصات ثبت کنید' : ''}
            className="flex min-h-10 items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-40"
          >
            <Mail size={14} /> ارسال به نامزد
          </button>
          {assessment.status !== 'completed' && (
            <button onClick={() => setFinalizeOpen(true)} className="flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500">
              <CheckCircle2 size={14} /> ثبت نهایی ارزیابی
            </button>
          )}
        </div>

        <div className="no-print fx-card space-y-2.5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Globe size={14} style={{ color: '#a855f7' }} /> لینک عمومی نتایج
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={resultsShareUrl} dir="ltr" aria-label="لینک عمومی نتایج" className="input flex-1 text-[11px]" onFocus={(e) => e.target.select()} />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(resultsShareUrl)
                setLinkCopied(true)
                setTimeout(() => setLinkCopied(false), 2000)
              }}
              className="flex min-h-10 items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-500"
            >
              <Copy size={12} /> {linkCopied ? 'کپی شد' : 'کپی لینک'}
            </button>
            <button type="button" onClick={() => regenerateResultsShareLink(assessment.id)} title="صدور لینک جدید (لینک قبلی غیرفعال می‌شود)" className={btnGhost}>
              <RefreshCw size={12} /> لینک جدید
            </button>
          </div>
        </div>

        {/* The full report («گزارش کامل») — off-screen, cloned by print and rasterized by the PDF export. */}
        <div className="comp-print-offscreen" ref={printRef} aria-hidden="true">
          <CompetencyPrintReport
            assessment={assessment}
            model={model}
            roleLabel={roleLabel}
            logoUrl={LOGO_URL}
            photoUrl={photoUrl}
            interview={interviewRows}
            personality={personalityForPrint}
            evidenceMix={evidenceMix}
            competencyGapRows={gapRows}
            developmentPlan={
              developmentPlan
                ? {
                    plan: developmentPlan,
                    actions: developmentActions ?? [],
                    competencyLabel: (id) => competencyCatalog.find((c) => c.id === id)?.labelFa ?? 'شایستگی',
                    ownerName: profiles.find((p) => p.id === developmentPlan.ownerId)?.fullName ?? null,
                  }
                : null
            }
            ai={
              candidateAiAnalysis
                ? {
                    summary: candidateAiAnalysis.analysis.executive_summary,
                    roleFit: candidateAiAnalysis.analysis.role_fit_narrative,
                    stale: aiStale,
                    generatedAt: candidateAiAnalysis.createdAt,
                  }
                : null
            }
            reassessment={reassessment}
            patternParagraphs={patternParagraphs}
            peers={{ rank, total: allOveralls.length, average: avgOverall }}
            approval={{
              reviewedByName: profiles.find((p) => p.id === assessment.reviewedBy)?.fullName ?? null,
              creatorName: profiles.find((p) => p.id === assessment.createdBy)?.fullName ?? null,
            }}
            generatedAt={new Date().toISOString()}
          />
        </div>

        {/* Hero */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.45fr_0.85fr_1.1fr]">
          <div className="fx-card fx-tone-wash relative flex flex-col items-center gap-4 overflow-hidden p-5 sm:flex-row" style={tone(status.state === 'final' ? tierColor(overall) : '#a855f7')}>
            <div className="relative shrink-0">
              <OpenToWorkRing active={assessment.workStatus === 'open_to_work'} size={96} shape="square" radius={16}>
                <div className="fx-tone-border flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border-2" style={{ background: 'var(--fx-surface-2)' }}>
                  {photoUrl ? <img src={photoUrl} alt={`عکس ${assessment.candidateName}`} className="h-full w-full object-cover" /> : <User size={32} className="fx-muted" />}
                </div>
              </OpenToWorkRing>
              {assessment.isApproved && (
                <span
                  className={`absolute -left-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white shadow-lg ring-2 ring-[var(--fx-ring-hole)] ${assessment.workStatus === 'open_to_work' ? '-top-1.5' : '-bottom-1.5'} ${approval === 'conditional' ? '' : 'bg-emerald-500'}`}
                  style={approval === 'conditional' ? { background: CONDITIONAL_COLOR } : undefined}
                  title={APPROVAL_LABEL[approval]}
                >
                  <ShieldCheck size={14} />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-right">
              <p className="flex items-center justify-center gap-1.5 text-xl font-black sm:justify-start">
                {assessment.candidateName}
                {assessment.isApproved && <ApprovalMedal level={approval} />}
                {status.state === 'final' && overall != null && overall >= 85 && <Star size={17} className="fill-amber-400 text-amber-400" />}
              </p>
              <p className="fx-text-2 text-[12px]">متقاضی سمت: {assessment.candidatePosition || roleLabel}</p>
              <p className="fx-muted text-[11px]">شغل مرجع ارزیابی: {roleLabel}</p>
              <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                {assessment.yearsExperienceTotal != null && (
                  <span className="fx-tone-bg fx-tone-text num rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={tone('#0ea5e9')}>
                    {fa(assessment.yearsExperienceTotal, 1)} سال سابقه
                  </span>
                )}
                {assessment.certifications.slice(0, 2).map((c, i) => (
                  <span key={c.id} className="fx-tone-bg fx-tone-text rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={tone(DOMAIN_ACCENT_PALETTE[i + 2])}>
                    {c.title}
                  </span>
                ))}
                {assessment.status === 'completed' && (
                  <span className="fx-tone-bg fx-tone-text rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={tone('#10b981')}>
                    ثبت نهایی‌شده
                  </span>
                )}
                {approval === 'conditional' && (
                  <span className="fx-tone-bg fx-tone-text rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={tone(CONDITIONAL_COLOR)}>
                    تأیید مشروط
                  </span>
                )}
                <WorkStatusChip status={assessment.workStatus} projectName={assessment.workProjectName} className="!px-2.5 !py-1 !text-[10.5px]" />
              </div>
            </div>
          </div>
          <ScoreRing model={model} />
          <StatusCard model={model} roleLabel={roleLabel}>
            <div className="flex items-center gap-1.5">
              <button onClick={handlePrint} title="چاپ یا ذخیره به‌صورت PDF (A4)" className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-2 py-1.5 text-[11.5px] font-bold text-white hover:bg-purple-500">
                <Download size={13} /> گزارش کامل PDF
              </button>
              <button onClick={() => compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className={`${btnGhost} flex-1 justify-center text-[11.5px]`}>
                <BarChart3 size={13} /> مقایسه
              </button>
            </div>
          </StatusCard>
        </div>

        <SectionNav items={navItems} />

        {/* Exam design — methodology metadata, not itself a scored topic, so it stays outside the
            five bold categories below (product ask: group *topics*; this is "how", not "what"). */}
        <SectionHeading id="r-design" icon={ListTree} color="#64748b" title="طرح ارزیابی و روش‌های به‌کاررفته" />
        <ExamDesignCard model={model} assessment={assessment} />

        {/* ================= CATEGORY 1 — ارزیابی فنی تخصصی ================= */}
        <div className="fx-category" style={tone('#a855f7')}>
          <CategoryHeading icon={Wrench} color="#a855f7" title="ارزیابی فنی تخصصی" subtitle="ارزیابی حضوری پنل داوران + آزمون تستی آنلاین به‌عنوان سنجه‌ی مکمل" />
          <div id="r-technical" className="scroll-mt-20 space-y-3">
            <PatternCard paragraphs={patternParagraphs} />

            {completion.total === 0 && overall == null ? (
              <EmptyNote>ارزیابی فنی حضوری برای این متقاضی هنوز طراحی یا امتیازدهی نشده است.</EmptyNote>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {kpiTiles.map(({ domain: d, Icon, accent }) => {
                    const color = tierColor(d.percentScore)
                    return (
                      <div key={d.domain.key} className="fx-card overflow-hidden p-3.5" style={tone(accent)}>
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span className="fx-tone-bg-strong fx-tone-text flex h-7 w-7 items-center justify-center rounded-lg">
                            <Icon size={14} />
                          </span>
                          <span className="fx-text-2 truncate text-[11.5px] font-bold">{d.domain.shortTitle}</span>
                        </div>
                        <p className="num text-2xl font-black" style={tone(color)}>
                          <span className={d.percentScore != null ? 'fx-tone-text' : 'fx-muted'}>{d.percentScore != null ? fa(d.percentScore) : '—'}</span>
                          <span className="fx-muted text-[11px] font-bold"> /۱۰۰</span>
                        </p>
                        <div className="fx-track mt-1.5 h-1.5 overflow-hidden rounded-full">
                          <div className="h-full rounded-full" style={{ width: `${d.percentScore ?? 0}%`, background: `linear-gradient(90deg, ${accent}99, ${color})` }} />
                        </div>
                        <p className="fx-muted num mt-1 text-[10px]">
                          {fa(d.answeredCount)}/{fa(d.totalCount)} سؤال {d.domain.weight > 0 ? `، وزن ٪${fa(d.domain.weight)}` : '، نمایشی'}
                        </p>
                      </div>
                    )
                  })}
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[0.85fr_1.3fr_0.85fr]">
                  <div className="space-y-3">
                    <div className="fx-card p-4" style={tone('#10b981')}>
                      <p className="fx-tone-text mb-2 flex items-center gap-1.5 text-[12.5px] font-bold">
                        <Trophy size={14} /> نقاط قوت
                      </p>
                      {strengths.length > 0 ? (
                        <ul className="space-y-1.5">
                          {strengths.map((s) => (
                            <li key={s.domain.key} className="fx-text-2 flex items-center gap-1.5 text-[11.5px]">
                              <CheckCircle2 size={13} className="fx-tone-text shrink-0" /> {s.domain.title}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="fx-muted text-[11px]">حوزه‌ای با امتیاز ۸۵ یا بیشتر ثبت نشده است.</p>
                      )}
                    </div>
                    <div className="fx-card p-4" style={tone('#f59e0b')}>
                      <p className="fx-tone-text mb-2 flex items-center gap-1.5 text-[12.5px] font-bold">
                        <AlertTriangle size={14} /> نقاط قابل بهبود
                      </p>
                      {weaknesses.length > 0 ? (
                        <ul className="space-y-1.5">
                          {weaknesses.map((s) => (
                            <li key={s.domain.key} className="fx-text-2 flex items-center gap-1.5 text-[11.5px]">
                              <AlertTriangle size={13} className="fx-tone-text shrink-0" /> {s.domain.title}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="fx-muted text-[11px]">حوزه‌ای زیر ۴۰ امتیاز نیست.</p>
                      )}
                    </div>
                  </div>

                  <div className="fx-card p-4">
                    <p className="mb-2 text-center text-[12.5px] font-bold">نمودار شایستگی‌ها</p>
                    <CompetencyRadarChart domainScores={domainScores} benchmarkScores={benchmarkScores} />
                    <p className="fx-muted num text-center text-[11px]">
                      {fa(completion.answered)} از {fa(completion.total)} سؤال امتیازدهی‌شده (٪{fa(completion.percent)})
                    </p>
                  </div>

                  <div className="fx-card p-4" style={tone('#f59e0b')}>
                    <p className="mb-3 flex items-center gap-1.5 text-[12.5px] font-bold">
                      <Trophy size={14} className="fx-tone-text" /> رتبه در میان متقاضیان
                    </p>
                    {rank != null && allOveralls.length > 1 ? (
                      <>
                        <p className="text-center">
                          <span className="num fx-tone-text text-4xl font-black">{fa(rank)}</span>
                          <span className="num fx-muted text-lg"> / {fa(allOveralls.length)}</span>
                        </p>
                        <p className="fx-muted mb-3 text-center text-[10.5px]">در میان متقاضیان شغل «{roleLabel}»</p>
                        <div className="fx-divider flex items-center justify-between gap-2 border-t pt-3 text-center">
                          <div className="flex-1">
                            <p className="num text-sm font-bold">{fa(avgOverall)}</p>
                            <p className="fx-muted text-[10px]">میانگین کل</p>
                          </div>
                          <div className="flex-1">
                            <p className="num text-sm font-bold">{fa(maxOverall)}</p>
                            <p className="fx-muted text-[10px]">بالاترین امتیاز</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="fx-muted py-6 text-center text-[11px]">هنوز متقاضی دیگری با این شغل امتیاز نگرفته — رتبه‌بندی بعداً نمایش داده می‌شود.</p>
                    )}
                  </div>
                </div>

                <div ref={compareRef} className="scroll-mt-20">
                  <div className="fx-card p-4">
                    <p className="mb-3 text-[12.5px] font-bold">مقایسه با متقاضیان برتر همین شغل</p>
                    {topPeers.length > 0 ? (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={comparisonData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--fx-grid)" />
                          <XAxis dataKey="domain" tick={{ fill: 'var(--fx-chart-label)', fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fill: 'var(--fx-chart-muted)', fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: 'var(--fx-tooltip-bg)', border: '1px solid var(--fx-border-strong)', borderRadius: 10, fontSize: 12, color: 'var(--text-primary)' }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey={assessment.candidateName} fill={CANDIDATE_SERIES} radius={[4, 4, 0, 0]} />
                          {topPeers.map((p, i) => (
                            <Bar key={p.assessment.id} dataKey={p.assessment.candidateName} fill={PEER_SERIES_COLORS[i]} radius={[4, 4, 0, 0]} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyNote>هنوز متقاضی دیگری برای مقایسه در این شغل ثبت نشده است.</EmptyNote>
                    )}
                  </div>
                </div>

                <PanelBreakdown model={model} />
              </>
            )}

            {/* Online MCQ — a sub-metric of technical competence, not a peer topic: same category,
                lighter heading than the categories/SectionHeadings above it. */}
            <div id="r-mcq" className="scroll-mt-20 pt-1">
              <p className="fx-text-2 mb-2.5 flex items-center gap-1.5 text-[13px] font-extrabold">
                <ListChecks size={15} style={{ color: '#a855f7' }} /> آزمون تستی آنلاین <span className="fx-muted text-[11px] font-bold">— مکمل ارزیابی فنی حضوری</span>
              </p>
              {!assessment.needsOnlineMcq ? <EmptyNote>آزمون تستی آنلاین در طرح ارزیابی این متقاضی قرار ندارد.</EmptyNote> : <McqResultsSection assessmentId={assessment.id} />}
            </div>
          </div>
        </div>

        {/* ================= CATEGORY 2 — شخصیت و رفتاری ================= */}
        <div id="r-behavior" className="fx-category scroll-mt-20" style={tone('#ec4899')}>
          <CategoryHeading icon={Fingerprint} color="#ec4899" title="شخصیت و رفتاری" subtitle="Big Five، ابعاد رفتاری حرفه‌ای، تطابق شغلی (Role Alignment) و اعتبار پاسخ‌ها (Validity)" />
          {!assessment.needsPersonalityAssessment ? (
            <EmptyNote>ارزیابی شخصیت و رفتاری در طرح ارزیابی این متقاضی قرار ندارد.</EmptyNote>
          ) : showPersonalityFingerprint && personalityAssessment ? (
            <PersonalityFingerprintPanel
              personalityAssessmentId={personalityAssessment.id}
              candidateName={assessment.candidateName}
              candidatePosition={assessment.candidatePosition}
              showPrintButton={false}
            />
          ) : (
            <EmptyNote>
              این متقاضی هنوز ارزیابی شخصیت و رفتاری را کامل نکرده است
              {personalityAssessment ? ` (وضعیت فعلی: ${PERSONALITY_ASSESSMENT_STATUS_LABEL_FA[personalityAssessment.status]})` : ''}.
            </EmptyNote>
          )}
        </div>

        {/* ================= CATEGORY 3 — مصاحبه ساختاریافته ================= */}
        <div id="r-interview" className="fx-category scroll-mt-20" style={tone('#0ea5e9')}>
          <CategoryHeading icon={MessagesSquare} color="#0ea5e9" title="مصاحبه ساختاریافته" subtitle="امتیاز ۱ تا ۵ هر داور روی سطوح مهارت هر شایستگی، در برابر سطح مورد نیاز شغل" />
          <InterviewResults rows={interviewRows} inDesign={assessment.needsStructuredInterview} />
        </div>

        {/* ================= CATEGORY 4 — سوابق و تجربه ================= */}
        <div id="r-experience" className="fx-category scroll-mt-20 space-y-3" style={tone('#f59e0b')}>
          <CategoryHeading icon={History} color="#f59e0b" title="سوابق و تجربه" subtitle="تحصیلات، سوابق شغلی و گواهینامه‌ها — و سهم آن‌ها در شواهد شایستگی" />
          <ProfileSummary assessment={assessment} />
          <QualificationScorecard chips={qualificationChips} />
          <KeyProjects assessment={assessment} />
        </div>

        {/* ================= CATEGORY 5 — جمع‌بندی و تحلیل ================= */}
        <div id="r-summary" className="fx-category scroll-mt-20 space-y-3" style={tone('#6366f1')}>
          <CategoryHeading icon={Sparkles} color="#6366f1" title="جمع‌بندی و تحلیل" subtitle="سطح بلوغ کلی، شکاف شایستگی، تحلیل هوش مصنوعی و برنامه توسعه فردی" />

          <MaturityCard model={model} roleLabel={roleLabel} />
          <EvidenceMixCard mix={evidenceMix} />

          <div id="r-gap" className="scroll-mt-20 space-y-3">
            <SectionHeading icon={Target} color="#8b5cf6" title="تحلیل شکاف شایستگی — نمای ۳۶۰ درجه" />
            <CompetencyGapAnalysis assessment={assessment} canRecompute={canRecomputeCompetencyProfile} />
          </div>

          <div id="r-ai" className="scroll-mt-20 space-y-3">
            <SectionHeading icon={Sparkles} color="#6366f1" title="تحلیل جامع هوش مصنوعی" />
            <div className="fx-card p-4" style={tone('#6366f1')}>
              <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                <button onClick={onGoToAiAnalysis} className="fx-tone-bg fx-tone-text flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold hover:brightness-110">
                  مشاهده تحلیل کامل <ArrowLeft size={12} />
                </button>
              </div>
              {aiStale && (
                <button onClick={onGoToAiAnalysis} className="mb-2 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-right text-[11px] font-bold" style={tone('#f59e0b')}>
                  <span className="fx-tone-bg fx-tone-text flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle size={12} className="shrink-0" /> تحلیل به‌روز نیست — پروفایل شایستگی پس از تولید آن تغییر کرده؛ بازتولید کنید.
                  </span>
                </button>
              )}
              {candidateAiAnalysis ? (
                <p className="fx-text-2 text-[12px] leading-7">
                  {candidateAiAnalysis.analysis.at_a_glance?.verdict ?? candidateAiAnalysis.analysis.executive_summary}
                </p>
              ) : (
                <EmptyNote>تحلیل جامع هوشمند (شخصیت، رفتار، فنی و تطابق شغلی) هنوز برای این متقاضی تولید نشده است.</EmptyNote>
              )}
            </div>
          </div>

          <div id="r-idp" className="scroll-mt-20 space-y-3">
            <SectionHeading icon={Sprout} color="#14b8a6" title="برنامه توسعه فردی" />
            <DevelopmentPlanSummary assessment={assessment} canManage={isLeadViewer || isDesignerViewer} onGoToIdp={onGoToIdp} onOpenAssessment={onOpenAssessment} />
          </div>

          {assessment.previousAssessmentId && (
            <div id="r-reassess" className="scroll-mt-20 space-y-3">
              <SectionHeading icon={GitCompareArrows} color="#38bdf8" title="مقایسه با ارزیابی قبلی" />
              <ReassessmentComparison assessment={assessment} onOpenPrevious={(id) => onOpenAssessment(id, 'results')} />
            </div>
          )}
        </div>

        {/* Approval / finalization — the process outcome, kept as its own un-categorized closing
            block (it is a workflow action, not an assessment topic). */}
        <SectionHeading id="r-final" icon={ClipboardCheck} color="#10b981" title="جمع‌بندی، تأیید و وضعیت نهایی" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { label: 'وضعیت ارزیابی', value: assessment.status === 'completed' ? 'ثبت نهایی و قفل‌شده' : 'در جریان', color: assessment.status === 'completed' ? '#10b981' : '#f59e0b' },
            { label: 'تأیید صلاحیت', value: APPROVAL_LABEL[approval], color: approval === 'conditional' ? CONDITIONAL_COLOR : approval === 'approved' ? '#10b981' : '#94a3b8' },
            { label: 'نتیجه', value: status.label, color: status.color },
          ].map((x) => (
            <div key={x.label} className="fx-card fx-accent-bar p-3.5" style={tone(x.color)}>
              <p className="fx-muted text-[11px]">{x.label}</p>
              <p className="fx-tone-text text-[14px] font-extrabold">{x.value}</p>
            </div>
          ))}
        </div>

        <div className="fx-card fx-tone-border flex flex-col items-start gap-3 border p-4 sm:flex-row sm:items-center" style={tone(status.color)}>
          <span className="fx-tone-bg-strong fx-tone-text flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <MessagesSquare size={18} />
          </span>
          <div className="flex-1 space-y-1">
            <p className="text-[12.5px] font-extrabold">جمع‌بندی مسئول ارزیابی</p>
            {assessment.strengths || assessment.developmentAreas ? (
              <>
                {assessment.strengths && (
                  <p className="text-[11.5px] leading-6" style={tone('#10b981')}>
                    <b className="fx-tone-text">نقاط قوت: </b>
                    <span className="fx-text-2">{assessment.strengths}</span>
                  </p>
                )}
                {assessment.developmentAreas && (
                  <p className="text-[11.5px] leading-6" style={tone('#f59e0b')}>
                    <b className="fx-tone-text">زمینه‌های قابل بهبود: </b>
                    <span className="fx-text-2">{assessment.developmentAreas}</span>
                  </p>
                )}
              </>
            ) : (
              <p className="fx-text-2 text-[11.5px] leading-6">{status.detail}</p>
            )}
          </div>
          <button
            onClick={handleApprove}
            disabled={settingApproval}
            className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
              assessment.isApproved ? 'fx-sub' : isConditionalScore(overall) ? 'text-white hover:brightness-110' : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
            style={!assessment.isApproved && isConditionalScore(overall) ? { background: CONDITIONAL_COLOR } : undefined}
          >
            <ShieldCheck size={14} />{' '}
            {assessment.isApproved
              ? approval === 'conditional'
                ? 'لغو تأیید مشروط'
                : 'لغو تایید صلاحیت'
              : isConditionalScore(overall)
                ? 'تأیید مشروط و ارسال به مرحله بعد'
                : 'تایید و ارسال به مرحله بعد'}
          </button>
        </div>

        <WorkStatusEditor assessment={assessment} />

        {isModuleAdmin && assessment.status === 'completed' && (
          <div className="fx-card flex flex-col items-start gap-2 p-4 sm:flex-row sm:items-center sm:justify-between" style={tone('#f59e0b')}>
            <p className="fx-text-2 text-[11.5px] leading-6">
              {assessment.reopenRequestedAt && (
                <span className="fx-tone-text mb-1 block font-bold">
                  درخواست بازگشایی از {profiles.find((pr) => pr.id === assessment.reopenRequestedBy)?.fullName ?? 'مسئول ارزیابی'}
                  {assessment.reopenRequestReason ? `: «${assessment.reopenRequestReason}»` : ''}
                </span>
              )}
              این ارزیابی قفل و نهایی‌شده است — امتیاز داوران، امتیازهای مصاحبه، سؤالات و طرح آزمون دیگر تغییر نمی‌کنند. در صورت نیاز به اصلاح، آن را بازگشایی کنید (این
              اقدام ثبت می‌شود و تأیید صلاحیت هم برداشته می‌شود).
            </p>
            <button
              disabled={reopening}
              onClick={async () => {
                setReopening(true)
                await reopenAssessment(assessment.id)
                setReopening(false)
              }}
              className="fx-tone-bg fx-tone-text flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-50"
            >
              <RotateCcw size={14} /> {reopening ? 'در حال بازگشایی…' : 'بازگشایی ارزیابی برای اصلاح'}
            </button>
          </div>
        )}

        {/* N-10: a lead who is not a module admin cannot reopen — but can ask for it, with a reason. */}
        {!isModuleAdmin && isLeadViewer && assessment.status === 'completed' && (
          <div className="fx-card space-y-2 p-4 text-[11.5px] leading-6" style={tone('#f59e0b')}>
            {assessment.reopenRequestedAt ? (
              <p className="fx-tone-text">درخواست بازگشایی شما ثبت شده و منتظر ادمین ماژول است{assessment.reopenRequestReason ? ` («${assessment.reopenRequestReason}»)` : ''}.</p>
            ) : (
              <>
                <p className="fx-text-2">این ارزیابی قفل و نهایی‌شده است و فقط ادمین ماژول می‌تواند آن را بازگشایی کند. اگر اصلاحی لازم است، دلیل را بنویسید تا درخواست برای ادمین ثبت شود.</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} maxLength={1000} placeholder="دلیل درخواست بازگشایی…" aria-label="دلیل درخواست بازگشایی" className="input flex-1" />
                  <button
                    disabled={requestingReopen || reopenReason.trim().length === 0}
                    onClick={async () => {
                      setRequestingReopen(true)
                      if (await requestReopen(assessment.id, reopenReason)) setReopenReason('')
                      setRequestingReopen(false)
                    }}
                    className="fx-tone-bg fx-tone-text flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold disabled:opacity-50"
                  >
                    <RotateCcw size={14} /> {requestingReopen ? 'در حال ثبت…' : 'درخواست بازگشایی'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {assessment.reviewedAt && (
          <p className="fx-muted text-[10.5px]">
            بازبینی مشخصات: {profiles.find((p) => p.id === assessment.reviewedBy)?.fullName ?? '—'} — {formatJalali(assessment.reviewedAt.slice(0, 10))}
            {assessment.reopenedAt ? `، آخرین بازگشایی: ${formatJalali(assessment.reopenedAt.slice(0, 10))}` : ''}
          </p>
        )}

        {finalizeOpen && (
          <FinalizeAssessmentDialog
            assessment={assessment}
            checklist={finalizeChecklist}
            onCancel={() => setFinalizeOpen(false)}
            onConfirm={async () => {
              await setStatus(assessment.id, 'completed')
              setFinalizeOpen(false)
            }}
          />
        )}
      </div>
    </CompetencySidebarShell>
  )
}
