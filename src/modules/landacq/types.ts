export type OwnershipClass = 'private' | 'natural_resources' | 'exempt' | 'governmental' | 'unknown'
export type LandType = 'agricultural' | 'garden' | 'rangeland' | 'forest' | 'desert' | 'urban' | 'industrial' | 'riverbed' | 'road_rail' | 'other' | 'unknown'
export type AcqRoute = 'normal' | 'accelerated' | 'dispute'
export type StageKey =
  | 'identification'
  | 'ownership_status'
  | 'owner_identification'
  | 'preliminary_assessment'
  | 'expert_referral'
  | 'valuation'
  | 'financial_settlement'
  | 'payment'
  | 'release'
  | 'ready_for_construction'
export type StageStatus = 'not_started' | 'in_progress' | 'done' | 'blocked' | 'skipped'
export type AgreementStatus = 'unknown' | 'not_contacted' | 'negotiating' | 'agreed' | 'refused' | 'legal'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type DocStatus = 'pending' | 'submitted' | 'approved' | 'rejected'
export type CriticalityLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ParcelFlags {
  sensitive_area?: boolean
  has_facilities?: boolean
  past_dispute?: boolean
  high_value?: boolean
  critical_for_execution?: boolean
}

export interface Stage {
  key: StageKey
  status: StageStatus
  responsible: string
  /** ISO dates (yyyy-mm-dd) */
  plannedDate: string | null
  actualDate: string | null
  note: string
}

export interface Owner {
  id: string
  parcelId: string
  name: string
  contact: string
  sharePct: number | null
  agreement: AgreementStatus
  estAmount: number | null
  finalAmount: number | null
  payment: PaymentStatus
  released: boolean
  notes: string
}

/** Metadata only — the module never stores files. */
export interface DocMeta {
  id: string
  parcelId: string
  docType: string
  docNumber: string
  docDate: string | null
  issuer: string
  status: DocStatus
  note: string
  ref: string
}

export interface Parcel {
  id: string
  masterProjectId: string
  code: string
  title: string
  kmStart: number
  kmEnd: number
  landType: LandType
  ownershipClass: OwnershipClass
  landUse: string
  ownerCountEst: number
  ownerKnown: boolean
  custodian: string
  disputeProbability: number
  complexity: number
  estDurationDays: number | null
  flags: ParcelFlags
  acquisitionRoute: AcqRoute
  areaM2: number | null
  estCost: number | null
  notes: string
  riskId: string | null
  issueId: string | null
  scheduleWarningId: string | null
  isDemo: boolean
  stages: Stage[]
  owners: Owner[]
  docs: DocMeta[]
}

export interface Activity {
  id: string
  masterProjectId: string
  key: string
  name: string
  kmStart: number
  kmEnd: number
  startDate: string
  endDate: string
  sequence: number
  isDemo: boolean
}

export interface LandSettings {
  /** Safety margin added to the expected acquisition time when computing "start acquisition by". */
  bufferDays: number
  /** "Upcoming" look-ahead window used by the dashboard (X days). */
  horizonDays: number
}
export const DEFAULT_SETTINGS: LandSettings = { bufferDays: 30, horizonDays: 90 }

export interface RouteInfo {
  masterProjectId: string
  name: string
  totalKm: number
  startKm: number
  /** [lon, lat][] — empty when the project is modelled by chainage only. */
  geometry: [number, number][]
  geometrySource: 'none' | 'kml' | 'manual' | 'demo'
  settings: LandSettings
  isDemo: boolean
}

export interface LandEvent {
  id: number
  at: string
  parcelId: string | null
  actorId: string | null
  kind: string
  detail: Record<string, unknown>
}

export type TransferTarget = 'risk' | 'issue' | 'schedule'
export interface LinkedStatus {
  parcelId: string
  target: TransferTarget
  linkedId: string
  linkedCode: string
  linkedStatus: string
}

export interface LandProjectData {
  route: RouteInfo | null
  parcels: Parcel[]
  activities: Activity[]
  events: LandEvent[]
  linked: LinkedStatus[]
}

export interface ProjectOption {
  id: string
  name: string
  code: string
}
