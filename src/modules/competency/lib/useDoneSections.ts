import { useEffect, useState } from 'react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { usePersonalityStore } from '../../personality/store/usePersonalityStore'
import type { CompetencyAssessment } from '../types'
import type { EvaluationStage } from './evaluationStages'
import type { CompetencySection } from '../components/CompetencySidebarShell'
import { fetchMcqTestDetail } from './mcqData'

const PERSONALITY_DONE = ['FINGERPRINT', 'AI_ANALYSIS', 'FINAL_REVIEW', 'LOCKED', 'ARCHIVED']

/** Which of one candidate's steps are finished — drives the small check mark beside each step link in the top bar. Only steps that are part of this candidate's design can get a mark. */
export function useDoneSections(assessment: CompetencyAssessment | undefined, stages: EvaluationStage[] | undefined): Partial<Record<CompetencySection, boolean>> {
  const panelists = useCompetencyStore((s) => s.panelists)
  const aiById = useCompetencyStore((s) => s.candidateAiAnalysisByAssessment)
  const plans = useCompetencyStore((s) => s.developmentPlans)
  const pAssessments = usePersonalityStore((s) => s.assessments)
  const fetchPersonality = usePersonalityStore((s) => s.fetchAssessments)
  const [mcq, setMcq] = useState(false)
  const id = assessment?.id, needsMcq = !!assessment?.needsOnlineMcq
  useEffect(() => { if (id && pAssessments.length === 0) void fetchPersonality() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!id || !needsMcq) { setMcq(false); return }
    let live = true
    void fetchMcqTestDetail(id).then(({ data }) => { if (live) setMcq(!!data && (data.status === 'SUBMITTED' || data.status === 'SCORED')) })
    return () => { live = false }
  }, [id, needsMcq])
  if (!assessment) return {}
  const p = pAssessments.find((a) => a.assessmentId === assessment.id)
  const interviewDone = !!stages && stages[2].done && stages[3].done
  return {
    profile: !!stages && stages[1].done,
    documents: assessment.selfServiceStatus === 'submitted' || assessment.selfServiceStatus === 'reviewed',
    panel: panelists.some((x) => x.assessmentId === assessment.id),
    personality: assessment.needsPersonalityAssessment && !!p && PERSONALITY_DONE.includes(p.status),
    mcq: needsMcq && mcq,
    questions: assessment.needsTechnicalAssessment && interviewDone,
    results: assessment.status === 'completed',
    aiAnalysis: !!aiById[assessment.id],
    idp: plans.some((x) => x.assessmentId === assessment.id && x.status !== 'CANCELLED'),
  }
}
