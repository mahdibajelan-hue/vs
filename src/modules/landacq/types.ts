export type OwnershipClass = 'private' | 'natural_resources' | 'exempt' | 'governmental' | 'unknown'
export type LandType = 'agricultural' | 'garden' | 'rangeland' | 'forest' | 'desert' | 'urban' | 'industrial' | 'riverbed' | 'road_rail' | 'other' | 'unknown'
export type AcqRoute = 'normal' | 'accelerated' | 'dispute' | 'art9'
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
  | 'art9_necessity'
  | 'art9_minutes'
  | 'art9_possession'
  | 'art9_payment'
export type StageStatus = 'not_started' | 'in_progress' | 'done' | 'blocked' | 'skipped'
export type AgreementStatus = 'unknown' | 'not_contacted' | 'negotiating' | 'agreed' | 'refused' | 'legal'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type DocStatus = 'pending' | 'submitted' | 'approved' | 'rejected'
export type CriticalityLevel = 'low' | 'medium' | 'high' | 'critical'

/**
 * Dates that start the legal clocks of the 1358 land-acquisition law (ISO yyyy-mm-dd). Everything else (necessity, minutes,
 * possession, payment of the Article 9 route) is read from the workflow steps themselves.
 */
export interface LegalData {
  /** Art. 2 note 2: registry office must answer the inquiry within 15 days. */
  inquiryDate?: string | null
  registryReplyDate?: string | null
  /** Art. 3 note 2: after agreement, buy/pay (or withdraw in writing) within 3 months. */
  agreementDate?: string | null
  settledDate?: string | null
  /** Art. 4 note 2: owner names an expert within 1 month of notification; else the court appoints within 15 days of the application. */
  ownerNoticeDate?: string | null
  expertNamedDate?: string | null
  courtAppointRequestDate?: string | null
  courtAppointedDate?: string | null
  /** Art. 5 note 5: the expert panel gives its opinion within 1 month. */
  expertAssignedDate?: string | null
  expertOpinionDate?: string | null
  /** Art. 8: first notice (1 month), second notice (15 days), deposit, eviction within 1 month. */
  notice1Date?: string | null
  notice2Date?: string | null
  depositDate?: string | null
  evictedDate?: string | null
  /** Art. 1 note (1388): after a court stay order, pay or deposit the day price within 6 months. */
  annulmentStayOrderDate?: string | null
  annulmentPaidDate?: string | null
  /** Art. 9 note: owner's court application to stop the works until payment; lifted at once on payment/deposit. */
  stayFiledDate?: string | null
  stayOrderDate?: string | null
  stayLiftedDate?: string | null
}

export interface ParcelFlags {
  sensitive_area?: boolean
  has_facilities?: boolean
  past_dispute?: boolean
  high_value?: boolean
  critical_for_execution?: boolean
  /** Art. 5 note 1: dwelling or livelihood of the owner, +15% on the fair price. */
  residence_livelihood?: boolean
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
  /** Legal-clock start dates (see LegalData). */
  legal: LegalData
  /** Nearest open legal deadline, kept in sync by the client so the header bell can read it. */
  nextDeadline: string | null
  nextDeadlineLabel: string
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
