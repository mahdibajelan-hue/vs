import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import type { GasinCheck, GasinLog, GasinLogKind, GasinPermit, PssrCheck, PssrKind, PssrMeeting, PssrPunch, PssrSigner, PssrSignoff, PssrSystem, PssrTemplateItem, PunchCategory, CheckStatus } from '../types'

type Row = Record<string, any>
const s = (v: unknown) => (v == null ? '' : String(v))
const sn = (v: unknown) => (v == null || v === '' ? null : String(v))
const nn = (v: unknown) => (v == null || v === '' ? null : Number(v))

const sysOf = (r: Row): PssrSystem => ({ id: r.id, projectId: r.master_project_id, code: s(r.code), name: s(r.name), kind: r.kind, kmFrom: nn(r.km_from), kmTo: nn(r.km_to), targetGasIn: sn(r.target_gas_in), note: s(r.note), createdAt: s(r.created_at) })
const checkOf = (r: Row): PssrCheck => ({ id: r.id, systemId: r.system_id, category: s(r.category), seq: Number(r.seq ?? 0), title: s(r.title), mandatory: !!r.mandatory, status: r.status, evidence: s(r.evidence), fileUrl: sn(r.file_url), checkedBy: sn(r.checked_by), checkedAt: sn(r.checked_at) })
const meetOf = (r: Row): PssrMeeting => ({ id: r.id, systemId: r.system_id, heldOn: s(r.held_on), attendees: s(r.attendees), notes: s(r.notes), createdBy: sn(r.created_by) })
const punchOf = (r: Row): PssrPunch => ({ id: r.id, systemId: r.system_id, meetingId: sn(r.meeting_id), category: r.category, title: s(r.title), discipline: s(r.discipline), owner: s(r.owner), dueDate: sn(r.due_date), status: r.status, raisedBy: sn(r.raised_by), raisedAt: s(r.raised_at), closeNote: s(r.close_note), closedBy: sn(r.closed_by), closedAt: sn(r.closed_at), verifiedBy: sn(r.verified_by), verifiedAt: sn(r.verified_at) })
const signerOf = (r: Row): PssrSigner => ({ id: r.id, projectId: r.master_project_id, seq: Number(r.seq), roleLabel: s(r.role_label), personLabel: s(r.person_label), signerEmail: s(r.signer_email), rule: r.step_rule === 'all' ? 'all' : 'any', manual: !!r.is_manual })
const signoffOf = (r: Row): PssrSignoff => ({ id: r.id, systemId: r.system_id, seq: Number(r.seq), roleLabel: s(r.role_label), personLabel: s(r.person_label), decision: r.decision, comment: s(r.comment), signedBy: s(r.signed_by), signedAt: s(r.signed_at), manualSigner: s(r.manual_signer), manualSignedOn: sn(r.manual_signed_on), fileUrl: sn(r.file_url) })
const permitOf = (r: Row): GasinPermit => ({ id: r.id, systemId: r.system_id, ptwNo: s(r.ptw_no), plannedAt: sn(r.planned_at), checks: (r.checks ?? {}) as Record<string, GasinCheck>, status: r.status, approvedBy: sn(r.approved_by), approvedAt: sn(r.approved_at), startedAt: sn(r.started_at), completedAt: sn(r.completed_at), finalPressure: nn(r.final_pressure), notes: s(r.notes) })
const logOf = (r: Row): GasinLog => ({ id: r.id, permitId: r.permit_id, at: s(r.at), kind: r.kind, pressure: nn(r.pressure), location: s(r.location), note: s(r.note), by: s(r.by_user) })

/** what other modules say about this project's readiness: open NCRs, engineering documents not yet approved, open changes (MOC) */
export interface PssrAdvisories { ncr: { code: string; text: string }[]; docs: { code: string; text: string; asBuilt: boolean }[]; moc: { code: string; text: string; status: string }[] }
const NCR_DONE = new Set(['closed', 'void']), DOC_DONE = new Set(['approved', 'superseded']), MOC_DONE = new Set(['closed', 'rejected', 'cancelled', 'implemented'])
const tplOf = (r: Row): PssrTemplateItem => ({ id: Number(r.id), kind: r.kind, category: s(r.category), seq: Number(r.seq ?? 0), title: s(r.title), mandatory: !!r.mandatory, active: !!r.is_active })

interface State {
  projectId: string | null
  loading: boolean
  /** set when the tables are missing (the SQL file has not been run yet) or a read failed */
  error: string | null
  systems: PssrSystem[]; checks: PssrCheck[]; meetings: PssrMeeting[]; punches: PssrPunch[]; signers: PssrSigner[]; signoffs: PssrSignoff[]; templates: PssrTemplateItem[]
  permits: GasinPermit[]; logs: GasinLog[]; advisories: PssrAdvisories | null
  load: (projectId: string) => Promise<void>
  addSystem: (p: { code: string; name: string; kind: PssrKind; kmFrom: number | null; kmTo: number | null; targetGasIn: string | null; note: string }, by: string) => Promise<string | null>
  updateSystem: (id: string, p: Partial<{ name: string; kind: PssrKind; kmFrom: number | null; kmTo: number | null; targetGasIn: string | null; note: string }>) => Promise<boolean>
  deleteSystem: (id: string) => Promise<boolean>
  /** `fileUrl`: a photo / document path in the private bucket (undefined keeps the current one) */
  setCheck: (id: string, status: CheckStatus, evidence: string, by: string, fileUrl?: string | null) => Promise<boolean>
  addMeeting: (systemId: string, heldOn: string, attendees: string, notes: string, by: string) => Promise<boolean>
  addPunch: (p: { systemId: string; meetingId: string | null; category: PunchCategory; title: string; discipline: string; owner: string; dueDate: string | null }, by: string) => Promise<boolean>
  closePunch: (id: string, note: string, by: string) => Promise<boolean>
  verifyPunch: (id: string, by: string) => Promise<boolean>
  reopenPunch: (id: string) => Promise<boolean>
  sign: (p: { systemId: string; seq: number; roleLabel: string; personLabel: string; decision: 'sign' | 'reject'; comment: string; manualSigner?: string; manualSignedOn?: string | null; fileUrl?: string | null }, by: string) => Promise<boolean>
  /** uploads a scanned form to the private bucket and returns its storage path (opened later through a short-lived signed URL) */
  uploadScan: (systemId: string, file: File) => Promise<string | null>
  openScan: (path: string) => Promise<void>
  saveSigners: (rows: Omit<PssrSigner, 'id' | 'projectId'>[]) => Promise<boolean>
  savePermit: (systemId: string, p: Partial<{ ptwNo: string; plannedAt: string | null; checks: Record<string, GasinCheck>; notes: string }>, by: string) => Promise<boolean>
  setPermitStatus: (systemId: string, status: GasinPermit['status'], by: string, extra?: { finalPressure?: number | null; note?: string }) => Promise<boolean>
  addLog: (permitId: string, l: { kind: GasinLogKind; pressure: number | null; location: string; note: string }, by: string) => Promise<boolean>
  addTemplate: (t: { kind: PssrKind | 'all'; category: string; title: string; mandatory: boolean }) => Promise<boolean>
}

const now = () => new Date().toISOString()
const SCAN_BUCKET = 'pssr-docs'

export const usePssrStore = create<State>()((set, get) => {
  const ok = async (p: PromiseLike<{ error: unknown }>) => { const { error } = await p; if (error) { set({ error: (error as { message?: string }).message ?? 'خطا' }); return false } const pid = get().projectId; if (pid) await get().load(pid); return true }
  return {
    projectId: null, loading: false, error: null,
    systems: [], checks: [], meetings: [], punches: [], signers: [], signoffs: [], templates: [], permits: [], logs: [], advisories: null,

    load: async (projectId) => {
      set({ loading: get().projectId !== projectId, projectId })
      const sys = await supabase.from('pssr_systems').select('*').eq('master_project_id', projectId).order('code')
      if (sys.error) { set({ loading: false, error: sys.error.message, systems: [] }); return }
      const ids = (sys.data ?? []).map((r: Row) => r.id)
      const any = ids.length ? ids : ['00000000-0000-0000-0000-000000000000']
      const [ch, me, pu, sg, so, tp, pm, nc, dc, cr] = await Promise.all([
        supabase.from('pssr_checks').select('*').in('system_id', any).order('seq'),
        supabase.from('pssr_meetings').select('*').in('system_id', any).order('held_on', { ascending: false }),
        supabase.from('pssr_punches').select('*').in('system_id', any).order('raised_at'),
        supabase.from('pssr_signers').select('*').eq('master_project_id', projectId).order('seq'),
        supabase.from('pssr_signoffs').select('*').in('system_id', any).order('signed_at'),
        supabase.from('pssr_template_items').select('*').order('seq'),
        supabase.from('pssr_gasin_permits').select('*').in('system_id', any),
        supabase.from('ex_ncr').select('code, description, status, severity').eq('project_id', projectId),
        supabase.from('ex_eng_docs').select('doc_no, title, status, category').eq('project_id', projectId),
        supabase.from('chg_change_requests').select('cr_number, title, status').eq('master_project_id', projectId),
      ])
      const permits = (pm.data ?? []).map(permitOf)
      const lg = permits.length ? await supabase.from('pssr_gasin_logs').select('*').in('permit_id', permits.map((x) => x.id)).order('at') : { data: [] as Row[] }
      set({
        loading: false, error: ch.error?.message ?? null,
        systems: (sys.data ?? []).map(sysOf), checks: (ch.data ?? []).map(checkOf), meetings: (me.data ?? []).map(meetOf), punches: (pu.data ?? []).map(punchOf),
        signers: (sg.data ?? []).map(signerOf), signoffs: (so.data ?? []).map(signoffOf), templates: (tp.data ?? []).map(tplOf),
        permits, logs: (lg.data ?? []).map(logOf),
        advisories: {
          ncr: (nc.data ?? []).filter((r: Row) => !NCR_DONE.has(r.status)).map((r: Row) => ({ code: s(r.code), text: s(r.description) })),
          docs: (dc.data ?? []).filter((r: Row) => !DOC_DONE.has(r.status)).map((r: Row) => ({ code: s(r.doc_no), text: s(r.title), asBuilt: /as.?built|ازبیلت|چون.?ساخت/i.test(`${r.title} ${r.category ?? ''}`) })),
          moc: (cr.data ?? []).filter((r: Row) => !MOC_DONE.has(r.status)).map((r: Row) => ({ code: s(r.cr_number), text: s(r.title), status: s(r.status) })),
        },
      })
    },

    addSystem: async (p, by) => {
      const pid = get().projectId
      if (!pid) return null
      const { data, error } = await supabase.from('pssr_systems').insert({ master_project_id: pid, code: p.code.trim(), name: p.name.trim(), kind: p.kind, km_from: p.kmFrom, km_to: p.kmTo, target_gas_in: p.targetGasIn, note: p.note, created_by: by }).select('id').single()
      if (error || !data) { set({ error: error?.message ?? 'خطا' }); return null }
      // the system's checklist: a copy of the template for its kind, so later template edits never rewrite a reviewed list
      const items = get().templates.filter((t) => t.active && (t.kind === 'all' || t.kind === p.kind))
      if (items.length) await supabase.from('pssr_checks').insert(items.map((t) => ({ system_id: data.id, template_item_id: t.id, category: t.category, seq: t.seq, title: t.title, mandatory: t.mandatory })))
      await get().load(pid)
      return data.id as string
    },
    updateSystem: (id, p) => ok(supabase.from('pssr_systems').update({ ...(p.name != null ? { name: p.name } : {}), ...(p.kind ? { kind: p.kind } : {}), ...(p.kmFrom !== undefined ? { km_from: p.kmFrom } : {}), ...(p.kmTo !== undefined ? { km_to: p.kmTo } : {}), ...(p.targetGasIn !== undefined ? { target_gas_in: p.targetGasIn } : {}), ...(p.note != null ? { note: p.note } : {}) }).eq('id', id)),
    deleteSystem: (id) => ok(supabase.from('pssr_systems').delete().eq('id', id)),
    setCheck: (id, status, evidence, by, fileUrl) => ok(supabase.from('pssr_checks').update({ status, evidence, checked_by: by, checked_at: now(), ...(fileUrl !== undefined ? { file_url: fileUrl } : {}) }).eq('id', id)),
    addMeeting: (systemId, heldOn, attendees, notes, by) => ok(supabase.from('pssr_meetings').insert({ system_id: systemId, held_on: heldOn, attendees, notes, created_by: by })),
    addPunch: (p, by) => ok(supabase.from('pssr_punches').insert({ system_id: p.systemId, meeting_id: p.meetingId, category: p.category, title: p.title, discipline: p.discipline, owner: p.owner, due_date: p.dueDate, raised_by: by })),
    closePunch: (id, note, by) => ok(supabase.from('pssr_punches').update({ status: 'closed', close_note: note, closed_by: by, closed_at: now() }).eq('id', id)),
    verifyPunch: (id, by) => ok(supabase.from('pssr_punches').update({ status: 'verified', verified_by: by, verified_at: now() }).eq('id', id)),
    reopenPunch: (id) => ok(supabase.from('pssr_punches').update({ status: 'open', closed_by: null, closed_at: null, verified_by: null, verified_at: null }).eq('id', id)),
    sign: (p, by) => ok(supabase.from('pssr_signoffs').insert({ system_id: p.systemId, seq: p.seq, role_label: p.roleLabel, person_label: p.personLabel, decision: p.decision, comment: p.comment, signed_by: by, manual_signer: p.manualSigner ?? '', manual_signed_on: p.manualSignedOn ?? null, file_url: p.fileUrl ?? null })),
    uploadScan: async (systemId, file) => {
      const ext = (file.name.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'bin'
      const path = `${systemId}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from(SCAN_BUCKET).upload(path, file)
      if (error) { set({ error: `بارگذاری فایل ناموفق بود: ${error.message}` }); return null }
      return path
    },
    openScan: async (path) => {
      const { data, error } = await supabase.storage.from(SCAN_BUCKET).createSignedUrl(path, 300)
      if (error || !data) { set({ error: `باز کردن فایل ناموفق بود: ${error?.message ?? ''}` }); return }
      window.open(data.signedUrl, '_blank', 'noopener')
    },
    saveSigners: async (rows) => {
      const pid = get().projectId
      if (!pid) return false
      const del = await supabase.from('pssr_signers').delete().eq('master_project_id', pid)
      if (del.error) { set({ error: del.error.message }); return false }
      return ok(supabase.from('pssr_signers').insert(rows.map((r) => ({ master_project_id: pid, seq: r.seq, role_label: r.roleLabel.trim(), person_label: r.personLabel.trim(), signer_email: r.signerEmail.trim(), step_rule: r.rule, is_manual: r.manual }))))
    },
    savePermit: async (systemId, p, by) => {
      const row = { ...(p.ptwNo !== undefined ? { ptw_no: p.ptwNo } : {}), ...(p.plannedAt !== undefined ? { planned_at: p.plannedAt } : {}), ...(p.checks ? { checks: p.checks } : {}), ...(p.notes !== undefined ? { notes: p.notes } : {}) }
      const cur = get().permits.find((x) => x.systemId === systemId)
      return ok(cur ? supabase.from('pssr_gasin_permits').update(row).eq('id', cur.id) : supabase.from('pssr_gasin_permits').insert({ system_id: systemId, created_by: by, ...row }))
    },
    setPermitStatus: async (systemId, status, by, extra) => {
      const cur = get().permits.find((x) => x.systemId === systemId)
      if (!cur) return false
      const t = now()
      const row: Row = { status }
      if (status === 'approved') Object.assign(row, { approved_by: by, approved_at: t })
      if (status === 'draft') Object.assign(row, { approved_by: null, approved_at: null, started_at: null, completed_at: null })
      if (status === 'in_progress') row.started_at = t
      if (status === 'completed') Object.assign(row, { completed_at: t, final_pressure: extra?.finalPressure ?? null })
      const up = await supabase.from('pssr_gasin_permits').update(row).eq('id', cur.id)
      if (up.error) { set({ error: up.error.message }); return false }
      // the log records every status change, so the gas-in record reads end to end
      const note = { approved: 'مجوز تزریق گاز صادر شد', in_progress: 'شروع عملیات تزریق گاز', completed: 'پایان تزریق گاز — سیستم تحت گاز', aborted: 'توقف عملیات تزریق گاز', draft: 'مجوز به پیش‌نویس برگشت' }[status]
      return ok(supabase.from('pssr_gasin_logs').insert({ permit_id: cur.id, kind: status === 'aborted' ? 'incident' : 'note', pressure: extra?.finalPressure ?? null, note: extra?.note ? `${note}: ${extra.note}` : note, by_user: by }))
    },
    addLog: (permitId, l, by) => ok(supabase.from('pssr_gasin_logs').insert({ permit_id: permitId, kind: l.kind, pressure: l.pressure, location: l.location, note: l.note, by_user: by })),
    addTemplate: (t) => ok(supabase.from('pssr_template_items').insert({ kind: t.kind, category: t.category, title: t.title, mandatory: t.mandatory, seq: 100 + get().templates.length })),
  }
})
