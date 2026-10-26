import { create } from 'zustand'
import { supabase } from '../../../lib/supabaseClient'
import type { PssrCheck, PssrKind, PssrMeeting, PssrPunch, PssrSigner, PssrSignoff, PssrSystem, PssrTemplateItem, PunchCategory, CheckStatus } from '../types'

type Row = Record<string, any>
const s = (v: unknown) => (v == null ? '' : String(v))
const sn = (v: unknown) => (v == null || v === '' ? null : String(v))
const nn = (v: unknown) => (v == null || v === '' ? null : Number(v))

const sysOf = (r: Row): PssrSystem => ({ id: r.id, projectId: r.master_project_id, code: s(r.code), name: s(r.name), kind: r.kind, kmFrom: nn(r.km_from), kmTo: nn(r.km_to), targetGasIn: sn(r.target_gas_in), note: s(r.note), createdAt: s(r.created_at) })
const checkOf = (r: Row): PssrCheck => ({ id: r.id, systemId: r.system_id, category: s(r.category), seq: Number(r.seq ?? 0), title: s(r.title), mandatory: !!r.mandatory, status: r.status, evidence: s(r.evidence), fileUrl: sn(r.file_url), checkedBy: sn(r.checked_by), checkedAt: sn(r.checked_at) })
const meetOf = (r: Row): PssrMeeting => ({ id: r.id, systemId: r.system_id, heldOn: s(r.held_on), attendees: s(r.attendees), notes: s(r.notes), createdBy: sn(r.created_by) })
const punchOf = (r: Row): PssrPunch => ({ id: r.id, systemId: r.system_id, meetingId: sn(r.meeting_id), category: r.category, title: s(r.title), discipline: s(r.discipline), owner: s(r.owner), dueDate: sn(r.due_date), status: r.status, raisedBy: sn(r.raised_by), raisedAt: s(r.raised_at), closeNote: s(r.close_note), closedBy: sn(r.closed_by), closedAt: sn(r.closed_at), verifiedBy: sn(r.verified_by), verifiedAt: sn(r.verified_at) })
const signerOf = (r: Row): PssrSigner => ({ id: r.id, projectId: r.master_project_id, seq: Number(r.seq), roleLabel: s(r.role_label), signerEmail: s(r.signer_email) })
const signoffOf = (r: Row): PssrSignoff => ({ id: r.id, systemId: r.system_id, seq: Number(r.seq), roleLabel: s(r.role_label), decision: r.decision, comment: s(r.comment), signedBy: s(r.signed_by), signedAt: s(r.signed_at) })
const tplOf = (r: Row): PssrTemplateItem => ({ id: Number(r.id), kind: r.kind, category: s(r.category), seq: Number(r.seq ?? 0), title: s(r.title), mandatory: !!r.mandatory, active: !!r.is_active })

interface State {
  projectId: string | null
  loading: boolean
  /** set when the tables are missing (the SQL file has not been run yet) or a read failed */
  error: string | null
  systems: PssrSystem[]; checks: PssrCheck[]; meetings: PssrMeeting[]; punches: PssrPunch[]; signers: PssrSigner[]; signoffs: PssrSignoff[]; templates: PssrTemplateItem[]
  load: (projectId: string) => Promise<void>
  addSystem: (p: { code: string; name: string; kind: PssrKind; kmFrom: number | null; kmTo: number | null; targetGasIn: string | null; note: string }, by: string) => Promise<string | null>
  updateSystem: (id: string, p: Partial<{ name: string; targetGasIn: string | null; note: string }>) => Promise<boolean>
  deleteSystem: (id: string) => Promise<boolean>
  setCheck: (id: string, status: CheckStatus, evidence: string, by: string) => Promise<boolean>
  addMeeting: (systemId: string, heldOn: string, attendees: string, notes: string, by: string) => Promise<boolean>
  addPunch: (p: { systemId: string; meetingId: string | null; category: PunchCategory; title: string; discipline: string; owner: string; dueDate: string | null }, by: string) => Promise<boolean>
  closePunch: (id: string, note: string, by: string) => Promise<boolean>
  verifyPunch: (id: string, by: string) => Promise<boolean>
  reopenPunch: (id: string) => Promise<boolean>
  sign: (systemId: string, seq: number, roleLabel: string, decision: 'sign' | 'reject', comment: string, by: string) => Promise<boolean>
  saveSigners: (rows: { roleLabel: string; signerEmail: string }[]) => Promise<boolean>
  addTemplate: (t: { kind: PssrKind | 'all'; category: string; title: string; mandatory: boolean }) => Promise<boolean>
}

const now = () => new Date().toISOString()

export const usePssrStore = create<State>()((set, get) => {
  const ok = async (p: PromiseLike<{ error: unknown }>) => { const { error } = await p; if (error) { set({ error: (error as { message?: string }).message ?? 'خطا' }); return false } const pid = get().projectId; if (pid) await get().load(pid); return true }
  return {
    projectId: null, loading: false, error: null,
    systems: [], checks: [], meetings: [], punches: [], signers: [], signoffs: [], templates: [],

    load: async (projectId) => {
      set({ loading: get().projectId !== projectId, projectId })
      const sys = await supabase.from('pssr_systems').select('*').eq('master_project_id', projectId).order('code')
      if (sys.error) { set({ loading: false, error: sys.error.message, systems: [] }); return }
      const ids = (sys.data ?? []).map((r: Row) => r.id)
      const any = ids.length ? ids : ['00000000-0000-0000-0000-000000000000']
      const [ch, me, pu, sg, so, tp] = await Promise.all([
        supabase.from('pssr_checks').select('*').in('system_id', any).order('seq'),
        supabase.from('pssr_meetings').select('*').in('system_id', any).order('held_on', { ascending: false }),
        supabase.from('pssr_punches').select('*').in('system_id', any).order('raised_at'),
        supabase.from('pssr_signers').select('*').eq('master_project_id', projectId).order('seq'),
        supabase.from('pssr_signoffs').select('*').in('system_id', any).order('signed_at'),
        supabase.from('pssr_template_items').select('*').order('seq'),
      ])
      set({
        loading: false, error: ch.error?.message ?? null,
        systems: (sys.data ?? []).map(sysOf), checks: (ch.data ?? []).map(checkOf), meetings: (me.data ?? []).map(meetOf), punches: (pu.data ?? []).map(punchOf),
        signers: (sg.data ?? []).map(signerOf), signoffs: (so.data ?? []).map(signoffOf), templates: (tp.data ?? []).map(tplOf),
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
    updateSystem: (id, p) => ok(supabase.from('pssr_systems').update({ ...(p.name != null ? { name: p.name } : {}), ...(p.targetGasIn !== undefined ? { target_gas_in: p.targetGasIn } : {}), ...(p.note != null ? { note: p.note } : {}) }).eq('id', id)),
    deleteSystem: (id) => ok(supabase.from('pssr_systems').delete().eq('id', id)),
    setCheck: (id, status, evidence, by) => ok(supabase.from('pssr_checks').update({ status, evidence, checked_by: by, checked_at: now() }).eq('id', id)),
    addMeeting: (systemId, heldOn, attendees, notes, by) => ok(supabase.from('pssr_meetings').insert({ system_id: systemId, held_on: heldOn, attendees, notes, created_by: by })),
    addPunch: (p, by) => ok(supabase.from('pssr_punches').insert({ system_id: p.systemId, meeting_id: p.meetingId, category: p.category, title: p.title, discipline: p.discipline, owner: p.owner, due_date: p.dueDate, raised_by: by })),
    closePunch: (id, note, by) => ok(supabase.from('pssr_punches').update({ status: 'closed', close_note: note, closed_by: by, closed_at: now() }).eq('id', id)),
    verifyPunch: (id, by) => ok(supabase.from('pssr_punches').update({ status: 'verified', verified_by: by, verified_at: now() }).eq('id', id)),
    reopenPunch: (id) => ok(supabase.from('pssr_punches').update({ status: 'open', closed_by: null, closed_at: null, verified_by: null, verified_at: null }).eq('id', id)),
    sign: (systemId, seq, roleLabel, decision, comment, by) => ok(supabase.from('pssr_signoffs').insert({ system_id: systemId, seq, role_label: roleLabel, decision, comment, signed_by: by })),
    saveSigners: async (rows) => {
      const pid = get().projectId
      if (!pid) return false
      const del = await supabase.from('pssr_signers').delete().eq('master_project_id', pid)
      if (del.error) { set({ error: del.error.message }); return false }
      return ok(supabase.from('pssr_signers').insert(rows.map((r, i) => ({ master_project_id: pid, seq: i + 1, role_label: r.roleLabel, signer_email: r.signerEmail.trim() }))))
    },
    addTemplate: (t) => ok(supabase.from('pssr_template_items').insert({ kind: t.kind, category: t.category, title: t.title, mandatory: t.mandatory, seq: 100 + get().templates.length })),
  }
})
