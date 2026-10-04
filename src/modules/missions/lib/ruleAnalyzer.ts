import type { FindingDetails, FindingKind, Priority } from '../types'
import type { Slot } from './questionSets'
import { addDaysIso, jalaliMonthLength, jalaliToIso, JALALI_MONTHS, isoToJalali, normalizeFa, wordCount } from './fa'

/**
 * Deterministic, offline analysis of one interview answer (Persian). This is the version-1 intelligence:
 * lexicons, patterns and slot detectors — no AI. The AI layer (../ai) can replace or enrich any result
 * with the same shape; the interview engine never depends on which produced it.
 */

export interface ExtractedFinding {
  /** Stable identity used to merge repeated mentions of the same thing. */
  key: string
  kind: FindingKind
  topicKey: string
  title: string
  description: string
  details: FindingDetails
  severity: Priority
  ownerText: string
  dueDate: string | null
  confidence: number
}

export interface AnalysisInput {
  topicKey: string
  answer: string
  /** ISO date used to resolve relative dates ("دو هفته دیگر"). */
  today: string
  /** Default kind of an ambiguous problem statement in this topic. */
  defaultKind?: FindingKind
  /** The topic's own vocabulary. */
  lexicon?: string[]
  /** When the answer responds to a follow-up: which finding/slot it is filling. */
  target?: { findingKey: string; slot: Slot; findingTitle: string }
  /** Findings already known in this topic (to avoid duplicates). */
  known?: { key: string; title: string; kind: FindingKind }[]
}

export interface AnalysisResult {
  findings: ExtractedFinding[]
  /** Slot values to write into existing findings (follow-up answers, or extra detail volunteered). */
  slotFills: { findingKey: string; slot: Slot; value: string }[]
  metrics: Record<string, number>
  sentiment: 'positive' | 'neutral' | 'negative'
  nothingToReport: boolean
  unknown: boolean
  vague: boolean
  /** Compact paraphrase for the topic notes. */
  summary: string
  /** Which engine produced this. */
  source: 'rules' | 'ai'
  /** AI only: a naturally-phrased follow-up for the slot the engine asked about. */
  followUpText?: string
}

// ------------------------------------------------------------------------------------- lexicons

const ISSUE_WORDS = [
  'تاخیر', 'عقب', 'مشکل', 'نقص', 'ایراد', 'معطل', 'متوقف', 'توقف', 'خرابی', 'کمبود', 'عدم', 'نرسیده', 'نرسیدن',
  'تحویل نشده', 'تحویل نشد', 'ناقص', 'اختلاف', 'مغایرت', 'عدم انطباق', 'ncr', 'رد شد', 'رد شده', 'معیوب', 'گیر',
  'مانع', 'شکایت', 'حادثه', 'آسیب', 'نشتی', 'ترک', 'نامناسب', 'نامطلوب', 'افتاده', 'افت', 'گران', 'بحران', 'خسارت', 'عدم رعایت',
  'مصدوم', 'نارضایتی', 'تعویق', 'بلاتکلیف', 'نامشخص بودن', 'پیش نرفته',
]
const RISK_WORDS = ['ریسک', 'خطر', 'احتمال', 'ممکن است', 'ممکنه', 'نگران', 'تهدید', 'بیم', 'محتمل', 'امکان دارد', 'شاید', 'در صورت', 'اگر ', 'ممکن بود', 'می تواند باعث', 'میتواند باعث']
const ACTION_WORDS = ['باید', 'لازم است', 'نیاز است', 'نیاز به', 'پیگیری شود', 'اقدام', 'بررسی شود', 'ارسال شود', 'هماهنگ شود', 'انجام شود', 'بایستی', 'ضروری', 'پیشنهاد می', 'توصیه می', 'لازمه', 'بهتر است']
const COMMIT_WORDS = ['متعهد شد', 'متعهد شدند', 'تعهد داد', 'تعهد دادند', 'تعهد کرد', 'قول داد', 'قول دادند', 'اعلام کرد که', 'اعلام کردند که', 'خواهد داد', 'خواهند داد', 'تحویل می دهد', 'تحویل می دهند', 'تحویل خواهد', 'تعهد', 'می رساند', 'تضمین']
const DECISION_WORDS = ['تصمیم گرفته شد', 'تصمیم گرفتیم', 'توافق شد', 'توافق کردیم', 'مقرر شد', 'مصوب شد', 'مصوب', 'تصویب شد', 'قرار شد', 'تایید شد', 'توافق', 'تصمیم']
const POSITIVE_WORDS = ['خوب', 'مطلوب', 'رضایت', 'مطابق برنامه', 'بدون مشکل', 'عالی', 'قابل قبول', 'مناسب', 'پیش رفته', 'جلوتر']
const NEGATIVE_WORDS = ['بد', 'نگران کننده', 'نامطلوب', 'عقب', 'تاخیر', 'ضعیف', 'بحرانی', 'مشکل']

const NOTHING_PATTERNS = [
  /(موردی|مشکلی|مانعی|ریسکی|حادثه ای|نقصی|مساله ای|چیزی|ایرادی|عدم انطباقی|توافقی|تصمیمی|مستندی|پیشنهادی|اقدامی|تعهدی)\s*(خاصی\s*)?(نبود|نداشتیم|ندیدم|مشاهده نشد|وجود ندارد|وجود نداشت|ندارد|نداریم|گزارش نشد|نیست|نشد|ندارم)/,
  /(همه چیز|وضعیت)\s*(خوب|عادی|مطابق)/,
  /بدون\s*(مشکل|حادثه|مانع|تاخیر|مورد)/,
  /^(ندارم|ندارد|نه|خیر|هیچ|مورد دیگری نبود|مورد دیگری نداشتم|نداشتم|نبود)\b/,
  /مورد دیگری\s*(نبود|نداشتم|ندیدم)/,
  /مورد خاصی\s*(نبود|نداشتم|ندیدم)/,
  /(مطابق برنامه|مطابق با برنامه)\s*(است|بود|پیش)/,
]
const UNKNOWN_PATTERNS = [/نمی ?دانم/, /اطلاع ندارم/, /مشخص نیست/, /نامشخص/, /اعلام نشده/, /نگفتند/, /معلوم نیست/, /اطلاعی ندارم/, /هنوز تعیین نشده/]

const NEG_AFTER = '(?:\\s+[^\\s]+){0,2}?\\s*(?:نیست|نبود|ندارد|نداریم|نداشت|ندیدم|ندیدیم|نشد|وجود ندارد|وجود نداشت|مشاهده نشد)'

function isNegated(norm: string, word: string): boolean {
  const w = word.trim()
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`بدون\\s+${escaped}`).test(norm)) return true
  return new RegExp(`${escaped}(?:ی|ای|ها|هایی)?${NEG_AFTER}`).test(norm)
}

function hits(norm: string, words: string[]): string[] {
  return words.filter((w) => norm.includes(w) && !isNegated(norm, w))
}

// ------------------------------------------------------------------------------------- helpers

const STOP = new Set(['از', 'در', 'به', 'با', 'که', 'را', 'این', 'آن', 'است', 'شد', 'شده', 'می', 'و', 'برای', 'تا', 'هم', 'هر', 'یک', 'بود', 'بر', 'یا', 'ولی', 'اما', 'هنوز', 'نیز', 'ها', 'های', 'ای', 'خود', 'همین', 'باید', 'دارد', 'دارند', 'شود', 'کرد', 'کرده', 'کردند', 'بوده'])

export function contentTokens(s: string): string[] {
  return normalizeFa(s)
    .replace(/[^\p{L}\d\s]/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w))
}

export function similarity(a: string, b: string): number {
  const A = new Set(contentTokens(a))
  const B = new Set(contentTokens(b))
  if (!A.size || !B.size) return 0
  let inter = 0
  A.forEach((x) => B.has(x) && inter++)
  return inter / Math.min(A.size, B.size)
}

function shortHash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function findingKey(kind: FindingKind, topicKey: string, title: string): string {
  const toks = contentTokens(title).slice(0, 4).sort().join('-')
  return `${kind}:${topicKey}:${shortHash(toks)}`
}

export function splitSentences(text: string): string[] {
  return text
    .split(/[.!؟?؛\n\r]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 2)
}

const LEAD_TRIM = /^(همچنین|ضمنا|ضمناً|البته|اما|ولی|و|که|یعنی|در ضمن|علاوه بر این|بعد از آن|بعد|الان|فعلا|فعلاً|خب|بله)\s+/u

export function makeTitle(sentence: string): string {
  let s = sentence.trim().replace(LEAD_TRIM, '').replace(LEAD_TRIM, '')
  s = s.split(/\s(?:ولی|اما|اگرچه|هرچند|در حالی که)\s/u)[0]
  const comma = s.split(/[،,]/)[0]
  if (comma.length >= 14 && contentTokens(comma).length >= 3 && !/^(ممکن|در صورت|اگر|شاید|احتمال|چنانچه)/.test(normalizeFa(comma))) s = comma
  s = s.replace(/[\s،,.:؛]+$/u, '')
  if (s.length > 84) s = s.slice(0, 84).replace(/\s+\S*$/, '') + '…'
  return s
}

// ------------------------------------------------------------------------------------- numbers & dates

const NUM_WORDS: Record<string, number> = {
  یک: 1, دو: 2, سه: 3, چهار: 4, پنج: 5, شش: 6, هفت: 7, هشت: 8, نه: 9, ده: 10, پانزده: 15, بیست: 20, سی: 30, چهل: 40, پنجاه: 50, شصت: 60, نود: 90,
}

function numberFrom(token: string): number | null {
  if (/^\d+$/.test(token)) return Number(token)
  return NUM_WORDS[token] ?? null
}

const MONTH_NAMES = JALALI_MONTHS.map((m) => normalizeFa(m))

function jalaliYearOf(todayIso: string): number {
  return isoToJalali(todayIso)?.jy ?? 1405
}

function endOfJalaliMonth(todayIso: string, month?: number): string {
  const j = isoToJalali(todayIso)
  if (!j) return todayIso
  const m = month ?? j.jm
  const y = month && month < j.jm ? j.jy + 1 : j.jy
  return jalaliToIso(y, m, jalaliMonthLength(y, m))
}

/** Resolve a Persian date expression — absolute (۱۴۰۵/۰۶/۲۱, "۲۱ شهریور") or relative ("دو هفته دیگر"). */
export function extractDate(text: string, todayIso: string): string | null {
  const n = normalizeFa(text)
  let m = n.match(/(1[34]\d{2})[/\-.](\d{1,2})[/\-.](\d{1,2})/)
  if (m) return jalaliToIso(Number(m[1]), Number(m[2]), Number(m[3]))
  m = n.match(/(20\d{2})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  m = n.match(new RegExp(`(\\d{1,2})\\s*(${MONTH_NAMES.join('|')})(?:\\s*(?:ماه)?\\s*(1[34]\\d{2}))?`))
  if (m) {
    const month = MONTH_NAMES.indexOf(m[2]) + 1
    const year = m[3] ? Number(m[3]) : jalaliYearOf(todayIso)
    return jalaliToIso(year, month, Math.min(Number(m[1]), jalaliMonthLength(year, month)))
  }
  m = n.match(new RegExp(`تا (?:پایان|آخر|اواخر)\\s*(?:ماه\\s*)?(${MONTH_NAMES.join('|')})`))
  if (m) return endOfJalaliMonth(todayIso, MONTH_NAMES.indexOf(m[1]) + 1)

  if (/پس ?فردا/.test(n)) return addDaysIso(todayIso, 2)
  if (/\bفردا\b/.test(n)) return addDaysIso(todayIso, 1)
  if (/\bامروز\b/.test(n)) return todayIso
  if (/تا (?:پایان|آخر|اواخر) (?:این )?هفته/.test(n)) return addDaysIso(todayIso, 5)
  if (/تا (?:پایان|آخر|اواخر) (?:این )?ماه/.test(n)) return endOfJalaliMonth(todayIso)
  if (/تا (?:پایان|آخر) (?:این )?سال/.test(n)) {
    const y = jalaliYearOf(todayIso)
    return jalaliToIso(y, 12, jalaliMonthLength(y, 12))
  }

  m = n.match(/(\d+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|پانزده|بیست|سی|چهل|پنجاه|شصت|نود)\s*(روز|هفته|ماه)\s*(?:دیگر|آینده|بعد|بعدی|مهلت|فرصت|زمان)/)
  if (m) {
    const k = numberFrom(m[1])
    if (k != null) return addDaysIso(todayIso, k * (m[2] === 'روز' ? 1 : m[2] === 'هفته' ? 7 : 30))
  }
  if (/(هفته آینده|هفته بعد|هفته دیگر)/.test(n)) return addDaysIso(todayIso, 7)
  if (/(ماه آینده|ماه بعد|ماه دیگر)/.test(n)) return addDaysIso(todayIso, 30)
  return null
}

/** Total days of delay mentioned ("۳ هفته تأخیر", "دو ماه عقب"), or null. */
export function extractDelayDays(norm: string): number | null {
  const m = norm.match(/(\d+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|پانزده|بیست|سی)\s*(روز|هفته|ماه)\s*(?:تاخیر|عقب|دیرکرد|تعویق|تاخیر دارد)/)
    ?? norm.match(/(?:تاخیر|عقب ماندگی|دیرکرد)\s*(?:حدود|بیش از|نزدیک به)?\s*(\d+|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|پانزده|بیست|سی)\s*(روز|هفته|ماه)/)
  if (!m) return null
  const k = numberFrom(m[1])
  if (k == null) return null
  return k * (m[2] === 'روز' ? 1 : m[2] === 'هفته' ? 7 : 30)
}

export function extractMetrics(text: string): Record<string, number> {
  const n = normalizeFa(text)
  const out: Record<string, number> = {}
  const re = /(\d+(?:\.\d+)?)\s*(?:درصد|%)/g
  const found: { v: number; ctx: string; idx: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(n))) found.push({ v: Number(m[1]), ctx: n.slice(Math.max(0, m.index - 28), m.index), idx: m.index })
  const labelled = found.map((f) => {
    const c = f.ctx
    const lastPlanned = Math.max(c.lastIndexOf('برنامه'), c.lastIndexOf('مصوب'), c.lastIndexOf('پیش بینی'), c.lastIndexOf('planned'), c.lastIndexOf('بایست'))
    const lastActual = Math.max(c.lastIndexOf('واقعی'), c.lastIndexOf('محقق'), c.lastIndexOf('انجام'), c.lastIndexOf('actual'), c.lastIndexOf('فعلی'), c.lastIndexOf('پیشرفت'))
    const label = lastPlanned === -1 && lastActual === -1 ? null : lastPlanned > lastActual ? 'planned' : 'actual'
    return { ...f, label }
  })
  for (const f of labelled) if (f.label && out[f.label] == null && f.v <= 100) out[f.label] = f.v
  const unlabelled = labelled.filter((f) => !f.label && f.v <= 100)
  if (unlabelled.length >= 2) {
    if (out.actual == null) out.actual = unlabelled[0].v
    if (out.planned == null) out.planned = unlabelled[1].v
  } else if (unlabelled.length === 1) {
    if (out.actual == null && out.planned == null) out.actual = unlabelled[0].v
    else if (out.actual == null) out.actual = unlabelled[0].v
    else if (out.planned == null) out.planned = unlabelled[0].v
  }
  return out
}

// ------------------------------------------------------------------------------------- slots

const PERSON_ROLE = '(?:آقای|خانم|مهندس|دکتر)'
const ORG_ROLE = '(?:شرکت|گروه|سازمان|موسسه)'
const GENERIC_ROLE = '(?:پیمانکار جزء|پیمانکار|سازنده|تامین ?کننده|فروشنده|کارفرما|مشاور|ناظر|سرپرست|مدیر پروژه|مدیر|واحد [^\\s،.؛:]+)'
const ANY_ROLE = `(?:${PERSON_ROLE}|${ORG_ROLE}|${GENERIC_ROLE})`

function cleanParty(s: string): string {
  return s.replace(/\s+(است|می|باید|بود|خواهد|تا|را|هم|نیز|که|داد|دادند|گفت|گفتند)(\s.*)?$/, '').trim()
}

/** Who is responsible / involved: a named person ("آقای رضایی"), a named company ("شرکت X") or a bare role ("پیمانکار"). */
export function extractParty(text: string): string {
  const n = normalizeFa(text)
  const explicit = n.match(new RegExp(`مسئول(?:یت)?(?: آن| این| کار| پیگیری)?(?: با| بر عهده| را)?\\s*(${ANY_ROLE}(?:\\s+[^\\s،.؛:]+){0,2})`))
  if (explicit) return normalizePartyMatch(explicit[1])
  const person = n.match(new RegExp(`(${PERSON_ROLE}|${ORG_ROLE})\\s+([^\\s،.؛:]+(?:\\s+[^\\s،.؛:]+)?)`))
  if (person) return normalizePartyMatch(person[0])
  const generic = n.match(new RegExp(`(${GENERIC_ROLE})`))
  return generic ? generic[1].trim() : ''
}

function normalizePartyMatch(raw: string): string {
  const words = cleanParty(raw).split(' ')
  const head = words[0]
  if (/^(آقای|خانم|مهندس|دکتر|شرکت|گروه|سازمان|موسسه)$/.test(head)) {
    const rest = words.slice(1).filter((w) => !STOP.has(w))
    return [head, ...rest.slice(0, 2)].join(' ')
  }
  return words.slice(0, 2).filter((w, i) => i === 0 || /^(جزء|پروژه|اصلی)$/.test(w)).join(' ')
}

function slotFromSentence(slot: Slot, sentence: string, today: string): string {
  const n = normalizeFa(sentence)
  switch (slot) {
    case 'cause': {
      const m = n.match(/(?:به دلیل|بخاطر|به خاطر|به علت|علت (?:آن|این|تاخیر)?(?: این است| آن است)?(?: که)?|چون|ناشی از|از آنجا که|بدلیل)\s+(.+)/)
      return m ? m[1].trim() : ''
    }
    case 'impact': {
      const m = n.match(/(?:باعث|منجر|اثر(?: دارد| می)?|تاثیر|سبب|موجب|به تاخیر می ?اندازد|پیامد)\s*(.+)/)
      return m ? m[0].trim() : ''
    }
    case 'status': {
      return /(?:در حال|هنوز|تاکنون|فعلا|فعلاً|الان|تحویل شده|انجام شد|متوقف)/.test(n) ? sentence.trim() : ''
    }
    case 'party':
    case 'owner':
      return extractParty(sentence)
    case 'newDate':
    case 'due': {
      const d = extractDate(sentence, today)
      return d ?? ''
    }
    case 'needAction':
      return hits(n, ACTION_WORDS).length ? sentence.trim() : ''
    case 'probability': {
      if (/(زیاد|بالا|محتمل|قطعا)/.test(n)) return 'زیاد'
      if (/(متوسط|نسبتا)/.test(n)) return 'متوسط'
      if (/(کم|پایین|بعید)/.test(n)) return 'کم'
      return ''
    }
    case 'mitigation':
      return /(راهکار|پیشنهاد|می توان|باید|جایگزین|تسریع|هماهنگ|پیگیری)/.test(n) ? sentence.trim() : ''
  }
}

// ------------------------------------------------------------------------------------- severity

export function estimateSeverity(norm: string, topicKey: string, kind: FindingKind): Priority {
  let level = 1 // 0 low 1 medium 2 high 3 critical
  if (/(جزیی|جزئی|کوچک|ناچیز|محدود|اندک)/.test(norm)) level = 0
  if (/(مهم|جدی|حاد|مسیر بحرانی|فوری|خیلی|شدید|زیاد)/.test(norm)) level = Math.max(level, 2)
  const withoutCriticalPath = norm.replace(/مسیر بحرانی/g, 'مسیر-حیاتی')
  if (/مسیر-حیاتی/.test(withoutCriticalPath)) level = Math.max(level, 2)
  if (/(بحرانی|فوت|مصدوم|توقف کامل|متوقف شده|انفجار|آتش سوزی|آتش)/.test(withoutCriticalPath)) level = 3
  const delay = extractDelayDays(norm)
  if (delay != null) level = Math.max(level, delay >= 180 ? 3 : delay >= 30 ? 2 : delay >= 7 ? 1 : level)
  if (topicKey === 'hse' && kind === 'issue' && /(حادثه|مصدوم|آسیب|سقوط|ریزش|نشتی|عدم رعایت|بدون)/.test(norm)) level = Math.max(level, 2)
  return (['low', 'medium', 'high', 'critical'] as const)[Math.min(3, level)]
}

// ------------------------------------------------------------------------------------- classification

interface SentenceClass {
  kind: FindingKind | null
  score: number
}

function classify(norm: string): SentenceClass {
  const scores: [FindingKind, number][] = [
    ['commitment', hits(norm, COMMIT_WORDS).length ? 3 + hits(norm, COMMIT_WORDS).length * 0.1 : 0],
    ['decision', hits(norm, DECISION_WORDS).length ? 3 + hits(norm, DECISION_WORDS).length * 0.1 : 0],
    ['risk', hits(norm, RISK_WORDS).length ? 2 + hits(norm, RISK_WORDS).length * 0.1 : 0],
    ['issue', hits(norm, ISSUE_WORDS).length ? 2 + hits(norm, ISSUE_WORDS).length * 0.1 : 0],
    ['action', hits(norm, ACTION_WORDS).length ? 2 + hits(norm, ACTION_WORDS).length * 0.1 : 0],
  ]
  let best: SentenceClass = { kind: null, score: 0 }
  for (const [kind, score] of scores) if (score > best.score) best = { kind, score }
  return best
}

const SHORT_NEGATION = /(نبود|ندیدم|ندیدیم|نداشتیم|نداریم|ندارد|ندارم|مشاهده نشد|وجود ندارد|وجود نداشت|نیست|نشد|گزارش نشد)\s*$/

export function detectNothing(norm: string): boolean {
  const n = norm.trim().replace(/[.!؟?،\s]+$/u, '')
  if (!n) return false
  if (wordCount(n) > 14) return false
  // Any un-negated problem/commitment/decision word means there IS something to report
  // ("خرید شیرها عقب افتاده است ولی بقیه مطابق برنامه است").
  if (hits(n, [...ISSUE_WORDS, ...COMMIT_WORDS, ...DECISION_WORDS, ...RISK_WORDS]).length) return false
  if (NOTHING_PATTERNS.some((re) => re.test(n))) return true
  // A short answer that simply ends in a negation ("ریسک جدیدی ندیدم", "مورد خاصی نبود").
  return wordCount(n) <= 7 && SHORT_NEGATION.test(n) && !/(ولی|اما|جز|به جز|بجز)/.test(n)
}

export function detectUnknown(norm: string): boolean {
  return UNKNOWN_PATTERNS.some((re) => re.test(norm))
}

function sentimentOf(norm: string): 'positive' | 'neutral' | 'negative' {
  const pos = POSITIVE_WORDS.filter((w) => norm.includes(w) && !isNegated(norm, w)).length
  const neg = NEGATIVE_WORDS.filter((w) => norm.includes(w) && !isNegated(norm, w)).length
  if (neg > pos) return 'negative'
  if (pos > neg) return 'positive'
  return 'neutral'
}

/** Quick check that the answer is too thin to learn anything from. */
function isVague(norm: string, hadFindings: boolean, nothing: boolean, unknown: boolean): boolean {
  if (nothing || unknown || hadFindings) return false
  const words = wordCount(norm)
  const hasNumber = /\d/.test(norm)
  return words < 4 && !hasNumber
}

// ------------------------------------------------------------------------------------- main entry

/** Objective achievement from a free-text answer. */
export function classifyObjectiveAnswer(text: string): 'achieved' | 'partial' | 'not_achieved' | 'follow_up' {
  const n = normalizeFa(text)
  if (/(محقق نشد|انجام نشد|نشد|موفق نشد|حاصل نشد|نرسیدیم|نه\b|خیر)/.test(n) && !/تا حدی|نسبتا|بخشی/.test(n)) return 'not_achieved'
  if (/(تا حدی|نسبتا|بخشی|نیمه|ناقص|قسمتی|کامل نشد|مانده|باقی|پیگیری)/.test(n)) return /پیگیری/.test(n) && !/تا حدی|بخشی|نسبتا/.test(n) ? 'follow_up' : 'partial'
  if (/(محقق|انجام شد|کامل|بله|حاصل شد|موفق|گرفتیم|رسیدیم|تایید شد)/.test(n)) return 'achieved'
  return 'follow_up'
}


/** A sentence that merely supplies a missing fact about the finding just stated ("مسئول پیگیری آقای رضایی است",
 * "حدود سه ماه تأخیر دارد و مسیر بحرانی را تحت تأثیر قرار می‌دهد") must enrich that finding, not become a new one. */
function continuationSlots(sn: string, sentence: string, today: string): Partial<Record<Slot, string>> | null {
  if (hits(sn, COMMIT_WORDS).length || hits(sn, DECISION_WORDS).length) return null
  const slots: Partial<Record<Slot, string>> = {}
  if (/^(مسئول|مسئولیت|پیگیری با)/.test(sn)) {
    const p = extractParty(sentence)
    if (p) slots.party = p
  }
  if (/^(علت|دلیل|به دلیل|بخاطر|به خاطر|به علت|چون|ناشی)/.test(sn)) {
    slots.cause = sentence.replace(/^\s*(علت|دلیل)\s*(آن|این|اصلی)?\s*(هم)?\s*/u, '').trim()
  }
  if (/(تحت تاثیر|باعث|منجر|پیامد|اثر دارد|اثر می|تاثیر|مسیر بحرانی|به تاخیر)/.test(sn) || (extractDelayDays(sn) != null && !/^(تامین|ساخت|نصب|تحویل)/.test(sn))) {
    slots.impact = sentence.trim()
  }
  if (/^(موعد|تاریخ)( جدید)?/.test(sn)) {
    const d = extractDate(sentence, today)
    if (d) slots.newDate = d
  }
  return Object.keys(slots).length ? slots : null
}

export function analyzeAnswer(input: AnalysisInput): AnalysisResult {
  const raw = input.answer.trim()
  const norm = normalizeFa(raw)
  const nothing = detectNothing(norm)
  const unknown = detectUnknown(norm)
  const metrics = extractMetrics(raw)
  const result: AnalysisResult = {
    findings: [],
    slotFills: [],
    metrics,
    sentiment: sentimentOf(norm),
    nothingToReport: nothing,
    unknown,
    vague: false,
    summary: raw.length > 240 ? raw.slice(0, 240).replace(/\s+\S*$/, '') + '…' : raw,
    source: 'rules',
  }

  // A direct answer to a follow-up fills its slot, whatever its wording.
  if (input.target) {
    const { findingKey, slot } = input.target
    let value = ''
    if (unknown || nothing) value = slot === 'newDate' || slot === 'due' ? 'اعلام نشده' : 'نامشخص'
    else {
      value = slotFromSentence(slot, raw, input.today)
      if (!value) {
        if (slot === 'newDate' || slot === 'due') value = unknown ? 'اعلام نشده' : /(نه|خیر|نشده|ندارد)/.test(norm) && wordCount(norm) <= 6 ? 'اعلام نشده' : ''
        else if (slot === 'party' || slot === 'owner') value = wordCount(norm) <= 8 ? raw.replace(/[.،\s]+$/u, '') : extractParty(raw) || raw.slice(0, 60)
        else value = raw
      }
    }
    if (value) result.slotFills.push({ findingKey, slot, value })
    // Do not also mine this answer for new findings if it was a short slot answer.
    if (wordCount(norm) <= 12) {
      result.vague = false
      return result
    }
  }

  if (nothing && !input.target) {
    result.vague = false
    return result
  }

  const sentences = splitSentences(raw)
  const extracted: ExtractedFinding[] = []
  let progressMentioned = false
  for (const sentence of sentences) {
    const sn = normalizeFa(sentence)
    if (Object.keys(extractMetrics(sentence)).length) progressMentioned = true
    const cls = classify(sn)
    let kind = cls.kind
    const prev = extracted[extracted.length - 1]

    // Continuation of the finding stated just before it.
    if (prev && (prev.kind === 'issue' || prev.kind === 'risk') && (kind === null || kind === 'issue' || kind === 'risk')) {
      const cont = continuationSlots(sn, sentence, input.today)
      if (cont) {
        const explicitOwner = /^(مسئول|مسئولیت)/.test(sn)
        for (const [slot, value] of Object.entries(cont)) if (value && (!prev.details[slot] || (slot === 'party' && explicitOwner))) prev.details[slot] = value
        if (cont.party && (!prev.ownerText || explicitOwner)) prev.ownerText = cont.party
        const sev = estimateSeverity(sn, input.topicKey, prev.kind)
        const order = ['low', 'medium', 'high', 'critical']
        if (order.indexOf(sev) > order.indexOf(prev.severity)) prev.severity = sev
        const delay = extractDelayDays(sn)
        if (delay != null) prev.details.delayDays = String(delay)
        prev.description += ' ' + sentence
        continue
      }
    }
    // In action/decision topics a plain statement of who-does-what is itself the finding.
    if (!kind && wordCount(sn) >= 4 && (input.defaultKind === 'action' || input.defaultKind === 'decision')) {
      const hasWho = !!extractParty(sentence)
      const hasWhen = !!extractDate(sentence, input.today)
      kind = input.defaultKind === 'decision' && hasWho && hasWhen ? 'commitment' : input.defaultKind
    }
    if (!kind) continue
    if (kind === 'action' && input.defaultKind !== 'action' && !/(باید|لازم|نیاز|پیگیری|اقدام|پیشنهاد)/.test(sn)) continue

    const title = makeTitle(sentence)
    if (title.length < 6) continue
    const severity = estimateSeverity(sn, input.topicKey, kind)
    const details: FindingDetails = {}
    const slotsToTry: Slot[] =
      kind === 'issue' ? ['cause', 'impact', 'party', 'newDate', 'needAction', 'status']
      : kind === 'risk' ? ['impact', 'probability', 'mitigation']
      : ['owner', 'due']
    for (const s of slotsToTry) {
      const v = slotFromSentence(s, sentence, input.today)
      if (v) details[s] = v
    }
    if (kind === 'issue') {
      const delay = extractDelayDays(sn)
      if (delay != null) details.delayDays = String(delay)
    }
    const owner = extractParty(sentence)
    const due = extractDate(sentence, input.today)
    const f: ExtractedFinding = {
      key: findingKey(kind, input.topicKey, title),
      kind,
      topicKey: input.topicKey,
      title,
      description: sentence,
      details,
      severity,
      ownerText: owner,
      dueDate: due,
      confidence: Math.min(0.95, 0.5 + (cls.score - 2) * 0.2 + (Object.keys(details).length ? 0.15 : 0)),
    }
    // Dedupe against what this answer already produced and what the topic already knows.
    const dupInBatch = extracted.find((e) => e.kind === f.kind && similarity(e.title, f.title) >= 0.6)
    const dupKnown = input.known?.find((k) => k.kind === f.kind && similarity(k.title, f.title) >= 0.6)
    if (dupInBatch) {
      for (const [k, v] of Object.entries(f.details)) if (v && !dupInBatch.details[k]) dupInBatch.details[k] = v
      continue
    }
    if (dupKnown) {
      for (const [slot, value] of Object.entries(f.details)) if (value) result.slotFills.push({ findingKey: dupKnown.key, slot: slot as Slot, value })
      continue
    }
    extracted.push(f)
  }

  result.findings = extracted
  if (progressMentioned && !Object.keys(metrics).length) result.metrics = extractMetrics(raw)
  result.vague = isVague(norm, extracted.length > 0 || result.slotFills.length > 0, nothing, unknown)
  return result
}

export { hits as _hits }
