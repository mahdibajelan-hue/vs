export interface AlertThresholds {
  /** SPI below this raises a schedule alert */
  spiWarn: number; spiCritical: number
  /** probability of finishing on time below this raises a forecast alert */
  onTimeWarn: number; onTimeCritical: number
  /** an overdue unreviewed report (days) */
  reviewOverdueDays: number
  /** share of weekly commitments not met */
  ppcWarn: number
  /** prerequisites needed within this many days but not ready */
  readinessHorizonDays: number
  /** measured/billed gap that raises a finance alert (fraction of approved) */
  financeGapPct: number
}
export const DEFAULT_THRESHOLDS: AlertThresholds = { spiWarn: 0.95, spiCritical: 0.8, onTimeWarn: 0.6, onTimeCritical: 0.3, reviewOverdueDays: 2, ppcWarn: 0.7, readinessHorizonDays: 14, financeGapPct: 0.1 }
export type AlertSeverity = 'info' | 'warn' | 'critical'
export interface Alert {
  id: string; severity: AlertSeverity; area: 'engineering' | 'schedule' | 'forecast' | 'readiness' | 'review' | 'commitment' | 'finance' | 'quality' | 'blocker'
  title: string
  /** the rule and numbers that triggered it — always shown with the alert */
  reason: string
  /** where to drill down */
  ref?: { kind: 'activity' | 'report' | 'lookahead' | 'ledger' | 'issue'; id: string }
}
export interface AlertInput {
  today: string
  spi: number | null
  forecasts: { activityId: string; title: string; onTimeProb: number | null; lateRisk: string; unreliable: boolean }[]
  readiness: { activityId: string; title: string; state: string; blockers: string[]; earliestStart: string | null; plannedStart: string | null }[]
  overdueReports: { id: string; reportNo: string; days: number }[]
  ppcLast: { ppc: number | null; committed: number } | null
  ledger: { activityId: string; title: string; approved: number; toMeasure: number; mismatches: number }[]
  dataQualityLow: { activityId: string; title: string }[]
  engineering?: { criticalOverdue: { id: string; code: string; days: number }[]; notReady: { activityId: string; title: string; reason: string }[]; projectSlipDays: number | null }
}
export function buildAlerts(i: AlertInput, t: AlertThresholds = DEFAULT_THRESHOLDS): Alert[] {
  const out: Alert[] = []
  if (i.spi != null && i.spi < t.spiWarn) out.push({ id: 'spi', severity: i.spi < t.spiCritical ? 'critical' : 'warn', area: 'schedule', title: 'پیشرفت واقعی از برنامه عقب است', reason: `شاخص عملکرد برنامه (واقعی ÷ برنامه‌ای) = ${i.spi.toFixed(2)} ؛ آستانهٔ هشدار ${t.spiWarn} و بحرانی ${t.spiCritical}.` })
  for (const f of i.forecasts) if (!f.unreliable && f.onTimeProb != null && f.onTimeProb < t.onTimeWarn) out.push({ id: `fc:${f.activityId}`, severity: f.onTimeProb < t.onTimeCritical ? 'critical' : 'warn', area: 'forecast', title: `خطر تأخیر: ${f.title}`, reason: `احتمال اتمام در موعد برنامه ${Math.round(f.onTimeProb * 100)}٪ است (آستانه ${Math.round(t.onTimeWarn * 100)}٪) بر پایهٔ نرخ اخیر.`, ref: { kind: 'activity', id: f.activityId } })
  for (const r of i.readiness) {
    if (r.state === 'blocked') out.push({ id: `rb:${r.activityId}`, severity: 'critical', area: 'blocker', title: `فعالیت مسدود: ${r.title}`, reason: r.blockers.join('؛ '), ref: { kind: 'activity', id: r.activityId } })
    else if (r.state === 'at_risk' && r.plannedStart) {
      const days = Math.round((new Date(`${r.plannedStart}T00:00:00Z`).getTime() - new Date(`${i.today}T00:00:00Z`).getTime()) / 86400000)
      if (days >= 0 && days <= t.readinessHorizonDays) out.push({ id: `rr:${r.activityId}`, severity: 'warn', area: 'readiness', title: `پیش‌نیاز آماده‌نشده تا ${days} روز دیگر: ${r.title}`, reason: `شروع برنامه‌ای ${r.plannedStart}؛ پیش‌نیازها هنوز کامل نیستند.`, ref: { kind: 'activity', id: r.activityId } })
    }
  }
  for (const r of i.overdueReports) if (r.days > t.reviewOverdueDays) out.push({ id: `rv:${r.id}`, severity: 'warn', area: 'review', title: `گزارش ${r.reportNo} بررسی نشده`, reason: `${r.days} روز از ارسال گذشته (آستانه ${t.reviewOverdueDays} روز).`, ref: { kind: 'report', id: r.id } })
  if (i.ppcLast && i.ppcLast.ppc != null && i.ppcLast.ppc < t.ppcWarn) out.push({ id: 'ppc', severity: 'warn', area: 'commitment', title: 'تحقق تعهدات هفتهٔ گذشته پایین است', reason: `PPC = ${Math.round(i.ppcLast.ppc * 100)}٪ از ${i.ppcLast.committed} تعهد (آستانه ${Math.round(t.ppcWarn * 100)}٪).` })
  for (const l of i.ledger) {
    if (l.mismatches > 0) out.push({ id: `fl:${l.activityId}`, severity: 'critical', area: 'finance', title: `مغایرت مقادیر اجرایی/صورت‌وضعیت: ${l.title}`, reason: `${l.mismatches} مورد مغایرت در زنجیرهٔ تأییدشده ← اندازه‌گیری‌شده ← صورت‌وضعیت ← پرداخت.`, ref: { kind: 'ledger', id: l.activityId } })
    else if (l.approved > 0 && l.toMeasure / l.approved > t.financeGapPct) out.push({ id: `fm:${l.activityId}`, severity: 'info', area: 'finance', title: `مقدار تأییدشدهٔ اندازه‌گیری‌نشده: ${l.title}`, reason: `${Math.round((l.toMeasure / l.approved) * 100)}٪ از مقدار تأییدشده هنوز اندازه‌گیری نشده است (آستانه ${Math.round(t.financeGapPct * 100)}٪).`, ref: { kind: 'ledger', id: l.activityId } })
  }
  for (const q of i.dataQualityLow) out.push({ id: `dq:${q.activityId}`, severity: 'info', area: 'quality', title: `داده‌ٔ کم‌اعتماد برای بهره‌وری: ${q.title}`, reason: 'تعداد یا کیفیت لاگ‌های اکیپ برای برآورد قابل‌اتکا کافی نیست.', ref: { kind: 'activity', id: q.activityId } })
  const g = i.engineering
  if (g) {
    for (const d of g.criticalOverdue) out.push({ id: `ed:${d.id}`, severity: 'critical', area: 'engineering', title: `مدرک بحرانی عقب‌افتاده: ${d.code}`, reason: `${d.days} روز از تاریخ برنامه‌ای تأیید گذشته و هنوز تأیید نشده است.` })
    for (const a of g.notReady) out.push({ id: `en:${a.activityId}`, severity: 'critical', area: 'engineering', title: `فعالیت غیرآمادهٔ اجرا: ${a.title}`, reason: a.reason, ref: { kind: 'activity', id: a.activityId } })
    if (g.projectSlipDays != null && g.projectSlipDays > 0) out.push({ id: 'eslip', severity: g.projectSlipDays > 14 ? 'critical' : 'warn', area: 'engineering', title: 'تأخیر پیش‌بینی‌شدهٔ مدارک بر تاریخ تکمیل پروژه اثر می‌گذارد', reason: `بیشترین اثر محاسبه‌شده بر تاریخ تکمیل: ${g.projectSlipDays} روز (پس از کسر شناوری).` })
  }
  const rank = { critical: 0, warn: 1, info: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}
