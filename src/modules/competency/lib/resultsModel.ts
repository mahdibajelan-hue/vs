import type {
  CompCompetency,
  CompCompetencyEvidenceSource,
  CompInterviewRating,
  CompJobCompetencyRequirement,
  CompPanelist,
  CompPanelistScore,
  CompProfileLite,
  CompQuestionBankItem,
  CompetencyAnswers,
  CompetencyAssessment,
  DomainScore,
} from '../types'
import { computeCompletion, computeDomainScores, computeOverallPercent, domainFlags } from './competencyModel'
import {
  computeCategoryScores,
  computeExtendedFingerprint,
  computeRoleCompletion,
  questionsForAssessment,
  resolveOfficialAnswers,
  resolveOfficialCapstone,
  resolveOfficialQualificationScores,
  usesLegacyPmRubric,
} from './roleCompetencyModel'
import { computeResultStatus, interpretMaturity, type MaturityInterpretation, type ResultStatus, type RoleMaturityGuidanceRow } from './maturityGuidance'

/**
 * Everything the results page and the full PDF report show about the technical part of one
 * candidate's assessment, computed once from the store's own rows — so the screen and the PDF can
 * never disagree about a number.
 */

export interface PanelBreakdownRow {
  userId: string
  name: string
  isLead: boolean
  submitted: boolean
  overallPercent: number | null
  /** Same order as ResultsModel.domainScores. */
  domainPercents: (number | null)[]
  answered: number
  capstoneScore: number | null
  strengths: string
  developmentAreas: string
}

export interface InterviewSummaryRow {
  competencyId: string
  labelFa: string
  isCritical: boolean
  requiredLevel: number
  requiredLabel: string
  average: number | null
  ratings: { raterName: string; rating: number; notes: string }[]
}

export interface AssessmentMethod {
  key: 'technical' | 'personality' | 'interview' | 'experience'
  label: string
  enabled: boolean
}

export interface ResultsModel {
  isPM: boolean
  roleQuestions: CompQuestionBankItem[]
  officialAnswers: CompetencyAnswers
  officialQualification: Pick<CompetencyAssessment, 'educationScore' | 'experienceScore' | 'pmTrainingScore' | 'pmCertificationScore'>
  domainScores: DomainScore[]
  extendedFingerprint: DomainScore[]
  overall: number | null
  completion: { answered: number; total: number; percent: number }
  status: ResultStatus
  interpretation: MaturityInterpretation
  strengths: DomainScore[]
  weaknesses: DomainScore[]
  capstone: { score: number | null; note: string }
  panel: PanelBreakdownRow[]
  panelAverage: number | null
  methods: AssessmentMethod[]
}

export function assessmentMethods(a: CompetencyAssessment): AssessmentMethod[] {
  return [
    { key: 'personality', label: 'ارزیابی شخصیت و رفتاری', enabled: a.needsPersonalityAssessment },
    { key: 'technical', label: 'ارزیابی فنی و تخصصی (حضوری)', enabled: a.needsTechnicalAssessment },
    { key: 'interview', label: 'مصاحبه ساختاریافته', enabled: a.needsStructuredInterview },
    { key: 'experience', label: 'سوابق و مدارک به‌عنوان شواهد', enabled: a.includesExperience },
  ]
}

export function buildResultsModel(input: {
  assessment: CompetencyAssessment
  questionBank: CompQuestionBankItem[]
  panelists: CompPanelist[]
  panelistScores: CompPanelistScore[]
  profiles: CompProfileLite[]
  roleLabel: string
  guidanceRows: RoleMaturityGuidanceRow[]
  gapLabels?: string[]
}): ResultsModel {
  const { assessment, questionBank, panelists, panelistScores, profiles, roleLabel, guidanceRows, gapLabels } = input
  const isPM = usesLegacyPmRubric(assessment)
  const roleQuestions = isPM ? [] : questionsForAssessment(assessment, questionBank)
  const domainScoresFor = (answers: CompetencyAnswers) => (isPM ? computeDomainScores(answers) : computeCategoryScores(roleQuestions, answers))

  const myScores = panelistScores.filter((s) => s.assessmentId === assessment.id)
  const officialAnswers = resolveOfficialAnswers(assessment.answers, myScores)
  const officialQualification = resolveOfficialQualificationScores(assessment, myScores)
  const domainScores = domainScoresFor(officialAnswers)
  const overall = computeOverallPercent(domainScores)
  const completion = isPM ? computeCompletion(officialAnswers) : computeRoleCompletion(roleQuestions, officialAnswers)
  const status = computeResultStatus(domainScores, overall, completion)
  const interpretation = interpretMaturity({
    jobRole: assessment.jobRole,
    roleLabel,
    overall,
    domainScores,
    guidanceRows,
    gapLabels,
    sufficient: status.state === 'final',
  })
  const { strengths, weaknesses } = domainFlags(domainScores)
  const extendedFingerprint = isPM ? [] : computeExtendedFingerprint(roleQuestions, officialAnswers).filter((d) => d.totalCount > 0)
  const capstone = resolveOfficialCapstone(assessment.capstoneScore, assessment.capstoneNote, myScores)

  const panel: PanelBreakdownRow[] = panelists
    .filter((p) => p.assessmentId === assessment.id)
    .map((p) => {
      const sheet = myScores.find((s) => s.panelistId === p.userId)
      const sheetDomains = sheet ? domainScoresFor(sheet.answers) : []
      const prof = profiles.find((pr) => pr.id === p.userId)
      return {
        userId: p.userId,
        name: prof?.fullName || prof?.email || 'داور',
        isLead: p.isLead,
        submitted: sheet?.submittedAt != null,
        overallPercent: sheet ? computeOverallPercent(sheetDomains) : null,
        domainPercents: domainScores.map((_, i) => sheetDomains[i]?.percentScore ?? null),
        answered: sheet ? Object.values(sheet.answers).filter((a) => typeof a?.score === 'number').length : 0,
        capstoneScore: sheet?.capstoneScore ?? null,
        strengths: sheet?.strengths ?? '',
        developmentAreas: sheet?.developmentAreas ?? '',
      }
    })
    .sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name, 'fa'))
  const submittedPercents = panel.filter((p) => p.submitted && p.overallPercent != null).map((p) => p.overallPercent as number)
  const panelAverage = submittedPercents.length > 0 ? Math.round(submittedPercents.reduce((a, b) => a + b, 0) / submittedPercents.length) : null

  return {
    isPM,
    roleQuestions,
    officialAnswers,
    officialQualification,
    domainScores,
    extendedFingerprint,
    overall,
    completion,
    status,
    interpretation,
    strengths,
    weaknesses,
    capstone,
    panel,
    panelAverage,
    methods: assessmentMethods(assessment),
  }
}

/** Structured-interview results per competency (comp_interview_ratings, Section 50): every rater's
 * own 1-5 rating and note, and the panel average — the same competency list the interview stage shows. */
export function buildInterviewSummary(input: {
  assessment: CompetencyAssessment
  competencies: CompCompetency[]
  requirements: CompJobCompetencyRequirement[]
  evidenceSources: CompCompetencyEvidenceSource[]
  ratings: CompInterviewRating[]
  profiles: CompProfileLite[]
}): InterviewSummaryRow[] {
  const { assessment, competencies, requirements, evidenceSources, ratings, profiles } = input
  const mine = ratings.filter((r) => r.assessmentId === assessment.id)
  const byId = new Map(competencies.map((c) => [c.id, c]))
  const interviewCompetencyIds = new Set(evidenceSources.filter((s) => s.sourceType === 'STRUCTURED_INTERVIEW').map((s) => s.competencyId))
  const rows: InterviewSummaryRow[] = []
  for (const req of requirements) {
    if (req.jobRole !== assessment.jobRole) continue
    const c = byId.get(req.competencyId)
    if (!c) continue
    const rated = mine.filter((r) => r.competencyId === c.id)
    // A competency with ratings is always shown (even if its interview source was later removed).
    if (!interviewCompetencyIds.has(c.id) && rated.length === 0) continue
    const avg = rated.length > 0 ? rated.reduce((s, r) => s + r.rating, 0) / rated.length : null
    rows.push({
      competencyId: c.id,
      labelFa: c.labelFa,
      isCritical: req.isCritical,
      requiredLevel: req.requiredLevel,
      requiredLabel: c.proficiencyLevels.find((l) => l.level === Math.round(req.requiredLevel))?.labelFa ?? '',
      average: avg,
      ratings: rated.map((r) => {
        const prof = profiles.find((p) => p.id === r.raterId)
        return { raterName: prof?.fullName || prof?.email || 'داور', rating: r.rating, notes: r.notes }
      }),
    })
  }
  return rows.sort((a, b) => Number(b.isCritical) - Number(a.isCritical) || a.labelFa.localeCompare(b.labelFa, 'fa'))
}

export const fa = (n: number | null | undefined, digits = 0): string =>
  n == null ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
