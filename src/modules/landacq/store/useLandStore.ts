import { create } from 'zustand'
import { useMemo } from 'react'
import { useProjectContextStore } from '../platform'
import type { Activity, DocMeta, LandProjectData, Owner, Parcel, ProjectOption, RouteInfo, Stage, StageKey, TransferTarget } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import type { ActivityInput, DocInput, LandRepo, OwnerInput, ParcelDraft, ParcelFields } from '../repo/types'
import { buildDemo } from '../repo/demoSeed'
import { addDays, todayIso } from '../lib/dates'
import { STAGE_ORDER, makeStages } from '../lib/workflow'
import { analyze, buildActions, computeKpis, criticalConstraints, lengthByStatus, type Analysis } from '../lib/kpis'

export type ColorMode = 'status' | 'criticality' | 'ownership' | 'stage'
export type TabKey = 'tower' | 'map' | 'parcels' | 'schedule' | 'actions' | 'settings'

interface LandState {
  repo: LandRepo | null
  projects: ProjectOption[]
  projectId: string | null
  data: LandProjectData | null
  loading: boolean
  /** Last operation error (Persian), shown as a toast/banner. */
  error: string | null
  tab: TabKey
  selectedId: string | null
  colorMode: ColorMode
  today: string

  init: (repo: LandRepo) => Promise<void>
  selectProject: (id: string) => Promise<void>
  reload: () => Promise<void>
  setTab: (t: TabKey) => void
  selectParcel: (id: string | null) => void
  setColorMode: (m: ColorMode) => void
  clearError: () => void

  saveRoute: (route: RouteInfo) => Promise<void>
  /** Cut the route into equal parcels of about `segmentKm`. */
  generateParcels: (segmentKm: number, replace: boolean) => Promise<void>
  addParcel: (draft: ParcelDraft) => Promise<Parcel | null>
  updateParcel: (id: string, patch: Partial<ParcelFields>) => Promise<void>
  deleteParcel: (id: string) => Promise<void>
  /** Split one parcel at a km into two (stages and owners stay with the first part). */
  splitParcel: (id: string, atKm: number) => Promise<void>
  setStage: (parcelId: string, key: StageKey, patch: Partial<Stage>) => Promise<void>
  /** Finish the current step (today) and start the next one. */
  advanceStage: (parcelId: string) => Promise<void>
  saveOwner: (parcelId: string, owner: OwnerInput) => Promise<void>
  deleteOwner: (parcelId: string, ownerId: string) => Promise<void>
  saveDoc: (parcelId: string, doc: DocInput) => Promise<void>
  deleteDoc: (parcelId: string, docId: string) => Promise<void>
  saveActivity: (a: ActivityInput) => Promise<void>
  deleteActivity: (id: string) => Promise<void>
  transfer: (parcelId: string, target: TransferTarget, params?: Record<string, unknown>) => Promise<boolean>
  loadDemo: () => Promise<void>
  clearDemo: () => Promise<void>
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'خطای ناشناخته')

export const useLandStore = create<LandState>()((set, get) => {
  const repo = () => {
    const r = get().repo
    if (!r) throw new Error('مخزن داده آماده نیست')
    return r
  }
  const patchData = (f: (d: LandProjectData) => LandProjectData) => set((s) => (s.data ? { data: f(s.data) } : s))
  const patchParcel = (id: string, f: (p: Parcel) => Parcel) => patchData((d) => ({ ...d, parcels: d.parcels.map((p) => (p.id === id ? f(p) : p)) }))
  /** Run a repo operation; on failure show the error and re-sync from the server so the screen never lies. */
  const run = async <T>(op: () => Promise<T>, fallback?: T): Promise<T | undefined> => {
    try {
      return await op()
    } catch (e) {
      set({ error: msg(e) })
      await get().reload().catch(() => undefined)
      return fallback
    }
  }

  return {
    repo: null,
    projects: [],
    projectId: null,
    data: null,
    loading: false,
    error: null,
    tab: 'tower',
    selectedId: null,
    colorMode: 'status',
    today: todayIso(),

    init: async (r) => {
      set({ repo: r, loading: true, error: null })
      try {
        const projects = await r.listProjects()
        const ctx = useProjectContextStore.getState().projectId
        const pick = projects.find((p) => p.id === ctx)?.id ?? projects[0]?.id ?? null
        set({ projects, projectId: pick })
        if (pick) await get().selectProject(pick)
        else set({ loading: false })
      } catch (e) {
        set({ loading: false, error: msg(e) })
      }
    },

    selectProject: async (id) => {
      set({ projectId: id, loading: true, selectedId: null, error: null, today: todayIso() })
      useProjectContextStore.getState().setProject(id)
      try {
        const data = await repo().load(id)
        set({ data, loading: false })
      } catch (e) {
        set({ loading: false, data: null, error: msg(e) })
      }
    },

    reload: async () => {
      const id = get().projectId
      if (!id) return
      const data = await repo().load(id)
      set({ data, today: todayIso() })
    },

    setTab: (tab) => set({ tab }),
    selectParcel: (selectedId) => set({ selectedId }),
    setColorMode: (colorMode) => set({ colorMode }),
    clearError: () => set({ error: null }),

    saveRoute: async (route) => {
      await run(async () => {
        await repo().saveRoute(route)
        patchData((d) => ({ ...d, route }))
      })
    },

    generateParcels: async (segmentKm, replace) => {
      const { data, projectId } = get()
      if (!data?.route || !projectId) return
      const route = data.route
      await run(async () => {
        if (replace) for (const p of data.parcels) await repo().deleteParcel(p.id)
        else if (data.parcels.length) throw new Error('قطعه‌ای از قبل وجود دارد؛ برای ساخت دوباره گزینهٔ جایگزینی را بزنید')
        const drafts: ParcelDraft[] = []
        const end = route.startKm + route.totalKm
        let km = route.startKm
        let i = 1
        while (km < end - 1e-6) {
          const next = Math.min(+(km + segmentKm).toFixed(3), end)
          drafts.push({ code: `LP-${String(i).padStart(3, '0')}`, title: '', kmStart: +km.toFixed(3), kmEnd: next, landType: 'unknown', ownershipClass: 'unknown', landUse: '', ownerCountEst: 0, ownerKnown: false, custodian: '', disputeProbability: 0, complexity: 1, estDurationDays: null, flags: {}, acquisitionRoute: 'normal', areaM2: null, estCost: null, notes: '', stages: makeStages() })
          km = next
          i++
        }
        await repo().addParcels(projectId, drafts)
        await get().reload()
      })
    },

    addParcel: async (draft) => {
      const pid = get().projectId
      if (!pid) return null
      const made = await run(async () => {
        const [p] = await repo().addParcels(pid, [draft])
        patchData((d) => ({ ...d, parcels: [...d.parcels, p].sort((a, b) => a.kmStart - b.kmStart) }))
        return p
      })
      return made ?? null
    },

    updateParcel: async (id, patch) => {
      patchParcel(id, (p) => ({ ...p, ...patch }))
      await run(() => repo().updateParcel(id, patch))
    },

    deleteParcel: async (id) => {
      await run(async () => {
        await repo().deleteParcel(id)
        patchData((d) => ({ ...d, parcels: d.parcels.filter((p) => p.id !== id) }))
        if (get().selectedId === id) set({ selectedId: null })
      })
    },

    splitParcel: async (id, atKm) => {
      const p = get().data?.parcels.find((x) => x.id === id)
      if (!p || atKm <= p.kmStart + 0.01 || atKm >= p.kmEnd - 0.01) {
        set({ error: 'نقطهٔ برش باید داخل بازهٔ قطعه باشد' })
        return
      }
      await run(async () => {
        const { id: _i, stages: _s, owners: _o, docs: _d, riskId: _r, issueId: _is, scheduleWarningId: _w, masterProjectId: _m, isDemo, ...fields } = p
        void _i; void _s; void _o; void _d; void _r; void _is; void _w; void _m
        await repo().updateParcel(id, { kmEnd: atKm })
        await repo().addParcels(p.masterProjectId, [{ ...fields, code: `${p.code}-B`, kmStart: atKm, kmEnd: p.kmEnd, isDemo, stages: makeStages() }])
        await get().reload()
      })
    },

    setStage: async (parcelId, key, patch) => {
      const p = get().data?.parcels.find((x) => x.id === parcelId)
      const cur = p?.stages.find((s) => s.key === key)
      if (!p || !cur) return
      const next: Stage = { ...cur, ...patch }
      // finishing a step stamps today as its actual date unless one was typed
      if (next.status === 'done' && !next.actualDate) next.actualDate = get().today
      if (next.status !== 'done') next.actualDate = patch.actualDate ?? (patch.status ? null : next.actualDate)
      patchParcel(parcelId, (x) => ({ ...x, stages: x.stages.map((s) => (s.key === key ? next : s)) }))
      await run(() => repo().saveStage(parcelId, next))
    },

    advanceStage: async (parcelId) => {
      const p = get().data?.parcels.find((x) => x.id === parcelId)
      if (!p) return
      const idx = STAGE_ORDER.findIndex((k) => {
        const s = p.stages.find((x) => x.key === k)
        return s && s.status !== 'done' && s.status !== 'skipped'
      })
      if (idx < 0) return
      await get().setStage(parcelId, STAGE_ORDER[idx], { status: 'done' })
      const nextKey = STAGE_ORDER[idx + 1]
      if (nextKey) {
        const days = 14
        await get().setStage(parcelId, nextKey, { status: 'in_progress', plannedDate: p.stages.find((s) => s.key === nextKey)?.plannedDate ?? addDays(get().today, days) })
      }
    },

    saveOwner: async (parcelId, owner) => {
      await run(async () => {
        const saved: Owner = await repo().saveOwner(parcelId, owner)
        patchParcel(parcelId, (p) => ({ ...p, owners: owner.id ? p.owners.map((o) => (o.id === saved.id ? saved : o)) : [...p.owners, saved] }))
      })
    },
    deleteOwner: async (parcelId, ownerId) => {
      patchParcel(parcelId, (p) => ({ ...p, owners: p.owners.filter((o) => o.id !== ownerId) }))
      await run(() => repo().deleteOwner(ownerId))
    },
    saveDoc: async (parcelId, doc) => {
      await run(async () => {
        const saved: DocMeta = await repo().saveDoc(parcelId, doc)
        patchParcel(parcelId, (p) => ({ ...p, docs: doc.id ? p.docs.map((d) => (d.id === saved.id ? saved : d)) : [...p.docs, saved] }))
      })
    },
    deleteDoc: async (parcelId, docId) => {
      patchParcel(parcelId, (p) => ({ ...p, docs: p.docs.filter((d) => d.id !== docId) }))
      await run(() => repo().deleteDoc(docId))
    },

    saveActivity: async (a) => {
      const pid = get().projectId
      if (!pid) return
      await run(async () => {
        const saved: Activity = await repo().saveActivity(pid, a)
        patchData((d) => ({ ...d, activities: (a.id ? d.activities.map((x) => (x.id === saved.id ? saved : x)) : [...d.activities, saved]).sort((x, y) => x.sequence - y.sequence) }))
      })
    },
    deleteActivity: async (id) => {
      patchData((d) => ({ ...d, activities: d.activities.filter((a) => a.id !== id) }))
      await run(() => repo().deleteActivity(id))
    },

    transfer: async (parcelId, target, params) => {
      const ok = await run(async () => {
        await repo().transfer(parcelId, target, params)
        await get().reload()
        return true
      })
      return !!ok
    },

    loadDemo: async () => {
      const pid = get().projectId
      if (!pid) return
      set({ loading: true })
      await run(async () => {
        await repo().replaceDemo(pid, buildDemo(pid, todayIso()))
        await get().reload()
      })
      set({ loading: false })
    },
    clearDemo: async () => {
      const pid = get().projectId
      if (!pid) return
      await run(async () => {
        await repo().clearDemo(pid)
        await get().reload()
      })
    },
  }
})

// ------------------------------------------------------------------------------------------------ derived data

export interface LandAnalysis {
  rows: Analysis[]
  byId: Map<string, Analysis>
  kpis: ReturnType<typeof computeKpis>
  lengths: ReturnType<typeof lengthByStatus>
  constraints: Analysis[]
  actions: ReturnType<typeof buildActions>
}

/** Every derived figure the screens need, recomputed only when the project data or the day changes. */
export function useLandAnalysis(): LandAnalysis & { settings: typeof DEFAULT_SETTINGS; today: string } {
  const data = useLandStore((s) => s.data)
  const today = useLandStore((s) => s.today)
  return useMemo(() => {
    const settings = { ...DEFAULT_SETTINGS, ...(data?.route?.settings ?? {}) }
    const rows = analyze(data?.parcels ?? [], data?.activities ?? [], today, settings)
    return {
      rows,
      byId: new Map(rows.map((r) => [r.parcel.id, r])),
      kpis: computeKpis(rows, data?.route?.totalKm ?? 0, today, settings),
      lengths: lengthByStatus(rows),
      constraints: criticalConstraints(rows),
      actions: buildActions(rows, today, settings),
      settings,
      today,
    }
  }, [data, today])
}
