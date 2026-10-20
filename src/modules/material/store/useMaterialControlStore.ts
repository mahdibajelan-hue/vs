import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import type { WeldBasis, WeldLine, WeldSet } from '../lib/control/weldPlan'
import { explainMaterialError } from '../lib/control/errors'
import { useSystemStore } from '../../../store/useSystemStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { useMaterialStore } from './useMaterialStore'
import { roleAllows } from '../lib/control/perms'
import {
  DEFAULT_MTL_SETTINGS, type AuditRow, type Baseline, type ItemStage, type MtlChange, type MtlDiscrepancy, type MtlGroup, type MtlLink, type MtlNorm, type MtlPackage, type MtlPattern, type MtlRole,
  type MtlSettings, type MtlTxn, type MtlUnit, type MtlLookup, type PackageItem, type PatternWeight, type ProjectRole, type Requisition, type RequisitionLine, type RequisitionSigner, type StageDef, type TxnKind, type VoucherOp,
} from '../types'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export interface LinkTarget { id: string; kind: 'risk' | 'issue'; code: string; title: string; status: string; ownerId: string | null; dueDate: string | null; realizedAt: string | null }

const explain = explainMaterialError
function report(action: string, error: { message: string } | null): boolean {
  if (!error) return false
  useSystemStore.getState().setStorageError(`خطا در ${action}: ${explain(error)}`)
  return true
}

interface State {
  loaded: boolean
  loading: boolean
  groups: MtlGroup[]
  units: MtlUnit[]
  stageDefs: StageDef[]
  patterns: MtlPattern[]
  patternWeights: PatternWeight[]
  packages: MtlPackage[]
  items: PackageItem[]
  stages: ItemStage[]
  baselines: Baseline[]
  changes: MtlChange[]
  txns: MtlTxn[]
  norms: MtlNorm[]
  discrepancies: MtlDiscrepancy[]
  links: MtlLink[]
  linkTargets: Map<string, LinkTarget>
  roles: ProjectRole[]
  lookups: MtlLookup[]
  /** only the shared pick-lists (fronts, stations…) — for modules that need the lists but not the whole material-control data */
  fetchLookups: () => Promise<void>
  weldSets: WeldSet[]
  weldLines: WeldLine[]
  requisitions: Requisition[]
  reqLines: RequisitionLine[]
  reqSigners: RequisitionSigner[]
  settings: MtlSettings
  settingsVersion: number
  people: Map<string, string>
  fetchAll: () => Promise<void>
  can: (projectId: string, action: string) => boolean
  myRoles: (projectId: string) => MtlRole[]
  // configuration (configurators)
  setGroupScrapAllow: (groupId: string, pct: number | null) => Promise<boolean>
  saveGroup: (g: Partial<MtlGroup> & { code: string; title: string }) => Promise<boolean>
  saveUnit: (u: MtlUnit) => Promise<boolean>
  saveStageDef: (s: StageDef) => Promise<boolean>
  savePattern: (id: string | null, code: string, title: string, weights: Record<string, number>, isDefault?: boolean) => Promise<boolean>
  saveSettings: (values: MtlSettings, note: string) => Promise<boolean>
  setRole: (projectId: string, userId: string, role: MtlRole, active: boolean) => Promise<boolean>
  // packages and stages
  savePackage: (projectId: string, p: Partial<MtlPackage> & { id?: string }) => Promise<string | null>
  deletePackage: (id: string) => Promise<boolean>
  addPackageItems: (packageId: string, rows: { materialId: string; qty: number; unitPrice: number; currency: string; plannedDelivery?: string | null; exceptionReason?: string }[]) => Promise<boolean>
  updatePackageItem: (id: string, patch: Partial<PackageItem>) => Promise<boolean>
  removePackageItem: (id: string) => Promise<boolean>
  planStage: (id: string, patch: { plannedDate?: string | null; responsible?: string | null }) => Promise<boolean>
  setApplicable: (stageId: string, applicable: boolean, reason: string) => Promise<boolean>
  reapplyPattern: (packageId: string) => Promise<{ updated: number; skipped: number } | null>
  stageSubmit: (stageId: string, a: { actual?: string | null; doneQty?: number | null; evidence: string; note?: string }) => Promise<boolean>
  stageDecide: (stageId: string, decision: 'approve' | 'reject', note?: string) => Promise<boolean>
  approveBaseline: (projectId: string, a: { note: string; method: string; currency: string; fx: number; baseDate: string }) => Promise<number | null>
  // MTO changes, discrepancies, ledger
  requestChange: (materialId: string, field: string, newValue: string, reason: string, doc?: string) => Promise<boolean>
  decideChange: (id: string, approve: boolean, note?: string) => Promise<boolean>
  syncDiscrepancies: (projectId: string, items: Record<string, unknown>[]) => Promise<{ upserted: number; cleared: number } | null>
  decideDiscrepancy: (id: string, a: { status: string; resolution?: string; responsible?: string | null; due?: string | null; impact?: string | null }) => Promise<boolean>
  postTxn: (a: { materialId: string; kind: TxnKind; qty: number; date: string; from?: string; to?: string; facility?: string; front?: string; allocationId?: string | null; op?: string; activityQty?: number | null; activityUnit?: string; contractorId?: string | null; doc?: string; notes?: string; sign?: 1 | -1 }) => Promise<boolean>
  decideTxn: (id: string, approve: boolean, note?: string) => Promise<boolean>
  voidTxn: (id: string, reason: string) => Promise<boolean>
  inspect: (lineId: string, status: 'accepted' | 'quarantine' | 'rejected') => Promise<boolean>
  saveNorm: (projectId: string, n: Partial<MtlNorm> & { qtyPerUnit: number }) => Promise<boolean>
  removeNorm: (id: string) => Promise<boolean>
  // risks and issues (the records stay in their own modules)
  raise: (a: { projectId: string; sources: { type: string; id: string }[]; target: 'risk' | 'issue'; title: string; description: string; severity: string; extra?: Record<string, unknown>; force?: boolean }) => Promise<{ id: string; existing: boolean } | null>
  linkExisting: (projectId: string, sources: { type: string; id: string }[], target: 'risk' | 'issue', targetId: string) => Promise<boolean>
  riskToIssue: (projectId: string, riskId: string, title: string, description: string, severity: string) => Promise<{ id: string; existing: boolean } | null>
  loadAudit: (projectId: string, limit?: number) => Promise<AuditRow[]>
  purgeDemo: (projectId: string) => Promise<boolean>
  // audited removal (administrator; requests and orders also by package editors)
  adminRemove: (kind: 'package' | 'request' | 'po', id: string, reason: string) => Promise<boolean>
  // warehouse issue requisitions with sequential signatures
  reqCreate: (a: { projectId: string; operation: VoucherOp; fromLoc: string; toLoc: string; workOp: string; activityQty: number | null; activityUnit: string; contractorId: string | null; adjustSign: 1 | -1; reason: string; facility: string; front: string; purpose: string; neededBy: string | null; notes: string; lines: { materialId: string; qty: number; notes?: string }[]; signers: { site_supervisor: string; supervision_supervisor: string; storekeeper: string } }) => Promise<string | null>
  reqSign: (id: string, decision: 'approve' | 'reject', note?: string, issue?: { lineId: string; qty: number }[]) => Promise<string | null>
  reqCancel: (id: string, reason: string) => Promise<boolean>
  saveWeldSet: (projectId: string, s: Partial<WeldSet> & { title: string }) => Promise<string | null>
  removeWeldSet: (id: string) => Promise<boolean>
  duplicateWeldSet: (id: string, title: string) => Promise<boolean>
  addWeldLine: (setId: string, materialId: string, qtyPerJoint: number, basis: WeldBasis) => Promise<boolean>
  updateWeldLine: (id: string, patch: { qtyPerJoint?: number; basis?: WeldBasis }) => Promise<boolean>
  removeWeldLine: (id: string) => Promise<boolean>
  addLookups: (projectId: string, kind: MtlLookup['kind'], labels: string[]) => Promise<boolean>
  setLookupActive: (id: string, active: boolean) => Promise<boolean>
  renameLookup: (projectId: string, kind: MtlLookup['kind'], oldLabel: string, newLabel: string) => Promise<number | null>
}

let lookupsPromise: Promise<void> | null = null
const initial = { loaded: false, loading: false, groups: [], units: [], stageDefs: [], patterns: [], patternWeights: [], packages: [], items: [], stages: [], baselines: [], changes: [], txns: [], norms: [], discrepancies: [], links: [], linkTargets: new Map<string, LinkTarget>(), roles: [], lookups: [], weldSets: [], weldLines: [], requisitions: [], reqLines: [], reqSigners: [], settings: DEFAULT_MTL_SETTINGS, settingsVersion: 0, people: new Map<string, string>() }

export const useMaterialControlStore = create<State>((set, get) => ({
  ...initial,

  fetchLookups: async () => {
    if (lookupsPromise) return lookupsPromise
    lookupsPromise = (async () => {
      const r = await supabase.from('mtl_lookups').select('*').order('sort')
      if (r.error) return
      set({ lookups: ((r.data ?? []) as Row[]).map((x): MtlLookup => ({ id: x.id, masterProjectId: x.master_project_id, kind: x.kind, label: x.label, active: !!x.active, sort: x.sort ?? 0 })) })
    })().finally(() => { lookupsPromise = null })
    return lookupsPromise
  },
  fetchAll: async () => {
    set({ loading: true })
    const t = (name: string) => supabase.from(name).select('*')
    const [groups, units, defs, pats, pw, pkgs, items, stages, bases, chg, txns, norms, disc, links, roles, sets, profs, reqs, reqLn, reqSg, lks, wsets, wlines] = await Promise.all([
      t('mtl_groups').order('sort'), t('mtl_units'), t('mtl_stage_defs').order('sort'), t('mtl_patterns'), t('mtl_pattern_weights'), t('mtl_packages'), t('mtl_package_items'), t('mtl_item_stages'), t('mtl_baselines').order('version'),
      t('mtl_changes').order('requested_at', { ascending: false }), t('mtl_txns').order('txn_date', { ascending: false }), t('mtl_norms'), t('mtl_discrepancies'), t('mtl_links'), t('mtl_project_roles'),
      t('mtl_settings_versions').order('version'), supabase.from('profiles').select('id, full_name'),
      t('mtl_requisitions').order('created_at', { ascending: false }), t('mtl_requisition_lines'), t('mtl_requisition_signers').order('sort'), t('mtl_lookups').order('sort'), t('mtl_weld_sets').order('created_at'), t('mtl_weld_lines'),
    ])
    // an un-migrated database leaves these empty rather than breaking the module
    const ok = <T,>(r: { data: T[] | null; error: unknown }): T[] => (r.error ? [] : r.data ?? [])
    const linkRows = ok<Row>(links)
    const issueIds = linkRows.filter((l) => l.target_type === 'issue').map((l) => l.target_id as string)
    const riskIds = linkRows.filter((l) => l.target_type === 'risk').map((l) => l.target_id as string)
    const [iss, rsk] = await Promise.all([
      issueIds.length ? supabase.from('im_issues').select('id, code, title, status, owner_id, pursuer_id, resolve_due_date, deadline_date').in('id', issueIds) : Promise.resolve({ data: [], error: null }),
      riskIds.length ? supabase.from('rm_risks').select('id, code, title, status, owner_id, next_review_date, realized_at').in('id', riskIds) : Promise.resolve({ data: [], error: null }),
    ])
    const targets = new Map<string, LinkTarget>()
    for (const r of ok<Row>(iss as never)) targets.set(r.id, { id: r.id, kind: 'issue', code: r.code ?? '', title: r.title ?? '', status: r.status ?? '', ownerId: r.owner_id ?? r.pursuer_id ?? null, dueDate: r.resolve_due_date ?? r.deadline_date ?? null, realizedAt: null })
    for (const r of ok<Row>(rsk as never)) targets.set(r.id, { id: r.id, kind: 'risk', code: r.code ?? '', title: r.title ?? '', status: r.status ?? '', ownerId: r.owner_id ?? null, dueDate: r.next_review_date ?? null, realizedAt: r.realized_at ?? null })
    const versions = ok<Row>(sets)
    const today = new Date().toISOString().slice(0, 10)
    const inForce = [...versions].reverse().find((v) => v.valid_from <= today)
    const settings: MtlSettings = { ...DEFAULT_MTL_SETTINGS, ...(inForce?.values_json ?? {}), priority: { ...DEFAULT_MTL_SETTINGS.priority, ...(inForce?.values_json?.priority ?? {}) } }
    const n = (x: unknown) => Number(x)
    set({
      groups: ok<Row>(groups).map((r): MtlGroup => ({ id: r.id, code: r.code, title: r.title, measureKind: r.measure_kind, defaultUnit: r.default_unit, isConsumable: !!r.is_consumable, scrapAllowPct: r.scrap_allow_pct == null ? null : n(r.scrap_allow_pct), patternId: r.pattern_id, leadTimeDays: r.lead_time_days, criticality: r.criticality, sort: r.sort, active: !!r.active })),
      units: ok<Row>(units).map((r): MtlUnit => ({ code: r.code, label: r.label, kind: r.kind, baseCode: r.base_code, toBase: n(r.to_base), active: !!r.active })),
      stageDefs: ok<Row>(defs).map((r): StageDef => ({ key: r.key, title: r.title, sort: r.sort, reviewLevel: r.review_level, needsEvidence: !!r.needs_evidence, active: !!r.active })),
      patterns: ok<Row>(pats).map((r): MtlPattern => ({ id: r.id, code: r.code, title: r.title, notes: r.notes ?? '', isDefault: !!r.is_default, active: !!r.active })),
      patternWeights: ok<Row>(pw).map((r): PatternWeight => ({ patternId: r.pattern_id, stageKey: r.stage_key, weight: n(r.weight) })),
      packages: ok<Row>(pkgs).map((r): MtlPackage => ({ id: r.id, masterProjectId: r.master_project_id, code: r.code, title: r.title, groupId: r.group_id, contractorOrgId: r.contractor_org_id, supplierOrgId: r.supplier_org_id, patternId: r.pattern_id, status: r.status, plannedStart: r.planned_start, plannedEnd: r.planned_end, notes: r.notes ?? '' })),
      items: ok<Row>(items).map((r): PackageItem => ({ id: r.id, packageId: r.package_id, materialId: r.material_id, qty: n(r.qty), unitPrice: n(r.unit_price), currency: r.currency, supplierOrgId: r.supplier_org_id, plannedDelivery: r.planned_delivery, baselineVersion: r.baseline_version, exceptionReason: r.exception_reason ?? '' })),
      stages: ok<Row>(stages).map((r): ItemStage => ({ id: r.id, itemId: r.item_id, stageKey: r.stage_key, applicable: !!r.applicable, naReason: r.na_reason ?? '', weight: n(r.weight), plannedDate: r.planned_date, actualDate: r.actual_date, responsible: r.responsible, status: r.status, doneQty: r.done_qty == null ? null : n(r.done_qty), approvedQty: n(r.approved_qty ?? 0), evidenceUrl: r.evidence_url ?? '', evidenceNote: r.evidence_note ?? '', submittedBy: r.submitted_by, submittedAt: r.submitted_at, reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, approvedBy: r.approved_by, approvedAt: r.approved_at, rejectReason: r.reject_reason ?? '' })),
      baselines: ok<Row>(bases).map((r): Baseline => ({ id: r.id, masterProjectId: r.master_project_id, version: r.version, note: r.note ?? '', priceMethod: r.price_method ?? '', currency: r.currency, fxRate: n(r.fx_rate), baseDate: r.base_date, totalValue: n(r.total_value), approvedAt: r.approved_at, approvedBy: r.approved_by })),
      changes: ok<Row>(chg).map((r): MtlChange => ({ id: r.id, masterProjectId: r.master_project_id, materialId: r.material_id, field: r.field, oldValue: r.old_value ?? '', newValue: r.new_value ?? '', reason: r.reason ?? '', docRef: r.doc_ref ?? '', status: r.status, requestedBy: r.requested_by, requestedAt: r.requested_at, decidedBy: r.decided_by, decidedAt: r.decided_at, decisionNote: r.decision_note ?? '' })),
      txns: ok<Row>(txns).map((r): MtlTxn => ({ id: r.id, masterProjectId: r.master_project_id, materialId: r.material_id, kind: r.kind, qty: n(r.qty), adjustSign: r.adjust_sign, txnDate: r.txn_date, fromLoc: r.from_loc ?? '', toLoc: r.to_loc ?? '', facility: r.facility ?? '', front: r.front ?? '', allocationId: r.allocation_id, workOp: r.work_op ?? '', activityQty: r.activity_qty == null ? null : n(r.activity_qty), activityUnit: r.activity_unit ?? '', contractorOrgId: r.contractor_org_id, docRef: r.doc_ref ?? '', status: r.status, voidReason: r.void_reason ?? '', notes: r.notes ?? '', isDemo: !!r.is_demo, createdBy: r.created_by, createdAt: r.created_at, approvedBy: r.approved_by })),
      norms: ok<Row>(norms).map((r): MtlNorm => ({ id: r.id, masterProjectId: r.master_project_id, materialId: r.material_id, groupId: r.group_id, workOp: r.work_op ?? '', perUnit: r.per_unit ?? '', qtyPerUnit: n(r.qty_per_unit), notes: r.notes ?? '' })),
      discrepancies: ok<Row>(disc).map((r): MtlDiscrepancy => ({ id: r.id, masterProjectId: r.master_project_id, materialId: r.material_id, packageId: r.package_id, kind: r.kind, source: r.source, fingerprint: r.fingerprint, diffQty: r.diff_qty == null ? null : n(r.diff_qty), probableCause: r.probable_cause ?? '', usageLocation: r.usage_location ?? '', impact: r.impact ?? '', responsible: r.responsible, dueDate: r.due_date, status: r.status, resolution: r.resolution ?? '', decidedBy: r.decided_by, decidedAt: r.decided_at, detectedAt: r.detected_at })),
      links: linkRows.map((r): MtlLink => ({ id: r.id, masterProjectId: r.master_project_id, sourceType: r.source_type, sourceId: r.source_id, targetType: r.target_type, targetId: r.target_id, rel: r.rel, label: r.label ?? '', createdAt: r.created_at })),
      linkTargets: targets,
      roles: ok<Row>(roles).map((r): ProjectRole => ({ id: r.id, projectId: r.project_id, userId: r.user_id, role: r.role, organizationId: r.organization_id, active: !!r.active })),
      weldSets: ok<Row>(wsets).map((r): WeldSet => ({ id: r.id, masterProjectId: r.master_project_id, title: r.title, jointSize: r.joint_size ?? '', thickness: r.thickness ?? '', process: r.process ?? '', jointCount: n(r.joint_count), pipeLengthM: n(r.pipe_length_m), notes: r.notes ?? '' })),
      weldLines: ok<Row>(wlines).map((r): WeldLine => ({ id: r.id, setId: r.set_id, materialId: r.material_id, qtyPerJoint: n(r.qty_per_joint), basis: r.basis === 'meter' ? 'meter' : 'joint', notes: r.notes ?? '' })),
      lookups: ok<Row>(lks).map((r): MtlLookup => ({ id: r.id, masterProjectId: r.master_project_id, kind: r.kind, label: r.label, active: !!r.active, sort: r.sort ?? 0 })),
      requisitions: ok<Row>(reqs).map((r): Requisition => ({ id: r.id, masterProjectId: r.master_project_id, number: r.number, requesterId: r.requester_id, requestDate: r.request_date, operation: r.operation ?? 'issue', fromLoc: r.from_loc ?? '', toLoc: r.to_loc ?? '', workOp: r.work_op ?? '', activityQty: r.activity_qty == null ? null : n(r.activity_qty), activityUnit: r.activity_unit ?? '', contractorOrgId: r.contractor_org_id ?? null, adjustSign: (r.adjust_sign ?? 1) as 1 | -1, reason: r.reason ?? '', facility: r.facility ?? '', front: r.front ?? '', purpose: r.purpose ?? '', neededBy: r.needed_by, notes: r.notes ?? '', status: r.status, rejectReason: r.reject_reason ?? '', issuedAt: r.issued_at, createdAt: r.created_at })),
      reqLines: ok<Row>(reqLn).map((r): RequisitionLine => ({ id: r.id, requisitionId: r.requisition_id, materialId: r.material_id, qtyRequested: n(r.qty_requested), stockAtRequest: n(r.stock_at_request), qtyIssued: n(r.qty_issued), notes: r.notes ?? '' })),
      reqSigners: ok<Row>(reqSg).map((r): RequisitionSigner => ({ id: r.id, requisitionId: r.requisition_id, role: r.role, sort: r.sort, userId: r.user_id, decision: r.decision, signedAt: r.signed_at, note: r.note ?? '', signatureImage: r.signature_image })),
      settings, settingsVersion: inForce?.version ?? 0,
      people: new Map(ok<Row>(profs).map((p) => [p.id as string, (p.full_name as string) || 'کاربر'])),
      loaded: true, loading: false,
    })
  },

  myRoles: (projectId) => {
    const uid = useAuthStore.getState().profile?.id
    return get().roles.filter((r) => r.projectId === projectId && r.userId === uid && r.active).map((r) => r.role)
  },
  can: (projectId, action) => {
    if (useAuthStore.getState().profile?.isAdmin) return true
    return roleAllows(get().myRoles(projectId), action, get().settings)
  },

  setGroupScrapAllow: async (groupId, pct) => {
    const { error } = await supabase.from('mtl_groups').update({ scrap_allow_pct: pct }).eq('id', groupId)
    if (report('ذخیرهٔ مبنای ضایعات', error)) return false
    await get().fetchAll(); return true
  },
  saveGroup: async (g) => {
    const row = { code: g.code, title: g.title, measure_kind: g.measureKind ?? 'count', default_unit: g.defaultUnit ?? null, is_consumable: g.isConsumable ?? false, pattern_id: g.patternId ?? null, lead_time_days: g.leadTimeDays ?? 0, criticality: g.criticality ?? 'B', sort: g.sort ?? 0, active: g.active ?? true }
    const { error } = g.id ? await supabase.from('mtl_groups').update(row).eq('id', g.id) : await supabase.from('mtl_groups').insert(row)
    if (report('ذخیرهٔ گروه کالا', error)) return false
    await get().fetchAll(); return true
  },
  saveUnit: async (u) => {
    const { error } = await supabase.from('mtl_units').upsert({ code: u.code, label: u.label, kind: u.kind, base_code: u.baseCode, to_base: u.toBase, active: u.active })
    if (report('ذخیرهٔ واحد', error)) return false
    await get().fetchAll(); return true
  },
  saveStageDef: async (s) => {
    const { error } = await supabase.from('mtl_stage_defs').upsert({ key: s.key, title: s.title, sort: s.sort, review_level: s.reviewLevel, needs_evidence: s.needsEvidence, active: s.active })
    if (report('ذخیرهٔ مرحلهٔ تأمین', error)) return false
    await get().fetchAll(); return true
  },
  savePattern: async (id, code, title, weights, isDefault = false) => {
    const { error } = await supabase.rpc('mtl_save_pattern', { p_id: id, p_code: code, p_title: title, p_weights: weights, p_default: isDefault })
    if (report('ذخیرهٔ الگوی وزنی', error)) return false
    await get().fetchAll(); return true
  },
  saveSettings: async (values, note) => {
    const { error } = await supabase.rpc('mtl_save_settings', { p_values: values, p_valid_from: new Date().toISOString().slice(0, 10), p_note: note })
    if (report('ذخیرهٔ تنظیمات', error)) return false
    await get().fetchAll(); return true
  },
  setRole: async (projectId, userId, role, active) => {
    const { error } = await supabase.rpc('mtl_set_role', { p_project: projectId, p_user: userId, p_role: role, p_active: active })
    if (report('ذخیرهٔ نقش', error)) return false
    await get().fetchAll(); return true
  },

  savePackage: async (projectId, p) => {
    const row = { code: p.code, title: p.title, group_id: p.groupId ?? null, contractor_org_id: p.contractorOrgId ?? null, supplier_org_id: p.supplierOrgId ?? null, pattern_id: p.patternId ?? null, status: p.status ?? 'draft', planned_start: p.plannedStart ?? null, planned_end: p.plannedEnd ?? null, notes: p.notes ?? '' }
    const res = p.id ? await supabase.from('mtl_packages').update(row).eq('id', p.id).select('id').single() : await supabase.from('mtl_packages').insert({ ...row, master_project_id: projectId }).select('id').single()
    if (report('ذخیرهٔ بستهٔ خرید', res.error)) return null
    await get().fetchAll(); return (res.data as Row).id as string
  },
  deletePackage: async (id) => {
    const { error } = await supabase.from('mtl_packages').delete().eq('id', id)
    if (report('حذف بستهٔ خرید', error)) return false
    await get().fetchAll(); return true
  },
  addPackageItems: async (packageId, rows) => {
    const { error } = await supabase.from('mtl_package_items').insert(rows.map((r) => ({ package_id: packageId, material_id: r.materialId, qty: r.qty, unit_price: r.unitPrice, currency: r.currency, planned_delivery: r.plannedDelivery ?? null, exception_reason: r.exceptionReason ?? '' })))
    if (report('افزودن قلم به بسته', error)) return false
    await get().fetchAll(); return true
  },
  updatePackageItem: async (id, patch) => {
    const row: Row = {}
    if (patch.qty !== undefined) row.qty = patch.qty
    if (patch.unitPrice !== undefined) row.unit_price = patch.unitPrice
    if (patch.plannedDelivery !== undefined) row.planned_delivery = patch.plannedDelivery
    if (patch.supplierOrgId !== undefined) row.supplier_org_id = patch.supplierOrgId
    const { error } = await supabase.from('mtl_package_items').update(row).eq('id', id)
    if (report('ویرایش قلم بسته', error)) return false
    await get().fetchAll(); return true
  },
  removePackageItem: async (id) => {
    const { error } = await supabase.from('mtl_package_items').delete().eq('id', id)
    if (report('حذف قلم از بسته', error)) return false
    await get().fetchAll(); return true
  },
  planStage: async (id, patch) => {
    const row: Row = {}
    if (patch.plannedDate !== undefined) row.planned_date = patch.plannedDate
    if (patch.responsible !== undefined) row.responsible = patch.responsible
    const { error } = await supabase.from('mtl_item_stages').update(row).eq('id', id)
    if (report('ذخیرهٔ برنامهٔ مرحله', error)) return false
    await get().fetchAll(); return true
  },
  setApplicable: async (stageId, applicable, reason) => {
    const { error } = await supabase.rpc('mtl_set_applicable', { p_stage: stageId, p_applicable: applicable, p_reason: reason })
    if (report('تغییر قابل‌اعمال‌بودن مرحله', error)) return false
    await get().fetchAll(); return true
  },
  reapplyPattern: async (packageId) => {
    const { data, error } = await supabase.rpc('mtl_reapply_pattern', { p_package: packageId })
    if (report('اعمال دوبارهٔ الگوی وزنی', error)) return null
    await get().fetchAll(); return data as { updated: number; skipped: number }
  },
  stageSubmit: async (stageId, a) => {
    const { error } = await supabase.rpc('mtl_stage_submit', { p_stage: stageId, p_actual: a.actual ?? null, p_done_qty: a.doneQty ?? null, p_evidence: a.evidence, p_note: a.note ?? '' })
    if (report('ارسال مرحلهٔ تأمین', error)) return false
    await get().fetchAll(); return true
  },
  stageDecide: async (stageId, decision, note = '') => {
    const { error } = await supabase.rpc('mtl_stage_decide', { p_stage: stageId, p_decision: decision, p_note: note })
    if (report(decision === 'approve' ? 'تأیید مرحله' : 'رد مرحله', error)) return false
    await get().fetchAll(); return true
  },
  approveBaseline: async (projectId, a) => {
    const { data, error } = await supabase.rpc('mtl_approve_baseline', { p_project: projectId, p_note: a.note, p_method: a.method, p_currency: a.currency, p_fx: a.fx, p_base_date: a.baseDate })
    if (report('تصویب مبنا', error)) return null
    await get().fetchAll(); return data as number
  },

  requestChange: async (materialId, field, newValue, reason, doc = '') => {
    const { error } = await supabase.rpc('mtl_request_change', { p_material: materialId, p_field: field, p_new: newValue, p_reason: reason, p_doc: doc })
    if (report('ثبت درخواست تغییر', error)) return false
    await get().fetchAll(); return true
  },
  decideChange: async (id, approve, note = '') => {
    const { error } = await supabase.rpc('mtl_decide_change', { p_id: id, p_approve: approve, p_note: note })
    if (report('تصمیم دربارهٔ تغییر', error)) return false
    await get().fetchAll(); return true
  },
  syncDiscrepancies: async (projectId, items) => {
    const { data, error } = await supabase.rpc('mtl_sync_discrepancies', { p_project: projectId, p_items: items })
    if (report('همگام‌سازی مغایرت‌ها', error)) return null
    await get().fetchAll(); return data as { upserted: number; cleared: number }
  },
  decideDiscrepancy: async (id, a) => {
    const { error } = await supabase.rpc('mtl_decide_discrepancy', { p_id: id, p_status: a.status, p_resolution: a.resolution ?? '', p_responsible: a.responsible ?? null, p_due: a.due ?? null, p_impact: a.impact ?? null })
    if (report('تعیین تکلیف مغایرت', error)) return false
    await get().fetchAll(); return true
  },
  postTxn: async (a) => {
    const { error } = await supabase.rpc('mtl_post_txn', { p_material: a.materialId, p_kind: a.kind, p_qty: a.qty, p_date: a.date, p_from: a.from ?? '', p_to: a.to ?? '', p_facility: a.facility ?? '', p_front: a.front ?? '', p_allocation: a.allocationId ?? null, p_op: a.op ?? '', p_activity_qty: a.activityQty ?? null, p_activity_unit: a.activityUnit ?? '', p_contractor: a.contractorId ?? null, p_doc: a.doc ?? '', p_notes: a.notes ?? '', p_sign: a.sign ?? null })
    if (report('ثبت تراکنش', error)) return false
    await get().fetchAll(); return true
  },
  decideTxn: async (id, approve, note = '') => {
    const { error } = await supabase.rpc('mtl_decide_txn', { p_id: id, p_approve: approve, p_note: note })
    if (report('تصمیم دربارهٔ تراکنش', error)) return false
    await get().fetchAll(); return true
  },
  voidTxn: async (id, reason) => {
    const { error } = await supabase.rpc('mtl_void_txn', { p_id: id, p_reason: reason })
    if (report('ابطال تراکنش', error)) return false
    await get().fetchAll(); return true
  },
  inspect: async (lineId, status) => {
    const uid = useAuthStore.getState().profile?.id ?? null
    const { error } = await supabase.from('mtl_warehouse_lines').update({ inspection_status: status, inspected_by: uid, inspected_at: new Date().toISOString() }).eq('id', lineId)
    if (report('ثبت بازرسی ورودی', error)) return false
    return true
  },
  saveNorm: async (projectId, n) => {
    const row = { master_project_id: projectId, material_id: n.materialId ?? null, group_id: n.groupId ?? null, work_op: n.workOp ?? '', per_unit: n.perUnit ?? '', qty_per_unit: n.qtyPerUnit, notes: n.notes ?? '' }
    const { error } = n.id ? await supabase.from('mtl_norms').update(row).eq('id', n.id) : await supabase.from('mtl_norms').insert(row)
    if (report('ذخیرهٔ مبنای مصرف', error)) return false
    await get().fetchAll(); return true
  },
  removeNorm: async (id) => {
    const { error } = await supabase.from('mtl_norms').delete().eq('id', id)
    if (report('حذف مبنای مصرف', error)) return false
    await get().fetchAll(); return true
  },

  raise: async (a) => {
    const { data, error } = await supabase.rpc('mtl_raise', { p_project: a.projectId, p_sources: a.sources, p_target: a.target, p_title: a.title, p_description: a.description, p_severity: a.severity, p_extra: a.extra ?? {}, p_force: a.force ?? false })
    if (report(a.target === 'risk' ? 'ثبت ریسک' : 'ثبت مسئله', error)) return null
    await get().fetchAll()
    const d = data as { id: string; existing: boolean }
    return { id: d.id, existing: d.existing }
  },
  linkExisting: async (projectId, sources, target, targetId) => {
    const { error } = await supabase.rpc('mtl_link_existing', { p_project: projectId, p_sources: sources, p_target: target, p_target_id: targetId })
    if (report('اتصال به رکورد موجود', error)) return false
    await get().fetchAll(); return true
  },
  riskToIssue: async (projectId, riskId, title, description, severity) => {
    const { data, error } = await supabase.rpc('mtl_risk_to_issue', { p_project: projectId, p_risk: riskId, p_title: title, p_description: description, p_severity: severity })
    if (report('تبدیل ریسک به مسئله', error)) return null
    await get().fetchAll()
    const d = data as { id: string; existing: boolean }
    return { id: d.id, existing: d.existing }
  },

  purgeDemo: async (projectId) => {
    // only rows flagged as demo go; dependent rows (order lines, receipts of those items, packages' items, ledger) follow by cascade
    const steps: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
      ['حذف تراکنش‌های آزمایشی', () => supabase.from('mtl_txns').delete().eq('master_project_id', projectId).eq('is_demo', true)],
      ['حذف سفارش‌های آزمایشی', () => supabase.from('mtl_purchase_orders').delete().eq('master_project_id', projectId).eq('is_demo', true)],
      ['حذف اقلام آزمایشی', () => supabase.from('mtl_materials').delete().eq('master_project_id', projectId).eq('is_demo', true)],
    ]
    for (const [label, run] of steps) { const { error } = await run(); if (report(label, error)) return false }
    // headers left without any line
    const [{ data: rc }, { data: sh }, { data: rel }] = await Promise.all([
      supabase.from('mtl_warehouse_receipts').select('id, mtl_warehouse_lines(id)').eq('master_project_id', projectId),
      supabase.from('mtl_shipments').select('id, mtl_shipment_lines(id)').eq('master_project_id', projectId),
      supabase.from('mtl_release_notes').select('id, mtl_release_lines(id)').eq('master_project_id', projectId),
    ])
    const empty = (rows: Row[] | null, k: string) => (rows ?? []).filter((r) => !(r[k] as unknown[])?.length).map((r) => r.id as string)
    for (const [tbl, ids] of [['mtl_warehouse_receipts', empty(rc, 'mtl_warehouse_lines')], ['mtl_shipments', empty(sh, 'mtl_shipment_lines')], ['mtl_release_notes', empty(rel, 'mtl_release_lines')]] as [string, string[]][]) {
      if (ids.length) { const { error } = await supabase.from(tbl).delete().in('id', ids); if (report('پاک‌سازی سرفصل‌های خالی', error)) return false }
    }
    await get().fetchAll(); return true
  },

  adminRemove: async (kind, id, reason) => {
    const { error } = await supabase.rpc('mtl_admin_remove', { p_kind: kind, p_id: id, p_reason: reason })
    if (report(kind === 'package' ? 'حذف بستهٔ خرید' : kind === 'request' ? 'حذف درخواست خرید' : 'حذف سفارش خرید', error)) return false
    await Promise.all([get().fetchAll(), useMaterialStore.getState().fetchAll()]); return true
  },
  reqCreate: async (a) => {
    const { data, error } = await supabase.rpc('mtl_req_create', { p_project: a.projectId, p_operation: a.operation, p_from: a.fromLoc, p_to: a.toLoc, p_work_op: a.workOp, p_activity_qty: a.activityQty, p_activity_unit: a.activityUnit, p_contractor: a.contractorId, p_sign: a.adjustSign, p_reason: a.reason, p_facility: a.facility, p_front: a.front, p_purpose: a.purpose, p_needed: a.neededBy, p_notes: a.notes, p_lines: a.lines.map((l) => ({ material_id: l.materialId, qty: l.qty, notes: l.notes ?? '' })), p_signers: a.signers })
    if (report('ثبت درخواست خروج کالا', error)) return null
    await get().fetchAll(); return data as string
  },
  reqSign: async (id, decision, note = '', issue) => {
    const { data, error } = await supabase.rpc('mtl_req_sign', { p_req: id, p_decision: decision, p_note: note, p_issue: issue ? issue.map((i) => ({ line_id: i.lineId, qty: i.qty })) : null })
    if (report(decision === 'approve' ? 'ثبت امضا' : 'رد درخواست', error)) return null
    await Promise.all([get().fetchAll(), useMaterialStore.getState().fetchAll()]); return data as string
  },
  reqCancel: async (id, reason) => {
    const { error } = await supabase.rpc('mtl_req_cancel', { p_req: id, p_reason: reason })
    if (report('لغو درخواست', error)) return false
    await get().fetchAll(); return true
  },

  saveWeldSet: async (projectId, s) => {
    const row = { title: s.title, joint_size: s.jointSize ?? '', thickness: s.thickness ?? '', process: s.process ?? '', joint_count: s.jointCount ?? 0, pipe_length_m: s.pipeLengthM ?? 0, notes: s.notes ?? '' }
    const res = s.id ? await supabase.from('mtl_weld_sets').update(row).eq('id', s.id).select('id').single() : await supabase.from('mtl_weld_sets').insert({ ...row, master_project_id: projectId }).select('id').single()
    if (report('ذخیرهٔ جدول مصرف سرجوش', res.error)) return null
    await get().fetchAll(); return (res.data as Row).id as string
  },
  removeWeldSet: async (id) => {
    const { error } = await supabase.from('mtl_weld_sets').delete().eq('id', id)
    if (report('حذف جدول مصرف سرجوش', error)) return false
    await get().fetchAll(); return true
  },
  duplicateWeldSet: async (id, title) => {
    const src = get().weldSets.find((x) => x.id === id); if (!src) return false
    const { data, error } = await supabase.from('mtl_weld_sets').insert({ master_project_id: src.masterProjectId, title, joint_size: src.jointSize, thickness: src.thickness, process: src.process, joint_count: 0, pipe_length_m: 0, notes: src.notes }).select('id').single()
    if (report('کپی جدول مصرف سرجوش', error)) return false
    const lines = get().weldLines.filter((l) => l.setId === id).map((l) => ({ set_id: (data as Row).id, material_id: l.materialId, qty_per_joint: l.qtyPerJoint, basis: l.basis ?? 'joint', notes: l.notes }))
    if (lines.length) { const r = await supabase.from('mtl_weld_lines').insert(lines); if (report('کپی ردیف‌های جدول', r.error)) return false }
    await get().fetchAll(); return true
  },
  addWeldLine: async (setId, materialId, qtyPerJoint, basis) => {
    const { error } = await supabase.from('mtl_weld_lines').upsert({ set_id: setId, material_id: materialId, qty_per_joint: qtyPerJoint, basis }, { onConflict: 'set_id,material_id' })
    if (report('افزودن کالا به جدول سرجوش', error)) return false
    await get().fetchAll(); return true
  },
  updateWeldLine: async (id, patch) => {
    const { error } = await supabase.from('mtl_weld_lines').update({ ...(patch.qtyPerJoint != null ? { qty_per_joint: patch.qtyPerJoint } : {}), ...(patch.basis ? { basis: patch.basis } : {}) }).eq('id', id)
    if (report('ویرایش مقدار مصرف', error)) return false
    await get().fetchAll(); return true
  },
  removeWeldLine: async (id) => {
    const { error } = await supabase.from('mtl_weld_lines').delete().eq('id', id)
    if (report('حذف ردیف جدول سرجوش', error)) return false
    await get().fetchAll(); return true
  },
  addLookups: async (projectId, kind, labels) => {
    const rows = [...new Set(labels.map((l) => l.trim()).filter(Boolean))].map((label) => ({ master_project_id: projectId, kind, label, active: true }))
    if (!rows.length) return true
    const { error } = await supabase.from('mtl_lookups').upsert(rows, { onConflict: 'master_project_id,kind,label' })
    if (report('ذخیرهٔ فهرست', error)) return false
    await get().fetchAll(); return true
  },
  setLookupActive: async (id, active) => {
    const { error } = await supabase.from('mtl_lookups').update({ active }).eq('id', id)
    if (report('تغییر وضعیت مورد فهرست', error)) return false
    await get().fetchAll(); return true
  },
  renameLookup: async (projectId, kind, oldLabel, newLabel) => {
    const { data, error } = await supabase.rpc('mtl_lookup_rename', { p_project: projectId, p_kind: kind, p_old: oldLabel, p_new: newLabel })
    if (report('تغییر نام مورد فهرست', error)) return null
    await Promise.all([get().fetchAll(), useMaterialStore.getState().fetchAll()]); return data as number
  },

  loadAudit: async (projectId, limit = 100) => {
    const { data, error } = await supabase.from('mtl_audit').select('*').eq('master_project_id', projectId).order('id', { ascending: false }).limit(limit)
    if (report('بارگذاری سابقهٔ فعالیت', error)) return []
    return ((data ?? []) as Row[]).map((r): AuditRow => ({ id: r.id, at: r.at, actor: r.actor, tableName: r.table_name, rowId: r.row_id, masterProjectId: r.master_project_id, action: r.action, oldRow: r.old_row, newRow: r.new_row }))
  },
}))
