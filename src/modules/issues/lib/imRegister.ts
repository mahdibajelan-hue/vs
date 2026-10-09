import type { ImIssue, ImIssuePriority, ImStage, ImTask } from '../types'
import { effectiveDue, isActiveIssue, priorityRank, stageOf, dayDiff, IM_STAGE_LABEL_FA, IM_CATEGORY_FA, IM_SOURCE_FA } from './imModel'
import { normalizeFa } from './imText'

export interface IssueFilter {
  q: string
  projectId: string
  stage: ImStage | 'all' | 'active'
  severity: ImIssuePriority | 'all'
  category: string
  userId: string // any role
  overdueOnly: boolean
  blockedOnly: boolean
  source: string
}
export const EMPTY_FILTER: IssueFilter = { q: '', projectId: 'all', stage: 'active', severity: 'all', category: 'all', userId: 'all', overdueOnly: false, blockedOnly: false, source: 'all' }

export function applyFilter(issues: ImIssue[], f: IssueFilter, today: string): ImIssue[] {
  const q = normalizeFa(f.q)
  return issues.filter((i) => {
    if (f.projectId !== 'all' && i.projectId !== f.projectId) return false
    if (f.stage === 'active' ? !isActiveIssue(i) : f.stage !== 'all' && stageOf(i) !== f.stage) return false
    if (f.severity !== 'all' && (i.severity ?? i.priority) !== f.severity) return false
    if (f.category !== 'all' && (i.category ?? '') !== f.category) return false
    if (f.source !== 'all' && i.source !== f.source) return false
    if (f.userId !== 'all' && ![i.ownerId, i.followUpId, i.pursuerId, i.approverId].includes(f.userId)) return false
    if (f.overdueOnly && !(isActiveIssue(i) && effectiveDue(i) < today)) return false
    if (f.blockedOnly && !i.blockedSince) return false
    if (q) {
      const hay = normalizeFa([i.code, i.title, i.description, i.location, i.discipline, i.rootCauseSummary, (i.tags ?? []).join(' ')].join(' '))
      if (!q.split(' ').every((w) => hay.includes(w))) return false
    }
    return true
  })
}

export type SortKey = 'code' | 'title' | 'stage' | 'severity' | 'due' | 'age'
export function sortIssues(list: ImIssue[], key: SortKey, dir: 1 | -1, today: string): ImIssue[] {
  const val = (i: ImIssue): number | string => {
    switch (key) {
      case 'code': return i.code ?? ''
      case 'title': return i.title
      case 'stage': return IM_STAGE_LABEL_FA[stageOf(i)]
      case 'severity': return priorityRank(i.severity ?? i.priority)
      case 'due': return effectiveDue(i)
      case 'age': return dayDiff(i.createdAt.slice(0, 10), today)
    }
  }
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b)
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'fa')) * dir
  })
}

// ── CSV ───────────────────────────────────────────────────────────────────────────────────────
const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export const EXPORT_COLUMNS: { key: string; label: string; get: (i: ImIssue, ctx: { project: (id: string) => string; user: (id: string | null) => string; tasks: ImTask[] }) => unknown }[] = [
  { key: 'code', label: 'شناسه', get: (i) => i.code },
  { key: 'title', label: 'عنوان', get: (i) => i.title },
  { key: 'project', label: 'پروژه', get: (i, c) => c.project(i.projectId) },
  { key: 'stage', label: 'مرحله', get: (i) => IM_STAGE_LABEL_FA[stageOf(i)] },
  { key: 'severity', label: 'شدت', get: (i) => i.severity ?? i.priority },
  { key: 'category', label: 'دسته', get: (i) => (i.category ? IM_CATEGORY_FA[i.category] ?? i.category : '') },
  { key: 'owner', label: 'مالک', get: (i, c) => c.user(i.ownerId ?? null) },
  { key: 'followUp', label: 'پیگیری‌کننده', get: (i, c) => c.user(i.followUpId ?? null) },
  { key: 'pursuer', label: 'مسئول انجام', get: (i, c) => c.user(i.pursuerId) },
  { key: 'created', label: 'تاریخ ثبت', get: (i) => i.createdAt.slice(0, 10) },
  { key: 'due', label: 'سررسید مؤثر', get: (i) => effectiveDue(i) },
  { key: 'originalDue', label: 'سررسید اولیه', get: (i) => i.originalDueDate ?? i.deadlineDate },
  { key: 'extensions', label: 'تعداد تمدید', get: (i) => i.extensionCount ?? 0 },
  { key: 'source', label: 'منبع', get: (i) => IM_SOURCE_FA[i.source] ?? i.source },
  { key: 'openTasks', label: 'اقدامات باز', get: (i, c) => c.tasks.filter((t) => t.issueId === i.id && t.status !== 'done' && t.status !== 'cancelled').length },
]

export function toCsv(list: ImIssue[], ctx: Parameters<(typeof EXPORT_COLUMNS)[number]['get']>[1]): string {
  const head = EXPORT_COLUMNS.map((c) => esc(c.label)).join(',')
  const rows = list.map((i) => EXPORT_COLUMNS.map((c) => esc(c.get(i, ctx))).join(','))
  return '﻿' + [head, ...rows].join('\r\n') // BOM → Excel reads Persian correctly
}

/** RFC-4180 style parser (quoted fields, doubled quotes, CRLF/LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  const t = text.replace(/^﻿/, '')
  for (let k = 0; k < t.length; k++) {
    const ch = t[k]
    if (q) {
      if (ch === '"') { if (t[k + 1] === '"') { cur += '"'; k++ } else q = false } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[k + 1] === '\n') k++; row.push(cur); cur = ''; if (row.some((c) => c.trim() !== '')) rows.push(row); row = [] }
    else cur += ch
  }
  row.push(cur)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

const HEADER_ALIASES: Record<string, string> = {
  title: 'title', 'عنوان': 'title', description: 'description', 'شرح': 'description', 'توضیحات': 'description',
  severity: 'severity', 'شدت': 'severity', priority: 'severity', 'اولویت': 'severity',
  category: 'category', 'دسته': 'category', location: 'location', 'محل': 'location', discipline: 'discipline', 'رشته': 'discipline',
  deadline_days: 'deadline_days', 'مهلت': 'deadline_days', 'مهلت (روز)': 'deadline_days', source_ref_id: 'source_ref_id', 'شناسه منبع': 'source_ref_id',
}
const SEV_FA: Record<string, ImIssuePriority> = { 'کم': 'low', 'متوسط': 'medium', 'بالا': 'high', 'بحرانی': 'critical', low: 'low', medium: 'medium', high: 'high', critical: 'critical' }
const CAT_BY_LABEL = Object.fromEntries(Object.entries(IM_CATEGORY_FA).map(([k, v]) => [v, k]))

export interface ImportPreview { rows: Record<string, unknown>[]; errors: { line: number; message: string }[] }
export function parseImport(text: string): ImportPreview {
  const table = parseCsv(text)
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'فایل خالی است یا ردیف داده ندارد' }] }
  const cols = table[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] ?? HEADER_ALIASES[h.trim()] ?? null)
  if (!cols.includes('title')) return { rows: [], errors: [{ line: 1, message: 'ستون «عنوان» (title) یافت نشد' }] }
  const rows: Record<string, unknown>[] = []
  const errors: { line: number; message: string }[] = []
  table.slice(1).forEach((r, idx) => {
    const o: Record<string, unknown> = {}
    cols.forEach((c, k) => { if (c && (r[k] ?? '').trim() !== '') o[c] = r[k].trim() })
    const line = idx + 2
    if (!o.title) { errors.push({ line, message: 'عنوان خالی است' }); return }
    if (o.severity) { const s = SEV_FA[String(o.severity).trim().toLowerCase()] ?? SEV_FA[String(o.severity).trim()]; if (!s) { errors.push({ line, message: `شدت نامعتبر: ${o.severity}` }); return } o.severity = s; o.priority = s }
    if (o.category) { const c = IM_CATEGORY_FA[String(o.category)] ? String(o.category) : CAT_BY_LABEL[String(o.category)]; if (!c) { errors.push({ line, message: `دستهٔ نامعتبر: ${o.category}` }); return } o.category = c }
    if (o.deadline_days) { const n = Number(o.deadline_days); if (!Number.isInteger(n) || n < 1 || n > 365) { errors.push({ line, message: 'مهلت باید عدد صحیح ۱ تا ۳۶۵ باشد' }); return } o.deadline_days = n }
    o.source = 'import'
    rows.push(o)
  })
  return { rows, errors }
}

/** Kanban grouping by the main flow stages (+ side stages collapsed into «خارج از مسیر»). */
export const KANBAN_STAGES: ImStage[] = ['registered', 'validated', 'analysis', 'action_plan', 'in_progress', 'resolution_review', 'effectiveness_check', 'closed']
export function groupByStage(list: ImIssue[]): Record<string, ImIssue[]> {
  const g: Record<string, ImIssue[]> = Object.fromEntries([...KANBAN_STAGES, 'other'].map((s) => [s, []]))
  for (const i of list) { const s = stageOf(i); (g[KANBAN_STAGES.includes(s) ? s : 'other']).push(i) }
  return g
}
