import { supabase, friendlyErrorMessage, useAuthStore } from '../platform'
import { readLinkedStatus, transferToSystemOfRecord } from '../integration/recordSystems'
import { DEFAULT_QUESTION_SET, type QuestionSet } from '../lib/questionSets'
import { uid, type TurnDraft } from '../lib/interviewEngine'
import type {
  Evidence,
  Finding,
  Interview,
  Mission,
  MissionBundle,
  MissionEvent,
  Objective,
  PersonRef,
  ProjectRef,
  Report,
  Turn,
} from '../types'
import type { CurrentUser, MissionDraft, MissionRepo, ObjectiveDraft, PortfolioData } from './types'

// --------------------------------------------------------------------------------------------- mapping

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function fail(error: { message: string } | null | undefined, fallback = 'عملیات انجام نشد'): never {
  const msg = error?.message ?? ''
  const known: Record<string, string> = {
    objectives_required: 'حداقل یک هدف برای مأموریت لازم است.',
    report_required: 'ابتدا گزارش را تولید کنید.',
    invalid_transition: 'این اقدام در وضعیت فعلی مأموریت مجاز نیست.',
    forbidden: 'دسترسی لازم برای این اقدام را ندارید.',
    manager_only: 'این اقدام فقط برای مجری طرح مجاز است.',
    signature_required: 'برای ارسال گزارش ابتدا امضای نمونه خود را ثبت کنید.',
    cannot_approve_own: 'تأیید مأموریت، گزارش یا کلیم خود مجاز نیست.',
    no_issue_mapping: 'برای این پروژه هنوز پروژه‌ای در مدیریت Issue متصل نشده است.',
    no_risk_mapping: 'برای این پروژه هنوز پروژه‌ای در مدیریت ریسک متصل نشده است.',
    already_transferred: 'این مورد قبلاً منتقل شده است.',
    request_locked: 'پس از ارسال، مشخصات اصلی درخواست قابل تغییر نیست.',
  }
  for (const [k, v] of Object.entries(known)) if (msg.includes(k)) throw new Error(v)
  throw new Error(error ? friendlyErrorMessage(error) : fallback)
}

function toMission(r: Row, people: Map<string, PersonRef>, projects: Map<string, ProjectRef>): Mission {
  return {
    id: r.id,
    code: r.code,
    requesterId: r.requester_id,
    requesterName: people.get(r.requester_id)?.name ?? '—',
    requesterPosition: r.requester_position ?? '',
    masterProjectId: r.master_project_id,
    projectName: projects.get(r.master_project_id)?.name ?? '—',
    destination: r.destination ?? '',
    locationDetail: r.location_detail ?? '',
    startDate: r.start_date,
    endDate: r.end_date,
    visitType: r.visit_type,
    visitees: Array.isArray(r.visitees) ? r.visitees : [],
    topicsOfInterest: r.topics_of_interest ?? '',
    expectedOutput: r.expected_output ?? '',
    needsTicket: r.needs_ticket !== false,
    originCity: r.origin_city ?? '',
    ticketNote: r.ticket_note ?? '',
    ticket: r.ticket ?? {},
    ticketIssuedAt: r.ticket_issued_at ?? null,
    adminComment: r.admin_comment ?? '',
    approverId: r.approver_id,
    approverName: r.approver_id ? people.get(r.approver_id)?.name ?? '' : '',
    status: r.status,
    managerComment: r.manager_comment ?? '',
    qualityScore: r.quality_score == null ? null : Number(r.quality_score),
    submittedAt: r.submitted_at,
    approvedAt: r.approved_at,
    debriefStartedAt: r.debrief_started_at,
    reportSubmittedAt: r.report_submitted_at,
    finalApprovedAt: r.final_approved_at,
    claimedAt: r.claimed_at,
    createdAt: r.created_at,
  }
}

const toObjective = (r: Row): Objective => ({
  id: r.id,
  missionId: r.mission_id,
  position: r.position,
  title: r.title,
  measure: r.measure ?? '',
  topicKey: r.topic_key ?? '',
  priority: r.priority,
  status: r.status,
  resultNote: r.result_note ?? '',
})

const toFinding = (r: Row): Finding => ({
  id: r.id,
  missionId: r.mission_id,
  kind: r.kind,
  topicKey: r.topic_key ?? '',
  title: r.title,
  description: r.description ?? '',
  details: r.details ?? {},
  severity: r.severity,
  ownerText: r.owner_text ?? '',
  ownerId: r.owner_id,
  dueDate: r.due_date,
  objectiveId: r.objective_id,
  confidence: Number(r.confidence ?? 0.6),
  userConfirmed: !!r.user_confirmed,
  approval: r.approval,
  managerNote: r.manager_note ?? '',
  transferredTo: r.transferred_to,
  transferredId: r.transferred_id,
  transferredAt: r.transferred_at,
  createdAt: r.created_at,
})

const toEvidence = (r: Row): Evidence => ({
  id: r.id,
  missionId: r.mission_id,
  findingId: r.finding_id,
  objectiveId: r.objective_id,
  topicKey: r.topic_key ?? '',
  kind: r.kind,
  title: r.title ?? '',
  note: r.note ?? '',
  filePath: r.file_path,
  mime: r.mime ?? '',
  sizeBytes: r.size_bytes ?? 0,
  createdAt: r.created_at,
})

const toTurn = (r: Row): Turn => ({
  id: r.id,
  missionId: r.mission_id,
  seq: r.seq,
  topicKey: r.topic_key ?? '',
  role: r.role,
  kind: r.kind,
  text: r.text,
  inputMode: r.input_mode,
  meta: r.meta ?? {},
  createdAt: r.created_at,
})

const toInterview = (r: Row): Interview => ({ id: r.id, missionId: r.mission_id, status: r.status, state: r.state, provider: r.provider, summaryConfirmedAt: r.summary_confirmed_at })

const toReport = (r: Row): Report => ({
  id: r.id,
  missionId: r.mission_id,
  version: r.version,
  status: r.status,
  content: r.content,
  qualityScore: r.quality_score == null ? null : Number(r.quality_score),
  qualityBreakdown: r.quality_breakdown ?? [],
  generatedBy: r.generated_by,
  createdAt: r.created_at,
  submittedAt: r.submitted_at,
  signature: r.signature ?? null,
})

function findingRow(f: Finding): Row {
  return {
    id: f.id,
    mission_id: f.missionId,
    kind: f.kind,
    topic_key: f.topicKey,
    title: f.title,
    description: f.description,
    details: f.details,
    severity: f.severity,
    owner_text: f.ownerText,
    owner_id: f.ownerId,
    due_date: f.dueDate,
    objective_id: f.objectiveId,
    confidence: f.confidence,
    user_confirmed: f.userConfirmed,
  }
}

// --------------------------------------------------------------------------------------------- repo

export function createSupabaseRepo(): MissionRepo {
  let peopleCache: Map<string, PersonRef> | null = null
  let projectCache: Map<string, ProjectRef> | null = null

  async function people(): Promise<Map<string, PersonRef>> {
    if (peopleCache) return peopleCache
    const { data } = await supabase.from('profiles').select('id, full_name, position_title')
    peopleCache = new Map(((data ?? []) as Row[]).map((p) => [p.id, { id: p.id, name: p.full_name || '—', position: p.position_title ?? '' }]))
    return peopleCache
  }
  async function projects(): Promise<Map<string, ProjectRef>> {
    if (projectCache) return projectCache
    const { data } = await supabase.from('master_projects').select('id, official_name, short_name, project_id_code, project_type').order('official_name')
    projectCache = new Map(
      ((data ?? []) as Row[]).map((p) => [p.id, { id: p.id, name: p.short_name || p.official_name, code: p.project_id_code ?? '', projectType: p.project_type ?? '' }]),
    )
    return projectCache
  }

  const missionPatch = (d: Partial<MissionDraft>): Row => {
    const out: Row = {}
    if (d.masterProjectId !== undefined) out.master_project_id = d.masterProjectId
    if (d.requesterPosition !== undefined) out.requester_position = d.requesterPosition
    if (d.destination !== undefined) out.destination = d.destination
    if (d.locationDetail !== undefined) out.location_detail = d.locationDetail
    if (d.startDate !== undefined) out.start_date = d.startDate
    if (d.endDate !== undefined) out.end_date = d.endDate
    if (d.visitType !== undefined) out.visit_type = d.visitType
    if (d.visitees !== undefined) out.visitees = d.visitees
    if (d.topicsOfInterest !== undefined) out.topics_of_interest = d.topicsOfInterest
    if (d.expectedOutput !== undefined) out.expected_output = d.expectedOutput
    if (d.needsTicket !== undefined) out.needs_ticket = d.needsTicket
    if (d.originCity !== undefined) out.origin_city = d.originCity
    if (d.ticketNote !== undefined) out.ticket_note = d.ticketNote
    if (d.approverId !== undefined) out.approver_id = d.approverId
    return out
  }

  async function replaceObjectives(missionId: string, objectives: ObjectiveDraft[]) {
    const { data: existing } = await supabase.from('ms_objectives').select('id').eq('mission_id', missionId)
    const keep = new Set(objectives.map((o) => o.id).filter(Boolean) as string[])
    const drop = ((existing ?? []) as Row[]).map((r) => r.id as string).filter((id) => !keep.has(id))
    if (drop.length) {
      const { error } = await supabase.from('ms_objectives').delete().in('id', drop)
      if (error) fail(error)
    }
    const rows = objectives.map((o, i) => ({ id: o.id ?? uid(), mission_id: missionId, position: i, title: o.title, measure: o.measure, topic_key: o.topicKey, priority: o.priority }))
    if (rows.length) {
      const { error } = await supabase.from('ms_objectives').upsert(rows)
      if (error) fail(error)
    }
  }

  return {
    async loadCurrentUser(): Promise<CurrentUser> {
      const p = useAuthStore.getState().profile
      const [mgr, aa] = await Promise.all([supabase.rpc('ms_is_manager'), supabase.rpc('ms_is_admin_affairs')])
      return { id: p?.id ?? '', name: p?.fullName ?? '', position: p?.positionTitle ?? '', isAdmin: !!p?.isAdmin, isManager: mgr.data === true || !!p?.isAdmin, isAdminAffairs: aa.data === true || !!p?.isAdmin }
    },
    async listProjects() {
      return [...(await projects()).values()]
    },
    async listPeople() {
      return [...(await people()).values()].sort((a, b) => a.name.localeCompare(b.name, 'fa'))
    },
    async loadQuestionSets() {
      const { data } = await supabase.from('ms_question_sets').select('*').eq('is_active', true)
      const custom = ((data ?? []) as Row[]).map((r) => ({ ...(r.definition as QuestionSet), key: r.key, title: r.title, version: r.version }))
      // A stored set with the default's key replaces it; others are additional.
      return [DEFAULT_QUESTION_SET, ...custom].reduce<QuestionSet[]>((acc, s) => [...acc.filter((x) => x.key !== s.key), s], [])
    },

    async loadPortfolio(): Promise<PortfolioData> {
      const [pp, pr] = await Promise.all([people(), projects()])
      const [m, o, f, i, r] = await Promise.all([
        supabase.from('ms_missions').select('*').order('created_at', { ascending: false }),
        supabase.from('ms_objectives').select('*'),
        supabase.from('ms_findings').select('*'),
        supabase.from('ms_interviews').select('*'),
        supabase.from('ms_reports').select('mission_id, quality_score, status, submitted_at, version'),
      ])
      if (m.error) fail(m.error)
      const missions = ((m.data ?? []) as Row[]).map((x) => toMission(x, pp, pr))
      const latest = new Map<string, Row>()
      for (const rep of (r.data ?? []) as Row[]) {
        const cur = latest.get(rep.mission_id)
        if (!cur || rep.version > cur.version) latest.set(rep.mission_id, rep)
      }
      const linked = await this.linkedStatus(missions.map((x) => x.id))
      return {
        missions,
        objectives: ((o.data ?? []) as Row[]).map(toObjective),
        findings: ((f.data ?? []) as Row[]).map(toFinding),
        interviews: ((i.data ?? []) as Row[]).map(toInterview),
        reports: [...latest.values()].map((x) => ({ missionId: x.mission_id, qualityScore: x.quality_score == null ? null : Number(x.quality_score), status: x.status, submittedAt: x.submitted_at })),
        linked,
      }
    },

    async loadBundle(id): Promise<MissionBundle> {
      const [pp, pr] = await Promise.all([people(), projects()])
      const [m, o, f, e, t, iv, rp, ev] = await Promise.all([
        supabase.from('ms_missions').select('*').eq('id', id).single(),
        supabase.from('ms_objectives').select('*').eq('mission_id', id).order('position'),
        supabase.from('ms_findings').select('*').eq('mission_id', id).order('created_at'),
        supabase.from('ms_evidence').select('*').eq('mission_id', id).order('created_at'),
        supabase.from('ms_turns').select('*').eq('mission_id', id).order('seq'),
        supabase.from('ms_interviews').select('*').eq('mission_id', id).maybeSingle(),
        supabase.from('ms_reports').select('*').eq('mission_id', id).order('version', { ascending: false }).limit(1),
        supabase.from('ms_events').select('*').eq('mission_id', id).order('created_at'),
      ])
      if (m.error) fail(m.error)
      const events: MissionEvent[] = ((ev.data ?? []) as Row[]).map((x) => ({ id: x.id, missionId: x.mission_id, actorId: x.actor_id, actorName: x.actor_id ? pp.get(x.actor_id)?.name ?? '—' : 'سیستم', event: x.event, comment: x.comment ?? '', detail: x.detail ?? {}, createdAt: x.created_at }))
      return {
        mission: toMission(m.data as Row, pp, pr),
        objectives: ((o.data ?? []) as Row[]).map(toObjective),
        findings: ((f.data ?? []) as Row[]).map(toFinding),
        evidence: ((e.data ?? []) as Row[]).map(toEvidence),
        turns: ((t.data ?? []) as Row[]).map(toTurn),
        interview: iv.data ? toInterview(iv.data as Row) : null,
        report: rp.data && (rp.data as Row[]).length ? toReport((rp.data as Row[])[0]) : null,
        events,
        linked: await this.linkedStatus([id]),
      }
    },

    async createMission(draft, objectives) {
      const [pp, pr] = await Promise.all([people(), projects()])
      const uidNow = useAuthStore.getState().profile?.id
      const { data, error } = await supabase.from('ms_missions').insert({ ...missionPatch(draft), requester_id: uidNow }).select('*').single()
      if (error) fail(error)
      const mission = toMission(data as Row, pp, pr)
      await replaceObjectives(mission.id, objectives)
      await supabase.from('ms_events').insert({ mission_id: mission.id, event: 'created' })
      return mission
    },
    async updateMission(id, draft, objectives) {
      const patch = missionPatch(draft)
      if (Object.keys(patch).length) {
        const { error } = await supabase.from('ms_missions').update(patch).eq('id', id)
        if (error) fail(error)
      }
      if (objectives) await replaceObjectives(id, objectives)
    },
    async deleteMission(id) {
      const { error } = await supabase.from('ms_missions').delete().eq('id', id)
      if (error) fail(error)
    },
    async transition(id, action, comment = '', data = {}) {
      const { error } = await supabase.rpc('ms_transition', { p_mission_id: id, p_action: action, p_comment: comment, p_data: data })
      if (error) fail(error)
    },
    async listRoles() {
      const { data } = await supabase.from('ms_roles').select('user_id, role')
      return ((data ?? []) as Row[]).map((r) => ({ userId: r.user_id, role: r.role }))
    },
    async setRole(userId, role, on) {
      const q = on ? supabase.from('ms_roles').upsert({ user_id: userId, role }) : supabase.from('ms_roles').delete().eq('user_id', userId).eq('role', role)
      const { error } = await q
      if (error) fail(error)
    },

    async saveInterview(missionId, patch) {
      const row: Row = { mission_id: missionId }
      if (patch.status) row.status = patch.status
      if (patch.state) row.state = patch.state
      if (patch.provider) row.provider = patch.provider
      if (patch.summaryConfirmedAt !== undefined) row.summary_confirmed_at = patch.summaryConfirmedAt
      const { data, error } = await supabase.from('ms_interviews').upsert(row, { onConflict: 'mission_id' }).select('*').single()
      if (error) fail(error)
      return toInterview(data as Row)
    },
    async appendTurns(missionId, startSeq, turns: TurnDraft[]) {
      if (!turns.length) return []
      const rows = turns.map((t, i) => ({ mission_id: missionId, seq: startSeq + i, topic_key: t.topicKey, role: t.role, kind: t.kind, text: t.text, input_mode: t.inputMode, meta: t.meta ?? {} }))
      const { data, error } = await supabase.from('ms_turns').insert(rows).select('*')
      if (error) fail(error)
      return ((data ?? []) as Row[]).map(toTurn).sort((a, b) => a.seq - b.seq)
    },
    async upsertFindings(missionId, findings) {
      if (!findings.length) return
      const { error } = await supabase.from('ms_findings').upsert(findings.map((f) => ({ ...findingRow(f), mission_id: missionId })))
      if (error) fail(error)
    },
    async updateFinding(id, patch) {
      const row: Row = {}
      if (patch.title !== undefined) row.title = patch.title
      if (patch.description !== undefined) row.description = patch.description
      if (patch.severity !== undefined) row.severity = patch.severity
      if (patch.ownerText !== undefined) row.owner_text = patch.ownerText
      if (patch.ownerId !== undefined) row.owner_id = patch.ownerId
      if (patch.dueDate !== undefined) row.due_date = patch.dueDate
      if (patch.userConfirmed !== undefined) row.user_confirmed = patch.userConfirmed
      if (patch.details !== undefined) row.details = patch.details
      if (patch.kind !== undefined) row.kind = patch.kind
      if (patch.approval !== undefined) row.approval = patch.approval
      if (patch.managerNote !== undefined) row.manager_note = patch.managerNote
      const { error } = await supabase.from('ms_findings').update(row).eq('id', id)
      if (error) fail(error)
    },
    async deleteFinding(id) {
      const { error } = await supabase.from('ms_findings').delete().eq('id', id)
      if (error) fail(error)
    },
    async updateObjective(id, patch) {
      const row: Row = {}
      if (patch.status !== undefined) row.status = patch.status
      if (patch.resultNote !== undefined) row.result_note = patch.resultNote
      const { error } = await supabase.from('ms_objectives').update(row).eq('id', id)
      if (error) fail(error)
    },

    async addEvidence(missionId, draft, file) {
      let filePath: string | null = null
      let mime = ''
      let size = 0
      if (file) {
        const name = file instanceof File ? file.name : 'voice.webm'
        const ext = (name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
        filePath = `${missionId}/${uid()}.${ext}`
        mime = file.type
        size = file.size
        const up = await supabase.storage.from('mission-evidence').upload(filePath, file, { contentType: file.type || undefined })
        if (up.error) throw new Error('بارگذاری فایل انجام نشد. اتصال و حجم فایل را بررسی کنید.')
      }
      const { data, error } = await supabase
        .from('ms_evidence')
        .insert({ mission_id: missionId, finding_id: draft.findingId, objective_id: draft.objectiveId, topic_key: draft.topicKey, kind: draft.kind, title: draft.title, note: draft.note, file_path: filePath, mime, size_bytes: size })
        .select('*')
        .single()
      if (error) fail(error)
      return toEvidence(data as Row)
    },
    async deleteEvidence(id) {
      const { data } = await supabase.from('ms_evidence').select('file_path').eq('id', id).maybeSingle()
      const path = (data as Row | null)?.file_path as string | null | undefined
      const { error } = await supabase.from('ms_evidence').delete().eq('id', id)
      if (error) fail(error)
      if (path) await supabase.storage.from('mission-evidence').remove([path])
    },
    async evidenceUrl(path) {
      const { data } = await supabase.storage.from('mission-evidence').createSignedUrl(path, 3600)
      return data?.signedUrl ?? null
    },

    async saveReport(missionId, d) {
      const { data: last } = await supabase.from('ms_reports').select('id, version, status').eq('mission_id', missionId).order('version', { ascending: false }).limit(1)
      const prev = (last as Row[] | null)?.[0]
      // Editing a draft/returned report rewrites it in place; a submitted or approved one starts a new version.
      const row = { content: d.content, quality_score: d.qualityScore, quality_breakdown: d.breakdown, generated_by: d.generatedBy }
      let saved: Row
      if (prev && (prev.status === 'draft' || prev.status === 'returned')) {
        const { data, error } = await supabase.from('ms_reports').update({ ...row, status: 'draft' }).eq('id', prev.id).select('*').single()
        if (error) fail(error)
        saved = data as Row
      } else {
        const { data, error } = await supabase.from('ms_reports').insert({ mission_id: missionId, version: (prev?.version ?? 0) + 1, ...row }).select('*').single()
        if (error) fail(error)
        saved = data as Row
      }
      await supabase.from('ms_missions').update({ quality_score: d.qualityScore }).eq('id', missionId)
      return toReport(saved)
    },
    async loadMySignature() {
      const { data } = await supabase.from('user_signatures').select('image').maybeSingle()
      return (data as Row | null)?.image ?? null
    },
    async saveMySignature(image) {
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) throw new Error('ابتدا وارد حساب کاربری شوید.')
      const { error } = await supabase.from('user_signatures').upsert({ user_id: u.user.id, image, updated_at: new Date().toISOString() })
      if (error) fail(error)
    },
    async addEvent(missionId, event, comment = '') {
      const { data, error } = await supabase.from('ms_events').insert({ mission_id: missionId, event, comment }).select('*').single()
      if (error || !data) return null
      const r = data as Row
      return { id: r.id, missionId, actorId: r.actor_id, actorName: (await people()).get(r.actor_id)?.name ?? '—', event, comment, detail: {}, createdAt: r.created_at }
    },

    async transferFinding(findingId, target, params = {}) {
      try {
        return await transferToSystemOfRecord(findingId, target, params)
      } catch (e) {
        fail(e as { message: string })
      }
    },
    linkedStatus: (ids) => readLinkedStatus(ids),
  }
}
