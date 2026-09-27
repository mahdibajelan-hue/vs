import type { CompPanelistScore, CompetencyAssessment } from '../types'

/** The one next step a candidate's evaluation is waiting on (docs/demo-test-report.md N-12),
 * derived only from data the dashboard already has — the assessment row, the panel sheets, the
 * viewer's own panel memberships and (when loaded) the linked personality test's status. */
export interface NextStep {
  label: string
  tone: 'done' | 'action' | 'waiting'
  /** Whether this step is the current viewer's to take ("نیازمند اقدام من"). */
  mine: boolean
}

export interface NextStepContext {
  myId: string | null
  isModuleAdmin: boolean
  isDesigner: boolean
  /** Assessments where the viewer is on the panel, and whether as its designated lead. */
  myPanel: Map<string, { isLead: boolean }>
  /** Judges currently assigned to this assessment. */
  panelCount: number
  sheets: CompPanelistScore[]
  /** Linked personality test status, or undefined when there is none / it isn't loaded. */
  personalityStatus: string | undefined
  personalityLoaded: boolean
}

const PERSONALITY_UNDESIGNED = ['DRAFT', 'DESIGNED']
const PERSONALITY_WITH_CANDIDATE = ['GENERATED', 'ASSIGNED', 'STARTED', 'IN_PROGRESS']

export function computeNextStep(a: CompetencyAssessment, ctx: NextStepContext): NextStep {
  const isLead = ctx.isModuleAdmin || (!!ctx.myId && a.createdBy === ctx.myId) || ctx.myPanel.get(a.id)?.isLead === true
  const canDesign = isLead || ctx.isDesigner

  if (a.status === 'completed') {
    if (a.reopenRequestedAt) return { label: 'درخواست بازگشایی', tone: 'action', mine: ctx.isModuleAdmin }
    return { label: 'تکمیل‌شده', tone: 'done', mine: false }
  }

  const prefix = a.reopenedAt ? 'بازگشایی‌شده — ' : ''
  const step = (label: string, tone: NextStep['tone'], mine: boolean): NextStep => ({ label: prefix + label, tone, mine })

  if (a.selfServiceStatus === 'submitted') return step('بررسی خوداظهاری', 'action', isLead)
  if (a.needsTechnicalAssessment && a.selectedQuestionIds.length === 0) return step('طراحی آزمون فنی', 'action', canDesign)
  // A missing personality test only means "not designed yet" for viewers who could see it (RLS).
  if (
    a.needsPersonalityAssessment &&
    ctx.personalityLoaded &&
    (ctx.personalityStatus == null ? canDesign : PERSONALITY_UNDESIGNED.includes(ctx.personalityStatus))
  )
    return step('طراحی آزمون شخصیت', 'action', canDesign)

  if (a.needsTechnicalAssessment) {
    const mySheet = ctx.sheets.find((s) => s.panelistId === ctx.myId)
    if (ctx.myPanel.has(a.id) && !mySheet?.submittedAt) return step('امتیازدهی من', 'action', true)
    const submitted = ctx.sheets.filter((s) => s.submittedAt != null).length
    if (ctx.panelCount > 0 && ctx.panelCount < a.panelSize) {
      return step(`تکمیل پنل (${ctx.panelCount.toLocaleString('fa-IR')} از ${a.panelSize.toLocaleString('fa-IR')} داور)`, 'action', isLead)
    }
    if (ctx.panelCount > 0 && submitted < ctx.panelCount) {
      return step(`منتظر داور (${submitted.toLocaleString('fa-IR')} از ${ctx.panelCount.toLocaleString('fa-IR')} ثبت‌شده)`, 'waiting', false)
    }
  }
  if (a.needsPersonalityAssessment && ctx.personalityStatus && PERSONALITY_WITH_CANDIDATE.includes(ctx.personalityStatus)) {
    return step(ctx.personalityStatus === 'IN_PROGRESS' || ctx.personalityStatus === 'STARTED' ? 'آزمون شخصیت در حال پاسخ‌گویی' : 'منتظر آزمون شخصیت متقاضی', 'waiting', false)
  }
  if (a.selfServiceStatus === 'pending') return step('لینک خوداظهاری ارسال‌شده', 'waiting', false)
  return step('آماده‌ی ثبت نهایی', 'action', isLead)
}
