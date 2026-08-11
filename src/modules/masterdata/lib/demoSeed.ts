import { supabase } from '../../../lib/supabaseClient'
import { useAuthStore } from '../../../store/useAuthStore'
import {
  RM_CATEGORIES,
  strategiesForRiskType,
  type RmRiskCategory,
  type RmRiskType,
  type RmResponseStrategy,
} from '../../risk/types'

/**
 * Coherent, seeded (reproducible) demo dataset generator + wipe/reseed orchestration, run
 * entirely through the app's own authenticated Supabase client (admin RLS policies already
 * allow this) — the codebase's earlier one-off seed script had to be handed to the user to run
 * locally because this sandbox's outbound network is blocked; an in-app admin action has no
 * such limitation and is repeatable on demand (spec: "Reset Demo Data" / "Reload Demo Dataset").
 *
 * Reuses the existing Portfolio -> Program -> Project hierarchy and the existing Risk module
 * schema as-is — no new tables, no new columns, no widened category list (the spec's 14
 * conceptual categories are mapped onto the 8 that already exist in rm_risks' check constraint).
 */

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic across runs so results are coherent/reproducible,
// per the spec's explicit "do not use independent random values" requirement.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let rand = mulberry32(20260811)
function ri(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}
function pick<T>(arr: T[]): T {
  return arr[ri(0, arr.length - 1)]
}
function chance(p: number): boolean {
  return rand() < p
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const TODAY = new Date().toISOString().slice(0, 10)
const PROJECT_START = addDays(TODAY, -300)

// ---------------------------------------------------------------------------
// Hierarchy definition — 3 portfolios, 6 programs (2 each), 10 projects distributed 4/3/3.
// ---------------------------------------------------------------------------
const PORTFOLIO_DEFS = [
  { code: 'PF-GTD', name: 'توسعه انتقال گاز', description: 'پورتفولیوی پروژه‌های احداث و توسعه خطوط انتقال گاز سراسری' },
  { code: 'PF-GID', name: 'توسعه زیرساخت گاز', description: 'پورتفولیوی پروژه‌های ایستگاه‌های تقویت فشار و زیرساخت توزیع' },
  { code: 'PF-GPF', name: 'پالایش و تاسیسات گاز', description: 'پورتفولیوی پروژه‌های پالایشگاهی و تاسیسات فرآورش گاز' },
]

const PROGRAM_DEFS = [
  { code: 'PG-1A', name: 'طرح خطوط ۵۶ اینچ شمال', portfolioIndex: 0 },
  { code: 'PG-1B', name: 'طرح خطوط ۴۲ اینچ جنوب', portfolioIndex: 0 },
  { code: 'PG-2A', name: 'طرح ایستگاه‌های تقویت فشار مرکزی', portfolioIndex: 1 },
  { code: 'PG-2B', name: 'طرح توسعه شبکه توزیع غرب', portfolioIndex: 1 },
  { code: 'PG-3A', name: 'طرح واحدهای فرآورش گاز ترش', portfolioIndex: 2 },
  { code: 'PG-3B', name: 'طرح تاسیسات جانبی پالایشگاه', portfolioIndex: 2 },
]

const PROJECT_DEFS = [
  { code: 'P-01', name: 'احداث خط لوله ۵۶ اینچ فاز ۱ (کیلومتر ۰ تا ۸۰)', programIndex: 0 },
  { code: 'P-02', name: 'احداث خط لوله ۵۶ اینچ فاز ۲ (کیلومتر ۸۰ تا ۲۰۰)', programIndex: 0 },
  { code: 'P-03', name: 'احداث خط لوله ۴۲ اینچ جنوب - قطعه شمالی', programIndex: 1 },
  { code: 'P-04', name: 'احداث خط لوله ۴۲ اینچ جنوب - قطعه جنوبی', programIndex: 1 },
  { code: 'P-05', name: 'ایستگاه تقویت فشار شماره ۳', programIndex: 2 },
  { code: 'P-06', name: 'ایستگاه تقویت فشار شماره ۴', programIndex: 2 },
  { code: 'P-07', name: 'توسعه شبکه توزیع منطقه غرب', programIndex: 3 },
  { code: 'P-08', name: 'واحد شیرین‌سازی گاز ترش - واحد ۱', programIndex: 4 },
  { code: 'P-09', name: 'واحد شیرین‌سازی گاز ترش - واحد ۲', programIndex: 4 },
  { code: 'P-10', name: 'تاسیسات جانبی و مخازن ذخیره‌سازی', programIndex: 5 },
]

const CLIENTS = ['شرکت ملی گاز ایران', 'شرکت انتقال گاز', 'شرکت پالایش و پخش']
const PROJECT_MANAGERS = ['مهندس رضایی', 'مهندس احمدی', 'مهندس کریمی', 'مهندس موسوی', 'مهندس صادقی']

// ---------------------------------------------------------------------------
// Risk templates per category (mapped onto the 8 categories the schema already supports).
// ---------------------------------------------------------------------------
const RISK_TEMPLATES: Record<RmRiskCategory, { threat: string[]; opportunity: string[] }> = {
  procurement: {
    threat: ['تاخیر در تامین شیرآلات از فروشنده خارجی', 'افزایش قیمت لوله در بازار جهانی', 'عدم تحویل به‌موقع تجهیزات کنترلی'],
    opportunity: ['امکان تامین محلی بخشی از تجهیزات', 'قرارداد بلندمدت با تخفیف حجمی فروشنده'],
  },
  technical: {
    threat: ['ناسازگاری طراحی با شرایط ژئوتکنیک منطقه', 'خطای مدارک مهندسی در فاز تفصیلی', 'محدودیت فنی تجهیزات کنترل فشار'],
    opportunity: ['امکان بهینه‌سازی مسیر خط با فناوری جدید', 'استفاده از متریال جایگزین با عملکرد بهتر'],
  },
  schedule: {
    threat: ['تاخیر پیمانکار در تحویل مدارک مهندسی', 'تاخیر در اخذ مجوز عبور از اراضی', 'همپوشانی فعالیت‌های بحرانی مسیر'],
    opportunity: ['امکان تسریع با موازی‌سازی فعالیت‌های ساخت', 'کاهش زمان کمیسیونینگ با برنامه‌ریزی بهینه'],
  },
  cost: {
    threat: ['افزایش هزینه به‌دلیل نوسان نرخ ارز', 'هزینه اضافی ناشی از تغییرات دامنه کار'],
    opportunity: ['صرفه‌جویی از طریق تجدید مذاکره قرارداد', 'کاهش هزینه حمل با بهینه‌سازی زنجیره تامین'],
  },
  hse: {
    threat: ['ریسک ایمنی در عملیات جوشکاری در ارتفاع', 'خطر نشت گاز حین تست هیدرواستاتیک'],
    opportunity: ['بهبود فرهنگ ایمنی با آموزش تخصصی'],
  },
  quality: {
    threat: ['نقص کیفیت جوش در تست‌های غیرمخرب', 'عدم انطباق پوشش ضدخوردگی با استاندارد'],
    opportunity: ['ارتقای کیفیت با بازرسی مضاعف شخص ثالث'],
  },
  external: {
    threat: ['تاخیر مجوز محیط‌زیست از سازمان‌های ذی‌ربط', 'اعتراض مالکین اراضی به مسیر خط', 'تحریم فروشنده خارجی تجهیزات کنترلی'],
    opportunity: ['امکان مشارکت با پیمانکار محلی برای تسریع مجوزها'],
  },
  other: {
    threat: ['عدم قطعیت در تخصیص منابع مالی پروژه', 'تغییر اولویت‌های کارفرما'],
    opportunity: ['امکان بهره‌برداری زودتر از موعد از بخشی از خط'],
  },
}

/** Deliberately recurring/duplicate risks across specific projects, per spec §23-24. */
const CROSS_PROJECT_DUPLICATES: { title: string; description: string; projectIndexes: number[]; category: RmRiskCategory }[] = [
  {
    title: 'تاخیر تامین شیرآلات از فروشنده خارجی',
    description: 'تاخیر در ساخت و ترخیص شیرآلات اصلی خط از فروشنده خارجی',
    projectIndexes: [0, 3, 6, 8],
    category: 'procurement',
  },
  {
    title: 'تاخیر تحویل شیرآلات مسیر اصلی',
    description: 'تاخیر فروشنده در تحویل شیرآلات بحرانی مسیر اصلی خط لوله',
    projectIndexes: [1, 4],
    category: 'procurement',
  },
  {
    title: 'تاخیر پیمانکار فرعی در تحویل کار',
    description: 'تاخیر مکرر پیمانکاران فرعی نسبت به برنامه زمان‌بندی مصوب',
    projectIndexes: [0, 1, 2, 5, 7, 9],
    category: 'schedule',
  },
  {
    title: 'تاخیر اخذ مجوز عبور از اراضی',
    description: 'تاخیر در اخذ مجوزهای عبور از اراضی کشاورزی و منابع طبیعی',
    projectIndexes: [0, 2, 4, 6],
    category: 'external',
  },
  {
    title: 'تاخیر تحویل مدارک مهندسی تفصیلی',
    description: 'تاخیر مشاور در تحویل مدارک مهندسی تفصیلی به تیم اجرا',
    projectIndexes: [1, 3, 5, 8, 9],
    category: 'schedule',
  },
]

export interface DemoSeedCounts {
  portfolios: number
  programs: number
  projects: number
  risks: number
  reviews: number
  actions: number
}

export interface DemoSeedProgress {
  (message: string): void
}

// ---------------------------------------------------------------------------
// Wipe
// ---------------------------------------------------------------------------
export async function wipeAllDemoData(onProgress?: DemoSeedProgress): Promise<void> {
  const step = async (label: string, fn: () => PromiseLike<unknown>) => {
    onProgress?.(label)
    await fn()
  }
  const anyId = '00000000-0000-0000-0000-000000000000'

  await step('حذف اقدامات ریسک...', () => supabase.from('rm_risk_actions').delete().neq('id', anyId))
  await step('حذف تاریخچه ریسک...', () => supabase.from('rm_risk_history').delete().neq('id', anyId))
  await step('حذف بازبینی‌های ریسک...', () => supabase.from('rm_risk_assessments').delete().neq('id', anyId))
  await step('حذف ریسک‌ها...', () => supabase.from('rm_risks').delete().neq('id', anyId))
  await step('حذف اعضای پروژه ریسک...', () => supabase.from('rm_project_members').delete().neq('id', anyId))
  await step('حذف پروژه‌های ریسک...', () => supabase.from('rm_projects').delete().neq('id', anyId))
  await step('حذف نگاشت پروژه‌ها...', () => supabase.from('rasta_project_mappings').delete().neq('id', anyId))
  await step('حذف فازهای پروژه...', () => supabase.from('project_phases').delete().neq('id', anyId))
  await step('حذف پروژه‌های پایه...', () => supabase.from('master_projects').delete().neq('id', anyId))
  await step('حذف طرح‌ها...', () => supabase.from('programs').delete().neq('id', anyId))
  await step('حذف پورتفولیوها...', () => supabase.from('portfolios').delete().neq('id', anyId))
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
export async function seedDemoData(onProgress?: DemoSeedProgress): Promise<DemoSeedCounts> {
  rand = mulberry32(20260811)
  const userId = useAuthStore.getState().profile?.id ?? null
  if (!userId) throw new Error('کاربر واردشده یافت نشد')

  onProgress?.('ایجاد پورتفولیوها...')
  const { data: portfolioRows, error: pfErr } = await supabase
    .from('portfolios')
    .insert(PORTFOLIO_DEFS.map((p) => ({ code: p.code, name: p.name, description: p.description, status: 'active', is_active: true })))
    .select('id, code')
  if (pfErr || !portfolioRows) throw new Error(pfErr?.message ?? 'خطا در ایجاد پورتفولیوها')
  const portfolioIds = PORTFOLIO_DEFS.map((_, i) => portfolioRows.find((r) => r.code === PORTFOLIO_DEFS[i].code)!.id as string)

  onProgress?.('ایجاد طرح‌ها...')
  const { data: programRows, error: pgErr } = await supabase
    .from('programs')
    .insert(PROGRAM_DEFS.map((p) => ({ code: p.code, name: p.name, portfolio_id: portfolioIds[p.portfolioIndex], status: 'active' })))
    .select('id, code')
  if (pgErr || !programRows) throw new Error(pgErr?.message ?? 'خطا در ایجاد طرح‌ها')
  const programIds = PROGRAM_DEFS.map((_, i) => programRows.find((r) => r.code === PROGRAM_DEFS[i].code)!.id as string)

  onProgress?.('ایجاد پروژه‌های پایه...')
  const { data: masterProjectRows, error: mpErr } = await supabase
    .from('master_projects')
    .insert(
      PROJECT_DEFS.map((p, i) => {
        const program = PROGRAM_DEFS[p.programIndex]
        const plannedStart = addDays(PROJECT_START, ri(-30, 30))
        return {
          project_code: p.code,
          official_name: p.name,
          short_name: p.name.split(' ').slice(0, 3).join(' '),
          project_type: 'EPC',
          project_category: 'خط لوله و تاسیسات گاز',
          portfolio_id: portfolioIds[program.portfolioIndex],
          program_id: programIds[p.programIndex],
          status: i < 8 ? 'executing' : 'planning',
          planned_start_date: plannedStart,
          planned_finish_date: addDays(plannedStart, ri(500, 800)),
        }
      }),
    )
    .select('id, project_code')
  if (mpErr || !masterProjectRows) throw new Error(mpErr?.message ?? 'خطا در ایجاد پروژه‌های پایه')
  const masterProjectIds = PROJECT_DEFS.map((p) => masterProjectRows.find((r) => r.project_code === p.code)!.id as string)

  onProgress?.('ایجاد پروژه‌های ماژول ریسک...')
  const { data: rmProjectRows, error: rmpErr } = await supabase
    .from('rm_projects')
    .insert(
      PROJECT_DEFS.map((p) => ({
        name: p.name,
        client: pick(CLIENTS),
        project_manager_id: null,
        start_date: PROJECT_START,
        finish_date: addDays(PROJECT_START, ri(500, 800)),
        status: 'active',
        created_by: userId,
      })),
    )
    .select('id, name')
  if (rmpErr || !rmProjectRows) throw new Error(rmpErr?.message ?? 'خطا در ایجاد پروژه‌های ریسک')
  const rmProjectIds = PROJECT_DEFS.map((p) => rmProjectRows.find((r) => r.name === p.name)!.id as string)

  await supabase.from('rm_project_members').insert(rmProjectIds.map((id) => ({ project_id: id, user_id: userId, role: 'risk_manager' })))

  onProgress?.('اتصال پروژه‌ها به ماژول ریسک...')
  await supabase.from('rasta_project_mappings').insert(
    masterProjectIds.map((masterProjectId, i) => ({
      master_project_id: masterProjectId,
      source_module: 'risk',
      source_project_id: rmProjectIds[i],
      status: 'confirmed',
      alias_name: PROJECT_DEFS[i].name,
      created_by: userId,
      decided_by: userId,
      decided_at: new Date().toISOString(),
    })),
  )

  onProgress?.('ایجاد ریسک‌ها...')
  let riskCounter = 0
  let reviewCounter = 0
  let actionCounter = 0

  for (let projectIndex = 0; projectIndex < PROJECT_DEFS.length; projectIndex++) {
    const rmProjectId = rmProjectIds[projectIndex]
    const riskCount = ri(8, 15)
    const riskRows: Record<string, unknown>[] = []

    const duplicatesHere = CROSS_PROJECT_DUPLICATES.filter((d) => d.projectIndexes.includes(projectIndex))
    for (const dup of duplicatesHere) {
      riskRows.push(buildRiskRow(rmProjectId, dup.title, dup.description, dup.category, 'threat'))
    }

    for (let i = riskRows.length; i < riskCount; i++) {
      const category = pick(RM_CATEGORIES)
      const riskType: RmRiskType = chance(0.8) ? 'threat' : 'opportunity'
      const templates = RISK_TEMPLATES[category][riskType === 'threat' ? 'threat' : 'opportunity']
      const title = templates.length > 0 ? pick(templates) : pick(RISK_TEMPLATES.other.threat)
      riskRows.push(buildRiskRow(rmProjectId, title, '', category, riskType))
    }

    onProgress?.(`ثبت ${riskRows.length} ریسک برای پروژه ${projectIndex + 1} از ${PROJECT_DEFS.length}...`)
    const { data: insertedRisks, error: riskErr } = await supabase.from('rm_risks').insert(riskRows).select('id, initial_probability, initial_impact, status, risk_type')
    if (riskErr || !insertedRisks) throw new Error(riskErr?.message ?? 'خطا در ثبت ریسک‌ها')
    riskCounter += insertedRisks.length

    const assessmentRows: Record<string, unknown>[] = []
    const actionRows: Record<string, unknown>[] = []

    for (const risk of insertedRisks as { id: string; initial_probability: number; initial_impact: number; status: string; risk_type: string }[]) {
      if (risk.status !== 'closed' || chance(0.6)) {
        const trajectory: 'improving' | 'stable' | 'worsening' | 'fluctuating' = pick(['improving', 'stable', 'worsening', 'fluctuating'])
        const reviewCount = ri(0, 4)
        let prob = risk.initial_probability
        let impact = risk.initial_impact
        let reviewDate = PROJECT_START
        for (let r = 0; r < reviewCount; r++) {
          reviewDate = addDays(reviewDate, ri(14, 35))
          if (reviewDate > TODAY) break
          const delta = trajectory === 'improving' ? -1 : trajectory === 'worsening' ? 1 : trajectory === 'fluctuating' ? pick([-1, 1]) : 0
          prob = clamp(prob + (chance(0.5) ? delta : 0), 1, 5)
          impact = clamp(impact + (chance(0.5) ? delta : 0), 1, 5)
          const residualProb = clamp(prob - ri(0, 1), 1, 5)
          const residualImpact = clamp(impact - ri(0, 1), 1, 5)
          const trend = delta < 0 ? 'improving' : delta > 0 ? 'worsening' : 'stable'
          assessmentRows.push({
            risk_id: risk.id,
            review_date: reviewDate,
            current_probability: prob,
            current_impact: impact,
            residual_probability: residualProb,
            residual_impact: residualImpact,
            trend,
            reviewer_comment: REVIEW_COMMENTS[trend][ri(0, REVIEW_COMMENTS[trend].length - 1)],
            created_by: userId,
            created_at: new Date(reviewDate).toISOString(),
          })
        }
      }

      const actionCount = ri(1, 4)
      for (let a = 0; a < actionCount; a++) {
        const statusRoll = rand()
        const dueDate = addDays(TODAY, ri(-25, 40))
        const overdue = dueDate < TODAY
        const status = statusRoll < 0.3 ? 'completed' : statusRoll < 0.65 ? 'in_progress' : 'not_started'
        const completion = status === 'completed' ? 100 : status === 'in_progress' ? ri(10, 80) : 0
        actionRows.push({
          risk_id: risk.id,
          description: pick(ACTION_TEMPLATES),
          owner_id: null,
          due_date: dueDate,
          status: overdue && status !== 'completed' ? status : status,
          completion_percentage: completion,
          created_by: userId,
        })
      }
    }

    if (assessmentRows.length > 0) {
      const { error } = await supabase.from('rm_risk_assessments').insert(assessmentRows)
      if (error) throw new Error(error.message)
      reviewCounter += assessmentRows.length
    }
    if (actionRows.length > 0) {
      const { error } = await supabase.from('rm_risk_actions').insert(actionRows)
      if (error) throw new Error(error.message)
      actionCounter += actionRows.length
    }
  }

  onProgress?.('اتمام')
  return {
    portfolios: PORTFOLIO_DEFS.length,
    programs: PROGRAM_DEFS.length,
    projects: PROJECT_DEFS.length,
    risks: riskCounter,
    reviews: reviewCounter,
    actions: actionCounter,
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function buildRiskRow(rmProjectId: string, title: string, description: string, category: RmRiskCategory, riskType: RmRiskType): Record<string, unknown> {
  const probability = ri(1, 5)
  const impact = ri(1, 5)
  const score = probability * impact
  const strategies = strategiesForRiskType(riskType)
  const responseStrategy: RmResponseStrategy = pick(strategies)

  const statusRoll = rand()
  const status = statusRoll < 0.15 ? 'closed' : statusRoll < 0.3 ? 'escalated' : statusRoll < 0.55 ? 'monitoring' : 'open'

  const escalationRoll = rand()
  const escalationStatus = score >= 16 && escalationRoll < 0.5 ? (escalationRoll < 0.2 ? 'decided' : escalationRoll < 0.35 ? 'escalated' : 'recommended') : 'none'

  const identifiedDate = addDays(PROJECT_START, ri(0, 200))

  return {
    project_id: rmProjectId,
    title,
    description: description || `${title} — بررسی و پایش این ریسک در طول اجرای پروژه ادامه دارد.`,
    category,
    risk_type: riskType,
    owner_id: null,
    identified_date: identifiedDate,
    status,
    response_strategy: responseStrategy,
    strategy_details: {},
    project_phase: pick(['engineering', 'procurement', 'construction', 'commissioning']),
    time_to_impact_days: chance(0.2) ? ri(1, 30) : null,
    initial_probability: probability,
    initial_impact: impact,
    escalation_level: escalationStatus !== 'none' ? pick(['project_team', 'project_manager', 'management']) : null,
    escalated_to: escalationStatus !== 'none' ? pick(PROJECT_MANAGERS) : '',
    escalation_reason: escalationStatus !== 'none' ? 'امتیاز ریسک بالاتر از آستانه توجه مدیریت است' : '',
    escalation_date: escalationStatus !== 'none' ? addDays(identifiedDate, ri(5, 60)) : null,
    required_decision: escalationStatus !== 'none' ? 'تصمیم برای تخصیص منابع اضافی یا تغییر استراتژی پاسخ' : '',
    escalation_decision: escalationStatus === 'decided' ? 'تایید تخصیص منابع اضافی و پیگیری فشرده' : '',
    escalation_decision_date: escalationStatus === 'decided' ? addDays(identifiedDate, ri(20, 70)) : null,
    escalation_status: escalationStatus,
    created_by: null,
  }
}

const REVIEW_COMMENTS: Record<string, string[]> = {
  improving: ['اقدامات کنترلی موثر بوده و ریسک رو به کاهش است', 'با پیگیری مستمر، وضعیت بهبود یافت'],
  worsening: ['شرایط نسبت به بازبینی قبل بدتر شده است', 'اقدامات کنترلی کافی نبوده و ریسک افزایش یافت'],
  stable: ['وضعیت نسبت به بازبینی قبل بدون تغییر محسوس است', 'ریسک در محدوده قابل‌قبول باقی مانده است'],
}

const ACTION_TEMPLATES = [
  'پیگیری روزانه با فروشنده/پیمانکار',
  'برگزاری جلسه هماهنگی با ذی‌نفعان',
  'تهیه برنامه اقتضایی جایگزین',
  'بازرسی میدانی و تهیه گزارش وضعیت',
  'تسریع فرآیند اخذ مجوز از مرجع ذی‌ربط',
  'بازنگری برنامه زمان‌بندی فعالیت‌های مرتبط',
  'تامین منبع مالی یا انسانی اضافی',
  'تهیه گزارش ارزیابی ریسک به‌روزشده',
]
