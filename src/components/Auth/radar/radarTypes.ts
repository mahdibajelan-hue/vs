/**
 * Project Radar — Phase 1 (visual + interaction build). Mock data only: every number here is
 * generated client-side, deterministically seeded off the selected project so switching projects
 * visibly changes the picture without needing a backend yet. Wiring this to live risk/issue/
 * finance/PLC data is a separate, later change (see the shape of RadarData below — it's already
 * the exact contract a real data-adapter would need to fill).
 */

export type SignalCategory = 'risk' | 'issue' | 'delay' | 'change' | 'milestone' | 'contract' | 'gate'
export type SignalSeverity = 'critical' | 'high' | 'medium' | 'low'
export type ProjectRadarStatus = 'nominal' | 'attention' | 'at_risk' | 'critical'

export interface RadarSignal {
  id: string
  category: SignalCategory
  severity: SignalSeverity
  title: string
  subject: string
  detail: string
  impact: string
  rootCause: string
  recommendedAction: string
  /** Compass degrees, 0 = top, clockwise. */
  angle: number
  /** 0-1 fraction of the radar radius; lower = closer to center = more urgent. */
  radius: number
}

export const SIGNAL_CATEGORY_LABEL_FA: Record<SignalCategory, string> = {
  risk: 'ریسک',
  issue: 'مسئله',
  delay: 'تاخیر',
  change: 'تغییر',
  milestone: 'نقطه عطف',
  contract: 'قرارداد',
  gate: 'گیت',
}

export const SEVERITY_LABEL_FA: Record<SignalSeverity, string> = {
  critical: 'بحرانی',
  high: 'بالا',
  medium: 'متوسط',
  low: 'کم',
}

export const SEVERITY_COLOR: Record<SignalSeverity, string> = {
  critical: '#ef4444',
  high: '#f0a836',
  medium: '#eab308',
  low: '#38bdf8',
}

export interface RadarKpi {
  health: number
  progressPlanned: number
  progressActual: number
  cpi: number
  spi: number
  activeRisks: number
  activeRisksHigh: number
  openIssues: number
  openIssuesHigh: number
  delayedActivities: number
  pendingChanges: number
  upcomingMilestones: number
}

export type StageState = 'done' | 'current' | 'upcoming'

export interface RadarLifecycleStage {
  key: string
  label: string
  labelEn: string
  state: StageState
}

/** The 9-stage sequence from the Project Radar brief — a display-level concept for this hero
 * screen, distinct from PLC's own 11-stage engine (idea..lessons_learned). Reconciling the two
 * is part of the later real-integration pass, not this mock phase. */
const STAGE_DEFS: { key: string; label: string; labelEn: string }[] = [
  { key: 'concept', label: 'ایده', labelEn: 'Concept' },
  { key: 'feasibility', label: 'امکان‌سنجی', labelEn: 'Feasibility' },
  { key: 'feed', label: 'FEED', labelEn: 'FEED' },
  { key: 'design', label: 'طراحی', labelEn: 'Design' },
  { key: 'tender', label: 'مناقصه', labelEn: 'Tender' },
  { key: 'epc', label: 'EPC', labelEn: 'EPC' },
  { key: 'commissioning', label: 'راه‌اندازی', labelEn: 'Commissioning' },
  { key: 'handover', label: 'تحویل', labelEn: 'Handover' },
  { key: 'closeout', label: 'اختتام', labelEn: 'Closeout' },
]

export interface RadarGate {
  name: string
  prerequisites: number
  passed: number
  pending: number
  failed: number
  readinessPct: number
}

export interface EpcDimension {
  key: 'engineering' | 'procurement' | 'construction'
  label: string
  labelEn: string
  pct: number
}

export interface ContractSummary {
  currency: string
  contractValue: number
  approvedChanges: number
  claims: number
  eotClaimsDays: number
  paid: number
  paidPct: number
  retention: number
}

export interface RadarData {
  projectName: string
  projectIdCode: string
  reportDateFa: string
  status: ProjectRadarStatus
  kpi: RadarKpi
  signals: RadarSignal[]
  lifecycle: RadarLifecycleStage[]
  currentStageLabel: string
  nextGate: RadarGate
  epc: EpcDimension[] | null
  contract: ContractSummary
}

export const STATUS_LABEL_FA: Record<ProjectRadarStatus, string> = {
  nominal: 'عادی',
  attention: 'نیازمند توجه',
  at_risk: 'در معرض خطر',
  critical: 'بحرانی',
}

export const STATUS_COLOR: Record<ProjectRadarStatus, string> = {
  nominal: '#22ff9e',
  attention: '#eab308',
  at_risk: '#f0a836',
  critical: '#ef4444',
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

export function toFa(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)])
}

export function faMoney(n: number): string {
  return toFa(n.toLocaleString('en-US'))
}

/** Tiny seeded PRNG (mulberry32) so a given project id always produces the same "mock live" numbers. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SIGNAL_TEMPLATES: Omit<RadarSignal, 'id' | 'angle' | 'radius'>[] = [
  {
    category: 'risk', severity: 'critical', title: 'تاخیر تدارکات', subject: 'بسته کمپرسور CP-04', detail: '+۱۸ روز',
    impact: 'شروع عملیات ساخت را به تعویق می‌اندازد', rootCause: 'تاخیر تامین‌کننده در تحویل مواد اولیه',
    recommendedAction: 'پیگیری فوری با تامین‌کننده و بررسی گزینه Expedite',
  },
  {
    category: 'issue', severity: 'high', title: 'مدارک IFC مهندسی عقب‌افتاده', subject: '۱۲ مدرک', detail: '۱۲ مدرک',
    impact: 'شروع ساخت اسکلت فلزی را مسدود می‌کند', rootCause: 'بار کاری بالای تیم مهندسی در این هفته',
    recommendedAction: 'تخصیص منابع اضافی به تیم مهندسی برای تکمیل مدارک',
  },
  {
    category: 'change', severity: 'high', title: 'ادعای تمدید زمان پیمانکار', subject: 'EOT Claim', detail: '+۲۱ روز',
    impact: 'در صورت تایید، تاریخ خاتمه قرارداد را جابجا می‌کند', rootCause: 'تاخیرهای غیرمترقبه گزارش‌شده توسط پیمانکار',
    recommendedAction: 'بررسی مستندات ادعا توسط واحد کنترل قرارداد',
  },
  {
    category: 'delay', severity: 'medium', title: 'کسری متریال', subject: 'اسپول لوله', detail: '۳ نوع کالا',
    impact: 'ریسک توقف فعالیت‌های نصب در دو هفته آینده', rootCause: 'عدم تطابق MTO با موجودی انبار',
    recommendedAction: 'خرید اضطراری یا جابجایی موجودی از پروژه‌های دیگر',
  },
  {
    category: 'delay', severity: 'medium', title: 'بهره‌وری اجرا', subject: 'فعالیت‌های ساخت', detail: '−۱۵٪',
    impact: 'روند تکمیل فعالیت‌های بحرانی را کند می‌کند', rootCause: 'کمبود نیروی ماهر در سایت',
    recommendedAction: 'بازنگری برنامه نیروی انسانی با پیمانکار اجرایی',
  },
  {
    category: 'gate', severity: 'medium', title: 'گیت طراحی', subject: 'Design Freeze', detail: '۶۷٪ آماده',
    impact: 'ورود به مرحله تدارکات را مشروط می‌کند', rootCause: '۲ پیش‌نیاز هنوز تایید نشده',
    recommendedAction: 'پیگیری تایید نهایی مدارک باقی‌مانده گیت',
  },
  {
    category: 'milestone', severity: 'low', title: 'نقطه عطف پیش‌رو', subject: 'تکمیل مکانیکی فاز ۱', detail: '۳۰ روز مانده',
    impact: 'نقطه کنترلی کلیدی برای گزارش پیشرفت پروژه', rootCause: '—',
    recommendedAction: 'آماده‌سازی مستندات پیش از موعد مقرر',
  },
  {
    category: 'contract', severity: 'low', title: 'وضعیت صورت‌وضعیت', subject: 'IPC شماره ۱۴', detail: 'در انتظار تایید',
    impact: 'تاخیر احتمالی در جریان نقدی پیمانکار', rootCause: 'در صف بررسی مالی',
    recommendedAction: 'پیگیری تایید نزد واحد مالی',
  },
  {
    category: 'issue', severity: 'medium', title: 'عدم انطباق کیفی', subject: 'بازرسی جوش خط ۰۸', detail: '۴ مورد NCR',
    impact: 'نیازمند تعمیر پیش از تست هیدرواستاتیک', rootCause: 'انحراف از رویه جوشکاری تاییدشده',
    recommendedAction: 'بازآموزی جوشکار و تعمیر مطابق NCR',
  },
]

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length]
}

/** Deterministic mock generator: `seed` is any stable string (project id, or a fixed default key
 * for the "no project selected yet" state) so the same input always renders the same radar. */
export function buildMockRadarData(seed: string, projectName: string, projectIdCode: string): RadarData {
  const rand = seededRandom(seed)
  const statusRoll = rand()
  const status: ProjectRadarStatus = statusRoll < 0.15 ? 'nominal' : statusRoll < 0.55 ? 'attention' : statusRoll < 0.85 ? 'at_risk' : 'critical'

  const health = Math.round(55 + rand() * 40)
  const progressPlanned = Math.round(60 + rand() * 25)
  const progressActual = Math.max(20, progressPlanned - Math.round(rand() * 15))
  const cpi = Math.round((0.85 + rand() * 0.25) * 100) / 100
  const spi = Math.round((0.75 + rand() * 0.25) * 100) / 100

  const signalCount = 6 + Math.floor(rand() * 6)
  const signals: RadarSignal[] = Array.from({ length: signalCount }, (_, i) => {
    const template = pick(SIGNAL_TEMPLATES, Math.floor(rand() * SIGNAL_TEMPLATES.length) + i)
    const severityRoll = rand()
    const severity: SignalSeverity = severityRoll < 0.15 ? 'critical' : severityRoll < 0.4 ? 'high' : severityRoll < 0.75 ? 'medium' : 'low'
    const radiusBySeverity: Record<SignalSeverity, [number, number]> = {
      critical: [0.16, 0.34], high: [0.34, 0.56], medium: [0.56, 0.76], low: [0.76, 0.92],
    }
    const [rMin, rMax] = radiusBySeverity[severity]
    return {
      ...template,
      id: `sig-${i}`,
      severity,
      angle: Math.round(rand() * 360),
      radius: rMin + rand() * (rMax - rMin),
    }
  })

  const currentStageIndex = Math.min(8, Math.floor(rand() * 6) + 2)
  const lifecycle: RadarLifecycleStage[] = STAGE_DEFS.map((s, i) => ({
    ...s,
    state: i < currentStageIndex ? 'done' : i === currentStageIndex ? 'current' : 'upcoming',
  }))
  const currentStageKey = STAGE_DEFS[currentStageIndex].key

  const passed = 4 + Math.floor(rand() * 8)
  const pending = 1 + Math.floor(rand() * 3)
  const failed = Math.floor(rand() * 3)
  const prerequisites = passed + pending + failed

  const epc: EpcDimension[] | null = currentStageKey === 'epc' || currentStageKey === 'commissioning'
    ? [
        { key: 'engineering', label: 'مهندسی', labelEn: 'Engineering', pct: Math.round(50 + rand() * 45) },
        { key: 'procurement', label: 'تدارکات', labelEn: 'Procurement', pct: Math.round(25 + rand() * 45) },
        { key: 'construction', label: 'ساخت', labelEn: 'Construction', pct: Math.round(5 + rand() * 40) },
      ]
    : null

  const contractValue = Math.round((30 + rand() * 60) * 10) / 10
  const paidPct = Math.round(25 + rand() * 55)

  return {
    projectName,
    projectIdCode,
    reportDateFa: '۱۴۰۳/۰۲/۲۸ - ۱۰:۳۰',
    status,
    kpi: {
      health,
      progressPlanned,
      progressActual,
      cpi,
      spi,
      activeRisks: 6 + Math.floor(rand() * 10),
      activeRisksHigh: 1 + Math.floor(rand() * 5),
      openIssues: 3 + Math.floor(rand() * 8),
      openIssuesHigh: Math.floor(rand() * 3),
      delayedActivities: 5 + Math.floor(rand() * 18),
      pendingChanges: Math.floor(rand() * 8),
      upcomingMilestones: 1 + Math.floor(rand() * 5),
    },
    signals,
    lifecycle,
    currentStageLabel: STAGE_DEFS[currentStageIndex].label,
    nextGate: {
      name: 'انجماد طراحی (Design Freeze)',
      prerequisites,
      passed,
      pending,
      failed,
      readinessPct: Math.round((passed / Math.max(1, prerequisites)) * 100),
    },
    epc,
    contract: {
      currency: '€',
      contractValue,
      approvedChanges: Math.round(contractValue * 0.04 * 10) / 10,
      claims: Math.round(contractValue * 0.07 * 10) / 10,
      eotClaimsDays: 40 + Math.floor(rand() * 120),
      paid: Math.round(contractValue * (paidPct / 100) * 10) / 10,
      paidPct,
      retention: Math.round(contractValue * 0.03 * 10) / 10,
    },
  }
}

/** The exact reference scenario used when no real project is selected yet — matches the design
 * brief's own walkthrough numbers 1:1, so first load always looks intentional, not empty. */
export const DEFAULT_RADAR_DATA: RadarData = {
  projectName: 'پالایشگاه گاز ایران',
  projectIdCode: 'IGTP-1402',
  reportDateFa: '۱۴۰۳/۰۲/۲۸ - ۱۰:۳۰',
  status: 'at_risk',
  kpi: {
    health: 78,
    progressPlanned: 72,
    progressActual: 64,
    cpi: 0.92,
    spi: 0.87,
    activeRisks: 12,
    activeRisksHigh: 4,
    openIssues: 7,
    openIssuesHigh: 2,
    delayedActivities: 18,
    pendingChanges: 5,
    upcomingMilestones: 4,
  },
  signals: [
    { id: 'sig-0', category: 'risk', severity: 'critical', title: 'تاخیر تدارکات', subject: 'بسته کمپرسور CP-04', detail: '+۱۸ روز', impact: 'شروع عملیات ساخت را به تعویق می‌اندازد', rootCause: 'تاخیر تامین‌کننده در تحویل مواد اولیه', recommendedAction: 'پیگیری فوری با تامین‌کننده و بررسی گزینه Expedite', angle: 95, radius: 0.28 },
    { id: 'sig-1', category: 'issue', severity: 'high', title: 'مدارک IFC مهندسی عقب‌افتاده', subject: '۱۲ مدرک', detail: '۱۲ مدرک', impact: 'شروع ساخت اسکلت فلزی را مسدود می‌کند', rootCause: 'بار کاری بالای تیم مهندسی در این هفته', recommendedAction: 'تخصیص منابع اضافی به تیم مهندسی برای تکمیل مدارک', angle: 20, radius: 0.42 },
    { id: 'sig-2', category: 'change', severity: 'high', title: 'ادعای تمدید زمان پیمانکار', subject: 'EOT Claim', detail: '+۲۱ روز', impact: 'در صورت تایید، تاریخ خاتمه قرارداد را جابجا می‌کند', rootCause: 'تاخیرهای غیرمترقبه گزارش‌شده توسط پیمانکار', recommendedAction: 'بررسی مستندات ادعا توسط واحد کنترل قرارداد', angle: 130, radius: 0.5 },
    { id: 'sig-3', category: 'delay', severity: 'medium', title: 'کسری متریال', subject: 'اسپول لوله', detail: '۳ نوع کالا', impact: 'ریسک توقف فعالیت‌های نصب در دو هفته آینده', rootCause: 'عدم تطابق MTO با موجودی انبار', recommendedAction: 'خرید اضطراری یا جابجایی موجودی از پروژه‌های دیگر', angle: 205, radius: 0.62 },
    { id: 'sig-4', category: 'delay', severity: 'medium', title: 'بهره‌وری اجرا', subject: 'فعالیت‌های ساخت', detail: '−۱۵٪', impact: 'روند تکمیل فعالیت‌های بحرانی را کند می‌کند', rootCause: 'کمبود نیروی ماهر در سایت', recommendedAction: 'بازنگری برنامه نیروی انسانی با پیمانکار اجرایی', angle: 155, radius: 0.7 },
    { id: 'sig-5', category: 'gate', severity: 'medium', title: 'گیت طراحی', subject: 'Design Freeze', detail: '۶۷٪ آماده', impact: 'ورود به مرحله تدارکات را مشروط می‌کند', rootCause: '۲ پیش‌نیاز هنوز تایید نشده', recommendedAction: 'پیگیری تایید نهایی مدارک باقی‌مانده گیت', angle: 75, radius: 0.58 },
    { id: 'sig-6', category: 'milestone', severity: 'low', title: 'نقطه عطف پیش‌رو', subject: 'تکمیل مکانیکی فاز ۱', detail: '۳۰ روز مانده', impact: 'نقطه کنترلی کلیدی برای گزارش پیشرفت پروژه', rootCause: '—', recommendedAction: 'آماده‌سازی مستندات پیش از موعد مقرر', angle: 300, radius: 0.85 },
    { id: 'sig-7', category: 'contract', severity: 'low', title: 'وضعیت صورت‌وضعیت', subject: 'IPC شماره ۱۴', detail: 'در انتظار تایید', impact: 'تاخیر احتمالی در جریان نقدی پیمانکار', rootCause: 'در صف بررسی مالی', recommendedAction: 'پیگیری تایید نزد واحد مالی', angle: 250, radius: 0.8 },
    { id: 'sig-8', category: 'issue', severity: 'high', title: 'عدم انطباق کیفی', subject: 'بازرسی جوش خط ۰۸', detail: '۴ مورد NCR', impact: 'نیازمند تعمیر پیش از تست هیدرواستاتیک', rootCause: 'انحراف از رویه جوشکاری تاییدشده', recommendedAction: 'بازآموزی جوشکار و تعمیر مطابق NCR', angle: 335, radius: 0.38 },
  ],
  lifecycle: STAGE_DEFS.map((s, i) => ({ ...s, state: i < 5 ? 'done' : i === 5 ? 'current' : 'upcoming' })),
  currentStageLabel: 'EPC',
  nextGate: { name: 'انجماد طراحی (Design Freeze)', prerequisites: 12, passed: 8, pending: 2, failed: 2, readinessPct: 67 },
  epc: [
    { key: 'engineering', label: 'مهندسی', labelEn: 'Engineering', pct: 62 },
    { key: 'procurement', label: 'تدارکات', labelEn: 'Procurement', pct: 41 },
    { key: 'construction', label: 'ساخت', labelEn: 'Construction', pct: 18 },
  ],
  contract: { currency: '€', contractValue: 48.2, approvedChanges: 2.1, claims: 3.4, eotClaimsDays: 127, paid: 21.6, paidPct: 44, retention: 1.8 },
}
