import { expiringGuarantees, paymentAgingDays, staleClaims, todayIso, upcomingRetentionReleases } from './financeCalc'
import type { FinClaim, FinContract, FinGuarantee, FinPaymentCertificate, FinRetentionRelease } from '../types'

export interface FinNotification {
  id: string
  severity: 'bad' | 'warn' | 'info'
  days: number
  daysLabel: string
  text: string
  /** Tab to jump to when this notification is clicked. */
  tab: 'guarantees' | 'certificates' | 'claims' | 'retention'
  /** Master project this notification's underlying contract belongs to, so the topbar project picker can be set too. */
  masterProjectId: string | null
}

/**
 * Unified alert feed for the header bell — module-wide (not scoped to the currently-selected
 * project), since the whole point of a notification center is surfacing things across every
 * project without the user having to click into each one. Guarantee-expiry is deliberately first:
 * per spec, this is the module's explicit "آلارم" case.
 */
export function buildFinanceNotifications(
  contracts: FinContract[],
  certificates: FinPaymentCertificate[],
  guarantees: FinGuarantee[],
  claims: FinClaim[],
  retentionReleases: FinRetentionRelease[],
  today = todayIso(),
): FinNotification[] {
  const projectOf = (contractId: string) => contracts.find((c) => c.id === contractId)?.masterProjectId ?? null
  const items: FinNotification[] = []

  for (const g of expiringGuarantees(guarantees, today)) {
    const daysLeft = g.expiryDate ? Math.round((Date.parse(g.expiryDate) - Date.parse(today)) / 86400000) : 0
    items.push({
      id: `guarantee-${g.id}`,
      severity: daysLeft <= 15 ? 'bad' : 'warn',
      days: daysLeft,
      daysLabel: daysLeft <= 0 ? 'منقضی‌شده' : `${daysLeft.toLocaleString('fa-IR')} روز مانده`,
      text: `ضمانت‌نامه شماره ${g.number || '—'} در حال انقضا است`,
      tab: 'guarantees',
      masterProjectId: projectOf(g.contractId),
    })
  }

  for (const c of certificates) {
    const aging = paymentAgingDays(c, today)
    if (aging != null && aging > 30) {
      items.push({
        id: `certificate-${c.id}`,
        severity: aging > 60 ? 'bad' : 'warn',
        days: aging,
        daysLabel: `${aging.toLocaleString('fa-IR')} روز معطلی`,
        text: `پرداخت صورت‌وضعیت شماره ${c.certificateNumber || '—'} به تاخیر افتاده است`,
        tab: 'certificates',
        masterProjectId: projectOf(c.contractId),
      })
    }
  }

  for (const cl of staleClaims(claims, today)) {
    const daysOpen = Math.round((Date.parse(today) - Date.parse(cl.submittedDate)) / 86400000)
    items.push({
      id: `claim-${cl.id}`,
      severity: 'warn',
      days: daysOpen,
      daysLabel: `${daysOpen.toLocaleString('fa-IR')} روز بدون تصمیم`,
      text: `کلایم شماره ${cl.claimNumber || '—'} هنوز بررسی نشده است`,
      tab: 'claims',
      masterProjectId: projectOf(cl.contractId),
    })
  }

  for (const r of upcomingRetentionReleases(retentionReleases, today)) {
    const daysLeft = r.plannedDate ? Math.round((Date.parse(r.plannedDate) - Date.parse(today)) / 86400000) : 0
    items.push({
      id: `retention-${r.id}`,
      severity: daysLeft <= 15 ? 'bad' : 'info',
      days: daysLeft,
      daysLabel: daysLeft <= 0 ? 'سررسیدشده' : `${daysLeft.toLocaleString('fa-IR')} روز مانده`,
      text: `موعد آزادسازی حسن انجام کار نزدیک است`,
      tab: 'retention',
      masterProjectId: projectOf(r.contractId),
    })
  }

  return items.sort((a, b) => a.days - b.days)
}
