import { create } from 'zustand'
import { resolveAi } from '../ai'
import type { AiProvider, AiStatus } from '../ai'
import { DEFAULT_QUESTION_SET, type QuestionSet } from '../lib/questionSets'
import {
  openTopicNow,
  skipCurrentTopic,
  startInterview,
  submitAnswer,
  type EngineInput,
  type StepResult,
} from '../lib/interviewEngine'
import { buildReport } from '../lib/reportBuilder'
import { scoreReport } from '../lib/qualityScore'
import { todayIso } from '../lib/fa'
import type {
  EvidenceKind,
  Finding,
  Interview,
  MissionBundle,
  PersonRef,
  ProjectRef,
  ReportContent,
  TransferTarget,
  WorkflowAction,
} from '../types'
import { createSupabaseRepo } from '../repo/supabaseRepo'
import { seedDemo } from '../repo/demoSeed'
import type { CurrentUser, MissionDraft, MissionRepo, MissionRole, ObjectiveDraft, PortfolioData, RoleAssignment } from '../repo/types'

interface MissionsState {
  repo: MissionRepo
  ready: boolean
  loading: boolean
  error: string | null
  user: CurrentUser | null
  people: PersonRef[]
  projects: ProjectRef[]
  sets: QuestionSet[]
  ai: AiStatus
  aiProvider: AiProvider | null
  portfolio: PortfolioData | null
  bundle: MissionBundle | null
  roles: RoleAssignment[]
  /** The user's own sample signature: undefined = not loaded yet, null = none saved. */
  signature: string | null | undefined
  loadSignature: () => Promise<void>
  saveSignature: (png: string) => Promise<boolean>
  loadRoles: () => Promise<void>
  toggleRole: (userId: string, role: MissionRole, on: boolean) => Promise<void>
  /** True while the engine is analysing an answer (the chat shows a typing indicator). */
  thinking: boolean

  setRepo: (repo: MissionRepo) => void
  init: () => Promise<void>
  refreshPortfolio: () => Promise<void>
  openMission: (id: string) => Promise<MissionBundle | null>
  refreshBundle: () => Promise<void>
  closeMission: () => void
  clearError: () => void

  saveRequest: (draft: MissionDraft, objectives: ObjectiveDraft[], id?: string) => Promise<string>
  transition: (action: WorkflowAction, comment?: string, id?: string, data?: Record<string, unknown>) => Promise<boolean>
  deleteMission: (id: string) => Promise<void>

  beginInterview: () => Promise<void>
  answer: (text: string, mode: 'text' | 'voice') => Promise<void>
  skipTopic: (reason: string) => Promise<void>
  jumpToTopic: (key: string) => Promise<void>
  finishToSummary: () => Promise<void>
  reopenInterview: () => Promise<void>

  editFinding: (id: string, patch: Parameters<MissionRepo['updateFinding']>[1]) => Promise<void>
  removeFinding: (id: string) => Promise<void>
  addManualFinding: (f: Pick<Finding, 'kind' | 'title' | 'topicKey' | 'severity'> & Partial<Finding>) => Promise<void>
  setObjective: (id: string, patch: { status?: MissionBundle['objectives'][number]['status']; resultNote?: string }) => Promise<void>
  addEvidence: (draft: { kind: EvidenceKind; title: string; note: string; topicKey: string; findingId: string | null; objectiveId: string | null }, file: File | Blob | null) => Promise<void>
  removeEvidence: (id: string) => Promise<void>

  submitReport: () => Promise<boolean>
  decideFinding: (id: string, approval: 'approved' | 'rejected' | 'proposed', note?: string) => Promise<void>
  transfer: (findingId: string, target: TransferTarget, params?: Record<string, unknown>) => Promise<boolean>

  seedDemoData: () => Promise<void>
  clearDemoData: () => Promise<void>
}

export const DEMO_MARKER = '[نمونه]'

const FRIENDLY = (e: unknown) => (e instanceof Error ? e.message : 'خطای نامشخص')

export function engineInputFor(s: Pick<MissionsState, 'sets' | 'projects' | 'aiProvider'>, bundle: MissionBundle): EngineInput {
  const project = s.projects.find((p) => p.id === bundle.mission.masterProjectId)
  return {
    set: s.sets[0] ?? DEFAULT_QUESTION_SET,
    mission: bundle.mission,
    objectives: bundle.objectives,
    projectType: project?.projectType ?? '',
    projectName: bundle.mission.projectName,
    today: todayIso(),
    ai: s.aiProvider,
  }
}

export const useMissionStore = create<MissionsState>()((set, get) => ({
  repo: createSupabaseRepo(),
  ready: false,
  loading: false,
  error: null,
  signature: undefined,
  user: null,
  people: [],
  projects: [],
  sets: [DEFAULT_QUESTION_SET],
  ai: { provider: 'rules', label: 'موتور قواعد داخلی (بدون AI)', enhanced: false },
  aiProvider: null,
  portfolio: null,
  bundle: null,
  roles: [],
  thinking: false,

  setRepo: (repo) => set({ repo, ready: false, portfolio: null, bundle: null }),
  clearError: () => set({ error: null }),

  loadRoles: async () => {
    try {
      set({ roles: await get().repo.listRoles() })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },
  toggleRole: async (userId, role, on) => {
    try {
      await get().repo.setRole(userId, role, on)
      await get().loadRoles()
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  init: async () => {
    const { repo } = get()
    set({ loading: true, error: null })
    try {
      const [user, people, projects, sets] = await Promise.all([repo.loadCurrentUser(), repo.listPeople(), repo.listProjects(), repo.loadQuestionSets()])
      set({ user, people, projects, sets, ready: true })
      await get().refreshPortfolio()
      // The AI status is resolved after first paint; the module never waits for it.
      resolveAi().then(({ provider, status }) => set({ ai: status, aiProvider: provider })).catch(() => undefined)
    } catch (e) {
      set({ error: FRIENDLY(e) })
    } finally {
      set({ loading: false })
    }
  },

  refreshPortfolio: async () => {
    try {
      set({ portfolio: await get().repo.loadPortfolio() })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  openMission: async (id) => {
    set({ loading: true, error: null })
    try {
      const bundle = await get().repo.loadBundle(id)
      set({ bundle })
      return bundle
    } catch (e) {
      set({ error: FRIENDLY(e), bundle: null })
      return null
    } finally {
      set({ loading: false })
    }
  },
  refreshBundle: async () => {
    const id = get().bundle?.mission.id
    if (!id) return
    try {
      set({ bundle: await get().repo.loadBundle(id) })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },
  closeMission: () => set({ bundle: null }),

  saveRequest: async (draft, objectives, id) => {
    const { repo } = get()
    try {
      let missionId = id
      if (id) await repo.updateMission(id, draft, objectives)
      else missionId = (await repo.createMission(draft, objectives)).id
      await get().refreshPortfolio()
      return missionId as string
    } catch (e) {
      set({ error: FRIENDLY(e) })
      throw e
    }
  },

  transition: async (action, comment, id, data) => {
    const target = id ?? get().bundle?.mission.id
    if (!target) return false
    try {
      await get().repo.transition(target, action, comment, data)
      await Promise.all([get().refreshPortfolio(), get().bundle?.mission.id === target ? get().refreshBundle() : Promise.resolve()])
      return true
    } catch (e) {
      set({ error: FRIENDLY(e) })
      return false
    }
  },

  deleteMission: async (id) => {
    try {
      await get().repo.deleteMission(id)
      await get().refreshPortfolio()
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  // ------------------------------------------------------------------------------------ interview

  beginInterview: async () => {
    const s = get()
    const bundle = s.bundle
    if (!bundle || bundle.interview) return
    try {
      const step = startInterview(engineInputFor(s, bundle))
      await persistStep(get, set, bundle, step, 'active')
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  answer: async (text, mode) => {
    const s = get()
    const bundle = s.bundle
    if (!bundle?.interview || !text.trim()) return
    set({ thinking: true })
    try {
      const step = await submitAnswer(engineInputFor(s, bundle), bundle.interview.state, bundle.findings, text, mode)
      await persistStep(get, set, bundle, step, step.done ? 'summary' : 'active')
    } catch (e) {
      set({ error: FRIENDLY(e) })
    } finally {
      set({ thinking: false })
    }
  },

  skipTopic: async (reason) => {
    const s = get()
    const bundle = s.bundle
    if (!bundle?.interview) return
    const step = skipCurrentTopic(engineInputFor(s, bundle), bundle.interview.state, bundle.findings, reason)
    try {
      await persistStep(get, set, bundle, step, step.done ? 'summary' : 'active')
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  jumpToTopic: async (key) => {
    const s = get()
    const bundle = s.bundle
    if (!bundle?.interview) return
    const step = openTopicNow(engineInputFor(s, bundle), bundle.interview.state, bundle.findings, key)
    try {
      await persistStep(get, set, bundle, step, 'active')
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  finishToSummary: async () => {
    const bundle = get().bundle
    if (!bundle?.interview) return
    try {
      const interview = await get().repo.saveInterview(bundle.mission.id, { status: 'summary' })
      set({ bundle: { ...bundle, interview } })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  reopenInterview: async () => {
    const bundle = get().bundle
    if (!bundle?.interview) return
    try {
      const interview = await get().repo.saveInterview(bundle.mission.id, { status: 'active', summaryConfirmedAt: null })
      set({ bundle: { ...bundle, interview } })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  // ------------------------------------------------------------------------------------ editing

  editFinding: async (id, patch) => {
    const bundle = get().bundle
    if (!bundle) return
    try {
      await get().repo.updateFinding(id, patch)
      set({ bundle: { ...bundle, findings: bundle.findings.map((f) => (f.id === id ? ({ ...f, ...patch } as Finding) : f)) } })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },
  removeFinding: async (id) => {
    const bundle = get().bundle
    if (!bundle) return
    try {
      await get().repo.deleteFinding(id)
      set({ bundle: { ...bundle, findings: bundle.findings.filter((f) => f.id !== id) } })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },
  addManualFinding: async (f) => {
    const bundle = get().bundle
    if (!bundle) return
    const full: Finding = {
      id: crypto.randomUUID(),
      missionId: bundle.mission.id,
      description: '',
      details: {},
      ownerText: '',
      ownerId: null,
      dueDate: null,
      objectiveId: null,
      confidence: 1,
      userConfirmed: true,
      approval: 'proposed',
      managerNote: '',
      transferredTo: null,
      transferredId: null,
      transferredAt: null,
      createdAt: new Date().toISOString(),
      ...f,
    }
    try {
      await get().repo.upsertFindings(bundle.mission.id, [full])
      set({ bundle: { ...bundle, findings: [...bundle.findings, full] } })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },
  setObjective: async (id, patch) => {
    const bundle = get().bundle
    if (!bundle) return
    try {
      await get().repo.updateObjective(id, patch)
      set({ bundle: { ...bundle, objectives: bundle.objectives.map((o) => (o.id === id ? { ...o, ...patch } : o)) } })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },
  addEvidence: async (draft, file) => {
    const bundle = get().bundle
    if (!bundle) return
    try {
      const ev = await get().repo.addEvidence(bundle.mission.id, draft, file)
      set({ bundle: { ...get().bundle!, evidence: [...get().bundle!.evidence, ev] } })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },
  removeEvidence: async (id) => {
    const bundle = get().bundle
    if (!bundle) return
    try {
      await get().repo.deleteEvidence(id)
      set({ bundle: { ...bundle, evidence: bundle.evidence.filter((e) => e.id !== id) } })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  // ------------------------------------------------------------------------------------ report

  loadSignature: async () => {
    try {
      set({ signature: await get().repo.loadMySignature() })
    } catch {
      set({ signature: null })
    }
  },

  saveSignature: async (png) => {
    try {
      await get().repo.saveMySignature(png)
      set({ signature: png })
      return true
    } catch (e) {
      set({ error: FRIENDLY(e) })
      return false
    }
  },

  submitReport: async () => {
    const s = get()
    const bundle = s.bundle
    if (!bundle?.interview) return false
    try {
      const input = engineInputFor(s, bundle)
      const draft = buildReport({ mission: bundle.mission, projectName: bundle.mission.projectName, objectives: bundle.objectives, findings: bundle.findings, evidence: bundle.evidence, state: bundle.interview.state, set: input.set })
      let content: ReportContent = draft
      let generatedBy = 'rules'
      if (s.aiProvider) {
        try {
          const parts = await s.aiProvider.composeReport({ mission: bundle.mission, objectives: bundle.objectives, findings: bundle.findings, notes: {}, progress: draft.progress, draft })
          content = { ...draft, executiveSummary: parts.executiveSummary, recommendations: parts.recommendations, generatedBy: s.ai.provider }
          generatedBy = `ai:${s.ai.provider}`
        } catch {
          /* keep the deterministic draft */
        }
      }
      const q = scoreReport({ mission: bundle.mission, objectives: bundle.objectives, findings: bundle.findings, evidence: bundle.evidence, state: bundle.interview.state, content })
      await s.repo.saveInterview(bundle.mission.id, { status: 'completed', summaryConfirmedAt: new Date().toISOString() })
      await s.repo.saveReport(bundle.mission.id, { content, qualityScore: q.score, breakdown: q.criteria, generatedBy })
      const ok = await get().transition('submit_report')
      if (ok) await get().refreshBundle()
      return ok
    } catch (e) {
      set({ error: FRIENDLY(e) })
      return false
    }
  },

  decideFinding: async (id, approval, note) => {
    const bundle = get().bundle
    if (!bundle) return
    try {
      await get().repo.updateFinding(id, { approval, managerNote: note ?? '' })
      set({ bundle: { ...bundle, findings: bundle.findings.map((f) => (f.id === id ? { ...f, approval, managerNote: note ?? f.managerNote } : f)) } })
    } catch (e) {
      set({ error: FRIENDLY(e) })
    }
  },

  seedDemoData: async () => {
    const s = get()
    if (!s.user) return
    set({ loading: true })
    try {
      const multi = 'forUser' in s.repo
      const requesters = multi ? s.people.filter((p) => p.id !== s.user!.id).slice(0, 3) : [s.user]
      await seedDemo({ repo: s.repo as Parameters<typeof seedDemo>[0]['repo'], projects: s.projects, requesters: requesters.length ? requesters : [s.user], manager: s.user, adminAffairs: s.user, marker: DEMO_MARKER })
      await get().refreshPortfolio()
    } catch (e) {
      set({ error: FRIENDLY(e) })
    } finally {
      set({ loading: false })
    }
  },

  clearDemoData: async () => {
    const s = get()
    set({ loading: true })
    try {
      for (const m of (s.portfolio?.missions ?? []).filter((x) => x.locationDetail === DEMO_MARKER)) await s.repo.deleteMission(m.id)
      await get().refreshPortfolio()
    } catch (e) {
      set({ error: FRIENDLY(e) })
    } finally {
      set({ loading: false })
    }
  },

  transfer: async (findingId, target, params) => {
    try {
      await get().repo.transferFinding(findingId, target, params)
      await Promise.all([get().refreshBundle(), get().refreshPortfolio()])
      return true
    } catch (e) {
      set({ error: FRIENDLY(e) })
      return false
    }
  },
}))

/** Persists one engine step (interview state, new turns, findings, objective updates) and updates the open bundle. */
async function persistStep(
  get: () => MissionsState,
  set: (p: Partial<MissionsState>) => void,
  bundle: MissionBundle,
  step: StepResult,
  status: Interview['status'],
) {
  const repo = get().repo
  const missionId = bundle.mission.id
  const nextSeq = bundle.turns.length ? Math.max(...bundle.turns.map((t) => t.seq)) + 1 : 1
  const turns = await repo.appendTurns(missionId, nextSeq, step.turns)
  await repo.upsertFindings(missionId, step.findings)
  for (const u of step.objectiveUpdates) await repo.updateObjective(u.id, { status: u.status, resultNote: u.note })
  const interview = await repo.saveInterview(missionId, { status, state: step.state, provider: step.aiUsed ? get().ai.provider : bundle.interview?.provider ?? 'rules' })
  const current = get().bundle
  // The user may have navigated away while the engine ran.
  if (!current || current.mission.id !== missionId) return
  set({
    bundle: {
      ...current,
      turns: [...current.turns, ...turns],
      findings: step.findings,
      objectives: current.objectives.map((o) => {
        const u = step.objectiveUpdates.find((x) => x.id === o.id)
        return u ? { ...o, status: u.status, resultNote: u.note } : o
      }),
      interview,
    },
  })
}
