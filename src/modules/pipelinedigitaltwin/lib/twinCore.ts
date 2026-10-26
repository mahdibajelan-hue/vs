/**
 * Digital-twin rules — pure, no I/O, so the 3D view, the entry drawer and every role's summary read the same numbers.
 *  - Joints are geometric: one girth weld every stock length along the route. Only joints somebody worked on are stored
 *    (pdt_joints rows); every other joint is «not started». Each stage keeps the date it was set, which is the history the
 *    timeline and «as of date» views replay.
 *  - Bulk entry works on a km range → joint-number range, and warns about out-of-sequence work (coating before an
 *    accepted NDT, lowering before coating, backfill before lowering, NDT before welding).
 *  - Assets carry an inspection interval; their due state is derived, never stored.
 */
import type { Joint, JointHistoryEntry, JointStatusField } from '../types'
import { deriveFinalStatus, jointProgressPercent } from './progressEngine'

export type StageKey = 'welding' | 'ndt' | 'coating' | 'lowering' | 'backfill'
export const STAGE_FIELD: Record<StageKey, JointStatusField> = { welding: 'weldingStatus', ndt: 'ndtStatus', coating: 'coatingStatus', lowering: 'loweringStatus', backfill: 'backfillStatus' }
export const STAGE_ORDER: StageKey[] = ['welding', 'ndt', 'coating', 'lowering', 'backfill']
export const STAGE_FA: Record<StageKey, string> = { welding: 'جوشکاری', ndt: 'رادیوگرافی (NDT)', coating: 'پوشش سرجوش', lowering: 'پایین‌آوری', backfill: 'خاک‌ریزی' }
export const STAGE_DEFAULT: Record<StageKey, string> = { welding: 'not_started', ndt: 'pending', coating: 'pending', lowering: 'pending', backfill: 'pending' }
export const STAGE_OPTIONS: Record<StageKey, { value: string; label: string; tone: 'done' | 'bad' | 'neutral' }[]> = {
  welding: [{ value: 'welded', label: 'جوش‌شده', tone: 'done' }, { value: 'repaired', label: 'تعمیرشده', tone: 'done' }, { value: 'accepted', label: 'پذیرفته‌شده', tone: 'done' }, { value: 'not_started', label: 'شروع‌نشده', tone: 'neutral' }],
  ndt: [{ value: 'passed', label: 'قبول', tone: 'done' }, { value: 'failed', label: 'مردود', tone: 'bad' }, { value: 'repair_required', label: 'نیاز به تعمیر', tone: 'bad' }, { value: 'pending', label: 'در انتظار', tone: 'neutral' }],
  coating: [{ value: 'completed', label: 'انجام‌شده', tone: 'done' }, { value: 'failed', label: 'ناموفق', tone: 'bad' }, { value: 'pending', label: 'در انتظار', tone: 'neutral' }],
  lowering: [{ value: 'completed', label: 'انجام‌شده', tone: 'done' }, { value: 'pending', label: 'در انتظار', tone: 'neutral' }],
  backfill: [{ value: 'completed', label: 'انجام‌شده', tone: 'done' }, { value: 'pending', label: 'در انتظار', tone: 'neutral' }],
}

/** one stored joint row (pdt_joints) */
export interface JointRow {
  joint_no: number
  welding: string; welding_at: string | null
  ndt: string; ndt_at: string | null
  coating: string; coating_at: string | null
  lowering: string; lowering_at: string | null
  backfill: string; backfill_at: string | null
  welders: string[]; weld_ref: string; notes: string
  updated_by?: string | null; updated_at?: string | null
}

export const jointNumberOf = (no: number) => `J-${String(no).padStart(5, '0')}`
export const jointIdOf = (no: number) => `j-${no}`
export const jointNoOfId = (id: string) => Number(id.slice(2))

/** All joints of a route: geometric positions, overlaid with the stored rows; the stage dates become the joint's history. */
export function buildJoints(lengthMeters: number, stockLengthM: number, rows: JointRow[]): Joint[] {
  const count = Math.max(0, Math.floor(lengthMeters / stockLengthM))
  const byNo = new Map(rows.map((r) => [r.joint_no, r]))
  const out: Joint[] = []
  for (let no = 1; no <= count; no++) out.push(jointOf(no, stockLengthM, byNo.get(no)))
  return out
}

/** one joint at its geometric position, with its stored row (if any) */
export function jointOf(no: number, stockLengthM: number, r?: JointRow): Joint {
    const j: Joint = {
      id: jointIdOf(no), jointNumber: jointNumberOf(no), chainageMeters: no * stockLengthM,
      weldingStatus: (r?.welding ?? 'not_started') as Joint['weldingStatus'], ndtStatus: (r?.ndt ?? 'pending') as Joint['ndtStatus'],
      coatingStatus: (r?.coating ?? 'pending') as Joint['coatingStatus'], loweringStatus: (r?.lowering ?? 'pending') as Joint['loweringStatus'],
      backfillStatus: (r?.backfill ?? 'pending') as Joint['backfillStatus'],
      finalStatus: 'not_started', welders: r?.welders ?? [], notes: r?.notes ?? '', history: r ? historyOf(r) : [],
    }
    j.finalStatus = deriveFinalStatus(j)
    return j
}

function historyOf(r: JointRow): JointHistoryEntry[] {
  const h: JointHistoryEntry[] = []
  for (const k of STAGE_ORDER) {
    const v = r[k], at = r[`${k}_at` as const]
    if (v !== STAGE_DEFAULT[k] && at) h.push({ id: `${r.joint_no}-${k}`, at, field: STAGE_FIELD[k], fromValue: STAGE_DEFAULT[k], toValue: v })
  }
  return h.sort((a, b) => a.at.localeCompare(b.at))
}

/** the row to store for a joint after setting one stage (keeps the other stages and their dates) */
export function rowWith(j: Joint, prev: JointRow | undefined, stage: StageKey, value: string, atIso: string, extra?: Partial<Pick<JointRow, 'welders' | 'notes' | 'weld_ref'>>): JointRow {
  const no = jointNoOfId(j.id)
  const base: JointRow = prev ?? { joint_no: no, welding: 'not_started', welding_at: null, ndt: 'pending', ndt_at: null, coating: 'pending', coating_at: null, lowering: 'pending', lowering_at: null, backfill: 'pending', backfill_at: null, welders: [], weld_ref: '', notes: '' }
  return { ...base, [stage]: value, [`${stage}_at`]: value === STAGE_DEFAULT[stage] ? null : atIso, ...(extra ?? {}) }
}

/** km range (project km, i.e. including the route's start km) → inclusive joint-number range, clipped to the route */
export function jointRangeOfKm(fromKm: number, toKm: number, startKm: number, stockLengthM: number, jointCount: number): [number, number] | null {
  const a = Math.min(fromKm, toKm), b = Math.max(fromKm, toKm)
  const first = Math.max(1, Math.ceil(((a - startKm) * 1000) / stockLengthM))
  const last = Math.min(jointCount, Math.floor(((b - startKm) * 1000) / stockLengthM))
  return last >= first ? [first, last] : null
}

/** a better result of the same activity that a bulk entry must not overwrite (an accepted weld is not set back to «welded») */
const RANK: Partial<Record<StageKey, Record<string, number>>> = { welding: { not_started: 0, welded: 1, repaired: 1, accepted: 2 } }
export function isDowngrade(stage: StageKey, from: string, to: string): boolean {
  const r = RANK[stage]
  return !!r && to !== STAGE_DEFAULT[stage] && (r[from] ?? 0) > (r[to] ?? 0)
}
/** the work front of an activity: the first joint on which it has not been done at all (0-based index, -1 = all done) */
export const frontOf = (joints: Joint[], stage: StageKey) => joints.findIndex((j) => j[STAGE_FIELD[stage]] === STAGE_DEFAULT[stage])

/** What a bulk entry of `stage = value` on these joints would do: how many change (a better result is never overwritten), and which are out of sequence. */
export function bulkPreview(joints: Joint[], stage: StageKey, value: string) {
  const field = STAGE_FIELD[stage]
  const kept = joints.filter((j) => j[field] !== value && isDowngrade(stage, j[field], value)).length
  const changed = joints.filter((j) => j[field] !== value && !isDowngrade(stage, j[field], value))
  const done = value !== STAGE_DEFAULT[stage]
  const welded = (j: Joint) => j.weldingStatus !== 'not_started'
  const out = !done ? [] : changed.filter((j) =>
    stage === 'ndt' ? !welded(j)
    : stage === 'coating' ? j.ndtStatus !== 'passed'
    : stage === 'lowering' ? j.coatingStatus !== 'completed'
    : stage === 'backfill' ? j.loweringStatus !== 'completed'
    : false)
  const prereq: Record<StageKey, string> = { welding: '', ndt: 'هنوز جوش نشده‌اند', coating: 'هنوز NDT قبول ندارند', lowering: 'هنوز پوشش نشده‌اند', backfill: 'هنوز پایین‌آوری نشده‌اند' }
  return { total: joints.length, changed: changed.length, kept, outOfSequence: out.length, outLabel: prereq[stage] }
}

/** metres of route where every joint has reached a stage, by stage (the field's «km built» language) */
export function kmByStage(joints: Joint[], stockLengthM: number): Record<StageKey, number> {
  const m = (pred: (j: Joint) => boolean) => (joints.filter(pred).length * stockLengthM) / 1000
  return {
    welding: m((j) => j.weldingStatus !== 'not_started'),
    ndt: m((j) => j.ndtStatus === 'passed'),
    coating: m((j) => j.coatingStatus === 'completed'),
    lowering: m((j) => j.loweringStatus === 'completed'),
    backfill: m((j) => j.backfillStatus === 'completed'),
  }
}

/** physical construction progress of the line, 0…100 (the joint-weighted stages of progressEngine) */
export const physicalProgress = (joints: Joint[]) => (joints.length ? joints.reduce((n, j) => n + jointProgressPercent(j), 0) / joints.length : 0)

// ── assets ──────────────────────────────────────────────────────────────────
export type AssetKind = 'valve' | 'station' | 'crossing' | 'launcher' | 'cp_post' | 'insulating_joint' | 'marker' | 'other'
export type AssetCondition = 'good' | 'fair' | 'poor' | 'failed'
export type OpState = 'open' | 'closed' | 'throttled' | 'na'
export interface Asset { id: string; projectId: string; tag: string; kind: AssetKind; name: string; km: number; size: string; make: string; installDate: string | null; condition: AssetCondition; opState: OpState; criticality: 'high' | 'medium' | 'low'; inspectEveryDays: number | null; nextInspection: string | null; note: string; updatedAt: string }
export interface AssetEvent { id: string; assetId: string; kind: 'inspection' | 'maintenance' | 'operation' | 'failure' | 'note'; at: string; result: string; condition: AssetCondition | null; opState: OpState | null; note: string; by: string }

export const ASSET_KIND_FA: Record<AssetKind, string> = { valve: 'شیر خط', station: 'ایستگاه', crossing: 'تقاطع (جاده، رودخانه، راه‌آهن)', launcher: 'تلهٔ پیگ', cp_post: 'پست تست حفاظت کاتدی', insulating_joint: 'اتصال عایقی', marker: 'علامت مسیر', other: 'سایر' }
export const CONDITION_FA: Record<AssetCondition, string> = { good: 'خوب', fair: 'متوسط', poor: 'ضعیف', failed: 'از کار افتاده' }
export const CONDITION_COLOR: Record<AssetCondition, string> = { good: '#22c55e', fair: '#eab308', poor: '#f97316', failed: '#ef4444' }
export const OPSTATE_FA: Record<OpState, string> = { open: 'باز', closed: 'بسته', throttled: 'نیمه‌باز', na: '—' }
export const CRIT_FA = { high: 'بحرانی', medium: 'متوسط', low: 'کم' } as const
export const EVENT_FA: Record<AssetEvent['kind'], string> = { inspection: 'بازرسی', maintenance: 'تعمیر و نگهداری', operation: 'عملیات (باز/بستن)', failure: 'خرابی', note: 'یادداشت' }

export type DueState = 'overdue' | 'soon' | 'ok' | 'none'
export function dueState(a: Pick<Asset, 'nextInspection'>, today: string, soonDays = 30): DueState {
  if (!a.nextInspection) return 'none'
  if (a.nextInspection < today) return 'overdue'
  const days = (Date.parse(a.nextInspection) - Date.parse(today)) / 86400000
  return days <= soonDays ? 'soon' : 'ok'
}
export const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10)

/** the asset after an event: an inspection moves the next due date by the interval, and may change condition / valve state */
export function applyEvent(a: Asset, e: Pick<AssetEvent, 'kind' | 'at' | 'condition' | 'opState'>): Partial<Asset> {
  const patch: Partial<Asset> = {}
  if (e.condition) patch.condition = e.condition
  if (e.opState) patch.opState = e.opState
  if ((e.kind === 'inspection' || e.kind === 'maintenance') && a.inspectEveryDays) patch.nextInspection = addDays(e.at, a.inspectEveryDays)
  if (e.kind === 'failure' && !e.condition) patch.condition = 'failed'
  return patch
}

export function assetPicture(assets: Asset[], today: string) {
  const due = assets.map((a) => dueState(a, today))
  return {
    total: assets.length,
    overdue: due.filter((d) => d === 'overdue').length,
    soon: due.filter((d) => d === 'soon').length,
    poor: assets.filter((a) => a.condition === 'poor' || a.condition === 'failed').length,
    criticalPoor: assets.filter((a) => a.criticality === 'high' && (a.condition === 'poor' || a.condition === 'failed')).length,
    valvesClosed: assets.filter((a) => a.kind === 'valve' && a.opState === 'closed').length,
    valves: assets.filter((a) => a.kind === 'valve').length,
    byKind: Object.fromEntries(Object.keys(ASSET_KIND_FA).map((k) => [k, assets.filter((a) => a.kind === k).length])) as Record<AssetKind, number>,
  }
}

// ── executive reading ───────────────────────────────────────────────────────
export interface ExecInput {
  routeKm: number
  physicalPct: number
  /** construction (C) progress of the execution module, the official number; null when unavailable */
  officialCPct: number | null
  kmBackfilled: number
  kmUnderGas: number
  jointNcr: number
  officialNcr: number | null
  assetsOverdue: number
  criticalAssetsPoor: number
  landBlockedKm: number | null
}
/** plain-language lines for the CEO view, most important first; tone drives the colour */
export function execReading(x: ExecInput): { tone: 'good' | 'warn' | 'bad'; text: string }[] {
  const out: { tone: 'good' | 'warn' | 'bad'; text: string }[] = []
  const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
  if (x.officialCPct != null && Math.abs(x.physicalPct - x.officialCPct) >= 5)
    out.push({ tone: 'warn', text: `پیشرفت فیزیکی ثبت‌شده روی مسیر (${fa(x.physicalPct)}٪) با پیشرفت ساخت ماژول اجرا (${fa(x.officialCPct)}٪) ${fa(Math.abs(x.physicalPct - x.officialCPct))} واحد اختلاف دارد؛ ثبت‌ها را هم‌سان کنید.` })
  if (x.jointNcr && x.officialNcr === 0) out.push({ tone: 'bad', text: `${fa(x.jointNcr)} سرجوش با NDT مردود روی مسیر ثبت شده اما در ماژول اجرا هیچ NCR بازی نیست؛ برای این سرجوش‌ها NCR صادر کنید.` })
  else if (x.jointNcr || x.officialNcr) out.push({ tone: 'bad', text: `${fa(x.jointNcr)} سرجوش با NDT مردود روی مسیر${x.officialNcr != null ? ` و ${fa(x.officialNcr)} NCR باز در ماژول اجرا` : ''}.` })
  if (x.criticalAssetsPoor) out.push({ tone: 'bad', text: `${fa(x.criticalAssetsPoor)} دارایی بحرانی در وضعیت ضعیف یا از کار افتاده است.` })
  if (x.assetsOverdue) out.push({ tone: 'warn', text: `بازرسی ${fa(x.assetsOverdue)} دارایی عقب افتاده است.` })
  if (x.landBlockedKm) out.push({ tone: 'warn', text: `${fa(x.landBlockedKm, 1)} کیلومتر از مسیر هنوز آزادسازی نشده است.` })
  out.push({ tone: 'good', text: `${fa(x.kmBackfilled, 1)} از ${fa(x.routeKm, 1)} کیلومتر ساخته و خاک‌ریزی شده${x.kmUnderGas ? `؛ ${fa(x.kmUnderGas, 1)} کیلومتر تحت گاز است` : ''}.` })
  return out
}
