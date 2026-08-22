import type { ChecklistCategory, StageKey } from '../types'
import { DEFAULT_STAGE_ORDER, STAGE_LABEL_EN, STAGE_LABEL_FA } from '../types'

/** Lifecycle template engine.
 *
 * A template is data, not code: these constants are only the *seed* an admin's first
 * "create default templates" produces. Once seeded they live in plc_templates /
 * plc_template_stages / plc_template_checklist_items and are edited through the UI, and
 * instantiating a template onto a project COPIES its stages/gates/checklists into the project's
 * own tables — so later template edits never rewrite the governance record of a running project.
 */

export interface TemplateChecklistSeed {
  category: ChecklistCategory
  title: string
  isMandatory: boolean
  requiresDocument?: boolean
  requiresApproval?: boolean
  guidance?: string
}

export interface TemplateStageSeed {
  stageKey: StageKey
  nameFa: string
  nameEn: string
  typicalDurationMonths: number | null
  /** Empty string = this stage has no formal gate (e.g. IDEA, LESSONS LEARNED). */
  gateName: string
  gateReadinessThreshold: number
  checklist: TemplateChecklistSeed[]
}

export interface TemplateSeed {
  name: string
  description: string
  projectType: string
  isDefault: boolean
  stages: TemplateStageSeed[]
}

/* ------------------------------------------------------------------------------------------
 * Pre-project readiness checklist — the six categories from the spec, in full. This is the most
 * detailed checklist in the system on purpose: the whole point of a pre-project gate is that a
 * project cannot be approved on enthusiasm alone.
 * ---------------------------------------------------------------------------------------- */

const PRE_PROJECT_CHECKLIST: TemplateChecklistSeed[] = [
  // Strategic
  { category: 'strategic', title: 'هم‌راستایی راهبردی با اهداف سازمان', isMandatory: true, requiresDocument: true, guidance: 'پروژه باید به یکی از اهداف راهبردی مصوب سبد پروژه‌ها متصل باشد.' },
  { category: 'strategic', title: 'ضرورت و توجیه پروژه', isMandatory: true, requiresDocument: true },
  { category: 'strategic', title: 'Business Case / توجیه اقتصادی', isMandatory: true, requiresDocument: true, requiresApproval: true },
  { category: 'strategic', title: 'اولویت پروژه در سبد', isMandatory: true },
  { category: 'strategic', title: 'در دسترس بودن منابع مالی', isMandatory: true, requiresApproval: true, guidance: 'تأیید تأمین اعتبار — بدون آن، پروژه نباید وارد مرحله آغازین شود.' },
  { category: 'strategic', title: 'بودجه اولیه مصوب', isMandatory: true, requiresDocument: true },
  // Technical
  { category: 'technical', title: 'مطالعات امکان‌سنجی (Feasibility Study)', isMandatory: true, requiresDocument: true },
  { category: 'technical', title: 'محدوده اولیه کار (Initial Scope)', isMandatory: true, requiresDocument: true },
  { category: 'technical', title: 'مطالعات و بازدید سایت', isMandatory: true, requiresDocument: true },
  { category: 'technical', title: 'اطلاعات مهندسی پایه', isMandatory: true, requiresDocument: true },
  { category: 'technical', title: 'انتخاب تکنولوژی', isMandatory: true, requiresApproval: true },
  { category: 'technical', title: 'برآورد اولیه مدت اجرا', isMandatory: true },
  { category: 'technical', title: 'برآورد اولیه هزینه', isMandatory: true, requiresDocument: true, guidance: 'می‌تواند از ماژول «برآورد هزینه پروژه» تولید و پیوست شود.' },
  // Commercial
  { category: 'commercial', title: 'استراتژی قرارداد', isMandatory: true, requiresApproval: true },
  { category: 'commercial', title: 'استراتژی اجرا', isMandatory: true, requiresApproval: true },
  { category: 'commercial', title: 'استراتژی تدارکات', isMandatory: true },
  { category: 'commercial', title: 'برآورد CAPEX', isMandatory: true, requiresDocument: true },
  { category: 'commercial', title: 'استراتژی تأمین مالی', isMandatory: true, requiresDocument: true },
  // Risk
  { category: 'risk', title: 'ایجاد Risk Register اولیه', isMandatory: true, guidance: 'در ماژول مدیریت ریسک ثبت و به همین پروژه متصل شود.' },
  { category: 'risk', title: 'شناسایی ریسک‌های عمده', isMandatory: true },
  { category: 'risk', title: 'تعیین مالک برای هر ریسک', isMandatory: true },
  { category: 'risk', title: 'برنامه اولیه کاهش ریسک', isMandatory: true },
  // Stakeholder
  { category: 'stakeholder', title: 'تعیین Sponsor پروژه', isMandatory: true },
  { category: 'stakeholder', title: 'تعیین مدیر پروژه', isMandatory: true },
  { category: 'stakeholder', title: 'تعیین مشاور', isMandatory: false },
  { category: 'stakeholder', title: 'شناسایی ذی‌نفعان کلیدی', isMandatory: true, requiresDocument: true },
  { category: 'stakeholder', title: 'شناسایی مراجع و نهادهای صدور مجوز', isMandatory: true },
  { category: 'stakeholder', title: 'فهرست مجوزهای موردنیاز', isMandatory: true, requiresDocument: true },
  // Governance
  { category: 'governance', title: 'منشور پروژه (Project Charter)', isMandatory: true, requiresDocument: true, requiresApproval: true },
  { category: 'governance', title: 'ماتریس RACI', isMandatory: true, requiresDocument: true },
  { category: 'governance', title: 'ساختار گزارش‌دهی', isMandatory: true },
  { category: 'governance', title: 'ماتریس تأییدات (Approval Matrix)', isMandatory: true, requiresApproval: true },
  { category: 'governance', title: 'برنامه ارتباطات', isMandatory: false, requiresDocument: true },
]

const PROCUREMENT_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'general', title: 'تأیید MTO', isMandatory: true, requiresApproval: true },
  { category: 'general', title: 'صدور RFQ', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'ارزیابی فنی پیشنهادها', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'ارزیابی بازرگانی پیشنهادها', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'صدور PO / انعقاد قرارداد', isMandatory: true, requiresDocument: true, requiresApproval: true },
  { category: 'general', title: 'پرداخت پیش‌پرداخت', isMandatory: false },
  { category: 'general', title: 'تأیید نقشه‌های سازنده (Vendor Drawing)', isMandatory: true, requiresApproval: true },
  { category: 'general', title: 'ساخت و تولید', isMandatory: true },
  { category: 'general', title: 'بازرسی', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'صدور Release Note', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'حمل', isMandatory: true },
  { category: 'general', title: 'تحویل در سایت', isMandatory: true, requiresDocument: true },
]

const EXECUTION_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'general', title: 'بسیج و تجهیز کارگاه (Mobilization)', isMandatory: true },
  { category: 'general', title: 'آماده‌سازی سایت', isMandatory: true },
  { category: 'general', title: 'عملیات اجرایی', isMandatory: true },
  { category: 'general', title: 'بازرسی حین اجرا', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'تست‌ها', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'Punch List', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'تکمیل مکانیکی (Mechanical Completion)', isMandatory: true, requiresApproval: true },
]

const ENGINEERING_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'general', title: 'انتخاب مشاور طراح', isMandatory: true, requiresApproval: true },
  { category: 'general', title: 'مهندسی پایه (Basic Design)', isMandatory: true, requiresDocument: true, requiresApproval: true },
  { category: 'general', title: 'مطالعات ژئوتکنیک', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'مسیریابی / Plot Plan', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'HAZOP', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'مهندسی تفصیلی (Detail Design)', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'تأیید مدارک مهندسی توسط کارفرما', isMandatory: true, requiresApproval: true },
]

const PLANNING_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'general', title: 'تدوین WBS', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'برنامه زمان‌بندی Master Plan', isMandatory: true, requiresDocument: true, requiresApproval: true },
  { category: 'general', title: 'تثبیت Baseline زمان‌بندی', isMandatory: true, requiresApproval: true, guidance: 'پس از تثبیت، هر تغییر Baseline باید در Audit Trail ثبت شود.' },
  { category: 'general', title: 'برنامه بودجه و جریان نقدی', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'برنامه مدیریت ریسک', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'برنامه کیفیت (QA/QC Plan)', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'برنامه HSE', isMandatory: true, requiresDocument: true },
]

const INITIATION_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'governance', title: 'ابلاغ رسمی پروژه', isMandatory: true, requiresDocument: true },
  { category: 'governance', title: 'تشکیل تیم پروژه', isMandatory: true },
  { category: 'governance', title: 'تخصیص کد پروژه و ساختار کدینگ', isMandatory: true },
  { category: 'commercial', title: 'انعقاد قرارداد اصلی', isMandatory: true, requiresDocument: true, requiresApproval: true },
  { category: 'governance', title: 'جلسه آغازین (Kick-off Meeting)', isMandatory: true, requiresDocument: true },
]

const COMMISSIONING_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'general', title: 'Pre-Commissioning', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'راه‌اندازی سرد', isMandatory: true },
  { category: 'general', title: 'راه‌اندازی گرم', isMandatory: true },
  { category: 'general', title: 'تست عملکرد (Performance Test)', isMandatory: true, requiresDocument: true, requiresApproval: true },
  { category: 'general', title: 'رفع نواقص Punch List', isMandatory: true },
]

const HANDOVER_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'general', title: 'مدارک As-Built', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'دستورالعمل‌های بهره‌برداری و نگهداری', isMandatory: true, requiresDocument: true },
  { category: 'general', title: 'آموزش بهره‌بردار', isMandatory: true },
  { category: 'general', title: 'تحویل موقت', isMandatory: true, requiresDocument: true, requiresApproval: true },
  { category: 'general', title: 'تحویل انبار و قطعات یدکی', isMandatory: false },
]

const CLOSEOUT_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'commercial', title: 'تسویه مالی نهایی', isMandatory: true, requiresApproval: true },
  { category: 'commercial', title: 'آزادسازی ضمانت‌نامه‌ها', isMandatory: true },
  { category: 'commercial', title: 'تعیین تکلیف کلایم‌ها', isMandatory: true, requiresDocument: true },
  { category: 'governance', title: 'تحویل قطعی', isMandatory: true, requiresDocument: true, requiresApproval: true },
  { category: 'governance', title: 'بستن رسمی پروژه', isMandatory: true, requiresApproval: true },
]

const LESSONS_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'governance', title: 'جلسه جمع‌بندی درس‌آموخته‌ها', isMandatory: true, requiresDocument: true },
  { category: 'governance', title: 'ثبت درس‌آموخته‌ها در پایگاه دانش', isMandatory: true, requiresDocument: true },
  { category: 'governance', title: 'به‌روزرسانی مبانی برآورد بر اساس واقعیت پروژه', isMandatory: false, guidance: 'خروجی این بند مستقیماً مبانی ماژول برآورد هزینه را دقیق‌تر می‌کند.' },
]

const IDEA_CHECKLIST: TemplateChecklistSeed[] = [
  { category: 'strategic', title: 'ثبت ایده و مسئله‌ای که حل می‌کند', isMandatory: true },
  { category: 'strategic', title: 'تعیین حامی اولیه ایده', isMandatory: true },
  { category: 'strategic', title: 'ارزیابی اولیه هم‌راستایی راهبردی', isMandatory: true },
]

/** The out-of-the-box lifecycle: 11 stages, 5 formal gates (matching the spec's examples). */
export const DEFAULT_TEMPLATE_STAGES: TemplateStageSeed[] = [
  { stageKey: 'idea', nameFa: STAGE_LABEL_FA.idea, nameEn: STAGE_LABEL_EN.idea, typicalDurationMonths: 1, gateName: '', gateReadinessThreshold: 100, checklist: IDEA_CHECKLIST },
  { stageKey: 'pre_project', nameFa: STAGE_LABEL_FA.pre_project, nameEn: STAGE_LABEL_EN.pre_project, typicalDurationMonths: 4, gateName: 'Gate 1: تصویب پروژه', gateReadinessThreshold: 100, checklist: PRE_PROJECT_CHECKLIST },
  { stageKey: 'initiation', nameFa: STAGE_LABEL_FA.initiation, nameEn: STAGE_LABEL_EN.initiation, typicalDurationMonths: 2, gateName: 'Gate 2: آمادگی پروژه', gateReadinessThreshold: 100, checklist: INITIATION_CHECKLIST },
  { stageKey: 'planning', nameFa: STAGE_LABEL_FA.planning, nameEn: STAGE_LABEL_EN.planning, typicalDurationMonths: 3, gateName: 'Gate 3: تصویب Baseline', gateReadinessThreshold: 100, checklist: PLANNING_CHECKLIST },
  { stageKey: 'engineering', nameFa: STAGE_LABEL_FA.engineering, nameEn: STAGE_LABEL_EN.engineering, typicalDurationMonths: 8, gateName: '', gateReadinessThreshold: 90, checklist: ENGINEERING_CHECKLIST },
  { stageKey: 'procurement', nameFa: STAGE_LABEL_FA.procurement, nameEn: STAGE_LABEL_EN.procurement, typicalDurationMonths: 10, gateName: '', gateReadinessThreshold: 90, checklist: PROCUREMENT_CHECKLIST },
  { stageKey: 'execution', nameFa: STAGE_LABEL_FA.execution, nameEn: STAGE_LABEL_EN.execution, typicalDurationMonths: 20, gateName: 'Gate 4: تکمیل مکانیکی', gateReadinessThreshold: 100, checklist: EXECUTION_CHECKLIST },
  { stageKey: 'commissioning', nameFa: STAGE_LABEL_FA.commissioning, nameEn: STAGE_LABEL_EN.commissioning, typicalDurationMonths: 3, gateName: 'Gate 5: تحویل', gateReadinessThreshold: 100, checklist: COMMISSIONING_CHECKLIST },
  { stageKey: 'handover', nameFa: STAGE_LABEL_FA.handover, nameEn: STAGE_LABEL_EN.handover, typicalDurationMonths: 2, gateName: '', gateReadinessThreshold: 100, checklist: HANDOVER_CHECKLIST },
  { stageKey: 'close_out', nameFa: STAGE_LABEL_FA.close_out, nameEn: STAGE_LABEL_EN.close_out, typicalDurationMonths: 3, gateName: '', gateReadinessThreshold: 100, checklist: CLOSEOUT_CHECKLIST },
  { stageKey: 'lessons_learned', nameFa: STAGE_LABEL_FA.lessons_learned, nameEn: STAGE_LABEL_EN.lessons_learned, typicalDurationMonths: 1, gateName: '', gateReadinessThreshold: 100, checklist: LESSONS_CHECKLIST },
]

/** Variant templates. Each starts from the default set and adapts durations/stages — a Building
 * project has no procurement-heavy long-lead phase the way a pipeline EPC does, and a station
 * project runs shorter execution. Only the deltas are expressed here. */
export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    name: 'خط لوله EPC',
    description: 'چرخه عمر کامل ۱۱ مرحله‌ای برای پروژه‌های EPC خط لوله — شامل مراحل تدارکات و اجرای طولانی.',
    projectType: 'pipeline_epc',
    isDefault: true,
    stages: DEFAULT_TEMPLATE_STAGES,
  },
  {
    name: 'ایستگاه تقویت فشار',
    description: 'مناسب پروژه‌های ایستگاهی؛ اجرای کوتاه‌تر و راه‌اندازی طولانی‌تر نسبت به خط لوله.',
    projectType: 'station',
    isDefault: false,
    stages: DEFAULT_TEMPLATE_STAGES.map((s) =>
      s.stageKey === 'execution' ? { ...s, typicalDurationMonths: 14 }
      : s.stageKey === 'commissioning' ? { ...s, typicalDurationMonths: 5 }
      : s,
    ),
  },
  {
    name: 'ساختمانی',
    description: 'پروژه‌های ساختمانی و ابنیه؛ بدون مرحله تدارکات بلندمدت تجهیزات فرآیندی.',
    projectType: 'building',
    isDefault: false,
    stages: DEFAULT_TEMPLATE_STAGES
      .filter((s) => s.stageKey !== 'procurement')
      .map((s) => (s.stageKey === 'engineering' ? { ...s, typicalDurationMonths: 5 } : s)),
  },
]

/** Position of a stage in a given ordered stage list — used by the stepper and by the
 * "can this project advance?" check. Returns -1 when the key is not in the list. */
export function stageIndex(stageKey: string, order: string[] = DEFAULT_STAGE_ORDER): number {
  return order.indexOf(stageKey)
}

export function nextStageKey(stageKey: string, order: string[] = DEFAULT_STAGE_ORDER): string | null {
  const i = stageIndex(stageKey, order)
  if (i < 0 || i >= order.length - 1) return null
  return order[i + 1]
}
