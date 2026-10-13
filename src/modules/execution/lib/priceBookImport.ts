/**
 * Reads the contract estimate workbooks (فهرست بهای پایه + مقادیر پیمان) into price-book items and contract rows.
 * Three layouts occur in practice and are all handled here:
 *  A. a table with a header row (ردیف | * | کد فهرست | شرح | واحد | بهای واحد | مقدار | بهای کل | توضیحات), chapters either stacked on one sheet or one sheet per chapter;
 *  B. the electrical layout where a group block (کد/گروه → group code + title → item code → «دامنه وزنی/اندازه» header) carries one row per size range;
 *  C. the pipeline layout whose «ستاره‌دار» rows are not marked by a symbol but are the ones added in the formula of «جمع آیتم‌های ستاره‌دار».
 * Every chapter is reconciled against the sub-total printed in the file, so a mis-read column shows up before anything is imported.
 */
export type Cell = string | number | boolean | null | undefined
export interface Grid { name: string; rows: Cell[][]; /** formulas by [row][col] when the source has them */ formulas?: (string | null)[][] }

export interface ParsedItem { itemNo: string; spec: string; description: string; unit: string; unitPrice: number; chapter: string; chapterNo: string; starred: boolean; groupCode: string; groupTitle: string; parentItemNo: string; surchargePct: number | null; remark: string }
export interface ParsedRow { itemKey: string; rowNo: string; itemNo: string; spec: string; description: string; unit: string; unitPrice: number; qty: number; chapter: string; chapterNo: string; starred: boolean; parentItemNo: string; surchargePct: number | null; remark: string; sheet: string; sourceRow: number }
export interface ChapterCheck { sheet: string; chapter: string; rows: number; computed: number; fileTotal: number | null; starredComputed: number; starredFile: number | null; ok: boolean }
export interface ParsedBook { title: string; discipline: string; year: number | null; items: ParsedItem[]; rows: ParsedRow[]; chapters: ChapterCheck[]; warnings: string[] }

export const norm = (v: unknown): string => String(v ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ـ/g, '').replace(/[‌‏‎]/g, ' ').replace(/\s+/g, ' ').trim()
const num = (v: unknown): number | null => { if (typeof v === 'number') return Number.isFinite(v) ? v : null; if (v == null || v === '') return null; const n = Number(String(v).replace(/[,٬\s]/g, '').replace('٫', '.')); return Number.isFinite(n) ? n : null }
const text = (v: unknown): string => (typeof v === 'string' ? norm(v) : v == null ? '' : String(v))

const ORD: Record<string, number> = { اول: 1, یکم: 1, دوم: 2, سوم: 3, چهارم: 4, پنجم: 5, ششم: 6, هفتم: 7, هشتم: 8, نهم: 9, دهم: 10, یازدهم: 11, دوازدهم: 12, سیزدهم: 13, چهاردهم: 14, پانزدهم: 15, شانزدهم: 16, هفدهم: 17, هجدهم: 18, نوزدهم: 19, بیستم: 20, 'بیست و یکم': 21, 'بیست و دوم': 22, 'بیست و سوم': 23, 'بیست و چهارم': 24, 'بیست و پنجم': 25, 'بیست و ششم': 26, 'بیست و هفتم': 27, 'بیست و هشتم': 28, 'بیست و نهم': 29, سی‌ام: 30 }
/** «فصل بیست و یکم - …» / «2- عملیات…» / «فصل يك» → chapter number as text, '' when unknown. */
export function chapterNumber(label: string): string {
  const s = norm(label)
  const d = s.match(/^(?:فصل\s*)?(\d{1,2})\s*[-–:]/) ?? s.match(/^فصل\s*(\d{1,2})(?!\d)/); if (d) return d[1]
  const w = s.replace(/^:?\s*فصل\s*/, '').split(/[-–:]/)[0].trim().replace(/یکم$/, 'یکم').replace(/^یک$/, 'اول')
  for (const k of Object.keys(ORD).sort((a, b) => b.length - a.length)) if (w === k || w.startsWith(`${k} `)) return String(ORD[k])
  return ''
}
const HEADERS: Record<string, string[]> = {
  rowNo: ['ردیف'], star: ['*'], code: ['کد فهرست', 'شماره آیتم فهرست بها', 'شماره آیتم', 'شماره', 'کد'], desc: ['شرح', 'شرح کامل'], unit: ['واحد'], price: ['بهای واحد', 'بهاي واحد', 'بهای واحد پایه'],
  qty: ['مقدار'], total: ['بهای کل', 'بهای واحد کل', 'جمع به ریال', 'جمع به ريال', 'بهای  کل'],
}
const headerKey = (s: string): string | null => { const t = norm(s); if (!t) return null; for (const [k, names] of Object.entries(HEADERS)) if (names.some((n) => norm(n) === t)) return k; return null }

function lastNumber(row: Cell[]): number | null { for (let i = row.length - 1; i >= 0; i--) { const n = num(row[i]); if (n != null && typeof row[i] !== 'string') return n; if (typeof row[i] === 'string' && n != null && String(row[i]).trim() !== '') return n } return null }

/** Rows referenced by a SUM/addition formula such as =G12+G11 or =SUM(G26:G29). */
function formulaRows(f: string): number[] {
  const out = new Set<number>()
  for (const m of f.matchAll(/\$?([A-Z]{1,2})\$?(\d+)(?::\$?([A-Z]{1,2})\$?(\d+))?/g)) { const a = Number(m[2]), b = m[4] ? Number(m[4]) : a; for (let r = Math.min(a, b); r <= Math.max(a, b); r++) out.add(r) }
  return [...out]
}

export function parsePriceWorkbook(grids: Grid[], fileName = ''): ParsedBook {
  const warnings: string[] = []
  const items = new Map<string, ParsedItem>()
  const rows: ParsedRow[] = []
  const chapters: ChapterCheck[] = []
  let title = '', discipline = ''
  for (const g of grids) {
    // book title / year from the first lines
    for (const r of g.rows.slice(0, 8)) for (const c of r) { const t = text(c); if (!title && /فهرست\s*بها/.test(t) && t.length > 12) title = t }
    const cols: Partial<Record<string, number>> = {}
    let chapter = "", chapterNo = "", cur = null as ChapterCheck | null
    let grp = { code: '', title: '' }, itemCode = '', mode: 'table' | 'group' = 'table', groupHeader: Partial<Record<string, number>> = {}
    const sheetRows: { r: ParsedRow; row: number }[] = []
    const flush = () => { if (cur && (cur.rows || cur.fileTotal != null)) chapters.push(cur); cur = null }
    const startChapter = (label: string) => { const l0 = label.replace(/^:/, '').replace(/:$/, '').trim(); if (cur && cur.chapter.replace(/\s/g, '') === l0.replace(/\s/g, '')) return; flush(); chapter = label.replace(/^:/, '').replace(/:$/, '').trim(); chapterNo = chapterNumber(label); cur = { sheet: g.name, chapter, rows: 0, computed: 0, fileTotal: null, starredComputed: 0, starredFile: null, ok: true } }
    // sheet named after a chapter, with the chapter line in the first rows
    for (let ri = 0; ri < g.rows.length; ri++) {
      const row = g.rows[ri] ?? []
      const cells = row.map(text)
      const nonEmpty = cells.map((t, i) => [t, i] as const).filter(([t]) => t !== '')
      if (!nonEmpty.length) continue
      const first = nonEmpty[0][0]
      // header row of a table
      const keys = cells.map((t) => headerKey(t))
      if (keys.filter((k) => k && k !== 'star').length >= 4 && keys.includes('desc') && keys.includes('price')) {
        for (const k of Object.keys(cols)) delete cols[k]
        keys.forEach((k, i) => { if (k && cols[k] == null) cols[k] = i })
        mode = 'table'; continue
      }
      // layout B: «کد | گروه» then group row, item-code row, header «ردیف | دامنه …»
      if (nonEmpty.length === 2 && cells[0] === 'کد' && cells[1] === 'گروه') { const nx = (g.rows[ri + 1] ?? []).map(text), n2 = (g.rows[ri + 2] ?? []).map(text); grp = { code: nx[0], title: nx[1] }; itemCode = n2[0] ?? ''; ri += 2; mode = 'group'; continue }
      if (mode === 'group' && cells[0] === 'ردیف' && /دامنه|اندازه/.test(cells[1] ?? '')) { for (const k of Object.keys(groupHeader)) delete groupHeader[k]; cells.forEach((t, i) => { const k = headerKey(t); if (k && groupHeader[k] == null) groupHeader[k] = i }); groupHeader.spec = 1; continue }
      // totals
      if (/^جمع/.test(first)) {
        const tc = mode === 'group' ? groupHeader.total : cols.total; const v = tc != null && num(row[tc]) != null ? num(row[tc]) : lastNumber(row)
        if (/ستاره/.test(first)) {
          if (cur) { cur.starredFile = v; const fr = (g.formulas?.[ri] ?? []).find((f) => f && /[A-Z]\d/.test(f)); if (fr) for (const sr of formulaRows(fr)) { const hit = sheetRows.find((x) => x.row === sr); if (hit) hit.r.starred = true } }
        } else if (/فصل/.test(first) || /فصل/.test(cells.join(' '))) { if (cur) cur.fileTotal = v }
        continue
      }
      // chapter line
      const chapterLike = /^:?\s*فصل(?![\u0600-\u06FF])/.test(first) || (nonEmpty.length <= 2 && /^\d{1,2}\s*[-–]\s*\S/.test(first))
      if (chapterLike && !(num(row[cols.price ?? -1]) != null && text(row[cols.code ?? -1]) !== '')) {
        const label = /^:?\s*فصل(?![\u0600-\u06FF])/.test(first) && nonEmpty[1] ? `${first.replace(/:$/, '')} - ${nonEmpty[1][0]}` : first
        startChapter(label); continue
      }
      if (!cur) { startChapter(chapter || g.name) }
      // data row
      let it: ParsedItem | null = null, qty = 0, rowNo = '', price: number | null, remark = ''
      if (mode === 'group') {
        const unit = text(row[groupHeader.unit ?? 4]), spec = text(row[1])
        price = num(row[groupHeader.price ?? 5]); const q = num(row[groupHeader.qty ?? 6])
        if (!unit || price == null || !spec || !itemCode) continue
        qty = q ?? 0; rowNo = text(row[0])
        it = { itemNo: itemCode, spec, description: grp.title, unit, unitPrice: price, chapter, chapterNo, starred: false, groupCode: grp.code, groupTitle: grp.title, parentItemNo: '', surchargePct: null, remark: '' }
      } else {
        const code = text(row[cols.code ?? -1]), desc = text(row[cols.desc ?? -1]), unit = text(row[cols.unit ?? -1])
        price = num(row[cols.price ?? -1])
        if (!code || !desc || price == null || /^کد/.test(code) || !/[0-9A-Za-z]{4,}/.test(code)) continue
        qty = num(row[cols.qty ?? -1]) ?? 0; rowNo = text(row[cols.rowNo ?? -1])
        const after = cols.total != null ? cols.total + 1 : (cols.qty ?? 0) + 2
        remark = cells.slice(after).filter((t) => t && !/^[-\d.eE+]+$/.test(t)).join(' ؛ ')
        const starCell = text(row[cols.star ?? -1])
        const sur = desc.match(/اضافه\s*بها\w*\s*(?:به)?\s*ردی\S*\s*(?:های)?\s*(\d{5,})/) ?? remark.match(/ردیف\s*(\d{5,})/)
        const pct = remark.match(/(\d+(?:\.\d+)?)\s*(?:%|درصد)/)
        it = { itemNo: code, spec: '', description: desc, unit, unitPrice: price, chapter, chapterNo, starred: !!starCell, groupCode: '', groupTitle: '', parentItemNo: sur ? sur[1] : '', surchargePct: pct ? Number(pct[1]) : null, remark }
      }
      const key = `${it.itemNo}|${it.spec}`
      if (!items.has(key)) items.set(key, it)
      const pr: ParsedRow = { itemKey: key, rowNo, itemNo: it.itemNo, spec: it.spec, description: it.spec ? `${it.description} — ${it.spec}` : it.description, unit: it.unit, unitPrice: it.unitPrice, qty, chapter, chapterNo, starred: it.starred, parentItemNo: it.parentItemNo, surchargePct: it.surchargePct, remark: it.remark, sheet: g.name, sourceRow: ri + 1 }
      rows.push(pr); sheetRows.push({ r: pr, row: ri + 1 })
      if (cur) { cur.rows++; cur.computed += qty * price }
    }
    flush()
    // starred amounts per chapter, after the formula marks were applied
    const byChapter = new Map<string, number>()
    for (const { r } of sheetRows) if (r.starred) byChapter.set(r.chapter, (byChapter.get(r.chapter) ?? 0) + r.qty * r.unitPrice)
    for (const c of chapters) if (c.sheet === g.name) c.starredComputed = byChapter.get(c.chapter) ?? 0
  }
  for (const c of chapters) {
    // the file's chapter total is the catalogue sum + starred sum when it prints both, otherwise just the rows
    const expected = c.fileTotal
    c.ok = expected == null || Math.abs(c.computed - expected) <= Math.max(1, Math.abs(expected) * 1e-6)
    if (!c.ok) warnings.push(`فصل «${c.chapter}» (${c.sheet}): جمع محاسبه‌شده ${Math.round(c.computed).toLocaleString('fa-IR')} با جمع فایل ${Math.round(expected!).toLocaleString('fa-IR')} نمی‌خواند`)
  }
  const year = Number((title.match(/(?:13|14)\d\d/) ?? [])[0]) || Number((fileName.match(/(?:13|14)\d\d/) ?? [])[0]) || null
  const t = title || fileName.replace(/\.xlsx?$/i, '')
  const dm = t.match(/رشته\s+([^\d]+?)(?:\s+سال|$)/) ?? t.match(/فهرست\s*بهای?\s*(?:واحد\s*پایه\s*)?(?:رشته\s*)?(.+?)(?:\s*-?\s*سال|$)/)
  discipline = dm ? dm[1].trim() : ''
  if (!rows.length) warnings.push('هیچ ردیفی شناسایی نشد؛ ستون‌های «کد فهرست / شرح / واحد / بهای واحد» را بررسی کنید.')
  // starred rows by price ratio of surcharges that did not carry a percentage
  const byCode = new Map(rows.map((r) => [r.itemNo, r]))
  for (const r of rows) if (r.parentItemNo && r.surchargePct == null) { const p = byCode.get(r.parentItemNo) ?? [...byCode.values()].find((x) => x.itemNo.endsWith(r.parentItemNo.replace(/^0+/, ''))); if (p && p.unitPrice > 0) r.surchargePct = Math.round((r.unitPrice / p.unitPrice) * 10000) / 100 }
  return { title: t, discipline, year, items: [...items.values()], rows, chapters, warnings }
}

/** Value-proportional weights summing to exactly 100 inside each group (largest remainder on 2 decimals). */
export function weightsByValue(values: number[]): number[] {
  const tot = values.reduce((a, b) => a + b, 0)
  if (tot <= 0) return values.map(() => 0)
  const raw = values.map((v) => (v / tot) * 10000), fl = raw.map(Math.floor)
  let rest = 10000 - fl.reduce((a, b) => a + b, 0)
  const order = raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) { if (rest <= 0) break; fl[i]++; rest-- }
  return fl.map((x) => x / 100)
}
