import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import { friendlyErrorMessage } from '../../../lib/friendlyError'
import { useSystemStore } from '../../../store/useSystemStore'
import type { CashPlan } from '../lib/financeCurves'
import type { Clearance } from '../lib/financeInsights'
import type { LandSummary, PendingChange, SettingsVersion, FinThresholds } from '../lib/financeControl'

export interface FinBudgetLine { id: string; masterProjectId: string; code: string; title: string; costCategory: string; kind: 'general' | 'land'; approvedAmount: number; currency: string; notes: string; isActive: boolean }
export interface FinConfigItem { id: string; kind: 'contract_type' | 'cost_category' | 'currency'; key: string; label: string; sort: number; active: boolean }
export interface FinLink { id: string; masterProjectId: string; sourceType: string; sourceId: string | null; targetType: 'risk' | 'issue'; targetId: string; label: string; createdAt: string }
export interface FinChangeRequest { id: string; masterProjectId: string; contractId: string | null; crNumber: string; title: string; status: string; currency: string; proposedAmount: number; approvedAmount: number | null; proposedDays: number; approvedDays: number | null; approvedAt: string | null }
export interface FinSyncEntry { id: number; at: string; source: string; outcome: string; detail: string; masterProjectId: string | null }
export interface FinAuditEntry { id: number; at: string; actor: string | null; table: string; rowId: string | null; action: string; oldRow: Record<string, unknown> | null; newRow: Record<string, unknown> | null }
export interface LinkTarget { id: string; kind: 'risk' | 'issue'; title: string; status: string; code: string }
export interface LandLedgerRow { id: string; parcelId: string | null; category: string; payee: string; amount: number; paidDate: string; ref: string; status: 'posted' | 'voided'; voidReason: string }

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function report(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${friendlyErrorMessage(error)}`)
  return true
}

interface State {
  loaded: boolean
  loading: boolean
  budgetLines: FinBudgetLine[]
  settingsVersions: SettingsVersion[]
  configItems: FinConfigItem[]
  links: FinLink[]
  linkTargets: Map<string, LinkTarget>
  changes: FinChangeRequest[]
  syncLog: FinSyncEntry[]
  land: Map<string, LandSummary>
  plans: CashPlan[]
  clearances: Clearance[]
  /** insight key -> decision already taken by a person */
  reviews: Map<string, 'accepted' | 'dismissed'>
  savePlan: (p: CashPlan) => Promise<boolean>
  saveClearance: (c: Clearance) => Promise<boolean>
  reviewInsight: (key: string, projectId: string, decision: 'accepted' | 'dismissed', note?: string) => Promise<boolean>
  fetchAll: () => Promise<void>
  loadLandLedger: (projectId: string) => Promise<LandLedgerRow[]>
  loadAudit: (projectId: string | null, limit?: number) => Promise<FinAuditEntry[]>
  saveBudgetLine: (b: { id?: string | null; projectId: string; code: string; title: string; costCategory: string; kind: 'general' | 'land'; amount: number; currency: string; notes?: string; active?: boolean }) => Promise<boolean>
  saveSettings: (values: Partial<FinThresholds>, validFrom: string, note: string) => Promise<boolean>
  saveConfigItem: (kind: FinConfigItem['kind'], key: string, label: string, active: boolean) => Promise<boolean>
  raise: (a: { sourceType: string; sourceId: string | null; projectId: string; target: 'issue' | 'risk'; title: string; description: string; severity: string }) => Promise<boolean>
}

export const useFinanceControlStore = create<State>()((set, get) => ({
  loaded: false,
  loading: false,
  budgetLines: [],
  settingsVersions: [],
  configItems: [],
  links: [],
  linkTargets: new Map(),
  changes: [],
  syncLog: [],
  land: new Map(),
  plans: [],
  clearances: [],
  reviews: new Map(),

  fetchAll: async () => {
    set({ loading: true })
    const [lines, versions, items, links, changes, log, routes, plans, clearances, reviews] = await Promise.all([
      supabase.from('fin_budget_lines').select('*').order('code'),
      supabase.from('fin_settings_versions').select('*').order('version'),
      supabase.from('fin_config_items').select('*').order('sort'),
      supabase.from('fin_links').select('*').order('created_at', { ascending: false }),
      supabase.from('chg_change_requests').select('id, master_project_id, contract_id, cr_number, title, status, currency, proposed_change_amount, approved_change_amount, proposed_schedule_impact_days, approved_schedule_impact_days, approved_at').not('contract_id', 'is', null),
      supabase.from('fin_sync_log').select('*').order('id', { ascending: false }).limit(60),
      supabase.from('la_routes').select('master_project_id'),
      supabase.from('fin_cashflow_plans').select('*'),
      supabase.from('fin_clearances').select('*'),
      supabase.from('fin_insight_reviews').select('insight_key, decision'),
    ])
    // the new objects may not exist yet on an un-migrated database: the module keeps working without them
    const ok = <T,>(r: { data: T[] | null; error: unknown }): T[] => (r.error ? [] : r.data ?? [])
    const lineRows = ok<Row>(lines)
    const linkRows = ok<Row>(links)
    const landIds = ok<Row>(routes).map((r) => r.master_project_id as string)
    const landEntries = await Promise.all(landIds.map(async (pid) => {
      const { data, error } = await supabase.rpc('fin_land_summary', { p_project: pid })
      return error || !data ? null : ([pid, data as LandSummary] as const)
    }))
    const issueIds = linkRows.filter((l) => l.target_type === 'issue').map((l) => l.target_id as string)
    const riskIds = linkRows.filter((l) => l.target_type === 'risk').map((l) => l.target_id as string)
    const [iss, rsk] = await Promise.all([
      issueIds.length ? supabase.from('im_issues').select('id, code, title, status').in('id', issueIds) : Promise.resolve({ data: [], error: null }),
      riskIds.length ? supabase.from('rm_risks').select('id, code, title, status').in('id', riskIds) : Promise.resolve({ data: [], error: null }),
    ])
    const targets = new Map<string, LinkTarget>()
    for (const r of ok<Row>(iss as never)) targets.set(r.id, { id: r.id, kind: 'issue', title: r.title ?? '', status: r.status ?? '', code: r.code ?? '' })
    for (const r of ok<Row>(rsk as never)) targets.set(r.id, { id: r.id, kind: 'risk', title: r.title ?? '', status: r.status ?? '', code: r.code ?? '' })
    set({
      budgetLines: lineRows.map((r): FinBudgetLine => ({ id: r.id, masterProjectId: r.master_project_id, code: r.code, title: r.title, costCategory: r.cost_category ?? '', kind: r.kind, approvedAmount: Number(r.approved_amount), currency: r.currency, notes: r.notes ?? '', isActive: !!r.is_active })),
      settingsVersions: ok<Row>(versions).map((r): SettingsVersion => ({ version: r.version, validFrom: r.valid_from, note: r.note ?? '', values: r.values_json ?? {} })),
      configItems: ok<Row>(items).map((r): FinConfigItem => ({ id: r.id, kind: r.kind, key: r.key, label: r.label, sort: r.sort, active: !!r.active })),
      links: linkRows.map((r): FinLink => ({ id: r.id, masterProjectId: r.master_project_id, sourceType: r.source_type, sourceId: r.source_id, targetType: r.target_type, targetId: r.target_id, label: r.label ?? '', createdAt: r.created_at })),
      linkTargets: targets,
      changes: ok<Row>(changes).map((r): FinChangeRequest => ({ id: r.id, masterProjectId: r.master_project_id, contractId: r.contract_id, crNumber: r.cr_number ?? '', title: r.title ?? '', status: r.status, currency: r.currency ?? '', proposedAmount: Number(r.proposed_change_amount ?? 0), approvedAmount: r.approved_change_amount == null ? null : Number(r.approved_change_amount), proposedDays: Number(r.proposed_schedule_impact_days ?? 0), approvedDays: r.approved_schedule_impact_days == null ? null : Number(r.approved_schedule_impact_days), approvedAt: r.approved_at ?? null })),
      syncLog: ok<Row>(log).map((r): FinSyncEntry => ({ id: r.id, at: r.at, source: r.source, outcome: r.outcome, detail: r.detail ?? '', masterProjectId: r.master_project_id })),
      plans: ok<Row>(plans).map((r): CashPlan => ({ contractId: r.contract_id, kind: r.kind, fund: r.fund, currency: r.currency, jalaliYear: r.jalali_year, jalaliMonth: r.jalali_month, amount: Number(r.amount) })),
      clearances: ok<Row>(clearances).map((r): Clearance => ({ contractId: r.contract_id, kind: r.kind, status: r.status, number: r.number ?? '', issueDate: r.issue_date, expiryDate: r.expiry_date, note: r.note ?? '' })),
      reviews: new Map(ok<Row>(reviews).map((r) => [r.insight_key as string, r.decision as 'accepted' | 'dismissed'])),
      land: new Map(landEntries.filter((e): e is readonly [string, LandSummary] => !!e)),
      loaded: true,
      loading: false,
    })
  },

  loadLandLedger: async (projectId) => {
    const { data, error } = await supabase.from('fin_land_ledger').select('*').eq('master_project_id', projectId).order('paid_date', { ascending: false })
    if (report('بارگذاری پرداخت‌های تملک اراضی', error)) return []
    return ((data ?? []) as Row[]).map((r): LandLedgerRow => ({ id: r.id, parcelId: r.parcel_id, category: r.category, payee: r.payee ?? '', amount: Number(r.amount), paidDate: r.paid_date, ref: r.ref ?? '', status: r.status, voidReason: r.void_reason ?? '' }))
  },

  loadAudit: async (projectId, limit = 80) => {
    let q = supabase.from('fin_audit').select('*').order('id', { ascending: false }).limit(limit)
    if (projectId) q = q.eq('master_project_id', projectId)
    const { data, error } = await q
    if (report('بارگذاری سابقهٔ تغییرات', error)) return []
    return ((data ?? []) as Row[]).map((r): FinAuditEntry => ({ id: r.id, at: r.at, actor: r.actor, table: r.table_name, rowId: r.row_id, action: r.action, oldRow: r.old_row, newRow: r.new_row }))
  },

  savePlan: async (p) => {
    const { error } = await supabase.rpc('fin_save_cashflow_plan', { p_contract: p.contractId, p_kind: p.kind, p_fund: p.fund, p_currency: p.currency, p_year: p.jalaliYear, p_month: p.jalaliMonth, p_amount: p.amount })
    if (report('ثبت برنامهٔ جریان نقدی', error)) return false
    await get().fetchAll()
    return true
  },
  saveClearance: async (c) => {
    const { error } = await supabase.rpc('fin_save_clearance', { p_contract: c.contractId, p_kind: c.kind, p_status: c.status, p_number: c.number, p_issue: c.issueDate || null, p_expiry: c.expiryDate || null, p_note: c.note })
    if (report('ثبت مفاصاحساب', error)) return false
    await get().fetchAll()
    return true
  },
  reviewInsight: async (key, projectId, decision, note = '') => {
    const { error } = await supabase.rpc('fin_review_insight', { p_key: key, p_project: projectId, p_decision: decision, p_note: note })
    if (report('ثبت تصمیم دربارهٔ یافته', error)) return false
    set((st) => ({ reviews: new Map(st.reviews).set(key, decision) }))
    return true
  },
  saveBudgetLine: async (b) => {
    const { error } = await supabase.rpc('fin_save_budget_line', { p_id: b.id ?? null, p_project: b.projectId, p_code: b.code, p_title: b.title, p_category: b.costCategory, p_kind: b.kind, p_amount: b.amount, p_currency: b.currency, p_notes: b.notes ?? '', p_active: b.active ?? true })
    if (report('ثبت ردیف بودجه', error)) return false
    await get().fetchAll()
    return true
  },
  saveSettings: async (values, validFrom, note) => {
    const { error } = await supabase.rpc('fin_save_settings', { p_values: values, p_valid_from: validFrom, p_note: note })
    if (report('ثبت نسخهٔ تنظیمات', error)) return false
    await get().fetchAll()
    return true
  },
  saveConfigItem: async (kind, key, label, active) => {
    const { error } = await supabase.rpc('fin_save_config_item', { p_kind: kind, p_key: key, p_label: label, p_active: active })
    if (report('ثبت فهرست', error)) return false
    await get().fetchAll()
    return true
  },
  raise: async (a) => {
    const { error } = await supabase.rpc('fin_raise', { p_source_type: a.sourceType, p_source_id: a.sourceId, p_project: a.projectId, p_target: a.target, p_title: a.title, p_description: a.description, p_severity: a.severity })
    if (error) {
      const m = error.message
      useSystemStore.getState().setStorageError(m.includes('no_issue_mapping') ? 'برای این پروژه نگاشت تأییدشدهٔ «مدیریت مسائل» تعریف نشده است.' : m.includes('no_risk_mapping') ? 'برای این پروژه نگاشت تأییدشدهٔ «مدیریت ریسک» تعریف نشده است.' : m.includes('not_allowed') ? 'مجوز ثبت اقدام یا ریسک مالی را ندارید.' : `خطا در ثبت: ${friendlyErrorMessage(error)}`)
      return false
    }
    await get().fetchAll()
    return true
  },
}))

export type { PendingChange }
