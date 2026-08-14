import type {
  FinAnnualBudget,
  FinBudget,
  FinBudgetChange,
  FinCertificateStatus,
  FinCertificateType,
  FinClaim,
  FinClaimStatus,
  FinClaimType,
  FinContract,
  FinContractAmendment,
  FinContractRole,
  FinContractStatus,
  FinGuarantee,
  FinGuaranteeStatus,
  FinGuaranteeType,
  FinPayment,
  FinPaymentCertificate,
  FinRetentionRelease,
  FinRetentionReleaseStage,
  FinRetentionReleaseStatus,
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
  certificate_approval_threshold: number | null
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
    certificateApprovalThreshold: r.certificate_approval_threshold == null ? null : Number(r.certificate_approval_threshold),
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
  if (b.certificateApprovalThreshold !== undefined) row.certificate_approval_threshold = b.certificateApprovalThreshold
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
  tax_deduction: number
  insurance_deduction: number
  other_deduction: number
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
  certified_by: string | null
  approved_by: string | null
  approved_date: string | null
  attachment_url: string
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
    taxDeduction: Number(r.tax_deduction),
    insuranceDeduction: Number(r.insurance_deduction),
    otherDeduction: Number(r.other_deduction),
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
    certifiedBy: r.certified_by,
    approvedBy: r.approved_by,
    approvedDate: r.approved_date,
    attachmentUrl: r.attachment_url,
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
  // deductions itself is a generated column (tax + insurance + other) — never written directly.
  if (c.taxDeduction !== undefined) row.tax_deduction = c.taxDeduction
  if (c.insuranceDeduction !== undefined) row.insurance_deduction = c.insuranceDeduction
  if (c.otherDeduction !== undefined) row.other_deduction = c.otherDeduction
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
  if (c.certifiedBy !== undefined) row.certified_by = c.certifiedBy || null
  if (c.approvedBy !== undefined) row.approved_by = c.approvedBy || null
  if (c.approvedDate !== undefined) row.approved_date = c.approvedDate || null
  if (c.attachmentUrl !== undefined) row.attachment_url = c.attachmentUrl
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
  attachment_url: string
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
    attachmentUrl: r.attachment_url,
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
  if (g.attachmentUrl !== undefined) row.attachment_url = g.attachmentUrl
  return row
}

interface FinPaymentRow {
  id: string
  certificate_id: string
  payment_date: string
  amount: number
  amount_fc: number
  fc_currency: string
  exchange_rate: number
  amount_fc_rial_equivalent: number
  method: string
  reference_number: string
  notes: string
  created_at: string
  updated_at: string
}

export function finPaymentFromRow(r: FinPaymentRow): FinPayment {
  return {
    id: r.id,
    certificateId: r.certificate_id,
    paymentDate: r.payment_date,
    amount: Number(r.amount),
    fx: fxFromRow(r.amount_fc, r.fc_currency, r.exchange_rate, r.amount_fc_rial_equivalent),
    method: r.method,
    referenceNumber: r.reference_number,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function finPaymentToRow(certificateId: string | null, p: Partial<FinPayment>) {
  const row: Record<string, unknown> = {}
  if (certificateId) row.certificate_id = certificateId
  if (p.paymentDate !== undefined) row.payment_date = p.paymentDate
  if (p.amount !== undefined) row.amount = p.amount
  if (p.fx?.fcAmount !== undefined) row.amount_fc = p.fx.fcAmount
  if (p.fx?.fcCurrency !== undefined) row.fc_currency = p.fx.fcCurrency
  if (p.fx?.exchangeRate !== undefined) row.exchange_rate = p.fx.exchangeRate
  if (p.method !== undefined) row.method = p.method
  if (p.referenceNumber !== undefined) row.reference_number = p.referenceNumber
  if (p.notes !== undefined) row.notes = p.notes
  return row
}

interface FinClaimRow {
  id: string
  contract_id: string
  claim_number: string
  claim_type: string
  title: string
  description: string
  submitted_date: string
  amount_claimed: number
  amount_approved: number | null
  currency: string
  status: string
  correspondence_ref: string
  attachment_url: string
  resolution_date: string | null
  notes: string
  created_at: string
  updated_at: string
}

export function finClaimFromRow(r: FinClaimRow): FinClaim {
  return {
    id: r.id,
    contractId: r.contract_id,
    claimNumber: r.claim_number,
    claimType: r.claim_type as FinClaimType,
    title: r.title,
    description: r.description,
    submittedDate: r.submitted_date,
    amountClaimed: Number(r.amount_claimed),
    amountApproved: r.amount_approved == null ? null : Number(r.amount_approved),
    currency: r.currency,
    status: r.status as FinClaimStatus,
    correspondenceRef: r.correspondence_ref,
    attachmentUrl: r.attachment_url,
    resolutionDate: r.resolution_date,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function finClaimToRow(contractId: string | null, c: Partial<FinClaim>) {
  const row: Record<string, unknown> = {}
  if (contractId) row.contract_id = contractId
  if (c.claimNumber !== undefined) row.claim_number = c.claimNumber
  if (c.claimType !== undefined) row.claim_type = c.claimType
  if (c.title !== undefined) row.title = c.title
  if (c.description !== undefined) row.description = c.description
  if (c.submittedDate !== undefined) row.submitted_date = c.submittedDate
  if (c.amountClaimed !== undefined) row.amount_claimed = c.amountClaimed
  if (c.amountApproved !== undefined) row.amount_approved = c.amountApproved
  if (c.currency !== undefined) row.currency = c.currency
  if (c.status !== undefined) row.status = c.status
  if (c.correspondenceRef !== undefined) row.correspondence_ref = c.correspondenceRef
  if (c.attachmentUrl !== undefined) row.attachment_url = c.attachmentUrl
  if (c.resolutionDate !== undefined) row.resolution_date = c.resolutionDate || null
  if (c.notes !== undefined) row.notes = c.notes
  return row
}

interface FinRetentionReleaseRow {
  id: string
  contract_id: string
  release_stage: string
  planned_date: string | null
  planned_amount: number
  actual_date: string | null
  actual_amount: number | null
  status: string
  notes: string
  created_at: string
  updated_at: string
}

export function finRetentionReleaseFromRow(r: FinRetentionReleaseRow): FinRetentionRelease {
  return {
    id: r.id,
    contractId: r.contract_id,
    releaseStage: r.release_stage as FinRetentionReleaseStage,
    plannedDate: r.planned_date,
    plannedAmount: Number(r.planned_amount),
    actualDate: r.actual_date,
    actualAmount: r.actual_amount == null ? null : Number(r.actual_amount),
    status: r.status as FinRetentionReleaseStatus,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function finRetentionReleaseToRow(contractId: string | null, r: Partial<FinRetentionRelease>) {
  const row: Record<string, unknown> = {}
  if (contractId) row.contract_id = contractId
  if (r.releaseStage !== undefined) row.release_stage = r.releaseStage
  if (r.plannedDate !== undefined) row.planned_date = r.plannedDate || null
  if (r.plannedAmount !== undefined) row.planned_amount = r.plannedAmount
  if (r.actualDate !== undefined) row.actual_date = r.actualDate || null
  if (r.actualAmount !== undefined) row.actual_amount = r.actualAmount
  if (r.status !== undefined) row.status = r.status
  if (r.notes !== undefined) row.notes = r.notes
  return row
}
