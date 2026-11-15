/**
 * اقدام اصلاحی و پیشگیرانه — the rules that decide when a quality problem is serious or recurring enough that the team
 * must sit down for a root-cause meeting, the figure each rule watches (so the effect of the agreed actions can be
 * measured afterwards on the same figure), and the mirror of the database's gates so the screen can say what is missing.
 * Pure functions over plain records: every trigger carries its evidence and can be checked by hand.
 */

export type Severity = 'minor' | 'major' | 'critical'
export type CapaStatus = 'open' | 'rca' | 'agreed' | 'verifying' | 'closed' | 'void'
export type Rule = 'manual' | 'repair_rate' | 'welder' | 'defect_code' | 'crack' | 'cutout' | 'repeat_repair' | 'ncr' | 'ncr_repeat' | 'retake' | 'coating' | 'hydro'
export type CauseCat = 'man' | 'method' | 'machine' | 'material' | 'measurement' | 'environment'
export type Party = 'contractor' | 'qc' | 'supervision' | 'consultant' | 'employer' | 'other'
export type ActionKind = 'containment' | 'corrective' | 'preventive'

export interface CapaCfg {
  /** open mandatory cases by itself when a rule fires */
  auto: boolean
  /** first-radiography repair rate (percent) above which the project must hold a meeting, over the last `window` welds */
  repairLimit: number; window: number; minN: number
  /** a welder with this many repairs in his last `welderWindow` radiographed welds */
  welderMax: number; welderWindow: number
  /** one imperfection code taking this share (percent) of the rejected indications of the last `days`, at least `codeMin` times */
  codeShare: number; codeMin: number; days: number
  /** films sent back (retake / reshoot), percent of the last 40 */
  retakeLimit: number
  /** field-joint coating inspections failed or repaired, percent of the last 30 */
  coatLimit: number
  /** NCRs of one kind within `days` */
  ncrRepeat: number
  /** days after the last action before the effect is judged, and the least number of new results to judge on */
  verifyDays: number; verifyMinN: number
  /** unit costs for the cost of poor quality (project currency); 0 = not counted */
  costRepair: number; costCutout: number; costRetake: number
}
export const CAPA_DEFAULT: CapaCfg = { auto: true, repairLimit: 10, window: 50, minN: 20, welderMax: 3, welderWindow: 10, codeShare: 40, codeMin: 5, days: 30, retakeLimit: 15, coatLimit: 10, ncrRepeat: 3, verifyDays: 30, verifyMinN: 10, costRepair: 0, costCutout: 0, costRetake: 0 }
export function mergeCapa(raw: unknown): CapaCfg {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...CAPA_DEFAULT } as Record<string, number | boolean>
  for (const k of Object.keys(CAPA_DEFAULT) as (keyof CapaCfg)[]) {
    if (k === 'auto') { if (typeof r.auto === 'boolean') out.auto = r.auto; continue }
    const v = Number(r[k]); if (r[k] != null && r[k] !== '' && Number.isFinite(v) && v >= 0) out[k] = v
  }
  return out as unknown as CapaCfg
}

// ── the records the rules read
export interface FirstRt { weldId: string; label: string; at: string; repaired: boolean; welders: string[] }
export interface Rejected { weldId: string; code: string; at: string; crack: boolean }
export interface WeldEvent { weldId: string; label: string; at: string }
export interface FilmQ { at: string; bad: boolean }
export interface CoatInsp { at: string; bad: boolean }
export interface NcrLite { id: string; code: string; kind: string; severity: string; rcaRequired: boolean; status: string; createdAt: string; description: string }
export interface CapaInput {
  firsts: FirstRt[]; rejected: Rejected[]; cutouts: WeldEvent[]; repeats: WeldEvent[]
  films: FilmQ[]; coat: CoatInsp[]; ncrs: NcrLite[]; hydroFailed: string[]
  nameOf: (welderKey: string) => string; codeName: (code: string) => string
  /** the reporting period of a date (Jalali month): one case per pattern and period */
  periodOf: (iso: string) => string
}
export interface Metric { value: number; limit: number | null; unit: string; n: number; label: string }
export interface Trigger {
  fingerprint: string; rule: Rule; mandatory: boolean; severity: Severity
  title: string; problem: string; evidence: string
  scope: { welder?: string; code?: string; ncrId?: string; ncrKind?: string; section?: string; weldIds?: string[] }
  metric: Metric
  /** where a root cause of this kind of problem is usually found */
  hint: CauseCat[]
}

const fa = (x: number, d = 0) => x.toLocaleString('fa-IR', { maximumFractionDigits: d })
const pc = (x: number) => `${fa(x, 1)}٪`
const byAt = <T extends { at: string }>(xs: T[]) => [...xs].sort((a, b) => a.at.localeCompare(b.at))
const since = (today: string, days: number) => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10) }
const uniq = (xs: string[]) => [...new Set(xs)]

/** every pattern in the records that calls for a root-cause meeting today */
export function detectTriggers(x: CapaInput, cfg: CapaCfg, today: string): Trigger[] {
  const out: Trigger[] = [], period = x.periodOf(today), from = since(today, cfg.days)
  const firsts = byAt(x.firsts)

  // 1 · the project's repair rate over its latest welds
  const win = firsts.slice(-cfg.window)
  if (win.length >= cfg.minN) {
    const rep = win.filter((r) => r.repaired), rate = (rep.length / win.length) * 100
    if (rate > cfg.repairLimit) out.push({
      fingerprint: `repair_rate:${period}`, rule: 'repair_rate', mandatory: true, severity: rate >= 2 * cfg.repairLimit ? 'critical' : 'major',
      title: `نرخ تعمیر جوش از حد مجاز پروژه گذشته است (${pc(rate)})`,
      problem: `از ${fa(win.length)} سرجوش آخرِ رادیوگرافی‌شده ${fa(rep.length)} مورد در اولین رادیوگرافی رد شده است؛ نرخ تعمیر ${pc(rate)} در برابر حد ${pc(cfg.repairLimit)}.`,
      evidence: `پنجرهٔ ${fa(win.length)} سرجوش آخر · ${fa(rep.length)} تعمیر`, scope: { weldIds: rep.map((r) => r.weldId) },
      metric: { value: rate, limit: cfg.repairLimit, unit: '٪', n: win.length, label: 'نرخ تعمیر در اولین رادیوگرافی' }, hint: ['man', 'method', 'material'],
    })
  }

  // 2 · one welder repeating repairs
  const byWelder = new Map<string, FirstRt[]>()
  for (const r of firsts) for (const k of uniq(r.welders)) { const a = byWelder.get(k) ?? []; a.push(r); byWelder.set(k, a) }
  for (const [k, rs] of byWelder) {
    const last = rs.slice(-cfg.welderWindow), rep = last.filter((r) => r.repaired)
    if (last.length < Math.min(cfg.welderWindow, 5) || rep.length < cfg.welderMax) continue
    if (rep[rep.length - 1].at.slice(0, 10) < from) continue // an old story: nothing new to meet about
    out.push({
      fingerprint: `welder:${k}:${period}`, rule: 'welder', mandatory: true, severity: 'major',
      title: `تعمیرهای تکراری در کار جوشکار ${x.nameOf(k)}`,
      problem: `از ${fa(last.length)} سرجوش آخر این جوشکار ${fa(rep.length)} مورد نیاز به تعمیر داشته است (حد: کمتر از ${fa(cfg.welderMax)}).`,
      evidence: rep.map((r) => r.label).join('، '), scope: { welder: k, weldIds: rep.map((r) => r.weldId) },
      metric: { value: (rep.length / last.length) * 100, limit: (cfg.welderMax / cfg.welderWindow) * 100, unit: '٪', n: last.length, label: `نرخ تعمیر ${x.nameOf(k)}` }, hint: ['man', 'machine', 'method'],
    })
  }

  // 3 · one imperfection dominating the rejections
  const rej = x.rejected.filter((d) => d.at.slice(0, 10) >= from)
  const byCode = new Map<string, Rejected[]>()
  for (const d of rej) if (d.code) { const a = byCode.get(d.code) ?? []; a.push(d); byCode.set(d.code, a) }
  for (const [code, ds] of byCode) {
    const share = (ds.length / rej.length) * 100
    if (ds.length < cfg.codeMin || share < cfg.codeShare) continue
    out.push({
      fingerprint: `code:${code}:${period}`, rule: 'defect_code', mandatory: true, severity: 'major',
      title: `عیب تکرارشونده: ${x.codeName(code)} (${code})`,
      problem: `در ${fa(cfg.days)} روز گذشته ${fa(ds.length)} مورد از ${fa(rej.length)} عیب ردشده از همین نوع بوده است (${pc(share)}). تکرار یک نوع عیب نشانهٔ یک علت مشترک است، نه خطای اتفاقی.`,
      evidence: `${fa(uniq(ds.map((d) => d.weldId)).length)} سرجوش`, scope: { code, weldIds: uniq(ds.map((d) => d.weldId)) },
      metric: { value: ds.length, limit: cfg.codeMin, unit: 'مورد', n: rej.length, label: `تعداد عیب ${code} در ${fa(cfg.days)} روز` }, hint: ['method', 'man', 'material'],
    })
  }

  // 4 · cracks (not crater cracks within the limit): always a meeting
  const cracks = rej.filter((d) => d.crack)
  if (cracks.length) out.push({
    fingerprint: `crack:${period}`, rule: 'crack', mandatory: true, severity: 'critical',
    title: `ترک در جوش (${fa(uniq(cracks.map((d) => d.weldId)).length)} سرجوش)`,
    problem: 'ترک خطرناک‌ترین عیب جوش است و معمولاً علت فرایندی دارد (پیش‌گرم، رطوبت الکترود، تنش مونتاژ، سرعت خنک‌شدن). هر مورد باید ریشه‌یابی شود.',
    evidence: `${fa(cracks.length)} نشانهٔ ترک ردشده`, scope: { code: 'C', weldIds: uniq(cracks.map((d) => d.weldId)) },
    metric: { value: cracks.length, limit: 0, unit: 'مورد', n: rej.length, label: 'تعداد ترک ردشده' }, hint: ['method', 'material', 'environment'],
  })

  // 5 · cut-outs
  const cuts = x.cutouts.filter((c) => c.at.slice(0, 10) >= from)
  if (cuts.length) out.push({
    fingerprint: `cutout:${period}`, rule: 'cutout', mandatory: true, severity: cuts.length > 1 ? 'critical' : 'major',
    title: `برش سرجوش (${fa(cuts.length)} مورد)`,
    problem: 'برش پرهزینه‌ترین پیامد کیفی است (لولهٔ جدید، دو سرجوش، توقف جبهه). علت باید پیش از تکرار روشن شود.',
    evidence: cuts.map((c) => c.label).join('، '), scope: { weldIds: cuts.map((c) => c.weldId) },
    metric: { value: cuts.length, limit: 0, unit: 'مورد', n: cuts.length, label: 'تعداد برش' }, hint: ['man', 'method', 'machine'],
  })

  // 6 · repairs that did not hold
  const reps = x.repeats.filter((c) => c.at.slice(0, 10) >= from)
  if (reps.length) out.push({
    fingerprint: `repeat:${period}`, rule: 'repeat_repair', mandatory: true, severity: 'major',
    title: `تعمیر ناموفق: ${fa(reps.length)} سرجوش به تعمیر دوم رسید`,
    problem: 'وقتی تعمیر اول در رادیوگرافی بعد رد می‌شود، روش تعمیر، تشخیص محل عیب یا مهارت تعمیرکار ایراد دارد.',
    evidence: reps.map((c) => c.label).join('، '), scope: { weldIds: reps.map((c) => c.weldId) },
    metric: { value: reps.length, limit: 0, unit: 'مورد', n: reps.length, label: 'تعداد تعمیر دوم' }, hint: ['method', 'man', 'measurement'],
  })

  // 7 · NCRs that need a root-cause analysis, and NCRs of one kind coming back
  const liveNcr = x.ncrs.filter((n) => n.status !== 'void')
  for (const n of liveNcr) {
    if (n.status === 'closed' || !(n.rcaRequired || n.severity === 'high')) continue
    out.push({
      fingerprint: `ncr:${n.id}`, rule: 'ncr', mandatory: true, severity: n.severity === 'high' ? 'critical' : 'major',
      title: `ریشه‌یابی ${n.code}`, problem: n.description || 'عدم انطباق با شدت زیاد یا با الزام RCA.',
      evidence: n.rcaRequired ? 'برای این NCR تحلیل علت ریشه‌ای الزامی شده است' : 'شدت زیاد', scope: { ncrId: n.id },
      metric: { value: 1, limit: 0, unit: 'مورد', n: 1, label: `تکرار ${n.code}` }, hint: ['method', 'man'],
    })
  }
  const KIND_FA: Record<string, string> = { defect: 'عیب', nonconformity: 'عدم انطباق', observation: 'مشاهده' }
  const byKind = new Map<string, NcrLite[]>()
  for (const n of liveNcr) if (n.createdAt.slice(0, 10) >= from) { const a = byKind.get(n.kind) ?? []; a.push(n); byKind.set(n.kind, a) }
  for (const [kind, ns] of byKind) if (ns.length >= cfg.ncrRepeat) out.push({
    fingerprint: `ncrkind:${kind}:${period}`, rule: 'ncr_repeat', mandatory: true, severity: 'major',
    title: `تکرار NCR از نوع «${KIND_FA[kind] ?? kind}» (${fa(ns.length)} مورد در ${fa(cfg.days)} روز)`,
    problem: 'صدور چند NCR هم‌نوع در یک دورهٔ کوتاه یعنی اقدام‌های موردی کافی نبوده و علت سیستمی باقی است.',
    evidence: ns.map((n) => n.code).join('، '), scope: { ncrKind: kind },
    metric: { value: ns.length, limit: cfg.ncrRepeat - 1, unit: 'مورد', n: ns.length, label: `NCR نوع ${KIND_FA[kind] ?? kind} در ${fa(cfg.days)} روز` }, hint: ['method', 'man'],
  })

  // 8 · radiographs sent back (advised, not forced)
  const films = byAt(x.films).slice(-40)
  if (films.length >= 20) {
    const bad = films.filter((f) => f.bad).length, rate = (bad / films.length) * 100
    if (rate > cfg.retakeLimit) out.push({
      fingerprint: `retake:${period}`, rule: 'retake', mandatory: false, severity: 'minor',
      title: `نرخ ریتیک / ریشوت فیلم بالاست (${pc(rate)})`,
      problem: `از ${fa(films.length)} فیلم آخر ${fa(bad)} فیلم به دلیل کیفیت برگشت خورده است (حد ${pc(cfg.retakeLimit)}). هر فیلم برگشتی هزینهٔ فیلم و تأخیر در آزادسازی سرجوش است.`,
      evidence: `${fa(films.length)} فیلم آخر`, scope: {},
      metric: { value: rate, limit: cfg.retakeLimit, unit: '٪', n: films.length, label: 'نرخ برگشت فیلم' }, hint: ['measurement', 'method', 'machine'],
    })
  }

  // 9 · field-joint coating
  const coat = byAt(x.coat).slice(-30)
  if (coat.length >= 10) {
    const bad = coat.filter((c) => c.bad).length, rate = (bad / coat.length) * 100
    if (rate > cfg.coatLimit) out.push({
      fingerprint: `coat:${period}`, rule: 'coating', mandatory: true, severity: 'major',
      title: `نرخ مردودی پوشش سرجوش بالاست (${pc(rate)})`,
      problem: `از ${fa(coat.length)} بازرسی آخر پوشش سرجوش ${fa(bad)} مورد مردود یا نیازمند تعمیر بوده است (حد ${pc(cfg.coatLimit)}).`,
      evidence: `${fa(coat.length)} بازرسی آخر`, scope: {},
      metric: { value: rate, limit: cfg.coatLimit, unit: '٪', n: coat.length, label: 'نرخ مردودی پوشش سرجوش' }, hint: ['method', 'environment', 'material'],
    })
  }

  // 10 · a failed pressure test
  for (const code of uniq(x.hydroFailed)) out.push({
    fingerprint: `hydro:${code}`, rule: 'hydro', mandatory: true, severity: 'critical',
    title: `مردودی آزمون هیدرواستاتیک سکشن ${code}`,
    problem: 'شکست آزمون فشار یعنی عیبی از همهٔ کنترل‌های پیشین (VT، رادیوگرافی، پوشش) عبور کرده است؛ هم علت عیب و هم علت کشف‌نشدن آن باید ریشه‌یابی شود.',
    evidence: `سکشن ${code}`, scope: { section: code },
    metric: { value: 1, limit: 0, unit: 'مورد', n: 1, label: `مردودی آزمون ${code}` }, hint: ['method', 'measurement', 'material'],
  })
  return out
}

/** the watched figure of a case, measured again only on what happened after `from` (the agreement) */
export function measure(rule: Rule, scope: Trigger['scope'], x: CapaInput, from: string): Metric | null {
  const after = <T extends { at: string }>(xs: T[]) => xs.filter((r) => r.at > from)
  const rate = (n: number, of: number) => (of ? (n / of) * 100 : 0)
  switch (rule) {
    case 'repair_rate': { const f = after(x.firsts); return { value: rate(f.filter((r) => r.repaired).length, f.length), limit: null, unit: '٪', n: f.length, label: 'نرخ تعمیر پس از اقدام‌ها' } }
    case 'welder': { const f = after(x.firsts).filter((r) => scope.welder && r.welders.includes(scope.welder)); return { value: rate(f.filter((r) => r.repaired).length, f.length), limit: null, unit: '٪', n: f.length, label: 'نرخ تعمیر جوشکار پس از اقدام‌ها' } }
    case 'defect_code': { const d = after(x.rejected), f = after(x.firsts); return { value: d.filter((r) => r.code === scope.code).length, limit: null, unit: 'مورد', n: f.length, label: `تکرار عیب ${scope.code ?? ''} پس از اقدام‌ها` } }
    case 'crack': { const f = after(x.firsts); return { value: after(x.rejected).filter((r) => r.crack).length, limit: null, unit: 'مورد', n: f.length, label: 'ترک پس از اقدام‌ها' } }
    case 'cutout': return { value: after(x.cutouts).length, limit: null, unit: 'مورد', n: after(x.firsts).length, label: 'برش پس از اقدام‌ها' }
    case 'repeat_repair': return { value: after(x.repeats).length, limit: null, unit: 'مورد', n: after(x.firsts).length, label: 'تعمیر دوم پس از اقدام‌ها' }
    case 'retake': { const f = after(x.films); return { value: rate(f.filter((r) => r.bad).length, f.length), limit: null, unit: '٪', n: f.length, label: 'نرخ برگشت فیلم پس از اقدام‌ها' } }
    case 'coating': { const f = after(x.coat); return { value: rate(f.filter((r) => r.bad).length, f.length), limit: null, unit: '٪', n: f.length, label: 'نرخ مردودی پوشش پس از اقدام‌ها' } }
    case 'ncr_repeat': { const n = x.ncrs.filter((r) => r.status !== 'void' && r.kind === scope.ncrKind && r.createdAt > from); return { value: n.length, limit: null, unit: 'مورد', n: n.length, label: 'NCR هم‌نوع پس از اقدام‌ها' } }
    default: return null
  }
}

// ── the gates, as the database checks them (the screen only explains)
export interface GateCase { status: CapaStatus; mandatory: boolean; round: number; containment: string; ownerName: string; meetingAt: string | null; minutes: string; rootCause: string }
export interface GateAttendee { round: number; present: boolean; party: Party; signedAt: string | null }
export interface GateAction { round: number; kind: ActionKind; status: 'open' | 'done'; removed: boolean }
export interface Check { key: string; ok: boolean; label: string }

/** what the minutes need before anyone can sign, and before the case can move on */
export function readiness(c: GateCase, att: GateAttendee[], act: GateAction[], now: string): Check[] {
  const a = att.filter((p) => p.round === c.round && p.present), live = act.filter((x) => x.round === c.round && !x.removed)
  const sides = new Set(a.map((p) => (['supervision', 'consultant', 'employer'].includes(p.party) ? 'sup' : ['contractor', 'qc'].includes(p.party) ? 'con' : '')).filter(Boolean))
  const need = c.mandatory ? 3 : 2
  return [
    { key: 'containment', ok: c.containment.trim().length >= 10, label: 'اقدام فوری مهار ثبت شده است' },
    { key: 'owner', ok: c.ownerName.trim().length >= 2, label: 'مسئول پرونده تعیین شده است' },
    { key: 'meeting', ok: !!c.meetingAt && c.meetingAt <= now, label: 'جلسهٔ ریشه‌یابی برگزار و زمان آن ثبت شده است' },
    { key: 'quorum', ok: a.length >= need, label: `دست‌کم ${need.toLocaleString('fa-IR')} نفر در جلسه حاضر بوده‌اند` },
    ...(c.mandatory ? [{ key: 'parties', ok: sides.size >= 2, label: 'هم پیمانکار / کنترل کیفیت و هم نظارت / مشاور / کارفرما حضور داشته‌اند' }] : []),
    { key: 'minutes', ok: c.minutes.trim().length >= 30, label: 'شرح مذاکرات (صورتجلسه) نوشته شده است' },
    { key: 'root', ok: c.rootCause.trim().length >= 10, label: 'علت ریشه‌ای توافق‌شده نوشته شده است' },
    { key: 'corrective', ok: live.some((x) => x.kind === 'corrective'), label: 'دست‌کم یک اقدام اصلاحی با مسئول و مهلت' },
    { key: 'preventive', ok: live.some((x) => x.kind === 'preventive'), label: 'دست‌کم یک اقدام پیشگیرانه با مسئول و مهلت' },
    { key: 'signed', ok: a.length > 0 && a.every((p) => !!p.signedAt), label: 'همهٔ حاضران صورتجلسه را امضا کرده‌اند' },
  ]
}
export const STEPS: { key: CapaStatus; label: string }[] = [{ key: 'open', label: 'مهار فوری' }, { key: 'rca', label: 'جلسهٔ ریشه‌یابی و توافق' }, { key: 'agreed', label: 'اجرای اقدام‌ها' }, { key: 'verifying', label: 'سنجش اثربخشی' }, { key: 'closed', label: 'بسته' }]

/** how late a case is today, and who should now hear about it */
export function lateness(c: { status: CapaStatus; meetingDue: string; verifyDue: string | null; actionsDue: string[] }, today: string): { late: boolean; days: number; what: string; level: 0 | 1 | 2 | 3 } {
  const diff = (d: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.slice(0, 10)}T00:00:00Z`)) / 864e5)
  let days = 0, what = ''
  if (c.status === 'open' || c.status === 'rca') { days = diff(c.meetingDue); what = 'برگزاری جلسه و توافق' }
  else if (c.status === 'agreed') { const d = c.actionsDue.filter(Boolean).sort()[0]; days = d ? diff(d) : 0; what = 'اجرای اقدام‌ها' }
  else if (c.status === 'verifying' && c.verifyDue) { days = diff(c.verifyDue); what = 'سنجش اثربخشی' }
  return { late: days > 0, days: Math.max(0, days), what, level: days <= 0 ? 0 : days <= 3 ? 1 : days <= 10 ? 2 : 3 }
}
export const ESCALATE_FA = ['', 'مدیر کنترل کیفیت', 'مدیر پروژه و سرپرست نظارت', 'مجری طرح'] as const

// ── indicators of the improvement loop itself
export interface CaseLite { status: CapaStatus; mandatory: boolean; openedAt: string; agreedAt: string | null; closedAt: string | null; meetingDue: string; verifyResult: string | null; round: number }
export function loopKpis(cases: CaseLite[], today: string) {
  const live = cases.filter((c) => c.status !== 'void'), closed = live.filter((c) => c.status === 'closed')
  const open = live.filter((c) => c.status !== 'closed')
  const agreed = live.filter((c) => c.agreedAt)
  const onTime = agreed.filter((c) => (c.agreedAt as string).slice(0, 10) <= c.meetingDue).length
  const days = closed.map((c) => (Date.parse(c.closedAt as string) - Date.parse(c.openedAt)) / 864e5).sort((a, b) => a - b)
  return {
    total: live.length, open: open.length, closed: closed.length,
    overdueMeeting: open.filter((c) => (c.status === 'open' || c.status === 'rca') && c.meetingDue < today).length,
    onTimePct: agreed.length ? (onTime / agreed.length) * 100 : null,
    /** closed at the first attempt: the actions worked without a second meeting */
    effectivePct: closed.length ? (closed.filter((c) => c.round === 1).length / closed.length) * 100 : null,
    medianDays: days.length ? days[Math.floor(days.length / 2)] : null,
  }
}

/** Pareto of a list of categories: counts, share and running share, largest first */
export function pareto<T extends string>(items: T[]): { key: T; count: number; share: number; cum: number }[] {
  const m = new Map<T, number>()
  for (const k of items) m.set(k, (m.get(k) ?? 0) + 1)
  let run = 0
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => { run += count; return { key, count, share: (count / items.length) * 100, cum: (run / items.length) * 100 } })
}
