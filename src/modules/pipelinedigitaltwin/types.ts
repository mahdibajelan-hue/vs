/**
 * Data model for the Pipeline Digital Twin MVP. Phases 1-4 (this batch) only populate Route —
 * Joint/Pipe/Valve/Crossing/NCR/Document are declared now (per the spec's "design the architecture
 * correctly from day one" requirement) but stay empty until the later phases that actually build
 * joint placement, construction-status tracking, and the progress engine.
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

/** Not yet populated (Phase 6+) — declared now so Route/Chainage code already has a real target shape to place joints onto later. */
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
  finalStatus: JointFinalStatus
  welders: string[]
  notes: string
}

/** Not yet populated (Phase 5+). */
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
