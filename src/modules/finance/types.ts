export interface FinBudget {
  id: string
  masterProjectId: string
  approvedBudget: number
  currency: string
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

export type FinContractStatus = 'draft' | 'active' | 'completed' | 'terminated'

export const FIN_CONTRACT_STATUSES: FinContractStatus[] = ['draft', 'active', 'completed', 'terminated']

export const FIN_CONTRACT_STATUS_LABEL_FA: Record<FinContractStatus, string> = {
  draft: 'پیش‌نویس',
  active: 'فعال',
  completed: 'تکمیل‌شده',
  terminated: 'فسخ‌شده',
}

export interface FinContract {
  id: string
  masterProjectId: string
  contractNumber: string
  title: string
  contractorOrgId: string | null
  contractValue: number
  currency: string
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

export interface FinPaymentCertificate {
  id: string
  contractId: string
  certificateNumber: string
  certificateDate: string
  grossAmount: number
  adjustments: number
  deductions: number
  retentionAmount: number
  advanceRecoveryAmount: number
  /** Generated column: gross + adjustments - deductions - retention - advanceRecovery. Never hand-entered. */
  payableAmount: number
  certifiedAmount: number | null
  paidAmount: number
  status: FinCertificateStatus
  submittedDate: string | null
  certifiedDate: string | null
  paidDate: string | null
  notes: string
  createdAt: string
  updatedAt: string
}
