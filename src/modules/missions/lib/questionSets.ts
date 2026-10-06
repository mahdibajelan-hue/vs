import type { FindingKind, Mission, Objective, TemplateEntries, TemplateField, VisitType } from '../types'
import { normalizeFa } from './fa'

/**
 * Question Engine — DATA, not code.
 *
 * Everything that decides WHAT is asked lives in plain JSON-serialisable definitions: topics, their main
 * questions, the conditions under which a topic/question applies, follow-up templates per missing slot,
 * and the completion rule that tells the engine a topic has been explored enough. The engine
 * (interviewEngine.ts) is a generic interpreter of these definitions, so new Question Sets and new logic
 * can be added by inserting a row into ms_question_sets (admin) or appending to DEFAULT_QUESTION_SET —
 * with no change to the engine itself.
 */

// ---------------------------------------------------------------------------------------- conditions

/** A declarative predicate over the mission context and (optionally) earlier answers. */
export interface Cond {
  all?: Cond[]
  any?: Cond[]
  not?: Cond
  projectTypeIn?: string[]
  visitTypeIn?: VisitType[]
  /** true when at least one mission objective is mapped to one of these topic keys */
  objectiveTopicIn?: string[]
  /** true when the mission's own free text (objectives, topics of interest, expected output) mentions any of these words */
  missionTextHas?: string[]
  /** true when the user's earlier answers in `topic` (or anywhere if omitted) mention any of these words */
  answeredHas?: { topic?: string; words: string[] }
  /** true when an open finding of this kind exists (optionally in a topic) */
  hasFinding?: { kind: FindingKind; topic?: string }
}

export interface QuestionDef {
  id: string
  /** Placeholders: {project} {destination} {visitees} {objective} {measure} */
  text: string
  /** Short label used in the generated answer template when the topic defines none. */
  label?: string
  when?: Cond
  /** Shown under the question as a gentle prompt of what a good answer contains. */
  hint?: string
  quick?: string[]
  /** Repeat this question once per mission objective ({objective}/{measure} are substituted). */
  repeatForObjective?: boolean
}

export interface TopicDef {
  key: string
  title: string
  icon: string
  description: string
  order: number
  /** Core topics are always asked; others only when `relevantWhen` holds. */
  core?: boolean
  relevantWhen?: Cond
  /** A topic is mandatory (cannot be skipped without a reason) when this holds. */
  mandatoryWhen?: Cond
  mainQuestions: QuestionDef[]
  /** Labelled lines of the answer template shown with the topic's batch question. Without it, one line per
   * applicable main question is generated. */
  template?: TemplateField[]
  /** Repeating blocks (decisions, actions…) captured as structured findings with owner and due date. */
  entries?: TemplateEntries
  /** Quick replies for the whole batch (e.g. «موردی برای گزارش نبود»). */
  quick?: string[]
  /** Words that make this topic's sentences count as "about" this topic during analysis. */
  lexicon: string[]
  /** When true the topic only collects notes: no issue/risk/action findings are mined from its answers
   * (overview, objective review and evidence topics are conversational summaries, not discovery). */
  noFindings?: boolean
  /** Finding kinds this topic mostly yields, used to default the kind of an ambiguous statement. */
  defaultKind?: FindingKind
  /** The topic closes when all main questions are answered and every open finding is "complete enough". */
  maxFollowUps: number
  /** Metrics the topic wants (e.g. progress percentages). */
  metrics?: string[]
}

/** A slot is one fact the engine tries to learn about a finding. */
export type Slot = 'cause' | 'status' | 'impact' | 'party' | 'newDate' | 'needAction' | 'probability' | 'mitigation' | 'owner' | 'due'

export interface SlotSpec {
  /** Slots required for the finding to count as complete, in the order they are asked. */
  required: Slot[]
  /** Extra slots asked only when severity is high/critical. */
  requiredIfHigh?: Slot[]
}

export interface QuestionSet {
  key: string
  title: string
  version: number
  topics: TopicDef[]
  /** What a finding of each kind must contain before the engine stops asking about it. */
  slots: Record<FindingKind, SlotSpec>
  /** Follow-up phrasings per slot; {title} is the finding's short title. The first template is the default. */
  followUps: Record<Slot, string[]>
}

// ---------------------------------------------------------------------------------------- context

export interface MissionContext {
  mission: Mission
  objectives: Objective[]
  projectType: string
  projectName: string
  /** Answers given so far, per topic (lower-cased, normalised) — for `answeredHas`. */
  answers: Record<string, string>
  openFindingKinds: { kind: FindingKind; topicKey: string }[]
}

export function missionText(ctx: Pick<MissionContext, 'mission' | 'objectives'>): string {
  return normalizeFa(
    [ctx.mission.topicsOfInterest, ctx.mission.expectedOutput, ctx.mission.destination, ...ctx.objectives.map((o) => `${o.title} ${o.measure}`)].join(' '),
  )
}

export function evalCond(c: Cond | undefined, ctx: MissionContext): boolean {
  if (!c) return true
  if (c.all && !c.all.every((x) => evalCond(x, ctx))) return false
  if (c.any && !c.any.some((x) => evalCond(x, ctx))) return false
  if (c.not && evalCond(c.not, ctx)) return false
  if (c.projectTypeIn && !c.projectTypeIn.includes(ctx.projectType)) return false
  if (c.visitTypeIn && !c.visitTypeIn.includes(ctx.mission.visitType)) return false
  if (c.objectiveTopicIn && !ctx.objectives.some((o) => c.objectiveTopicIn!.includes(o.topicKey))) return false
  if (c.missionTextHas) {
    const t = missionText(ctx)
    if (!c.missionTextHas.some((w) => t.includes(normalizeFa(w)))) return false
  }
  if (c.answeredHas) {
    const hay = c.answeredHas.topic ? ctx.answers[c.answeredHas.topic] ?? '' : Object.values(ctx.answers).join(' ')
    if (!c.answeredHas.words.some((w) => hay.includes(normalizeFa(w)))) return false
  }
  if (c.hasFinding) {
    const h = c.hasFinding
    if (!ctx.openFindingKinds.some((f) => f.kind === h.kind && (!h.topic || f.topicKey === h.topic))) return false
  }
  return true
}

export function fillTemplate(text: string, ctx: MissionContext, extra: Record<string, string> = {}): string {
  const visitees = ctx.mission.visitees.map((v) => v.name || v.org).filter(Boolean).join('، ')
  const vars: Record<string, string> = {
    project: ctx.projectName,
    destination: ctx.mission.destination || 'محل بازدید',
    visitees: visitees || 'طرف‌های ملاقات',
    ...extra,
  }
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '')
}

// ---------------------------------------------------------------------------------------- default set

const VT = (...v: VisitType[]): Cond => ({ visitTypeIn: v })

export const DEFAULT_QUESTION_SET: QuestionSet = {
  key: 'epc-site-visit',
  title: 'مجموعه سؤال بازدید پروژه‌های EPC',
  version: 1,
  slots: {
    issue: { required: ['cause', 'impact', 'party', 'newDate'], requiredIfHigh: ['needAction'] },
    risk: { required: ['impact', 'probability', 'mitigation'] },
    action: { required: ['owner', 'due'] },
    commitment: { required: ['owner', 'due'] },
    decision: { required: ['owner', 'due'] },
    progress: { required: [] },
    observation: { required: [] },
  },
  followUps: {
    cause: ['علت «{title}» چیست؟ (مثلاً مشکل تأمین مالی، فنی، هماهنگی یا مجوز)', 'پیش‌تر گفتید «{title}» — دلیل اصلی آن از نظر شما یا طرف مقابل چیست؟'],
    status: ['وضعیت فعلی «{title}» چیست و کار تا کجا پیش رفته؟'],
    impact: ['«{title}» چه اثری بر پروژه دارد؟ (زمان‌بندی، هزینه، کیفیت، ایمنی یا مسیر بحرانی)', 'اگر «{title}» برطرف نشود، چه پیامدی برای پروژه خواهد داشت؟'],
    party: ['مسئول یا طرف درگیر «{title}» چه کسی/کدام شرکت است؟'],
    newDate: ['آیا تاریخ جدیدی برای رفع «{title}» اعلام شده است؟ اگر نه، بنویسید «اعلام نشده».'],
    needAction: ['برای «{title}» چه اقدام یا پیگیری مشخصی لازم است؟'],
    probability: ['احتمال وقوع «{title}» را چقدر می‌دانید؟ (کم / متوسط / زیاد) و بر چه مبنایی؟'],
    mitigation: ['برای کاهش یا کنترل «{title}» چه راهکاری وجود دارد یا پیشنهاد می‌کنید؟'],
    owner: ['مسئول انجام «{title}» چه کسی است؟'],
    due: ['موعد انجام «{title}» چه زمانی است؟ (تاریخ یا مثلاً «دو هفته دیگر»)'],
  },
  topics: [
    {
      key: 'overview',
      quick: ['مطابق برنامه و رضایت‌بخش', 'با تأخیر ولی قابل جبران', 'وضعیت نگران‌کننده است'],
      template: [
        { label: 'ارزیابی کلی از وضعیت پروژه' },
        { label: 'مهم‌ترین نکته مثبت', optional: true },
        { label: 'مهم‌ترین نگرانی', optional: true },
      ],
      noFindings: true,
      title: 'جمع‌بندی کلی بازدید',
      icon: 'Compass',
      description: 'تصویر کلی از وضعیت پروژه و نتیجه بازدید',
      order: 10,
      core: true,
      lexicon: ['وضعیت', 'کلی', 'بازدید', 'جمع بندی', 'نتیجه'],
      defaultKind: 'observation',
      maxFollowUps: 1,
      mainQuestions: [
        {
          id: 'overview-1',
          text: 'بازدید از «{project}» در {destination} چطور بود؟ در یک تصویر کلی، وضعیت پروژه را چگونه ارزیابی می‌کنید؟',
          hint: 'یک تا سه جمله: وضعیت عمومی، مهم‌ترین نکته مثبت و مهم‌ترین نگرانی.',
          quick: ['مطابق برنامه و رضایت‌بخش', 'با تأخیر ولی قابل جبران', 'وضعیت نگران‌کننده است'],
        },
      ],
    },
    {
      key: 'progress',
      template: [
        { label: 'پیشرفت واقعی (درصد)', metric: 'actual' },
        { label: 'پیشرفت برنامه‌ای در همین زمان (درصد)', metric: 'planned' },
        { label: 'فعالیت‌ها یا بخش‌های عقب‌تر از برنامه (به همراه میزان انحراف)' },
        { label: 'فعالیت‌ها یا بخش‌های جلوتر از برنامه', optional: true },
      ],
      title: 'پیشرفت پروژه',
      icon: 'TrendingUp',
      description: 'پیشرفت واقعی در برابر برنامه و فعالیت‌های حیاتی',
      order: 20,
      core: true,
      mandatoryWhen: VT('progress_review'),
      lexicon: ['پیشرفت', 'درصد', 'برنامه', 'زمان بندی', 'مسیر بحرانی', 'عقب', 'جلو', 'میلستون', 'فعالیت'],
      defaultKind: 'progress',
      maxFollowUps: 3,
      metrics: ['planned', 'actual'],
      mainQuestions: [
        {
          id: 'progress-1',
          text: 'پیشرفت واقعی پروژه (یا بخشی که بازدید کردید) چند درصد است و برنامه مصوب چه عددی را برای همین زمان نشان می‌دهد؟',
          hint: 'مثال: «واقعی ۴۲ درصد، برنامه ۵۰ درصد».',
        },
        {
          id: 'progress-2',
          text: 'کدام فعالیت‌ها یا بخش‌ها از برنامه عقب‌تر و کدام جلوتر هستند؟',
          when: { not: { answeredHas: { topic: 'progress', words: ['مطابق برنامه', 'بدون تاخیر', 'عقب افتادگی ندارد'] } } },
          hint: 'نام فعالیت یا بخش + میزان انحراف.',
        },
      ],
    },
    {
      key: 'engineering',
      template: [
        { label: 'نقشه یا مدرک منتظر تأیید، اصلاح یا تکمیل' },
        { label: 'تغییر طراحی یا ابهام فنی مؤثر بر خرید یا اجرا' },
      ],
      title: 'وضعیت مهندسی',
      icon: 'Ruler',
      description: 'نقشه‌ها، مدارک مهندسی، تأییدیه‌ها و تغییرات طراحی',
      order: 30,
      relevantWhen: {
        any: [
          VT('engineering'),
          { objectiveTopicIn: ['engineering'] },
          { missionTextHas: ['مهندسی', 'نقشه', 'طراحی', 'دیتاشیت', 'Datasheet', 'P&ID', 'مدارک فنی', 'تایید مدارک'] },
          { all: [VT('progress_review', 'coordination_meeting'), { projectTypeIn: ['EPC', 'EPCF'] }] },
        ],
      },
      mandatoryWhen: { any: [VT('engineering'), { objectiveTopicIn: ['engineering'] }] },
      lexicon: ['مهندسی', 'نقشه', 'طراحی', 'مدرک', 'دیتاشیت', 'تایید', 'مشاور', 'ریویژن', 'revision', 'IFC', 'استاندارد', 'محاسبات', 'دایره', 'P&ID'],
      defaultKind: 'issue',
      maxFollowUps: 4,
      mainQuestions: [
        {
          id: 'eng-1',
          text: 'وضعیت مهندسی و مدارک فنی چطور است؟ آیا نقشه یا مدرکی منتظر تأیید، اصلاح یا تکمیل است؟',
          hint: 'مدارک معوق، تأییدیه‌های مشاور/کارفرما، تغییرات طراحی.',
        },
        {
          id: 'eng-2',
          text: 'آیا تغییر طراحی یا ابهام فنی وجود دارد که روی خرید یا اجرا اثر بگذارد؟',
          when: { not: { answeredHas: { topic: 'engineering', words: ['مشکلی نیست', 'تغییری نداریم', 'ابهامی نیست'] } } },
        },
      ],
    },
    {
      key: 'procurement',
      template: [
        { label: 'اقلام عقب‌تر از برنامه یا دارای ریسک تأخیر' },
        { label: 'سازنده یا تأمین‌کننده و وضعیت سفارش' },
        { label: 'تعهد یا زمان تحویل اعلام‌شده توسط سازنده', optional: true },
      ],
      title: 'خرید و تأمین',
      icon: 'Package',
      description: 'اقلام کلیدی، تأمین‌کنندگان، ارسال و ورود به کارگاه',
      order: 40,
      relevantWhen: {
        any: [
          VT('procurement_expediting', 'progress_review'),
          { objectiveTopicIn: ['procurement'] },
          { missionTextHas: ['خرید', 'تامین', 'شیر', 'لوله', 'تجهیزات', 'سفارش', 'حمل', 'گمرک', 'تامین کننده', 'سازنده', 'Expediting', 'PO'] },
        ],
      },
      mandatoryWhen: { any: [VT('procurement_expediting'), { objectiveTopicIn: ['procurement'] }] },
      lexicon: ['خرید', 'تامین', 'سفارش', 'تجهیز', 'کالا', 'شیر', 'لوله', 'حمل', 'ارسال', 'گمرک', 'سازنده', 'تامین کننده', 'PO', 'پیش پرداخت', 'تحویل', 'بازرسی کارخانه', 'FAT'],
      defaultKind: 'issue',
      maxFollowUps: 5,
      mainQuestions: [
        {
          id: 'proc-1',
          text: 'وضعیت خرید و تأمین اقلام کلیدی چطور است؟ کدام اقلام عقب‌تر از برنامه‌اند یا ریسک تأخیر دارند؟',
          hint: 'نام قلم (مثلاً شیرآلات، لوله، پمپ)، سازنده، وضعیت سفارش و زمان تحویل.',
        },
        {
          id: 'proc-2',
          text: 'از تأمین‌کنندگان یا سازندگان چه تعهد یا زمان تحویلی گرفتید؟',
          when: { not: { answeredHas: { topic: 'procurement', words: ['همه اقلام رسیده', 'مشکلی نداریم', 'تحویل شده'] } } },
        },
      ],
    },
    {
      key: 'construction',
      template: [
        { label: 'وضعیت اجرا در کارگاه و منابع (نیرو، ماشین‌آلات، مصالح)' },
        { label: 'مانع اجرایی (دسترسی، مجوز، هوا، پیمانکار جزء)' },
      ],
      title: 'ساخت، تولید و اجرا',
      icon: 'HardHat',
      description: 'وضعیت کارگاه و تولید، منابع، پیمانکاران و موانع اجرا',
      order: 50,
      relevantWhen: {
        any: [
          VT('construction_supervision', 'progress_review', 'commissioning', 'hse_audit', 'quality_audit'),
          { objectiveTopicIn: ['construction'] },
          { missionTextHas: ['اجرا', 'ساخت', 'کارگاه', 'جوشکاری', 'نصب', 'پیمانکار', 'عملیات', 'تولید', 'ساخت و تولید'] },
        ],
      },
      mandatoryWhen: { any: [VT('construction_supervision', 'commissioning'), { objectiveTopicIn: ['construction'] }] },
      lexicon: ['اجرا', 'ساخت', 'کارگاه', 'پیمانکار', 'جوش', 'نصب', 'حفاری', 'بتن', 'نیرو', 'تجهیزات سنگین', 'ماشین آلات', 'تولید', 'فرونت', 'دسترسی', 'زمین', 'مجوز', 'هوا'],
      defaultKind: 'issue',
      maxFollowUps: 5,
      mainQuestions: [
        {
          id: 'con-1',
          text: 'وضعیت اجرا و ساخت در کارگاه چطور بود؟ منابع (نیرو، ماشین‌آلات، مصالح) و جبهه‌های کاری کافی است؟',
          hint: 'تعداد نیرو، فعالیت‌های در جریان، توقف‌ها، موانع دسترسی/مجوز/زمین.',
        },
        {
          id: 'con-2',
          text: 'آیا مانع اجرایی (دسترسی، مجوز، هوا، منابع، پیمانکار جزء) فعالیت‌ها را متوقف یا کند کرده است؟',
          when: { not: { answeredHas: { topic: 'construction', words: ['مانعی نیست', 'مشکلی نداریم', 'بدون مانع'] } } },
        },
      ],
    },
    {
      key: 'hse',
      template: [
        { label: 'حادثه یا شبه‌حادثه' },
        { label: 'مورد عدم‌رعایت ایمنی یا محیط‌زیست' },
      ],
      title: 'ایمنی، بهداشت و محیط‌زیست (HSE)',
      icon: 'ShieldCheck',
      description: 'حوادث، شبه‌حادثه‌ها، رعایت الزامات و ریسک‌های ایمنی',
      order: 60,
      core: true,
      mandatoryWhen: { any: [VT('hse_audit', 'construction_supervision', 'commissioning'), { objectiveTopicIn: ['hse'] }] },
      lexicon: ['ایمنی', 'hse', 'حادثه', 'شبه حادثه', 'ppe', 'مجوز کار', 'محیط زیست', 'آسیب', 'تجهیز ایمنی', 'ریزش', 'سقوط', 'نشتی', 'آتش', 'پرتو'],
      defaultKind: 'issue',
      maxFollowUps: 4,
      mainQuestions: [
        {
          id: 'hse-1',
          text: 'از نظر HSE چه دیدید؟ حادثه، شبه‌حادثه یا مورد عدم‌رعایت ایمنی وجود داشت؟',
          hint: 'اگر موردی نبود هم همین را بنویسید («موردی مشاهده نشد»).',
          quick: ['موردی مشاهده نشد', 'عدم‌رعایت جزئی بود', 'مورد جدی مشاهده شد'],
        },
      ],
    },
    {
      key: 'quality',
      template: [
        { label: 'عدم‌انطباق (NCR) یا رد بازرسی' },
        { label: 'وضعیت رفع نقص‌ها' , optional: true },
      ],
      title: 'کیفیت',
      icon: 'BadgeCheck',
      description: 'بازرسی‌ها، عدم‌انطباق‌ها (NCR) و تطابق با مشخصات',
      order: 70,
      relevantWhen: {
        any: [
          VT('quality_audit', 'construction_supervision', 'commissioning', 'progress_review'),
          { objectiveTopicIn: ['quality'] },
          { missionTextHas: ['کیفیت', 'NCR', 'بازرسی', 'جوش', 'تست', 'ITP', 'عدم انطباق'] },
        ],
      },
      mandatoryWhen: { any: [VT('quality_audit'), { objectiveTopicIn: ['quality'] }] },
      lexicon: ['کیفیت', 'ncr', 'عدم انطباق', 'بازرسی', 'itp', 'تست', 'جوش', 'رادیوگرافی', 'نقص', 'رد شد', 'تایید کیفی', 'مشخصات فنی'],
      defaultKind: 'issue',
      maxFollowUps: 4,
      mainQuestions: [
        {
          id: 'qual-1',
          text: 'وضعیت کیفیت چطور است؟ عدم‌انطباق (NCR)، رد بازرسی یا نقص تکرارشونده‌ای دیدید؟',
          hint: 'تعداد/نوع NCR، فعالیت مرتبط، وضعیت رفع نقص.',
        },
      ],
    },
    {
      key: 'issues_risks',
      template: [
        { label: 'مانع یا مشکل مهم که در گزارش‌های رسمی نیست' },
        { label: 'ریسک یا نگرانی تازه برای ادامه پروژه (زمان، هزینه، کیفیت، قرارداد)' },
      ],
      title: 'مشکلات، موانع و ریسک‌های جدید',
      icon: 'AlertTriangle',
      description: 'هر مانع یا نگرانی که در گزارش‌های رسمی دیده نمی‌شود',
      order: 80,
      core: true,
      lexicon: ['مشکل', 'مانع', 'ریسک', 'نگران', 'خطر', 'تهدید', 'احتمال', 'گیر', 'کمبود', 'اختلاف', 'ادعا', 'claim'],
      defaultKind: 'issue',
      maxFollowUps: 5,
      mainQuestions: [
        {
          id: 'ir-1',
          text: 'مانع یا مشکل مهم دیگری دیدید که در گزارش‌های رسمی پروژه منعکس نشده است؟',
          quick: ['مورد دیگری نبود'],
        },
        {
          id: 'ir-2',
          text: 'از این بازدید، چه ریسک یا نگرانی تازه‌ای برای ادامه پروژه (زمان، هزینه، کیفیت، قرارداد) به ذهنتان رسید؟',
          quick: ['ریسک جدیدی ندیدم'],
        },
      ],
    },
    {
      key: 'decisions',
      quick: ['تصمیم یا توافق مشخصی نبود'],
      entries: { item: 'مصوبه', count: 3, kind: 'decision', ownerLabel: 'مسئول اقدام', dueLabel: 'مهلت اجرا (تاریخ)', noteLabel: 'توضیح (اختیاری)' },
      title: 'تصمیمات، توافق‌ها و تعهدات',
      icon: 'Handshake',
      description: 'آنچه با طرف‌های ملاقات توافق شد و تعهد هر طرف',
      order: 90,
      core: true,
      mandatoryWhen: VT('coordination_meeting', 'client_meeting'),
      lexicon: ['تصمیم', 'توافق', 'مقرر', 'تعهد', 'قول', 'مصوب', 'جلسه', 'صورتجلسه', 'متعهد'],
      defaultKind: 'decision',
      maxFollowUps: 4,
      mainQuestions: [
        {
          id: 'dec-1',
          text: 'در ملاقات با {visitees} چه تصمیم یا توافقی انجام شد؟',
          quick: ['تصمیم یا توافق مشخصی نبود'],
        },
        {
          id: 'dec-2',
          text: 'هر طرف چه تعهدی داد و تا چه زمانی؟',
          when: { not: { answeredHas: { topic: 'decisions', words: ['تصمیم یا توافق مشخصی نبود', 'توافقی نشد'] } } },
          hint: 'نام شخص/شرکت + تعهد + موعد.',
        },
      ],
    },
    {
      key: 'objectives',
      noFindings: true,
      title: 'مرور اهداف مأموریت',
      icon: 'Target',
      description: 'تحقق هر یک از اهداف اعلام‌شده در درخواست مأموریت',
      order: 100,
      core: true,
      lexicon: ['هدف', 'محقق', 'انجام شد', 'نشد', 'تا حدی'],
      defaultKind: 'observation',
      maxFollowUps: 2,
      mainQuestions: [
        {
          id: 'obj-each',
          text: 'هدف «{objective}»{measure} — آیا محقق شد؟ اگر کامل یا ناقص ماند، چه چیزی مانده است؟',
          repeatForObjective: true,
          quick: ['کاملاً محقق شد', 'تا حدی محقق شد', 'محقق نشد'],
        },
      ],
    },
    {
      key: 'actions',
      entries: { item: 'اقدام', count: 3, kind: 'action', ownerLabel: 'مسئول اقدام', dueLabel: 'موعد انجام (تاریخ)' },
      template: [{ label: 'پیشنهاد شما به مدیر پروژه یا مدیریت ارشد', optional: true, noteOnly: true }],
      title: 'اقدامات موردنیاز و پیشنهادها',
      icon: 'ListChecks',
      description: 'کارهای بعدی با مسئول و موعد، و پیشنهاد به مدیریت پروژه',
      order: 110,
      core: true,
      lexicon: ['اقدام', 'پیشنهاد', 'باید', 'لازم', 'پیگیری', 'نیاز', 'توصیه'],
      defaultKind: 'action',
      maxFollowUps: 5,
      mainQuestions: [
        {
          id: 'act-1',
          text: 'پس از این بازدید چه اقدام‌هایی لازم است؟ برای هر کدام، مسئول و موعد را هم بگویید.',
          hint: 'مثال: «آقای رضایی تا پایان هفته نامه تسریع به سازنده بدهد».',
        },
        {
          id: 'act-2',
          text: 'پیشنهاد شما به مدیر پروژه یا مدیریت ارشد چیست؟',
          quick: ['پیشنهاد دیگری ندارم'],
        },
      ],
    },
    {
      key: 'evidence',
      template: [{ label: 'عکس یا مستند بارگذاری‌شده (بنویسید «ثبت شد» یا «ندارم»)' }],
      noFindings: true,
      title: 'مستندات و شواهد',
      icon: 'Paperclip',
      description: 'عکس، صورتجلسه، نامه و مستندات فنی بازدید',
      order: 120,
      core: true,
      lexicon: ['عکس', 'صورتجلسه', 'نامه', 'مستند', 'فایل', 'گزارش'],
      defaultKind: 'observation',
      maxFollowUps: 0,
      mainQuestions: [
        {
          id: 'evd-1',
          text: 'چه عکس یا مستندی از بازدید دارید؟ (صورتجلسه، نامه، عکس کارگاه، مدرک فنی) — از پنل «شواهد» کنار صفحه بارگذاری کنید و سپس بنویسید «ثبت شد»، یا اگر مستندی ندارید بنویسید «ندارم».',
          quick: ['ثبت شد', 'مستندی ندارم'],
        },
      ],
    },
  ],
}

/** Visit-type default: which topics are in scope. Evaluated once at interview start. */
export function planTopics(set: QuestionSet, ctx: MissionContext): { plan: string[]; mandatory: string[] } {
  const topics = [...set.topics].sort((a, b) => a.order - b.order)
  const plan: string[] = []
  const mandatory: string[] = []
  for (const t of topics) {
    const relevant = t.core || evalCond(t.relevantWhen, ctx)
    if (!relevant) continue
    plan.push(t.key)
    if (t.mandatoryWhen ? evalCond(t.mandatoryWhen, ctx) : false) mandatory.push(t.key)
  }
  return { plan, mandatory }
}

export const TOPIC_KEYS_FOR_OBJECTIVES: { key: string; label: string }[] = [
  { key: '', label: 'عمومی / بدون موضوع مشخص' },
  { key: 'progress', label: 'پیشرفت پروژه' },
  { key: 'engineering', label: 'مهندسی' },
  { key: 'procurement', label: 'خرید و تأمین' },
  { key: 'construction', label: 'ساخت و اجرا' },
  { key: 'hse', label: 'HSE' },
  { key: 'quality', label: 'کیفیت' },
  { key: 'decisions', label: 'تصمیم و توافق' },
]

export function topicTitle(set: QuestionSet, key: string): string {
  return set.topics.find((t) => t.key === key)?.title ?? key
}
