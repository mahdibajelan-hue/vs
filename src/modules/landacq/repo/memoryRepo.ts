import type { Activity, DocMeta, LandProjectData, Owner, Parcel, ProjectOption, Stage, TransferTarget } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { makeStages } from '../lib/workflow'
import type { ActivityInput, DemoBundle, DocInput, LandRepo, OwnerInput, ParcelDraft, ParcelFields } from './types'

let seq = 0
const uid = (p: string) => `${p}-${++seq}-${Math.random().toString(36).slice(2, 6)}`

interface Store {
  route: LandProjectData['route']
  parcels: Parcel[]
  activities: Activity[]
}

/** In-memory repo for the demo harness and tests; same contract as the Supabase one. */
export function createMemoryRepo(projects: ProjectOption[]): LandRepo {
  const stores = new Map<string, Store>()
  const get = (id: string): Store => {
    let s = stores.get(id)
    if (!s) stores.set(id, (s = { route: null, parcels: [], activities: [] }))
    return s
  }
  const parcelById = (id: string) => {
    for (const s of stores.values()) {
      const p = s.parcels.find((x) => x.id === id)
      if (p) return p
    }
    throw new Error('parcel_not_found')
  }
  const toParcel = (masterProjectId: string, d: ParcelDraft): Parcel => {
    const id = d.id ?? uid('p')
    const stages = makeStages().map((s) => d.stages?.find((x) => x.key === s.key) ?? s)
    return {
      ...d, id, masterProjectId, riskId: null, issueId: null, scheduleWarningId: null, isDemo: !!d.isDemo, stages,
      owners: (d.owners ?? []).map((o) => ({ ...o, id: uid('o'), parcelId: id })),
      docs: (d.docs ?? []).map((x) => ({ ...x, id: uid('d'), parcelId: id })),
    }
  }

  return {
    async listProjects() {
      return projects
    },
    async load(masterProjectId) {
      const s = get(masterProjectId)
      return { route: s.route, parcels: structuredClone(s.parcels), activities: structuredClone(s.activities), events: [], linked: [] }
    },
    async saveRoute(route) {
      get(route.masterProjectId).route = { ...route, settings: { ...DEFAULT_SETTINGS, ...route.settings } }
    },
    async addParcels(masterProjectId, drafts) {
      const made = drafts.map((d) => toParcel(masterProjectId, d))
      get(masterProjectId).parcels.push(...made)
      return structuredClone(made)
    },
    async updateParcel(id, patch: Partial<ParcelFields>) {
      Object.assign(parcelById(id), patch)
    },
    async deleteParcel(id) {
      for (const s of stores.values()) s.parcels = s.parcels.filter((p) => p.id !== id)
    },
    async saveStage(parcelId, stage: Stage) {
      const p = parcelById(parcelId)
      p.stages = p.stages.map((s) => (s.key === stage.key ? { ...stage } : s))
    },
    async saveOwner(parcelId, owner: OwnerInput) {
      const p = parcelById(parcelId)
      const saved: Owner = { ...owner, id: owner.id ?? uid('o'), parcelId }
      p.owners = owner.id ? p.owners.map((o) => (o.id === owner.id ? saved : o)) : [...p.owners, saved]
      return saved
    },
    async deleteOwner(id) {
      for (const s of stores.values()) for (const p of s.parcels) p.owners = p.owners.filter((o) => o.id !== id)
    },
    async saveDoc(parcelId, doc: DocInput) {
      const p = parcelById(parcelId)
      const saved: DocMeta = { ...doc, id: doc.id ?? uid('d'), parcelId }
      p.docs = doc.id ? p.docs.map((d) => (d.id === doc.id ? saved : d)) : [...p.docs, saved]
      return saved
    },
    async deleteDoc(id) {
      for (const s of stores.values()) for (const p of s.parcels) p.docs = p.docs.filter((d) => d.id !== id)
    },
    async saveActivity(masterProjectId, a: ActivityInput) {
      const s = get(masterProjectId)
      const saved: Activity = { ...a, id: a.id ?? uid('a'), masterProjectId }
      s.activities = a.id ? s.activities.map((x) => (x.id === a.id ? saved : x)) : [...s.activities, saved]
      return saved
    },
    async deleteActivity(id) {
      for (const s of stores.values()) s.activities = s.activities.filter((a) => a.id !== id)
    },
    async transfer(parcelId, target: TransferTarget) {
      const p = parcelById(parcelId)
      const id = uid(target)
      if (target === 'risk') p.riskId = id
      else if (target === 'issue') p.issueId = id
      else p.scheduleWarningId = id
      return { target, id }
    },
    async replaceDemo(masterProjectId, bundle: DemoBundle) {
      const s = get(masterProjectId)
      s.parcels = s.parcels.filter((p) => !p.isDemo)
      s.activities = s.activities.filter((a) => !a.isDemo)
      s.route = { ...bundle.route, masterProjectId }
      s.parcels.push(...bundle.parcels.map((d) => toParcel(masterProjectId, d)))
      s.activities.push(...bundle.activities.map((a) => ({ ...a, id: uid('a'), masterProjectId })))
    },
    async clearDemo(masterProjectId) {
      const s = get(masterProjectId)
      s.parcels = s.parcels.filter((p) => !p.isDemo)
      s.activities = s.activities.filter((a) => !a.isDemo)
      if (s.route?.isDemo) s.route = null
    },
  }
}
