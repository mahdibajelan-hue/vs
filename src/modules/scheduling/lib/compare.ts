import { daysBetween } from '../../execution/lib/periods'
import type { CalendarDef } from './calendar'
import type { SchActivity, SchRelation } from './types'

export interface VersionData { activities: SchActivity[]; relations: SchRelation[]; calendar: CalendarDef }
export interface FieldChange { field: string; from: string; to: string; /** calendar days (later = positive) for date fields, working days for durations */ shift?: number }
export interface ActivityChange { uid: string; code: string; name: string; changes: FieldChange[] }
export interface RelationChange { key: string; pred: string; succ: string; type: string; lag: number; from?: { type: string; lag: number } }
export interface VersionDiff {
  added: SchActivity[]
  removed: SchActivity[]
  changed: ActivityChange[]
  relationsAdded: RelationChange[]
  relationsRemoved: RelationChange[]
  relationsChanged: RelationChange[]
  calendarChanges: string[]
  counts: { added: number; removed: number; changed: number; relationsAdded: number; relationsRemoved: number; relationsChanged: number; datesMoved: number; durationsChanged: number }
}

const sh = (a: string | null, b: string | null): number | undefined => (a && b ? daysBetween(a, b) : undefined)
const s = (v: unknown) => (v == null || v === '' ? '—' : String(v))
const FIELDS: { key: keyof SchActivity; label: string; date?: boolean }[] = [
  { key: 'name', label: 'نام' }, { key: 'wbsCode', label: 'WBS' }, { key: 'type', label: 'نوع' }, { key: 'origDuration', label: 'مدت' },
  { key: 'plannedStart', label: 'شروع', date: true }, { key: 'plannedFinish', label: 'پایان', date: true },
  { key: 'constraintType', label: 'قید' }, { key: 'constraintDate', label: 'تاریخ قید', date: true },
]

/** Compare an older version with a newer one. Activities are matched by their stable uid (set when a version is imported over an earlier one), falling back to the code. */
export function compareVersions(older: VersionData, newer: VersionData): VersionDiff {
  const key = (a: SchActivity) => a.uid
  const byUidOld = new Map(older.activities.map((a) => [key(a), a])), byCodeOld = new Map(older.activities.map((a) => [a.code, a]))
  const matchedOld = new Set<string>()
  const pair = new Map<string, string>()   // newer activity id → older activity id
  const added: SchActivity[] = [], changed: ActivityChange[] = []
  for (const n of newer.activities) {
    const o = byUidOld.get(key(n)) ?? byCodeOld.get(n.code)
    if (!o) { added.push(n); continue }
    matchedOld.add(o.id); pair.set(n.id, o.id)
    const changes: FieldChange[] = []
    for (const f of FIELDS) {
      const a = o[f.key], b = n[f.key]
      if ((a ?? '') !== (b ?? '')) changes.push({ field: f.label, from: s(a), to: s(b), shift: f.date ? sh(a as string | null, b as string | null) : f.key === 'origDuration' ? Number(b) - Number(a) : undefined })
    }
    if (changes.length) changed.push({ uid: n.uid, code: n.code, name: n.name, changes })
  }
  const removed = older.activities.filter((o) => !matchedOld.has(o.id))
  // relations by (pred code, succ code, type)
  const codeOf = (list: SchActivity[]) => new Map(list.map((a) => [a.id, a.code]))
  const co = codeOf(older.activities), cn = codeOf(newer.activities)
  const toMap = (rels: SchRelation[], c: Map<string, string>) => new Map(rels.filter((r) => c.has(r.predId) && c.has(r.succId)).map((r) => [`${c.get(r.predId)}>${c.get(r.succId)}:${r.type}`, r]))
  const mo = toMap(older.relations, co), mn = toMap(newer.relations, cn)
  const shape = (k: string, r: SchRelation, c: Map<string, string>): RelationChange => ({ key: k, pred: c.get(r.predId)!, succ: c.get(r.succId)!, type: r.type, lag: r.lag })
  const relationsAdded: RelationChange[] = [], relationsRemoved: RelationChange[] = [], relationsChanged: RelationChange[] = []
  for (const [k, r] of mn) { const o = mo.get(k); if (!o) relationsAdded.push(shape(k, r, cn)); else if (o.lag !== r.lag) relationsChanged.push({ ...shape(k, r, cn), from: { type: o.type, lag: o.lag } }) }
  for (const [k, r] of mo) if (!mn.has(k)) relationsRemoved.push(shape(k, r, co))
  const calendarChanges: string[] = []
  const a = older.calendar, b = newer.calendar
  if ([...a.workDays].sort().join() !== [...b.workDays].sort().join()) calendarChanges.push('هفتهٔ کاری تغییر کرده است')
  if (a.hoursPerDay !== b.hoursPerDay) calendarChanges.push(`ساعات کاری روزانه ${a.hoursPerDay} → ${b.hoursPerDay}`)
  const hAdd = b.holidays.filter((h) => !a.holidays.includes(h)).length, hDel = a.holidays.filter((h) => !b.holidays.includes(h)).length
  if (hAdd || hDel) calendarChanges.push(`تعطیلات: ${hAdd} افزوده، ${hDel} حذف`)
  return {
    added, removed, changed, relationsAdded, relationsRemoved, relationsChanged, calendarChanges,
    counts: {
      added: added.length, removed: removed.length, changed: changed.length, relationsAdded: relationsAdded.length, relationsRemoved: relationsRemoved.length, relationsChanged: relationsChanged.length,
      datesMoved: changed.filter((c) => c.changes.some((x) => (x.field === 'شروع' || x.field === 'پایان') && x.shift)).length, durationsChanged: changed.filter((c) => c.changes.some((x) => x.field === 'مدت')).length,
    },
  }
}
