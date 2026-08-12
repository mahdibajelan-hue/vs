import type {
  FinAnnualBudget,
  FinBudget,
  FinBudgetChange,
  FinCertificateStatus,
  FinCertificateType,
  FinContract,
  FinContractAmendment,
  FinContractRole,
  FinContractStatus,
  FinGuarantee,
  FinGuaranteeStatus,
  FinGuaranteeType,
  FinPaymentCertificate,
  FxAmount,
} from '../types'

function fxFromRow(fcAmount: number, fcCurrency: string, exchangeRate: number, fcRialEquivalent: number): FxAmount {
  return { fcAmount: Number(fcAmount), fcCurrency, exchangeRate: Number(exchangeRate), fcRialEquivalent: Number(fcRialEquivalent) }
}

interface FinBudgetRow {
  id: string
  master_project_id: string
  approved_budget: number
  currency: string
  approved_budget_fc: number
  fc_currency: string
  exchange_rate: number
  approved_budget_fc_rial_equivalent: number
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
    fx: fxFromRow(r.approved_budget_fc, r.fc_currency, r.exchange_rate, r.approved_budget_fc_rial_equivalent),
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function finBudgetToRow(masterProjectId: string, b: Partial<FinBudget>) {
  const row: Record<string, unknown> = { master_project_id: masterProjectId }
  if (b.approvedBudget !== undefined) row.approved_budget = b.approvedBudget
  if (b.currency !== undefined) row.currency = b.currency
  if (b.fx?.fcAmount !== undefined) row.approved_budget_fc = b.fx.fcAmount
  if (b.fx?.fcCurrency !== undefined) row.fc_currency = b.fx.fcCurrency
  if (b.fx?.exchangeRate !== undefined) row.exchange_rate = b.fx.exchangeRate
  if (b.notes !== undefined) row.notes = b.notes
  return row
}

interface FinAnnualBudgetRow {
  id: string
  master_project_id: string
  jalali_year: number
  budget_amount: number
  currency: string
  notes: string
  created_at: string
  updated_at: string
}

export function finAnnualBudgetFromRow(r: FinAnnualBudgetRow): FinAnnualBudget {
  return {
    id: r.id,
    masterProjectId: r.master_project_id,
    jalaliYear: r.jalali_year,
    budgetAmount: Number(r.budget_amount),
    currency: r.currency,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function finAnnualBudgetToRow(masterProjectId: string | null, a: Partial<FinAnnualBudget>) {
  const row: Record<string, unknown> = {}
  if (masterProjectId) row.master_project_id = masterProjectId
  if (a.jalaliYear !== undefined) row.jalali_year = a.jalaliYear
  if (a.budgetAmount !== undefined) row.budget_amount = a.budgetAmount
  if (a.currency !== undefined) row.currency = a.currency
  if (a.notes !== undefined) row.notes = a.notes
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
  contract_role: string
  contractor_org_id: string | null
  contract_value: number
  currency: string
  contract_value_fc: number
  fc_currency: string
  exchange_rate: number
  contract_value_fc_rial_equivalent: number
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
    contractRole: r.contract_role as FinContractRole,
    contractorOrgId: r.contractor_org_id,
    contractValue: Number(r.contract_value),
    currency: r.currency,
    fx: fxFromRow(r.contract_value_fc, r.fc_currency, r.exchange_rate, r.contract_value_fc_rial_equivalent),
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
  if (c.contractRole !== undefined) row.contract_role = c.contractRole
  if (c.contractorOrgId !== undefined) row.contractor_org_id = c.contractorOrgId || null
  if (c.contractValue !== undefined) row.contract_value = c.contractValue
  if (c.currency !== undefined) row.currency = c.currency
  if (c.fx?.fcAmount !== undefined) row.contract_value_fc = c.fx.fcAmount
  if (c.fx?.fcCurrency !== undefined) row.fc_currency = c.fx.fcCurrency
  if (c.fx?.exchangeRate !== undefined) row.exchange_rate = c.fx.exchangeRate
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
  certificate_type: string
  related_certificate_id: string | null
  adjustment_factor: number | null
  gross_amount: number
  gross_amount_fc: number
  fc_currency: string
  exchange_rate: number
  gross_amount_fc_rial_equivalent: number
  adjustments: number
  deductions: number
  retention_amount: number
  advance_recovery_amount: number
  payable_amount: number
  certified_amount: number | null
  paid_amount: number
  paid_amount_fc: number
  paid_exchange_rate: number
  paid_amount_fc_rial_equivalent: number
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
    certificateType: r.certificate_type as FinCertificateType,
    relatedCertificateId: r.related_certificate_id,
    adjustmentFactor: r.adjustment_factor == null ? null : Number(r.adjustment_factor),
    grossAmount: Number(r.gross_amount),
    grossFx: fxFromRow(r.gross_amount_fc, r.fc_currency, r.exchange_rate, r.gross_amount_fc_rial_equivalent),
    adjustments: Number(r.adjustments),
    deductions: Number(r.deductions),
    retentionAmount: Number(r.retention_amount),
    advanceRecoveryAmount: Number(r.advance_recovery_amount),
    payableAmount: Number(r.payable_amount),
    certifiedAmount: r.certified_amount == null ? null : Number(r.certified_amount),
    paidAmount: Number(r.paid_amount),
    paidFx: fxFromRow(r.paid_amount_fc, r.fc_currency, r.paid_exchange_rate, r.paid_amount_fc_rial_equivalent),
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
  if (c.certificateType !== undefined) row.certificate_type = c.certificateType
  if (c.relatedCertificateId !== undefined) row.related_certificate_id = c.relatedCertificateId || null
  if (c.adjustmentFactor !== undefined) row.adjustment_factor = c.adjustmentFactor
  if (c.grossAmount !== undefined) row.gross_amount = c.grossAmount
  if (c.grossFx?.fcAmount !== undefined) row.gross_amount_fc = c.grossFx.fcAmount
  if (c.grossFx?.fcCurrency !== undefined) row.fc_currency = c.grossFx.fcCurrency
  if (c.grossFx?.exchangeRate !== undefined) row.exchange_rate = c.grossFx.exchangeRate
  if (c.adjustments !== undefined) row.adjustments = c.adjustments
  if (c.deductions !== undefined) row.deductions = c.deductions
  if (c.retentionAmount !== undefined) row.retention_amount = c.retentionAmount
  if (c.advanceRecoveryAmount !== undefined) row.advance_recovery_amount = c.advanceRecoveryAmount
  if (c.certifiedAmount !== undefined) row.certified_amount = c.certifiedAmount
  if (c.paidAmount !== undefined) row.paid_amount = c.paidAmount
  if (c.paidFx?.fcAmount !== undefined) row.paid_amount_fc = c.paidFx.fcAmount
  if (c.paidFx?.exchangeRate !== undefined) row.paid_exchange_rate = c.paidFx.exchangeRate
  if (c.status !== undefined) row.status = c.status
  if (c.submittedDate !== undefined) row.submitted_date = c.submittedDate || null
  if (c.certifiedDate !== undefined) row.certified_date = c.certifiedDate || null
  if (c.paidDate !== undefined) row.paid_date = c.paidDate || null
  if (c.notes !== undefined) row.notes = c.notes
  return row
}

interface FinGuaranteeRow {
  id: string
  contract_id: string
  guarantee_type: string
  number: string
  amount: number
  currency: string
  issue_date: string | null
  expiry_date: string | null
  status: string
  notes: string
  created_at: string
  updated_at: string
}

export function finGuaranteeFromRow(r: FinGuaranteeRow): FinGuarantee {
  return {
    id: r.id,
    contractId: r.contract_id,
    guaranteeType: r.guarantee_type as FinGuaranteeType,
    number: r.number,
    amount: Number(r.amount),
    currency: r.currency,
    issueDate: r.issue_date,
    expiryDate: r.expiry_date,
    status: r.status as FinGuaranteeStatus,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function finGuaranteeToRow(contractId: string | null, g: Partial<FinGuarantee>) {
  const row: Record<string, unknown> = {}
  if (contractId) row.contract_id = contractId
  if (g.guaranteeType !== undefined) row.guarantee_type = g.guaranteeType
  if (g.number !== undefined) row.number = g.number
  if (g.amount !== undefined) row.amount = g.amount
  if (g.currency !== undefined) row.currency = g.currency
  if (g.issueDate !== undefined) row.issue_date = g.issueDate || null
  if (g.expiryDate !== undefined) row.expiry_date = g.expiryDate || null
  if (g.status !== undefined) row.status = g.status
  if (g.notes !== undefined) row.notes = g.notes
  return row
}
