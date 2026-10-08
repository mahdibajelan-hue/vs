import { DEFAULT_QUESTION_SET } from '../lib/questionSets'
import { uid, type TurnDraft } from '../lib/interviewEngine'
import type { Evidence, Finding, FindingAudit, Interview, LinkedStatus, Mission, MissionBundle, MissionEvent, Objective, PersonRef, ProjectRef, Report, Turn, WorkflowAction } from '../types'
import type { CurrentUser, MissionDraft, MissionRepo, PortfolioData } from './types'

/**
 * In-memory MissionRepo: same rules as the SQL (ms_transition, manager-only transfer) so the UI behaves
 * identically, with no backend. Used for demos and for rendering/testing the module offline.
 */
export type MemoryRepo = MissionRepo & { forUser: (user: CurrentUser) => MemoryRepo }

export function createMemoryRepo(opts: { user: CurrentUser; people: PersonRef[]; projects: ProjectRef[] }): MemoryRepo {
  const missions = new Map<string, Mission>()
  const objectives = new Map<string, Objective>()
  const findings = new Map<string, Finding>()
  const evidence = new Map<string, Evidence>()
  const turns = new Map<string, Turn[]>()
  const interviews = new Map<string, Interview>()
  const reports = new Map<string, Report[]>()
  const events = new Map<string, MissionEvent[]>()
  const linkedMap = new Map<string, LinkedStatus>()
  const roleSet = new Set<string>()
  let seq = 1001
  const personName = (id: string | null) => opts.people.find((p) => p.id === id)?.name ?? ''
  const projectName = (id: string) => opts.projects.find((p) => p.id === id)?.name ?? '—'
  const now = () => new Date().toISOString()

  function logEvent(missionId: string, event: string, comment = '', actorId: string | null = null) {
    const list = events.get(missionId) ?? []
    const e: MissionEvent = { id: uid(), missionId, actorId, actorName: personName(actorId) || 'سیستم', event, comment, detail: {}, createdAt: now() }
    list.push(e)
    events.set(missionId, list)
    return e
  }

  function fromDraft(id: string, code: string, requesterId: string, d: MissionDraft): Mission {
    return {
      id,
      code,
      requesterId,
      requesterName: personName(requesterId),
      requesterPosition: d.requesterPosition,
      masterProjectId: d.masterProjectId,
      discipline: d.discipline,
      projectName: projectName(d.masterProjectId),
      destination: d.destination,
      locationDetail: d.locationDetail,
      startDate: d.startDate,
      endDate: d.endDate,
      visitType: d.visitType,
      visitees: d.visitees,
      topicsOfInterest: d.topicsOfInterest,
      expectedOutput: d.expectedOutput,
      needsTicket: d.needsTicket,
      originCity: d.originCity,
      destinationCity: d.destinationCity,
      companions: d.companions,
      ticketNote: d.ticketNote,
      ticket: {},
      ticketIssuedAt: null,
      adminComment: '',
      approverId: d.approverId,
      approverName: personName(d.approverId),
      status: 'draft',
      managerComment: '',
      qualityScore: null,
      submittedAt: null,
      approvedAt: null,
      debriefStartedAt: null,
      reportSubmittedAt: null,
      finalApprovedAt: null,
      claimedAt: null,
      createdAt: now(),
    }
  }

  const signatures = new Map<string, string>()
  const audit = new Map<string, FindingAudit[]>()
  const SEV = ['low', 'medium', 'high', 'critical']

  /** Mirrors the database trigger ms_finding_audit_fn: creations, deletions and softening changes are recorded; changes after the first report submission are suspicious. */
  function logAudit(op: 'insert' | 'update' | 'delete', before: Finding | null, after: Finding | null, actorId: string) {
    const f = (after ?? before)!
    const m = missions.get(f.missionId)
    const submitted = !!m?.reportSubmittedAt
    const snap = (x: Finding | null) => (x ? { kind: x.kind, title: x.title, severity: x.severity, approval: x.approval, owner: x.ownerText, due: x.dueDate, confidential: x.confidential, topic: x.topicKey } : null)
    let reason = ''
    let suspicious = false
    if (op === 'delete') {
      if (submitted) { suspicious = true; reason = 'حذف پس از ارسال گزارش' }
    } else if (op === 'update' && before && after) {
      if (SEV.indexOf(after.severity) < SEV.indexOf(before.severity)) reason = 'کاهش شدت'
      if ((before.kind === 'issue' || before.kind === 'risk') && after.kind !== 'issue' && after.kind !== 'risk') reason = 'تغییر نوع به مورد کم‌اهمیت‌تر'
      if (before.confidential && !after.confidential) reason = 'برداشتن برچسب محرمانه'
      if (!reason) return
      suspicious = submitted
    }
    const list = audit.get(f.missionId) ?? []
    list.push({ id: list.length + 1, missionId: f.missionId, findingId: f.id, op, actorName: personName(actorId) || 'سیستم', at: now(), missionStatus: m?.status ?? '', before: snap(before), after: snap(after), suspicious, reason })
    audit.set(f.missionId, list)
  }

  function build(me: CurrentUser): MemoryRepo {
  const repo: MemoryRepo = {
    forUser: (u) => build(u),
    async loadCurrentUser() {
      return me
    },
    async listProjects() {
      return opts.projects
    },
    async listPeople() {
      return opts.people
    },
    async loadQuestionSets() {
      return [DEFAULT_QUESTION_SET]
    },
    async loadPortfolio(): Promise<PortfolioData> {
      const visible = [...missions.values()].filter((m) => me.isManager || m.requesterId === me.id || m.approverId === me.id || me.isAdminAffairs)
      const ids = new Set(visible.map((m) => m.id))
      const latest = [...reports.entries()].filter(([id]) => ids.has(id)).map(([, list]) => list[list.length - 1])
      return {
        missions: visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        objectives: [...objectives.values()].filter((o) => ids.has(o.missionId)),
        findings: [...findings.values()].filter((f) => ids.has(f.missionId)),
        interviews: [...interviews.values()].filter((i) => ids.has(i.missionId)),
        reports: latest.map((r) => ({ missionId: r.missionId, qualityScore: r.qualityScore, status: r.status, submittedAt: r.submittedAt })),
        linked: [...linkedMap.values()],
      }
    },
    async loadBundle(id): Promise<MissionBundle> {
      const mission = missions.get(id)
      if (!mission) throw new Error('مأموریت یافت نشد')
      const list = reports.get(id) ?? []
      return {
        mission: { ...mission },
        objectives: [...objectives.values()].filter((o) => o.missionId === id).sort((a, b) => a.position - b.position),
        findings: [...findings.values()].filter((f) => f.missionId === id),
        audit: me.isManager ? [...(audit.get(id) ?? [])].reverse() : [],
        evidence: [...evidence.values()].filter((e) => e.missionId === id),
        turns: turns.get(id) ?? [],
        interview: interviews.get(id) ?? null,
        report: list[list.length - 1] ?? null,
        events: events.get(id) ?? [],
        linked: [...linkedMap.values()].filter((l) => findings.get(l.findingId)?.missionId === id),
      }
    },

    async createMission(draft, objs) {
      const id = uid()
      const m = fromDraft(id, `MIS-${String(seq++).padStart(5, '0')}`, me.id, draft)
      missions.set(id, m)
      objs.forEach((o, i) => {
        const oid = uid()
        objectives.set(oid, { id: oid, missionId: id, position: i, title: o.title, measure: o.measure, topicKey: o.topicKey, priority: o.priority, status: 'pending', resultNote: '' })
      })
      logEvent(id, 'created', '', me.id)
      return { ...m }
    },
    async updateMission(id, draft, objs) {
      const m = missions.get(id)
      if (!m) return
      const next = { ...m, ...draft } as Mission
      if (draft.masterProjectId) next.projectName = projectName(draft.masterProjectId)
      if (draft.approverId !== undefined) next.approverName = personName(draft.approverId)
      missions.set(id, next)
      if (objs) {
        const keep = new Set(objs.map((o) => o.id).filter(Boolean))
        for (const [oid, o] of objectives) if (o.missionId === id && !keep.has(oid)) objectives.delete(oid)
        objs.forEach((o, i) => {
          const oid = o.id ?? uid()
          const prev = objectives.get(oid)
          objectives.set(oid, { id: oid, missionId: id, position: i, title: o.title, measure: o.measure, topicKey: o.topicKey, priority: o.priority, status: prev?.status ?? 'pending', resultNote: prev?.resultNote ?? '' })
        })
      }
    },
    async deleteMission(id) {
      missions.delete(id)
      for (const [k, o] of objectives) if (o.missionId === id) objectives.delete(k)
      for (const [k, f] of findings) if (f.missionId === id) findings.delete(k)
      for (const [k, e] of evidence) if (e.missionId === id) evidence.delete(k)
      turns.delete(id)
      interviews.delete(id)
      reports.delete(id)
      events.delete(id)
    },
    async transition(id, action: WorkflowAction, comment = '', data: Record<string, unknown> = {}) {
      const m = missions.get(id)
      if (!m) throw new Error('مأموریت یافت نشد')
      const isReq = m.requesterId === me.id
      const isMgr = me.isManager || m.approverId === me.id
      const isAA = me.isAdminAffairs
      const hasObjectives = [...objectives.values()].some((o) => o.missionId === id)
      const list = reports.get(id) ?? []
      let next: Mission['status'] | null = null
      if (action === 'submit_request' && isReq && (m.status === 'draft' || m.status === 'returned')) {
        if (!hasObjectives) throw new Error('حداقل یک هدف برای مأموریت لازم است.')
        next = 'pending_approval'
      } else if (action === 'approve_request' && isMgr && m.status === 'pending_approval') {
        if (isReq && !me.isAdmin) throw new Error('تأیید مأموریت، گزارش یا کلیم خود مجاز نیست.')
        next = m.needsTicket ? 'ticketing' : 'approved'
      } else if (action === 'return_request' && isMgr && m.status === 'pending_approval') next = 'returned'
      else if (action === 'reject_request' && isMgr && m.status === 'pending_approval') next = 'rejected'
      else if (action === 'issue_ticket' && isAA && m.status === 'ticketing') next = 'approved'
      else if (action === 'return_ticket' && isAA && m.status === 'ticketing') next = 'returned'
      else if (action === 'start_debrief' && isReq && m.status === 'approved') next = 'debrief'
      else if (action === 'submit_report' && isReq && (m.status === 'debrief' || m.status === 'revision_requested')) {
        if (!list.length) throw new Error('ابتدا گزارش را تولید کنید.')
        if (!signatures.get(me.id)) throw new Error('برای ارسال گزارش ابتدا امضای نمونه خود را ثبت کنید.')
        next = 'report_review'
      } else if (action === 'return_report' && isMgr && m.status === 'report_review') next = 'revision_requested'
      else if (action === 'approve_report' && isMgr && m.status === 'report_review') {
        if (isReq && !me.isAdmin) throw new Error('تأیید مأموریت، گزارش یا کلیم خود مجاز نیست.')
        next = 'ready_for_claim'
      } else if (action === 'approve_claim' && isAA && m.status === 'ready_for_claim') {
        if (isReq && !me.isAdmin) throw new Error('تأیید مأموریت، گزارش یا کلیم خود مجاز نیست.')
        next = 'claimed'
      }
      else if (action === 'cancel' && (isReq || isMgr) && ['draft', 'pending_approval', 'returned', 'ticketing', 'approved'].includes(m.status)) next = 'cancelled'
      if (!next) throw new Error('این اقدام در وضعیت فعلی مأموریت مجاز نیست.')

      const t = now()
      const upd: Mission = { ...m, status: next }
      if (['approve_request', 'return_request', 'reject_request', 'return_report', 'approve_report'].includes(action)) upd.managerComment = comment
      if (action === 'submit_request') upd.submittedAt = t
      if (action === 'approve_request') {
        upd.approvedAt = t
        if (!upd.approverId) { upd.approverId = me.id; upd.approverName = personName(me.id) }
      }
      if (action === 'start_debrief') upd.debriefStartedAt = t
      if (action === 'submit_report') upd.reportSubmittedAt = t
      if (action === 'approve_report') upd.finalApprovedAt = t
      if (action === 'issue_ticket') { upd.ticket = data as Mission['ticket']; upd.ticketIssuedAt = t }
      if (['issue_ticket', 'return_ticket', 'approve_claim'].includes(action)) upd.adminComment = comment
      if (action === 'approve_claim') upd.claimedAt = t
      missions.set(id, upd)
      const last = list[list.length - 1]
      if (last) {
        if (action === 'submit_report') {
          last.status = 'submitted'
          last.submittedAt = t
          last.signature = { image: signatures.get(me.id) ?? '', name: personName(me.id) || me.name, position: m.requesterPosition, signedAt: t }
        }
        if (action === 'return_report') last.status = 'returned'
        if (action === 'approve_report') last.status = 'approved'
      }
      logEvent(id, action, comment, me.id)
    },

    async listRoles() {
      return [...roleSet].map((k) => { const [userId, role] = k.split('|'); return { userId, role: role as 'executive' | 'admin_affairs' } })
    },
    async setRole(userId, role, on) {
      if (on) roleSet.add(`${userId}|${role}`)
      else roleSet.delete(`${userId}|${role}`)
    },

    async saveInterview(missionId, patch) {
      const prev = interviews.get(missionId)
      const next: Interview = {
        id: prev?.id ?? uid(),
        missionId,
        status: patch.status ?? prev?.status ?? 'active',
        state: patch.state ?? prev?.state ?? { plan: [], topics: {}, current: null, pending: null, asked: 0 },
        provider: patch.provider ?? prev?.provider ?? 'rules',
        summaryConfirmedAt: patch.summaryConfirmedAt !== undefined ? patch.summaryConfirmedAt : prev?.summaryConfirmedAt ?? null,
      }
      interviews.set(missionId, next)
      return next
    },
    async appendTurns(missionId, startSeq, drafts: TurnDraft[]) {
      const list = turns.get(missionId) ?? []
      const added: Turn[] = drafts.map((d, i) => ({ id: uid(), missionId, seq: startSeq + i, topicKey: d.topicKey, role: d.role, kind: d.kind, text: d.text, inputMode: d.inputMode, meta: d.meta ?? {}, createdAt: now() }))
      turns.set(missionId, [...list, ...added])
      return added
    },
    async upsertFindings(missionId, list) {
      for (const f of list) {
        const prev = findings.get(f.id)
        if (!prev) logAudit('insert', null, f, me.id)
        findings.set(f.id, { ...(prev ?? f), ...f, missionId, approval: prev?.approval ?? f.approval, managerNote: prev?.managerNote ?? f.managerNote, transferredTo: prev?.transferredTo ?? f.transferredTo, transferredId: prev?.transferredId ?? f.transferredId, transferredAt: prev?.transferredAt ?? f.transferredAt })
      }
    },
    async updateFinding(id, patch) {
      const f = findings.get(id)
      if (!f) return
      if ((patch.approval !== undefined || patch.managerNote !== undefined) && !me.isManager) throw new Error('این اقدام فقط برای مجری طرح مجاز است.')
      const next = { ...f, ...patch } as Finding
      logAudit('update', f, next, me.id)
      findings.set(id, next)
    },
    async deleteFinding(id) {
      const f = findings.get(id)
      if (f) logAudit('delete', f, null, me.id)
      findings.delete(id)
    },
    async updateObjective(id, patch) {
      const o = objectives.get(id)
      if (o) objectives.set(id, { ...o, ...patch })
    },

    async addEvidence(missionId, draft, file) {
      const e: Evidence = {
        id: uid(),
        missionId,
        findingId: draft.findingId,
        objectiveId: draft.objectiveId,
        topicKey: draft.topicKey,
        kind: draft.kind,
        title: draft.title,
        note: draft.note,
        filePath: file ? `mem/${uid()}` : null,
        mime: file?.type ?? '',
        sizeBytes: file?.size ?? 0,
        capturedAt: draft.capturedAt ?? null,
        createdAt: now(),
      }
      evidence.set(e.id, e)
      return e
    },
    async deleteEvidence(id) {
      evidence.delete(id)
    },
    async evidenceUrl() {
      return null
    },

    async saveReport(missionId, d) {
      const list = reports.get(missionId) ?? []
      const prev = list[list.length - 1]
      let rep: Report
      if (prev && (prev.status === 'draft' || prev.status === 'returned')) {
        rep = { ...prev, status: 'draft', content: d.content, qualityScore: d.qualityScore, qualityBreakdown: d.breakdown, generatedBy: d.generatedBy }
        list[list.length - 1] = rep
      } else {
        rep = { id: uid(), missionId, version: (prev?.version ?? 0) + 1, status: 'draft', content: d.content, qualityScore: d.qualityScore, qualityBreakdown: d.breakdown, generatedBy: d.generatedBy, createdAt: now(), submittedAt: null }
        list.push(rep)
      }
      reports.set(missionId, list)
      const m = missions.get(missionId)
      if (m) missions.set(missionId, { ...m, qualityScore: d.qualityScore })
      return rep
    },
    async loadMySignature() {
      return signatures.get(me.id) ?? null
    },
    async saveMySignature(image) {
      signatures.set(me.id, image)
    },
    async addEvent(missionId, event, comment = '') {
      return logEvent(missionId, event, comment, me.id)
    },

    async transferFinding(findingId, target, params = {}) {
      if (!me.isManager) throw new Error('این اقدام فقط برای مجری طرح مجاز است.')
      const f = findings.get(findingId)
      if (!f) throw new Error('یافته پیدا نشد')
      if (f.transferredId) throw new Error('این مورد قبلاً منتقل شده است.')
      const id = uid()
      findings.set(findingId, { ...f, approval: 'approved', transferredTo: target, transferredId: id, transferredAt: now(), managerNote: String(params.note ?? '') || f.managerNote })
      linkedMap.set(findingId, { findingId, target, linkedId: id, linkedCode: target === 'risk' ? `R-${String(10 + linkedMap.size).padStart(3, '0')}` : id.slice(0, 8).toUpperCase(), linkedStatus: target === 'action' ? 'not_started' : 'open' })
      logEvent(f.missionId, `transfer_${target}`, '', me.id)
      return { target, id }
    },
    async linkedStatus(ids) {
      return [...linkedMap.values()].filter((l) => ids.includes(findings.get(l.findingId)?.missionId ?? ''))
    },
  }
  return repo
  }
  return build(opts.user)
}
