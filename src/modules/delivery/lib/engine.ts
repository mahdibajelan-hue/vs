import { CRITERIA, METHODS, METHOD, PRICING, PROCUREMENT, EXECUTION, RISK_FAMILY_FA, type Bearer, type CriterionKey, type ExecKey, type Method, type MethodKey, type PricingKey, type ProcurementKey, type Profile, type RiskFamily } from './bank'
import { QUESTIONS, isAnswered, visible, type Answers } from './questions'

/**
 * موتور تصمیم — deterministic multi-criteria analysis of the delivery method, the contracting strategy and the
 * execution strategy. Nothing here calls a model: the same answers and weights always give the same result, and every
 * number can be traced to a rule with its reason. The pipeline:
 *
 *   answers → hard constraints (exclude / conditional) → context rules move each method's 1–5 profile (each move is
 *   logged) → risk-allocation fit → weighted score → hybrid recipes → contracting & execution fit → scenarios →
 *   weight sensitivity → input-uncertainty test → confidence and whether a definitive recommendation may be given.
 */
export const ENGINE_VERSION = 'ds-1.0'

export type Weights = Record<CriterionKey, number>
export interface Adjustment { method: MethodKey; crit: CriterionKey; delta: number; why: string; rule: string }
export interface Constraint { kind: 'exclude' | 'conditional' | 'caution'; why: string; rule: string }
export interface OptionResult {
  key: MethodKey; fa: string; en: string; summary: string
  status: 'ok' | 'conditional' | 'excluded'
  score: number; rank: number | null
  base: Profile; profile: Profile
  contributions: Record<CriterionKey, number>
  adjustments: Adjustment[]; constraints: Constraint[]
  strengths: string[]; weaknesses: string[]; reasonsAgainst: string[]
  riskFit: number; riskExposure: number
  duration: [number, number] | null; cost: [number, number] | null
  components?: string[]
}
export interface FitItem<K extends string> { key: K; fa: string; score: number; recommended: boolean; reasons: string[]; caution?: string }
export interface RiskRow { key: RiskFamily; fa: string; severity: number; impact: number; source: 'answers' | 'register' | 'both'; bearer: Partial<Record<MethodKey, Bearer>> }
export interface ScenarioResult { key: string; fa: string; winner: MethodKey | null; ranking: { key: MethodKey; score: number }[] }
export interface SensitivityRow { crit: CriterionKey; fa: string; flipDown: number | null; flipUp: number | null; flipTo: MethodKey | null; swing: number }
export interface Gap { key: string; fa: string; critical: boolean }
export interface Contradiction { fa: string; blocking: boolean }
export interface Confidence { score: number; level: 'high' | 'medium' | 'low'; decisive: boolean; reasons: string[] }
export interface Recommendation { method: MethodKey; methodFa: string; pricing: PricingKey[]; procurement: ProcurementKey[]; execution: ExecKey[]; statement: string; definitive: boolean }
export interface RegisterRisk { family: RiskFamily; probability: number; impact: number; title: string; code: string }
export interface Result {
  engineVersion: string; weights: Weights
  options: OptionResult[]; ranking: MethodKey[]; winner: MethodKey | null; runnerUp: MethodKey | null; gap: number
  pricing: FitItem<PricingKey>[]; procurement: FitItem<ProcurementKey>[]; execution: FitItem<ExecKey>[]
  risks: RiskRow[]; registerRisks: RegisterRisk[]
  scenarios: ScenarioResult[]; sensitivity: SensitivityRow[]; inputUncertainty: { optimistic: MethodKey | null; pessimistic: MethodKey | null; stable: boolean; unknownScales: number }
  gaps: Gap[]; contradictions: Contradiction[]; confidence: Confidence; recommendation: Recommendation | null
}
export interface EngineInput { answers: Answers; weights?: Partial<Weights> | null; registerRisks?: RegisterRisk[]; plannedMonths?: number | null; capex?: number | null }

const clamp = (x: number, lo = 1, hi = 5) => Math.min(hi, Math.max(lo, x))
const r1 = (x: number) => Math.round(x * 10) / 10
const LUMP: MethodKey[] = ['epc', 'turnkey', 'db', 'pc', 'bot']
const ALL: MethodKey[] = METHODS.map((m) => m.key)

class Ctx {
  a: Answers
  constructor(a: Answers) { this.a = a }
  /** a 1–5 answer; unknown → `d` (neutral) */
  v(k: string, d = 3): number { const x = this.a[k]; return typeof x === 'number' ? x : typeof x === 'string' && x !== '' && Number.isFinite(Number(x)) ? Number(x) : d }
  known(k: string) { return isAnswered(this.a[k]) }
  b(k: string): boolean | null { const x = this.a[k]; return typeof x === 'boolean' ? x : null }
  s(k: string): string | null { const x = this.a[k]; return typeof x === 'string' && x !== '' ? x : null }
  get maturity() { const m = this.s('scopeMaturity'); return m == null ? null : Number(m) }
  get type() { return this.s('projectType') ?? 'other' }
  get loanOrPrivate() { const f = this.s('funding'); return f === 'loan' || f === 'private' }
}

// ── weights: defaults follow the project's own priorities; the user can override every one
export function defaultWeights(a: Answers): Weights {
  const c = new Ctx(a)
  const w: Weights = {
    time: 8 + 4 * (c.v('scheduleCriticality') - 3) + (c.b('fixedDeadline') ? 3 : 0),
    costCert: 9 + 3 * (c.v('certaintyPriority') - 3) + (c.v('budgetCertainty') <= 2 ? 2 : 0),
    cost: 10 + 3 * (c.v('costPriority') - 3),
    quality: 8 + 2 * (c.v('controlPriority') - 3) + (c.v('complexity') >= 4 ? 2 : 0),
    flex: 6 + 2 * (c.v('changeLikelihood') - 3),
    ownerLoad: 9 + 3 * (3 - c.v('ownerPm')),
    interface: 8 + 2 * (c.v('interfaces') - 3),
    risk: 12,
    market: 9,
    finance: 7 + (c.s('funding') === 'loan' ? 4 : c.s('funding') === 'private' ? 7 : 0) + (c.v('budgetCertainty') <= 2 ? 2 : 0),
    compliance: 8 + (c.b('openTender') ? 3 : 0) + (c.v('localContent') >= 4 ? 2 : 0),
  }
  return normalise(w)
}
export function normalise(w: Partial<Weights>): Weights {
  const out = {} as Weights
  let sum = 0
  for (const k of CRITERIA.map((x) => x.key)) { out[k] = Math.max(0, Number(w[k] ?? 0)); sum += out[k] }
  if (sum <= 0) { for (const k of CRITERIA.map((x) => x.key)) out[k] = 100 / CRITERIA.length; return out }
  for (const k of CRITERIA.map((x) => x.key)) out[k] = (out[k] / sum) * 100
  return out
}

// ── hard constraints
function constraints(c: Ctx): Map<MethodKey, Constraint[]> {
  const out = new Map<MethodKey, Constraint[]>(ALL.map((k) => [k, []]))
  const add = (k: MethodKey, kind: Constraint['kind'], why: string, rule: string) => out.get(k)!.push({ kind, why, rule })
  const m = c.maturity
  // BOT needs a legal framework, a revenue stream and an investor
  if (c.b('ppAllowed') === false) add('bot', 'exclude', 'چارچوب قانونی مشارکت بخش خصوصی برای این طرح وجود ندارد.', 'C-BOT-LAW')
  else if (c.b('ppAllowed') == null) add('bot', 'conditional', 'وجود چارچوب قانونی مشارکت بخش خصوصی مشخص نشده است.', 'C-BOT-LAW?')
  if (c.b('revenue') === false) add('bot', 'exclude', 'طرح جریان درآمد مستقل ندارد؛ بازگشت سرمایهٔ سرمایه‌گذار ممکن نیست.', 'C-BOT-REV')
  if (c.known('investorInterest') && c.v('investorInterest') <= 1) add('bot', 'exclude', 'سرمایه‌گذار واجد شرایط علاقه‌ای ندارد.', 'C-BOT-INV')
  // owner self-perform
  if (c.b('directAllowed') === false) add('direct', 'exclude', 'اجرای امانی برای این اندازه از طرح مجاز نیست.', 'C-DIR-LAW')
  else if (c.b('directAllowed') == null) add('direct', 'conditional', 'مجاز بودن اجرای امانی مشخص نشده است.', 'C-DIR-LAW?')
  if (c.v('ownerBuild', 1) <= 2) add('direct', 'exclude', 'کارفرما نیرو و ماشین‌آلات کافی برای اجرای مستقیم ندارد.', 'C-DIR-CAP')
  if ((c.type === 'offshore' || c.type === 'plant') && c.v('complexity') >= 4) add('direct', 'exclude', 'اندازه و پیچیدگی طرح فراتر از اجرای امانی است.', 'C-DIR-SIZE')
  // cost-reimbursable management contract
  if (c.b('reimbAllowed') === false) add('epcm', 'exclude', 'قراردادهای هزینه‌محور در سازمان مجاز نیست.', 'C-EPCM-LAW')
  if (c.known('ownerPm') && c.v('ownerPm') <= 1) { add('epcm', 'exclude', 'کارفرما توان حداقلی کنترل هزینه و مدیریت پیمان‌های متعدد را ندارد.', 'C-EPCM-CAP'); add('multi', 'exclude', 'کارفرما توان یکپارچه‌سازی بسته‌های متعدد را ندارد.', 'C-MULTI-CAP') }
  else if (c.v('ownerPm') === 2) add('multi', 'caution', 'توان یکپارچه‌سازی کارفرما محدود است؛ مدیریت فصل مشترک‌ها باید تقویت شود.', 'W-MULTI-CAP')
  // fixed price needs a defined scope
  if (m === 0) for (const k of LUMP) add(k, 'exclude', 'در مرحلهٔ ایده، محدوده برای قیمت مقطوع تعریف نشده است؛ این گزینه پس از طراحی پایه دوباره بررسی شود.', 'C-LUMP-IDEA')
  if (m != null && m <= 1 && c.known('ownerEng') && c.v('ownerEng') <= 2) add('pc', 'exclude', 'طراحی تفصیلی آماده نیست و کارفرما یا مشاورش توان تهیهٔ آن را ندارد.', 'C-PC-DESIGN')
  if (c.b('fixedDeadline') && c.v('scheduleCriticality') >= 5 && m != null && m <= 1) add('dbb', 'exclude', 'تاریخ قطعی اجازهٔ تکمیل طراحی پیش از مناقصه را نمی‌دهد.', 'C-DBB-TIME')
  if (c.known('epcMarket') && c.v('epcMarket') <= 1) { add('turnkey', 'exclude', 'پیمانکار واجد شرایط کلید در دست در بازار وجود ندارد.', 'C-TK-MKT'); add('epc', 'caution', 'رقابت واقعی میان پیمانکاران EPC وجود ندارد؛ قیمت احتمالاً با صرف ریسک بالا پیشنهاد می‌شود.', 'W-EPC-MKT') }
  if (c.v('inflation') >= 4) for (const k of ['epc', 'turnkey', 'db', 'pc'] as MethodKey[]) add(k, 'caution', 'با تورم و نوسان ارز شدید، قیمت مقطوع بدون سازوکار تعدیل یا با صرف ریسک بالا پیشنهاد می‌شود.', 'W-LUMP-INFL')
  if (c.type === 'offshore') add('direct', 'exclude', 'اجرای امانی تأسیسات فراساحل عملی نیست.', 'C-DIR-OFF')
  return out
}

// ── context rules: each moves one criterion of one or more methods, with its reason
function adjustments(c: Ctx): Adjustment[] {
  const out: Adjustment[] = []
  const adj = (ms: MethodKey[] | 'all', crits: CriterionKey[], delta: number, why: string, rule: string) => {
    for (const method of ms === 'all' ? ALL : ms) for (const crit of crits) out.push({ method, crit, delta, why, rule })
  }
  const m = c.maturity
  if (m != null && m <= 1) {
    adj(['epc', 'turnkey', 'db', 'pc', 'bot'], ['costCert'], m === 0 ? -2 : -1, 'محدوده هنوز بالغ نیست؛ قیمت مقطوع با ادعا و تغییرات همراه می‌شود.', 'R-MAT-LOW')
    adj(['epc', 'turnkey', 'db', 'pc', 'bot'], ['cost'], -1, 'پیمانکار برای محدودهٔ ناپخته صرف ریسک بالا منظور می‌کند.', 'R-MAT-LOW')
    adj(['dbb'], ['time'], -1, 'طراحی باید پیش از مناقصهٔ ساخت کامل شود؛ زمان طولانی‌تر می‌شود.', 'R-MAT-LOW')
    adj(['epcm', 'multi'], ['time'], 1, 'با محدودهٔ ناپخته، شروع زودهنگام بسته‌ها مزیت زمانی دارد.', 'R-MAT-LOW')
  }
  if (m === 3) {
    adj(['pc', 'dbb'], ['time', 'costCert'], 1, 'طراحی تفصیلی آماده است؛ مناقصهٔ ساخت سریع و قیمت دقیق‌تر است.', 'R-MAT-DET')
    adj(['epc', 'turnkey', 'db'], ['time'], -1, 'طراحی تفصیلی آماده است؛ مزیت هم‌پوشانی طراحی و ساخت کاهش می‌یابد.', 'R-MAT-DET')
  }
  if (c.v('changeLikelihood') >= 4) {
    adj(['epc', 'turnkey', 'db', 'pc', 'bot', 'dbb'], ['costCert'], -1, 'تغییرات محتمل در قرارداد مقطوع یا فهرست‌بها به ادعا و افزایش مبلغ منجر می‌شود.', 'R-CHG')
    adj(['epcm', 'multi', 'direct'], ['cost'], 1, 'تغییرات در قرارداد انعطاف‌پذیر بدون صرف ریسک و ادعا اعمال می‌شود.', 'R-CHG')
  }
  const pm = c.v('ownerPm'), eng = c.v('ownerEng')
  if (pm <= 2) {
    adj(['epcm'], ['costCert', 'risk', 'quality'], -1, 'کنترل هزینه و فنی EPCM به توان کارفرما وابسته است و این توان محدود است.', 'R-OWN-LOW')
    adj(['multi'], ['interface', 'time', 'costCert'], -1, 'یکپارچه‌سازی بسته‌های متعدد با توان محدود کارفرما دشوار است.', 'R-OWN-LOW')
    adj(['direct'], ['time', 'quality'], -1, 'اجرای مستقیم بدون نیروی مدیریتی کافی کند و پرخطاست.', 'R-OWN-LOW')
    adj(['dbb', 'ep'], ['interface'], -1, 'مدیریت فصل مشترک طراح و پیمانکار ساخت با توان محدود کارفرما دشوار است.', 'R-OWN-LOW')
  } else if (pm >= 4) {
    adj(['epcm', 'multi'], ['costCert', 'interface'], 1, 'کارفرما توان کنترل هزینه و یکپارچه‌سازی دارد.', 'R-OWN-HIGH')
    adj(['ep', 'dbb'], ['interface'], 1, 'کارفرما فصل مشترک‌ها را مدیریت می‌کند.', 'R-OWN-HIGH')
  }
  if (eng <= 2) adj(['pc', 'dbb'], ['quality'], -1, 'طراحی کارفرما یا مشاورش ضعیف است؛ خطای طراحی به ادعای پیمانکار تبدیل می‌شود.', 'R-ENG-LOW')
  if (eng >= 4) adj(['epcm', 'dbb', 'pc'], ['quality'], 1, 'توان مهندسی کارفرما اشراف فنی را تضمین می‌کند.', 'R-ENG-HIGH')
  const build = c.v('ownerBuild', 1)
  if (build >= 4) adj(['direct'], ['time', 'cost'], 1, 'کارفرما نیرو و ماشین‌آلات اجرایی کافی دارد.', 'R-BUILD')
  if (c.v('experience') <= 2) adj(['epcm', 'multi', 'direct'], ['risk'], -1, 'کارفرما تجربهٔ مشابه ندارد؛ نگه‌داشتن ریسک‌ها نزد او پرخطر است.', 'R-EXP')
  if (c.v('decisionSpeed') <= 2) adj(['epcm', 'multi', 'direct', 'dbb'], ['time'], -1, 'این روش‌ها تصمیم‌های فراوان کارفرما می‌خواهند و تصمیم‌گیری سازمان کند است.', 'R-DEC')

  const epcM = c.v('epcMarket'), buildM = c.v('buildMarket')
  if (epcM <= 2) {
    adj(['epc', 'turnkey', 'db', 'bot'], ['market'], epcM <= 1 ? -2 : -1, 'تعداد پیمانکاران توانا کم است و رقابت واقعی شکل نمی‌گیرد.', 'R-MKT-EPC')
    adj(['epc', 'turnkey', 'db'], ['cost'], -1, 'نبود رقابت قیمت را بالا می‌برد.', 'R-MKT-EPC')
  } else if (epcM >= 4) adj(['epc', 'turnkey', 'db'], ['market', 'cost'], 1, 'رقابت گسترده میان پیمانکاران EPC قیمت را کاهش می‌دهد.', 'R-MKT-EPC+')
  if (buildM >= 4) adj(['dbb', 'pc', 'multi', 'ep'], ['market'], 1, 'بازار پیمانکاران ساخت قوی و رقابتی است.', 'R-MKT-C')
  else if (buildM <= 2) adj(['dbb', 'pc', 'multi', 'ep'], ['market'], -1, 'پیمانکار ساخت توانا کم است.', 'R-MKT-C')
  if (c.v('supplierAccess') <= 2) adj(['epc', 'turnkey', 'db', 'bot'], ['risk', 'costCert'], -1, 'دسترسی به تأمین‌کنندگان محدود است؛ پیمانکار ریسک تأمین را با صرف بالا قیمت می‌گذارد یا نمی‌پذیرد.', 'R-SUP')
  if (c.v('riskAppetite') <= 2) adj(['epc', 'turnkey', 'db', 'pc', 'bot'], ['cost', 'costCert'], -1, 'پیمانکاران تمایلی به پذیرش ریسک قیمت مقطوع ندارند.', 'R-APP')
  if (c.v('localContent') >= 4) {
    adj(['multi', 'dbb', 'pc', 'ep'], ['market', 'compliance'], 1, 'تفکیک بسته‌ها سهم ساخت داخل و پیمانکاران محلی را افزایش می‌دهد.', 'R-LOCAL')
    adj(['turnkey'], ['compliance'], -1, 'قرارداد یکپارچهٔ کلید در دست با سیاست ساخت داخل سازگاری کمتری دارد.', 'R-LOCAL')
  }

  if (c.s('funding') === 'loan') {
    adj(['epc', 'turnkey'], ['finance'], 1, 'تأمین‌کنندگان مالی قرارداد مقطوع و مسئولیت واحد را ترجیح می‌دهند.', 'R-FIN-LOAN')
    adj(['epcm', 'direct', 'multi'], ['finance'], -1, 'تأمین‌کنندگان مالی قراردادهای هزینه‌محور و چندبسته‌ای را پرریسک می‌دانند.', 'R-FIN-LOAN')
  }
  if (c.s('funding') === 'private') {
    adj(ALL.filter((k) => k !== 'bot'), ['finance'], -2, 'سرمایه از سوی سرمایه‌گذار خصوصی تأمین می‌شود؛ روش‌های متکی به پرداخت کارفرما به تأمین مالی جداگانه نیاز دارند.', 'R-FIN-PRIV')
    adj(['bot'], ['market'], 1, 'سرمایه‌گذار واجد شرایط برای این طرح اعلام آمادگی کرده است.', 'R-FIN-PRIV')
  }
  if (c.known('budgetCertainty') && c.v('budgetCertainty') <= 1) adj(ALL.filter((k) => k !== 'bot'), ['finance'], -1, 'تخصیص منابع کارفرما بسیار نامطمئن است؛ روش‌های متکی به پرداخت کارفرما با توقف و ادعا روبه‌رو می‌شوند.', 'R-FIN-NONE')
  if (c.s('funding') === 'budget' && c.v('budgetCertainty') <= 2) {
    adj(['epc', 'turnkey', 'db'], ['cost'], -1, 'نامطمئنی پرداخت‌ها در قیمت مقطوع پیمانکار منعکس می‌شود.', 'R-FIN-CASH')
    adj(['dbb', 'direct', 'multi'], ['finance'], 1, 'اجرای بسته‌بسته با جریان نقدی نامطمئن قابل تنظیم است.', 'R-FIN-CASH')
  }
  if (c.v('inflation') >= 4) {
    adj(['epc', 'turnkey', 'db', 'pc', 'bot'], ['cost', 'costCert'], -1, 'تورم و نوسان ارز صرف ریسک قیمت مقطوع را افزایش می‌دهد.', 'R-INFL')
    adj(['epcm', 'direct'], ['costCert'], -1, 'در قرارداد هزینه‌محور، تورم مستقیماً به کارفرما منتقل می‌شود.', 'R-INFL')
  }

  if (c.v('siteAccess') >= 4) adj(['direct'], ['time', 'cost'], -1, 'پشتیبانی و لجستیک سایت دورافتاده برای کارفرما سنگین است.', 'R-SITE')
  if (c.b('brownfield')) {
    adj(['epc', 'turnkey', 'db', 'bot'], ['risk', 'cost'], -1, 'شرایط ناشناختهٔ تأسیسات در حال بهره‌برداری صرف ریسک قیمت مقطوع را بالا می‌برد.', 'R-BROWN')
    adj(['direct', 'epcm'], ['quality', 'risk'], 1, 'کارفرما تأسیسات موجود و الزامات بهره‌برداری را بهتر می‌شناسد.', 'R-BROWN')
  }
  const cx = c.v('complexity'), nov = c.v('novelty')
  if (cx >= 4) {
    adj(['epcm'], ['quality'], 1, 'در طرح پیچیده، اشراف فنی کارفرما ارزشمند است.', 'R-CX')
    adj(['epc', 'turnkey'], ['cost'], -1, 'پیچیدگی صرف ریسک پیمانکار را افزایش می‌دهد.', 'R-CX')
    adj(['direct', 'multi'], ['time', 'quality'], -1, 'یکپارچه‌سازی طرح پیچیده با چند بسته یا اجرای مستقیم دشوار است.', 'R-CX')
  }
  if (nov >= 4) {
    adj(['turnkey'], ['quality', 'risk'], 1, 'تضمین عملکرد فناوری نو به عهدهٔ پیمانکار است.', 'R-NOV')
    adj(['dbb', 'pc'], ['quality'], -1, 'کارفرما تجربهٔ کافی برای طراحی فناوری نو ندارد.', 'R-NOV')
  }
  if (c.v('interfaces') >= 4) adj(['multi', 'ep', 'dbb'], ['interface', 'risk'], -1, 'فصل مشترک‌های فنی زیاد، تفکیک قراردادها را پرریسک می‌کند.', 'R-IFC')
  if (c.b('distinctScopes')) adj(['multi'], ['market', 'time'], 1, 'بخش‌های متمایز طرح را می‌توان هم‌زمان و رقابتی واگذار کرد.', 'R-SCOPES')
  if (c.v('standardization') >= 4) adj(['pc', 'multi', 'dbb'], ['cost'], 1, 'اجزای تکراری قیمت‌گذاری دقیق و رقابتی ساخت را ممکن می‌کند.', 'R-STD')
  if (c.type === 'pipeline' && c.v('lengthKm', 0) >= 150) adj(['multi', 'pc'], ['time'], 1, 'خط طولانی را می‌توان در چند قطعه و جبهه هم‌زمان اجرا کرد.', 'R-LONG')
  if (c.b('openTender')) {
    adj(['direct'], ['compliance'], -2, 'الزام مناقصهٔ عمومی با اجرای امانی سازگار نیست.', 'R-TENDER')
    adj(c.b('ppAllowed') === true ? ['epcm'] : ['bot', 'epcm'], ['compliance'], -1, 'انتخاب این روش نیازمند مجوز استثنا یا تشریفات خاص است.', 'R-TENDER')
  }
  if (c.v('approvalTime') >= 4) adj(['multi', 'dbb', 'ep'], ['time'], -1, 'هر بستهٔ قراردادی یک فرایند طولانی تصویب و مناقصه دارد.', 'R-APPROVAL')
  if (c.b('fixedDeadline') && c.v('scheduleCriticality') >= 4) adj(['dbb', 'direct'], ['time'], -1, 'تاریخ قطعی با روش‌های کند ناسازگار است.', 'R-DEADLINE')
  return out
}

// ── risk: severity per family (answers and the risk register), who carries it, and how well that fits
const BEST: Record<RiskFamily, Bearer> = { design: 'C', ground: 'O', permits: 'O', price: 'S', supply: 'C', interface: 'C', operations: 'O', finance: 'O' }
export function riskRows(c: Ctx, reg: RegisterRisk[]): RiskRow[] {
  const m = c.maturity
  const matRisk = m == null ? 3 : [5, 4, 2, 1][m] ?? 3
  const fromAns: Record<RiskFamily, number> = {
    design: Math.round((c.v('changeLikelihood') + matRisk) / 2), ground: c.v('groundRisk'), permits: Math.max(c.v('permitRisk'), c.type === 'offshore' ? 1 : c.v('landRisk')),
    price: c.v('inflation'), supply: Math.max(c.v('supplyRisk'), 6 - c.v('supplierAccess')), interface: Math.max(c.v('interfaceRisk'), c.v('interfaces')),
    operations: c.b('brownfield') ? Math.max(4, c.v('hseSensitivity')) : c.v('hseSensitivity'), finance: 6 - c.v('budgetCertainty'),
  }
  const impact: Record<RiskFamily, number> = {
    design: 4, ground: 3, permits: 4, price: c.v('inflation') >= 4 ? 4 : 3, supply: c.v('longLead') >= 4 ? 5 : 3,
    interface: c.v('interfaces') >= 4 ? 4 : 3, operations: c.b('brownfield') ? 5 : 3, finance: c.v('budgetCertainty') <= 2 ? 4 : 3,
  }
  return (Object.keys(fromAns) as RiskFamily[]).map((k) => {
    const rs = reg.filter((r) => r.family === k)
    const regSev = rs.length ? Math.max(...rs.map((r) => r.probability)) : 0
    const sev = clamp(Math.max(fromAns[k], regSev))
    const imp = clamp(Math.max(impact[k], rs.length ? Math.max(...rs.map((r) => r.impact)) : 0))
    return { key: k, fa: RISK_FAMILY_FA[k], severity: sev, impact: imp, source: rs.length && regSev >= fromAns[k] ? (regSev === fromAns[k] ? 'both' : 'register') : 'answers', bearer: Object.fromEntries(METHODS.map((mm) => [mm.key, mm.bearer[k]])) }
  })
}
function riskFit(method: Method, rows: RiskRow[], c: Ctx): { fit: number; exposure: number } {
  let pen = 0, tot = 0
  const weakOwner = c.v('ownerPm') <= 2
  for (const r of rows) {
    const w = r.severity * r.impact
    tot += w
    const who = method.bearer[r.key], best = BEST[r.key]
    let mis = who === best ? 0 : who === 'S' || best === 'S' ? 0.4 : 0.8
    // a contractor cannot manage permits, unforeseeable ground or owner's operations: it prices them or claims
    if (who === 'C' && (r.key === 'permits' || r.key === 'operations')) mis = 1
    if (r.key === 'supply' && who === 'C' && c.v('supplierAccess') <= 2) mis = Math.max(mis, 0.6)
    if (who === 'O' && weakOwner && (r.key === 'design' || r.key === 'interface' || r.key === 'supply')) mis += 0.4
    if (r.key === 'finance' && method.key === 'bot' && c.loanOrPrivate) mis = 0
    pen += w * Math.min(1, mis)
  }
  const share = tot ? pen / tot : 0
  return { fit: r1(clamp(5 - 4 * share * 1.6)), exposure: Math.round(share * 100) }
}

const score = (p: Profile, w: Weights) => {
  const contributions = {} as Record<CriterionKey, number>
  let s = 0
  for (const c of CRITERIA) { const v = ((p[c.key] - 1) / 4) * w[c.key]; contributions[c.key] = r1(v); s += v }
  return { score: r1(s), contributions }
}

interface Core { options: OptionResult[]; ranking: MethodKey[]; c: Ctx; rows: RiskRow[] }
function core(answers: Answers, w: Weights, reg: RegisterRisk[], plannedMonths: number | null, capex: number | null): Core {
  const c = new Ctx(answers)
  const cons = constraints(c), adjs = adjustments(c), rows = riskRows(c, reg)
  const options: OptionResult[] = METHODS.map((m) => {
    const mine = adjs.filter((x) => x.method === m.key)
    const prof = { ...m.profile }
    for (const a of mine) prof[a.crit] = prof[a.crit] + a.delta
    for (const k of Object.keys(prof) as CriterionKey[]) prof[k] = clamp(prof[k])
    const rf = riskFit(m, rows, c)
    prof.risk = r1(clamp((prof.risk + rf.fit) / 2))
    const cs = cons.get(m.key)!
    const status: OptionResult['status'] = cs.some((x) => x.kind === 'exclude') ? 'excluded' : cs.some((x) => x.kind === 'conditional') ? 'conditional' : 'ok'
    const sc = score(prof, w)
    return {
      key: m.key, fa: m.fa, en: m.en, summary: m.summary, status, score: sc.score, rank: null, base: { ...m.profile }, profile: prof, contributions: sc.contributions,
      adjustments: mine, constraints: cs, strengths: [], weaknesses: [], reasonsAgainst: [], riskFit: rf.fit, riskExposure: rf.exposure,
      duration: plannedMonths ? [r1(plannedMonths * m.duration[0]), r1(plannedMonths * m.duration[1])] : null,
      cost: capex ? costRange(m, c, capex) : null,
    }
  })
  const hybrid = hybridOption(options, c, w, plannedMonths, capex)
  options.push(hybrid)
  const ranked = options.filter((o) => o.status !== 'excluded').sort((a, b) => b.score - a.score || (a.status === 'ok' ? -1 : 1))
  ranked.forEach((o, i) => { o.rank = i + 1 })
  return { options, ranking: ranked.map((o) => o.key), c, rows }
}
function costRange(m: Method, c: Ctx, capex: number): [number, number] {
  let [lo, hi] = m.costIdx
  if (LUMP.includes(m.key) && (c.maturity ?? 2) <= 1) hi += 0.08
  if (LUMP.includes(m.key) && c.v('inflation') >= 4) { lo += 0.03; hi += 0.05 }
  if ((m.key === 'epcm' || m.key === 'direct') && c.v('changeLikelihood') >= 4) hi += 0.06
  return [Math.round(capex * lo), Math.round(capex * hi)]
}

// ── hybrid: a combination fitted to the project, scored on the same criteria with an interface penalty
function hybridOption(opts: OptionResult[], c: Ctx, w: Weights, months: number | null, capex: number | null): OptionResult {
  const P = (k: MethodKey) => opts.find((o) => o.key === k)!
  const ok = (k: MethodKey) => P(k).status !== 'excluded'
  const mix = (ks: MethodKey[], deltas: Partial<Profile>): Profile => {
    const out = {} as Profile
    for (const cr of CRITERIA) out[cr.key] = clamp(r1(ks.reduce((s, k) => s + P(k).profile[cr.key], 0) / ks.length + (deltas[cr.key] ?? 0)))
    return out
  }
  const recipes: { id: string; fa: string; components: string[]; why: string; profile: Profile; base: MethodKey }[] = []
  if (ok('epc') && c.v('longLead') >= 4 && (c.v('supplierAccess') <= 3 || c.v('scheduleCriticality') >= 4))
    recipes.push({ id: 'epc_ofe', base: 'epc', fa: 'EPC با خرید زودهنگام اقلام بلندمدت توسط کارفرما', components: ['EPC مقطوع برای مهندسی، اقلام عمومی و ساخت', 'خرید زودهنگام لوله و تجهیزات اصلی توسط کارفرما و تحویل به پیمانکار (OFE)'], why: 'تجهیزات بلندمدت مسیر بحرانی را تعیین می‌کنند؛ سفارش پیش از انتخاب پیمانکار چند ماه زمان آزاد می‌کند و ریسک تأمین را نزد طرفی می‌برد که به بازار دسترسی بهتری دارد.',
      profile: mix(['epc'], { time: 1, risk: 0.5, interface: -1, ownerLoad: -0.5, costCert: -0.5 }) })
  if (ok('epcm') && (c.maturity ?? 2) <= 1 && c.v('scheduleCriticality') >= 4 && c.b('reimbAllowed') !== false)
    recipes.push({ id: 'convert', base: 'epcm', fa: 'آغاز با مدیریت کتاب‌باز و تبدیل به EPC مقطوع پس از FEED', components: ['قرارداد کتاب‌باز (هزینه‌محور) برای تکمیل FEED و سفارش اقلام بلندمدت', 'تبدیل به EPC مقطوع پس از بلوغ محدوده با قیمت توافقی کنترل‌شده'], why: 'محدوده ناپخته و زمان حیاتی است؛ شروع فوری بدون انتظار برای FEED و رسیدن به قطعیت هزینه در ادامه.',
      profile: mix(['epcm', 'epc'], { time: 0.5, interface: 0.5, flex: 0.5 }) })
  if (c.type === 'pipeline' && c.v('buildMarket') >= 4 && c.v('epcMarket') <= 3 && ok('ep'))
    recipes.push({ id: 'ep_spreads', base: 'ep', fa: 'EP یکپارچه + ساخت خط در چند قطعهٔ رقابتی', components: ['قرارداد EP برای مهندسی تفصیلی و تأمین لوله و تجهیزات', 'واگذاری ساخت خط به چند پیمانکار در قطعه‌های مستقل (Multi-Spread)'], why: 'بازار EPC محدود ولی بازار ساخت خط لوله قوی است؛ تفکیک ساخت رقابت و سرعت را افزایش می‌دهد.',
      profile: mix(['ep', 'multi'], { time: 0.5, market: 0.5, interface: -0.5 }) })
  if (c.b('distinctScopes') && c.v('ownerPm') >= 3 && ok('epc') && ok('pc'))
    recipes.push({ id: 'by_scope', base: 'multi', fa: 'تفکیک بر پایهٔ ماهیت بخش‌ها: EPC برای ایستگاه/واحد فرایندی و PC/فهرست‌بها برای خط و ابنیه', components: ['EPC مقطوع برای بخش‌های فرایندی و ایستگاه‌ها', 'PC یا فهرست‌بها برای خط لوله، ابنیه و کارهای تکراری', 'یکپارچه‌سازی و مدیریت فصل مشترک توسط کارفرما یا مشاور مدیریت طرح'], why: 'هر بخش با روشی که برای ماهیت و بازارش مناسب‌تر است واگذار می‌شود.',
      profile: mix(['epc', 'pc', 'multi'], { interface: -0.5, market: 0.5 }) })
  if ((c.v('groundRisk') >= 4 || c.v('permitRisk') >= 4 || c.v('landRisk') >= 4) && ok('epc'))
    recipes.push({ id: 'epc_owner_risks', base: 'epc', fa: 'EPC با نگه‌داشت ریسک‌های زمین، اراضی و مجوزها نزد کارفرما', components: ['EPC مقطوع', 'ریسک شرایط پیش‌بینی‌نشدهٔ زمین با سازوکار پرداخت مقادیر (Re-measure) نزد کارفرما', 'تملک اراضی و مجوزها پیش از ابلاغ و خارج از تعهد پیمانکار'], why: 'ریسک‌هایی که پیمانکار نمی‌تواند مدیریت کند نزد کارفرما می‌ماند و صرف ریسک قیمت حذف می‌شود.',
      profile: mix(['epc'], { risk: 1, cost: 0.5, costCert: -0.5, ownerLoad: -0.5 }) })
  const scored = recipes.map((r) => ({ r, s: score(r.profile, w) })).sort((a, b) => b.s.score - a.s.score)
  const best = scored[0]
  const base = { key: 'hybrid' as MethodKey, fa: 'ترکیبی (Hybrid)', en: 'Hybrid', base: { ...METHOD.epc.profile } }
  if (!best) return { ...base, summary: 'ترکیب مناسبی برای شرایط این طرح شناسایی نشد.', status: 'excluded', score: 0, rank: null, profile: { ...METHOD.epc.profile }, contributions: score(METHOD.epc.profile, w).contributions, adjustments: [], constraints: [{ kind: 'exclude', why: 'شرایط هیچ‌یک از الگوهای ترکیبی (خرید زودهنگام، کتاب‌باز قابل تبدیل، تفکیک ساخت، تفکیک بر پایهٔ بخش‌ها، نگه‌داشت ریسک زمین) برقرار نیست.', rule: 'H-NONE' }], strengths: [], weaknesses: [], reasonsAgainst: [], riskFit: 0, riskExposure: 0, duration: null, cost: null }
  const m0 = METHOD[best.r.base as Exclude<MethodKey, 'hybrid'>]
  return {
    ...base, fa: `ترکیبی: ${best.r.fa}`, summary: best.r.why, status: 'ok', score: best.s.score, rank: null, base: { ...m0.profile }, profile: best.r.profile, contributions: best.s.contributions,
    adjustments: [], constraints: [{ kind: 'caution', why: 'ترکیب قراردادها فصل مشترک‌های تازه می‌سازد؛ مسئولیت یکپارچه‌سازی باید صریحاً تعیین شود.', rule: 'H-IFC' }],
    strengths: [], weaknesses: [], reasonsAgainst: [], riskFit: best.r.profile.risk, riskExposure: 0,
    duration: months ? [r1(months * m0.duration[0] * (best.r.id === 'epc_ofe' || best.r.id === 'convert' ? 0.95 : 1)), r1(months * m0.duration[1])] : null,
    cost: capex ? [Math.round(capex * m0.costIdx[0]), Math.round(capex * m0.costIdx[1])] : null, components: best.r.components,
  }
}

// ── contracting & procurement, execution & construction
function pricingFit(c: Ctx, method: MethodKey | null, opts: OptionResult[]): FitItem<PricingKey>[] {
  const m = c.maturity ?? 1.5, chg = c.v('changeLikelihood'), app = c.v('riskAppetite'), infl = c.v('inflation'), pm = c.v('ownerPm'), cert = c.v('certaintyPriority')
  const rows: [PricingKey, number, string[], string?][] = [
    ['lump', 50 + (m - 1.5) * 20 - (chg - 3) * 8 + (app - 3) * 8 - (infl - 3) * 8 + (cert - 3) * 6 + (c.loanOrPrivate ? 10 : 0), ['قیمت مقطوع به بلوغ محدوده، پایداری آن و تمایل بازار به پذیرش ریسک وابسته است.'], m <= 1 ? 'با محدودهٔ ناپخته، قیمت مقطوع صرف ریسک و ادعای بالا دارد.' : undefined],
    ['unit', 50 + (m - 1) * 8 + (chg - 3) * 5 + (c.v('buildMarket') - 3) * 6 + (c.b('openTender') ? 6 : 0) - (cert - 3) * 4, ['پرداخت بر پایهٔ مقادیر واقعی، ریسک مقادیر را نزد کارفرما نگه می‌دارد و صرف ریسک را حذف می‌کند.']],
    ['reimb', c.b('reimbAllowed') === false ? 0 : 50 - (m - 1) * 12 + (chg - 3) * 8 + (pm - 3) * 10 - (c.loanOrPrivate ? 15 : 0) + (c.v('scheduleCriticality') - 3) * 5, ['مناسب محدودهٔ ناپخته و نیاز به شروع فوری، به شرط توان کنترل هزینهٔ کارفرما.'], c.b('reimbAllowed') === false ? 'در سازمان مجاز نیست.' : pm <= 2 ? 'توان کنترل هزینهٔ کارفرما محدود است.' : undefined],
    ['target', 45 + (pm - 3) * 6 + (chg - 3) * 5 - Math.abs(m - 1.5) * 6 + (app <= 2 ? 10 : 0) - (c.b('reimbAllowed') === false ? 20 : 0), ['انگیزهٔ مشترک کاهش هزینه؛ مناسب وقتی پیمانکاران ریسک مقطوع را نمی‌پذیرند.']],
    ['gmp', 45 + (m - 1) * 6 + (cert - 3) * 6 + (pm - 3) * 5 + (c.type === 'building' ? 5 : 0), ['سقف مبلغ برای کارفرما و شفافیت هزینه؛ نیازمند حسابرسی هزینه‌ها.']],
    ['convert', c.b('reimbAllowed') === false ? 0 : (m <= 1 && c.v('scheduleCriticality') >= 4 ? 75 : 35) + (pm - 3) * 5, ['آغاز سریع با کتاب‌باز و تبدیل به مقطوع پس از بلوغ محدوده.']],
    ['adjust', 40 + (infl - 3) * 15 + (m - 1) * 5, ['تعدیل قیمت بر پایهٔ شاخص‌های رسمی، صرف ریسک تورم و ارز را از قیمت مقطوع حذف می‌کند.']],
    ['concession', opts.find((o) => o.key === 'bot')?.status === 'excluded' ? 0 : Math.round(opts.find((o) => o.key === 'bot')?.score ?? 0), ['فقط همراه با روش BOT / BOO معنا دارد.']],
  ]
  const fit = method ? (method === 'hybrid' ? ['lump', 'adjust', 'unit'] : METHOD[method].pricing) : []
  const items = rows.map(([key, s, reasons, caution]) => {
    const bonus = fit.includes(key) ? 15 : 0
    const sc = Math.round(clamp(s + bonus, 0, 100))
    return { key, fa: PRICING.find((p) => p.key === key)!.fa, score: sc, recommended: false, reasons: bonus ? [...reasons, 'با روش تحویل پیشنهادی سازگار است.'] : reasons, caution }
  }).sort((a, b) => b.score - a.score)
  items.forEach((x, i) => { x.recommended = x.score >= 55 && (i === 0 || (x.key === 'adjust' && infl >= 4) || (i === 1 && items[0].score - x.score <= 5)) })
  return items
}
function procurementFit(c: Ctx): FitItem<ProcurementKey>[] {
  const m = c.maturity ?? 1.5
  const rows: [ProcurementKey, number, string][] = [
    ['ofe', 30 + (c.v('longLead') - 3) * 20 + (c.v('scheduleCriticality') - 3) * 6, 'تجهیزات بلندمدت مسیر بحرانی را تعیین می‌کنند.'],
    ['twostage', 30 + (m <= 1 ? 25 : 0) + (c.v('novelty') - 3) * 8 + (c.v('complexity') - 3) * 5, 'انتخاب فنی پیش از تکمیل طراحی و توافق قیمت در مرحلهٔ دوم.'],
    ['prequal', 35 + (c.v('complexity') - 3) * 10 + (c.v('hseSensitivity') - 3) * 6 + (c.b('brownfield') ? 8 : 0), 'پیچیدگی و حساسیت HSE پیمانکار با سابقهٔ مشابه می‌طلبد.'],
    ['open', 35 + (c.b('openTender') ? 30 : 0) + (c.v('buildMarket') - 3) * 6 + (m >= 2 ? 8 : -8), 'رقابت حداکثری و شفافیت.'],
    ['framework', 25 + (c.v('standardization') - 3) * 15, 'کارهای تکرارشونده با نرخ‌های از پیش توافق‌شده سریع‌تر واگذار می‌شوند.'],
    ['local', 25 + (c.v('localContent') - 3) * 18, 'الزام یا سیاست ساخت داخل.'],
    ['bundle', 25 + (6 - c.v('supplierAccess') - 3) * 12 + (c.v('longLead') - 3) * 6, 'دسترسی محدود به سازندگان، خرید تجمیعی و چانه‌زنی بیشتر را ایجاب می‌کند.'],
  ]
  const out = rows.map(([key, s, why]) => ({ key, fa: PROCUREMENT.find((p) => p.key === key)!.fa, score: Math.round(clamp(s, 0, 100)), recommended: s >= 55, reasons: [why] })).sort((a, b) => b.score - a.score)
  if (!out.some((x) => x.recommended)) out[0].recommended = true
  return out
}
function executionFit(c: Ctx): FitItem<ExecKey>[] {
  const m = c.maturity ?? 1.5, sch = c.v('scheduleCriticality'), len = c.v('lengthKm', 0)
  const rows: [ExecKey, number, string, string?][] = [
    ['sequential', 40 + (3 - sch) * 12 + (m >= 3 ? 8 : 0), 'کمترین دوباره‌کاری وقتی زمان حیاتی نیست.'],
    ['fasttrack', 30 + (sch - 3) * 15 + (c.b('fixedDeadline') ? 10 : 0) - (m <= 1 ? 5 : 0), 'هم‌پوشانی طراحی، تأمین و ساخت برای کوتاه‌کردن زمان.', m <= 1 ? 'با محدودهٔ ناپخته، مسیر سریع ریسک دوباره‌کاری بالایی دارد؛ بسته‌های آزادشده باید کنترل شوند.' : undefined],
    ['concurrent', 35 + (sch - 3) * 10 + (c.v('ownerPm') - 3) * 6 + (m >= 1 ? 5 : -10), 'آزادسازی کنترل‌شدهٔ بسته‌های مهندسی برای تأمین و ساخت.'],
    ['phased', 25 + (c.b('distinctScopes') ? 25 : 0) + (len >= 200 ? 15 : 0) + (c.b('brownfield') ? 15 : 0) + (c.v('budgetCertainty') <= 2 ? 10 : 0), 'فازهای قابل بهره‌برداری مستقل؛ درآمدزایی زودتر و تطبیق با جریان نقدی.'],
    ['modular', 15 + (c.v('modularPotential', c.type === 'pipeline' ? 1 : 3) - 3) * 18 + (c.v('siteAccess') - 3) * 8 + (c.type === 'offshore' ? 25 : 0), 'ساخت در کارگاه کنترل‌شده و کاهش کار در سایت دشوار.'],
    ['spreads', c.type === 'pipeline' ? 40 + (len >= 80 ? 25 : 0) + (sch - 3) * 6 + (c.v('buildMarket') - 3) * 5 : 0, 'اجرای هم‌زمان خط در چند جبهه با اکیپ کامل.'],
    ['earlyworks', 25 + (c.v('landRisk') - 3) * 12 + (c.v('siteAccess') - 3) * 8 + (c.v('permitRisk') - 3) * 6 + (sch - 3) * 4, 'راه دسترسی، تسطیح، کمپ و تملک پیش از پیمان اصلی.'],
    ['phasedcomm', 20 + (c.b('brownfield') ? 25 : 0) + (c.b('distinctScopes') ? 15 : 0) + (['plant', 'station', 'offshore'].includes(c.type) ? 15 : 0), 'راه‌اندازی سیستم‌به‌سیستم و کاهش ریسک راه‌اندازی.'],
  ]
  const out = rows.map(([key, s, why, caution]) => ({ key, fa: EXECUTION.find((e) => e.key === key)!.fa, score: Math.round(clamp(s, 0, 100)), recommended: s >= 55, reasons: [why], caution })).sort((a, b) => b.score - a.score)
  if (!out.some((x) => x.recommended)) out[0].recommended = true
  return out
}

// ── scenarios, sensitivity, input uncertainty
const SCENARIOS: { key: string; fa: string; w?: (w: Weights) => Partial<Weights>; a?: (a: Answers) => Answers }[] = [
  { key: 'base', fa: 'وضع پایه' },
  { key: 'schedule', fa: 'اولویت مطلق زمان', w: (w) => ({ ...w, time: w.time * 2 }) },
  { key: 'cost', fa: 'محدودیت بودجه و اولویت هزینه', w: (w) => ({ ...w, cost: w.cost * 2, costCert: w.costCert * 1.5 }) },
  { key: 'uncertain', fa: 'عدم قطعیت بالاتر محدوده و قیمت', a: (a) => ({ ...a, changeLikelihood: Math.min(5, num(a.changeLikelihood) + 1), inflation: Math.min(5, num(a.inflation) + 1), scopeMaturity: a.scopeMaturity == null ? a.scopeMaturity : String(Math.max(0, Number(a.scopeMaturity) - 1)) }) },
  { key: 'owner_thin', fa: 'توان کمتر کارفرما', a: (a) => ({ ...a, ownerPm: Math.max(1, num(a.ownerPm) - 1), ownerEng: Math.max(1, num(a.ownerEng) - 1) }) },
  { key: 'market_thin', fa: 'بازار پیمانکاری ضعیف‌تر', a: (a) => ({ ...a, epcMarket: Math.max(1, num(a.epcMarket) - 1), riskAppetite: Math.max(1, num(a.riskAppetite) - 1), supplierAccess: Math.max(1, num(a.supplierAccess) - 1) }) },
]
function num(x: unknown, d = 3) { return typeof x === 'number' ? x : d }

// ── gaps & contradictions
export function gaps(a: Answers): Gap[] {
  return QUESTIONS.filter((q) => visible(q, a) && !isAnswered(a[q.key])).map((q) => ({ key: q.key, fa: q.fa, critical: !!q.critical }))
}
export function contradictions(a: Answers): Contradiction[] {
  const c = new Ctx(a), out: Contradiction[] = []
  const m = c.maturity
  if (m != null && m >= 2 && c.known('changeLikelihood') && c.v('changeLikelihood') >= 4) out.push({ fa: 'طراحی پایه کامل گزارش شده، ولی احتمال تغییرات زیاد اعلام شده است؛ بلوغ واقعی محدوده باید بازبینی شود.', blocking: false })
  if (c.known('ownerPm') && c.v('ownerPm') >= 4 && c.known('experience') && c.v('experience') <= 1) out.push({ fa: 'توان مدیریت کارفرما «بسیار قوی» ولی تجربهٔ پروژهٔ مشابه «ندارد» اعلام شده است.', blocking: false })
  if (c.s('funding') === 'private' && c.b('revenue') === false) out.push({ fa: 'منبع مالی «سرمایه‌گذار خصوصی» است ولی طرح جریان درآمد مستقل ندارد؛ این دو با هم سازگار نیستند.', blocking: true })
  if (c.b('fixedDeadline') && c.known('scheduleCriticality') && c.v('scheduleCriticality') <= 2) out.push({ fa: 'تاریخ بهره‌برداری قطعی اعلام شده ولی اهمیت زمان «کم» ارزیابی شده است.', blocking: false })
  if (c.known('costPriority') && c.known('certaintyPriority') && c.known('scheduleCriticality') && c.v('costPriority') >= 5 && c.v('certaintyPriority') >= 5 && c.v('scheduleCriticality') >= 5) out.push({ fa: 'کمترین هزینه، قطعیت کامل مبلغ و کوتاه‌ترین زمان هم‌زمان حداکثر اعلام شده‌اند؛ اهداف با هم در تعارض‌اند و باید اولویت‌بندی شوند.', blocking: false })
  if (c.known('epcMarket') && c.v('epcMarket') >= 4 && c.known('riskAppetite') && c.v('riskAppetite') <= 1) out.push({ fa: 'بازار EPC «گسترده» ولی تمایل پیمانکاران به قیمت مقطوع «صفر» اعلام شده است.', blocking: false })
  if (c.b('ppAllowed') === false && c.s('funding') === 'private') out.push({ fa: 'منبع مالی «سرمایه‌گذار خصوصی» اعلام شده ولی چارچوب قانونی مشارکت بخش خصوصی وجود ندارد.', blocking: true })
  if (c.b('ppAllowed') === true && c.s('funding') === 'private' && c.known('investorInterest') && c.v('investorInterest') <= 1) out.push({ fa: 'تأمین مالی خصوصی فرض شده ولی سرمایه‌گذار علاقه‌ای ندارد.', blocking: true })
  if (c.b('directAllowed') === true && c.known('ownerBuild') && c.v('ownerBuild') >= 4 && c.known('ownerPm') && c.v('ownerPm') <= 1) out.push({ fa: 'کارفرما توان اجرایی کامل ولی توان مدیریت پروژهٔ محدود اعلام کرده است.', blocking: false })
  return out
}

/** the whole analysis */
export function evaluate(inp: EngineInput): Result {
  const a = inp.answers, reg = inp.registerRisks ?? []
  const w = normalise({ ...defaultWeights(a), ...(inp.weights ?? {}) })
  const months = inp.plannedMonths ?? (typeof a.durationMonths === 'number' ? a.durationMonths : null)
  const capex = inp.capex ?? (typeof a.capex === 'number' ? a.capex : null)
  const base = core(a, w, reg, months, capex)
  const viable = base.options.filter((o) => o.status !== 'excluded').sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99))
  const winner = viable[0] ?? null, runner = viable[1] ?? null

  // strengths / weaknesses / why lower
  for (const o of base.options) {
    const ranked = CRITERIA.map((cr) => ({ cr, v: o.profile[cr.key], wt: w[cr.key] })).sort((x, y) => y.v * y.wt - x.v * x.wt)
    o.strengths = ranked.filter((x) => x.v >= 4).slice(0, 4).map((x) => `${x.cr.fa} (${fmt(x.v)} از ۵)`)
    o.weaknesses = ranked.filter((x) => x.v <= 2).sort((x, y) => x.v * -x.wt - y.v * -y.wt).slice(0, 4).map((x) => `${x.cr.fa} (${fmt(x.v)} از ۵)`)
    if (o.status === 'excluded') o.reasonsAgainst = o.constraints.filter((k) => k.kind === 'exclude').map((k) => k.why)
    else if (winner && o.key !== winner.key) {
      const loss = CRITERIA.map((cr) => ({ cr, d: winner.contributions[cr.key] - o.contributions[cr.key] })).filter((x) => x.d > 0.5).sort((x, y) => y.d - x.d).slice(0, 3)
      o.reasonsAgainst = loss.map((x) => `در «${x.cr.fa}» ${fmt(x.d)} امتیاز وزنی کمتر از گزینهٔ برتر.`)
      if (o.status === 'conditional') o.reasonsAgainst.unshift(...o.constraints.filter((k) => k.kind === 'conditional').map((k) => `مشروط: ${k.why}`))
    }
  }

  const scenarios: ScenarioResult[] = SCENARIOS.map((s) => {
    const r = s.key === 'base' ? base : core(s.a ? s.a(a) : a, s.w ? normalise(s.w(w)) : w, reg, months, capex)
    const list = r.options.filter((o) => o.status !== 'excluded').sort((x, y) => y.score - x.score).map((o) => ({ key: o.key, score: o.score }))
    return { key: s.key, fa: s.fa, winner: list[0]?.key ?? null, ranking: list }
  })

  const sensitivity: SensitivityRow[] = CRITERIA.map((cr) => {
    const flip = (dir: 1 | -1) => {
      for (const f of dir === 1 ? [1.25, 1.5, 2, 3] : [0.75, 0.5, 0.25, 0]) {
        const ww = normalise({ ...w, [cr.key]: w[cr.key] * f })
        const top = rankOnly(base.options, ww)[0]
        if (top && winner && top !== winner.key) return { f, to: top }
      }
      return null
    }
    const up = flip(1), down = flip(-1)
    // how much the winner's lead over the runner-up moves when this weight goes from ×0.5 to ×1.5
    const lead = (f: number) => { const ww = normalise({ ...w, [cr.key]: w[cr.key] * f }); const s = rankScores(base.options, ww); return winner && runner ? (s.get(winner.key) ?? 0) - (s.get(runner.key) ?? 0) : 0 }
    return { crit: cr.key, fa: cr.fa, flipUp: up?.f ?? null, flipDown: down?.f ?? null, flipTo: (up ?? down)?.to ?? null, swing: r1(Math.abs(lead(1.5) - lead(0.5))) }
  }).sort((x, y) => y.swing - x.swing)

  // unknown 1–5 answers set to their worst and best ends
  const unknownScales = QUESTIONS.filter((q) => q.type === 'scale' && visible(q, a) && !isAnswered(a[q.key]))
  const fill = (v: number) => ({ ...a, ...Object.fromEntries(unknownScales.map((q) => [q.key, v])) })
  const opt = unknownScales.length ? core(fill(5), w, reg, months, capex).ranking[0] ?? null : winner?.key ?? null
  const pes = unknownScales.length ? core(fill(1), w, reg, months, capex).ranking[0] ?? null : winner?.key ?? null
  const inputUncertainty = { optimistic: opt, pessimistic: pes, stable: opt === (winner?.key ?? null) && pes === (winner?.key ?? null), unknownScales: unknownScales.length }

  const gs = gaps(a), cons = contradictions(a)
  const gap = winner && runner ? r1(winner.score - runner.score) : 0
  const conf = confidence({ gaps: gs, cons, gap, scenarios, winner: winner?.key ?? null, sensitivity, inputStable: inputUncertainty.stable, winnerStatus: winner?.status ?? null })

  const pricing = pricingFit(base.c, winner?.key ?? null, base.options), procurement = procurementFit(base.c), execution = executionFit(base.c)
  const recommendation: Recommendation | null = winner ? {
    method: winner.key, methodFa: winner.fa, definitive: conf.decisive,
    pricing: pricing.filter((p) => p.recommended).map((p) => p.key), procurement: procurement.filter((p) => p.recommended).map((p) => p.key), execution: execution.filter((p) => p.recommended).map((p) => p.key),
    statement: conf.decisive
      ? `روش «${winner.fa}» با امتیاز ${fmt(winner.score)} از ۱۰۰ و فاصلهٔ ${fmt(gap)} امتیاز از گزینهٔ دوم پیشنهاد می‌شود.`
      : `بر پایهٔ اطلاعات فعلی، «${winner.fa}»${runner && gap < 2 ? ` و «${runner.fa}»` : ''} در رتبهٔ نخست ${runner && gap < 2 ? 'قرار دارند' : 'است'}، اما به دلیل ${conf.reasons.slice(0, 2).join(' و ')} پیشنهاد قطعی ارائه نمی‌شود و نتیجه فقط جهت‌دهنده است.`,
  } : null

  return {
    engineVersion: ENGINE_VERSION, weights: w, options: base.options, ranking: base.ranking, winner: winner?.key ?? null, runnerUp: runner?.key ?? null, gap,
    pricing, procurement, execution, risks: base.rows, registerRisks: reg, scenarios, sensitivity, inputUncertainty, gaps: gs, contradictions: cons, confidence: conf, recommendation,
  }
}
function rankScores(opts: OptionResult[], w: Weights): Map<MethodKey, number> {
  return new Map(opts.filter((o) => o.status !== 'excluded').map((o) => [o.key, score(o.profile, w).score]))
}
function rankOnly(opts: OptionResult[], w: Weights): MethodKey[] {
  return [...rankScores(opts, w).entries()].sort((x, y) => y[1] - x[1]).map((x) => x[0])
}
function confidence(x: { gaps: Gap[]; cons: Contradiction[]; gap: number; scenarios: ScenarioResult[]; winner: MethodKey | null; sensitivity: SensitivityRow[]; inputStable: boolean; winnerStatus: OptionResult['status'] | null }): Confidence {
  let s = 100
  const reasons: string[] = []
  const crit = x.gaps.filter((g) => g.critical).length, other = x.gaps.length - crit
  if (crit) { s -= crit * 8; reasons.push(`${fa(crit)} پاسخ کلیدی نامشخص است`) }
  if (other) s -= Math.min(20, other * 2)
  if (x.cons.length) { s -= x.cons.length * 8; reasons.push(`${fa(x.cons.length)} تعارض در اطلاعات ورودی وجود دارد`) }
  if (x.gap < 3) s -= 15; else if (x.gap < 6) { s -= 8; reasons.push('فاصلهٔ دو گزینهٔ نخست کم است') }
  const kept = x.scenarios.filter((r) => r.winner === x.winner).length
  if (kept < x.scenarios.length) { s -= (x.scenarios.length - kept) * 4; if (kept <= x.scenarios.length / 2) reasons.push(`گزینهٔ برتر فقط در ${fa(kept)} از ${fa(x.scenarios.length)} سناریو برتر می‌ماند`) }
  const fragile = x.sensitivity.filter((r) => r.flipUp === 1.25 || r.flipDown === 0.75)
  if (fragile.length) { s -= 10; reasons.push(`تغییر ۲۵٪ وزن «${fragile[0].fa}» گزینهٔ برتر را عوض می‌کند`) } else if (x.sensitivity.some((r) => r.flipUp === 1.5 || r.flipDown === 0.5)) s -= 5
  if (!x.inputStable) { s -= 10; reasons.push('پاسخ‌های نامشخص می‌توانند گزینهٔ برتر را تغییر دهند') }
  if (x.winnerStatus === 'conditional') { s -= 10; reasons.push('گزینهٔ برتر به شرط قانونی تأییدنشده وابسته است') }
  s = Math.max(0, Math.min(100, Math.round(s)))
  const blocking = x.cons.some((k) => k.blocking)
  if (blocking) reasons.unshift('تعارض اساسی در اطلاعات ورودی')
  const tie = x.gap < 2
  if (tie) reasons.unshift('دو گزینهٔ نخست عملاً هم‌امتیازند و انتخاب میان آن‌ها داوری مدیریت می‌خواهد')
  const decisive = !!x.winner && s >= 55 && crit <= 2 && !blocking && x.winnerStatus === 'ok' && !tie
  // a non-decisive result is never shown as «high» confidence, whatever its data completeness
  const level: Confidence['level'] = s >= 75 && decisive ? 'high' : s >= 55 ? 'medium' : 'low'
  return { score: s, level, decisive, reasons }
}
const fa = (n: number) => n.toLocaleString('fa-IR')
const fmt = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 })
