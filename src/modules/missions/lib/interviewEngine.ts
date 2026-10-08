import type {
  Finding,
  FindingKind,
  InterviewState,
  Mission,
  Objective,
  ObjectiveStatus,
  PendingLayout,
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
import { analyzeAnswer, classifyObjectiveAnswer, estimateSeverity, findingKey, similarity, type AnalysisResult, type ExtractedFinding } from './ruleAnalyzer'
import { normalizeFa } from './fa'
import { DISCIPLINE_LABEL } from './discipline'
import type { AiProvider } from '../ai/provider'
import {
  analysisTextOf,
  batchQuestionText,
  entriesToFindings,
  gapQuestionText,
  isBlank,
  isNothingValue,
  isUnknownValue,
  isYesOnly,
  layoutFor,
  metricsOf,
  notesOf,
  parseAnswer,
  parseGapAnswer,
  renderGapTemplate,
  renderTemplate,
  type GapSpec,
} from './batch'

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
  for (const base of def.mainQuestions) {
    // The same question is worded for the visitor's own field (a lawyer is asked about contracts, not about schedule slips).
    const q = base.byDiscipline?.[input.mission.discipline] ? { ...base, text: base.byDiscipline[input.mission.discipline]! } : base
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
      text: `سلام. من دستیار گزارش بازدید هستم. سؤال‌های هر موضوع را یکجا و همراه با یک قالب پاسخ می‌پرسم؛ شما قالب را پر می‌کنید (تایپ یا میکروفون) و اگر اطلاعاتی ناقص ماند، فقط همان را یک بار دیگر می‌پرسم. پرسش‌ها با حوزهٔ کاری شما (${DISCIPLINE_LABEL[input.mission.discipline] ?? 'عمومی'}) هماهنگ است؛ فقط از دید تخصصی خودتان بگویید، لازم نیست درباره بخش‌های دیگر نظر بدهید. بخش «استقلال و شفافیت گزارش» محرمانه است. «${input.projectName}»`,
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
  const questions = expandedQuestions(def, input).filter((x) => !x.when || evalCond(x.when, ctx))
  const q = questions[0]
  const nextState: InterviewState = { ...state, current: key }
  if (!q) {
    // Nothing applicable to ask in this topic: it closes immediately.
    nextState.topics = { ...state.topics, [key]: { ...state.topics[key], state: 'complete', coverage: 1, closedReason: 'سؤال مرتبطی برای این موضوع لازم نبود' } }
    return advance(input, nextState, findings, turns)
  }
  turns.push({ topicKey: key, role: 'system', kind: 'system', text: topicIntro(def, isMandatory), inputMode: 'text', meta: { topicKey: key, intro: true } })
  return askBatch(input, nextState, def, questions, isMandatory, turns, ctx)
}

/** Asks every applicable question of a topic at once, with the answer template pre-filled. */
function askBatch(input: EngineInput, state: InterviewState, def: TopicDef, questions: (QuestionDef & { objectiveId?: string })[], mandatory: boolean, turns: TurnDraft[], ctx: MissionContext): InterviewState {
  const layout = layoutFor(def, questions, input.objectives, input.mission.discipline)
  const template = renderTemplate(layout)
  const text = batchQuestionText(def, mandatory, questions.map((x) => fillTemplate(x.text, ctx)), layout)
  const quick = def.quick ?? questions.find((x) => x.quick)?.quick
  const pending: PendingQuestion = { id: `batch:${def.key}`, topicKey: def.key, kind: 'main', text, template, layout, quick }
  turns.push({ topicKey: def.key, role: 'assistant', kind: 'main', text, inputMode: 'text', meta: { quick, batch: true, template } })
  const tp = state.topics[def.key]
  const topics = { ...state.topics, [def.key]: { ...tp, mainAsked: questions.map((x) => x.id) } }
  return { ...state, topics, pending, asked: state.asked + questions.length }
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

const DISCIPLINES = ['engineering', 'procurement', 'construction', 'hse', 'quality', 'legal', 'finance', 'hr_admin']

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
      confidential: !!input.set.topics.find((t) => t.key === e.topicKey)?.confidential,
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


// ------------------------------------------------------------------------------------- batch & gap rounds

const MAX_GAP_ROUNDS = 2
const MAX_GAP_FINDINGS = 6

const EMPTY_ANALYSIS: AnalysisResult = { findings: [], slotFills: [], metrics: {}, sentiment: 'neutral', nothingToReport: false, unknown: false, vague: false, summary: '', source: 'rules' }

/** Every required fact still missing about this topic's findings (all of them at once), most severe first. */
function slotGaps(input: EngineInput, findings: Finding[], topicKey: string): GapSpec['findings'] {
  return findings
    .filter((f) => f.topicKey === topicKey && f.approval !== 'rejected')
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
    .map((f) => ({ key: findingKeyOf(f), title: shortTitle(f.title), slots: requiredSlots(input, f).filter((sl) => !slotFilled(f, sl)) }))
    .filter((g) => g.slots.length > 0)
    .slice(0, MAX_GAP_FINDINGS)
}

function closeTopic(input: EngineInput, state: InterviewState, findings: Finding[], key: string, turns: TurnDraft[], nothing: boolean): InterviewState {
  const def = topicDef(input.set, key)
  const found = findings.filter((f) => f.topicKey === key)
  const reason = nothing && !found.length ? 'مورد خاصی برای گزارش نبود' : found.length ? `${found.length} یافته ثبت و تکمیل شد` : 'اطلاعات کافی دریافت شد'
  state.topics[key] = { ...state.topics[key], state: 'complete', coverage: 1, closedReason: reason }
  turns.push({ topicKey: key, role: 'system', kind: 'system', text: `✓ موضوع «${def.title}» تکمیل شد — ${reason}.`, inputMode: 'text', meta: { closed: key } })
  return advance(input, { ...state, pending: null }, findings, turns)
}

/** Asks the consolidated «still missing» round, or returns null when nothing is missing / the rounds are used up. */
function askGap(input: EngineInput, state: InterviewState, findings: Finding[], key: string, turns: TurnDraft[], gap: GapSpec): InterviewState | null {
  const def = topicDef(input.set, key)
  const tp = state.topics[key]
  const round = (tp.gapRounds ?? 0) + 1
  if (round > MAX_GAP_ROUNDS || def.maxFollowUps <= 0) return null
  if (!gap.fields.length && !gap.objectives.length && !gap.findings.length) return null
  const objectives = input.objectives.map((o) => ({ id: o.id, title: o.title }))
  const template = renderGapTemplate(gap, objectives)
  const text = gapQuestionText(def, round, gap)
  turns.push({ topicKey: key, role: 'assistant', kind: 'followup', text, inputMode: 'text', meta: { gap: true, template } })
  state.topics[key] = { ...tp, gapRounds: round, followUps: tp.followUps + 1, coverage: recomputeCoverage(input, state, findings, key) }
  return { ...state, pending: { id: `gap:${key}:${round}`, topicKey: key, kind: 'gap', text, template, layout: { fields: [], gap }, quick: ['نمی‌دانم'] }, asked: state.asked + 1 }
}

/**
 * A confidential topic (pressure or limits on reporting). What the visitor writes here must reach only the project
 * manager's superiors, so it is kept out of everything the visited project's own manager could ever read: the answer
 * is never stored as a conversation turn or note, never sent to an external AI, and never enters the report text.
 * It becomes confidential findings — which the database hides from that manager.
 */
function submitConfidential(input: EngineInput, state: InterviewState, findingsIn: Finding[], answerText: string, inputMode: 'text' | 'voice', layout: PendingLayout): StepResult {
  const key = state.pending!.topicKey
  const def = topicDef(input.set, key)
  const now = new Date().toISOString()
  const parsed = parseAnswer(answerText, layout)
  const given: { label: string; value: string }[] = []
  if (parsed.structured) {
    for (const f of layout.fields) {
      const v = (parsed.fields[f.label] ?? '').trim()
      if (!isBlank(v) && !isNothingValue(v) && !isUnknownValue(v)) given.push({ label: f.label, value: v })
    }
  } else if (!isBlank(answerText) && !isNothingValue(answerText)) given.push({ label: 'گزارش محرمانه', value: answerText.trim() })
  const extracted: ExtractedFinding[] = given.map((g) => {
    const title = g.value.replace(/\s+/g, ' ').slice(0, 120)
    return { key: findingKey('observation', key, title), kind: 'observation', topicKey: key, title, description: `${g.label}: ${g.value}`, details: {}, severity: 'high', ownerText: '', dueDate: null, confidence: 1 }
  })
  const findings = applyExtracted(input, extracted, findingsIn, input.mission.id, now)
  const turns: TurnDraft[] = [{ topicKey: key, role: 'user', kind: 'answer', text: '🔒 پاسخ محرمانه ثبت شد (در گفتگو و گزارش نمایش داده نمی‌شود)', inputMode, meta: { confidential: true } }]
  state.topics[key] = { ...state.topics[key], notes: [], metrics: {} }
  const reason = given.length ? 'ثبت شد و فقط برای مجری طرح و مدیریت ارشد نمایان است' : 'موردی گزارش نشد'
  state.topics[key] = { ...state.topics[key], state: 'complete', coverage: 1, closedReason: reason }
  turns.push({ topicKey: key, role: 'system', kind: 'system', text: `✓ موضوع «${def.title}» تکمیل شد — ${reason}.`, inputMode: 'text', meta: { closed: key } })
  const closed = advance(input, { ...state, pending: null }, findings, turns)
  return { state: closed, findings, turns, objectiveUpdates: [], done: closed.current === null, analysis: null, aiUsed: false }
}

async function submitBatch(input: EngineInput, stateIn: InterviewState, findingsIn: Finding[], answerText: string, inputMode: 'text' | 'voice'): Promise<StepResult> {
  const pending = stateIn.pending!
  const layout = pending.layout!
  const key = pending.topicKey
  const def = topicDef(input.set, key)
  const state: InterviewState = { ...stateIn, topics: { ...stateIn.topics } }
  if (def.confidential) return submitConfidential(input, state, [...findingsIn], answerText, inputMode, layout)
  const turns: TurnDraft[] = [{ topicKey: key, role: 'user', kind: 'answer', text: answerText.trim(), inputMode }]
  const now = new Date().toISOString()
  let findings = [...findingsIn]
  const objectiveUpdates: StepResult['objectiveUpdates'] = []

  const parsed = parseAnswer(answerText, layout)
  const text = analysisTextOf(parsed, layout.fields)
  const { analysis, aiUsed } = text.trim() ? await analyze(input, findings, { ...pending, kind: 'main' }, text, null) : { analysis: EMPTY_ANALYSIS, aiUsed: false }
  const nothing = !parsed.structured ? analysis.nothingToReport : !Object.values(parsed.fields).some((v) => !isBlank(v) && !isUnknownValue(v)) && !parsed.entries.length && !parsed.objectives.some((o) => !isBlank(o.result))

  const tp = { ...state.topics[key] }
  tp.notes = [...tp.notes, notesOf(parsed, answerText)]
  tp.metrics = { ...tp.metrics, ...analysis.metrics, ...metricsOf(parsed, layout.fields) }
  state.topics[key] = tp
  findings = applySlotFills(analysis.slotFills, findings)
  if (!def.noFindings) findings = applyExtracted(input, analysis.findings, findings, input.mission.id, now)
  if (layout.entries && parsed.entries.length) findings = applyExtracted(input, entriesToFindings(parsed.entries, def, layout.entries, input.today), findings, input.mission.id, now)

  const missingObjectives: string[] = []
  for (const o of parsed.objectives) {
    if (isBlank(o.result) && isBlank(o.note)) { missingObjectives.push(o.id); continue }
    objectiveUpdates.push({ id: o.id, status: classifyObjectiveAnswer(`${o.result} ${o.note}`), note: (o.note || o.result).trim() })
  }

  const fieldGaps = parsed.structured && !nothing ? layout.fields.filter((f) => !f.noteOnly && (isYesOnly(parsed.fields[f.label]) || (!f.optional && isBlank(parsed.fields[f.label])))).map((f) => f.label) : []
  const gap: GapSpec = { fields: fieldGaps, objectives: missingObjectives, findings: nothing ? [] : slotGaps(input, findings, key) }
  const asked = askGap(input, state, findings, key, turns, gap)
  if (asked) return { state: asked, findings, turns, objectiveUpdates, done: false, analysis, aiUsed }
  const closed = closeTopic(input, state, findings, key, turns, nothing)
  return { state: closed, findings, turns, objectiveUpdates, done: closed.current === null, analysis, aiUsed }
}

function submitGap(input: EngineInput, stateIn: InterviewState, findingsIn: Finding[], answerText: string, inputMode: 'text' | 'voice'): StepResult {
  const pending = stateIn.pending!
  const gap = pending.layout!.gap!
  const key = pending.topicKey
  const def = topicDef(input.set, key)
  const turns: TurnDraft[] = [{ topicKey: key, role: 'user', kind: 'answer', text: answerText.trim(), inputMode }]
  const state: InterviewState = { ...stateIn, topics: { ...stateIn.topics } }
  let findings = [...findingsIn]
  const objectiveUpdates: StepResult['objectiveUpdates'] = []
  const now = new Date().toISOString()
  const parsed = parseGapAnswer(answerText, gap)
  const tp = { ...state.topics[key] }
  const notes: string[] = []

  // Plain fields that were blank: keep the text as notes, and mine it like a normal answer.
  const fieldText = Object.entries(parsed.fields).filter(([, v]) => !isBlank(v)).map(([k, v]) => `${k.replace(/[(（].*$/u, '').trim()}: ${v}`)
  const mineText = analysisTextOf({ fields: parsed.fields, entries: [], objectives: [], structured: true, free: '' })
  if (fieldText.length) notes.push(...fieldText.filter((l) => !isNothingValue(l.split(': ').slice(1).join(': '))))
  if (mineText.trim()) {
    const a = analyzeAnswer({ topicKey: key, answer: mineText, today: input.today, defaultKind: def.defaultKind, lexicon: def.lexicon, known: findings.filter((f) => f.topicKey === key).map((f) => ({ key: findingKeyOf(f), title: f.title, kind: f.kind })) })
    tp.metrics = { ...tp.metrics, ...a.metrics }
    findings = applySlotFills(a.slotFills, findings)
    if (!def.noFindings) findings = applyExtracted(input, a.findings, findings, input.mission.id, now)
  }

  const stillObjectives: string[] = []
  for (const o of parsed.objectives) {
    if (isBlank(o.result) && isBlank(o.note)) { stillObjectives.push(o.id); continue }
    objectiveUpdates.push({ id: o.id, status: classifyObjectiveAnswer(`${o.result} ${o.note}`), note: (o.note || o.result).trim() })
  }

  // Finding facts: normalise each value exactly like a direct answer (dates, "نمی‌دانم" → نامشخص …).
  const fills: AnalysisResult['slotFills'] = []
  for (const pf of parsed.findings) {
    const title = findings.find((f) => findingKeyOf(f) === pf.key)?.title ?? ''
    for (const [slot, value] of Object.entries(pf.slots)) {
      if (isBlank(value)) continue
      const a = analyzeAnswer({ topicKey: key, answer: value, today: input.today, defaultKind: def.defaultKind, lexicon: def.lexicon, target: { findingKey: pf.key, slot: slot as Slot, findingTitle: title } })
      fills.push(...a.slotFills)
      notes.push(`${title}: ${value}`)
    }
  }
  findings = applySlotFills(fills, findings)
  tp.notes = [...tp.notes, ...(notes.length ? [notes.join('\n')] : [answerText.trim()])]
  state.topics[key] = tp

  const gaps: GapSpec = {
    fields: gap.fields.filter((f) => isBlank(parsed.fields[f]) || isYesOnly(parsed.fields[f])),
    objectives: stillObjectives,
    findings: slotGaps(input, findings, key),
  }
  const next = askGap(input, state, findings, key, turns, gaps)
  if (next) return { state: next, findings, turns, objectiveUpdates, done: false, analysis: null, aiUsed: false }
  const closed = closeTopic(input, state, findings, key, turns, false)
  return { state: closed, findings, turns, objectiveUpdates, done: closed.current === null, analysis: null, aiUsed: false }
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
  // Batch questions and the consolidated gap round carry their layout; sessions saved before that existed
  // continue through the single-question path below.
  if (pending.layout?.gap) return submitGap(input, stateIn, findingsIn, answerText, inputMode)
  if (pending.layout) return submitBatch(input, stateIn, findingsIn, answerText, inputMode)
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
