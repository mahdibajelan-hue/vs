/**
 * Document ↔ activity link templates. A template stores each link by keys that survive the move to another project, and
 * applying it matches the target project's documents and activities by those keys:
 *  - a document by its number without the project number (791355-DP1-PLN-CP-CAL-0002 → DP1-PLN-CP-CAL-0002), else by its
 *    normalised title when that title is unique in the project;
 *  - an activity by its price-book item number with its title, else the item number alone when unique, else the title alone
 *    when unique.
 * Nothing is matched by guesswork: an item with no unique match is reported, not linked.
 */
export interface TplDoc { id: string; docNo: string; title: string; discipline?: string; category?: string }
export interface TplAct { id: string; itemNo: string; title: string; plannedStart?: string | null; /** tie-breakers when the item number and title repeat in an estimate */ spec?: string; rowNo?: string }
export interface TplLink { docId: string; activityId: string; front: string; contract: string; needKind: 'start' | 'continue'; needDate: string | null; minStatus: 'issued' | 'approved'; allowRestricted: boolean; altActivityId: string | null; note: string }

export interface TplItem {
  docKey: string; docNo: string; docTitle: string; discipline: string
  actItemNo: string; actTitle: string; actSpec?: string; actRowNo?: string
  altItemNo: string; altTitle: string
  needKind: 'start' | 'continue'; minStatus: 'issued' | 'approved'; allowRestricted: boolean; front: string; contract: string; note: string
  /** need date as days before (−) / after (+) the activity's planned start in the source project; null = no need date */
  needOffset: number | null
}

const digitsFa = (s: string) => s.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
/** document number without the project number(s): segments of five or more digits are the project's, the rest is the document's */
export function docKey(docNo: string): string {
  return digitsFa(docNo).toUpperCase().split(/[\s\-_/.]+/).filter((t) => t && !/^\d{5,}$/.test(t)).join('-')
}
/** a title reduced to its words: case, Arabic/Persian letter variants, punctuation and project numbers do not matter */
export function titleKey(title: string): string {
  return digitsFa(title).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌ً-ْ]/g, '')
    .replace(/\b\d{5,}\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}
const itemKey = (s: string) => digitsFa(s).replace(/\s+/g, '').toUpperCase()
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
const addDays = (a: string, n: number) => new Date(Date.parse(`${a}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

export function buildTemplate(links: TplLink[], docs: TplDoc[], acts: TplAct[]): TplItem[] {
  const docById = new Map(docs.map((d) => [d.id, d])), actById = new Map(acts.map((a) => [a.id, a]))
  return links.flatMap((l): TplItem[] => {
    const d = docById.get(l.docId), a = actById.get(l.activityId)
    if (!d || !a) return []
    const alt = l.altActivityId ? actById.get(l.altActivityId) : undefined
    return [{
      docKey: docKey(d.docNo), docNo: d.docNo, docTitle: d.title, discipline: d.discipline ?? '',
      actItemNo: a.itemNo ?? '', actTitle: a.title, actSpec: a.spec ?? '', actRowNo: a.rowNo ?? '', altItemNo: alt?.itemNo ?? '', altTitle: alt?.title ?? '',
      needKind: l.needKind, minStatus: l.minStatus, allowRestricted: l.allowRestricted, front: l.front ?? '', contract: l.contract ?? '', note: l.note ?? '',
      needOffset: l.needDate && a.plannedStart ? days(a.plannedStart, l.needDate) : null,
    }]
  })
}

/** an index that answers only when the answer is unique */
function uniq<T>(xs: T[], key: (x: T) => string): Map<string, T | null> {
  const m = new Map<string, T | null>()
  for (const x of xs) { const k = key(x); if (!k) continue; m.set(k, m.has(k) ? null : x) }
  return m
}

export type DocMatch = 'number' | 'title'
export type ActMatch = 'item+title' | 'item' | 'title'
export interface PlanRow { item: TplItem; doc: TplDoc | null; docBy: DocMatch | null; act: TplAct | null; actBy: ActMatch | null; alt: TplAct | null; exists: boolean; link: TplLink | null }
export interface ApplyPlan { rows: PlanRow[]; create: TplLink[]; existing: number; missingDoc: number; missingAct: number }

export function planTemplate(items: TplItem[], docs: TplDoc[], acts: TplAct[], existing: { docId: string; activityId: string }[]): ApplyPlan {
  const byKey = uniq(docs, (d) => docKey(d.docNo)), byTitle = uniq(docs, (d) => titleKey(d.title))
  const byItemTitle = uniq(acts, (a) => (a.itemNo ? `${itemKey(a.itemNo)}|${titleKey(a.title)}` : '')), byItem = uniq(acts, (a) => itemKey(a.itemNo ?? '')), byActTitle = uniq(acts, (a) => titleKey(a.title))
  const have = new Set(existing.map((l) => `${l.docId}|${l.activityId}`))
  const bySpec = uniq(acts, (a) => (a.itemNo ? `${itemKey(a.itemNo)}|${titleKey(a.title)}|${titleKey(a.spec ?? '')}` : ''))
  const byRow = uniq(acts, (a) => (a.itemNo ? `${itemKey(a.itemNo)}|${titleKey(a.title)}|${titleKey(a.spec ?? '')}|${(a.rowNo ?? '').trim()}` : ''))
  const findAct = (itemNo: string, title: string, spec = '', rowNo = ''): [TplAct | null, ActMatch | null] => {
    const it = itemKey(itemNo), tk = titleKey(title)
    if (it) {
      const x = byItemTitle.get(`${it}|${tk}`); if (x) return [x, 'item+title']
      // the same item and title repeat (rows of one estimate differing in size range): the specification, then the row, decide
      if (byItemTitle.has(`${it}|${tk}`)) {
        const s1 = bySpec.get(`${it}|${tk}|${titleKey(spec)}`); if (s1) return [s1, 'item+title']
        const s2 = byRow.get(`${it}|${tk}|${titleKey(spec)}|${rowNo.trim()}`); if (s2) return [s2, 'item+title']
        return [null, null]
      }
      const y = byItem.get(it); if (y) return [y, 'item']
    }
    const z = tk ? byActTitle.get(tk) : null
    return z ? [z, 'title'] : [null, null]
  }
  const seen = new Set<string>()
  const rows = items.map((item): PlanRow => {
    let doc: TplDoc | null = null, docBy: DocMatch | null = null
    const k = byKey.get(item.docKey); if (item.docKey && k) { doc = k; docBy = 'number' } else { const t = byTitle.get(titleKey(item.docTitle)); if (t) { doc = t; docBy = 'title' } }
    const [act, actBy] = findAct(item.actItemNo, item.actTitle, item.actSpec ?? '', item.actRowNo ?? '')
    const [alt0] = item.altItemNo || item.altTitle ? findAct(item.altItemNo, item.altTitle) : [null]
    const alt = alt0 && act && alt0.id !== act.id ? alt0 : null
    const pair = doc && act ? `${doc.id}|${act.id}` : ''
    const exists = !!pair && (have.has(pair) || seen.has(pair))
    if (pair) seen.add(pair)
    const link: TplLink | null = doc && act && !exists ? {
      docId: doc.id, activityId: act.id, front: item.front, contract: item.contract, needKind: item.needKind, minStatus: item.minStatus, allowRestricted: item.allowRestricted,
      altActivityId: alt?.id ?? null, note: item.note, needDate: item.needOffset != null && act.plannedStart ? addDays(act.plannedStart, item.needOffset) : null,
    } : null
    return { item, doc, docBy, act, actBy, alt, exists, link }
  })
  return { rows, create: rows.flatMap((r) => (r.link ? [r.link] : [])), existing: rows.filter((r) => r.exists).length, missingDoc: rows.filter((r) => !r.doc).length, missingAct: rows.filter((r) => !r.act).length }
}
