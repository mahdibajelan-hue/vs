import { supabase } from '../platform'
import type { Activity, ApprovalEntry, ApprovalStatus, DocMeta, LandEvent, LandProjectData, LinkedStatus, Owner, Parcel, Plot, RouteInfo, Stage, TransferTarget } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { makeStages, STAGE_ORDER } from '../lib/workflow'
import type { ActivityInput, DemoBundle, DocInput, LandRepo, OwnerInput, ParcelDraft, ParcelFields, PlotInput } from './types'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function fail(e: { message?: string; code?: string }): never {
  const m = e.message ?? ''
  const map: Record<string, string> = {
    already_transferred: 'این قطعه قبلاً منتقل شده است',
    no_risk_mapping: 'برای این پروژه نگاشت تأییدشدهٔ مدیریت ریسک تعریف نشده است',
    no_issue_mapping: 'برای این پروژه نگاشت تأییدشدهٔ مدیریت مسائل تعریف نشده است',
    not_allowed: 'شما اجازهٔ این عملیات را ندارید',
    comment_required: 'برای برگشت‌دادن، توضیح لازم است',
  }
  const key = Object.keys(map).find((k) => m.includes(k))
  throw new Error(key ? map[key] : e.code === '42501' ? 'شما اجازهٔ این عملیات را ندارید' : m || 'خطای ناشناخته')
}
const chk = <T extends { error: { message?: string; code?: string } | null }>(r: T): T => {
  if (r.error) fail(r.error)
  return r
}
const uid = () => crypto.randomUUID()
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

// ------------------------------------------------------------------------------------------------ mappers
const parcelRow = (f: Partial<ParcelFields>): Row => {
  const m: Record<string, string> = { code: 'code', title: 'title', kmStart: 'km_start', kmEnd: 'km_end', landType: 'land_type', ownershipClass: 'ownership_class', landUse: 'land_use', ownerCountEst: 'owner_count_est', ownerKnown: 'owner_known', custodian: 'custodian', disputeProbability: 'dispute_probability', complexity: 'complexity', estDurationDays: 'est_duration_days', flags: 'flags', acquisitionRoute: 'acquisition_route', areaM2: 'area_m2', estCost: 'est_cost', notes: 'notes', legal: 'legal', nextDeadline: 'next_deadline', nextDeadlineLabel: 'next_deadline_label' }
  const out: Row = {}
  // undefined must never become an explicit NULL (PostgREST bulk inserts fill keys missing from some rows with NULL)
  for (const [k, v] of Object.entries(f)) if (m[k] && v !== undefined) out[m[k]] = v
  return out
}
const stageFromRow = (r: Row): Stage => ({ key: r.stage_key, status: r.status, responsible: r.responsible ?? '', plannedDate: r.planned_date, actualDate: r.actual_date, note: r.note ?? '' })
const stageRow = (parcelId: string, s: Stage): Row => ({ parcel_id: parcelId, stage_key: s.key, status: s.status, responsible: s.responsible, planned_date: s.plannedDate, actual_date: s.actualDate, note: s.note })
const ownerFromRow = (r: Row): Owner => ({ id: r.id, parcelId: r.parcel_id, name: r.name, contact: r.contact ?? '', sharePct: num(r.share_pct), agreement: r.agreement, estAmount: num(r.est_amount), finalAmount: num(r.final_amount), payment: r.payment, released: r.release_status === 'released', notes: r.notes ?? '' })
const ownerRow = (parcelId: string, o: OwnerInput): Row => ({ ...(o.id ? { id: o.id } : {}), parcel_id: parcelId, name: o.name, contact: o.contact, share_pct: o.sharePct, agreement: o.agreement, est_amount: o.estAmount, final_amount: o.finalAmount, payment: o.payment, release_status: o.released ? 'released' : 'pending', notes: o.notes })
const docFromRow = (r: Row): DocMeta => ({ id: r.id, parcelId: r.parcel_id, docType: r.doc_type ?? '', docNumber: r.doc_number ?? '', docDate: r.doc_date, issuer: r.issuer ?? '', status: r.status, note: r.note ?? '', ref: r.ref ?? '' })
const docRow = (parcelId: string, d: DocInput): Row => ({ ...(d.id ? { id: d.id } : {}), parcel_id: parcelId, doc_type: d.docType, doc_number: d.docNumber, doc_date: d.docDate, issuer: d.issuer, status: d.status, note: d.note, ref: d.ref })
const plotFromRow = (r: Row): Plot => ({ id: r.id, parcelId: r.parcel_id, plotNo: r.plot_no ?? '', ownerName: r.owner_name ?? '', zone: r.utm_zone ?? 39, north: r.utm_north !== false, corners: (r.corners ?? []) as [number, number][], notes: r.notes ?? '', isDemo: !!r.is_demo })
const plotRow = (parcelId: string, p: PlotInput): Row => ({ ...(p.id ? { id: p.id } : {}), parcel_id: parcelId, plot_no: p.plotNo, owner_name: p.ownerName, utm_zone: p.zone, utm_north: p.north, corners: p.corners, notes: p.notes, is_demo: p.isDemo })
const activityFromRow = (r: Row): Activity => ({ id: r.id, masterProjectId: r.master_project_id, key: r.key, name: r.name, kmStart: Number(r.km_start), kmEnd: Number(r.km_end), startDate: r.start_date, endDate: r.end_date, sequence: r.sequence ?? 0, isDemo: !!r.is_demo })
const activityRow = (masterProjectId: string, a: ActivityInput): Row => ({ ...(a.id ? { id: a.id } : {}), master_project_id: masterProjectId, key: a.key, name: a.name, km_start: a.kmStart, km_end: a.kmEnd, start_date: a.startDate, end_date: a.endDate, sequence: a.sequence, is_demo: a.isDemo })
const routeFromRow = (r: Row): RouteInfo => ({ masterProjectId: r.master_project_id, name: r.name ?? '', totalKm: Number(r.total_km), startKm: Number(r.start_km), geometry: (r.geometry ?? []) as RouteInfo['geometry'], geometrySource: r.geometry_source, settings: { ...DEFAULT_SETTINGS, ...(r.settings ?? {}) }, isDemo: !!r.is_demo })

function parcelFromRow(r: Row, stages: Row[], owners: Row[], docs: Row[], plots: Row[]): Parcel {
  const st = makeStages().map((blank) => {
    const row = stages.find((s) => s.stage_key === blank.key)
    return row ? stageFromRow(row) : blank
  })
  return {
    id: r.id, masterProjectId: r.master_project_id, code: r.code ?? '', title: r.title ?? '', kmStart: Number(r.km_start), kmEnd: Number(r.km_end), landType: r.land_type, ownershipClass: r.ownership_class,
    landUse: r.land_use ?? '', ownerCountEst: r.owner_count_est ?? 0, ownerKnown: !!r.owner_known, custodian: r.custodian ?? '', disputeProbability: r.dispute_probability ?? 0, complexity: r.complexity ?? 1,
    estDurationDays: r.est_duration_days, flags: r.flags ?? {}, acquisitionRoute: r.acquisition_route, areaM2: num(r.area_m2), estCost: num(r.est_cost), notes: r.notes ?? '',
    legal: r.legal ?? {}, nextDeadline: r.next_deadline ?? null, nextDeadlineLabel: r.next_deadline_label ?? '', riskId: r.risk_id, issueId: r.issue_id, scheduleWarningId: r.schedule_warning_id, isDemo: !!r.is_demo, stages: st, owners: owners.map(ownerFromRow), docs: docs.map(docFromRow), plots: plots.map(plotFromRow),
    approvalStatus: r.approval_status ?? 'draft', approvalNote: r.approval_note ?? '',
  }
}

async function insertChunks(table: string, rows: Row[], size = 400) {
  for (let i = 0; i < rows.length; i += size) chk(await supabase.from(table).insert(rows.slice(i, i + size)))
}

export function createSupabaseRepo(): LandRepo {
  return {
    async listProjects() {
      const { data, error } = await supabase.from('master_projects').select('id, short_name, official_name, project_code, project_id_code').order('official_name')
      if (error) fail(error)
      return ((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.short_name || r.official_name, code: r.project_code || r.project_id_code || '' }))
    },

    async load(masterProjectId): Promise<LandProjectData> {
      const [route, parcels, activities, events, linked, approvals, roles, myRole] = await Promise.all([
        supabase.from('la_routes').select('*').eq('master_project_id', masterProjectId).maybeSingle(),
        supabase.from('la_parcels').select('*').eq('master_project_id', masterProjectId).order('km_start'),
        supabase.from('la_activities').select('*').eq('master_project_id', masterProjectId).order('sequence'),
        supabase.from('la_events').select('*').eq('master_project_id', masterProjectId).order('at', { ascending: false }).limit(300),
        supabase.rpc('la_linked_status', { p_master_project_id: masterProjectId }),
        supabase.from('la_approvals').select('*').eq('master_project_id', masterProjectId).order('at', { ascending: false }).limit(400),
        supabase.from('la_roles').select('user_id, role').eq('master_project_id', masterProjectId),
        supabase.rpc('la_my_role', { p_master_project_id: masterProjectId }),
      ])
      chk(route); chk(parcels); chk(activities); chk(events)
      const ids = ((parcels.data ?? []) as Row[]).map((p) => p.id)
      const [stages, owners, docs, plots] = ids.length
        ? await Promise.all([
            supabase.from('la_stages').select('*').in('parcel_id', ids),
            supabase.from('la_owners').select('*').in('parcel_id', ids).order('created_at'),
            supabase.from('la_docs').select('*').in('parcel_id', ids).order('created_at'),
            supabase.from('la_plots').select('*').in('parcel_id', ids).order('created_at'),
          ])
        : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }]
      chk(stages); chk(owners); chk(docs); chk(plots)
      const by = (rows: Row[] | null, id: string) => (rows ?? []).filter((r) => r.parcel_id === id)
      return {
        route: route.data ? routeFromRow(route.data as Row) : null,
        parcels: ((parcels.data ?? []) as Row[]).map((p) => parcelFromRow(p, by(stages.data as Row[], p.id), by(owners.data as Row[], p.id), by(docs.data as Row[], p.id), by(plots.data as Row[], p.id))),
        activities: ((activities.data ?? []) as Row[]).map(activityFromRow),
        events: ((events.data ?? []) as Row[]).map((e): LandEvent => ({ id: e.id, at: e.at, parcelId: e.parcel_id, actorId: e.actor_id, kind: e.kind, detail: e.detail ?? {} })),
        linked: linked.error ? [] : ((linked.data ?? []) as Row[]).map((l): LinkedStatus => ({ parcelId: l.parcel_id, target: l.target, linkedId: l.linked_id, linkedCode: l.linked_code ?? '', linkedStatus: l.linked_status ?? '' })),
        approvals: approvals.error ? [] : ((approvals.data ?? []) as Row[]).map((a): ApprovalEntry => ({ id: a.id, parcelId: a.parcel_id, at: a.at, actorId: a.actor_id, role: a.role ?? '', action: a.action, comment: a.comment ?? '' })),
        roles: roles.error ? [] : ((roles.data ?? []) as Row[]).map((x) => ({ userId: x.user_id, role: x.role })),
        myRole: myRole.error ? null : ((myRole.data as string | null) ?? null) as LandProjectData['myRole'],
      }
    },

    async saveRoute(route) {
      chk(await supabase.from('la_routes').upsert({ master_project_id: route.masterProjectId, name: route.name, total_km: route.totalKm, start_km: route.startKm, geometry: route.geometry, geometry_source: route.geometrySource, settings: route.settings, is_demo: route.isDemo }, { onConflict: 'master_project_id' }))
    },

    async addParcels(masterProjectId, drafts: ParcelDraft[]) {
      const withIds = drafts.map((d) => ({ ...d, id: d.id ?? uid() }))
      await insertChunks('la_parcels', withIds.map((d) => ({ id: d.id, master_project_id: masterProjectId, is_demo: !!d.isDemo, legal: {}, next_deadline_label: '', ...parcelRow(d) })))
      // the database trigger created the ten blank stages; overwrite those that came with data
      const stageRows = withIds.flatMap((d) => (d.stages ?? []).filter((s) => s.status !== 'not_started' || s.plannedDate).map((s) => stageRow(d.id, s)))
      for (let i = 0; i < stageRows.length; i += 400) chk(await supabase.from('la_stages').upsert(stageRows.slice(i, i + 400), { onConflict: 'parcel_id,stage_key' }))
      await insertChunks('la_owners', withIds.flatMap((d) => (d.owners ?? []).map((o) => ownerRow(d.id, o as OwnerInput))))
      await insertChunks('la_docs', withIds.flatMap((d) => (d.docs ?? []).map((x) => docRow(d.id, x as DocInput))))
      await insertChunks('la_plots', withIds.flatMap((d) => (d.plots ?? []).map((x) => plotRow(d.id, x as PlotInput))))
      for (const d of withIds) if (d.approvalStatus && d.approvalStatus !== 'draft') chk(await supabase.from('la_parcels').update({ approval_status: d.approvalStatus }).eq('id', d.id))
      const loaded = await this.load(masterProjectId)
      return loaded.parcels.filter((p) => withIds.some((d) => d.id === p.id))
    },

    async updateParcel(id, patch) {
      chk(await supabase.from('la_parcels').update(parcelRow(patch)).eq('id', id))
    },
    async deleteParcel(id) {
      chk(await supabase.from('la_parcels').delete().eq('id', id))
    },
    async saveStage(parcelId, stage) {
      chk(await supabase.from('la_stages').upsert(stageRow(parcelId, stage), { onConflict: 'parcel_id,stage_key' }))
    },
    async saveOwner(parcelId, owner) {
      const { data, error } = await supabase.from('la_owners').upsert(ownerRow(parcelId, owner)).select('*').single()
      if (error) fail(error)
      return ownerFromRow(data as Row)
    },
    async deleteOwner(id) {
      chk(await supabase.from('la_owners').delete().eq('id', id))
    },
    async saveDoc(parcelId, doc) {
      const { data, error } = await supabase.from('la_docs').upsert(docRow(parcelId, doc)).select('*').single()
      if (error) fail(error)
      return docFromRow(data as Row)
    },
    async deleteDoc(id) {
      chk(await supabase.from('la_docs').delete().eq('id', id))
    },
    async savePlot(parcelId, plot) {
      const { data, error } = await supabase.from('la_plots').upsert(plotRow(parcelId, plot)).select('*').single()
      if (error) fail(error)
      return plotFromRow(data as Row)
    },
    async deletePlot(id) {
      chk(await supabase.from('la_plots').delete().eq('id', id))
    },
    async review(parcelId, action, comment) {
      const { data, error } = await supabase.rpc('la_review', { p_parcel_id: parcelId, p_action: action, p_comment: comment })
      if (error) fail(error)
      return data as ApprovalStatus
    },
    async listPeople() {
      const { data, error } = await supabase.rpc('la_people')
      if (error) fail(error)
      return ((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.full_name || 'بدون نام', position: r.position_title ?? '' }))
    },
    async setRole(masterProjectId, userId, role) {
      chk(await supabase.rpc('la_set_role', { p_master_project_id: masterProjectId, p_user: userId, p_role: role ?? '' }))
    },
    async saveActivity(masterProjectId, a) {
      const { data, error } = await supabase.from('la_activities').upsert(activityRow(masterProjectId, a)).select('*').single()
      if (error) fail(error)
      return activityFromRow(data as Row)
    },
    async deleteActivity(id) {
      chk(await supabase.from('la_activities').delete().eq('id', id))
    },
    async transfer(parcelId, target: TransferTarget, params = {}) {
      const { data, error } = await supabase.rpc('la_transfer', { p_parcel_id: parcelId, p_target: target, p_params: params })
      if (error) fail(error)
      const r = data as { target: TransferTarget; id: string }
      return { target: r.target, id: r.id }
    },

    async clearDemo(masterProjectId) {
      chk(await supabase.from('la_parcels').delete().eq('master_project_id', masterProjectId).eq('is_demo', true))
      chk(await supabase.from('la_activities').delete().eq('master_project_id', masterProjectId).eq('is_demo', true))
      chk(await supabase.from('la_routes').delete().eq('master_project_id', masterProjectId).eq('is_demo', true))
    },
    async replaceDemo(masterProjectId, bundle: DemoBundle) {
      await this.clearDemo(masterProjectId)
      await this.saveRoute({ ...bundle.route, masterProjectId })
      await this.addParcels(masterProjectId, bundle.parcels)
      await insertChunks('la_activities', bundle.activities.map((a) => activityRow(masterProjectId, a)))
    },
  }
}

export { STAGE_ORDER }
