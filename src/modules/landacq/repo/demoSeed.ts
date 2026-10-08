import type { Owner, Parcel, Stage, StageKey } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { addDays } from '../lib/dates'
import { makeStages, STAGE_DAYS, STAGE_ORDER } from '../lib/workflow'
import type { DemoBundle, ParcelDraft } from './types'
import { pointAt, polyline, type LonLat } from '../lib/geometry'
import { toUtm } from '../lib/utm'

/** Small deterministic PRNG so the demo looks the same every time. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['علی', 'محمد', 'حسین', 'رضا', 'مهدی', 'حسن', 'احمد', 'ابراهیم', 'یوسف', 'اسماعیل', 'فاطمه', 'زهرا', 'مریم', 'سکینه']
const LAST = ['رحیمی', 'کریمی', 'محمودی', 'حسینی', 'نوری', 'احمدی', 'قاسمی', 'صالحی', 'جعفری', 'موسوی', 'بلوچ', 'ابراهیمی', 'میری', 'شهابی']
const ISSUERS = ['اداره ثبت اسناد و املاک', 'دادگستری', 'اداره کل منابع طبیعی', 'شرکت آب منطقه‌ای', 'اداره راه و شهرسازی', 'کارشناس رسمی دادگستری']
const DOC_TYPES = ['سند مالکیت', 'استعلام ثبتی', 'نظریه کارشناس رسمی', 'صورت‌جلسه توافق', 'مجوز عبور / معارض', 'نقشه تفکیکی']

export function demoGeometry(): LonLat[] {
  const pts: LonLat[] = []
  for (let i = 0; i <= 14; i++) pts.push([+(56.5 + i * 0.07).toFixed(5), +(27.0 - i * 0.03 + 0.06 * Math.sin(i * 0.9)).toFixed(5)])
  return pts
}

interface Zone {
  from: number
  to: number
  /** 0..10 — how many workflow steps are already done on parcels of this zone */
  done: number
  /** a step in progress after the done ones */
  working?: boolean
  make: (r: () => number, km: number) => Partial<ParcelDraft>
}

const ZONES: Zone[] = [
  { from: 0, to: 24, done: 10, make: (r) => ({ landType: 'agricultural', ownershipClass: 'private', ownerCountEst: 1 + Math.floor(r() * 3), ownerKnown: true, landUse: 'کشت دیم', complexity: 1 + Math.floor(r() * 2) }) },
  { from: 24, to: 31, done: 8, working: true, make: (r) => ({ landType: 'agricultural', ownershipClass: 'private', ownerCountEst: 2 + Math.floor(r() * 4), ownerKnown: true, landUse: 'کشت آبی', complexity: 2 + Math.floor(r() * 2), disputeProbability: 10 + Math.floor(r() * 20) }) },
  { from: 31, to: 39, done: 3, working: true, make: (r) => ({ landType: r() > 0.5 ? 'rangeland' : 'forest', ownershipClass: 'natural_resources', ownerCountEst: 0, ownerKnown: true, custodian: 'اداره کل منابع طبیعی و آبخیزداری', landUse: 'مرتع / عرصهٔ ملی', complexity: 3, disputeProbability: 15, flags: { sensitive_area: r() > 0.6 } }) },
  { from: 39, to: 46, done: 1, working: true, make: (r) => ({ landType: 'garden', ownershipClass: 'private', ownerCountEst: 5 + Math.floor(r() * 8), ownerKnown: true, landUse: 'باغات پسته', complexity: 4, disputeProbability: 35 + Math.floor(r() * 25), flags: { high_value: true } }) },
  { from: 46, to: 52, done: 2, working: true, make: () => ({ landType: 'riverbed', ownershipClass: 'governmental', ownerCountEst: 0, ownerKnown: true, custodian: 'شرکت آب منطقه‌ای', landUse: 'حریم رودخانه', complexity: 3, flags: { sensitive_area: true } }) },
  { from: 52, to: 60, done: 3, working: true, make: () => ({ landType: 'desert', ownershipClass: 'governmental', ownerCountEst: 0, ownerKnown: true, custodian: 'اداره املاک و اراضی', landUse: 'اراضی بایر دولتی', complexity: 2, disputeProbability: 5 }) },
  { from: 60, to: 70, done: 4, working: true, make: (r) => ({ landType: r() > 0.7 ? 'garden' : 'agricultural', ownershipClass: r() > 0.9 ? 'exempt' : 'private', ownerCountEst: 1 + Math.floor(r() * 4), ownerKnown: r() > 0.3, landUse: 'کشاورزی', complexity: 2 + Math.floor(r() * 2), disputeProbability: 10 + Math.floor(r() * 25) }) },
  { from: 70, to: 78, done: 2, working: true, make: (r) => ({ landType: r() > 0.5 ? 'industrial' : 'urban', ownershipClass: 'private', ownerCountEst: 3 + Math.floor(r() * 6), ownerKnown: r() > 0.5, landUse: 'حاشیهٔ شهرک صنعتی', complexity: 3, disputeProbability: 25 + Math.floor(r() * 25), flags: { has_facilities: r() > 0.5 } }) },
  { from: 78, to: 90, done: 1, working: true, make: (r) => ({ landType: r() > 0.6 ? 'rangeland' : 'desert', ownershipClass: r() > 0.75 ? 'natural_resources' : r() > 0.5 ? 'governmental' : 'private', ownerCountEst: Math.floor(r() * 3), ownerKnown: true, landUse: 'اراضی بایر', complexity: 1 + Math.floor(r() * 2), disputeProbability: Math.floor(r() * 15) }) },
{ from: 90, to: 100.01, done: 0, make: (r) => ({ landType: r() > 0.6 ? 'rangeland' : 'desert', ownershipClass: r() > 0.75 ? 'natural_resources' : r() > 0.5 ? 'governmental' : 'private', ownerCountEst: Math.floor(r() * 3), ownerKnown: true, landUse: 'اراضی بایر', complexity: 1 + Math.floor(r() * 2), disputeProbability: Math.floor(r() * 15) }) },
]

const LENGTHS = [2.4, 1.8, 3.1, 2.0, 1.5, 2.8, 2.2, 1.6, 3.4, 2.6]

function stagesFor(done: number, working: boolean, route: 'normal' | 'accelerated' | 'dispute' | 'art9', complexity: number, today: string, r: () => number): Stage[] {
  const days = STAGE_DAYS[route]
  const f = 0.8 + 0.1 * complexity
  const dur = (i: number) => Math.round(days[STAGE_ORDER[i]] * f)
  const anchor = Math.min(done, 9)
  const planned: string[] = []
  planned[anchor] = addDays(today, Math.floor(r() * 30) - 8)
  for (let i = anchor - 1; i >= 0; i--) planned[i] = addDays(planned[i + 1], -dur(i))
  for (let i = anchor + 1; i < STAGE_ORDER.length; i++) planned[i] = addDays(planned[i - 1], dur(i - 1))
  const started = done > 0 || working
  const regular = STAGE_ORDER.map((key, i) => {
    const status = i < done ? 'done' : i === done && working ? 'in_progress' : 'not_started'
    const slip = Math.floor(r() * 10) - 4
    return { key, status, responsible: i < 5 ? 'کارشناس تحصیل اراضی' : 'مدیر امور مالی و حقوقی', plannedDate: started ? planned[i] : null, actualDate: status === 'done' ? addDays(planned[i], Math.max(0, slip)) : null, note: '' } as Stage
  })
  return [...regular, ...makeStages().filter((s) => !STAGE_ORDER.includes(s.key))]
}

export function buildDemo(masterProjectId: string, today: string): DemoBundle {
  const r = rng(1405)
  const parcels: ParcelDraft[] = []
  let km = 0
  let n = 0
  while (km < 99.9) {
    const len = Math.min(LENGTHS[n % LENGTHS.length], 100 - km)
    const zone = ZONES.find((z) => km >= z.from && km < z.to)!
    const base: ParcelDraft = {
      code: `LP-${String(n + 1).padStart(3, '0')}`,
      title: '',
      kmStart: +km.toFixed(3),
      kmEnd: +(km + len).toFixed(3),
      landType: 'unknown', ownershipClass: 'unknown', landUse: '', ownerCountEst: 0, ownerKnown: false, custodian: '', disputeProbability: 0, complexity: 1,
      estDurationDays: null, flags: {}, acquisitionRoute: 'normal', areaM2: Math.round(len * 1000 * 20), estCost: null, notes: '', isDemo: true,
      ...zone.make(r, km),
    }
    base.estCost = Math.round((base.areaM2 ?? 0) * (base.landType === 'garden' ? 9_000_000 : base.landType === 'agricultural' ? 3_500_000 : 800_000))
    parcels.push(base)
    km += len
    n++
  }

  // hand-placed story parcels
  const at = (a: number, b: number) => parcels.find((p) => p.kmStart <= a + 1e-6 && p.kmEnd >= b - 1e-6) ?? parcels.find((p) => p.kmEnd > a && p.kmStart < b)!
  const split = (a: number, b: number): ParcelDraft => {
    // carve an exact [a,b] parcel out of whichever generated parcel contains it
    const host = parcels.find((p) => p.kmStart <= a + 1e-6 && p.kmEnd > a)!
    const idx = parcels.indexOf(host)
    const pieces: ParcelDraft[] = []
    if (a - host.kmStart > 0.05) pieces.push({ ...host, kmEnd: a })
    const mid: ParcelDraft = { ...host, kmStart: a, kmEnd: Math.min(b, host.kmEnd) }
    pieces.push(mid)
    if (host.kmEnd - mid.kmEnd > 0.05) pieces.push({ ...host, kmStart: mid.kmEnd })
    parcels.splice(idx, 1, ...pieces)
    return mid
  }
  void at
  const crit1 = split(42.3, 43.1)
  Object.assign(crit1, { title: 'باغات پسته — عبور از تأسیسات آبیاری', landType: 'garden', ownershipClass: 'private', ownerCountEst: 11, ownerKnown: false, disputeProbability: 55, complexity: 5, flags: { high_value: true, has_facilities: true, critical_for_execution: true, past_dispute: true }, notes: 'سه مالک در خارج از شهر؛ چاه کشاورزی و شبکهٔ آبیاری در مسیر.' })
  const crit2 = split(78.2, 79)
  Object.assign(crit2, { title: 'مالکیت نامشخص — سابقهٔ اختلاف', landType: 'desert', ownershipClass: 'unknown', ownerCountEst: 9, ownerKnown: false, disputeProbability: 75, complexity: 5, acquisitionRoute: 'dispute', flags: { past_dispute: true, critical_for_execution: true, high_value: false }, custodian: 'اداره املاک و اراضی', notes: 'ادعای مالکیت متعارض؛ پروندهٔ دادگاه در جریان.' })
  const river = split(47, 48.2)
  Object.assign(river, { title: 'عبور از رودخانهٔ فصلی', landType: 'riverbed', ownershipClass: 'governmental', custodian: 'شرکت آب منطقه‌ای', flags: { sensitive_area: true, critical_for_execution: true }, acquisitionRoute: 'accelerated' })
  const rail = split(74.5, 75)
  Object.assign(rail, { title: 'تقاطع با خط راه‌آهن', landType: 'road_rail', ownershipClass: 'governmental', custodian: 'راه‌آهن جمهوری اسلامی', flags: { has_facilities: true, critical_for_execution: true }, complexity: 4 })
  const exempt = split(64, 65.2)
  Object.assign(exempt, { title: 'مستثنیات قانونی', landType: 'garden', ownershipClass: 'exempt', ownerCountEst: 1, ownerKnown: true, complexity: 3 })

  // Article 9 (immediate possession) stories: one inside its 3-month payment window, one past it with the owner's court stay, one still preparing
  const a9a = split(30, 30.7)
  Object.assign(a9a, { title: 'تصرف فوری ماده ۹ — در مهلت پرداخت', landType: 'agricultural', ownershipClass: 'private', ownerCountEst: 2, ownerKnown: true, acquisitionRoute: 'art9', complexity: 2, flags: { critical_for_execution: true } })
  const a9b = split(55, 55.8)
  Object.assign(a9b, { title: 'تصرف فوری ماده ۹ — مهلت پرداخت گذشته', landType: 'garden', ownershipClass: 'private', ownerCountEst: 3, ownerKnown: true, acquisitionRoute: 'art9', complexity: 3, flags: { critical_for_execution: true, past_dispute: true }, legal: { stayFiledDate: addDays(today, -20), stayOrderDate: addDays(today, -12) }, notes: 'مالک از دادگاه توقف عملیات را خواسته و دستور توقف صادر شده است.' })
  const a9c = split(85, 85.6)
  Object.assign(a9c, { title: 'ماده ۹ — در حال تهیهٔ صورت‌جلسه', landType: 'desert', ownershipClass: 'private', ownerCountEst: 1, ownerKnown: true, acquisitionRoute: 'art9', complexity: 2, flags: { critical_for_execution: true } })
  const art9Stages = (rows: [StageKey, 'done' | 'in_progress' | 'not_started', number | null, number | null][]): Stage[] =>
    makeStages().map((blank) => {
      const row = rows.find((x) => x[0] === blank.key)
      if (!row) return blank
      const [key, status, planned, actual] = row
      return { key, status, responsible: key === 'art9_necessity' ? 'وزیر / بالاترین مقام دستگاه' : key === 'art9_minutes' ? 'حقوقی با نمایندهٔ دادستانی' : key === 'art9_possession' ? 'مدیر اجرایی طرح' : 'مدیر امور مالی', plannedDate: planned == null ? null : addDays(today, planned), actualDate: actual == null ? null : addDays(today, actual), note: '' }
    })
  a9a.stages = art9Stages([['art9_necessity', 'done', -91, -90], ['art9_minutes', 'done', -82, -81], ['art9_possession', 'done', -76, -75], ['art9_payment', 'in_progress', 14, null]])
  a9b.stages = art9Stages([['art9_necessity', 'done', -141, -140], ['art9_minutes', 'done', -133, -132], ['art9_possession', 'done', -126, -125], ['art9_payment', 'in_progress', -35, null]])
  a9c.stages = art9Stages([['art9_necessity', 'done', -7, -6], ['art9_minutes', 'in_progress', 3, null], ['art9_possession', 'not_started', 8, null], ['art9_payment', 'not_started', null, null]])
  a9a.owners = [{ name: 'حسین ناصری', contact: '09121234567', sharePct: 60, agreement: 'agreed', estAmount: 1_800_000_000, finalAmount: null, payment: 'unpaid', released: false, notes: '' }, { name: 'اکرم ناصری', contact: '', sharePct: 40, agreement: 'negotiating', estAmount: 1_200_000_000, finalAmount: null, payment: 'unpaid', released: false, notes: '' }]
  a9b.owners = [{ name: 'جواد منصوری', contact: '09130001122', sharePct: 100, agreement: 'refused', estAmount: 6_400_000_000, finalAmount: null, payment: 'unpaid', released: false, notes: 'درخواست توقف عملیات به دادگاه داده است' }]

  // renumber after the carving
  parcels.forEach((p, i) => (p.code = `LP-${String(i + 1).padStart(3, '0')}`))

  // workflow state, owners and document metadata
  for (const p of parcels) {
    if (p.acquisitionRoute === 'art9') continue
    const zone = ZONES.find((z) => p.kmStart >= z.from && p.kmStart < z.to)!
    let done = zone.done
    let working = !!zone.working
    // a little variation inside each zone; the released stretch stays fully released
    if (zone.done < 10 && zone.done > 0) done = Math.min(9, zone.done + (r() < 0.4 ? 1 : 0) - (r() < 0.2 ? 1 : 0))
    if (p === crit1) { done = 2; working = true }
    if (p === crit2) { done = 0; working = false }
    if (p === river) { done = 3; working = true }
    if (p === rail) { done = 0; working = true }
    if (p === exempt) { done = 1; working = true }
    p.stages = stagesFor(done, working, p.acquisitionRoute, p.complexity, today, r)
    if (p === crit2) p.stages = p.stages.map((s) => ({ ...s, status: 'not_started', plannedDate: null, actualDate: null }))

    const started = done > 0 || working
    if (p.ownershipClass === 'private' && started && p.ownerCountEst > 0 && p.ownerCountEst <= 8) {
      const cnt = Math.max(1, Math.min(p.ownerCountEst, 6))
      p.owners = Array.from({ length: cnt }, (_, i) => {
        const settled = done >= 8
        const agreed = done >= 6 || r() > 0.5
        const o: Omit<Owner, 'id' | 'parcelId'> = {
          name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
          contact: `09${Math.floor(100000000 + r() * 899999999)}`,
          sharePct: +(100 / cnt).toFixed(2),
          agreement: done >= 9 ? 'agreed' : agreed ? 'agreed' : i === 0 && p.disputeProbability > 30 ? 'negotiating' : 'not_contacted',
          estAmount: Math.round(((p.estCost ?? 0) / cnt) * 0.95),
          finalAmount: done >= 6 ? Math.round((p.estCost ?? 0) / cnt) : null,
          payment: settled ? 'paid' : done >= 8 ? 'partial' : 'unpaid',
          released: done >= 9,
          notes: '',
        }
        return o
      })
      p.docs = [0, 1, 2].slice(0, 1 + (done > 3 ? 2 : 0)).map((i) => ({ docType: DOC_TYPES[i], docNumber: `${1400 + Math.floor(r() * 5)}/${Math.floor(1000 + r() * 8999)}`, docDate: addDays(today, -Math.floor(20 + r() * 200)), issuer: ISSUERS[(i + Math.floor(r() * 3)) % ISSUERS.length], status: done > 3 ? 'approved' : 'submitted', note: '', ref: '' }))
    }
    if (p.ownershipClass === 'natural_resources' || p.ownershipClass === 'governmental') {
      p.docs = [{ docType: 'مجوز عبور / معارض', docNumber: '', docDate: null, issuer: p.custodian || ISSUERS[2], status: started ? 'submitted' : 'pending', note: 'درخواست مجوز تغییر کاربری و عبور خط لوله', ref: '' }]
    }
  }
  const crit1Draft = parcels.find((p) => p.title.startsWith('باغات'))!
  crit1Draft.owners = ['حاج علی رحیمی', 'ورثهٔ مرحوم کریمی', 'محمد نوری', 'شرکت کشاورزی بهار'].map((name, i) => ({ name, contact: i % 2 ? '' : `0912${Math.floor(1000000 + r() * 8999999)}`, sharePct: [35, 30, 20, 15][i], agreement: (['negotiating', 'refused', 'not_contacted', 'unknown'] as const)[i], estAmount: Math.round((crit1Draft.estCost ?? 0) * [0.35, 0.3, 0.2, 0.15][i]), finalAmount: null, payment: 'unpaid', released: false, notes: i === 1 ? 'وراث متعدد؛ تقسیم ارث نهایی نشده' : '' }))

  // cadastral plots (UTM corners, ~40 m x 120 m) laid along the route inside the parcels that have private owners
  const line = polyline(demoGeometry())
  const plotsFor = (p: ParcelDraft, names: string[]) => {
    if (!names.length) return
    const span = Math.max(0.05, p.kmEnd - p.kmStart)
    p.plots = names.map((name, i) => {
      const f = (n: number) => Math.min(0.999, Math.max(0, (p.kmStart + (span * n) / (names.length + 1)) / 100))
      const c = pointAt(line, f(i + 1))
      const ahead = pointAt(line, Math.min(1, f(i + 1) + 0.0004))
      const dx = (ahead[0] - c[0]) * Math.cos((c[1] * Math.PI) / 180)
      const dy = ahead[1] - c[1]
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len, uy = dy / len // along the route
      const m2deg = 1 / 111320
      const corner = (along: number, across: number): [number, number] => {
        const lon = c[0] + ((ux * along - uy * across) * m2deg) / Math.cos((c[1] * Math.PI) / 180)
        const lat = c[1] + (uy * along + ux * across) * m2deg
        const u = toUtm(lat, lon)
        return [Math.round(u.e * 100) / 100, Math.round(u.n * 100) / 100]
      }
      const zone = toUtm(c[1], c[0]).zone
      return { plotNo: `${p.code}-${i + 1}`, ownerName: name, zone, north: true, corners: [corner(-60, -22), corner(60, -22), corner(60, 22), corner(-60, 22)], notes: '', isDemo: true }
    })
  }
  for (const p of parcels) {
    if (p.acquisitionRoute === 'art9' || p.owners?.length) plotsFor(p, (p.owners ?? []).slice(0, 4).map((o) => o.name))
  }
  // where each parcel stands in the contractor -> consultant -> legal -> project manager chain
  parcels.forEach((p, i) => {
    p.approvalStatus = p === crit1 ? 'submitted' : p === a9b ? 'consultant_approved' : p === a9a ? 'legal_attested' : (p.stages ?? []).some((s) => s.key === 'release' && s.status === 'done') ? 'approved' : i % 7 === 3 ? 'submitted' : 'draft'
  })

  const act = (key: string, name: string, startOffset: number, endOffset: number, sequence: number) => ({ key, name, kmStart: 0, kmEnd: 100, startDate: addDays(today, startOffset), endDate: addDays(today, endOffset), sequence, isDemo: true })
  return {
    route: { masterProjectId, name: 'خط لوله ۱۰۰ کیلومتری — نمونه', totalKm: 100, startKm: 0, geometry: demoGeometry(), geometrySource: 'demo', settings: { ...DEFAULT_SETTINGS }, isDemo: true },
    parcels,
    activities: [
      act('clearing', 'Clearing', -60, 300, 0),
      act('grading', 'Grading', -45, 315, 1),
      act('stringing', 'Stringing', -30, 330, 2),
      act('welding', 'Welding', -15, 345, 3),
      act('lowering', 'Lowering', 0, 360, 4),
      act('backfilling', 'Backfilling', 15, 375, 5),
    ],
  }
}

export type { Parcel, StageKey }
