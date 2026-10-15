import { addDays, daysBetween } from '../periods'
import { mean } from './stats'

export type DocStatus = 'required' | 'in_preparation' | 'issued' | 'pending_approval' | 'approved' | 'restricted' | 'superseded'
export interface Doc {
  id: string; code: string; title: string; discipline: string; contract: string; weight: number; critical: boolean
  plannedPrepared: string | null; plannedApproved: string | null; actualPrepared: string | null; actualApproved: string | null; status: DocStatus
}
export interface DocLink { id: string; docId: string; activityId: string; front: string; needKind: 'start' | 'continue'; needDate: string | null; minStatus: 'issued' | 'approved'; allowRestricted: boolean; altActivityId: string | null }

export const isPrepared = (d: Pick<Doc, 'status' | 'actualPrepared'>, asOf: string): boolean => (['issued', 'pending_approval', 'approved', 'restricted'].includes(d.status) && (!d.actualPrepared || d.actualPrepared <= asOf))
export const isApproved = (d: Pick<Doc, 'status' | 'actualApproved'>, asOf: string): boolean => ((d.status === 'approved' || d.status === 'restricted') && (!d.actualApproved || d.actualApproved <= asOf))

export interface EngRules {
  /** weight of «prepared» and «approved» in the combined weighted score (normalised) */
  prepWeight: number; approveWeight: number
  /** share of an approved-with-restriction document counted as ready for execution */
  restrictedCredit: number
  /** minimum completed documents of the discipline before a delay pattern is trusted */
  minSample: number
  /** look-back window (days) for the throughput-based completion forecast */
  windowDays: number
}
export const DEFAULT_ENG_RULES: EngRules = { prepWeight: 0.6, approveWeight: 0.4, restrictedCredit: 0.5, minSample: 3, windowDays: 42 }

export interface EngProgress {
  /** weighted shares 0–1: planned and actual, prepared and approved, plus ready-for-execution (approved fully + restricted × credit) */
  plannedPrepared: number; actualPrepared: number; plannedApproved: number; actualApproved: number; ready: number
  /** combined weighted progress score (planned / actual) */
  plannedScore: number; actualScore: number
  docs: number; weight: number
}
const share = (docs: Doc[], f: (d: Doc) => number): number => { const w = docs.reduce((s, d) => s + d.weight, 0); return w > 0 ? docs.reduce((s, d) => s + d.weight * f(d), 0) / w : 0 }

/** Milestone-based weighted progress: a document counts fully on the day its step is reached (planned date for the plan, actual date/status for the actual). Documents with weight 0 do not count; superseded ones are excluded. */
export function engProgress(all: Doc[], asOf: string, r: EngRules = DEFAULT_ENG_RULES): EngProgress {
  const docs = all.filter((d) => d.status !== 'superseded' && d.weight > 0)
  const pp = share(docs, (d) => (d.plannedPrepared && d.plannedPrepared <= asOf ? 1 : 0)), ap = share(docs, (d) => (isPrepared(d, asOf) ? 1 : 0))
  const pa = share(docs, (d) => (d.plannedApproved && d.plannedApproved <= asOf ? 1 : 0)), aa = share(docs, (d) => (isApproved(d, asOf) ? 1 : 0))
  const ready = share(docs, (d) => (d.status === 'approved' && isApproved(d, asOf) ? 1 : d.status === 'restricted' ? r.restrictedCredit : 0))
  const tw = r.prepWeight + r.approveWeight || 1
  return { plannedPrepared: pp, actualPrepared: ap, plannedApproved: pa, actualApproved: aa, ready, plannedScore: (r.prepWeight * pp + r.approveWeight * pa) / tw, actualScore: (r.prepWeight * ap + r.approveWeight * aa) / tw, docs: docs.length, weight: docs.reduce((s, d) => s + d.weight, 0) }
}
export function engProgressBy(docs: Doc[], asOf: string, key: 'discipline' | 'contract', r: EngRules = DEFAULT_ENG_RULES): { key: string; p: EngProgress }[] {
  const g = new Map<string, Doc[]>()
  for (const d of docs) { const k = d[key] || 'بدون مقدار'; g.set(k, [...(g.get(k) ?? []), d]) }
  return [...g].map(([k, ds]) => ({ key: k, p: engProgress(ds, asOf, r) })).sort((a, b) => b.p.weight - a.p.weight)
}

export interface DocForecast {
  docId: string
  overdue: boolean
  overdueDays: number
  /** expected approval date; null when the sample is too small to say anything */
  expectedApproval: string | null
  lagDays: number | null
  sample: number
  reason: string
}
/** Expected approval date of an open document: its planned approval shifted by the typical slip (actual − planned) observed on completed documents of the same discipline, never earlier than today. With fewer than `minSample` completed documents no date is produced. */
export function forecastDoc(d: Doc, all: Doc[], today: string, r: EngRules = DEFAULT_ENG_RULES): DocForecast {
  const base = { docId: d.id, overdue: false, overdueDays: 0, expectedApproval: null as string | null, lagDays: null as number | null, sample: 0, reason: '' }
  if (isApproved(d, today)) return { ...base, expectedApproval: d.actualApproved ?? today, reason: 'تأیید شده است.' }
  if (d.plannedApproved && d.plannedApproved < today) { base.overdue = true; base.overdueDays = daysBetween(d.plannedApproved, today) }
  const done = all.filter((x) => x.discipline === d.discipline && x.actualApproved && x.plannedApproved && x.id !== d.id)
  base.sample = done.length
  if (!d.plannedApproved) return { ...base, reason: 'تاریخ برنامه‌ای تأیید ثبت نشده است؛ پیش‌بینی ممکن نیست.' }
  if (done.length < r.minSample) return { ...base, reason: `نمونهٔ مدارک تکمیل‌شدهٔ رشته (${done.length}) برای الگوی تأخیر کافی نیست (حداقل ${r.minSample}).` }
  const lag = mean(done.map((x) => daysBetween(x.plannedApproved as string, x.actualApproved as string))) as number
  const lagDays = Math.round(lag)
  let exp = addDays(d.plannedApproved, Math.max(0, lagDays))
  if (exp < today) exp = today
  return { ...base, lagDays, expectedApproval: exp, reason: `بر پایهٔ میانگین انحراف ${lagDays} روزِ ${done.length} مدرک تکمیل‌شدهٔ همین رشته.` }
}

/** Completion forecast of a group: remaining weight ÷ weight approved per day in the look-back window. Needs at least two approvals in the window. */
export function forecastCompletion(docs: Doc[], today: string, r: EngRules = DEFAULT_ENG_RULES): { date: string | null; ratePerWeek: number | null; remainingWeight: number; reason: string } {
  const live = docs.filter((d) => d.status !== 'superseded' && d.weight > 0)
  const remaining = live.filter((d) => !isApproved(d, today)).reduce((s, d) => s + d.weight, 0)
  if (remaining <= 0) return { date: today, ratePerWeek: null, remainingWeight: 0, reason: 'همهٔ مدارک تأیید شده‌اند.' }
  const from = addDays(today, -r.windowDays)
  const recent = live.filter((d) => d.actualApproved && d.actualApproved > from && d.actualApproved <= today)
  if (recent.length < 2) return { date: null, ratePerWeek: null, remainingWeight: remaining, reason: 'تعداد تأییدهای اخیر برای پیش‌بینی تاریخ تکمیل کافی نیست (حداقل ۲).' }
  const perDay = recent.reduce((s, d) => s + d.weight, 0) / r.windowDays
  return { date: addDays(today, Math.ceil(remaining / perDay)), ratePerWeek: perDay * 7, remainingWeight: remaining, reason: `نرخ تأیید ${recent.length} مدرک در ${r.windowDays} روز اخیر ادامه می‌یابد.` }
}

/** Document-level state against one requirement: satisfied, satisfied with a restriction, or not satisfied. */
export function linkState(l: DocLink, d: Doc | undefined): 'ok' | 'restricted' | 'open' | 'missing' {
  if (!d || d.status === 'superseded') return 'missing'
  const rank = { required: 0, in_preparation: 1, issued: 2, pending_approval: 2, approved: 3, restricted: 3 } as const
  const need = l.minStatus === 'approved' ? 3 : 2
  if (rank[d.status] < need) return 'open'
  if (d.status === 'restricted') return l.allowRestricted ? 'restricted' : 'open'
  return 'ok'
}

export interface FloatInfo { float: number | null; assumed: boolean }
export interface ActNode { id: string; plannedStart: string | null; plannedEnd: string | null }
export interface DepEdge { predId: string; succId: string; type: 'FS' | 'SS' | 'FF' | 'SF'; lag: number }
/** Total float per activity from finish-to-start (and SS/FF/SF approximated as FS on the relevant dates) dependencies by a backward pass from the latest planned end. Activities without any recorded successor get float 0, flagged `assumed` (conservative). */
export function totalFloat(acts: ActNode[], deps: DepEdge[]): Map<string, FloatInfo> {
  const dated = acts.filter((a) => a.plannedStart && a.plannedEnd)
  const end = dated.reduce((m, a) => (a.plannedEnd! > m ? a.plannedEnd! : m), '')
  const out = new Map<string, FloatInfo>()
  if (!end) return out
  const byId = new Map(dated.map((a) => [a.id, a]))
  const succ = new Map<string, DepEdge[]>()
  for (const d of deps) if (byId.has(d.predId) && byId.has(d.succId)) succ.set(d.predId, [...(succ.get(d.predId) ?? []), d])
  const memo = new Map<string, string>() // latest finish
  const visiting = new Set<string>()
  const lf = (id: string): string => {
    const c = memo.get(id); if (c) return c
    if (visiting.has(id)) return byId.get(id)!.plannedEnd!
    visiting.add(id)
    const s = succ.get(id) ?? []
    let latest: string
    if (!s.length) latest = byId.get(id)!.plannedEnd!
    else {
      latest = end
      for (const e of s) {
        const sa = byId.get(e.succId)!
        const dur = daysBetween(sa.plannedStart!, sa.plannedEnd!)
        const lateStartOfSucc = addDays(lf(e.succId), -dur)
        const bound = e.type === 'SS' ? addDays(lateStartOfSucc, e.lag + daysBetween(byId.get(id)!.plannedStart!, byId.get(id)!.plannedEnd!)) : e.type === 'FF' ? addDays(lf(e.succId), -e.lag) : addDays(lateStartOfSucc, -1 - e.lag)
        if (bound < latest) latest = bound
      }
    }
    visiting.delete(id); memo.set(id, latest); return latest
  }
  for (const a of dated) { const has = (succ.get(a.id) ?? []).length > 0; out.set(a.id, { float: Math.max(0, daysBetween(a.plannedEnd!, lf(a.id))), assumed: !has }) }
  return out
}

export interface ImpactIn { link: DocLink; doc: Doc; forecast: DocForecast; activity: { id: string; title: string; plannedStart: string | null; plannedEnd: string | null }; float: FloatInfo | undefined; today: string }
export interface Impact {
  linkId: string; docId: string; activityId: string
  state: 'ok' | 'restricted' | 'open' | 'missing'
  needDate: string | null
  /** days the document is expected to arrive after it is needed (0 when on time or unknown) */
  lateDays: number | null
  /** slip of the activity start after the float or an alternative activity absorbs it */
  startSlipDays: number | null
  /** slip of the project completion */
  projectSlipDays: number | null
  absorbedBy: 'none' | 'float' | 'alternative'
  known: boolean
  assumptions: string[]
}
/** Effect of one open document on its activity and on the project end. The need date is the link's own date (not the planned issue date); float and an alternative activity reduce the real effect; with no usable forecast nothing definite is produced. */
export function docImpact(i: ImpactIn): Impact {
  const st = linkState(i.link, i.doc)
  const need = i.link.needDate ?? i.activity.plannedStart
  const as: string[] = []
  const base: Impact = { linkId: i.link.id, docId: i.doc.id, activityId: i.activity.id, state: st, needDate: need, lateDays: null, startSlipDays: null, projectSlipDays: null, absorbedBy: 'none', known: false, assumptions: as }
  if (st === 'ok' || st === 'restricted') return { ...base, lateDays: 0, startSlipDays: 0, projectSlipDays: 0, known: true }
  if (!need) { as.push('تاریخ نیاز مدرک و تاریخ شروع فعالیت ثبت نشده؛ اثر زمانی قابل‌محاسبه نیست.'); return base }
  if (!i.forecast.expectedApproval) {
    if (need < i.today) { as.push('موعد نیاز گذشته و مدرک هنوز آماده نیست؛ مقدار تأخیر نهایی به‌علت نبود الگوی پیش‌بینی مشخص نیست.'); return { ...base, lateDays: daysBetween(need, i.today) } }
    as.push(i.forecast.reason); return base
  }
  const exp = i.forecast.expectedApproval
  const late = Math.max(0, daysBetween(need, exp))
  as.push(i.forecast.reason)
  if (late === 0) return { ...base, lateDays: 0, startSlipDays: 0, projectSlipDays: 0, known: true }
  if (i.link.altActivityId) { as.push('فعالیت جایگزین تعریف شده است؛ اثر روی برنامه در صورت اجرای جایگزین صفر فرض شد (نیازمند تصمیم مدیر).'); return { ...base, lateDays: late, startSlipDays: 0, projectSlipDays: 0, absorbedBy: 'alternative', known: true } }
  const fl = i.float
  if (!fl) as.push('فعالیت تاریخ برنامه‌ای ندارد؛ شناوری محاسبه نشد و بدترین حالت (صفر) فرض شد.')
  else if (fl.assumed) as.push('وابستگی ثبت‌شده برای فعالیت وجود ندارد؛ شناوری صفر فرض شد.')
  const f = fl?.float ?? 0
  const slip = Math.max(0, late - f)
  return { ...base, lateDays: late, startSlipDays: late, projectSlipDays: slip, absorbedBy: f > 0 && slip < late ? 'float' : 'none', known: true }
}

export type ExecReady = 'ready' | 'ready_with_restrictions' | 'not_ready'
export interface ReadyOut { state: ExecReady; reasons: string[]; open: string[] }
/** Readiness of an activity from its document requirements AND its other prerequisites (material, equipment, manpower, permit, land, inspection) — a document alone never makes an activity ready. */
export function execReadiness(a: { docs: { impact: Impact; docCode: string; needDate: string | null }[]; others: { title: string; state: 'ready' | 'pending' | 'blocked' }[]; today: string }): ReadyOut {
  const reasons: string[] = [], open: string[] = []
  let blocked = false, restricted = false
  for (const d of a.docs) {
    if (d.impact.state === 'ok') continue
    if (d.impact.state === 'restricted') { restricted = true; reasons.push(`مدرک ${d.docCode} با محدودیت تأیید شده است.`); continue }
    open.push(`مدرک ${d.docCode}`)
    const due = !d.needDate || d.needDate <= a.today
    if (d.impact.state === 'missing' || due) { blocked = true; reasons.push(`مدرک ${d.docCode} ${d.impact.state === 'missing' ? 'موجود/معتبر نیست' : 'لازم است ولی در وضعیت لازم نیست'}.`) }
    else { restricted = true; reasons.push(`مدرک ${d.docCode} هنوز باز است؛ موعد نیاز ${d.needDate}.`) }
  }
  for (const o of a.others) {
    if (o.state === 'ready') continue
    open.push(o.title)
    if (o.state === 'blocked') { blocked = true; reasons.push(`پیش‌نیاز «${o.title}» مسدود است.`) } else { restricted = true; reasons.push(`پیش‌نیاز «${o.title}» هنوز کامل نیست.`) }
  }
  return { state: blocked ? 'not_ready' : restricted ? 'ready_with_restrictions' : 'ready', reasons, open }
}
