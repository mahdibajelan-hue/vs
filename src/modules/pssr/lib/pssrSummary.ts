import { supabase } from '../../../lib/supabaseClient'
import { DEFAULT_SIGN_CHAIN } from '../types'
import { projectReadiness, systemStatus, type SystemStatus } from './pssrCore'

type Row = Record<string, any>
export interface PssrSummary {
  systems: { id: string; code: string; name: string; status: SystemStatus }[]
  totals: ReturnType<typeof projectReadiness>
  openA: { system: string; title: string; due: string | null }[]
}

/** One project's PSSR picture (systems, stages, open A punches) for the radar and the lifecycle G7 page — the same rules
 * as the module (pssrCore). null when the module has no data or its tables are not created yet. */
export async function loadPssrSummary(masterProjectId: string): Promise<PssrSummary | null> {
  const sys = await supabase.from('pssr_systems').select('id, code, name').eq('master_project_id', masterProjectId).order('code')
  if (sys.error || !sys.data?.length) return null
  const ids = sys.data.map((r: Row) => r.id)
  const [ch, me, pu, sg, so] = await Promise.all([
    supabase.from('pssr_checks').select('id, system_id, mandatory, status, title').in('system_id', ids),
    supabase.from('pssr_meetings').select('id, system_id').in('system_id', ids),
    supabase.from('pssr_punches').select('id, system_id, category, status, title, due_date').in('system_id', ids),
    supabase.from('pssr_signers').select('seq, role_label, signer_email').eq('master_project_id', masterProjectId).order('seq'),
    supabase.from('pssr_signoffs').select('system_id, seq, decision, comment, signed_by, signed_at').in('system_id', ids),
  ])
  const signers = (sg.data ?? []).length ? (sg.data as Row[]).map((r) => ({ seq: Number(r.seq), roleLabel: r.role_label, signerEmail: r.signer_email ?? '' })) : DEFAULT_SIGN_CHAIN.map((r, i) => ({ seq: i + 1, roleLabel: r, signerEmail: '' }))
  const systems = (sys.data as Row[]).map((s) => ({
    id: s.id, code: s.code, name: s.name,
    status: systemStatus({
      checks: ((ch.data ?? []) as Row[]).filter((c) => c.system_id === s.id).map((c) => ({ id: c.id, systemId: s.id, category: '', seq: 0, title: c.title, mandatory: !!c.mandatory, status: c.status, evidence: '', fileUrl: null, checkedBy: null, checkedAt: null })),
      meetings: ((me.data ?? []) as Row[]).filter((m) => m.system_id === s.id).map((m) => ({ id: m.id, systemId: s.id, heldOn: '', attendees: '', notes: '', createdBy: null })),
      punches: ((pu.data ?? []) as Row[]).filter((p) => p.system_id === s.id).map((p) => ({ id: p.id, systemId: s.id, meetingId: null, category: p.category, title: p.title, discipline: '', owner: '', dueDate: p.due_date, status: p.status, raisedBy: null, raisedAt: '', closeNote: '', closedBy: null, closedAt: null, verifiedBy: null, verifiedAt: null })),
      signers,
      signoffs: ((so.data ?? []) as Row[]).filter((x) => x.system_id === s.id).map((x) => ({ id: '', systemId: s.id, seq: Number(x.seq), roleLabel: '', decision: x.decision, comment: x.comment ?? '', signedBy: x.signed_by, signedAt: x.signed_at })),
    }),
  }))
  const openA = ((pu.data ?? []) as Row[]).filter((p) => p.category === 'A' && p.status !== 'verified').map((p) => ({ system: (sys.data as Row[]).find((s) => s.id === p.system_id)?.code ?? '', title: p.title, due: p.due_date }))
  return { systems, totals: projectReadiness(systems.map((s) => s.status)), openA }
}
