import type { FinBudget, FinBudgetChange, FinContract, FinContractAmendment, FinContractStatus, FinPaymentCertificate, FinCertificateStatus } from '../types'

interface FinBudgetRow {
  id: string
  master_project_id: string
  approved_budget: number
  currency: string
  notes: string
  created_at: string
  updated_at: string
}

export function finBudgetFromRow(r: FinBudgetRow): FinBudget {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    approvedBudget: Number(r.approved_budget),
    currency: r.currency,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function finBudgetToRow(masterProjectId: string, b: Partial<FinBudget>) {
  const row: Record<string, unknown> = { master_project_id: masterProjectId }
  if (b.approvedBudget !== undefined) row.approved_budget = b.approvedBudget
  if (b.currency !== undefined) row.currency = b.currency
  if (b.notes !== undefined) row.notes = b.notes
  return row
}

interface FinBudgetChangeRow {
  id: string
  master_project_id: string
  change_date: string
  amount: number
  reason: string
  created_by: string | null
  created_at: string
}

export function finBudgetChangeFromRow(r: FinBudgetChangeRow): FinBudgetChange {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    changeDate: r.change_date,
    amount: Number(r.amount),
    reason: r.reason,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export function finBudgetChangeToRow(masterProjectId: string, c: Partial<FinBudgetChange>) {
  const row: Record<string, unknown> = { master_project_id: masterProjectId }
  if (c.changeDate !== undefined) row.change_date = c.changeDate
  if (c.amount !== undefined) row.amount = c.amount
  if (c.reason !== undefined) row.reason = c.reason
  return row
}

interface FinContractRow {
  id: string
  master_project_id: string
  contract_number: string
  title: string
  contractor_org_id: string | null
  contract_value: number
  currency: string
  advance_payment_percent: number
  retention_percent: number
  performance_guarantee_percent: number
  start_date: string | null
  planned_completion_date: string | null
  status: string
  created_at: string
  updated_at: string
}

export function finContractFromRow(r: FinContractRow): FinContract {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    contractNumber: r.contract_number,
    title: r.title,
    contractorOrgId: r.contractor_org_id,
    contractValue: Number(r.contract_value),
    currency: r.currency,
    advancePaymentPercent: Number(r.advance_payment_percent),
    retentionPercent: Number(r.retention_percent),
    performanceGuaranteePercent: Number(r.performance_guarantee_percent),
    startDate: r.start_date,
    plannedCompletionDate: r.planned_completion_date,
    status: r.status as FinContractStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** masterProjectId is only written when provided (insert) — omit it on update so it's never overwritten to a blank value. */
export function finContractToRow(masterProjectId: string | null, c: Partial<FinContract>) {
  const row: Record<string, unknown> = {}
  if (masterProjectId) row.master_project_id = masterProjectId
  if (c.contractNumber !== undefined) row.contract_number = c.contractNumber
  if (c.title !== undefined) row.title = c.title
  if (c.contractorOrgId !== undefined) row.contractor_org_id = c.contractorOrgId || null
  if (c.contractValue !== undefined) row.contract_value = c.contractValue
  if (c.currency !== undefined) row.currency = c.currency
  if (c.advancePaymentPercent !== undefined) row.advance_payment_percent = c.advancePaymentPercent
  if (c.retentionPercent !== undefined) row.retention_percent = c.retentionPercent
  if (c.performanceGuaranteePercent !== undefined) row.performance_guarantee_percent = c.performanceGuaranteePercent
  if (c.startDate !== undefined) row.start_date = c.startDate || null
  if (c.plannedCompletionDate !== undefined) row.planned_completion_date = c.plannedCompletionDate || null
  if (c.status !== undefined) row.status = c.status
  return row
}

interface FinContractAmendmentRow {
  id: string
  contract_id: string
  amendment_number: string
  amendment_date: string
  amount: number
  reason: string
  created_by: string | null
  created_at: string
}

export function finContractAmendmentFromRow(r: FinContractAmendmentRow): FinContractAmendment {
  return {
    id: r.id,
    contractId: r.contract_id,
    amendmentNumber: r.amendment_number,
    amendmentDate: r.amendment_date,
    amount: Number(r.amount),
    reason: r.reason,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }
}

export function finContractAmendmentToRow(contractId: string, a: Partial<FinContractAmendment>) {
  const row: Record<string, unknown> = { contract_id: contractId }
  if (a.amendmentNumber !== undefined) row.amendment_number = a.amendmentNumber
  if (a.amendmentDate !== undefined) row.amendment_date = a.amendmentDate
  if (a.amount !== undefined) row.amount = a.amount
  if (a.reason !== undefined) row.reason = a.reason
  return row
}

interface FinPaymentCertificateRow {
  id: string
  contract_id: string
  certificate_number: string
  certificate_date: string
  gross_amount: number
  adjustments: number
  deductions: number
  retention_amount: number
  advance_recovery_amount: number
  payable_amount: number
  certified_amount: number | null
  paid_amount: number
  status: string
  submitted_date: string | null
  certified_date: string | null
  paid_date: string | null
  notes: string
  created_at: string
  updated_at: string
}

export function finPaymentCertificateFromRow(r: FinPaymentCertificateRow): FinPaymentCertificate {
  return {
    id: r.id,
    contractId: r.contract_id,
    certificateNumber: r.certificate_number,
    certificateDate: r.certificate_date,
    grossAmount: Number(r.gross_amount),
    adjustments: Number(r.adjustments),
    deductions: Number(r.deductions),
    retentionAmount: Number(r.retention_amount),
    advanceRecoveryAmount: Number(r.advance_recovery_amount),
    payableAmount: Number(r.payable_amount),
    certifiedAmount: r.certified_amount == null ? null : Number(r.certified_amount),
    paidAmount: Number(r.paid_amount),
    status: r.status as FinCertificateStatus,
    submittedDate: r.submitted_date,
    certifiedDate: r.certified_date,
    paidDate: r.paid_date,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

// payable_amount is never written — it's a Postgres generated column, always derived.
// contractId is only written when provided (insert) — omit it on update so it's never overwritten to a blank value.
export function finPaymentCertificateToRow(contractId: string | null, c: Partial<FinPaymentCertificate>) {
  const row: Record<string, unknown> = {}
  if (contractId) row.contract_id = contractId
  if (c.certificateNumber !== undefined) row.certificate_number = c.certificateNumber
  if (c.certificateDate !== undefined) row.certificate_date = c.certificateDate
  if (c.grossAmount !== undefined) row.gross_amount = c.grossAmount
  if (c.adjustments !== undefined) row.adjustments = c.adjustments
  if (c.deductions !== undefined) row.deductions = c.deductions
  if (c.retentionAmount !== undefined) row.retention_amount = c.retentionAmount
  if (c.advanceRecoveryAmount !== undefined) row.advance_recovery_amount = c.advanceRecoveryAmount
  if (c.certifiedAmount !== undefined) row.certified_amount = c.certifiedAmount
  if (c.paidAmount !== undefined) row.paid_amount = c.paidAmount
  if (c.status !== undefined) row.status = c.status
  if (c.submittedDate !== undefined) row.submitted_date = c.submittedDate || null
  if (c.certifiedDate !== undefined) row.certified_date = c.certifiedDate || null
  if (c.paidDate !== undefined) row.paid_date = c.paidDate || null
  if (c.notes !== undefined) row.notes = c.notes
  return row
}
