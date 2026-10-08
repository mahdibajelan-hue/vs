import type { Activity, DocMeta, LandProjectData, Owner, Parcel, ProjectOption, RouteInfo, Stage, TransferTarget } from '../types'

/** The editable fields of a parcel (everything but its children and ids). */
export type ParcelFields = Omit<Parcel, 'id' | 'masterProjectId' | 'stages' | 'owners' | 'docs' | 'riskId' | 'issueId' | 'scheduleWarningId' | 'isDemo' | 'legal' | 'nextDeadline' | 'nextDeadlineLabel'> & Partial<Pick<Parcel, 'legal' | 'nextDeadline' | 'nextDeadlineLabel'>>
export type ParcelDraft = ParcelFields & { id?: string; stages?: Stage[]; owners?: Omit<Owner, 'id' | 'parcelId'>[]; docs?: Omit<DocMeta, 'id' | 'parcelId'>[]; isDemo?: boolean }
export type OwnerInput = Omit<Owner, 'id'> & { id?: string }
export type DocInput = Omit<DocMeta, 'id'> & { id?: string }
export type ActivityInput = Omit<Activity, 'id' | 'masterProjectId'> & { id?: string }

export interface DemoBundle {
  route: RouteInfo
  parcels: ParcelDraft[]
  activities: ActivityInput[]
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
  saveActivity(masterProjectId: string, a: ActivityInput): Promise<Activity>
  deleteActivity(id: string): Promise<void>
  transfer(parcelId: string, target: TransferTarget, params?: Record<string, unknown>): Promise<{ target: TransferTarget; id: string }>
  /** Replaces every demo row of the project with `bundle` (real rows are never touched). */
  replaceDemo(masterProjectId: string, bundle: DemoBundle): Promise<void>
  clearDemo(masterProjectId: string): Promise<void>
}
