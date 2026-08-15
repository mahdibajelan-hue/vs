/**
 * Data model for the Pipeline Digital Twin MVP. Route, Pipe and Joint are populated as of Phase
 * 5-9 (procedural 3D pipe, joint placement, construction-status tracking, progress engine).
 * Valve/Crossing/NCR/Document are declared per the spec's "design the architecture correctly from
 * day one" requirement but stay unpopulated until a later phase actually builds them.
 */

export interface GeoPoint {
  lon: number
  lat: number
  /** Meters above the reference ellipsoid; null if the source (e.g. a KML with no altitude data) didn't carry real elevation. */
  elevation: number | null
}

export type RouteSource = 'demo' | 'kml' | 'kmz'

export interface Route {
  points: GeoPoint[]
  /** True only if every point came with genuine elevation data from the source — never interpolated or guessed. */
  hasElevationData: boolean
  /** Real geodesic length along the route (WGS84 ellipsoid), meters. */
  lengthMeters: number
  source: RouteSource
  fileName: string | null
}

export type WeldingStatus = 'not_started' | 'welded' | 'repaired' | 'accepted'
export type NdtStatus = 'pending' | 'passed' | 'failed' | 'repair_required'
export type CoatingStatus = 'pending' | 'completed' | 'failed'
export type LoweringStatus = 'pending' | 'completed'
export type BackfillStatus = 'pending' | 'completed'
export type JointFinalStatus = 'not_started' | 'in_progress' | 'ncr' | 'completed'

export type JointStatusField = 'weldingStatus' | 'ndtStatus' | 'coatingStatus' | 'loweringStatus' | 'backfillStatus'

/** One append-only log line, written whenever a construction-status field on a joint changes. */
export interface JointHistoryEntry {
  id: string
  /** ISO timestamp. */
  at: string
  field: JointStatusField | 'notes' | 'welders'
  fromValue: string
  toValue: string
}

export interface Joint {
  id: string
  jointNumber: string
  /** Cumulative distance along the route (meters) — the joint's real position; its KP label and lon/lat/elevation are derived from this via the route. */
  chainageMeters: number
  weldingStatus: WeldingStatus
  ndtStatus: NdtStatus
  coatingStatus: CoatingStatus
  loweringStatus: LoweringStatus
  backfillStatus: BackfillStatus
  /** Always derived from the five stage fields above — never set directly. See lib/progressEngine.ts. */
  finalStatus: JointFinalStatus
  welders: string[]
  notes: string
  history: JointHistoryEntry[]
}

/** Populated by demo data (Phase 5); a real project would carry one Pipe per pipe-class/diameter change along the route. */
export interface Pipe {
  id: string
  diameterInch: number
  wallThicknessMm: number
  material: string
}

/** Not yet populated (later phase). */
export interface Valve {
  id: string
  chainageMeters: number
  label: string
}

/** Not yet populated (later phase). */
export interface Crossing {
  id: string
  chainageMeters: number
  type: string
  label: string
}

/** Not yet populated (later phase). */
export interface NCR {
  id: string
  jointId: string
  description: string
  openedAt: string
  closedAt: string | null
}

/** Not yet populated (later phase). */
export interface DtDocument {
  id: string
  jointId: string
  kind: 'photo' | 'ndt_report' | 'weld_report' | 'other'
  label: string
}

export interface PipelineProject {
  id: string
  name: string
  englishTag: string
  diameterInch: number
  material: string
  route: Route
  pipes: Pipe[]
  joints: Joint[]
  valves: Valve[]
  crossings: Crossing[]
  ncrs: NCR[]
  documents: DtDocument[]
  createdAt: string
}
