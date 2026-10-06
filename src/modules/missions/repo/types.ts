import type {
  Evidence,
  EvidenceKind,
  Finding,
  Interview,
  InterviewStatus,
  InterviewState,
  LinkedStatus,
  Mission,
  MissionBundle,
  MissionEvent,
  Objective,
  PersonRef,
  ProjectRef,
  Report,
  ReportContent,
  QualityCriterion,
  TransferTarget,
  Turn,
  Visitee,
  VisitType,
  WorkflowAction,
} from '../types'
import type { TurnDraft } from '../lib/interviewEngine'
import type { MissionDiscipline } from '../types'
import type { QuestionSet } from '../lib/questionSets'

export interface MissionDraft {
  masterProjectId: string
  discipline: MissionDiscipline
  requesterPosition: string
  needsTicket: boolean
  originCity: string
  destinationCity: string
  companions: string[]
  ticketNote: string
  destination: string
  locationDetail: string
  startDate: string
  endDate: string
  visitType: VisitType
  visitees: Visitee[]
  topicsOfInterest: string
  expectedOutput: string
  approverId: string | null
}

export type ObjectiveDraft = Pick<Objective, 'title' | 'measure' | 'topicKey' | 'priority'> & { id?: string }

export interface CurrentUser extends PersonRef {
  isAdmin: boolean
  /** مجری طرح — approves requests and reports. */
  isManager: boolean
  /** امور اداری — books flight tickets and approves mission claims. */
  isAdminAffairs: boolean
}

export type MissionRole = 'executive' | 'admin_affairs'
export interface RoleAssignment {
  userId: string
  role: MissionRole
}

export interface PortfolioData {
  missions: Mission[]
  objectives: Objective[]
  findings: Finding[]
  /** Interview states are needed for progress numbers on the dashboard. */
  interviews: Interview[]
  reports: Pick<Report, 'missionId' | 'qualityScore' | 'status' | 'submittedAt'>[]
  linked: LinkedStatus[]
}

/**
 * Persistence boundary. The Supabase implementation is the product; the in-memory implementation exists
 * for demos and for rendering/testing the UI without a backend. Everything above this interface is
 * identical in both.
 */
export interface MissionRepo {
  /** Resolves the signed-in user, including whether they hold a manager role (admin or missions approve/review permission). */
  loadCurrentUser(): Promise<CurrentUser>
  listProjects(): Promise<ProjectRef[]>
  listPeople(): Promise<PersonRef[]>
  loadQuestionSets(): Promise<QuestionSet[]>

  loadPortfolio(): Promise<PortfolioData>
  loadBundle(id: string): Promise<MissionBundle>

  createMission(draft: MissionDraft, objectives: ObjectiveDraft[]): Promise<Mission>
  updateMission(id: string, draft: Partial<MissionDraft>, objectives?: ObjectiveDraft[]): Promise<void>
  deleteMission(id: string): Promise<void>
  transition(id: string, action: WorkflowAction, comment?: string, data?: Record<string, unknown>): Promise<void>

  listRoles(): Promise<RoleAssignment[]>
  setRole(userId: string, role: MissionRole, on: boolean): Promise<void>

  saveInterview(missionId: string, patch: { status?: InterviewStatus; state?: InterviewState; provider?: string; summaryConfirmedAt?: string | null }): Promise<Interview>
  appendTurns(missionId: string, startSeq: number, turns: TurnDraft[]): Promise<Turn[]>
  upsertFindings(missionId: string, findings: Finding[]): Promise<void>
  updateFinding(id: string, patch: Partial<Pick<Finding, 'title' | 'description' | 'severity' | 'ownerText' | 'ownerId' | 'dueDate' | 'userConfirmed' | 'details' | 'kind' | 'confidential'>> & { approval?: Finding['approval']; managerNote?: string }): Promise<void>
  deleteFinding(id: string): Promise<void>
  updateObjective(id: string, patch: Partial<Pick<Objective, 'status' | 'resultNote'>>): Promise<void>

  addEvidence(missionId: string, draft: { kind: EvidenceKind; title: string; note: string; topicKey: string; findingId: string | null; objectiveId: string | null }, file: File | Blob | null): Promise<Evidence>
  deleteEvidence(id: string): Promise<void>
  evidenceUrl(path: string): Promise<string | null>

  saveReport(missionId: string, data: { content: ReportContent; qualityScore: number; breakdown: QualityCriterion[]; generatedBy: string }): Promise<Report>
  addEvent(missionId: string, event: string, comment?: string): Promise<MissionEvent | null>

  /** The signed-in user's sample signature (PNG data URL) — frozen onto a report when it is submitted. */
  loadMySignature(): Promise<string | null>
  saveMySignature(image: string): Promise<void>

  transferFinding(findingId: string, target: TransferTarget, params?: Record<string, unknown>): Promise<{ target: TransferTarget; id: string }>
  linkedStatus(missionIds: string[]): Promise<LinkedStatus[]>
}
