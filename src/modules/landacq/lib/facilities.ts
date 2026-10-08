import type { Activity, Crossing, CrossingType, Parcel, PermitStatus, StationType, UndertakingStatus } from '../types'
import { addDays, diffDays, fmtKm } from './dates'
import { activityDateAt } from './schedule'
import { faNum, fmtDate, fmtMoney } from './fa'

export const STATION_TYPES: StationType[] = ['pig_launcher', 'line_valve', 'branch_valve', 'pressure_control', 'pressure_reduction', 'cp_station', 'pig_receiver']
export const STATION: Record<StationType, { label: string; short: string; color: string; areaM2: number }> = {
  pig_launcher: { label: 'ایستگاه ارسال توپک', short: 'PL', color: '#0ea5e9', areaM2: 3000 },
  line_valve: { label: 'ایستگاه شیر بین‌راهی', short: 'LV', color: '#14b886', areaM2: 900 },
  branch_valve: { label: 'ایستگاه شیر انشعاب', short: 'BV', color: '#c84cf0', areaM2: 1500 },
  pressure_control: { label: 'ایستگاه کنترل فشار', short: 'PC', color: '#f97316', areaM2: 4000 },
  pressure_reduction: { label: 'ایستگاه تقلیل فشار', short: 'PR', color: '#eab308', areaM2: 4000 },
  cp_station: { label: 'ایستگاه حفاظت کاتدیک', short: 'CP', color: '#ec4899', areaM2: 400 },
  pig_receiver: { label: 'ایستگاه دریافت توپک', short: 'RC', color: '#6366f1', areaM2: 3000 },
}
export const stationLabel = (p: Pick<Parcel, 'stationType'>): string => (p.stationType ? STATION[p.stationType].label : 'ایستگاه')
/** What a parcel is called in lists: its km range, or «ایستگاه … KM x». */
export const parcelHeading = (p: Pick<Parcel, 'kind' | 'stationType' | 'kmStart' | 'kmEnd'>): string => (p.kind === 'station' ? `${stationLabel(p)} · KM ${fmtKm(p.kmStart)}` : `KM ${fmtKm(p.kmStart)} – ${fmtKm(p.kmEnd)}`)

export const CROSSING_TYPES: CrossingType[] = ['dirt_road', 'paved_road', 'railway', 'river', 'floodway', 'qanat', 'water_canal', 'water_pipe', 'oil_pipe', 'gas_pipe', 'hv_cable']
export const CROSSING: Record<CrossingType, { label: string; color: string; leadDays: number; custodian: string }> = {
  dirt_road: { label: 'جادهٔ خاکی', color: '#a16207', leadDays: 30, custodian: 'اداره راه / دهیاری' },
  paved_road: { label: 'جادهٔ آسفالته', color: '#64748b', leadDays: 60, custodian: 'اداره کل راه و شهرسازی' },
  railway: { label: 'راه‌آهن', color: '#7c3aed', leadDays: 120, custodian: 'راه‌آهن جمهوری اسلامی ایران' },
  river: { label: 'رودخانه', color: '#0284c7', leadDays: 60, custodian: 'شرکت آب منطقه‌ای' },
  floodway: { label: 'مسیل', color: '#0891b2', leadDays: 45, custodian: 'شرکت آب منطقه‌ای' },
  qanat: { label: 'قنات', color: '#0d9488', leadDays: 45, custodian: 'امور آب / مالکین قنات' },
  water_canal: { label: 'کانال آب', color: '#2563eb', leadDays: 45, custodian: 'شرکت آب منطقه‌ای / سازمان جهاد کشاورزی' },
  water_pipe: { label: 'لولهٔ انتقال آب', color: '#0369a1', leadDays: 60, custodian: 'شرکت آب و فاضلاب' },
  oil_pipe: { label: 'لولهٔ انتقال نفت', color: '#92400e', leadDays: 90, custodian: 'شرکت خطوط لوله و مخابرات نفت' },
  gas_pipe: { label: 'لولهٔ انتقال گاز', color: '#ea580c', leadDays: 90, custodian: 'شرکت ملی گاز ایران' },
  hv_cable: { label: 'کابل فشار قوی برق', color: '#dc2626', leadDays: 90, custodian: 'شرکت برق منطقه‌ای / توانیر' },
}
export const PERMIT_LABEL: Record<PermitStatus, string> = { not_started: 'درخواست نشده', requested: 'درخواست شد', under_review: 'در حال بررسی متولی', conditional: 'مشروط (منتظر تعهدنامه / هزینه)', issued: 'مجوز صادر شد', rejected: 'رد شد' }
export const UNDERTAKING_LABEL: Record<UndertakingStatus, string> = { pending: 'تنظیم نشده', submitted: 'ارسال شد، منتظر امضا', signed: 'امضا و تحویل شد' }

export interface CrossingAlarm {
  key: string
  level: 'critical' | 'warn'
  text: string
}
export interface CrossingState {
  needBy: string | null
  /** The last day the permit request can go out and still be ready by `needBy`. */
  requestBy: string | null
  steps: { key: string; label: string; applicable: boolean; done: boolean }[]
  progress: number
  ready: boolean
  feeRemaining: number
  alarms: CrossingAlarm[]
  status: 'ready' | 'ok' | 'attention' | 'critical'
  next: { date: string; label: string } | null
}

/**
 * Where a crossing stands. The first construction activity that reaches its chainage sets `needBy`; the permit lead time of the
 * facility type (railways and HV cables take longest) says when the request had to go out; missing it, an unsigned undertaking,
 * an unpaid fee or a rejection become alarms.
 */
export function crossingState(c: Crossing, activities: Activity[], today: string): CrossingState {
  const hits = activities.filter((a) => a.kmStart <= c.km && a.kmEnd >= c.km)
  const needBy = hits.length ? hits.map((a) => activityDateAt(a, c.km)).sort()[0] : null
  const requestBy = needBy ? addDays(needBy, -CROSSING[c.crossingType].leadDays) : null
  const issued = c.permitStatus === 'issued'
  const feeRemaining = c.feeRequired ? Math.max(0, c.feeAmount - c.feePaidAmount) : 0
  const steps = [
    { key: 'identified', label: 'شناسایی عبور', applicable: true, done: true },
    { key: 'requested', label: 'درخواست مجوز', applicable: true, done: c.permitStatus !== 'not_started' },
    { key: 'review', label: 'بررسی و شرایط متولی', applicable: true, done: ['conditional', 'issued'].includes(c.permitStatus) },
    { key: 'undertaking', label: 'تعهدنامه', applicable: c.undertakingRequired, done: c.undertakingStatus === 'signed' },
    { key: 'fee', label: 'پرداخت هزینهٔ عبور', applicable: c.feeRequired, done: feeRemaining === 0 },
    { key: 'permit', label: 'صدور مجوز', applicable: true, done: issued },
  ]
  const applicable = steps.filter((s) => s.applicable)
  const progress = applicable.filter((s) => s.done).length / applicable.length
  const ready = applicable.every((s) => s.done)
  const alarms: CrossingAlarm[] = []
  const nm = CROSSING[c.crossingType].label
  if (c.permitStatus === 'rejected') alarms.push({ key: 'rejected', level: 'critical', text: `درخواست مجوز عبور از ${nm} رد شده است؛ پیگیری حقوقی یا اصلاح طرح لازم است` })
  if (!ready && needBy) {
    const toNeed = diffDays(needBy, today)
    if (c.permitStatus === 'not_started' && requestBy) {
      const toReq = diffDays(requestBy, today)
      if (toReq < 0) alarms.push({ key: 'request_late', level: 'critical', text: `مهلت ارسال درخواست مجوز (${fmtDate(requestBy)}) گذشته و درخواستی ثبت نشده است (${faNum(-toReq)} روز؛ زمان معمول بررسی ${faNum(CROSSING[c.crossingType].leadDays)} روز)` })
      else if (toReq <= 14) alarms.push({ key: 'request_soon', level: 'warn', text: `درخواست مجوز تا ${fmtDate(requestBy)} (${faNum(toReq)} روز دیگر) باید ارسال شود` })
    }
    if (c.permitStatus !== 'not_started' && !issued && toNeed <= 14) alarms.push({ key: 'permit_late', level: toNeed < 0 ? 'critical' : 'warn', text: toNeed < 0 ? `فعالیت اجرایی از ${fmtDate(needBy)} به این عبور رسیده و مجوز صادر نشده است` : `فعالیت اجرایی ${faNum(toNeed)} روز دیگر به این عبور می‌رسد و مجوز هنوز صادر نشده` })
    if (c.undertakingRequired && c.undertakingStatus !== 'signed' && toNeed <= 30) alarms.push({ key: 'undertaking', level: toNeed <= 7 ? 'critical' : 'warn', text: `تعهدنامه ${UNDERTAKING_LABEL[c.undertakingStatus]}؛ تا نیاز اجرایی ${fmtDate(needBy)} باید تکمیل شود` })
    if (feeRemaining > 0 && toNeed <= 30) alarms.push({ key: 'fee', level: toNeed <= 7 ? 'critical' : 'warn', text: `هزینهٔ عبور پرداخت‌نشده: ${fmtMoney(feeRemaining)}` })
  }
  const status: CrossingState['status'] = ready ? 'ready' : alarms.some((a) => a.level === 'critical') ? 'critical' : alarms.length ? 'attention' : 'ok'
  const open = alarms.length ? alarms[0] : null
  const date = !ready ? (c.permitStatus === 'not_started' ? requestBy : needBy) : null
  const next = !ready && date ? { date, label: open ? open.text.slice(0, 80) : c.permitStatus === 'not_started' ? 'ارسال درخواست مجوز عبور' : 'تکمیل مجوز عبور' } : null
  return { needBy, requestBy, steps, progress, ready, feeRemaining, alarms, status, next }
}

export const CROSSING_STATUS_COLOR: Record<CrossingState['status'], string> = { ready: '#22c55e', ok: '#38bdf8', attention: '#f59e0b', critical: '#ef4444' }
export const CROSSING_STATUS_LABEL: Record<CrossingState['status'], string> = { ready: 'آماده اجرا', ok: 'در جریان', attention: 'نیازمند توجه', critical: 'بحرانی' }

export interface CrossingDraft {
  severity: 'critical' | 'high' | 'medium'
  description: string
  params: Record<string, unknown>
}
/** Written Issue / Risk for a crossing in trouble (nothing is sent from here). */
export function crossingDrafts(c: Crossing, st: CrossingState, today: string): { issue: CrossingDraft | null; risk: CrossingDraft | null } {
  const critical = st.alarms.filter((a) => a.level === 'critical')
  if (critical.length === 0 && st.alarms.length < 2) return { issue: null, risk: null }
  const sev: CrossingDraft['severity'] = critical.length ? 'critical' : 'high'
  const nm = `${CROSSING[c.crossingType].label}${c.name ? ` «${c.name}»` : ''}`
  const head = `عبور خط لوله از ${nm} در KM ${fmtKm(c.km)} (متولی: ${c.custodian || CROSSING[c.crossingType].custodian})`
  const list = st.alarms.map((a, i) => `${faNum(i + 1)}. ${a.text}`).join('\n')
  const state = `وضعیت: ${PERMIT_LABEL[c.permitStatus]}${c.permitNumber ? ` (شمارهٔ مجوز ${c.permitNumber})` : ''}${c.undertakingRequired ? ` · تعهدنامه: ${UNDERTAKING_LABEL[c.undertakingStatus]}` : ''}${c.feeRequired ? ` · هزینه: ${fmtMoney(c.feePaidAmount)} از ${fmtMoney(c.feeAmount)}` : ''}${st.needBy ? ` · نیاز اجرایی: ${fmtDate(st.needBy)}` : ''}`
  const todo = '۱. پیگیری حقوقی کتبی با متولی\n۲. تکمیل و تحویل تعهدنامهٔ مخصوص و پرداخت هزینهٔ عبور در صورت لزوم\n۳. هماهنگی با برنامهٔ اجرایی برای جابه‌جایی فعالیت یا اجرای موقت'
  const issueDesc = `${head}\n\nمشکلات:\n${list}\n\n${state}\n\nاقدام‌های پیشنهادی:\n${todo}`
  const riskDesc = `ریسک تأخیر اجرا به‌علت عبور از ${nm} (KM ${fmtKm(c.km)})\n\nعوامل:\n${list}\n\n${state}\n\nپیامد محتمل: توقف فعالیت اجرایی در محل عبور${st.needBy ? ` از ${fmtDate(st.needBy)}` : ''}.\n\nواکنش پیشنهادی:\n${todo}`
  void today
  return {
    issue: { severity: sev, description: issueDesc, params: { description: issueDesc, severity: sev, deadline_days: sev === 'critical' ? 3 : 7 } },
    risk: { severity: sev, description: riskDesc, params: { description: riskDesc, severity: sev, probability: sev === 'critical' ? 4 : 3, impact: c.crossingType === 'railway' || c.crossingType === 'hv_cable' ? 4 : 3 } },
  }
}
