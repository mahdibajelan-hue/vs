import type { Activity, ApprovalStatus, Crossing, DocMeta, LandProjectData, Payment, LandRole, Owner, Parcel, Person, Plot, ProjectOption, ReviewAction, RouteInfo, Stage, TransferTarget } from '../types'

/** The editable fields of a parcel (everything but its children and ids). */
export type ParcelFields = Omit<Parcel, 'id' | 'masterProjectId' | 'stages' | 'owners' | 'docs' | 'riskId' | 'issueId' | 'scheduleWarningId' | 'isDemo' | 'legal' | 'nextDeadline' | 'nextDeadlineLabel' | 'approvalStatus' | 'approvalNote' | 'plots' | 'kind' | 'stationType' | 'siteLon' | 'siteLat' | 'priceException'> & Partial<Pick<Parcel, 'legal' | 'nextDeadline' | 'nextDeadlineLabel' | 'kind' | 'stationType' | 'siteLon' | 'siteLat' | 'priceException'>>
export type ParcelDraft = ParcelFields & { id?: string; stages?: Stage[]; plots?: Omit<Plot, 'id' | 'parcelId'>[]; approvalStatus?: ApprovalStatus; owners?: Omit<Owner, 'id' | 'parcelId'>[]; docs?: Omit<DocMeta, 'id' | 'parcelId'>[]; isDemo?: boolean }
export type OwnerInput = Omit<Owner, 'id'> & { id?: string }
export type DocInput = Omit<DocMeta, 'id'> & { id?: string }
export type PlotInput = Omit<Plot, 'id' | 'parcelId'> & { id?: string }
export type CrossingInput = Omit<Crossing, 'id' | 'masterProjectId' | 'riskId' | 'issueId'> & { id?: string }
export type PaymentInput = Omit<Payment, 'id' | 'masterProjectId'> & { id?: string; /** Demo data only: the parcel is looked up by its code once the parcels exist. */ parcelCode?: string }
export type ActivityInput = Omit<Activity, 'id' | 'masterProjectId'> & { id?: string }

export interface DemoBundle {
  route: RouteInfo
  parcels: ParcelDraft[]
  activities: ActivityInput[]
  crossings?: CrossingInput[]
  payments?: PaymentInput[]
}

/** The module's only connection to storage. `supabaseRepo` is the product; `memoryRepo` powers the demo harness and tests. */
export interface LandRepo {
  listProjects(): Promise<ProjectOption[]>
  load(masterProjectId: string): Promise<LandProjectData>
  saveRoute(route: RouteInfo): Promise<void>
  addParcels(masterProjectId: string, drafts: ParcelDraft[]): Promise<Parcel[]>
  updateParcel(id: string, patch: Partial<ParcelFields>): Promise<void>
  deleteParcel(id: string): Promise<void>
  saveStage(parcelId: string, stage: Stage): Promise<void>
  saveOwner(parcelId: string, owner: OwnerInput): Promise<Owner>
  deleteOwner(id: string): Promise<void>
  saveDoc(parcelId: string, doc: DocInput): Promise<DocMeta>
  deleteDoc(id: string): Promise<void>
  savePlot(parcelId: string, plot: PlotInput): Promise<Plot>
  deletePlot(id: string): Promise<void>
  /** Moves the parcel along the approval chain (the server checks the caller's role). */
  review(parcelId: string, action: ReviewAction, comment: string): Promise<ApprovalStatus>
  saveCrossing(masterProjectId: string, c: CrossingInput): Promise<Crossing>
  deleteCrossing(id: string): Promise<void>
  transferCrossing(id: string, target: 'issue' | 'risk', params?: Record<string, unknown>): Promise<{ id: string }>
  savePayment(masterProjectId: string, p: PaymentInput): Promise<Payment>
  deletePayment(id: string): Promise<void>
  listPeople(): Promise<Person[]>
  setRole(masterProjectId: string, userId: string, role: LandRole | null): Promise<void>
  saveActivity(masterProjectId: string, a: ActivityInput): Promise<Activity>
  deleteActivity(id: string): Promise<void>
  transfer(parcelId: string, target: TransferTarget, params?: Record<string, unknown>): Promise<{ target: TransferTarget; id: string }>
  /** Replaces every demo row of the project with `bundle` (real rows are never touched). */
  replaceDemo(masterProjectId: string, bundle: DemoBundle): Promise<void>
  clearDemo(masterProjectId: string): Promise<void>
}
