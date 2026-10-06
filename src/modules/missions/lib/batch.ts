import type { FindingKind, Objective, PendingLayout, TemplateEntries, TemplateField } from '../types'
import { faNum, latinDigits, normalizeFa } from './fa'
import { detectNothing, extractDate, findingKey, type ExtractedFinding } from './ruleAnalyzer'
import type { QuestionDef, Slot, TopicDef } from './questionSets'

/**
 * Batch answers.
 *
 * A topic is asked ONCE, as a numbered list of all its questions, together with a labelled answer template
 * («پیشرفت واقعی: …»). The user fills the template (typing or dictating); this module turns the filled text
 * back into fields, repeating entries (decisions / actions with owner and due date) and per-objective
 * results. Whatever is still missing is asked again in ONE consolidated «gap» round, with its own template.
 *
 * Pure text in, plain data out — no I/O and no engine state, so it is easy to test and the engine stays small.
 */

export const SLOT_LABEL: Record<Slot, string> = {
  cause: 'علت',
  status: 'وضعیت فعلی',
  impact: 'اثر بر پروژه',
  party: 'مسئول / طرف درگیر',
  newDate: 'تاریخ جدید رفع',
  needAction: 'اقدام لازم',
  probability: 'احتمال وقوع (کم / متوسط / زیاد)',
  mitigation: 'راهکار کنترل',
  owner: 'مسئول اقدام',
  due: 'مهلت (تاریخ)',
}

const RESULT_LABEL = 'نتیجه (محقق شد / تا حدی / محقق نشد)'
const NOTE_LABEL = 'توضیح'

/** Label without its parenthetical hint — what the parser matches against. */
const base = (label: string) => normalizeFa(label.replace(/[(（].*$/u, '')).replace(/[\s:：]+$/u, '')

export function isBlank(v: string | undefined | null): boolean {
  if (!v) return true
  return normalizeFa(v).replace(/[.…_\-–—،,؛:\s]/gu, '') === ''
}

// ------------------------------------------------------------------------------------- layout & template

function plainLabel(q: QuestionDef, i: number): string {
  if (q.label) return q.label
  const t = q.text.replace(/\{[a-z]+\}/gi, '').replace(/[؟?]+/g, '').replace(/\s+/g, ' ').trim()
  const cut = t.length > 44 ? t.slice(0, 44).replace(/\s+\S*$/, '') + '…' : t
  return cut || `پاسخ ${faNum(i + 1)}`
}

export function layoutFor(def: TopicDef, questions: QuestionDef[], objectives: Objective[]): PendingLayout {
  const layout: PendingLayout = { fields: [] }
  if (def.mainQuestions.some((q) => q.repeatForObjective) && objectives.length) {
    layout.objectives = objectives.map((o) => ({ id: o.id, title: o.title, measure: o.measure }))
    return layout
  }
  if (def.entries) layout.entries = def.entries
  layout.fields = def.template ?? (def.entries ? [] : questions.map((q, i) => ({ label: plainLabel(q, i), optional: false })))
  return layout
}

/** The pre-filled answer box: one `label: ` line per field, then the repeating blocks. */
export function renderTemplate(layout: PendingLayout): string {
  const out: string[] = []
  for (const f of layout.fields) out.push(`${f.label}: `)
  const e = layout.entries
  if (e) {
    if (out.length) out.push('')
    for (let i = 1; i <= e.count; i++) {
      out.push(`${e.item} ${faNum(i)}: `, `${e.ownerLabel}: `, `${e.dueLabel}: `)
      if (e.noteLabel) out.push(`${e.noteLabel}: `)
      if (i < e.count) out.push('')
    }
  }
  if (layout.objectives) {
    layout.objectives.forEach((o, i) => {
      if (i) out.push('')
      out.push(`هدف ${faNum(i + 1)} — «${o.title}»${o.measure ? ` (معیار: ${o.measure})` : ''}`, `${RESULT_LABEL}: `, `${NOTE_LABEL}: `)
    })
  }
  return out.join('\n')
}

// ------------------------------------------------------------------------------------- parsing

export interface ParsedEntry {
  title: string
  owner: string
  due: string
  note: string
}

export interface ParsedAnswer {
  fields: Record<string, string>
  entries: ParsedEntry[]
  objectives: { id: string; result: string; note: string }[]
  /** True when at least one template label was recognised — i.e. the user filled the template rather than free-writing. */
  structured: boolean
  /** Text outside any template line. */
  free: string
}

type Target =
  | { t: 'field'; label: string }
  | { t: 'entry'; i: number; f: 'title' | 'owner' | 'due' | 'note' }
  | { t: 'objective'; i: number; f: 'result' | 'note' }

function splitLabel(line: string): { prefix: string; value: string } | null {
  const m = line.match(/^([^:：]{1,80})[:：]\s*(.*)$/u)
  return m ? { prefix: m[1].trim(), value: m[2] } : null
}

export function parseAnswer(text: string, layout: PendingLayout): ParsedAnswer {
  const out: ParsedAnswer = { fields: {}, entries: [], objectives: [], structured: false, free: '' }
  const e = layout.entries
  const itemRe = e ? new RegExp(`^${normalizeFa(e.item)}\\s*(\\d+)`) : null
  const ownerBase = e ? base(e.ownerLabel) : ''
  const dueBase = e ? base(e.dueLabel) : ''
  const noteBase = e?.noteLabel ? base(e.noteLabel) : ''
  const objs = layout.objectives ?? []
  objs.forEach((o) => out.objectives.push({ id: o.id, result: '', note: '' }))
  let cur: Target | null = null
  let entryIdx = -1
  let objIdx = -1
  const free: string[] = []
  const append = (t: Target, v: string) => {
    const add = (old: string) => (old ? `${old} ${v}`.trim() : v.trim())
    if (t.t === 'field') out.fields[t.label] = add(out.fields[t.label] ?? '')
    else if (t.t === 'entry') out.entries[t.i][t.f] = add(out.entries[t.i][t.f])
    else if (t.t === 'objective') out.objectives[t.i][t.f] = add(out.objectives[t.i][t.f])
  }

  for (const raw of latinDigits(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const norm = normalizeFa(line)

    const hdr = objs.length ? norm.match(/^هدف\s*(\d+)/) : null
    if (hdr && !splitLabel(line)?.prefix.startsWith('نتیجه')) {
      objIdx = Math.min(objs.length, Math.max(1, Number(hdr[1]))) - 1
      cur = null
      out.structured = true
      continue
    }
    const sl = splitLabel(line)
    if (sl) {
      const p = normalizeFa(sl.prefix)
      const item = itemRe ? p.match(itemRe) : null
      if (item) {
        entryIdx = out.entries.length
        out.entries.push({ title: '', owner: '', due: '', note: '' })
        cur = { t: 'entry', i: entryIdx, f: 'title' }
        out.structured = true
        append(cur, sl.value)
        continue
      }
      if (entryIdx >= 0 && (p.startsWith(ownerBase) || p.startsWith(dueBase) || (noteBase && p.startsWith(noteBase)))) {
        cur = { t: 'entry', i: entryIdx, f: p.startsWith(ownerBase) ? 'owner' : p.startsWith(dueBase) ? 'due' : 'note' }
        out.structured = true
        append(cur, sl.value)
        continue
      }
      if (objIdx >= 0 && (p.startsWith('نتیجه') || p.startsWith(normalizeFa(NOTE_LABEL)))) {
        cur = { t: 'objective', i: objIdx, f: p.startsWith('نتیجه') ? 'result' : 'note' }
        out.structured = true
        append(cur, sl.value)
        continue
      }
      const field = layout.fields.find((f) => p.startsWith(base(f.label)) || base(f.label).startsWith(p))
      if (field) {
        cur = { t: 'field', label: field.label }
        out.structured = true
        out.fields[field.label] = out.fields[field.label] ?? ''
        append(cur, sl.value)
        continue
      }
    }
    // Continuation of the previous line's value, or free text.
    if (cur) append(cur, line)
    else free.push(line)
  }
  out.free = free.join('\n')
  out.entries = out.entries.filter((x) => !isBlank(x.title))
  return out
}

/**
 * The text handed to the analyzer: the filled-in plain fields plus any free writing.
 *  - «ندارم / نمی‌دانم» answers and numeric metric fields carry no finding, so they are left out — otherwise the
 *    words in the label itself («اقلام عقب‌تر از برنامه») would be mistaken for a reported problem;
 *  - a full sentence is passed as written; a short answer keeps its label for context.
 */
export function analysisTextOf(p: ParsedAnswer, fields: TemplateField[] = []): string {
  const metric = new Set(fields.filter((f) => f.metric || f.noteOnly).map((f) => f.label))
  const lines: string[] = []
  for (const [k, v] of Object.entries(p.fields)) {
    if (isBlank(v) || metric.has(k) || isNothingValue(v) || isYesOnly(v)) continue
    const words = normalizeFa(v).split(' ').length
    lines.push(words >= 4 ? `${v.replace(/[.\s]+$/u, '')}.` : `${k.replace(/[(（].*$/u, '').trim()}: ${v}.`)
  }
  if (!isBlank(p.free)) lines.push(p.free)
  return lines.join('\n')
}

/** A clean record of what was said, for the topic notes (no empty template lines). */
export function notesOf(p: ParsedAnswer, raw: string): string {
  if (!p.structured) return raw.trim()
  const out: string[] = []
  for (const [k, v] of Object.entries(p.fields)) if (!isBlank(v)) out.push(`${k.replace(/[(（].*$/u, '').trim()}: ${v}`)
  p.entries.forEach((en, i) => out.push([`${i + 1}) ${en.title}`, en.owner && `مسئول: ${en.owner}`, en.due && `مهلت: ${en.due}`].filter(Boolean).join(' — ')))
  p.objectives.forEach((o) => { if (!isBlank(o.result) || !isBlank(o.note)) out.push(`${o.result}${o.note ? ' — ' + o.note : ''}`) })
  if (!isBlank(p.free)) out.push(p.free.trim())
  return out.join('\n')
}

export function metricsOf(p: ParsedAnswer, fields: TemplateField[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const f of fields) {
    if (!f.metric) continue
    const v = p.fields[f.label]
    const num = v ? latinDigits(v).match(/\d+(?:\.\d+)?/) : null
    if (num && Number(num[0]) <= 100) m[f.metric] = Number(num[0])
  }
  return m
}

const UNKNOWN_WORDS = /^(نامشخص|نمی ?دانم|مشخص نیست|اعلام نشده|ندارد|ندارم|ندارند|نیست)$/
const NO_ONLY = /^(نه|نخیر|خیر|هیچ|هیچی|هیچ چیز|چیزی نیست|مورد خاصی نیست|مورد دیگری نیست|مورد دیگری نبود)$/
const YES_ONLY = /^(بله|بلی|آره|اره|دارد|هست|وجود دارد|بله دارد|بله هست)$/

/** Normalised value without trailing punctuation (JS \b does not work with Persian letters, so we trim instead). */
const tidy = (v: string) => normalizeFa(v).replace(/[.،!؟?؛\s]+$/u, '')

export function isUnknownValue(v: string): boolean {
  return UNKNOWN_WORDS.test(tidy(v))
}

/** True when the value says «nothing to report / don't know» (so it must never be mined for findings). */
export function isNothingValue(v: string): boolean {
  const t = tidy(v)
  return UNKNOWN_WORDS.test(t) || NO_ONLY.test(t) || detectNothing(t)
}

/** «بله» with no detail says something exists but not what — the field is asked again. */
export function isYesOnly(v: string | undefined): boolean {
  return !!v && YES_ONLY.test(tidy(v))
}

/** Parsed repeating blocks → findings with owner and due date already set (the deterministic path for decisions and actions). */
export function entriesToFindings(entries: ParsedEntry[], def: TopicDef, layoutEntries: TemplateEntries, today: string): ExtractedFinding[] {
  const kind: FindingKind = layoutEntries.kind
  return entries.map((en) => {
    const title = en.title.replace(/\s+/g, ' ').trim().slice(0, 140)
    const owner = isBlank(en.owner) ? '' : en.owner.replace(/[.،\s]+$/u, '').trim()
    const dueText = isBlank(en.due) ? '' : en.due.replace(/[.،\s]+$/u, '').trim()
    const dueDate = dueText ? extractDate(dueText, today) : null
    const details: Record<string, string> = {}
    if (owner) details.owner = owner
    if (dueText) details.due = dueText
    if (!isBlank(en.note)) details.note = en.note.trim()
    return {
      key: findingKey(kind, def.key, title),
      kind,
      topicKey: def.key,
      title,
      description: isBlank(en.note) ? title : `${title} — ${en.note.trim()}`,
      details,
      severity: 'medium',
      ownerText: owner,
      dueDate,
      confidence: 0.95,
    } as ExtractedFinding
  })
}

// ------------------------------------------------------------------------------------- gap round

export type GapSpec = NonNullable<PendingLayout['gap']>

export function renderGapTemplate(gap: GapSpec, objectives: { id: string; title: string }[]): string {
  const out: string[] = []
  for (const f of gap.fields) out.push(`${f}: `)
  for (const id of gap.objectives) {
    const o = objectives.find((x) => x.id === id)
    if (out.length) out.push('')
    out.push(`▪ هدف «${o?.title ?? ''}»`, `${RESULT_LABEL}: `, `${NOTE_LABEL}: `)
  }
  for (const f of gap.findings) {
    if (out.length) out.push('')
    out.push(`▪ «${f.title}»`)
    for (const s of f.slots) out.push(`${SLOT_LABEL[s as Slot]}: `)
  }
  return out.join('\n')
}

export interface ParsedGap {
  fields: Record<string, string>
  objectives: { id: string; result: string; note: string }[]
  findings: { key: string; slots: Record<string, string> }[]
}

export function parseGapAnswer(text: string, gap: GapSpec): ParsedGap {
  const out: ParsedGap = {
    fields: {},
    objectives: gap.objectives.map((id) => ({ id, result: '', note: '' })),
    findings: gap.findings.map((f) => ({ key: f.key, slots: {} })),
  }
  // Blocks in order: plain fields (no header), then objectives, then findings — each ▪ line opens the next block.
  const blocks: { kind: 'fields' | 'objective' | 'finding'; i: number }[] = [{ kind: 'fields', i: 0 }]
  gap.objectives.forEach((_, i) => blocks.push({ kind: 'objective', i }))
  gap.findings.forEach((_, i) => blocks.push({ kind: 'finding', i }))
  let b = 0
  let lastKey: { kind: string; k: string } | null = null
  const put = (v: string) => {
    if (!lastKey) return
    const blk = blocks[b]
    if (blk.kind === 'fields') out.fields[lastKey.k] = `${out.fields[lastKey.k] ?? ''} ${v}`.trim()
    else if (blk.kind === 'objective') { const o = out.objectives[blk.i]; if (lastKey.k === 'result') o.result = `${o.result} ${v}`.trim(); else o.note = `${o.note} ${v}`.trim() }
    else { const f = out.findings[blk.i]; f.slots[lastKey.k] = `${f.slots[lastKey.k] ?? ''} ${v}`.trim() }
  }
  const usedPerFinding = new Map<number, number>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('▪')) {
      b = Math.min(blocks.length - 1, b + 1)
      lastKey = null
      continue
    }
    const sl = splitLabel(line)
    const blk = blocks[b]
    if (!sl) { put(line); continue }
    const p = normalizeFa(sl.prefix)
    if (blk.kind === 'fields') {
      const f = gap.fields.find((x) => p.startsWith(base(x)) || base(x).startsWith(p))
      if (f) { lastKey = { kind: 'fields', k: f }; put(sl.value) } else put(line)
    } else if (blk.kind === 'objective') {
      lastKey = { kind: 'objective', k: p.startsWith('نتیجه') ? 'result' : 'note' }
      put(sl.value)
    } else {
      const spec = gap.findings[blk.i]
      let slot = spec.slots.find((s) => p.startsWith(base(SLOT_LABEL[s as Slot])) || base(SLOT_LABEL[s as Slot]).startsWith(p))
      if (!slot) slot = spec.slots[usedPerFinding.get(blk.i) ?? 0]
      if (!slot) { put(line); continue }
      usedPerFinding.set(blk.i, spec.slots.indexOf(slot) + 1)
      lastKey = { kind: 'finding', k: slot }
      put(sl.value)
    }
  }
  return out
}

// ------------------------------------------------------------------------------------- question text

export function batchQuestionText(def: TopicDef, mandatory: boolean, questionTexts: string[], layout: PendingLayout): string {
  const lines = [`📌 «${def.title}»${mandatory ? ' — از اهداف مأموریت شماست' : ''}`, 'لطفاً به همه موارد زیر یکجا پاسخ بدهید:']
  questionTexts.forEach((t, i) => lines.push(`${faNum(i + 1)}) ${t}`))
  if (layout.entries) lines.push(`برای هر ${layout.entries.item}: ${layout.entries.ownerLabel} و ${layout.entries.dueLabel} را حتماً بنویسید (حداکثر ${faNum(layout.entries.count)} مورد؛ موارد بیشتر را بعداً می‌توانید اضافه کنید).`)
  lines.push('قالب پاسخ در کادر پایین آماده است؛ جلوی هر خط بنویسید. اگر موردی ندارید بنویسید «ندارم»، و اگر چیزی ناقص ماند، فقط همان را دوباره می‌پرسم.')
  return lines.join('\n')
}

export function gapQuestionText(def: TopicDef, round: number, gap: GapSpec): string {
  const n = gap.fields.length + gap.objectives.length + gap.findings.reduce((s, f) => s + f.slots.length, 0)
  return `🔎 «${def.title}» — ${round > 1 ? 'هنوز' : ''} ${faNum(n)} مورد ناقص مانده است. جلوی هر خط بنویسید؛ اگر نمی‌دانید «نمی‌دانم» بنویسید و آن مورد بسته می‌شود.`.replace(/\s+/g, ' ')
}
