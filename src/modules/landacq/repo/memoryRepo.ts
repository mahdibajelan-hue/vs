import type { Activity, ApprovalEntry, Crossing, Payment, ApprovalStatus, DocMeta, LandProjectData, LandRole, Owner, Parcel, Plot, ProjectOption, Stage, TransferTarget } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { makeStages } from '../lib/workflow'
import type { ActivityInput, DemoBundle, DocInput, LandRepo, OwnerInput, ParcelDraft, ParcelFields, PlotInput, CrossingInput, PaymentInput } from './types'
import { allowedActions, NEXT_STATUS } from '../lib/approval'

let seq = 0
const uid = (p: string) => `${p}-${++seq}-${Math.random().toString(36).slice(2, 6)}`

interface Store {
  route: LandProjectData['route']
  parcels: Parcel[]
  activities: Activity[]
  crossings: Crossing[]
  payments: Payment[]
}

/** In-memory repo for the demo harness and tests; same contract as the Supabase one. */
export function createMemoryRepo(projects: ProjectOption[], initialRole: LandRole | null = null): LandRepo & { asRole(role: LandRole | null): void } {
  let myRole: LandRole | null = initialRole
  const approvals: ApprovalEntry[] = []
  const roles: { userId: string; role: LandRole }[] = []
  const stores = new Map<string, Store>()
  const get = (id: string): Store => {
    let s = stores.get(id)
    if (!s) stores.set(id, (s = { route: null, parcels: [], activities: [], crossings: [], payments: [] }))
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
      ...d, id, masterProjectId, approvalStatus: d.approvalStatus ?? 'draft', approvalNote: '', priceException: d.priceException ?? null, planStart: d.planStart ?? null, plots: (d.plots ?? []).map((x) => ({ ...x, id: uid('pl'), parcelId: id })), kind: d.kind ?? 'route', stationType: d.stationType ?? '', siteLon: d.siteLon ?? null, siteLat: d.siteLat ?? null, legal: d.legal ?? {}, nextDeadline: d.nextDeadline ?? null, nextDeadlineLabel: d.nextDeadlineLabel ?? '', riskId: null, issueId: null, scheduleWarningId: null, isDemo: !!d.isDemo, stages,
      owners: (d.owners ?? []).map((o) => ({ ...o, id: uid('o'), parcelId: id })),
      docs: (d.docs ?? []).map((x) => ({ ...x, id: uid('d'), parcelId: id })),
    }
  }

  return {
    asRole(role) {
      myRole = role
    },
    async listProjects() {
      return projects
    },
    async load(masterProjectId) {
      const s = get(masterProjectId)
      return { route: s.route, parcels: structuredClone(s.parcels), activities: structuredClone(s.activities), events: [], linked: [], approvals: structuredClone(approvals), myRole, roles: structuredClone(roles), crossings: structuredClone(s.crossings), payments: structuredClone(s.payments) }
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
    async saveStages(items) {
      for (const x of items) await this.saveStage(x.parcelId, x.stage)
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
    async savePayment(masterProjectId, x: PaymentInput) {
      const s = get(masterProjectId)
      const { parcelCode: _code, ...rest } = x
      void _code
      const saved: Payment = { ...rest, id: x.id ?? uid('pay'), masterProjectId }
      s.payments = x.id ? s.payments.map((q) => (q.id === x.id ? saved : q)) : [...s.payments, saved]
      return saved
    },
    async deletePayment(id) {
      for (const s of stores.values()) s.payments = s.payments.filter((q) => q.id !== id)
    },
    async saveCrossing(masterProjectId, c: CrossingInput) {
      const s = get(masterProjectId)
      const saved: Crossing = { ...c, id: c.id ?? uid('x'), masterProjectId, riskId: s.crossings.find((x) => x.id === c.id)?.riskId ?? null, issueId: s.crossings.find((x) => x.id === c.id)?.issueId ?? null }
      s.crossings = c.id ? s.crossings.map((x) => (x.id === c.id ? saved : x)) : [...s.crossings, saved]
      return saved
    },
    async deleteCrossing(id) {
      for (const s of stores.values()) s.crossings = s.crossings.filter((x) => x.id !== id)
    },
    async transferCrossing(id, target) {
      for (const s of stores.values()) {
        const c = s.crossings.find((x) => x.id === id)
        if (c) {
          const nid = uid(target)
          if (target === 'issue') c.issueId = nid
          else c.riskId = nid
          return { id: nid }
        }
      }
      throw new Error('crossing_not_found')
    },
    async savePlot(parcelId, plot: PlotInput) {
      const p = parcelById(parcelId)
      const saved: Plot = { ...plot, id: plot.id ?? uid('pl'), parcelId }
      p.plots = plot.id ? p.plots.map((x) => (x.id === plot.id ? saved : x)) : [...p.plots, saved]
      return saved
    },
    async deletePlot(id) {
      for (const s of stores.values()) for (const p of s.parcels) p.plots = p.plots.filter((x) => x.id !== id)
    },
    async review(parcelId, action, comment) {
      const p = parcelById(parcelId)
      if (!allowedActions(p.approvalStatus, myRole, false).includes(action)) throw new Error('شما اجازهٔ این عملیات را ندارید')
      if ((action === 'return' || action === 'reopen') && !comment.trim()) throw new Error('برای برگشت‌دادن، توضیح لازم است')
      const next = NEXT_STATUS[action] as ApprovalStatus
      approvals.unshift({ id: approvals.length + 1, parcelId, at: new Date().toISOString(), actorId: 'me', role: myRole ?? '', action, comment })
      p.approvalStatus = next
      p.approvalNote = next === 'draft' ? comment : ''
      return next
    },
    async listPeople() {
      return [{ id: 'u1', name: 'کامران فرهادی', position: 'مسئول تحصیل اراضی پیمانکار' }, { id: 'u2', name: 'سمیه رحیمی', position: 'مشاور' }, { id: 'u3', name: 'دکتر امیری', position: 'حقوقی کارفرما' }, { id: 'u4', name: 'مهدی صادقی', position: 'مدیر پروژه' }]
    },
    async setRole(_masterProjectId, userId, role) {
      const i = roles.findIndex((r) => r.userId === userId)
      if (i >= 0) roles.splice(i, 1)
      if (role) roles.push({ userId, role })
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
      s.crossings = s.crossings.filter((c) => !c.isDemo)
      s.crossings.push(...(bundle.crossings ?? []).map((c) => ({ ...c, id: uid('x'), masterProjectId, riskId: null, issueId: null })))
      s.payments = s.payments.filter((q) => !q.isDemo)
      s.payments.push(...(bundle.payments ?? []).map(({ parcelCode, ...q }) => ({ ...q, id: uid('pay'), masterProjectId, parcelId: parcelCode ? (s.parcels.find((x) => x.code === parcelCode)?.id ?? null) : q.parcelId })))
    },
    async clearDemo(masterProjectId) {
      const s = get(masterProjectId)
      s.parcels = s.parcels.filter((p) => !p.isDemo)
      s.activities = s.activities.filter((a) => !a.isDemo)
      s.crossings = s.crossings.filter((c) => !c.isDemo)
      s.payments = s.payments.filter((q) => !q.isDemo)
      if (s.route?.isDemo) s.route = null
    },
  }
}
