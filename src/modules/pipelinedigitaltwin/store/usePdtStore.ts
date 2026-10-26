import { create } from 'zustand'
import type { GeoPoint, Joint, JointFinalStatus, JointStatusField, Pipe, Route } from '../types'
import { computeRouteLength } from '../lib/chainage'
import { generateSyntheticRoute } from '../lib/demoData'
import { applyEvent, buildJoints, isDowngrade, jointNoOfId, jointOf, rowWith, STAGE_FIELD, type Asset, type AssetEvent, type JointRow, type StageKey } from '../lib/twinCore'
import * as repo from '../repo'
import { DEFAULT_SETTINGS, type RouteOrigin, type TwinSettings } from '../repo'

export type Lens = 'construction' | 'assets' | 'operation' | 'executive'
const EMPTY_ROUTE: Route = { points: [], hasElevationData: false, lengthMeters: 0, source: 'demo', fileName: null }
const FIELD_STAGE: Record<string, StageKey> = { weldingStatus: 'welding', ndtStatus: 'ndt', coatingStatus: 'coating', loweringStatus: 'lowering', backfillStatus: 'backfill' }

const routeOf = (pts: GeoPoint[], name: string | null, origin: RouteOrigin): Route =>
  pts.length < 2 ? EMPTY_ROUTE : { points: pts, hasElevationData: pts.every((p) => p.elevation != null), lengthMeters: computeRouteLength(pts), source: origin === 'land' ? 'kml' : name?.endsWith('.kmz') ? 'kmz' : origin === 'twin' && name && /\.km[lz]$/i.test(name) ? 'kml' : 'demo', fileName: name }
const pipeOf = (x: TwinSettings): Pipe => ({ id: 'pipe', diameterInch: x.diameterIn, wallThicknessMm: x.wallMm, material: x.material, designPressureBar: x.designPressureBar, fluidType: x.fluid })

/**
 * The digital twin of the project in context: its route (shared with the land module), pipe spec, every joint's
 * construction status, and the physical-asset register — all persisted (pdt_* tables). Nothing here is demo data unless a
 * user asks for the sample route.
 */
interface PdtState {
  projectId: string | null
  loading: boolean
  error: string | null
  saving: boolean
  /** a short confirmation after a save («۸۳ سرجوش ثبت شد») */
  flash: string | null
  route: Route
  routeOrigin: RouteOrigin
  startKm: number
  plannedKm: number | null
  phase: string | null
  settings: TwinSettings
  pipe: Pipe
  rows: Map<number, JointRow>
  joints: Joint[]
  assets: Asset[]
  events: AssetEvent[]
  lens: Lens
  importing: boolean
  importError: string
  selectedJointId: string | null
  selectedAssetId: string | null
  scrubDate: string | null
  statusFilter: JointFinalStatus | 'all'
  /** earliest stage date of the project's joints — where the timeline starts */
  projectCreatedAt: string

  load: (projectId: string) => Promise<void>
  setLens: (l: Lens) => void
  saveRoute: (pts: GeoPoint[], name: string, kind: 'kml' | 'demo', by: string, projectName: string) => Promise<void>
  createSampleRoute: (by: string, projectName: string) => Promise<void>
  saveSettings: (x: TwinSettings, by: string) => Promise<boolean>
  setImporting: (v: boolean) => void
  setImportError: (msg: string) => void
  selectJoint: (id: string | null) => void
  selectAsset: (id: string | null) => void
  /** one joint, one stage (or its notes / welders) */
  updateJointField: (jointId: string, field: JointStatusField | 'notes', value: string, by?: string) => Promise<void>
  /** every joint from `from` to `to` (joint numbers) gets `stage = value`, dated `atIso` */
  bulkUpdate: (p: { from: number; to: number; stage: StageKey; value: string; atIso: string; note: string; welders: string[] }, by: string) => Promise<boolean>
  saveAsset: (a: Partial<Asset> & { tag: string; kind: Asset['kind']; km: number }, by: string) => Promise<Asset | null>
  deleteAsset: (id: string) => Promise<boolean>
  addAssetEvent: (e: Omit<AssetEvent, 'id'>) => Promise<boolean>
  setScrubDate: (iso: string | null) => void
  setStatusFilter: (f: JointFinalStatus | 'all') => void
}

const msg = (e: unknown) => (e as { message?: string })?.message ?? 'خطای نامشخص'

export const usePdtStore = create<PdtState>()((set, get) => ({
  projectId: null, loading: false, error: null, saving: false, flash: null,
  route: EMPTY_ROUTE, routeOrigin: null, startKm: 0, plannedKm: null, phase: null,
  settings: DEFAULT_SETTINGS, pipe: pipeOf(DEFAULT_SETTINGS), rows: new Map(), joints: [], assets: [], events: [],
  lens: 'construction', importing: false, importError: '', selectedJointId: null, selectedAssetId: null, scrubDate: null, statusFilter: 'all',
  projectCreatedAt: new Date(Date.now() - 90 * 86400000).toISOString(),

  load: async (projectId) => {
    set({ loading: get().projectId !== projectId, projectId, error: null })
    try {
      const d = await repo.loadTwin(projectId)
      const route = routeOf(d.points, d.routeName, d.routeOrigin)
      const joints = buildJoints(route.lengthMeters, d.settings.stockLengthM, d.rows)
      const first = d.rows.flatMap((r) => [r.welding_at, r.ndt_at, r.coating_at, r.lowering_at, r.backfill_at]).filter(Boolean).sort()[0]
      set({
        loading: false, route, routeOrigin: d.routeOrigin, startKm: d.startKm, plannedKm: d.plannedKm, phase: d.phase,
        settings: d.settings, pipe: pipeOf(d.settings), rows: new Map(d.rows.map((r) => [r.joint_no, r])), joints, assets: d.assets, events: d.events,
        projectCreatedAt: first ? new Date(Date.parse(first) - 7 * 86400000).toISOString() : new Date(Date.now() - 90 * 86400000).toISOString(),
        selectedJointId: null, selectedAssetId: null, scrubDate: null,
      })
    } catch (e) {
      set({ loading: false, error: /pdt_|relation|schema cache/i.test(msg(e)) ? 'جدول‌های دوقلوی دیجیتال ساخته نشده‌اند (supabase/pdt/001_pdt.sql).' : msg(e) })
    }
  },
  setLens: (lens) => set({ lens, selectedJointId: null, selectedAssetId: null }),

  saveRoute: async (pts, name, kind, by, projectName) => {
    const pid = get().projectId
    if (!pid) return
    try {
      await repo.saveRoute(pid, pts, name, kind, get().settings, by, projectName)
      await get().load(pid)
      set({ flash: kind === 'demo' ? 'مسیر نمونه ساخته شد' : 'مسیر ذخیره شد' })
    } catch (e) { set({ importError: msg(e) }) }
  },
  createSampleRoute: async (by, projectName) => {
    const km = get().plannedKm && get().plannedKm! > 1 ? get().plannedKm! : 100
    await get().saveRoute(generateSyntheticRoute(km), 'مسیر نمونه (فرضی)', 'demo', by, projectName)
  },
  saveSettings: async (x, by) => {
    const pid = get().projectId
    if (!pid) return false
    try {
      await repo.saveSettings(pid, x, by)
      const rows = [...get().rows.values()]
      set({ settings: x, pipe: pipeOf(x), joints: buildJoints(get().route.lengthMeters, x.stockLengthM, rows), flash: 'مشخصات ذخیره شد' })
      return true
    } catch (e) { set({ error: msg(e) }); return false }
  },
  setImporting: (v) => set({ importing: v }),
  setImportError: (m) => set({ importError: m }),
  selectJoint: (id) => set({ selectedJointId: id, selectedAssetId: null }),
  selectAsset: (id) => set({ selectedAssetId: id, selectedJointId: null }),

  updateJointField: async (jointId, field, value, by = '') => {
    const { projectId, joints, rows, settings } = get()
    const j = joints.find((x) => x.id === jointId)
    if (!projectId || !j) return
    const no = jointNoOfId(jointId)
    const prev = rows.get(no)
    const at = new Date().toISOString()
    const row = field === 'notes' ? { ...rowWith(j, prev, 'welding', j.weldingStatus, prev?.welding_at ?? at), notes: value } : rowWith(j, prev, FIELD_STAGE[field], value, at)
    if (field !== 'notes' && j[field] === value) return
    set({ saving: true })
    try {
      await repo.upsertJointRows(projectId, [row], by)
      void repo.logJointEvent(projectId, no, no, field, value, '', by)
      const nextRows = new Map(rows).set(no, row)
      set({ saving: false, rows: nextRows, joints: joints.map((x) => (x.id === jointId ? jointOf(no, settings.stockLengthM, row) : x)) })
    } catch (e) { set({ saving: false, error: msg(e) }) }
  },
  bulkUpdate: async ({ from, to, stage, value, atIso, note, welders }, by) => {
    const { projectId, joints, rows, settings } = get()
    if (!projectId) return false
    const field = STAGE_FIELD[stage]
    const touched: JointRow[] = []
    for (let no = from; no <= to; no++) {
      const j = joints[no - 1]
      if (!j || j[field] === value || isDowngrade(stage, j[field], value)) continue
      touched.push(rowWith(j, rows.get(no), stage, value, atIso, stage === 'welding' && welders.length ? { welders } : undefined))
    }
    if (!touched.length) { set({ flash: 'همهٔ سرجوش‌های این بازه از قبل همین وضعیت را دارند' }); return true }
    set({ saving: true })
    try {
      await repo.upsertJointRows(projectId, touched, by)
      await repo.logJointEvent(projectId, from, to, field, value, note, by, atIso)
      const nextRows = new Map(rows)
      for (const r of touched) nextRows.set(r.joint_no, r)
      const next = joints.slice()
      for (const r of touched) next[r.joint_no - 1] = jointOf(r.joint_no, settings.stockLengthM, r)
      set({ saving: false, rows: nextRows, joints: next, flash: `${touched.length.toLocaleString('fa-IR')} سرجوش ثبت شد` })
      return true
    } catch (e) { set({ saving: false, error: msg(e) }); return false }
  },

  saveAsset: async (a, by) => {
    const pid = get().projectId
    if (!pid) return null
    try {
      const saved = await repo.saveAsset(pid, a, by)
      const assets = [...get().assets.filter((x) => x.id !== saved.id), saved].sort((x, y) => x.km - y.km)
      set({ assets, flash: a.id ? 'دارایی به‌روز شد' : 'دارایی ثبت شد' })
      return saved
    } catch (e) { set({ error: /duplicate|unique/i.test(msg(e)) ? 'این برچسب (Tag) قبلاً در همین پروژه ثبت شده است.' : msg(e) }); return null }
  },
  deleteAsset: async (id) => {
    try { await repo.deleteAsset(id); set({ assets: get().assets.filter((a) => a.id !== id), events: get().events.filter((e) => e.assetId !== id), selectedAssetId: null }); return true }
    catch (e) { set({ error: msg(e) }); return false }
  },
  addAssetEvent: async (e) => {
    const a = get().assets.find((x) => x.id === e.assetId)
    if (!a) return false
    const patch = applyEvent(a, e)
    try {
      const saved = await repo.addAssetEvent(e, patch)
      set({ events: [saved, ...get().events], assets: get().assets.map((x) => (x.id === a.id ? { ...x, ...patch } : x)), flash: 'رویداد ثبت شد' })
      return true
    } catch (err) { set({ error: msg(err) }); return false }
  },

  setScrubDate: (iso) => set({ scrubDate: iso }),
  setStatusFilter: (f) => set({ statusFilter: f }),
}))
