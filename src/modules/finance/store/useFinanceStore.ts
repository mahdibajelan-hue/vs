import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type { FinBudget, FinBudgetChange, FinContract, FinContractAmendment, FinPaymentCertificate } from '../types'
import {
  finBudgetChangeFromRow,
  finBudgetChangeToRow,
  finBudgetFromRow,
  finBudgetToRow,
  finContractAmendmentFromRow,
  finContractAmendmentToRow,
  finContractFromRow,
  finContractToRow,
  finPaymentCertificateFromRow,
  finPaymentCertificateToRow,
} from '../lib/financeData'

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
interface FinanceState {
  budgets: FinBudget[]
  budgetChanges: FinBudgetChange[]
  contracts: FinContract[]
  amendments: FinContractAmendment[]
  certificates: FinPaymentCertificate[]
  loading: boolean
  loaded: boolean

  fetchAll: () => Promise<void>

  upsertBudget: (masterProjectId: string, data: Partial<FinBudget>) => Promise<void>
  addBudgetChange: (masterProjectId: string, data: Partial<FinBudgetChange>) => Promise<void>
  deleteBudgetChange: (id: string) => Promise<void>

  createContract: (masterProjectId: string, data: Partial<FinContract>) => Promise<string | null>
  updateContract: (id: string, data: Partial<FinContract>) => Promise<void>
  deleteContract: (id: string) => Promise<void>

  addAmendment: (contractId: string, data: Partial<FinContractAmendment>) => Promise<void>
  deleteAmendment: (id: string) => Promise<void>

  createCertificate: (contractId: string, data: Partial<FinPaymentCertificate>) => Promise<void>
  updateCertificate: (id: string, data: Partial<FinPaymentCertificate>) => Promise<void>
  deleteCertificate: (id: string) => Promise<void>
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  budgets: [],
  budgetChanges: [],
  contracts: [],
  amendments: [],
  certificates: [],
  loading: false,
  loaded: false,

  fetchAll: async () => {
    set({ loading: true })
    const [{ data: budgets, error: e1 }, { data: changes, error: e2 }, { data: contracts, error: e3 }] = await Promise.all([
      supabase.from('fin_budgets').select('*'),
      supabase.from('fin_budget_changes').select('*').order('change_date'),
      supabase.from('fin_contracts').select('*').order('created_at', { ascending: false }),
    ])
    if (reportError('بارگذاری داده‌های مالی', e1 ?? e2 ?? e3)) {
      set({ loading: false })
      return
    }
    const contractIds = ((contracts ?? []) as { id: string }[]).map((c) => c.id)
    const [{ data: amendments, error: e4 }, { data: certificates, error: e5 }] =
      contractIds.length > 0
        ? await Promise.all([
            supabase.from('fin_contract_amendments').select('*').in('contract_id', contractIds).order('amendment_date'),
            supabase.from('fin_payment_certificates').select('*').in('contract_id', contractIds).order('certificate_date'),
          ])
        : [{ data: [], error: null }, { data: [], error: null }]
    if (reportError('بارگذاری داده‌های مالی', e4 ?? e5)) {
      set({ loading: false })
      return
    }
    set({
      budgets: (budgets ?? []).map(finBudgetFromRow),
      budgetChanges: (changes ?? []).map(finBudgetChangeFromRow),
      contracts: (contracts ?? []).map(finContractFromRow),
      amendments: (amendments ?? []).map(finContractAmendmentFromRow),
      certificates: (certificates ?? []).map(finPaymentCertificateFromRow),
      loading: false,
      loaded: true,
    })
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
}))
