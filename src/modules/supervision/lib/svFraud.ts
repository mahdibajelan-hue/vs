import type { SvDevice, SvPunch } from '../types'

/**
 * ثبت‌های مشکوک — patterns in the phone check-ins that suggest one person checked in for another. Nothing here blocks a
 * check-in; the approver sees the list before signing the month. Each rule is stated in plain words beside its result.
 *
 * high    one browser (install id) used for two or more people · two people with exactly the same coordinates within minutes
 * medium  two people within 3 minutes from the same address and the same browser · a check-in without the signature of the
 *         person's approved phone, or from another browser than that phone
 * low     attempts refused for lack of an approved phone · three or more attempts outside the site in one day · a phone
 *         replaced by another
 */

export type Severity = 'high' | 'medium' | 'low'
export type FlagKind = 'shared_install' | 'identical_fix' | 'same_browser_burst' | 'unsigned' | 'other_install' | 'refused_device' | 'many_outside' | 'phone_change'
export interface FraudFlag {
  key: string
  kind: FlagKind
  severity: Severity
  /** first day the pattern appears in the range */
  day: string
  personIds: string[]
  /** how many check-ins the pattern covers */
  count: number
  detail: string
}
export const FLAG_FA: Record<FlagKind, string> = {
  shared_install: 'یک گوشی یا مرورگر برای چند نفر',
  identical_fix: 'مختصات کاملاً یکسان برای دو نفر',
  same_browser_burst: 'ثبت پشت‌سرهم دو نفر از یک مرورگر و یک نشانی اینترنتی',
  unsigned: 'ثبت بدون امضای گوشی تأییدشدهٔ خود فرد',
  other_install: 'ثبت از گوشی یا مرورگری غیر از گوشی تأییدشده',
  refused_device: 'تلاش برای ثبت بدون گوشی تأییدشده',
  many_outside: 'تلاش‌های مکرر خارج از محدوده',
  phone_change: 'تعویض گوشی',
}
export const SEVERITY_FA: Record<Severity, string> = { high: 'زیاد', medium: 'متوسط', low: 'کم' }
export const SEVERITY_COLOR: Record<Severity, string> = { high: '#ef4444', medium: '#f59e0b', low: '#64748b' }

const MIN = 60_000
const t = (iso: string) => new Date(iso).getTime()
const fa = (n: number) => n.toLocaleString('fa-IR')
const sameFix = (a: SvPunch, b: SvPunch) => a.lat != null && b.lat != null && a.lng != null && b.lng != null && a.lat.toFixed(6) === b.lat.toFixed(6) && a.lng.toFixed(6) === b.lng.toFixed(6)

export function detectFraud(punches: SvPunch[], devices: SvDevice[], nameOf: (personId: string) => string = (id) => id): FraudFlag[] {
  const out: FraudFlag[] = []
  const sorted = [...punches].sort((a, b) => a.at.localeCompare(b.at))

  // one browser for several people
  const byInstall = new Map<string, SvPunch[]>()
  for (const p of sorted) if (p.installId) byInstall.set(p.installId, [...(byInstall.get(p.installId) ?? []), p])
  for (const [inst, list] of byInstall) {
    const people = [...new Set(list.map((p) => p.personId))]
    if (people.length < 2) continue
    out.push({ key: `install:${inst}`, kind: 'shared_install', severity: 'high', day: list[0].day, personIds: people, count: list.length,
      detail: `${people.map(nameOf).join('، ')} با یک مرورگر روی یک گوشی ثبت کرده‌اند (${fa(list.length)} ثبت).` })
  }

  // pairs of people close in time
  const pairSeen = new Set<string>()
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j]
      const dt = t(b.at) - t(a.at)
      if (dt > 5 * MIN) break
      if (a.personId === b.personId) continue
      const pk = [a.personId, b.personId].sort().join('|')
      if (sameFix(a, b) && !pairSeen.has(`fix:${pk}:${a.day}`)) {
        pairSeen.add(`fix:${pk}:${a.day}`)
        out.push({ key: `fix:${pk}:${a.day}`, kind: 'identical_fix', severity: 'high', day: a.day, personIds: [a.personId, b.personId], count: 2,
          detail: `${nameOf(a.personId)} و ${nameOf(b.personId)} با فاصلهٔ ${fa(Math.round(dt / 1000))} ثانیه و مختصات دقیقاً یکسان ثبت کرده‌اند؛ دو گوشی جداگانه چنین موقعیت یکسانی نمی‌دهند.` })
      } else if (dt <= 3 * MIN && a.ip && a.ip === b.ip && a.device && a.device === b.device && !pairSeen.has(`burst:${pk}:${a.day}`)) {
        pairSeen.add(`burst:${pk}:${a.day}`)
        out.push({ key: `burst:${pk}:${a.day}`, kind: 'same_browser_burst', severity: 'medium', day: a.day, personIds: [a.personId, b.personId], count: 2,
          detail: `${nameOf(a.personId)} و ${nameOf(b.personId)} در فاصلهٔ ${fa(Math.max(1, Math.round(dt / MIN)))} دقیقه از یک نشانی اینترنتی و با مرورگر یکسان ثبت کرده‌اند.` })
      }
    }
  }

  // check-ins that the person's approved phone did not sign
  const activeOf = new Map<string, SvDevice>()
  for (const d of devices) if (d.status === 'active') activeOf.set(d.personId, d)
  const unsigned = new Map<string, SvPunch[]>(), other = new Map<string, SvPunch[]>()
  for (const p of sorted) {
    if (!p.accepted) continue
    const d = activeOf.get(p.personId)
    if (!d || !d.decidedAt || p.at < d.decidedAt) continue
    if (!p.verified) unsigned.set(p.personId, [...(unsigned.get(p.personId) ?? []), p])
    else if (p.installId && d.installId && p.installId !== d.installId) other.set(p.personId, [...(other.get(p.personId) ?? []), p])
  }
  for (const [pid, list] of unsigned) out.push({ key: `unsigned:${pid}`, kind: 'unsigned', severity: 'medium', day: list[0].day, personIds: [pid], count: list.length,
    detail: `${fa(list.length)} ثبت ${nameOf(pid)} بدون تأیید اثر انگشت یا قفل گوشی تأییدشدهٔ او پذیرفته شده است (ثبت با گوشی هنوز در این پروژه اجباری نیست).` })
  for (const [pid, list] of other) out.push({ key: `other:${pid}`, kind: 'other_install', severity: 'medium', day: list[0].day, personIds: [pid], count: list.length,
    detail: `${fa(list.length)} ثبت ${nameOf(pid)} از مرورگری غیر از مرورگر گوشی تأییدشده انجام شده است.` })

  // refused attempts and repeated attempts from outside
  const refused = new Map<string, SvPunch[]>(), outside = new Map<string, SvPunch[]>()
  for (const p of sorted) {
    if (p.accepted) continue
    if (p.reason === 'device_required' || p.reason === 'no_device' || p.reason === 'device_pending') refused.set(p.personId, [...(refused.get(p.personId) ?? []), p])
    if (p.reason === 'outside') outside.set(`${p.personId}|${p.day}`, [...(outside.get(`${p.personId}|${p.day}`) ?? []), p])
  }
  for (const [pid, list] of refused) out.push({ key: `refused:${pid}`, kind: 'refused_device', severity: 'low', day: list[0].day, personIds: [pid], count: list.length,
    detail: `${fa(list.length)} بار برای ${nameOf(pid)} بدون گوشی تأییدشده تلاش به ثبت شده و پذیرفته نشده است.` })
  for (const [k, list] of outside) {
    if (list.length < 3) continue
    const [pid, day] = k.split('|')
    out.push({ key: `outside:${k}`, kind: 'many_outside', severity: 'low', day, personIds: [pid], count: list.length,
      detail: `${nameOf(pid)} در یک روز ${fa(list.length)} بار از بیرون محدودهٔ کارگاه تلاش به ثبت کرده است.` })
  }

  // phones replaced
  const byPerson = new Map<string, SvDevice[]>()
  for (const d of devices) byPerson.set(d.personId, [...(byPerson.get(d.personId) ?? []), d])
  const from = sorted[0]?.day ?? '', to = sorted[sorted.length - 1]?.day ?? ''
  for (const [pid, list] of byPerson) {
    if (list.length < 2) continue
    const newer = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(1).filter((d) => !from || (d.createdAt.slice(0, 10) >= from && d.createdAt.slice(0, 10) <= to))
    if (!newer.length) continue
    out.push({ key: `change:${pid}`, kind: 'phone_change', severity: 'low', day: newer[0].createdAt.slice(0, 10), personIds: [pid], count: newer.length,
      detail: `${nameOf(pid)} ${fa(newer.length)} بار گوشی تازه ثبت کرده است.` })
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => order[a.severity] - order[b.severity] || a.day.localeCompare(b.day))
}

/** flags touching each person, for a badge beside the name */
export function flagsByPerson(flags: FraudFlag[]): Map<string, FraudFlag[]> {
  const m = new Map<string, FraudFlag[]>()
  for (const f of flags) for (const p of f.personIds) m.set(p, [...(m.get(p) ?? []), f])
  return m
}
