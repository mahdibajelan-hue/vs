import type { RiskDraft } from '../store/useRiskStore'
import { RM_CATEGORY_LABEL_FA } from '../types'
import { todayIso } from './riskScore'

/** RFC-4180-ish CSV parser (quotes, commas/semicolons/tabs, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const first = t.split(/\r?\n/, 1)[0] ?? ''
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0]
  const rows: string[][] = []
  let cur: string[] = [], field = '', q = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (q) { if (c === '"' && t[i + 1] === '"') { field += '"'; i++ } else if (c === '"') q = false; else field += c }
    else if (c === '"') q = true
    else if (c === delim) { cur.push(field); field = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; cur.push(field); field = ''; if (cur.some((x) => x.trim() !== '')) rows.push(cur); cur = [] }
    else field += c
  }
  cur.push(field)
  if (cur.some((x) => x.trim() !== '')) rows.push(cur)
  return rows
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

const toEn = (v: string) => v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

export const IMPORT_COLUMNS: { key: string; label: string; aliases: string[]; required?: boolean }[] = [
  { key: 'title', label: 'عنوان', aliases: ['عنوان', 'title', 'عنوان ریسک'], required: true },
  { key: 'category', label: 'دسته', aliases: ['دسته', 'دسته‌بندی', 'category'], required: true },
  { key: 'probability', label: 'احتمال', aliases: ['احتمال', 'probability'], required: true },
  { key: 'impact', label: 'اثر', aliases: ['اثر', 'شدت', 'impact'], required: true },
  { key: 'description', label: 'شرح', aliases: ['شرح', 'توضیح', 'description'] },
  { key: 'cause', label: 'علت', aliases: ['علت', 'cause'] },
  { key: 'riskEvent', label: 'رویداد', aliases: ['رویداد', 'رویداد ریسک', 'event'] },
  { key: 'consequence', label: 'پیامد', aliases: ['پیامد', 'consequence'] },
  { key: 'owner', label: 'مالک (ایمیل)', aliases: ['مالک', 'مالک (ایمیل)', 'owner', 'ایمیل مالک'] },
  { key: 'kmFrom', label: 'از کیلومتر', aliases: ['از کیلومتر', 'km_from'] },
  { key: 'kmTo', label: 'تا کیلومتر', aliases: ['تا کیلومتر', 'km_to'] },
  { key: 'station', label: 'ایستگاه', aliases: ['ایستگاه', 'station'] },
  { key: 'contractor', label: 'پیمانکار', aliases: ['پیمانکار', 'contractor'] },
  { key: 'discipline', label: 'حوزه', aliases: ['حوزه', 'discipline'] },
]

export interface ImportResult { drafts: { row: number; draft: Omit<RiskDraft, never> }[]; errors: { row: number; message: string }[]; unknownColumns: string[] }

/** Validates every row and says exactly what is wrong with each; only valid rows are returned for creation. */
export function parseRiskImport(text: string, ctx: { categories: { key: string; labelFa: string }[]; emailToUser: (email: string) => string | null; today?: string }): ImportResult {
  const rows = parseCsv(text)
  const out: ImportResult = { drafts: [], errors: [], unknownColumns: [] }
  if (rows.length < 2) { out.errors.push({ row: 0, message: 'فایل خالی است یا فقط سطر عنوان دارد.' }); return out }
  const header = rows[0].map((h) => h.trim())
  const idx = new Map<string, number>()
  header.forEach((h, i) => { const col = IMPORT_COLUMNS.find((c) => c.aliases.includes(h)); if (col) idx.set(col.key, i); else if (h) out.unknownColumns.push(h) })
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !idx.has(c.key)).map((c) => c.label)
  if (missing.length) { out.errors.push({ row: 1, message: `ستون‌های الزامی یافت نشد: ${missing.join('، ')}` }); return out }
  const catByLabel = new Map<string, string>()
  for (const c of ctx.categories) { catByLabel.set(c.key, c.key); catByLabel.set(c.labelFa.trim(), c.key) }
  for (const [k, l] of Object.entries(RM_CATEGORY_LABEL_FA)) catByLabel.set(l, k)
  const get = (r: string[], k: string) => (idx.has(k) ? (r[idx.get(k)!] ?? '').trim() : '')
  rows.slice(1).forEach((r, n) => {
    const row = n + 2
    const title = get(r, 'title')
    const cat = catByLabel.get(get(r, 'category'))
    const p = Number(toEn(get(r, 'probability'))), i = Number(toEn(get(r, 'impact')))
    const errs: string[] = []
    if (title.length < 4) errs.push('عنوان حداقل ۴ نویسه')
    if (!cat) errs.push(`دستهٔ «${get(r, 'category')}» شناخته نشد`)
    if (!(Number.isInteger(p) && p >= 1 && p <= 5)) errs.push('احتمال باید عدد ۱ تا ۵ باشد')
    if (!(Number.isInteger(i) && i >= 1 && i <= 5)) errs.push('اثر باید عدد ۱ تا ۵ باشد')
    const email = get(r, 'owner')
    const owner = email ? ctx.emailToUser(email.toLowerCase()) : null
    if (email && !owner) errs.push(`مالک «${email}» در مدیریت کاربران یافت نشد`)
    const num = (k: string) => { const v = get(r, k); return v === '' ? null : Number(toEn(v)) }
    const kmFrom = num('kmFrom'), kmTo = num('kmTo')
    if ((kmFrom !== null && !Number.isFinite(kmFrom)) || (kmTo !== null && !Number.isFinite(kmTo))) errs.push('کیلومتراژ عددی نیست')
    if (kmFrom !== null && kmTo !== null && kmFrom > kmTo) errs.push('کیلومتر شروع از پایان بزرگ‌تر است')
    if (errs.length) { out.errors.push({ row, message: errs.join('؛ ') }); return }
    out.drafts.push({
      row, draft: {
        title, description: get(r, 'description'), category: cat!, subcategory: null, riskType: 'threat', cause: get(r, 'cause'), riskEvent: get(r, 'riskEvent'), consequence: get(r, 'consequence'),
        ownerId: owner, monitorId: null, approverId: null, responseOwnerId: null, identifiedDate: ctx.today ?? todayIso(), projectPhase: null, discipline: get(r, 'discipline'), timeToImpactDays: null,
        probability: p, impact: i, impactDims: {}, impactTimeDays: null, impactCost: null, impactObjectives: '', responseStrategy: 'mitigate', strategyDetails: {}, assumptions: '', assessmentBasis: '',
        kmFrom, kmTo, routeSegment: '', station: get(r, 'station'), workFront: '', contractor: get(r, 'contractor'), workPackage: '', execStage: '', reviewIntervalDays: null, tags: ['ورود از فایل'],
      },
    })
  })
  return out
}

export function importTemplateCsv(): string {
  return toCsv([IMPORT_COLUMNS.map((c) => c.label), ['تأخیر در تحویل لولهٔ ۵۶ اینچ', 'تأمین کالا و تجهیزات', 4, 4, 'ظرفیت کارخانه محدود است', 'ظرفیت کارخانه', 'تحویل ۴۵ روز دیر می‌شود', 'توقف جبهه کاری', '', '12.5', '40', '', 'پیمانکار نمونه', 'خط لوله']])
}
