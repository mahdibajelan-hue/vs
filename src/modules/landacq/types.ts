export type OwnershipClass = 'private' | 'natural_resources' | 'exempt' | 'governmental' | 'unknown'
export type LandType = 'agricultural' | 'garden' | 'rangeland' | 'forest' | 'desert' | 'urban' | 'industrial' | 'riverbed' | 'road_rail' | 'other' | 'unknown'
export type ParcelKind = 'route' | 'station'
/** Project stations that each need their own site: pig launcher/receiver, line & branch valves, pressure control/reduction, cathodic protection. */
export type StationType = 'pig_launcher' | 'line_valve' | 'branch_valve' | 'pressure_control' | 'pressure_reduction' | 'cp_station' | 'pig_receiver'
/** Existing facilities / obstacles the pipeline has to cross. */
export type CrossingType = 'dirt_road' | 'paved_road' | 'railway' | 'river' | 'floodway' | 'qanat' | 'water_canal' | 'water_pipe' | 'oil_pipe' | 'gas_pipe' | 'hv_cable'
export type PermitStatus = 'not_started' | 'requested' | 'under_review' | 'conditional' | 'issued' | 'rejected'
export type UndertakingStatus = 'pending' | 'submitted' | 'signed'
export type AcqRoute = 'normal' | 'art9' | 'dispute'
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

/** A cadastral plot bought inside a parcel: corners in UTM metres, drawn on the map with the owner's name. */
export interface Plot {
  id: string
  parcelId: string
  plotNo: string
  ownerName: string
  zone: number
  north: boolean
  /** [easting, northing] in metres, in order around the plot. */
  corners: [number, number][]
  notes: string
  isDemo: boolean
}

export type ApprovalStatus = 'draft' | 'submitted' | 'consultant_approved' | 'legal_attested' | 'approved'
/** Project roles: the contractor enters, the consultant reviews, the employer's legal officer attests, the project manager gives final approval. */
export type LandRole = 'contractor' | 'consultant' | 'employer_legal' | 'project_manager' | 'executive'
export type ReviewAction = 'submit' | 'approve' | 'attest' | 'final' | 'return' | 'reopen'
export interface ApprovalEntry {
  id: number
  parcelId: string
  at: string
  actorId: string | null
  role: string
  action: string
  comment: string
}
export interface RoleAssignment {
  userId: string
  role: LandRole
}
export interface Person {
  id: string
  name: string
  position: string
}

/** Permit / undertaking (تعهدنامه) / fee follow-up for one crossing. */
export interface Crossing {
  id: string
  masterProjectId: string
  code: string
  crossingType: CrossingType
  name: string
  km: number
  custodian: string
  permitStatus: PermitStatus
  permitRequestedDate: string | null
  permitIssuedDate: string | null
  permitNumber: string
  undertakingRequired: boolean
  undertakingStatus: UndertakingStatus
  undertakingDate: string | null
  undertakingNote: string
  feeRequired: boolean
  feeAmount: number
  feePaidAmount: number
  feePaidDate: string | null
  legalNotes: string
  conditions: string
  responsible: string
  riskId: string | null
  issueId: string | null
  nextDeadline: string | null
  nextDeadlineLabel: string
  isDemo: boolean
}

/** An exceptional land price: a unit price outside the expected range can only be recorded after a written reason and the project manager's approval. */
export interface PriceException {
  status: 'requested' | 'approved' | 'rejected'
  /** Requested unit price, rial per m². */
  price: number
  reason: string
  requestedBy: string
  requestedAt: string
  decidedBy?: string
  decidedAt?: string
  decisionNote?: string
}

export type PaymentCategory = 'owner' | 'expert' | 'transfer' | 'legal' | 'other'
/** One payment made for land acquisition: to an owner, or a fee (official expert, title transfer, legal, other). */
export interface Payment {
  id: string
  masterProjectId: string
  parcelId: string | null
  category: PaymentCategory
  payee: string
  amount: number
  paidDate: string
  ref: string
  note: string
  isDemo: boolean
}

export interface Parcel {
  id: string
  masterProjectId: string
  /** 'station' = a station site at one chainage (1 m long), 'route' = a km stretch of the pipeline corridor. */
  kind: ParcelKind
  stationType: StationType | ''
  siteLon: number | null
  siteLat: number | null
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
  approvalStatus: ApprovalStatus
  approvalNote: string
  priceException: PriceException | null
  plots: Plot[]
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
  /** The land-acquisition budget of the project (rial), asked for at the start of the project. */
  budgetAmount?: number | null
  budgetNote?: string
  /** The legal unit's proposed release plan, as last presented (see the «برنامه آزادسازی» tab). */
  planProposal?: { at: string; by: string; note: string; urgent: number; total: number } | null
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
  approvals: ApprovalEntry[]
  /** Role of the signed-in user in this project (null = none assigned). */
  myRole: LandRole | null
  roles: RoleAssignment[]
  crossings: Crossing[]
  payments: Payment[]
}

export interface ProjectOption {
  id: string
  name: string
  code: string
}
