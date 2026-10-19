import { fa } from '../../execution/components/common'
import type { Classified, Reconciliation } from './delay'
import { noticeState } from './delay'

/** Module-internal alerts shown on the dashboard: what needs a decision or an action now. */
export interface Alert { /** stable id: one issue can be raised per key */ key: string; /** schedule slip in days when the alert is about a delay */ days?: number; level: 'bad' | 'warn' | 'info'; text: string; tab: 'delay' | 'analysis' | 'health' | 'links' | 'edit' }

export function buildAlerts(o: {
  today: string; recon: Reconciliation | null; classified: Classified[]
  criticalOverdue: number; negativeFloat: number; unlinkedStarted: number; live: boolean; qualityBad: number
}): Alert[] {
  const out: Alert[] = []
  const r = o.recon
  if (r && r.totalSlip != null && r.contractorDelay != null && r.contractorDelay > 0) out.push({ key: 'delay-contractor', days: r.contractorDelay, level: 'bad', tab: 'delay', text: `پیش‌بینی ${fa(r.contractorDelay)} روز بعد از تاریخ قراردادی اصلاح‌شده است${r.ldAmount > 0 ? `؛ جریمهٔ تخمینی ${fa(Math.round(r.ldAmount))} ریال` : ''}.` })
  else if (r && r.totalSlip != null && r.totalSlip > 0) out.push({ key: 'delay-covered', level: 'info', tab: 'delay', text: `پیش‌بینی ${fa(r.totalSlip)} روز از تاریخ قراردادی دیرتر است، اما تمدیدهای تأییدشده آن را پوشش می‌دهد.` })
  if (o.criticalOverdue > 0) out.push({ key: 'critical-overdue', level: 'bad', tab: 'analysis', text: `${fa(o.criticalOverdue)} فعالیت بحرانی از تاریخ برنامه‌ای خود عقب است.` })
  if (o.negativeFloat > 0) out.push({ key: 'negative-float', level: 'bad', tab: 'health', text: `${fa(o.negativeFloat)} فعالیت شناوری منفی دارد (قید یا تاریخ تعهدی رعایت‌نشدنی).` })
  const lost = o.classified.filter((c) => noticeState(c, o.today).state === 'lost' && c.event.status !== 'rejected')
  if (lost.length) out.push({ key: 'notice-lost', level: 'bad', tab: 'delay', text: `مهلت اخطار ${fa(lost.length)} رویداد تاخیر گذشته و اخطاری ثبت نشده؛ ادعای تمدید آن‌ها در خطر است.` })
  const soon = o.classified.filter((c) => { const n = noticeState(c, o.today); return n.state === 'due' && n.daysLeft != null && n.daysLeft <= 5 })
  if (soon.length) out.push({ key: 'notice-soon', level: 'warn', tab: 'delay', text: `${fa(soon.length)} رویداد تاخیر ظرف ۵ روز آینده مهلت اخطار دارد.` })
  const pending = o.classified.filter((c) => c.cls === 'pending')
  if (pending.length) out.push({ key: 'impact-pending', level: 'warn', tab: 'delay', text: `اثر ${fa(pending.length)} رویداد تاخیر هنوز اندازه‌گیری نشده است.` })
  if (r && r.unexplained != null && r.unexplained > 0) out.push({ key: 'unexplained', level: 'warn', tab: 'delay', text: `${fa(r.unexplained)} روز از تاخیر کل با هیچ رویدادی توضیح داده نشده است.` })
  if (o.live && o.unlinkedStarted > 0) out.push({ key: 'unlinked-started', level: 'warn', tab: 'links', text: `${fa(o.unlinkedStarted)} فعالیت شروع‌شده به فعالیت اجرایی وصل نیست؛ وضعیت زنده آن‌ها را تأیید نمی‌کند.` })
  if (o.qualityBad > 0) out.push({ key: 'quality', level: 'warn', tab: 'health', text: `${fa(o.qualityBad)} کنترل کیفیت برنامه رد شده است.` })
  return out
}
