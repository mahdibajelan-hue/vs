import type {
  Finding,
  FindingKind,
  InterviewState,
  Mission,
  Objective,
  ObjectiveStatus,
  PendingQuestion,
  Priority,
  TopicProgress,
} from '../types'
import {
  evalCond,
  fillTemplate,
  planTopics,
  type MissionContext,
  type QuestionDef,
  type QuestionSet,
  type Slot,
  type TopicDef,
} from './questionSets'
import { analyzeAnswer, classifyObjectiveAnswer, estimateSeverity, similarity, type AnalysisResult, type ExtractedFinding } from './ruleAnalyzer'
import { normalizeFa } from './fa'
import type { AiProvider } from '../ai/provider'

/**
 * Interview Engine — a generic interpreter of QuestionSet definitions.
 *
 *   Question → User Answer → Analysis → Determine Missing Information → Follow-up → Complete Topic → Next Topic
 *
 * Pure with respect to I/O: it takes the interview state and findings in, and returns the new state,
 * the findings, the conversation turns to append and any objective-status updates. Persistence belongs
 * to the store. The only async step is the (optional, fallible) AI provider, which can only ever
 * *replace the analysis*; which question to ask, and when a topic is done, is always decided here.
 */

export interface TurnDraft {
  topicKey: string
  role: 'assistant' | 'user' | 'system'
  kind: 'main' | 'followup' | 'system' | 'answer'
  text: string
  inputMode: 'text' | 'voice'
  meta?: Record<string, unknown>
}

export interface EngineInput {
  set: QuestionSet
  mission: Mission
  objectives: Objective[]
  projectType: string
  projectName: string
  today: string
  ai?: AiProvider | null
}

export interface StepResult {
  state: InterviewState
  findings: Finding[]
  turns: TurnDraft[]
  objectiveUpdates: { id: string; status: ObjectiveStatus; note: string }[]
  /** True when every topic in the plan is complete or skipped — the interview moves to its summary. */
  done: boolean
  analysis: AnalysisResult | null
  aiUsed: boolean
}

const SEVERITY_ORDER: Priority[] = ['critical', 'high', 'medium', 'low']
const KIND_ORDER: FindingKind[] = ['issue', 'risk', 'commitment', 'action', 'decision', 'progress', 'observation']

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ------------------------------------------------------------------------------------------- helpers

export function topicDef(set: QuestionSet, key: string): TopicDef {
  const t = set.topics.find((x) => x.key === key)
  if (!t) throw new Error(`unknown topic ${key}`)
  return t
}

function contextFor(input: EngineInput, state: InterviewState, findings: Finding[]): MissionContext {
  const answers: Record<string, string> = {}
  for (const [k, tp] of Object.entries(state.topics)) answers[k] = normalizeFa(tp.notes.join(' '))
  return {
    mission: input.mission,
    objectives: input.objectives,
    projectType: input.projectType,
    projectName: input.projectName,
    answers,
    openFindingKinds: findings.map((f) => ({ kind: f.kind, topicKey: f.topicKey })),
  }
}

/** Main questions of a topic with objective-repeating questions expanded. */
export function expandedQuestions(def: TopicDef, input: EngineInput): (QuestionDef & { objectiveId?: string })[] {
  const out: (QuestionDef & { objectiveId?: string })[] = []
  for (const q of def.mainQuestions) {
    if (q.repeatForObjective) {
      for (const o of input.objectives) {
        out.push({ ...q, id: `${q.id}:${o.id}`, objectiveId: o.id, text: q.text.replace('{objective}', o.title).replace('{measure}', o.measure ? ` (معیار: ${o.measure})` : '') })
      }
    } else out.push(q)
  }
  return out
}

export function findingKeyOf(f: Finding): string {
  return f.details._key ?? f.id
}

function requiredSlots(input: EngineInput, f: Finding): Slot[] {
  const spec = input.set.slots[f.kind]
  if (!spec) return []
  const base = [...spec.required]
  if ((f.severity === 'high' || f.severity === 'critical') && spec.requiredIfHigh) base.push(...spec.requiredIfHigh)
  return base
}

function slotFilled(f: Finding, slot: Slot): boolean {
  if (slot === 'owner' || slot === 'party') return !!(f.details[slot] || f.ownerText)
  if (slot === 'due' || slot === 'newDate') return !!(f.details[slot] || f.dueDate)
  return !!f.details[slot]
}

function askedSlots(f: Finding): string[] {
  return (f.details._asked ?? '').split(',').filter(Boolean)
}

/** The next fact the engine still wants about the most important open finding of a topic. */
function nextMissing(input: EngineInput, findings: Finding[], topicKey: string): { finding: Finding; slot: Slot } | null {
  const candidates = findings
    .filter((f) => f.topicKey === topicKey && f.approval !== 'rejected')
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
  for (const f of candidates) {
    for (const slot of requiredSlots(input, f)) {
      if (!slotFilled(f, slot) && !askedSlots(f).includes(slot)) return { finding: f, slot }
    }
  }
  return null
}

function shortTitle(t: string): string {
  return t.length > 48 ? t.slice(0, 48).replace(/\s+\S*$/, '') + '…' : t
}

function followUpText(input: EngineInput, f: Finding, slot: Slot, aiText?: string): string {
  if (aiText && aiText.length > 10) return aiText
  const templates = input.set.followUps[slot] ?? ['لطفاً درباره «{title}» بیشتر توضیح بدهید.']
  const asked = askedSlots(f).length
  const tpl = templates[Math.min(asked > 2 ? 1 : 0, templates.length - 1)]
  return tpl.replace('{title}', shortTitle(f.title))
}

// ----------------------------------------------------------------------------------------- initial state

export function initialState(input: EngineInput): { state: InterviewState; mandatory: string[] } {
  const ctx = contextFor(input, { plan: [], topics: {}, current: null, pending: null, asked: 0 }, [])
  const { plan, mandatory } = planTopics(input.set, ctx)
  const topics: Record<string, TopicProgress> = {}
  for (const key of plan) topics[key] = { mainAsked: [], followUps: 0, state: 'open', coverage: 0, notes: [], metrics: {} }
  return { state: { plan, topics, current: null, pending: null, asked: 0 }, mandatory }
}

export function startInterview(input: EngineInput): StepResult {
  const { state } = initialState(input)
  const first = state.plan[0]
  const turns: TurnDraft[] = [
    {
      topicKey: '',
      role: 'system',
      kind: 'system',
      text: `سلام. من دستیار گزارش بازدید هستم. می‌خواهم با چند سؤال کوتاه، یافته‌های بازدید «${input.projectName}» را از شما بگیرم و گزارش مدیریتی را آماده کنم. هر جا راحت‌ترید صحبت کنید (میکروفون) یا تایپ کنید. فقط همان‌قدر می‌پرسم که لازم باشد.`,
      inputMode: 'text',
    },
  ]
  const next = openTopic(input, state, [], first, turns)
  return { state: next, findings: [], turns, objectiveUpdates: [], done: false, analysis: null, aiUsed: false }
}

function topicIntro(def: TopicDef, mandatory: boolean): string {
  return `موضوع «${def.title}»${mandatory ? ' — این موضوع از اهداف مأموریت شماست' : ''}`
}

/** Starts a topic: pushes its intro and first applicable main question; returns the new state. */
function openTopic(input: EngineInput, state: InterviewState, findings: Finding[], key: string | undefined, turns: TurnDraft[]): InterviewState {
  if (!key) return { ...state, current: null, pending: null }
  const def = topicDef(input.set, key)
  const ctx = contextFor(input, state, findings)
  const isMandatory = def.mandatoryWhen ? evalCond(def.mandatoryWhen, ctx) : false
  const q = nextMainQuestion(input, def, state.topics[key], ctx)
  const nextState: InterviewState = { ...state, current: key }
  if (!q) {
    // Nothing applicable to ask in this topic: it closes immediately.
    nextState.topics = { ...state.topics, [key]: { ...state.topics[key], state: 'complete', coverage: 1, closedReason: 'سؤال مرتبطی برای این موضوع لازم نبود' } }
    return advance(input, nextState, findings, turns)
  }
  turns.push({ topicKey: key, role: 'system', kind: 'system', text: topicIntro(def, isMandatory), inputMode: 'text', meta: { topicKey: key, intro: true } })
  return ask(input, nextState, q, key, 'main', turns, ctx)
}

function nextMainQuestion(input: EngineInput, def: TopicDef, tp: TopicProgress, ctx: MissionContext) {
  for (const q of expandedQuestions(def, input)) {
    if (tp.mainAsked.includes(q.id)) continue
    if (q.when && !evalCond(q.when, ctx)) continue
    return q
  }
  return null
}

function ask(
  _input: EngineInput,
  state: InterviewState,
  q: QuestionDef & { objectiveId?: string },
  topicKey: string,
  kind: 'main' | 'followup',
  turns: TurnDraft[],
  ctx: MissionContext,
  extra: Partial<PendingQuestion> = {},
): InterviewState {
  const text = fillTemplate(q.text, ctx)
  const pending: PendingQuestion = {
    id: q.id,
    topicKey,
    kind,
    text,
    hint: q.hint,
    quick: q.quick,
    findingKey: q.objectiveId ? `obj:${q.objectiveId}` : undefined,
    ...extra,
  }
  turns.push({ topicKey, role: 'assistant', kind, text, inputMode: 'text', meta: { hint: q.hint, quick: q.quick, slot: extra.slot, questionId: q.id } })
  const tp = state.topics[topicKey]
  const topics = { ...state.topics, [topicKey]: { ...tp, mainAsked: kind === 'main' ? [...tp.mainAsked, q.id] : tp.mainAsked } }
  return { ...state, topics, pending, asked: state.asked + 1 }
}

// ------------------------------------------------------------------------------------- advancing

/** Moves on after a topic closes: next open topic, or the end of the interview. */
function advance(input: EngineInput, state: InterviewState, findings: Finding[], turns: TurnDraft[]): InterviewState {
  const nextKey = state.plan.find((k) => state.topics[k].state === 'open')
  if (!nextKey) return { ...state, current: null, pending: null }
  return openTopic(input, state, findings, nextKey, turns)
}

function recomputeCoverage(input: EngineInput, state: InterviewState, findings: Finding[], key: string): number {
  const def = topicDef(input.set, key)
  const tp = state.topics[key]
  if (tp.state !== 'open') return 1
  const ctx = contextFor(input, state, findings)
  const all = expandedQuestions(def, input).filter((q) => !q.when || evalCond(q.when, ctx) || tp.mainAsked.includes(q.id))
  const mainPart = all.length ? Math.min(1, tp.mainAsked.length / all.length) : 1
  const topicFindings = findings.filter((f) => f.topicKey === key)
  let slotPart = 1
  if (topicFindings.length) {
    let need = 0
    let have = 0
    for (const f of topicFindings) for (const s of requiredSlots(input, f)) { need++; if (slotFilled(f, s)) have++ }
    slotPart = need ? have / need : 1
  }
  return Math.max(tp.coverage, Math.round((mainPart * 0.7 + slotPart * 0.3) * 100) / 100)
}

// ------------------------------------------------------------------------------------- applying analysis

const DISCIPLINES = ['engineering', 'procurement', 'construction', 'hse', 'quality']

/** The engineering discipline a finding is really about, from the topics' own vocabularies — used to group
 * the report by discipline even when it was mentioned under a general topic (progress, risks...). */
function areaOf(input: EngineInput, topicKey: string, text: string): string {
  if (DISCIPLINES.includes(topicKey)) return topicKey
  const n = normalizeFa(text)
  let best = ''
  let bestHits = 0
  for (const key of DISCIPLINES) {
    if (!input.set.topics.some((t) => t.key === key)) continue
    const def = topicDef(input.set, key)
    const h = def.lexicon.filter((w) => n.includes(normalizeFa(w))).length
    if (h > bestHits) { bestHits = h; best = key }
  }
  return best || topicKey
}

function applyExtracted(input: EngineInput, found: ExtractedFinding[], findings: Finding[], missionId: string, now: string): Finding[] {
  const out = [...findings]
  for (const e of found) {
    const dup = out.find((f) => f.kind === e.kind && (findingKeyOf(f) === e.key || similarity(f.title, e.title) >= 0.6))
    if (dup) {
      const idx = out.indexOf(dup)
      const details = { ...dup.details }
      for (const [k, v] of Object.entries(e.details)) if (v && !details[k]) details[k] = v
      out[idx] = {
        ...dup,
        details,
        ownerText: dup.ownerText || e.ownerText,
        dueDate: dup.dueDate ?? e.dueDate,
        severity: SEVERITY_ORDER.indexOf(e.severity) < SEVERITY_ORDER.indexOf(dup.severity) ? e.severity : dup.severity,
      }
      continue
    }
    out.push({
      id: uid(),
      missionId,
      kind: e.kind,
      topicKey: e.topicKey,
      title: e.title,
      description: e.description,
      details: { ...e.details, _key: e.key, _area: areaOf(input, e.topicKey, `${e.title} ${e.description}`) },
      severity: e.severity,
      ownerText: e.ownerText,
      ownerId: null,
      dueDate: e.dueDate,
      objectiveId: null,
      confidence: e.confidence,
      userConfirmed: false,
      approval: 'proposed',
      managerNote: '',
      transferredTo: null,
      transferredId: null,
      transferredAt: null,
      createdAt: now,
    })
  }
  return out
}

function applySlotFills(fills: AnalysisResult['slotFills'], findings: Finding[]): Finding[] {
  if (!fills.length) return findings
  return findings.map((f) => {
    const mine = fills.filter((x) => x.findingKey === findingKeyOf(f))
    if (!mine.length) return f
    const details = { ...f.details }
    let ownerText = f.ownerText
    let dueDate = f.dueDate
    let severity = f.severity
    for (const fill of mine) {
      if (fill.slot === 'impact' || fill.slot === 'cause') {
        const sev = estimateSeverity(normalizeFa(fill.value), f.topicKey, f.kind)
        if (SEVERITY_ORDER.indexOf(sev) < SEVERITY_ORDER.indexOf(severity)) severity = sev
      }
      details[fill.slot] = fill.value
      if ((fill.slot === 'owner' || fill.slot === 'party') && fill.value && fill.value !== 'نامشخص') ownerText = ownerText || fill.value
      if ((fill.slot === 'due' || fill.slot === 'newDate') && /^\d{4}-\d{2}-\d{2}$/.test(fill.value)) dueDate = dueDate ?? fill.value
    }
    return { ...f, details, ownerText, dueDate, severity }
  })
}

// ----------------------------------------------------------------------------------------- main step

const AI_TIMEOUT_MS = 14000

async function analyze(input: EngineInput, findings: Finding[], pending: PendingQuestion, answer: string, wanted: { findingKey: string; slot: Slot; findingTitle: string } | null) {
  const def = topicDef(input.set, pending.topicKey)
  const known = findings.filter((f) => f.topicKey === pending.topicKey).map((f) => ({ key: findingKeyOf(f), title: f.title, kind: f.kind }))
  const target =
    pending.kind === 'followup' && pending.findingKey && pending.slot
      ? { findingKey: pending.findingKey, slot: pending.slot as Slot, findingTitle: findings.find((f) => findingKeyOf(f) === pending.findingKey)?.title ?? '' }
      : undefined
  const rules = analyzeAnswer({ topicKey: pending.topicKey, answer, today: input.today, defaultKind: def.defaultKind, lexicon: def.lexicon, target, known })
  if (!input.ai) return { analysis: rules, aiUsed: false }
  try {
    const withTimeout = <T,>(p: Promise<T>) => new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('ai_timeout')), AI_TIMEOUT_MS)
      p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
    })
    const ai = await withTimeout(
      input.ai.analyzeAnswer({
        topic: { key: def.key, title: def.title },
        question: pending.text,
        answer,
        today: input.today,
        known,
        wantedFollowUp: wanted,
        target: target ?? null,
        mission: { project: input.projectName, visitType: input.mission.visitType, destination: input.mission.destination, objectives: input.objectives.map((o) => o.title) },
      }),
    )
    // The rules stay as a floor: anything the model missed that the rules caught is kept.
    const merged: AnalysisResult = {
      ...ai,
      metrics: { ...rules.metrics, ...ai.metrics },
      findings: [...ai.findings, ...rules.findings.filter((r) => !ai.findings.some((a) => a.kind === r.kind && similarity(a.title, r.title) >= 0.6))],
      slotFills: ai.slotFills.length ? ai.slotFills : rules.slotFills,
      source: 'ai',
    }
    return { analysis: merged, aiUsed: true }
  } catch {
    return { analysis: rules, aiUsed: false }
  }
}

export async function submitAnswer(
  input: EngineInput,
  stateIn: InterviewState,
  findingsIn: Finding[],
  answerText: string,
  inputMode: 'text' | 'voice',
): Promise<StepResult> {
  const pending = stateIn.pending
  if (!pending) throw new Error('no pending question')
  const turns: TurnDraft[] = [{ topicKey: pending.topicKey, role: 'user', kind: 'answer', text: answerText.trim(), inputMode }]
  const now = new Date().toISOString()
  const def = topicDef(input.set, pending.topicKey)
  let state: InterviewState = { ...stateIn, topics: { ...stateIn.topics } }
  let findings = [...findingsIn]
  const objectiveUpdates: StepResult['objectiveUpdates'] = []

  // What would we ask next? Needed up-front so an AI model can phrase that very question.
  const preview = nextMissing(input, findings, pending.topicKey)
  const { analysis, aiUsed } = await analyze(input, findings, pending, answerText, preview ? { findingKey: findingKeyOf(preview.finding), slot: preview.slot, findingTitle: preview.finding.title } : null)

  // Record what was learned.
  const tp = { ...state.topics[pending.topicKey] }
  tp.notes = [...tp.notes, answerText.trim()]
  tp.metrics = { ...tp.metrics, ...analysis.metrics }
  state.topics[pending.topicKey] = tp
  findings = applySlotFills(analysis.slotFills, findings)
  if (!def.noFindings) findings = applyExtracted(input, analysis.findings, findings, input.mission.id, now)
  // The follow-up that was just answered must never be asked again, even if the slot stayed empty.
  if (pending.kind === 'followup' && pending.findingKey && pending.slot) {
    findings = findings.map((f) => (findingKeyOf(f) === pending.findingKey ? { ...f, details: { ...f.details, _asked: [...new Set([...askedSlots(f), pending.slot as string])].join(',') } } : f))
  }

  // Objective review answers update the objective itself.
  if (pending.findingKey?.startsWith('obj:')) {
    const id = pending.findingKey.slice(4)
    objectiveUpdates.push({ id, status: classifyObjectiveAnswer(answerText), note: answerText.trim() })
  }

  const ctx = contextFor(input, state, findings)

  // A vague answer to a main question gets one gentle probe before moving on.
  const probed = tp.notes.length > 0 && state.topics[pending.topicKey].followUps >= def.maxFollowUps
  if (analysis.vague && pending.kind === 'main' && !probed && def.maxFollowUps > 0 && !pending.id.startsWith('evd')) {
    const q: QuestionDef = {
      id: `${pending.id}:probe`,
      text: `ممکن است کمی دقیق‌تر بگویید؟ ${pending.hint ? 'مثلاً: ' + pending.hint : 'یک مثال یا عدد مشخص کمک می‌کند.'}`,
      quick: ['دیگر موردی ندارم'],
    }
    state.topics[pending.topicKey] = { ...state.topics[pending.topicKey], followUps: state.topics[pending.topicKey].followUps + 1 }
    state = ask(input, state, q, pending.topicKey, 'followup', turns, ctx, { slot: undefined })
    return { state, findings, turns, objectiveUpdates, done: false, analysis, aiUsed }
  }

  // Missing information about this topic's findings → targeted follow-up.
  const topicState = state.topics[pending.topicKey]
  if (topicState.followUps < def.maxFollowUps) {
    const missing = nextMissing(input, findings, pending.topicKey)
    if (missing) {
      const aiText = analysis.followUpText && preview && preview.slot === missing.slot && findingKeyOf(preview.finding) === findingKeyOf(missing.finding) ? analysis.followUpText : undefined
      const text = followUpText(input, missing.finding, missing.slot, aiText)
      findings = findings.map((f) => (f.id === missing.finding.id ? { ...f, details: { ...f.details, _asked: [...askedSlots(f), missing.slot].join(',') } } : f))
      state.topics[pending.topicKey] = { ...topicState, followUps: topicState.followUps + 1 }
      state = ask(input, state, { id: `fu:${findingKeyOf(missing.finding)}:${missing.slot}`, text, quick: followUpQuick(missing.slot) }, pending.topicKey, 'followup', turns, ctx, {
        findingKey: findingKeyOf(missing.finding),
        slot: missing.slot,
      })
      state.topics[pending.topicKey] = { ...state.topics[pending.topicKey], coverage: recomputeCoverage(input, state, findings, pending.topicKey) }
      return { state, findings, turns, objectiveUpdates, done: false, analysis, aiUsed }
    }
  }

  // Progress topic: ask once for the two numbers if they were never given.
  if (def.metrics?.length && pending.kind === 'main' && state.topics[pending.topicKey].followUps < def.maxFollowUps) {
    const m = state.topics[pending.topicKey].metrics
    const asked = state.topics[pending.topicKey].mainAsked.includes('progress-metric')
    if (m.actual == null && !asked && !analysis.nothingToReport) {
      state.topics[pending.topicKey] = { ...state.topics[pending.topicKey], followUps: state.topics[pending.topicKey].followUps + 1, mainAsked: [...state.topics[pending.topicKey].mainAsked, 'progress-metric'] }
      state = ask(input, state, { id: 'progress-metric-q', text: 'اگر ممکن است عدد دقیق را هم بگویید: پیشرفت واقعی چند درصد است و برنامه مصوب چند درصد؟', hint: 'مثال: «واقعی ۴۲ درصد، برنامه ۵۰ درصد»', quick: ['عدد دقیق را ندارم'] }, pending.topicKey, 'followup', turns, ctx)
      return { state, findings, turns, objectiveUpdates, done: false, analysis, aiUsed }
    }
  }

  // More main questions in this topic?
  const nextQ = nextMainQuestion(input, def, state.topics[pending.topicKey], ctx)
  if (nextQ) {
    state = ask(input, state, nextQ, pending.topicKey, 'main', turns, ctx)
    state.topics[pending.topicKey] = { ...state.topics[pending.topicKey], coverage: recomputeCoverage(input, state, findings, pending.topicKey) }
    return { state, findings, turns, objectiveUpdates, done: false, analysis, aiUsed }
  }

  // Topic is explored enough.
  const found = findings.filter((f) => f.topicKey === pending.topicKey)
  const reason = analysis.nothingToReport && !found.length ? 'مورد خاصی برای گزارش نبود' : found.length ? `${found.length} یافته ثبت و تکمیل شد` : 'اطلاعات کافی دریافت شد'
  state.topics[pending.topicKey] = { ...state.topics[pending.topicKey], state: 'complete', coverage: 1, closedReason: reason }
  turns.push({ topicKey: pending.topicKey, role: 'system', kind: 'system', text: `✓ موضوع «${def.title}» تکمیل شد — ${reason}.`, inputMode: 'text', meta: { closed: pending.topicKey } })
  state = advance(input, state, findings, turns)
  return { state, findings, turns, objectiveUpdates, done: state.current === null, analysis, aiUsed }
}

function followUpQuick(slot: Slot): string[] | undefined {
  switch (slot) {
    case 'newDate':
    case 'due': return ['اعلام نشده', 'یک هفته دیگر', 'دو هفته دیگر', 'تا پایان ماه']
    case 'probability': return ['کم', 'متوسط', 'زیاد']
    case 'cause':
    case 'impact':
    case 'mitigation':
    case 'needAction': return ['نمی‌دانم']
    default: return ['مشخص نیست']
  }
}

// ----------------------------------------------------------------------------------------- user controls

export function skipCurrentTopic(input: EngineInput, stateIn: InterviewState, findings: Finding[], reason: string): StepResult {
  const key = stateIn.current
  if (!key) return { state: stateIn, findings, turns: [], objectiveUpdates: [], done: true, analysis: null, aiUsed: false }
  const def = topicDef(input.set, key)
  const turns: TurnDraft[] = [{ topicKey: key, role: 'user', kind: 'answer', text: `رد کردن موضوع: ${reason || 'بدون دلیل'}`, inputMode: 'text', meta: { skip: true } }]
  let state: InterviewState = { ...stateIn, topics: { ...stateIn.topics, [key]: { ...stateIn.topics[key], state: 'skipped', closedReason: reason || 'رد شد' } } }
  turns.push({ topicKey: key, role: 'system', kind: 'system', text: `موضوع «${def.title}» رد شد.`, inputMode: 'text', meta: { closed: key, skipped: true } })
  state = advance(input, { ...state, pending: null }, findings, turns)
  return { state, findings, turns, objectiveUpdates: [], done: state.current === null, analysis: null, aiUsed: false }
}

/** Adds a topic that was not in the automatic plan, or reopens a closed one, and jumps to it. */
export function openTopicNow(input: EngineInput, stateIn: InterviewState, findings: Finding[], key: string): StepResult {
  const turns: TurnDraft[] = []
  const topics = { ...stateIn.topics }
  const plan = stateIn.plan.includes(key) ? stateIn.plan : [...stateIn.plan, key]
  const prev = topics[key]
  topics[key] = prev ? { ...prev, state: 'open', followUps: 0, mainAsked: [] } : { mainAsked: [], followUps: 0, state: 'open', coverage: 0, notes: [], metrics: {} }
  const state = openTopic(input, { ...stateIn, plan, topics, pending: null }, findings, key, turns)
  return { state, findings, turns, objectiveUpdates: [], done: false, analysis: null, aiUsed: false }
}

export function interviewProgress(state: InterviewState): { done: number; total: number; percent: number } {
  const total = state.plan.length
  const done = state.plan.filter((k) => state.topics[k].state !== 'open').length
  const partial = state.plan.reduce((s, k) => s + (state.topics[k].state === 'open' ? state.topics[k].coverage : 0), 0)
  return { done, total, percent: total ? Math.round(((done + partial) / total) * 100) : 0 }
}
