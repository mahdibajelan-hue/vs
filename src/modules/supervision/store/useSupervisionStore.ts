import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useAuthStore } from '../../../store/useAuthStore'
import type { SvAttendance, SvGuestMeal, SvPerson, SvSettings, SvSignature, SvSignoff, SvSignStep, SvSnapshot, SvVehicle, SvVehicleDay } from '../types'
import { DEFAULT_SETTINGS } from '../lib/svCalc'
import { addDays, todayLocal } from '../lib/svMonth'

type Row = Record<string, unknown>
const s = (v: unknown) => (v ?? '') as string
const n = (v: unknown) => Number(v ?? 0)
const t = (v: unknown) => (v ? String(v).slice(0, 5) : null)

const toPerson = (r: Row): SvPerson => ({
  id: s(r.id), projectId: s(r.master_project_id), fullName: s(r.full_name), side: (r.side as SvPerson['side']) ?? 'supervision', roleTitle: s(r.role_title),
  nationalId: s(r.national_id), mobile: s(r.mobile), cardNo: s(r.card_no), overtimeCap: r.overtime_cap == null ? null : n(r.overtime_cap),
  mealBreakfast: !!r.meal_breakfast, mealLunch: !!r.meal_lunch, mealDinner: !!r.meal_dinner, shiftStart: t(r.shift_start), shiftEnd: t(r.shift_end), startDate: (r.start_date as string) ?? null, endDate: (r.end_date as string) ?? null,
  active: !!r.active, note: s(r.note),
})
const fromPerson = (p: Partial<SvPerson>): Row => {
  const o: Row = {}
  const m: [keyof SvPerson, string][] = [['fullName', 'full_name'], ['side', 'side'], ['roleTitle', 'role_title'], ['nationalId', 'national_id'], ['mobile', 'mobile'], ['cardNo', 'card_no'], ['overtimeCap', 'overtime_cap'], ['mealBreakfast', 'meal_breakfast'], ['mealLunch', 'meal_lunch'], ['mealDinner', 'meal_dinner'], ['shiftStart', 'shift_start'], ['shiftEnd', 'shift_end'], ['startDate', 'start_date'], ['endDate', 'end_date'], ['active', 'active'], ['note', 'note']]
  for (const [k, c] of m) if (k in p) o[c] = p[k] === '' && (c === 'start_date' || c === 'end_date' || c === 'shift_start' || c === 'shift_end') ? null : p[k]
  return o
}
const toGuest = (r: Row): SvGuestMeal => ({ id: s(r.id), day: s(r.day), guestName: s(r.guest_name), organization: s(r.organization), host: s(r.host), breakfast: n(r.breakfast), lunch: n(r.lunch), dinner: n(r.dinner), note: s(r.note), lateReason: s(r.late_reason) })
const toVehicle = (r: Row): SvVehicle => ({
  id: s(r.id), projectId: s(r.master_project_id), title: s(r.title), plate: s(r.plate), kind: (r.kind as SvVehicle['kind']) ?? 'sedan',
  modelYear: r.model_year == null ? null : n(r.model_year), engineCc: r.engine_cc == null ? null : n(r.engine_cc), gearbox: (r.gearbox as SvVehicle['gearbox']) ?? null, ownership: (r.ownership as SvVehicle['ownership']) ?? 'rented', lessor: s(r.lessor), driver: s(r.driver),
  personId: (r.person_id as string) ?? null, cardNo: s(r.card_no), startDate: (r.start_date as string) ?? null, endDate: (r.end_date as string) ?? null, active: !!r.active, note: s(r.note),
})
const fromVehicle = (v: Partial<SvVehicle>): Row => {
  const o: Row = {}
  const m: [keyof SvVehicle, string][] = [['title', 'title'], ['plate', 'plate'], ['kind', 'kind'], ['modelYear', 'model_year'], ['engineCc', 'engine_cc'], ['gearbox', 'gearbox'], ['ownership', 'ownership'], ['lessor', 'lessor'], ['driver', 'driver'], ['personId', 'person_id'], ['cardNo', 'card_no'], ['startDate', 'start_date'], ['endDate', 'end_date'], ['active', 'active'], ['note', 'note']]
  for (const [k, c] of m) if (k in v) o[c] = v[k] === '' && (c === 'start_date' || c === 'end_date' || c === 'person_id') ? null : v[k]
  return o
}
const toAtt = (r: Row): SvAttendance => ({
  personId: s(r.person_id), day: s(r.day), status: r.status as SvAttendance['status'], checkIn: t(r.check_in), checkOut: t(r.check_out), hours: n(r.hours), overtime: n(r.overtime),
  breakfast: !!r.breakfast, lunch: !!r.lunch, dinner: !!r.dinner, source: (r.source as SvAttendance['source']) ?? 'manual', note: s(r.note),
  lateReason: s(r.late_reason), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
})
const toVDay = (r: Row): SvVehicleDay => ({ vehicleId: s(r.vehicle_id), day: s(r.day), status: r.status as SvVehicleDay['status'], hours: n(r.hours), km: r.km == null ? null : n(r.km), source: (r.source as SvVehicleDay['source']) ?? 'manual', note: s(r.note), lateReason: s(r.late_reason), createdAt: s(r.created_at), updatedAt: s(r.updated_at) })
const toSettings = (r: Row | null): SvSettings => r ? { dutyDays: n(r.duty_days), standardHours: n(r.standard_hours), overtimeMin: n(r.overtime_min), overtimeMax: n(r.overtime_max), vehicleHours: n(r.vehicle_hours), entryGraceDays: r.entry_grace_days == null ? 2 : n(r.entry_grace_days) } : DEFAULT_SETTINGS

const toSignoff = (r: Row): SvSignoff => ({ month: s(r.month), status: r.status as SvSignoff['status'], from: s(r.from_day), to: s(r.to_day) })
const toSignature = (r: Row): SvSignature => ({
  id: s(r.id), month: s(r.month), step: r.step as SvSignStep, userId: s(r.user_id), signerName: s(r.signer_name), signerTitle: s(r.signer_title), image: s(r.image),
  note: s(r.note), snapshot: (r.snapshot ?? {}) as SvSignature['snapshot'], signedAt: s(r.signed_at), revokedAt: (r.revoked_at as string) ?? null, revokeReason: (r.revoke_reason as string) ?? null,
})
const STEP_FA: Record<string, string> = { open: 'باز', prepared: 'تهیه', reviewed: 'بررسی', approved: 'تأیید' }
const signErr = (e: { message: string; code?: string }): string => {
  const m = e.message
  if (/step_not_allowed/.test(m)) return 'برای این مرحله دسترسی ندارید. در مرکز کاربران، برای ماژول «حضور و غیاب دستگاه نظارت» مجوز «ارسال» (تهیه، سرپرست نظارت) یا «تأیید» (مدیر پروژهٔ کارفرما) لازم است.'
  if (/wrong_order:(\w+)/.test(m)) return `ترتیب امضا رعایت نشده؛ وضعیت فعلی ماه «${STEP_FA[/wrong_order:(\w+)/.exec(m)![1]] ?? ''}» است. صفحه را تازه کنید.`
  if (/same_signer/.test(m)) return 'تهیه‌کننده نمی‌تواند همان گزارش را تأیید هم بکند؛ تأیید با مدیر پروژهٔ کارفرماست.'
  if (/reason_required/.test(m)) return 'دلیل بازگشت را بنویسید (دست‌کم سه حرف).'
  if (/bad_signature/.test(m)) return 'تصویر امضا معتبر نیست یا حجم آن زیاد است.'
  if (/not_allowed|not_authenticated/.test(m) || e.code === '42501') return 'اجازهٔ این کار را در این پروژه ندارید.'
  return friendlyErrorMessage(e)
}
export const LATE_MSG = 'این روز از مهلت ثبت گذشته است؛ دلیل ثبت با تأخیر را بنویسید (دست‌کم ۵ حرف). دلیل و زمان ثبت در سابقه می‌ماند و در گزارش دیده می‌شود.'
export const FUTURE_MSG = 'روزهای آینده را فقط می‌توان «استراحت» یا «مأموریت» برنامه‌ریزی کرد؛ حضور و خودرو و وعده بعد از وقوع ثبت می‌شود.'
const lateOk = (reason: string | undefined) => (reason ?? '').trim().length >= 5
export const LOCKED_MSG = 'این روز در ماهی است که گزارشش امضا شده و قفل است. برای اصلاح، در «گزارش ماه» آن را «بازگشت برای اصلاح» کنید.'

const err = (e: { message: string; code?: string } | null): string | undefined =>
  !e ? undefined : e.code === '42501' || /row-level security/i.test(e.message) ? 'اجازهٔ ثبت در این پروژه را ندارید (دسترسی «حضور و غیاب دستگاه نظارت»).'
    : /idx_sv_people_card|duplicate key/.test(e.message) ? 'این شمارهٔ کارت قبلاً برای نفر دیگری ثبت شده است.' : friendlyErrorMessage(e)
const key = (a: string, b: string) => a + '|' + b
export type Result = { ok: boolean; error?: string }
const stamp = () => ({ updated_at: new Date().toISOString(), updated_by: useAuthStore.getState().profile?.id ?? null })

interface State {
  projectId: string | null
  loading: boolean
  error: string
  settings: SvSettings
  people: SvPerson[]
  vehicles: SvVehicle[]
  /** attendance and vehicle days of the loaded range, keyed person|day and vehicle|day */
  att: Record<string, SvAttendance>
  vdays: Record<string, SvVehicleDay>
  guests: SvGuestMeal[]
  range: { from: string; to: string } | null
  rangeLoading: boolean
  /** sign-off state per Jalali month (YYYY-MM) and every signature of a month (revoked ones too, for the history) */
  signoffs: Record<string, SvSignoff>
  signatures: Record<string, SvSignature[]>
  isLocked: (day: string) => boolean
  /** older than today − entryGraceDays: a written reason is required (also enforced by RLS) */
  needsReason: (day: string) => boolean
  isFuture: (day: string) => boolean
  loadSignatures: (month: string) => Promise<void>
  sign: (a: { month: string; from: string; to: string; step: SvSignStep; image: string; title: string; note: string; snapshot: SvSnapshot }) => Promise<Result>
  reopen: (month: string, reason: string) => Promise<Result>
  load: (projectId: string) => Promise<void>
  loadRange: (from: string, to: string, force?: boolean) => Promise<void>
  setDay: (personId: string, day: string, row: Omit<SvAttendance, 'personId' | 'day' | 'source'> & { source?: SvAttendance['source'] }) => Promise<Result>
  clearDay: (personId: string, day: string) => Promise<Result>
  setVehicleDay: (vehicleId: string, day: string, row: Omit<SvVehicleDay, 'vehicleId' | 'day' | 'source'>) => Promise<Result>
  clearVehicleDay: (vehicleId: string, day: string) => Promise<Result>
  savePerson: (p: Partial<SvPerson> & { id?: string }) => Promise<Result>
  deletePerson: (id: string) => Promise<Result>
  saveVehicle: (v: Partial<SvVehicle> & { id?: string }) => Promise<Result>
  deleteVehicle: (id: string) => Promise<Result>
  saveSettings: (x: SvSettings) => Promise<Result>
  saveGuest: (g: Omit<SvGuestMeal, 'id'> & { id?: string }) => Promise<Result>
  deleteGuest: (id: string) => Promise<Result>
  clockCount: (from: string, to: string) => Promise<number>
  applyClock: (from: string, to: string) => Promise<Result & { people?: number; vehicles?: number }>
}

export const useSupervisionStore = create<State>()((set, get) => ({
  projectId: null, loading: false, error: '', settings: DEFAULT_SETTINGS, people: [], vehicles: [], att: {}, vdays: {}, guests: [], range: null, rangeLoading: false, signoffs: {}, signatures: {},

  load: async (projectId) => {
    const fresh = get().projectId !== projectId
    set({ projectId, loading: fresh || !get().people.length, error: '', ...(fresh ? { people: [], vehicles: [], att: {}, vdays: {}, guests: [], range: null, settings: DEFAULT_SETTINGS, signoffs: {}, signatures: {} } : {}) })
    const [st, pp, vv, so] = await Promise.all([
      supabase.from('sv_settings').select('*').eq('master_project_id', projectId).maybeSingle(),
      supabase.from('sv_people').select('*').eq('master_project_id', projectId).order('active', { ascending: false }).order('full_name'),
      supabase.from('sv_vehicles').select('*').eq('master_project_id', projectId).order('active', { ascending: false }).order('title'),
      supabase.from('sv_month_signoffs').select('*').eq('master_project_id', projectId),
    ])
    if (get().projectId !== projectId) return
    set({ signoffs: Object.fromEntries(((so.data ?? []) as Row[]).map(toSignoff).map((x) => [x.month, x])) })
    const e = pp.error ?? vv.error ?? st.error
    set({ loading: false, error: e ? err(e) ?? '' : '', settings: toSettings(st.data as Row | null), people: ((pp.data ?? []) as Row[]).map(toPerson), vehicles: ((vv.data ?? []) as Row[]).map(toVehicle) })
  },

  loadRange: async (from, to, force) => {
    const pid = get().projectId, r = get().range
    if (!pid || (!force && r && r.from <= from && r.to >= to)) return
    set({ rangeLoading: true })
    const [a, v, g] = await Promise.all([
      supabase.from('sv_attendance').select('*').eq('master_project_id', pid).gte('day', from).lte('day', to),
      supabase.from('sv_vehicle_days').select('*').eq('master_project_id', pid).gte('day', from).lte('day', to),
      supabase.from('sv_guest_meals').select('*').eq('master_project_id', pid).gte('day', from).lte('day', to).order('day').order('created_at'),
    ])
    if (get().projectId !== pid) return
    const att: Record<string, SvAttendance> = {}, vdays: Record<string, SvVehicleDay> = {}
    for (const x of ((a.data ?? []) as Row[]).map(toAtt)) att[key(x.personId, x.day)] = x
    for (const x of ((v.data ?? []) as Row[]).map(toVDay)) vdays[key(x.vehicleId, x.day)] = x
    set({ att, vdays, guests: ((g.data ?? []) as Row[]).map(toGuest), range: { from, to }, rangeLoading: false, error: a.error || v.error ? err(a.error ?? v.error) ?? '' : get().error })
  },

  needsReason: (day) => day < addDays(todayLocal(), -get().settings.entryGraceDays),
  isFuture: (day) => day > todayLocal(),
  isLocked: (day) => Object.values(get().signoffs).some((x) => x.status !== 'open' && day >= x.from && day <= x.to),
  loadSignatures: async (month) => {
    const pid = get().projectId
    if (!pid) return
    const [g, so] = await Promise.all([
      supabase.from('sv_month_signatures').select('*').eq('master_project_id', pid).eq('month', month).order('signed_at'),
      supabase.from('sv_month_signoffs').select('*').eq('master_project_id', pid).eq('month', month).maybeSingle(),
    ])
    if (get().projectId !== pid) return
    set((x) => {
      const signoffs = { ...x.signoffs }
      if (so.data) signoffs[month] = toSignoff(so.data as Row); else delete signoffs[month]
      return { signoffs, signatures: { ...x.signatures, [month]: ((g.data ?? []) as Row[]).map(toSignature) } }
    })
  },
  sign: async (a) => {
    const pid = get().projectId!
    const { error } = await supabase.rpc('sv_sign', { p_project: pid, p_month: a.month, p_from: a.from, p_to: a.to, p_step: a.step, p_image: a.image, p_title: a.title.trim(), p_note: a.note.trim(), p_snapshot: a.snapshot })
    await get().loadSignatures(a.month)
    return error ? { ok: false, error: signErr(error) } : { ok: true }
  },
  reopen: async (month, reason) => {
    const pid = get().projectId!
    const { error } = await supabase.rpc('sv_reopen', { p_project: pid, p_month: month, p_reason: reason.trim() })
    await get().loadSignatures(month)
    return error ? { ok: false, error: signErr(error) } : { ok: true }
  },

  setDay: async (personId, day, row) => {
    if (get().isLocked(day)) return { ok: false, error: LOCKED_MSG }
    if (get().isFuture(day) && row.status !== 'rest' && row.status !== 'mission') return { ok: false, error: FUTURE_MSG }
    const late = get().needsReason(day)
    if (late && !lateOk(row.lateReason)) return { ok: false, error: LATE_MSG }
    const pid = get().projectId!
    const k = key(personId, day), prev = get().att[k]
    const next: SvAttendance = { personId, day, source: row.source ?? (prev?.source === 'clock' && prev.checkIn === row.checkIn && prev.checkOut === row.checkOut ? 'clock' : 'manual'), ...row }
    set((x) => ({ att: { ...x.att, [k]: next } }))
    const { error } = await supabase.from('sv_attendance').upsert({
      master_project_id: pid, person_id: personId, day, status: next.status, check_in: next.checkIn, check_out: next.checkOut, hours: next.hours, overtime: next.overtime,
      breakfast: next.breakfast, lunch: next.lunch, dinner: next.dinner, source: next.source, note: next.note, late_reason: late ? (row.lateReason ?? '').trim() : '', ...stamp(),
    }, { onConflict: 'person_id,day' })
    if (error) { set((x) => { const att = { ...x.att }; if (prev) att[k] = prev; else delete att[k]; return { att } }); return { ok: false, error: err(error) } }
    set((x) => ({ att: { ...x.att, [k]: { ...next, lateReason: late ? (row.lateReason ?? '').trim() : '', createdAt: prev?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() } } }))
    return { ok: true }
  },
  clearDay: async (personId, day) => {
    if (get().isLocked(day)) return { ok: false, error: LOCKED_MSG }
    const k = key(personId, day), prev = get().att[k]
    if (!prev) return { ok: true }
    set((x) => { const att = { ...x.att }; delete att[k]; return { att } })
    const { error } = await supabase.from('sv_attendance').delete().eq('person_id', personId).eq('day', day)
    if (error) { set((x) => ({ att: { ...x.att, [k]: prev } })); return { ok: false, error: err(error) } }
    return { ok: true }
  },
  setVehicleDay: async (vehicleId, day, row) => {
    if (get().isLocked(day)) return { ok: false, error: LOCKED_MSG }
    if (get().isFuture(day)) return { ok: false, error: FUTURE_MSG }
    const late = get().needsReason(day)
    if (late && !lateOk(row.lateReason)) return { ok: false, error: LATE_MSG }
    const pid = get().projectId!
    const k = key(vehicleId, day), prev = get().vdays[k]
    const next: SvVehicleDay = { vehicleId, day, source: 'manual', ...row }
    set((x) => ({ vdays: { ...x.vdays, [k]: next } }))
    const { error } = await supabase.from('sv_vehicle_days').upsert({ master_project_id: pid, vehicle_id: vehicleId, day, status: next.status, hours: next.hours, km: next.km, source: 'manual', note: next.note, late_reason: late ? (row.lateReason ?? '').trim() : '', ...stamp() }, { onConflict: 'vehicle_id,day' })
    if (error) { set((x) => { const vdays = { ...x.vdays }; if (prev) vdays[k] = prev; else delete vdays[k]; return { vdays } }); return { ok: false, error: err(error) } }
    return { ok: true }
  },
  clearVehicleDay: async (vehicleId, day) => {
    if (get().isLocked(day)) return { ok: false, error: LOCKED_MSG }
    const k = key(vehicleId, day), prev = get().vdays[k]
    if (!prev) return { ok: true }
    set((x) => { const vdays = { ...x.vdays }; delete vdays[k]; return { vdays } })
    const { error } = await supabase.from('sv_vehicle_days').delete().eq('vehicle_id', vehicleId).eq('day', day)
    if (error) { set((x) => ({ vdays: { ...x.vdays, [k]: prev } })); return { ok: false, error: err(error) } }
    return { ok: true }
  },

  savePerson: async (p) => {
    const pid = get().projectId!
    const q = p.id ? supabase.from('sv_people').update(fromPerson(p)).eq('id', p.id).select().single() : supabase.from('sv_people').insert({ master_project_id: pid, ...fromPerson(p) }).select().single()
    const { data, error } = await q
    if (error || !data) return { ok: false, error: err(error) ?? 'ذخیره نشد' }
    const row = toPerson(data as Row)
    set((x) => ({ people: p.id ? x.people.map((o) => (o.id === row.id ? row : o)) : [...x.people, row].sort((a, b) => Number(b.active) - Number(a.active) || a.fullName.localeCompare(b.fullName, 'fa')) }))
    return { ok: true }
  },
  deletePerson: async (id) => {
    const { error } = await supabase.from('sv_people').delete().eq('id', id)
    if (error) return { ok: false, error: err(error) }
    set((x) => ({ people: x.people.filter((o) => o.id !== id), att: Object.fromEntries(Object.entries(x.att).filter(([, a]) => a.personId !== id)), vehicles: x.vehicles.map((v) => (v.personId === id ? { ...v, personId: null } : v)) }))
    return { ok: true }
  },
  saveVehicle: async (v) => {
    const pid = get().projectId!
    const q = v.id ? supabase.from('sv_vehicles').update(fromVehicle(v)).eq('id', v.id).select().single() : supabase.from('sv_vehicles').insert({ master_project_id: pid, ...fromVehicle(v) }).select().single()
    const { data, error } = await q
    if (error || !data) return { ok: false, error: err(error) ?? 'ذخیره نشد' }
    const row = toVehicle(data as Row)
    set((x) => ({ vehicles: v.id ? x.vehicles.map((o) => (o.id === row.id ? row : o)) : [...x.vehicles, row] }))
    return { ok: true }
  },
  deleteVehicle: async (id) => {
    const { error } = await supabase.from('sv_vehicles').delete().eq('id', id)
    if (error) return { ok: false, error: err(error) }
    set((x) => ({ vehicles: x.vehicles.filter((o) => o.id !== id), vdays: Object.fromEntries(Object.entries(x.vdays).filter(([, a]) => a.vehicleId !== id)) }))
    return { ok: true }
  },
  saveSettings: async (x) => {
    const pid = get().projectId!
    const { error } = await supabase.from('sv_settings').upsert({ master_project_id: pid, duty_days: x.dutyDays, standard_hours: x.standardHours, overtime_min: x.overtimeMin, overtime_max: x.overtimeMax, vehicle_hours: x.vehicleHours, entry_grace_days: x.entryGraceDays, ...stamp() }, { onConflict: 'master_project_id' })
    if (error) return { ok: false, error: err(error) }
    set({ settings: x })
    return { ok: true }
  },
  saveGuest: async (g) => {
    if (get().isLocked(g.day) || (g.id && get().isLocked(get().guests.find((o) => o.id === g.id)?.day ?? ''))) return { ok: false, error: LOCKED_MSG }
    if (get().isFuture(g.day)) return { ok: false, error: FUTURE_MSG }
    const late = get().needsReason(g.day)
    if (late && !lateOk(g.lateReason)) return { ok: false, error: LATE_MSG }
    const pid = get().projectId!
    const row = { day: g.day, guest_name: g.guestName.trim(), organization: g.organization.trim(), host: g.host.trim(), breakfast: g.breakfast, lunch: g.lunch, dinner: g.dinner, note: g.note, late_reason: late ? (g.lateReason ?? '').trim() : '' }
    const { data, error } = g.id ? await supabase.from('sv_guest_meals').update(row).eq('id', g.id).select().single() : await supabase.from('sv_guest_meals').insert({ master_project_id: pid, ...row }).select().single()
    if (error || !data) return { ok: false, error: err(error) ?? 'ذخیره نشد' }
    const saved = toGuest(data as Row)
    set((x) => ({ guests: (g.id ? x.guests.map((o) => (o.id === saved.id ? saved : o)) : [...x.guests, saved]).sort((a, b) => a.day.localeCompare(b.day)) }))
    return { ok: true }
  },
  deleteGuest: async (id) => {
    if (get().isLocked(get().guests.find((o) => o.id === id)?.day ?? '')) return { ok: false, error: LOCKED_MSG }
    const { error } = await supabase.from('sv_guest_meals').delete().eq('id', id)
    if (error) return { ok: false, error: err(error) }
    set((x) => ({ guests: x.guests.filter((o) => o.id !== id) }))
    return { ok: true }
  },
  clockCount: async (from, to) => {
    const pid = get().projectId
    if (!pid) return 0
    const { count } = await supabase.from('sv_clock_events').select('id', { count: 'exact', head: true }).eq('master_project_id', pid).gte('at', from + 'T00:00:00+03:30').lte('at', to + 'T23:59:59+03:30')
    return count ?? 0
  },
  applyClock: async (from, to) => {
    const pid = get().projectId!
    const { data, error } = await supabase.rpc('sv_apply_clock', { p_project: pid, p_from: from, p_to: to })
    if (error) return { ok: false, error: err(error) }
    await get().loadRange(from, to, true)
    const d = (data ?? {}) as { people?: number; vehicles?: number }
    return { ok: true, people: d.people ?? 0, vehicles: d.vehicles ?? 0 }
  },
}))

export const attKey = key
