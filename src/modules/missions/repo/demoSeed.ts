import { DEFAULT_QUESTION_SET } from '../lib/questionSets'
import { startInterview, submitAnswer, type EngineInput } from '../lib/interviewEngine'
import { buildReport } from '../lib/reportBuilder'
import { scoreReport } from '../lib/qualityScore'
import { addDaysIso, todayIso } from '../lib/fa'
import type { Finding, InterviewState, Mission, Objective, PendingQuestion, PersonRef, ProjectRef, VisitType } from '../types'
import type { CurrentUser, MissionDraft, MissionRepo, ObjectiveDraft } from './types'

/**
 * Realistic sample data (Persian, EPC oil & gas pipelines), produced by running the REAL interview engine
 * over scripted answers — so every finding, slot, report and quality score in the demo is what the product
 * itself would have produced, not hand-typed fixtures.
 */

type End = 'draft' | 'pending' | 'approved' | 'debrief' | 'review' | 'returned' | 'ready' | 'claimed'

interface Scenario {
  visitType: VisitType
  destination: string
  visitees: { name: string; org: string; role: string }[]
  topicsOfInterest: string
  expectedOutput: string
  startOffset: number
  days: number
  objectives: ObjectiveDraft[]
  end: End
  /** answers keyed by main-question id (or `<topic>` fallback) */
  answers: Record<string, string>
  objectiveAnswers: string[]
  /** stop the scripted interview after this many topics (for the "in progress" scenario) */
  stopAfterTopics?: number
  evidence?: number
  managerNote?: string
  transfer?: boolean
}

const SLOT_ANSWERS: Record<string, string[]> = {
  cause: ['چون سازنده مشکل تأمین ارز و مواد اولیه دارد', 'به دلیل هماهنگ نبودن مجوزهای دسترسی با مالکین اراضی', 'به علت تأخیر در تأیید نقشه‌ها توسط مشاور'],
  impact: ['حدود دو ماه تأخیر دارد و روی مسیر بحرانی اثر می‌گذارد', 'باعث توقف بخشی از جوشکاری و افزایش هزینه سربار می‌شود', 'تأخیر جزئی در تحویل و نیاز به بازنگری برنامه'],
  party: ['آقای رضایی از شرکت سازنده', 'پیمانکار اصلی', 'مشاور'],
  newDate: ['تا پایان ماه آینده', 'تاریخ جدیدی اعلام نشده', 'دو هفته دیگر'],
  needAction: ['باید نامه تسریع رسمی ارسال شود'],
  probability: ['زیاد', 'متوسط'],
  mitigation: ['می‌توان از سازنده جایگزین خرید کرد', 'باید برنامه جبرانی با افزایش شیفت کاری تدوین شود'],
  owner: ['آقای کریمی', 'مهندس احمدی'],
  due: ['دو هفته دیگر', 'تا پایان هفته'],
}

const SCENARIOS: Scenario[] = [
  {
    visitType: 'procurement_expediting',
    destination: 'کارخانه سازنده شیرآلات — کرج',
    visitees: [{ name: 'آقای رضایی', org: 'شرکت فولاد ارقام', role: 'مدیر فروش' }, { name: 'مهندس سلطانی', org: 'شرکت فولاد ارقام', role: 'مدیر تولید' }],
    topicsOfInterest: 'تأخیر تأمین شیرهای ۳۶ اینچ، وضعیت بازرسی کارخانه',
    expectedOutput: 'برنامه تحویل مکتوب و صورتجلسه با سازنده',
    startOffset: -9, days: 2, end: 'review', evidence: 3,
    objectives: [
      { title: 'دریافت برنامه زمانی تحویل شیرهای ۳۶ اینچ از سازنده', measure: 'برنامه مکتوب با تاریخ مشخص', topicKey: 'procurement', priority: 'high' },
      { title: 'بازدید از خط تولید و ثبت وضعیت ساخت', measure: 'گزارش مکتوب با عکس از خط تولید', topicKey: 'procurement', priority: 'medium' },
    ],
    answers: {
      'overview-1': 'در کل وضعیت قابل قبول است ولی در بخش تأمین شیرها نگرانی داریم.',
      'progress-1': 'پیشرفت واقعی ۴۲ درصد و برنامه ۵۰ درصد است.',
      'progress-2': 'فقط خرید شیرها عقب افتاده است و بقیه فعالیت‌ها مطابق برنامه است.',
      'proc-1': 'تأمین شیرهای ۳۶ اینچ عقب افتاده است چون سازنده مشکل ارزی دارد. حدود سه ماه تأخیر دارد و مسیر بحرانی را تحت تأثیر قرار می‌دهد. مسئول پیگیری آقای رضایی است.',
      'proc-2': 'سازنده تعهد داد تا پایان مهر اولین محموله را تحویل بدهد.',
      'con-1': 'در این بازدید به کارگاه نرفتیم.',
      'con-2': 'مانعی ندیدم.',
      'hse-1': 'در کارخانه موردی از نظر ایمنی مشاهده نشد.',
      'ir-1': 'مورد دیگری نبود.',
      'ir-2': 'ممکن است اگر تحریم‌ها ادامه پیدا کند سازنده نتواند قطعات را تأمین کند و پروژه با ریسک توقف روبه‌رو شود.',
      'dec-1': 'توافق شد که سازنده هر هفته گزارش پیشرفت تولید بدهد.',
      'dec-2': 'سازنده تا پایان ماه برنامه مکتوب تحویل می‌دهد.',
      'act-1': 'آقای کریمی تا دو هفته دیگر نامه تسریع رسمی به سازنده بدهد.',
      'act-2': 'پیشنهاد می‌کنم یک سازنده جایگزین هم برای شیرها پیش‌ارزیابی شود.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['کاملاً محقق شد، برنامه مکتوب گرفتیم', 'تا حدی؛ فقط بخشی از خط تولید را دیدیم'],
  },
  {
    visitType: 'construction_supervision',
    destination: 'کارگاه ایستگاه تقویت فشار — جاسک',
    visitees: [{ name: 'مهندس احمدی', org: 'پیمانکار اجرا', role: 'سرپرست کارگاه' }],
    topicsOfInterest: 'ایمنی داربست، کیفیت جوش خط ورودی، پیشرفت اجرا',
    expectedOutput: 'گزارش ایمنی و فهرست NCRهای باز',
    startOffset: -24, days: 3, end: 'ready', evidence: 4, transfer: true,
    objectives: [
      { title: 'بررسی وضعیت ایمنی داربست‌ها و مجوزهای کار در ارتفاع', measure: 'فهرست موارد عدم‌رعایت با عکس', topicKey: 'hse', priority: 'critical' },
      { title: 'کنترل NCRهای باز جوش خط ورودی', measure: 'فهرست NCR با وضعیت رفع', topicKey: 'quality', priority: 'high' },
      { title: 'ثبت درصد پیشرفت اجرایی ایستگاه', measure: 'درصد پیشرفت واقعی در برابر برنامه', topicKey: 'progress', priority: 'medium' },
    ],
    answers: {
      'overview-1': 'پروژه با تأخیر ولی قابل جبران پیش می‌رود و مهم‌ترین نگرانی ایمنی داربست‌هاست.',
      'progress-1': 'پیشرفت واقعی ۶۱ درصد و برنامه ۶۸ درصد است.',
      'progress-2': 'نصب پایپینگ ایستگاه از برنامه عقب‌تر است و ساخت فونداسیون جلوتر.',
      'con-1': 'نیروی جوشکار کم است و دو جبهه کاری به دلیل کمبود جرثقیل کند شده است. حدود دو هفته تأخیر دارد.',
      'con-2': 'کمبود جرثقیل فعالیت نصب را کند کرده است چون جرثقیل دوم هنوز نرسیده. مسئول پیگیری پیمانکار اجرا است.',
      'hse-1': 'شبه‌حادثه جدی دیدم: داربست طبقه دوم بدون تأیید بازرسی ایمنی استفاده می‌شد و یک نفر نزدیک بود سقوط کند. این وضعیت بحرانی است.',
      'qual-1': 'سه NCR جوش خط ورودی باز است و بازرسی رادیوگرافی هنوز انجام نشده است.',
      'ir-1': 'مورد دیگری نبود.',
      'ir-2': 'ممکن است در صورت ادامه کمبود جرثقیل، فعالیت‌های مسیر بحرانی نصب با تأخیر بیشتری روبه‌رو شود.',
      'dec-1': 'توافق شد که تا فردا استفاده از داربست طبقه دوم متوقف شود.',
      'dec-2': 'پیمانکار تا پایان هفته گواهی بازرسی داربست را ارائه می‌کند.',
      'act-1': 'مهندس احمدی تا پایان هفته داربست‌ها را بازرسی و برچسب‌گذاری کند.',
      'act-2': 'پیشنهاد می‌کنم بازرس ایمنی دائمی در کارگاه مستقر شود.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['محقق شد؛ فهرست موارد با عکس ثبت شد', 'تا حدی؛ سه NCR باز شناسایی شد ولی وضعیت رفع نامشخص است', 'محقق شد'],
  },
  {
    visitType: 'client_meeting',
    destination: 'دفتر مرکزی کارفرما — تهران',
    visitees: [{ name: 'دکتر موسوی', org: 'کارفرما', role: 'مدیر طرح' }],
    topicsOfInterest: 'ادعای تمدید مدت، تغییر دامنه کار',
    expectedOutput: 'صورتجلسه با تعهدات دو طرف',
    startOffset: -3, days: 1, end: 'debrief', stopAfterTopics: 3,
    objectives: [
      { title: 'دریافت پاسخ رسمی کارفرما به درخواست تمدید مدت', measure: 'نامه یا صورتجلسه امضاشده', topicKey: 'decisions', priority: 'high' },
    ],
    answers: {
      'overview-1': 'جلسه سازنده بود ولی کارفرما درباره تمدید مدت قاطع نبود.',
      'progress-1': 'پیشرفت واقعی ۳۵ درصد و برنامه ۴۰ درصد است.',
      'progress-2': 'فعالیت‌های مهندسی عقب‌تر از برنامه است.',
    },
    objectiveAnswers: ['تا حدی'],
  },
  {
    visitType: 'progress_review',
    destination: 'دفتر مهندسی مشاور — اصفهان',
    visitees: [{ name: 'مهندس نوری', org: 'مشاور', role: 'مدیر مهندسی' }],
    topicsOfInterest: 'تأیید نقشه‌های ایستگاه، ریویژن P&ID',
    expectedOutput: 'فهرست مدارک معوق با تاریخ تأیید',
    startOffset: 5, days: 2, end: 'pending',
    objectives: [
      { title: 'دریافت فهرست مدارک مهندسی معلق نزد مشاور', measure: 'فهرست مکتوب با تاریخ تأیید هر مدرک', topicKey: 'engineering', priority: 'high' },
    ],
    answers: {}, objectiveAnswers: [],
  },
  {
    visitType: 'quality_audit',
    destination: 'کارخانه پوشش لوله — بندرعباس',
    visitees: [{ name: 'مهندس شریفی', org: 'پیمانکار پوشش', role: 'مدیر کنترل کیفیت' }],
    topicsOfInterest: 'ITP پوشش، تست هالیدی، NCR',
    expectedOutput: 'گزارش ممیزی کیفیت',
    startOffset: -7, days: 2, end: 'approved',
    objectives: [
      { title: 'بررسی انطباق فرآیند پوشش با ITP مصوب', measure: 'فهرست عدم‌انطباق‌ها با شواهد', topicKey: 'quality', priority: 'high' },
      { title: 'کنترل نتایج تست هالیدی ده روز اخیر', measure: 'گزارش تست با امضای ناظر', topicKey: 'quality', priority: 'medium' },
    ],
    answers: {}, objectiveAnswers: [],
  },
  {
    visitType: 'progress_review',
    destination: 'کارگاه خط لوله ۳۶ اینچ — بخش دوم',
    visitees: [],
    topicsOfInterest: 'پیشرفت و موانع',
    expectedOutput: 'گزارش وضعیت',
    startOffset: -16, days: 2, end: 'returned',
    objectives: [{ title: 'بازدید از کارگاه و ثبت وضعیت', measure: 'گزارش مکتوب', topicKey: 'progress', priority: 'medium' }],
    answers: {
      'overview-1': 'خوب بود.',
      'progress-1': 'خوب پیش می‌رود.',
      'progress-2': 'تأخیر هست.',
      'con-1': 'نیرو کم بود.',
      'con-2': 'بله.',
      'hse-1': 'مشکلی نبود.',
      'ir-1': 'نه.',
      'ir-2': 'نه.',
      'dec-1': 'نه.',
      'dec-2': 'نه.',
      'act-1': 'پیگیری شود.',
      'act-2': 'ندارم.',
      'evd-1': 'ندارم',
    },
    objectiveAnswers: ['تا حدی'],
    managerNote: 'گزارش بسیار کلی است: درصد پیشرفت، موانع مشخص و مسئول هر اقدام را بنویسید و حداقل یک عکس از کارگاه پیوست کنید.',
  },
  {
    visitType: 'hse_audit',
    destination: 'کمپ و کارگاه ایستگاه کمپرسور — عسلویه',
    visitees: [{ name: 'مهندس باقری', org: 'مدیریت HSE پروژه', role: 'مدیر HSE' }],
    topicsOfInterest: 'ممیزی HSE، مجوز کار، آمادگی اضطراری',
    expectedOutput: 'گزارش ممیزی HSE',
    startOffset: -62, days: 3, end: 'claimed', evidence: 3,
    objectives: [
      { title: 'ممیزی مجوزهای کار و آمادگی اضطراری کارگاه', measure: 'چک‌لیست تکمیل‌شده ممیزی با عکس', topicKey: 'hse', priority: 'high' },
    ],
    answers: {
      'overview-1': 'وضعیت HSE کارگاه مطابق برنامه و رضایت‌بخش است.',
      'progress-1': 'پیشرفت واقعی ۵۵ درصد و برنامه ۵۳ درصد است.',
      'progress-2': 'فعالیت‌ها مطابق برنامه است.',
      'con-1': 'منابع کافی است و مانعی نیست.',
      'con-2': 'مانعی ندیدم.',
      'hse-1': 'عدم‌رعایت جزئی: در دو مورد مجوز کار در ارتفاع امضای ناظر نداشت و بلافاصله اصلاح شد.',
      'qual-1': 'موردی مشاهده نشد.',
      'ir-1': 'مورد دیگری نبود.',
      'ir-2': 'ریسک جدیدی ندیدم.',
      'dec-1': 'توافق شد که چک‌لیست ممیزی هر دو هفته تکرار شود.',
      'dec-2': 'مدیر HSE تا پایان ماه برنامه ممیزی دوره‌ای را ارائه می‌کند.',
      'act-1': 'مهندس باقری تا دو هفته دیگر برنامه آموزش مجوز کار را تهیه کند.',
      'act-2': 'پیشنهاد دیگری ندارم.',
      'evd-1': 'ثبت شد',
    },
    objectiveAnswers: ['کاملاً محقق شد، چک‌لیست تکمیل شد'],
  },
  {
    visitType: 'coordination_meeting',
    destination: 'دفتر پروژه — تهران',
    visitees: [],
    topicsOfInterest: 'هماهنگی تأمین و اجرا',
    expectedOutput: '',
    startOffset: 12, days: 1, end: 'draft',
    objectives: [{ title: 'برگزاری جلسه هماهنگی تأمین و اجرا', measure: '', topicKey: '', priority: 'low' }],
    answers: {}, objectiveAnswers: [],
  },
]

export interface SeedContext {
  repo: MissionRepo & { forUser?: (u: CurrentUser) => MissionRepo }
  projects: ProjectRef[]
  /** People who play the visiting managers (cycled). Live DB: just the current user. */
  requesters: (PersonRef & { isAdmin?: boolean })[]
  manager: CurrentUser
  /** Mark live rows so they can be found and removed later. */
  marker?: string
}

function projectTypeOf(projects: ProjectRef[], id: string): string {
  return projects.find((p) => p.id === id)?.projectType ?? ''
}

async function runInterview(repo: MissionRepo, mission: Mission, objectives: Objective[], ctx: SeedContext, sc: Scenario) {
  const input: EngineInput = { set: DEFAULT_QUESTION_SET, mission, objectives, projectType: projectTypeOf(ctx.projects, mission.masterProjectId), projectName: mission.projectName, today: todayIso(), ai: null }
  let step = startInterview(input)
  let state: InterviewState = step.state
  let findings: Finding[] = step.findings
  let seq = 1
  await repo.appendTurns(mission.id, seq, step.turns)
  seq += step.turns.length
  const used: Record<string, number> = {}
  let completedTopics = 0
  let guard = 0
  while (state.pending && guard++ < 80) {
    const p: PendingQuestion = state.pending
    let text: string
    if (p.kind === 'followup' && p.slot) {
      const list = SLOT_ANSWERS[p.slot] ?? ['نامشخص']
      used[p.slot] = (used[p.slot] ?? 0) + 1
      text = list[(used[p.slot] - 1) % list.length]
    } else if (p.kind === 'followup') text = 'مورد دیگری ندارم'
    else if (p.findingKey?.startsWith('obj:')) {
      const idx = objectives.findIndex((o) => `obj:${o.id}` === p.findingKey)
      text = sc.objectiveAnswers[idx] ?? 'تا حدی'
    } else text = sc.answers[p.id] ?? 'موردی مشاهده نشد.'
    step = await submitAnswer(input, state, findings, text, 'text')
    const before = completedTopics
    completedTopics = Object.values(step.state.topics).filter((t) => t.state !== 'open').length
    await repo.appendTurns(mission.id, seq, step.turns)
    seq += step.turns.length
    state = step.state
    findings = step.findings
    for (const u of step.objectiveUpdates) await repo.updateObjective(u.id, { status: u.status, resultNote: u.note })
    if (sc.stopAfterTopics && completedTopics >= sc.stopAfterTopics && completedTopics > before) break
  }
  await repo.upsertFindings(mission.id, findings)
  await repo.saveInterview(mission.id, { status: state.current === null ? 'summary' : 'active', state, provider: 'rules' })
  return { state, findings }
}

export async function seedDemo(ctx: SeedContext): Promise<number> {
  const { repo, projects } = ctx
  if (!projects.length) throw new Error('هیچ پروژه‌ای برای ساخت داده نمونه وجود ندارد.')
  const today = todayIso()
  let created = 0
  let idx = 0
  for (const sc of SCENARIOS) {
    const requester = ctx.requesters[idx % ctx.requesters.length]
    const project = projects[idx % projects.length]
    idx++
    const asRequester: MissionRepo = ctx.repo.forUser ? ctx.repo.forUser({ id: requester.id, name: requester.name, position: requester.position, isAdmin: !!requester.isAdmin, isManager: false }) : repo
    const asManager: MissionRepo = ctx.repo.forUser ? ctx.repo.forUser(ctx.manager) : repo
    const start = addDaysIso(today, sc.startOffset)
    const draft: MissionDraft = {
      masterProjectId: project.id,
      requesterPosition: requester.position || 'مدیر پروژه',
      destination: sc.destination,
      locationDetail: ctx.marker ?? '',
      startDate: start,
      endDate: addDaysIso(start, sc.days - 1),
      visitType: sc.visitType,
      visitees: sc.visitees,
      topicsOfInterest: sc.topicsOfInterest,
      expectedOutput: sc.expectedOutput,
      approverId: ctx.manager.id || null,
    }
    const mission = await asRequester.createMission(draft, sc.objectives)
    created++
    if (sc.end === 'draft') continue
    await asRequester.transition(mission.id, 'submit_request')
    if (sc.end === 'pending') continue
    await asManager.transition(mission.id, 'approve_request', 'اهداف روشن است؛ موفق باشید.')
    if (sc.end === 'approved') continue
    await asRequester.transition(mission.id, 'start_debrief')
    const bundle = await asRequester.loadBundle(mission.id)
    const { state, findings } = await runInterview(asRequester, bundle.mission, bundle.objectives, ctx, sc)
    for (let i = 0; i < (sc.evidence ?? 0); i++) {
      await asRequester.addEvidence(mission.id, { kind: (['photo', 'minutes', 'letter', 'technical'] as const)[i % 4], title: ['عکس از محل بازدید', 'صورتجلسه با سازنده', 'نامه تسریع', 'مدرک فنی'][i % 4], note: '', topicKey: ['construction', 'decisions', 'procurement', 'quality'][i % 4], findingId: null, objectiveId: null }, null)
    }
    if (sc.end === 'debrief') continue
    const full = await asRequester.loadBundle(mission.id)
    const content = buildReport({ mission: full.mission, projectName: full.mission.projectName, objectives: full.objectives, findings, evidence: full.evidence, state, set: DEFAULT_QUESTION_SET })
    const q = scoreReport({ mission: full.mission, objectives: full.objectives, findings, evidence: full.evidence, state, content })
    await asRequester.saveInterview(mission.id, { status: 'completed', summaryConfirmedAt: new Date().toISOString() })
    await asRequester.saveReport(mission.id, { content, qualityScore: q.score, breakdown: q.criteria, generatedBy: 'rules' })
    await asRequester.transition(mission.id, 'submit_report')
    if (sc.end === 'review') continue
    if (sc.end === 'returned') {
      await asManager.transition(mission.id, 'return_report', sc.managerNote ?? 'لطفاً گزارش را تکمیل کنید.')
      continue
    }
    if (sc.transfer) {
      const after = await asManager.loadBundle(mission.id)
      for (const f of after.findings.filter((x) => (x.kind === 'issue' || x.kind === 'risk') && (x.severity === 'critical' || x.severity === 'high'))) {
        try {
          await asManager.transferFinding(f.id, f.kind === 'issue' ? 'issue' : 'risk')
        } catch {
          /* a project without an Issue/Risk mapping simply stays proposed */
        }
      }
    }
    await asManager.transition(mission.id, 'approve_report', 'گزارش کامل و قابل اتکا بود. ممنون.')
    if (sc.end === 'claimed') await asRequester.transition(mission.id, 'mark_claimed')
  }
  return created
}
