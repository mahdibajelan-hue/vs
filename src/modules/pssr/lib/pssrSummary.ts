import { supabase } from '../../../lib/supabaseClient'
import { DEFAULT_SIGN_CHAIN } from '../types'
import { projectReadiness, systemStatus, type SignerRow, type SystemStatus } from './pssrCore'

type Row = Record<string, any>
export interface PssrSummary {
  systems: { id: string; code: string; name: string; kind: string; kmFrom: number | null; kmTo: number | null; status: SystemStatus }[]
  totals: ReturnType<typeof projectReadiness>
  openA: { system: string; title: string; due: string | null }[]
}

/** One project's PSSR picture (systems, stages, open A punches) for the radar and the lifecycle G7 page — the same rules
 * as the module (pssrCore). null when the module has no data or its tables are not created yet. */
export async function loadPssrSummary(masterProjectId: string): Promise<PssrSummary | null> {
  const sys = await supabase.from('pssr_systems').select('id, code, name, kind, km_from, km_to, summary').eq('master_project_id', masterProjectId).order('code')
  if (sys.error || !sys.data?.length) return null
  const ids = sys.data.map((r: Row) => r.id)
  const [ch, me, pu, sg, so, pm] = await Promise.all([
    supabase.from('pssr_checks').select('id, system_id, mandatory, status, title, priority').in('system_id', ids),
    supabase.from('pssr_meetings').select('id, system_id').in('system_id', ids),
    supabase.from('pssr_punches').select('id, system_id, category, status, title, due_date').in('system_id', ids),
    supabase.from('pssr_signers').select('seq, role_label, person_label, signer_email, step_rule, is_manual').eq('master_project_id', masterProjectId).order('seq'),
    supabase.from('pssr_signoffs').select('system_id, seq, person_label, decision, comment, signed_by, signed_at').in('system_id', ids),
    supabase.from('pssr_gasin_permits').select('system_id, status, checks').in('system_id', ids),
  ])
  const signers: SignerRow[] = (sg.data ?? []).length ? (sg.data as Row[]).map((r) => ({ seq: Number(r.seq), roleLabel: r.role_label, personLabel: r.person_label ?? '', signerEmail: r.signer_email ?? '', rule: r.step_rule === 'all' ? 'all' : 'any', manual: !!r.is_manual })) : DEFAULT_SIGN_CHAIN
  const systems = (sys.data as Row[]).map((s) => ({
    id: s.id, code: s.code, name: s.name, kind: s.kind, kmFrom: s.km_from == null ? null : Number(s.km_from), kmTo: s.km_to == null ? null : Number(s.km_to),
    status: systemStatus({
      checks: ((ch.data ?? []) as Row[]).filter((c) => c.system_id === s.id).map((c) => ({ id: c.id, systemId: s.id, category: '', seq: 0, title: c.title, mandatory: !!c.mandatory, status: c.status, evidence: '', fileUrl: null, checkedBy: null, checkedAt: null, area: '', priority: c.priority ?? '', refNo: null, templateItemId: null })),
      meetings: ((me.data ?? []) as Row[]).filter((m) => m.system_id === s.id).map((m) => ({ id: m.id, systemId: s.id, heldOn: '', attendees: '', notes: '', createdBy: null })),
      punches: ((pu.data ?? []) as Row[]).filter((p) => p.system_id === s.id).map((p) => ({ id: p.id, systemId: s.id, meetingId: null, checkId: null, category: p.category, title: p.title, discipline: '', owner: '', dueDate: p.due_date, status: p.status, raisedBy: null, raisedAt: '', closeNote: '', closedBy: null, closedAt: null, verifiedBy: null, verifiedAt: null })),
      signers, summary: s.summary ?? {},
      signoffs: ((so.data ?? []) as Row[]).filter((x) => x.system_id === s.id).map((x) => ({ id: '', systemId: s.id, seq: Number(x.seq), roleLabel: '', personLabel: x.person_label ?? '', decision: x.decision, comment: x.comment ?? '', signedBy: x.signed_by, signedAt: x.signed_at, manualSigner: '', manualSignedOn: null, fileUrl: null })),
      permit: (() => { const p = ((pm.data ?? []) as Row[]).find((x) => x.system_id === s.id); return p ? { id: '', systemId: s.id, ptwNo: '', plannedAt: null, checks: p.checks ?? {}, status: p.status, approvedBy: null, approvedAt: null, startedAt: null, completedAt: null, finalPressure: null, notes: '' } : null })(),
    }),
  }))
  const openA = ((pu.data ?? []) as Row[]).filter((p) => p.category === 'A' && p.status !== 'verified').map((p) => ({ system: (sys.data as Row[]).find((s) => s.id === p.system_id)?.code ?? '', title: p.title, due: p.due_date }))
  return { systems, totals: projectReadiness(systems.map((s) => s.status)), openA }
}
