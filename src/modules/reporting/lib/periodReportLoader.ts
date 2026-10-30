import { supabase } from '../../../lib/supabaseClient'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { FORM_BY_KEY, STOPPAGE_CATEGORY_FA } from '../../execution/lib/formCatalog'
import { computeMetrics } from '../../execution/lib/forms'
import { TXN_KIND_LABEL_FA, type TxnKind } from '../../material/types'
import type { ProjectFacts } from './analyticsCore'
import type { SiteInput } from './periodReportCore'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0)
const d10 = (v: unknown) => (v ? String(v).slice(0, 10) : null)
/** a source that failed or is not migrated reads as «not recorded», never as an error on the page */
const rows = (r: { data: unknown; error: unknown }): Row[] | null => (r.error ? null : ((r.data as Row[]) ?? []))
const SENT = new Set(['submitted', 'partially_approved', 'approved'])

/**
 * Everything a site report needs for one project, from the modules that own it: the execution module's daily and
 * technical reports (production, work volumes, manpower, machinery, stoppages, QC findings, engineering documents),
 * material control (movements, receipts, shipments, orders, discrepancies) and finance (certificates, payments).
 * Drafts count only in the reporting-discipline tile; every other figure is from sent reports.
 */
export async function loadSiteInput(projectId: string, project: string, facts: ProjectFacts | null): Promise<SiteInput> {
  const ex = useExecutionStore.getState()
  if (!ex.coreLoaded && !ex.loading) await ex.fetchAll({ lite: true })
  const s = useExecutionStore.getState()

  const [qc, docs, txns, mats, recs, ships, pos, disc, contracts] = await Promise.all([
    supabase.from('ex_qc_findings').select('kind, severity, status, note, created_at, closed_at').eq('project_id', projectId),
    supabase.from('ex_eng_docs').select('doc_no, title, discipline, status, planned_prepared, actual_prepared, planned_approved, actual_approved, critical').eq('project_id', projectId).neq('status', 'superseded'),
    supabase.from('mtl_txns').select('material_id, kind, qty, txn_date, status').eq('master_project_id', projectId),
    supabase.from('mtl_materials').select('id, description, unit, material_code').eq('master_project_id', projectId),
    supabase.from('mtl_warehouse_receipts').select('receipt_number, receipt_date, warehouse_location').eq('master_project_id', projectId),
    supabase.from('mtl_shipments').select('shipment_number, shipment_date, eta, ata, status, origin').eq('master_project_id', projectId),
    supabase.from('mtl_purchase_orders').select('po_number, po_date, status').eq('master_project_id', projectId),
    supabase.from('mtl_discrepancies').select('detected_at, status, kind, probable_cause').eq('master_project_id', projectId),
    supabase.from('fin_contracts').select('id, contract_number, title').eq('master_project_id', projectId),
  ])
  const cs = rows(contracts) ?? []
  const cName = new Map(cs.map((c) => [c.id as string, (c.contract_number || c.title || '—') as string]))
  const certRes = cs.length ? await supabase.from('fin_payment_certificates').select('id, contract_id, certificate_number, certificate_date, gross_amount, certified_amount, paid_amount, status').in('contract_id', cs.map((c) => c.id)) : { data: [], error: null }
  const certs = (rows(certRes) ?? []).filter((c) => c.status !== 'draft' && c.status !== 'rejected')
  const certContract = new Map(certs.map((c) => [c.id as string, cName.get(c.contract_id) ?? '—']))
  const payRes = certs.length ? await supabase.from('fin_payments').select('certificate_id, payment_date, amount').in('certificate_id', certs.map((c) => c.id)) : { data: [], error: null }

  const reps = s.reports.filter((r) => r.projectId === projectId)
  const repById = new Map(reps.map((r) => [r.id, r]))
  const sent = (id: string) => { const r = repById.get(id); return r && SENT.has(r.status) ? r : null }
  const linesBy = new Map<string, typeof s.lines>()
  for (const l of s.lines) if (repById.has(l.reportId)) linesBy.set(l.reportId, [...(linesBy.get(l.reportId) ?? []), l])
  const acts = new Map(s.activities.filter((a) => a.projectId === projectId).map((a) => [a.id, a]))

  const production: SiteInput['production'] = []
  for (const r of reps) {
    if (!SENT.has(r.status)) continue
    const form = FORM_BY_KEY[r.formKey]
    if (!form?.metrics.length) continue
    for (const m of computeMetrics(form, linesBy.get(r.id) ?? [])) {
      if (!m.value) continue
      production.push({ date: r.reportDate, formKey: r.formKey, formTitle: form.title, metric: m.group ? `${m.metric.label} (${m.group})` : m.metric.label, group: m.group, unit: m.metric.unit, value: m.value, approved: r.status === 'approved' })
    }
  }
  const work: SiteInput['work'] = []
  for (const l of s.lines) {
    const r = sent(l.reportId)
    const a = l.activityId ? acts.get(l.activityId) : undefined
    if (!r || !a || !(l.qty > 0) || l.status === 'rejected') continue
    work.push({ date: r.reportDate, activityId: a.id, activity: a.title, chapter: a.chapter, unit: a.unit, baseQty: a.baseQty, qty: l.qty, approvedQty: l.approvedQty, unitPrice: a.unitPrice, weight: a.weight })
  }
  const resources: SiteInput['resources'] = s.resources.flatMap((x) => {
    const r = sent(x.reportId)
    return r ? [{ date: r.reportDate, kind: x.kind, name: x.name, section: x.section, total: x.totalQty, active: x.activeQty, idle: x.idleQty, stopped: x.stoppedQty, repair: x.repairQty }] : []
  })
  const stoppages: SiteInput['stoppages'] = s.stoppages.flatMap((x) => {
    const r = sent(x.reportId)
    return r ? [{ date: r.reportDate, category: STOPPAGE_CATEGORY_FA[x.category] ?? x.category, hours: x.hours, responsibility: x.responsibility, critical: x.critical, description: x.description }] : []
  })

  const matBy = new Map((rows(mats) ?? []).map((m) => [m.id as string, m]))
  const tx = rows(txns)
  return {
    projectId, project,
    reports: reps.map((r) => ({ id: r.id, formKey: r.formKey, formTitle: FORM_BY_KEY[r.formKey]?.title ?? r.formKey, date: r.reportDate, status: r.status, front: r.front })),
    production, work, resources, stoppages,
    qc: (rows(qc) ?? []).map((q) => ({ createdAt: q.created_at, closedAt: q.closed_at, severity: q.severity ?? 'medium', status: q.status, kind: q.kind ?? '', note: q.note ?? '' })),
    docs: rows(docs)?.map((x) => ({ docNo: x.doc_no ?? '', title: x.title ?? '', discipline: x.discipline ?? '', status: x.status ?? '', plannedPrepared: d10(x.planned_prepared), actualPrepared: d10(x.actual_prepared), plannedApproved: d10(x.planned_approved), actualApproved: d10(x.actual_approved), critical: !!x.critical })) ?? null,
    materials: tx?.map((x) => { const m = matBy.get(x.material_id); return { date: d10(x.txn_date) ?? '', kind: x.kind, kindLabel: TXN_KIND_LABEL_FA[x.kind as TxnKind] ?? x.kind, qty: n(x.qty), material: m?.description || m?.material_code || '—', unit: m?.unit ?? '', status: x.status } }) ?? null,
    receipts: rows(recs)?.map((x) => ({ date: d10(x.receipt_date) ?? '', number: x.receipt_number ?? '—', location: x.warehouse_location ?? '' })) ?? null,
    shipments: rows(ships)?.map((x) => ({ number: x.shipment_number ?? '—', date: d10(x.shipment_date), eta: d10(x.eta), ata: d10(x.ata), status: x.status ?? '', origin: x.origin ?? '' })) ?? null,
    orders: rows(pos)?.map((x) => ({ number: x.po_number ?? '—', date: d10(x.po_date), status: x.status ?? '' })) ?? null,
    discrepancies: rows(disc)?.map((x) => ({ detectedAt: d10(x.detected_at) ?? '', status: x.status ?? '', kind: x.kind ?? '', cause: x.probable_cause ?? '' })) ?? null,
    certificates: certs.map((c) => ({ number: c.certificate_number ?? '—', contract: certContract.get(c.id) ?? '—', date: d10(c.certificate_date), gross: n(c.gross_amount), certified: n(c.certified_amount), paid: n(c.paid_amount), status: c.status ?? '' })),
    payments: (rows(payRes) ?? []).map((p) => ({ date: d10(p.payment_date) ?? '', amount: n(p.amount), contract: certContract.get(p.certificate_id) ?? '—' })),
    facts,
  }
}

/** the latest date with a sent report — the natural default for a daily report */
export function latestReportDate(projectId: string): string | null {
  const r = useExecutionStore.getState().reports.find((x) => x.projectId === projectId && SENT.has(x.status))
  return r?.reportDate ?? null
}
