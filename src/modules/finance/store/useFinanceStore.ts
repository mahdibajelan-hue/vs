import { create } from 'zustand'
import { addCoverage, covers, EMPTY_COVERAGE, mergePatch, onScopeChange, resolveScope, type Coverage, type ScopeRequest } from '../../../lib/projectScope'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type { FinAnnualBudget, FinBudget, FinBudgetChange, FinCashflowForecast, FinClaim, FinContract, FinContractAmendment, FinGuarantee, FinPayment, FinPaymentCertificate, FinRetentionRelease } from '../types'
import {
  finAnnualBudgetFromRow,
  finAnnualBudgetToRow,
  finBudgetChangeFromRow,
  finBudgetChangeToRow,
  finBudgetFromRow,
  finBudgetToRow,
  finCashflowForecastFromRow,
  finCashflowForecastToRow,
  finClaimFromRow,
  finClaimToRow,
  finContractAmendmentFromRow,
  finContractAmendmentToRow,
  finContractFromRow,
  finContractToRow,
  finGuaranteeFromRow,
  finGuaranteeToRow,
  finPaymentCertificateFromRow,
  finPaymentCertificateToRow,
  finPaymentFromRow,
  finPaymentToRow,
  finRetentionReleaseFromRow,
  finRetentionReleaseToRow,
} from '../lib/financeData'
import { todayTehran } from '../../../lib/today'

function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

/**
 * Fetch-all-then-filter, same pattern as Master Data and the Portfolio Dashboard's data layer —
 * financial data across the whole organization's projects is small enough to hold in memory, and
 * this is exactly what the Cash Flow & Forecast page's Program/Portfolio rollups need anyway.
 */
export interface FinProfileRef {
  id: string
  fullName: string
}

interface FinanceState {
  budgets: FinBudget[]
  budgetChanges: FinBudgetChange[]
  annualBudgets: FinAnnualBudget[]
  contracts: FinContract[]
  amendments: FinContractAmendment[]
  certificates: FinPaymentCertificate[]
  guarantees: FinGuarantee[]
  payments: FinPayment[]
  claims: FinClaim[]
  retentionReleases: FinRetentionRelease[]
  cashflowForecasts: FinCashflowForecast[]
  profiles: FinProfileRef[]
  loading: boolean
  loaded: boolean

  fetchAll: (opts?: { scope?: ScopeRequest }) => Promise<void>
  /** which projects are in memory (lib/projectScope) */
  coverage: Coverage

  upsertBudget: (masterProjectId: string, data: Partial<FinBudget>) => Promise<void>
  addBudgetChange: (masterProjectId: string, data: Partial<FinBudgetChange>) => Promise<void>
  deleteBudgetChange: (id: string) => Promise<void>

  upsertAnnualBudget: (masterProjectId: string, jalaliYear: number, data: Partial<FinAnnualBudget>) => Promise<void>
  deleteAnnualBudget: (id: string) => Promise<void>

  createContract: (masterProjectId: string, data: Partial<FinContract>) => Promise<string | null>
  updateContract: (id: string, data: Partial<FinContract>) => Promise<void>
  deleteContract: (id: string) => Promise<void>

  addAmendment: (contractId: string, data: Partial<FinContractAmendment>) => Promise<void>
  deleteAmendment: (id: string) => Promise<void>

  createCertificate: (contractId: string, data: Partial<FinPaymentCertificate>) => Promise<void>
  updateCertificate: (id: string, data: Partial<FinPaymentCertificate>) => Promise<void>
  deleteCertificate: (id: string) => Promise<void>
  certifyCertificate: (id: string, certifiedAmount: number) => Promise<void>
  approveCertificate: (id: string) => Promise<void>

  createGuarantee: (contractId: string, data: Partial<FinGuarantee>) => Promise<void>
  updateGuarantee: (id: string, data: Partial<FinGuarantee>) => Promise<void>
  deleteGuarantee: (id: string) => Promise<void>

  createPayment: (certificateId: string, data: Partial<FinPayment>) => Promise<void>
  updatePayment: (id: string, data: Partial<FinPayment>) => Promise<void>
  deletePayment: (id: string) => Promise<void>

  createClaim: (contractId: string, data: Partial<FinClaim>) => Promise<void>
  updateClaim: (id: string, data: Partial<FinClaim>) => Promise<void>
  deleteClaim: (id: string) => Promise<void>

  createRetentionRelease: (contractId: string, data: Partial<FinRetentionRelease>) => Promise<void>
  updateRetentionRelease: (id: string, data: Partial<FinRetentionRelease>) => Promise<void>
  deleteRetentionRelease: (id: string) => Promise<void>

  upsertCashflowForecast: (contractId: string, jalaliYear: number, jalaliMonth: number, data: Partial<FinCashflowForecast>) => Promise<void>
  deleteCashflowForecast: (id: string) => Promise<void>
}

/** lists that belong to a project through a contract (or a certificate): [field, parent list] */
const CHILDREN: Record<string, [string, string]> = {
  amendments: ['contractId', 'contracts'], certificates: ['contractId', 'contracts'], guarantees: ['contractId', 'contracts'], claims: ['contractId', 'contracts'],
  retentionReleases: ['contractId', 'contracts'], cashflowForecasts: ['contractId', 'contracts'], payments: ['certificateId', 'certificates'],
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  budgets: [],
  budgetChanges: [],
  annualBudgets: [],
  contracts: [],
  amendments: [],
  certificates: [],
  guarantees: [],
  payments: [],
  claims: [],
  retentionReleases: [],
  cashflowForecasts: [],
  profiles: [],
  loading: false,
  loaded: false,
  coverage: EMPTY_COVERAGE,

  fetchAll: async (opts) => {
    // inside a project only that project is read; other projects already in memory stay (lib/projectScope)
    const sc = resolveScope(opts?.scope)
    set({ loading: true })
    const [{ data: budgets, error: e1 }, { data: changes, error: e2 }, { data: contracts, error: e3 }, { data: annualBudgets, error: e7 }, { data: profileRows }] = await Promise.all([
      (sc ? supabase.from('fin_budgets').select('*').eq('master_project_id', sc) : supabase.from('fin_budgets').select('*')),
      (sc ? supabase.from('fin_budget_changes').select('*').eq('master_project_id', sc) : supabase.from('fin_budget_changes').select('*')).order('change_date'),
      (sc ? supabase.from('fin_contracts').select('*').eq('master_project_id', sc) : supabase.from('fin_contracts').select('*')).order('created_at', { ascending: false }),
      (sc ? supabase.from('fin_annual_budgets').select('*').eq('master_project_id', sc) : supabase.from('fin_annual_budgets').select('*')).order('jalali_year'),
      supabase.from('profiles').select('id, full_name'),
    ])
    if (reportError('بارگذاری داده‌های مالی', e1 ?? e2 ?? e3 ?? e7)) {
      set({ loading: false })
      return
    }
    const contractIds = ((contracts ?? []) as { id: string }[]).map((c) => c.id)
    const [
      { data: amendments, error: e4 },
      { data: certificates, error: e5 },
      { data: guarantees, error: e6 },
      { data: claims, error: e9 },
      { data: retentionReleases, error: e10 },
      { data: cashflowForecasts, error: e11 },
    ] =
      contractIds.length > 0
        ? await Promise.all([
            (sc ? supabase.from('fin_contract_amendments').select('*').in('contract_id', contractIds) : supabase.from('fin_contract_amendments').select('*')).order('amendment_date'),
            (sc ? supabase.from('fin_payment_certificates').select('*').in('contract_id', contractIds) : supabase.from('fin_payment_certificates').select('*')).order('certificate_date'),
            (sc ? supabase.from('fin_guarantees').select('*').in('contract_id', contractIds) : supabase.from('fin_guarantees').select('*')).order('expiry_date'),
            (sc ? supabase.from('fin_claims').select('*').in('contract_id', contractIds) : supabase.from('fin_claims').select('*')).order('submitted_date'),
            (sc ? supabase.from('fin_retention_releases').select('*').in('contract_id', contractIds) : supabase.from('fin_retention_releases').select('*')).order('planned_date'),
            (sc ? supabase.from('fin_cashflow_forecasts').select('*').in('contract_id', contractIds) : supabase.from('fin_cashflow_forecasts').select('*')).order('jalali_year').order('jalali_month'),
          ])
        : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
    if (reportError('بارگذاری داده‌های مالی', e4 ?? e5 ?? e6 ?? e9 ?? e10 ?? e11)) {
      set({ loading: false })
      return
    }
    const certificateIds = ((certificates ?? []) as { id: string }[]).map((c) => c.id)
    const { data: payments, error: e8 } =
      certificateIds.length > 0 ? await (sc ? supabase.from('fin_payments').select('*').in('certificate_id', certificateIds) : supabase.from('fin_payments').select('*')).order('payment_date') : { data: [], error: null }
    if (reportError('بارگذاری سوابق پرداخت', e8)) {
      set({ loading: false })
      return
    }
    set(mergePatch(get(), {
      budgets: (budgets ?? []).map(finBudgetFromRow),
      budgetChanges: (changes ?? []).map(finBudgetChangeFromRow),
      annualBudgets: (annualBudgets ?? []).map(finAnnualBudgetFromRow),
      contracts: (contracts ?? []).map(finContractFromRow),
      amendments: (amendments ?? []).map(finContractAmendmentFromRow),
      certificates: (certificates ?? []).map(finPaymentCertificateFromRow),
      guarantees: (guarantees ?? []).map(finGuaranteeFromRow),
      payments: (payments ?? []).map(finPaymentFromRow),
      claims: (claims ?? []).map(finClaimFromRow),
      retentionReleases: (retentionReleases ?? []).map(finRetentionReleaseFromRow),
      cashflowForecasts: (cashflowForecasts ?? []).map(finCashflowForecastFromRow),
      profiles: ((profileRows ?? []) as { id: string; full_name: string }[]).map((p) => ({ id: p.id, fullName: p.full_name })),
    }, sc, CHILDREN))
    const coverage = addCoverage(get().coverage, sc)
    set({ coverage, loading: false, loaded: covers(coverage, sc) })
  },

  upsertBudget: async (masterProjectId, data) => {
    const existing = get().budgets.find((b) => b.masterProjectId === masterProjectId)
    const { error } = existing
      ? await supabase.from('fin_budgets').update(finBudgetToRow(masterProjectId, data)).eq('id', existing.id)
      : await supabase.from('fin_budgets').insert(finBudgetToRow(masterProjectId, data))
    if (reportError('ثبت بودجه', error)) return
    await get().fetchAll()
  },
  addBudgetChange: async (masterProjectId, data) => {
    const { error } = await supabase.from('fin_budget_changes').insert(finBudgetChangeToRow(masterProjectId, data))
    if (reportError('ثبت تغییر بودجه', error)) return
    await get().fetchAll()
  },
  deleteBudgetChange: async (id) => {
    const { error } = await supabase.from('fin_budget_changes').delete().eq('id', id)
    if (reportError('حذف تغییر بودجه', error)) return
    set((s) => ({ budgetChanges: s.budgetChanges.filter((c) => c.id !== id) }))
  },

  upsertAnnualBudget: async (masterProjectId, jalaliYear, data) => {
    const existing = get().annualBudgets.find((a) => a.masterProjectId === masterProjectId && a.jalaliYear === jalaliYear)
    const { error } = existing
      ? await supabase.from('fin_annual_budgets').update(finAnnualBudgetToRow(null, data)).eq('id', existing.id)
      : await supabase.from('fin_annual_budgets').insert(finAnnualBudgetToRow(masterProjectId, { ...data, jalaliYear }))
    if (reportError('ثبت بودجه سالانه', error)) return
    await get().fetchAll()
  },
  deleteAnnualBudget: async (id) => {
    const { error } = await supabase.from('fin_annual_budgets').delete().eq('id', id)
    if (reportError('حذف بودجه سالانه', error)) return
    set((s) => ({ annualBudgets: s.annualBudgets.filter((a) => a.id !== id) }))
  },

  createContract: async (masterProjectId, data) => {
    const { data: row, error } = await supabase.from('fin_contracts').insert(finContractToRow(masterProjectId, data)).select('id').single()
    if (reportError('ایجاد قرارداد', error)) return null
    await get().fetchAll()
    return (row as { id: string } | null)?.id ?? null
  },
  updateContract: async (id, data) => {
    const { error } = await supabase.from('fin_contracts').update(finContractToRow(null, data)).eq('id', id)
    if (reportError('ویرایش قرارداد', error)) return
    await get().fetchAll()
  },
  deleteContract: async (id) => {
    const { error } = await supabase.from('fin_contracts').delete().eq('id', id)
    if (reportError('حذف قرارداد', error)) return
    set((s) => ({ contracts: s.contracts.filter((c) => c.id !== id) }))
  },

  addAmendment: async (contractId, data) => {
    const { error } = await supabase.from('fin_contract_amendments').insert(finContractAmendmentToRow(contractId, data))
    if (reportError('ثبت الحاقیه قرارداد', error)) return
    await get().fetchAll()
  },
  deleteAmendment: async (id) => {
    const { error } = await supabase.from('fin_contract_amendments').delete().eq('id', id)
    if (reportError('حذف الحاقیه', error)) return
    set((s) => ({ amendments: s.amendments.filter((a) => a.id !== id) }))
  },

  createCertificate: async (contractId, data) => {
    const { error } = await supabase.from('fin_payment_certificates').insert(finPaymentCertificateToRow(contractId, data))
    if (reportError('ثبت صورت‌وضعیت', error)) return
    await get().fetchAll()
  },
  updateCertificate: async (id, data) => {
    const { error } = await supabase.from('fin_payment_certificates').update(finPaymentCertificateToRow(null, data)).eq('id', id)
    if (reportError('ویرایش صورت‌وضعیت', error)) return
    await get().fetchAll()
  },
  deleteCertificate: async (id) => {
    const { error } = await supabase.from('fin_payment_certificates').delete().eq('id', id)
    if (reportError('حذف صورت‌وضعیت', error)) return
    set((s) => ({ certificates: s.certificates.filter((c) => c.id !== id) }))
  },
  certifyCertificate: async (id, certifiedAmount) => {
    const userId = useAuthStore.getState().profile?.id ?? null
    const { error } = await supabase
      .from('fin_payment_certificates')
      .update({ certified_amount: certifiedAmount, certified_by: userId, certified_date: todayTehran(), status: 'certified' })
      .eq('id', id)
    if (reportError('ثبت تایید کارکرد', error)) return
    await get().fetchAll()
  },
  approveCertificate: async (id) => {
    const userId = useAuthStore.getState().profile?.id ?? null
    const { error } = await supabase
      .from('fin_payment_certificates')
      .update({ approved_by: userId, approved_date: todayTehran() })
      .eq('id', id)
    if (reportError('ثبت تصویب نهایی', error)) return
    await get().fetchAll()
  },

  createGuarantee: async (contractId, data) => {
    const { error } = await supabase.from('fin_guarantees').insert(finGuaranteeToRow(contractId, data))
    if (reportError('ثبت ضمانت‌نامه', error)) return
    await get().fetchAll()
  },
  updateGuarantee: async (id, data) => {
    const { error } = await supabase.from('fin_guarantees').update(finGuaranteeToRow(null, data)).eq('id', id)
    if (reportError('ویرایش ضمانت‌نامه', error)) return
    await get().fetchAll()
  },
  deleteGuarantee: async (id) => {
    const { error } = await supabase.from('fin_guarantees').delete().eq('id', id)
    if (reportError('حذف ضمانت‌نامه', error)) return
    set((s) => ({ guarantees: s.guarantees.filter((g) => g.id !== id) }))
  },

  createPayment: async (certificateId, data) => {
    const { error } = await supabase.from('fin_payments').insert(finPaymentToRow(certificateId, data))
    if (reportError('ثبت پرداخت', error)) return
    await get().fetchAll()
  },
  updatePayment: async (id, data) => {
    const { error } = await supabase.from('fin_payments').update(finPaymentToRow(null, data)).eq('id', id)
    if (reportError('ویرایش پرداخت', error)) return
    await get().fetchAll()
  },
  deletePayment: async (id) => {
    const { error } = await supabase.from('fin_payments').delete().eq('id', id)
    if (reportError('حذف پرداخت', error)) return
    set((s) => ({ payments: s.payments.filter((p) => p.id !== id) }))
  },

  createClaim: async (contractId, data) => {
    const { error } = await supabase.from('fin_claims').insert(finClaimToRow(contractId, data))
    if (reportError('ثبت کلایم', error)) return
    await get().fetchAll()
  },
  updateClaim: async (id, data) => {
    const { error } = await supabase.from('fin_claims').update(finClaimToRow(null, data)).eq('id', id)
    if (reportError('ویرایش کلایم', error)) return
    await get().fetchAll()
  },
  deleteClaim: async (id) => {
    const { error } = await supabase.from('fin_claims').delete().eq('id', id)
    if (reportError('حذف کلایم', error)) return
    set((s) => ({ claims: s.claims.filter((c) => c.id !== id) }))
  },

  createRetentionRelease: async (contractId, data) => {
    const { error } = await supabase.from('fin_retention_releases').insert(finRetentionReleaseToRow(contractId, data))
    if (reportError('ثبت آزادسازی حسن انجام کار', error)) return
    await get().fetchAll()
  },
  updateRetentionRelease: async (id, data) => {
    const { error } = await supabase.from('fin_retention_releases').update(finRetentionReleaseToRow(null, data)).eq('id', id)
    if (reportError('ویرایش آزادسازی حسن انجام کار', error)) return
    await get().fetchAll()
  },
  deleteRetentionRelease: async (id) => {
    const { error } = await supabase.from('fin_retention_releases').delete().eq('id', id)
    if (reportError('حذف آزادسازی حسن انجام کار', error)) return
    set((s) => ({ retentionReleases: s.retentionReleases.filter((r) => r.id !== id) }))
  },

  upsertCashflowForecast: async (contractId, jalaliYear, jalaliMonth, data) => {
    const existing = get().cashflowForecasts.find((f) => f.contractId === contractId && f.jalaliYear === jalaliYear && f.jalaliMonth === jalaliMonth)
    const { error } = existing
      ? await supabase.from('fin_cashflow_forecasts').update(finCashflowForecastToRow(null, data)).eq('id', existing.id)
      : await supabase.from('fin_cashflow_forecasts').insert(finCashflowForecastToRow(contractId, { ...data, jalaliYear, jalaliMonth }))
    if (reportError('ثبت برآورد نقدینگی ماهانه', error)) return
    await get().fetchAll()
  },
  deleteCashflowForecast: async (id) => {
    const { error } = await supabase.from('fin_cashflow_forecasts').delete().eq('id', id)
    if (reportError('حذف برآورد نقدینگی ماهانه', error)) return
    set((s) => ({ cashflowForecasts: s.cashflowForecasts.filter((f) => f.id !== id) }))
  },
}))

// entering another project (or the portfolio view): read again unless that scope is already in memory
onScopeChange((sc) => { useFinanceStore.setState({ loaded: covers(useFinanceStore.getState().coverage, sc) }) })
