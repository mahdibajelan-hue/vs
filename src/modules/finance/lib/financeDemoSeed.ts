import { supabase } from '../../../lib/supabaseClient'

/**
 * Additive demo-data generator for the Financial Management module — reuses whatever
 * Portfolio/Program/Project hierarchy already exists (normally the base demo dataset from
 * Master Data's "Demo Data" admin page) instead of creating a parallel one, and never touches
 * any other module's data. Safe to re-run: it only clears out fin_* rows for the specific
 * master_project_ids it is about to reseed, never portfolios/programs/master_projects/other
 * modules' data.
 */

function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let rand = mulberry32(20260812)
function ri(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}
function pick<T>(arr: T[]): T {
  return arr[ri(0, arr.length - 1)]
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const TODAY = new Date().toISOString().slice(0, 10)

const BUDGET_CHANGE_REASONS = ['الحاقیه محدوده کار مصوب کارفرما', 'صرفه‌جویی مهندسی ارزش', 'تعدیل نرخ ارز مصالح وارداتی', 'افزایش بودجه بابت تغییرات ایمنی/HSE', 'کاهش بودجه بابت حذف بخشی از محدوده کار']

export interface FinanceDemoSeedCounts {
  projectsCovered: number
  budgets: number
  budgetChanges: number
  contracts: number
  amendments: number
  certificates: number
}

export interface DemoSeedProgress {
  (message: string): void
}

interface MasterProjectRow {
  id: string
  official_name: string
  contract_value: number | null
  currency: string
  contractor_org_id: string | null
  planned_start_date: string | null
  planned_finish_date: string | null
  status: string
}

function contractStatusForProject(status: string): 'draft' | 'active' | 'completed' | 'terminated' {
  if (status === 'completed' || status === 'closed') return 'completed'
  if (status === 'planning' || status === 'approved' || status === 'idea' || status === 'proposed') return 'draft'
  if (status === 'cancelled') return 'terminated'
  return 'active'
}

export async function seedFinanceDemoData(onProgress?: DemoSeedProgress): Promise<FinanceDemoSeedCounts> {
  rand = mulberry32(20260812)

  onProgress?.('دریافت پروژه‌های پایه موجود...')
  const { data: projects, error: projErr } = await supabase
    .from('master_projects')
    .select('id, official_name, contract_value, currency, contractor_org_id, planned_start_date, planned_finish_date, status')
  if (projErr) throw new Error(projErr.message)
  const projectRows = (projects ?? []) as MasterProjectRow[]
  if (projectRows.length === 0) {
    throw new Error('هیچ پروژه پایه‌ای یافت نشد — ابتدا از صفحه «داده‌های نمایشی» در بخش داده پایه، مجموعه داده اصلی را تولید کنید.')
  }
  const projectIds = projectRows.map((p) => p.id)

  onProgress?.('پاک‌سازی داده مالی نمایشی قبلی این پروژه‌ها...')
  const { data: existingContracts } = await supabase.from('fin_contracts').select('id').in('master_project_id', projectIds)
  const existingContractIds = (existingContracts ?? []).map((c) => c.id as string)
  if (existingContractIds.length > 0) {
    await supabase.from('fin_payment_certificates').delete().in('contract_id', existingContractIds)
    await supabase.from('fin_contract_amendments').delete().in('contract_id', existingContractIds)
  }
  await supabase.from('fin_contracts').delete().in('master_project_id', projectIds)
  await supabase.from('fin_budget_changes').delete().in('master_project_id', projectIds)
  await supabase.from('fin_budgets').delete().in('master_project_id', projectIds)

  onProgress?.('به‌روزرسانی پیش‌بینی هزینه در تکمیل پروژه‌ها...')
  for (const p of projectRows) {
    const baseValue = p.contract_value ?? ri(200, 3000) * 1_000_000_000
    const eac = Math.round(baseValue * (1 + (ri(-8, 15) / 100)))
    await supabase.from('master_projects').update({ forecast_cost_at_completion: eac }).eq('id', p.id)
  }

  const budgetRows: Record<string, unknown>[] = []
  const budgetChangeRows: Record<string, unknown>[] = []
  const contractRows: { row: Record<string, unknown>; projectId: string }[] = []

  for (const p of projectRows) {
    const contractValue = p.contract_value ?? ri(200, 3000) * 1_000_000_000
    const currency = p.currency || 'IRR'
    const approvedBudget = Math.round(contractValue * (1 + ri(-5, 12) / 100))
    budgetRows.push({ master_project_id: p.id, approved_budget: approvedBudget, currency, notes: '' })

    const changeCount = ri(0, 3)
    for (let i = 0; i < changeCount; i++) {
      const amount = Math.round(approvedBudget * (ri(-6, 9) / 100))
      budgetChangeRows.push({
        master_project_id: p.id,
        change_date: addDays(p.planned_start_date ?? TODAY, ri(30, 400)),
        amount,
        reason: pick(BUDGET_CHANGE_REASONS),
      })
    }

    const status = contractStatusForProject(p.status)
    contractRows.push({
      projectId: p.id,
      row: {
        master_project_id: p.id,
        contract_number: `C-${1401 + ri(0, 3)}-${p.id.slice(0, 4).toUpperCase()}`,
        title: `قرارداد اصلی EPC — ${p.official_name}`,
        contractor_org_id: p.contractor_org_id,
        contract_value: Math.round(contractValue * (ri(85, 100) / 100)),
        currency,
        advance_payment_percent: pick([5, 10, 15]),
        retention_percent: pick([5, 10]),
        performance_guarantee_percent: pick([3, 5, 10]),
        start_date: p.planned_start_date,
        planned_completion_date: p.planned_finish_date,
        status,
      },
    })
  }

  onProgress?.('ایجاد بودجه پروژه‌ها...')
  const { error: budErr } = await supabase.from('fin_budgets').insert(budgetRows)
  if (budErr) throw new Error(budErr.message)

  if (budgetChangeRows.length > 0) {
    onProgress?.('ثبت تغییرات بودجه...')
    const { error: bcErr } = await supabase.from('fin_budget_changes').insert(budgetChangeRows)
    if (bcErr) throw new Error(bcErr.message)
  }

  onProgress?.('ایجاد قراردادها...')
  const { data: insertedContracts, error: contractErr } = await supabase
    .from('fin_contracts')
    .insert(contractRows.map((c) => c.row))
    .select('id, master_project_id, contract_value, currency, advance_payment_percent, retention_percent, start_date, planned_completion_date, status')
  if (contractErr || !insertedContracts) throw new Error(contractErr?.message ?? 'خطا در ایجاد قراردادها')

  const amendmentRows: Record<string, unknown>[] = []
  const certificateRows: Record<string, unknown>[] = []

  onProgress?.('ثبت الحاقیه‌ها و صورت‌وضعیت‌ها...')
  for (const contract of insertedContracts) {
    const contractId = contract.id as string
    const contractValue = Number(contract.contract_value)
    const advancePercent = Number(contract.advance_payment_percent)
    const retentionPercent = Number(contract.retention_percent)
    const startDate = (contract.start_date as string | null) ?? TODAY
    const status = contract.status as string

    const amendmentCount = status === 'draft' ? 0 : ri(0, 2)
    for (let i = 0; i < amendmentCount; i++) {
      amendmentRows.push({
        contract_id: contractId,
        amendment_number: `AM-${i + 1}`,
        amendment_date: addDays(startDate, ri(60, 300)),
        amount: Math.round(contractValue * (ri(2, 10) / 100)),
        reason: pick(['تغییر محدوده کار به درخواست کارفرما', 'تعدیل نرخ بر اساس شاخص رسمی', 'افزودن اقلام کار جدید مصوب']),
      })
    }

    if (status === 'draft') continue

    const certCount = status === 'completed' ? ri(6, 10) : ri(2, 6)
    const perCert = contractValue / certCount
    let cumulativeAdvanceRecovered = 0
    const advanceTotal = contractValue * (advancePercent / 100)
    for (let i = 0; i < certCount; i++) {
      const gross = Math.round(perCert * (ri(85, 115) / 100))
      const retention = Math.round(gross * (retentionPercent / 100))
      const advanceRecovery = cumulativeAdvanceRecovered < advanceTotal ? Math.round(Math.min(gross * (advancePercent / 100), advanceTotal - cumulativeAdvanceRecovered)) : 0
      cumulativeAdvanceRecovered += advanceRecovery
      const certDate = addDays(startDate, 45 * (i + 1))
      const isFuture = certDate > TODAY
      const isLastFew = i >= certCount - 2

      let certStatus: string
      let certifiedAmount: number | null
      let paidAmount: number
      let submittedDate: string | null = null
      let certifiedDate: string | null = null
      let paidDate: string | null = null

      const payable = gross - retention - advanceRecovery

      if (isFuture) {
        certStatus = 'draft'
        certifiedAmount = null
        paidAmount = 0
      } else if (status === 'completed' || !isLastFew) {
        certStatus = 'paid'
        certifiedAmount = payable
        paidAmount = payable
        submittedDate = addDays(certDate, 2)
        certifiedDate = addDays(certDate, 12)
        paidDate = addDays(certDate, 30)
      } else {
        certStatus = pick(['submitted', 'under_review', 'certified', 'partially_paid'])
        submittedDate = addDays(certDate, 2)
        if (certStatus === 'under_review' || certStatus === 'certified' || certStatus === 'partially_paid') certifiedDate = addDays(certDate, 12)
        certifiedAmount = certStatus === 'certified' || certStatus === 'partially_paid' ? payable : null
        paidAmount = certStatus === 'partially_paid' ? Math.round(payable * (ri(30, 70) / 100)) : 0
        paidDate = certStatus === 'partially_paid' ? addDays(certDate, 25) : null
      }

      certificateRows.push({
        contract_id: contractId,
        certificate_number: `PC-${String(i + 1).padStart(2, '0')}`,
        certificate_date: certDate,
        gross_amount: gross,
        adjustments: 0,
        deductions: 0,
        retention_amount: retention,
        advance_recovery_amount: advanceRecovery,
        certified_amount: certifiedAmount,
        paid_amount: paidAmount,
        status: certStatus,
        submitted_date: submittedDate,
        certified_date: certifiedDate,
        paid_date: paidDate,
        notes: '',
      })
    }
  }

  if (amendmentRows.length > 0) {
    const { error: amErr } = await supabase.from('fin_contract_amendments').insert(amendmentRows)
    if (amErr) throw new Error(amErr.message)
  }
  if (certificateRows.length > 0) {
    const { error: certErr } = await supabase.from('fin_payment_certificates').insert(certificateRows)
    if (certErr) throw new Error(certErr.message)
  }

  onProgress?.('اتمام')
  return {
    projectsCovered: projectRows.length,
    budgets: budgetRows.length,
    budgetChanges: budgetChangeRows.length,
    contracts: insertedContracts.length,
    amendments: amendmentRows.length,
    certificates: certificateRows.length,
  }
}
