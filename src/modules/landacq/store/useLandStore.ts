import { create } from 'zustand'
import { useMemo } from 'react'
import { useAuthStore, useProjectContextStore } from '../platform'
import type { Activity, Crossing, DocMeta, LandProjectData, LandRole, Owner, Parcel, Person, Plot, ProjectOption, ReviewAction, RouteInfo, Stage, StageKey, TransferTarget } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import type { ActivityInput, DocInput, LandRepo, OwnerInput, ParcelDraft, ParcelFields, PlotInput, CrossingInput } from '../repo/types'
import { canEditData } from '../lib/approval'
import { buildDemo } from '../repo/demoSeed'
import { addDays, todayIso } from '../lib/dates'
import { makeStages, orderOf } from '../lib/workflow'
import { nextDeadline } from '../lib/legal'
import { crossingState } from '../lib/facilities'
import { analyze, buildActions, computeKpis, criticalConstraints, lengthByStatus, type Analysis } from '../lib/kpis'

export type ColorMode = 'status' | 'criticality' | 'ownership' | 'stage'
export type TabKey = 'tower' | 'map' | 'parcels' | 'stations' | 'crossings' | 'schedule' | 'actions' | 'settings'

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
  selectedCrossingId: string | null
  colorMode: ColorMode
  today: string

  init: (repo: LandRepo) => Promise<void>
  selectProject: (id: string) => Promise<void>
  reload: () => Promise<void>
  setTab: (t: TabKey) => void
  selectParcel: (id: string | null) => void
  selectCrossing: (id: string | null) => void
  saveCrossing: (c: CrossingInput) => Promise<void>
  deleteCrossing: (id: string) => Promise<void>
  transferCrossing: (id: string, target: 'issue' | 'risk', params?: Record<string, unknown>) => Promise<boolean>
  setColorMode: (m: ColorMode) => void
  clearError: () => void
  /** Approval chain (contractor -> consultant -> employer legal -> project manager). */
  review: (parcelId: string, action: ReviewAction, comment?: string) => Promise<boolean>
  savePlot: (parcelId: string, plot: PlotInput) => Promise<void>
  deletePlot: (parcelId: string, plotId: string) => Promise<void>
  people: Person[]
  loadPeople: () => Promise<void>
  setRole: (userId: string, role: LandRole | null) => Promise<void>

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
  /** Keeps parcels.next_deadline (what the header bell reads) equal to the nearest open legal deadline. */
  const syncDeadline = async (id: string) => {
    const p = get().data?.parcels.find((x) => x.id === id)
    if (!p) return
    const nd = nextDeadline(p, get().today)
    const date = nd?.date ?? null
    const label = nd?.label ?? ''
    if (p.nextDeadline === date && p.nextDeadlineLabel === label) return
    patchParcel(id, (x) => ({ ...x, nextDeadline: date, nextDeadlineLabel: label }))
    try {
      await get().repo?.updateParcel(id, { nextDeadline: date, nextDeadlineLabel: label })
    } catch {
      /* read-only users cannot persist the derived value; the screen is still right */
    }
  }
  const syncCrossing = async (id: string) => {
    const c = get().data?.crossings.find((x) => x.id === id)
    if (!c) return
    const nd = crossingState(c, get().data?.activities ?? [], get().today).next
    const date = nd?.date ?? null
    const label = nd?.label ?? ''
    if (c.nextDeadline === date && c.nextDeadlineLabel === label) return
    patchData((d) => ({ ...d, crossings: d.crossings.map((x) => (x.id === id ? { ...x, nextDeadline: date, nextDeadlineLabel: label } : x)) }))
    try {
      await get().repo?.saveCrossing(c.masterProjectId, { ...c, nextDeadline: date, nextDeadlineLabel: label })
    } catch {
      /* read-only users cannot persist the derived value */
    }
  }
  const crossingAllowed = (): boolean => {
    const st = get()
    const role = st.data?.myRole ?? null
    const isAdmin = !!useAuthStore.getState().profile?.isAdmin
    const ok = isAdmin || role === 'contractor' || !role
    if (!ok) set({ error: 'ورود و ویرایش اطلاعات عبورها فقط برای پیمانکار ممکن است؛ نقش شما بررسی و تأیید است.' })
    return ok
  }
  const patchParcel = (id: string, f: (p: Parcel) => Parcel) => patchData((d) => ({ ...d, parcels: d.parcels.map((p) => (p.id === id ? f(p) : p)) }))
  /** Data entry belongs to the contractor while a parcel is a draft (users without a project role keep the permission-based rule). */
  const allowed = (parcelId: string, onlyLegal = false): boolean => {
    const st = get()
    const p = st.data?.parcels.find((x) => x.id === parcelId)
    if (!p) return false
    const role = st.data?.myRole ?? null
    const isAdmin = !!useAuthStore.getState().profile?.isAdmin
    const ok = canEditData(p, role, isAdmin, true) || (onlyLegal && role === 'employer_legal')
    if (!ok) set({ error: 'ورود و ویرایش اطلاعات فقط برای پیمانکار و پیش از ارسال برای بررسی ممکن است.' })
    return ok
  }
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
    people: [],
    selectedId: null,
    selectedCrossingId: null,
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
        void Promise.all(data.parcels.map((p) => syncDeadline(p.id)))
        void Promise.all(data.crossings.map((c) => syncCrossing(c.id)))
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
    selectParcel: (selectedId) => set({ selectedId, selectedCrossingId: null }),
    selectCrossing: (selectedCrossingId) => set({ selectedCrossingId, selectedId: null }),
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
        const routeParcels = data.parcels.filter((p) => p.kind !== 'station')
        if (replace) for (const p of routeParcels) await repo().deleteParcel(p.id)
        else if (routeParcels.length) throw new Error('قطعه‌ای از قبل وجود دارد؛ برای ساخت دوباره گزینهٔ جایگزینی را بزنید')
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
      if (!allowed(id, Object.keys(patch).every((k) => k === 'legal'))) return
      patchParcel(id, (p) => ({ ...p, ...patch }))
      await run(() => repo().updateParcel(id, patch))
      await syncDeadline(id)
    },

    deleteParcel: async (id) => {
      if (!allowed(id)) return
      await run(async () => {
        await repo().deleteParcel(id)
        patchData((d) => ({ ...d, parcels: d.parcels.filter((p) => p.id !== id) }))
        if (get().selectedId === id) set({ selectedId: null })
      })
    },

    splitParcel: async (id, atKm) => {
      if (!allowed(id)) return
      const p = get().data?.parcels.find((x) => x.id === id)
      if (!p || atKm <= p.kmStart + 0.01 || atKm >= p.kmEnd - 0.01) {
        set({ error: 'نقطهٔ برش باید داخل بازهٔ قطعه باشد' })
        return
      }
      await run(async () => {
        const { id: _i, stages: _s, owners: _o, docs: _d, plots: _pl, approvalStatus: _a, approvalNote: _an, riskId: _r, issueId: _is, scheduleWarningId: _w, masterProjectId: _m, isDemo, ...fields } = p
        void _i; void _s; void _o; void _d; void _pl; void _a; void _an; void _r; void _is; void _w; void _m
        await repo().updateParcel(id, { kmEnd: atKm })
        await repo().addParcels(p.masterProjectId, [{ ...fields, code: `${p.code}-B`, kmStart: atKm, kmEnd: p.kmEnd, isDemo, stages: makeStages() }])
        await get().reload()
      })
    },

    setStage: async (parcelId, key, patch) => {
      if (!allowed(parcelId)) return
      const p = get().data?.parcels.find((x) => x.id === parcelId)
      const cur = p?.stages.find((s) => s.key === key)
      if (!p || !cur) return
      const next: Stage = { ...cur, ...patch }
      // finishing a step stamps today as its actual date unless one was typed
      if (next.status === 'done' && !next.actualDate) next.actualDate = get().today
      if (next.status !== 'done') next.actualDate = patch.actualDate ?? (patch.status ? null : next.actualDate)
      patchParcel(parcelId, (x) => ({ ...x, stages: x.stages.map((s) => (s.key === key ? next : s)) }))
      await run(() => repo().saveStage(parcelId, next))
      await syncDeadline(parcelId)
    },

    advanceStage: async (parcelId) => {
      const p = get().data?.parcels.find((x) => x.id === parcelId)
      if (!p) return
      const order = orderOf(p)
      const idx = order.findIndex((k) => {
        const s = p.stages.find((x) => x.key === k)
        return s && s.status !== 'done' && s.status !== 'skipped'
      })
      if (idx < 0) return
      await get().setStage(parcelId, order[idx], { status: 'done' })
      const nextKey = order[idx + 1]
      if (nextKey) {
        const days = 14
        await get().setStage(parcelId, nextKey, { status: 'in_progress', plannedDate: p.stages.find((s) => s.key === nextKey)?.plannedDate ?? addDays(get().today, days) })
      }
    },

    saveOwner: async (parcelId, owner) => {
      if (!allowed(parcelId)) return
      await run(async () => {
        const saved: Owner = await repo().saveOwner(parcelId, owner)
        patchParcel(parcelId, (p) => ({ ...p, owners: owner.id ? p.owners.map((o) => (o.id === saved.id ? saved : o)) : [...p.owners, saved] }))
      })
    },
    deleteOwner: async (parcelId, ownerId) => {
      if (!allowed(parcelId)) return
      patchParcel(parcelId, (p) => ({ ...p, owners: p.owners.filter((o) => o.id !== ownerId) }))
      await run(() => repo().deleteOwner(ownerId))
    },
    saveDoc: async (parcelId, doc) => {
      if (!allowed(parcelId)) return
      await run(async () => {
        const saved: DocMeta = await repo().saveDoc(parcelId, doc)
        patchParcel(parcelId, (p) => ({ ...p, docs: doc.id ? p.docs.map((d) => (d.id === saved.id ? saved : d)) : [...p.docs, saved] }))
      })
    },
    deleteDoc: async (parcelId, docId) => {
      if (!allowed(parcelId)) return
      patchParcel(parcelId, (p) => ({ ...p, docs: p.docs.filter((d) => d.id !== docId) }))
      await run(() => repo().deleteDoc(docId))
    },

    saveCrossing: async (c) => {
      const pid = get().projectId
      if (!pid || !crossingAllowed()) return
      await run(async () => {
        const saved: Crossing = await repo().saveCrossing(pid, c)
        patchData((d) => ({ ...d, crossings: (c.id ? d.crossings.map((x) => (x.id === saved.id ? saved : x)) : [...d.crossings, saved]).sort((a, b) => a.km - b.km) }))
        await syncCrossing(saved.id)
      })
    },
    deleteCrossing: async (id) => {
      if (!crossingAllowed()) return
      patchData((d) => ({ ...d, crossings: d.crossings.filter((x) => x.id !== id) }))
      if (get().selectedCrossingId === id) set({ selectedCrossingId: null })
      await run(() => repo().deleteCrossing(id))
    },
    transferCrossing: async (id, target, params) => {
      const ok = await run(async () => {
        await repo().transferCrossing(id, target, params)
        await get().reload()
        return true
      })
      return !!ok
    },
    savePlot: async (parcelId, plot) => {
      if (!allowed(parcelId)) return
      await run(async () => {
        const saved: Plot = await repo().savePlot(parcelId, plot)
        patchParcel(parcelId, (p) => ({ ...p, plots: plot.id ? p.plots.map((x) => (x.id === saved.id ? saved : x)) : [...p.plots, saved] }))
      })
    },
    deletePlot: async (parcelId, plotId) => {
      if (!allowed(parcelId)) return
      patchParcel(parcelId, (p) => ({ ...p, plots: p.plots.filter((x) => x.id !== plotId) }))
      await run(() => repo().deletePlot(plotId))
    },
    review: async (parcelId, action, comment = '') => {
      const ok = await run(async () => {
        await repo().review(parcelId, action, comment)
        await get().reload()
        return true
      })
      return !!ok
    },
    loadPeople: async () => {
      const people = await run(() => repo().listPeople())
      if (people) set({ people })
    },
    setRole: async (userId, role) => {
      const pid = get().projectId
      if (!pid) return
      await run(async () => {
        await repo().setRole(pid, userId, role)
        await get().reload()
      })
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
  /** Route parcels only (km stretches). Stations are in `stations`; `byId` has both. */
  rows: Analysis[]
  stations: Analysis[]
  crossings: { c: Crossing; st: ReturnType<typeof crossingState> }[]
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
    const all = analyze(data?.parcels ?? [], data?.activities ?? [], today, settings)
    const rows = all.filter((r) => r.parcel.kind !== 'station')
    const stations = all.filter((r) => r.parcel.kind === 'station')
    const crossings = (data?.crossings ?? []).map((c) => ({ c, st: crossingState(c, data?.activities ?? [], today) }))
    return {
      rows,
      stations,
      crossings,
      byId: new Map(all.map((r) => [r.parcel.id, r])),
      kpis: computeKpis(rows, data?.route?.totalKm ?? 0, today, settings),
      lengths: lengthByStatus(rows),
      constraints: criticalConstraints(all),
      actions: buildActions(all, today, settings),
      settings,
      today,
    }
  }, [data, today])
}
