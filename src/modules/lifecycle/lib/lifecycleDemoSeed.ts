import { supabase } from '../../../lib/supabaseClient'
import { DEFAULT_STAGE_ORDER, type StageKey } from '../types'
import { DEFAULT_TEMPLATE_STAGES } from './templates'

/**
 * Lifecycle demo data.
 *
 * Deliberately does NOT create portfolios/plans/projects: the masterdata module's own demo seed
 * already builds that hierarchy (4 portfolios / 8 plans / 16 projects), and a second generator
 * inventing its own would be exactly the duplication the audit set out to avoid. This attaches a
 * lifecycle to the master projects that already exist, spreading them across stages and health
 * states so every dashboard has something real to show.
 */

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
let rand = mulberry32(20260822)
const ri = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
const chance = (p: number) => rand() < p
function pick<T>(arr: T[]): T { return arr[ri(0, arr.length - 1)] }

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const TODAY = new Date().toISOString().slice(0, 10)

export interface LifecycleSeedProgress { (message: string): void }

export interface LifecycleSeedCounts {
  projects: number
  stages: number
  gates: number
  checklistItems: number
  milestones: number
  forecastPoints: number
  actions: number
}

/** Ten scenarios matching the spec's §24 request — one project per lifecycle position, plus
 * explicit delayed / at-risk / on-track / blocked cases so every dashboard state is reachable. */
const SCENARIOS: {
  stage: StageKey
  label: string
  /** How far through the current stage's checklist the project is. */
  completion: number
  /** Milestone slip pattern in days; a growing series produces drift warnings. */
  drift: number[]
  criticalDelayed: boolean
  blocked?: boolean
}[] = [
  { stage: 'pre_project', label: 'در مرحله پیش‌پروژه', completion: 0.45, drift: [], criticalDelayed: false },
  { stage: 'planning', label: 'در حال برنامه‌ریزی', completion: 0.7, drift: [0, 2], criticalDelayed: false },
  { stage: 'engineering', label: 'مهندسی', completion: 0.6, drift: [3, 5], criticalDelayed: false },
  { stage: 'procurement', label: 'تدارکات', completion: 0.5, drift: [5, 8, 12, 17], criticalDelayed: true },
  { stage: 'execution', label: 'اجرا', completion: 0.55, drift: [2, 4], criticalDelayed: false },
  { stage: 'commissioning', label: 'راه‌اندازی', completion: 0.85, drift: [1], criticalDelayed: false },
  { stage: 'execution', label: 'تأخیرکرده', completion: 0.35, drift: [8, 15, 24, 33], criticalDelayed: true },
  { stage: 'engineering', label: 'در معرض ریسک', completion: 0.5, drift: [4, 7, 11], criticalDelayed: false },
  { stage: 'execution', label: 'در مسیر', completion: 0.9, drift: [0], criticalDelayed: false },
  { stage: 'close_out', label: 'اختتام', completion: 0.95, drift: [], criticalDelayed: false },
  { stage: 'initiation', label: 'آغازین — مسدود', completion: 0.3, drift: [], criticalDelayed: false, blocked: true },
]

const MILESTONE_TEMPLATES: Record<string, { name: string; type: string; critical: boolean }[]> = {
  pre_project: [
    { name: 'تصویب Business Case', type: 'gate', critical: true },
    { name: 'تخصیص اعتبار اولیه', type: 'regulatory', critical: true },
  ],
  initiation: [
    { name: 'ابلاغ قرارداد', type: 'contractual', critical: true },
    { name: 'جلسه Kick-off', type: 'project', critical: false },
  ],
  planning: [
    { name: 'تثبیت Baseline زمان‌بندی', type: 'gate', critical: true },
    { name: 'تصویب برنامه HSE', type: 'project', critical: false },
  ],
  engineering: [
    { name: 'اتمام مهندسی پایه', type: 'gate', critical: true },
    { name: 'برگزاری HAZOP', type: 'regulatory', critical: false },
    { name: 'صدور مدارک IFC', type: 'project', critical: true },
  ],
  procurement: [
    { name: 'سفارش لوله فولادی', type: 'contractual', critical: true },
    { name: 'سفارش کمپرسور (Long Lead)', type: 'contractual', critical: true },
    { name: 'تحویل شیرآلات در سایت', type: 'project', critical: false },
  ],
  execution: [
    { name: 'بسیج کارگاه', type: 'project', critical: false },
    { name: 'اتمام ۵۰٪ عملیات خطی', type: 'payment', critical: false },
    { name: 'تکمیل مکانیکی', type: 'gate', critical: true },
  ],
  commissioning: [
    { name: 'تست هیدرواستاتیک', type: 'project', critical: true },
    { name: 'تست عملکرد', type: 'gate', critical: true },
  ],
  handover: [{ name: 'تحویل موقت', type: 'contractual', critical: true }],
  close_out: [{ name: 'تسویه نهایی', type: 'payment', critical: false }],
}

const ACTION_TEMPLATES = [
  { title: 'پیگیری تأییدیه فروشنده کمپرسور', priority: 'critical' },
  { title: 'تکمیل مطالعات ژئوتکنیک نقاط تقاطع', priority: 'high' },
  { title: 'به‌روزرسانی برنامه جبرانی زمان‌بندی', priority: 'high' },
  { title: 'رفع نواقص Punch List بخش شمالی', priority: 'medium' },
  { title: 'اخذ مجوز عبور از اراضی ملی', priority: 'critical' },
  { title: 'برگزاری جلسه بازنگری ریسک', priority: 'medium' },
]

export async function seedLifecycleDemoData(onProgress?: LifecycleSeedProgress): Promise<LifecycleSeedCounts> {
  rand = mulberry32(20260822)
  const counts: LifecycleSeedCounts = {
    projects: 0, stages: 0, gates: 0, checklistItems: 0, milestones: 0, forecastPoints: 0, actions: 0,
  }

  onProgress?.('خواندن پروژه‌های داده پایه...')
  const { data: projectRows } = await supabase
    .from('master_projects').select('id, official_name').order('created_at').limit(12)
  const projects = (projectRows ?? []) as { id: string; official_name: string }[]
  if (projects.length === 0) {
    throw new Error('پروژه‌ای در داده پایه یافت نشد — ابتدا داده نمونه ماژول داده پایه را ایجاد کنید.')
  }

  onProgress?.('اطمینان از وجود قالب چرخه عمر...')
  const { data: tplRow } = await supabase.from('plc_templates').select('id').eq('is_default', true).maybeSingle()
  const templateId = tplRow?.id ?? null

  for (const [i, project] of projects.entries()) {
    const scenario = SCENARIOS[i % SCENARIOS.length]
    onProgress?.(`ایجاد چرخه عمر: ${project.official_name}`)

    const currentIndex = DEFAULT_STAGE_ORDER.indexOf(scenario.stage)
    const stageEntered = addDays(TODAY, -ri(20, 120))

    await supabase.from('plc_project_lifecycle').upsert({
      project_id: project.id,
      template_id: templateId,
      current_stage_key: scenario.stage,
      stage_entered_at: stageEntered,
    }, { onConflict: 'project_id' })
    counts.projects++

    /* Stages — everything before the current one is completed, the current one in progress. */
    for (const [si, seed] of DEFAULT_TEMPLATE_STAGES.entries()) {
      const isPast = si < currentIndex
      const isCurrent = si === currentIndex
      const plannedStart = addDays(stageEntered, (si - currentIndex) * 45)
      await supabase.from('plc_project_stages').upsert({
        project_id: project.id,
        stage_key: seed.stageKey,
        name_fa: seed.nameFa,
        sequence: si,
        status: isPast ? 'completed' : isCurrent ? 'in_progress' : 'not_started',
        planned_start: plannedStart,
        planned_finish: addDays(plannedStart, (seed.typicalDurationMonths ?? 2) * 30),
        actual_start: isPast || isCurrent ? plannedStart : null,
        actual_finish: isPast ? addDays(plannedStart, (seed.typicalDurationMonths ?? 2) * 30) : null,
        progress: isPast ? 100 : isCurrent ? Math.round(scenario.completion * 100) : 0,
      }, { onConflict: 'project_id,stage_key' })
      counts.stages++

      /* Gates */
      if (seed.gateName) {
        await supabase.from('plc_project_gates').upsert({
          project_id: project.id,
          stage_key: seed.stageKey,
          name: seed.gateName,
          readiness_threshold: seed.gateReadinessThreshold,
          status: isPast ? 'approved' : isCurrent ? (scenario.blocked ? 'blocked' : 'in_progress') : 'not_started',
          approval_date: isPast ? addDays(plannedStart, (seed.typicalDurationMonths ?? 2) * 30) : null,
          comments: scenario.blocked && isCurrent ? 'مجوز محیط‌زیست دریافت نشده است' : '',
        }, { onConflict: 'project_id,stage_key' })
        counts.gates++
      }

      /* Checklist — past stages fully done, current stage partially, future untouched. */
      const rows = seed.checklist.map((c, ci) => {
        const ratio = isPast ? 1 : isCurrent ? scenario.completion : 0
        const done = ci / Math.max(1, seed.checklist.length) < ratio
        const overdue = isCurrent && !done && c.isMandatory && chance(0.3)
        return {
          project_id: project.id,
          stage_key: seed.stageKey,
          category: c.category,
          title: c.title,
          is_mandatory: c.isMandatory,
          requires_document: !!c.requiresDocument,
          requires_approval: !!c.requiresApproval,
          guidance: c.guidance ?? '',
          sequence: ci,
          status: done ? 'completed' : isCurrent && chance(0.35) ? 'in_progress' : 'not_started',
          completion_date: done ? addDays(plannedStart, ri(5, 40)) : null,
          due_date: isCurrent ? addDays(TODAY, overdue ? -ri(3, 25) : ri(5, 60)) : null,
          evidence_url: done && c.requiresDocument ? 'https://example.internal/doc' : '',
          evidence_label: done && c.requiresDocument ? 'مدرک پیوست' : '',
        }
      })
      if (rows.length > 0) {
        await supabase.from('plc_checklist_items').insert(rows)
        counts.checklistItems += rows.length
      }
    }

    /* Milestones for every stage up to and including the current one. */
    for (let si = 0; si <= currentIndex; si++) {
      const stageKey = DEFAULT_STAGE_ORDER[si]
      const templates = MILESTONE_TEMPLATES[stageKey] ?? []
      const isPastStage = si < currentIndex

      for (const t of templates) {
        const baseline = addDays(stageEntered, (si - currentIndex) * 45 + ri(10, 40))
        // A past stage's milestones are achieved; the current stage's carry the scenario's slip.
        const slip = isPastStage ? ri(-3, 4) : (scenario.drift[scenario.drift.length - 1] ?? ri(-2, 6))
        const isCriticalDelay = !isPastStage && t.critical && scenario.criticalDelayed
        const forecast = addDays(baseline, isCriticalDelay ? slip : Math.max(0, slip))
        const achieved = isPastStage || (!isCriticalDelay && chance(0.25))

        const { data: msRow } = await supabase.from('plc_milestones').insert({
          project_id: project.id,
          name: t.name,
          milestone_type: t.type,
          stage_key: stageKey,
          baseline_date: baseline,
          forecast_date: forecast,
          actual_date: achieved ? addDays(baseline, ri(-2, 5)) : null,
          is_critical: t.critical,
          status: achieved ? 'achieved' : isCriticalDelay ? 'delayed' : slip > 0 ? 'at_risk' : 'on_track',
          comments: isCriticalDelay ? 'تأخیر ناشی از عدم تأیید به‌موقع فروشنده' : '',
        }).select('id').single()
        counts.milestones++

        /* Forecast history — this is what makes the drift warning fire on the "delayed" and
         * "at risk" scenarios rather than just showing a static variance. */
        if (msRow && !achieved && scenario.drift.length > 0) {
          const points = scenario.drift.map((d, di) => ({
            milestone_id: msRow.id,
            forecast_date: addDays(baseline, d),
            variance_days: d,
            note: di === 0 ? 'ثبت اولیه پیش‌بینی' : 'به‌روزرسانی دوره‌ای',
            recorded_at: new Date(Date.parse(addDays(TODAY, -(scenario.drift.length - di) * 21))).toISOString(),
          }))
          await supabase.from('plc_milestone_forecast_history').insert(points)
          counts.forecastPoints += points.length
        }
      }
    }

    /* Actions — some overdue, some critical, so the action KPIs are non-trivial. */
    const actionCount = ri(2, 5)
    for (let a = 0; a < actionCount; a++) {
      const t = pick(ACTION_TEMPLATES)
      const overdue = chance(0.4)
      await supabase.from('rasta_actions').insert({
        master_project_id: project.id,
        title: t.title,
        priority: t.priority,
        source: 'lifecycle',
        due_date: addDays(TODAY, overdue ? -ri(2, 30) : ri(5, 45)),
        status: chance(0.3) ? 'completed' : chance(0.5) ? 'in_progress' : 'not_started',
        completion_pct: ri(0, 80),
      })
      counts.actions++
    }

    /* Health rows for the dimensions the engine cannot derive yet. */
    const manualDims = ['cost', 'quality', 'hse', 'contract', 'cashflow'] as const
    await supabase.from('plc_health_scores').upsert(
      manualDims.map((d) => {
        const score = scenario.criticalDelayed ? ri(45, 70) : scenario.blocked ? ri(30, 55) : ri(70, 96)
        return {
          project_id: project.id,
          dimension: d,
          score,
          status: score >= 80 ? 'green' : score >= 60 ? 'yellow' : 'red',
          trend: chance(0.3) ? 'worsening' : chance(0.5) ? 'flat' : 'improving',
          explanation: score >= 80 ? 'در محدوده قابل قبول' : score >= 60 ? 'نیازمند پایش' : 'خارج از محدوده مجاز',
        }
      }),
      { onConflict: 'project_id,dimension' },
    )
  }

  onProgress?.('اتمام ایجاد داده نمونه چرخه عمر')
  return counts
}

/**
 * Removes every lifecycle row (leaves the master hierarchy and other modules untouched).
 *
 * Ordered child-before-parent so foreign keys never block a delete, and each table is filtered on
 * a timestamp column it actually has — three of them use recorded_at/changed_at/updated_at rather
 * than created_at, and a filter naming a missing column silently deletes nothing.
 */
export async function wipeLifecycleDemoData(onProgress?: LifecycleSeedProgress): Promise<void> {
  const tables: { name: string; tsColumn: string }[] = [
    { name: 'plc_milestone_forecast_history', tsColumn: 'recorded_at' },
    { name: 'plc_early_warnings', tsColumn: 'created_at' },
    { name: 'plc_audit_log', tsColumn: 'changed_at' },
    { name: 'plc_health_scores', tsColumn: 'updated_at' },
    { name: 'plc_milestones', tsColumn: 'created_at' },
    { name: 'plc_activities', tsColumn: 'created_at' },
    { name: 'plc_checklist_items', tsColumn: 'created_at' },
    { name: 'plc_project_gates', tsColumn: 'created_at' },
    { name: 'plc_project_stages', tsColumn: 'created_at' },
    { name: 'plc_project_lifecycle', tsColumn: 'created_at' },
  ]
  for (const t of tables) {
    onProgress?.(`پاک‌سازی ${t.name}...`)
    await supabase.from(t.name).delete().gte(t.tsColumn, '1900-01-01')
  }
  onProgress?.('پاک‌سازی اقدامات چرخه عمر...')
  await supabase.from('rasta_actions').delete().eq('source', 'lifecycle')
}
