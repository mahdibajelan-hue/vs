/** Shared multi-currency triple used across Contract/Certificate/Budget amounts (spec: every amount
 * is three independent values — rial amount, foreign-currency amount, FC rial-equivalent). */
export interface FxAmount {
  fcAmount: number
  fcCurrency: string
  exchangeRate: number
  /** Generated column: fcAmount * exchangeRate. Never hand-entered. */
  fcRialEquivalent: number
}

export interface FinBudget {
  id: string
  masterProjectId: string
  approvedBudget: number
  currency: string
  fx: FxAmount
  notes: string
  createdAt: string
  updatedAt: string
}

export interface FinBudgetChange {
  id: string
  masterProjectId: string
  changeDate: string
  amount: number
  reason: string
  createdBy: string | null
  createdAt: string
}

/** Project -> Annual Budget -> Year, deliberately distinct from FinBudget's Total Project Budget. */
export interface FinAnnualBudget {
  id: string
  masterProjectId: string
  /** Jalali year, e.g. 1403 — the module reports entirely in the Jalali calendar. */
  jalaliYear: number
  budgetAmount: number
  currency: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type FinContractStatus = 'draft' | 'active' | 'completed' | 'terminated'

export const FIN_CONTRACT_STATUSES: FinContractStatus[] = ['draft', 'active', 'completed', 'terminated']

export const FIN_CONTRACT_STATUS_LABEL_FA: Record<FinContractStatus, string> = {
  draft: 'پیش‌نویس',
  active: 'فعال',
  completed: 'تکمیل‌شده',
  terminated: 'فسخ‌شده',
}

export type FinContractRole = 'main_epc' | 'supervision_consultant' | 'mc' | 'tpi' | 'other'

export const FIN_CONTRACT_ROLES: FinContractRole[] = ['main_epc', 'supervision_consultant', 'mc', 'tpi', 'other']

export const FIN_CONTRACT_ROLE_LABEL_FA: Record<FinContractRole, string> = {
  main_epc: 'پیمانکار اصلی (EPC)',
  supervision_consultant: 'مشاور نظارت',
  mc: 'مدیریت طرح (MC)',
  tpi: 'بازرسی شخص ثالث (TPI)',
  other: 'سایر',
}

export const FIN_CONTRACT_ROLE_COLOR: Record<FinContractRole, string> = {
  main_epc: '#10b981',
  supervision_consultant: '#38bdf8',
  mc: '#a78bfa',
  tpi: '#f59e0b',
  other: '#64748b',
}

export interface FinContract {
  id: string
  masterProjectId: string
  contractNumber: string
  title: string
  contractRole: FinContractRole
  contractorOrgId: string | null
  contractValue: number
  currency: string
  fx: FxAmount
  advancePaymentPercent: number
  retentionPercent: number
  performanceGuaranteePercent: number
  startDate: string | null
  plannedCompletionDate: string | null
  status: FinContractStatus
  createdAt: string
  updatedAt: string
}

export interface FinContractAmendment {
  id: string
  contractId: string
  amendmentNumber: string
  amendmentDate: string
  amount: number
  reason: string
  createdBy: string | null
  createdAt: string
}

export type FinCertificateStatus = 'draft' | 'submitted' | 'under_review' | 'certified' | 'rejected' | 'paid' | 'partially_paid'

export const FIN_CERTIFICATE_STATUSES: FinCertificateStatus[] = ['draft', 'submitted', 'under_review', 'certified', 'rejected', 'paid', 'partially_paid']

export const FIN_CERTIFICATE_STATUS_LABEL_FA: Record<FinCertificateStatus, string> = {
  draft: 'پیش‌نویس',
  submitted: 'ارسال‌شده',
  under_review: 'در حال بررسی',
  certified: 'تاییدشده',
  rejected: 'ردشده',
  paid: 'پرداخت‌شده',
  partially_paid: 'پرداخت جزئی',
}

export const FIN_CERTIFICATE_STATUS_COLOR: Record<FinCertificateStatus, string> = {
  draft: '#64748b',
  submitted: '#38bdf8',
  under_review: '#f59e0b',
  certified: '#a78bfa',
  rejected: '#e74c3c',
  paid: '#2ecc71',
  partially_paid: '#f1c40f',
}

export type FinCertificateType = 'work' | 'adjustment'

export const FIN_CERTIFICATE_TYPES: FinCertificateType[] = ['work', 'adjustment']

export const FIN_CERTIFICATE_TYPE_LABEL_FA: Record<FinCertificateType, string> = {
  work: 'صورت‌وضعیت کارکرد',
  adjustment: 'صورت‌وضعیت تعدیل',
}

export interface FinPaymentCertificate {
  id: string
  contractId: string
  certificateNumber: string
  certificateDate: string
  certificateType: FinCertificateType
  /** Work Certificate this Adjustment Certificate adjusts — null for work certificates themselves. */
  relatedCertificateId: string | null
  /** Adjustment coefficient applied — only meaningful when certificateType === 'adjustment'. */
  adjustmentFactor: number | null
  grossAmount: number
  grossFx: FxAmount
  adjustments: number
  deductions: number
  retentionAmount: number
  advanceRecoveryAmount: number
  /** Generated column: gross + adjustments - deductions - retention - advanceRecovery (rial only — see schema.sql §21). Never hand-entered. */
  payableAmount: number
  certifiedAmount: number | null
  paidAmount: number
  paidFx: FxAmount
  status: FinCertificateStatus
  submittedDate: string | null
  certifiedDate: string | null
  paidDate: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export type FinGuaranteeType = 'bank_guarantee' | 'promissory_note' | 'other'

export const FIN_GUARANTEE_TYPES: FinGuaranteeType[] = ['bank_guarantee', 'promissory_note', 'other']

export const FIN_GUARANTEE_TYPE_LABEL_FA: Record<FinGuaranteeType, string> = {
  bank_guarantee: 'ضمانت‌نامه بانکی',
  promissory_note: 'سفته',
  other: 'سایر',
}

export type FinGuaranteeStatus = 'active' | 'released' | 'expired' | 'claimed'

export const FIN_GUARANTEE_STATUSES: FinGuaranteeStatus[] = ['active', 'released', 'expired', 'claimed']

export const FIN_GUARANTEE_STATUS_LABEL_FA: Record<FinGuaranteeStatus, string> = {
  active: 'معتبر',
  released: 'آزادشده',
  expired: 'منقضی‌شده',
  claimed: 'مطالبه‌شده',
}

export const FIN_GUARANTEE_STATUS_COLOR: Record<FinGuaranteeStatus, string> = {
  active: '#2ecc71',
  released: '#64748b',
  expired: '#e74c3c',
  claimed: '#f59e0b',
}

export interface FinGuarantee {
  id: string
  contractId: string
  guaranteeType: FinGuaranteeType
  number: string
  amount: number
  currency: string
  issueDate: string | null
  expiryDate: string | null
  status: FinGuaranteeStatus
  notes: string
  createdAt: string
  updatedAt: string
}

/**
 * سوابق پرداخت (Payment Records) — an itemized ledger of individual payment transactions
 * against a certificate. Record-keeping only: does NOT replace or feed back into
 * FinPaymentCertificate.paidAmount/paidDate, which every existing calc/dashboard still reads.
 */
export interface FinPayment {
  id: string
  certificateId: string
  paymentDate: string
  amount: number
  fx: FxAmount
  method: string
  referenceNumber: string
  notes: string
  createdAt: string
  updatedAt: string
}
