/**
 * PSSR rules — one place. A system moves MC → PSSR → ready for RFSU → signing → RFSU → gas-in permit → gas-in → under
 * gas; nothing here is stored, everything is derived from its checklist, meetings, punches, sign-offs and permit.
 *  - RFSU can be signed only when: a PSSR meeting was held, every mandatory check is «ok» or «n/a», and no category-A punch
 *    is still open (closed means verified by someone else).
 *  - the sign chain runs step by step; a step is done when ANY (rule any) or ALL (rule all) of its persons signed; a
 *    rejection stops the chain until that person signs after rework. A manual step is the operator's hand-signed form,
 *    confirmed in the system by the step's persons with the scan attached.
 *  - the gas-in permit can be approved only after RFSU and with every day-of-gas-in check confirmed.
 */
import { GASIN_CHECKS, SUMMARY_ITEMS, type GasinPermit, type PssrCheck, type PssrMeeting, type PssrPunch, type PssrSigner, type PssrSignoff } from '../types'

export type PssrStage = 'mc' | 'pssr' | 'ready' | 'signing' | 'rfsu' | 'permit' | 'gasin' | 'live'
export const STAGE_FA: Record<PssrStage, string> = { mc: 'تکمیل مکانیکی', pssr: 'در حال PSSR', ready: 'آمادهٔ امضای RFSU', signing: 'در حال امضای RFSU', rfsu: 'RFSU صادر شد', permit: 'مجوز تزریق گاز', gasin: 'تزریق گاز در جریان', live: 'تحت گاز' }
export const STAGE_ORDER: PssrStage[] = ['mc', 'pssr', 'ready', 'signing', 'rfsu', 'permit', 'gasin', 'live']
export const STAGE_COLOR: Record<PssrStage, string> = { mc: '#64748b', pssr: '#f59e0b', ready: '#3b82f6', signing: '#a855f7', rfsu: '#10b981', permit: '#0ea5e9', gasin: '#f97316', live: '#16a34a' }

export type SignerRow = Pick<PssrSigner, 'seq' | 'roleLabel' | 'personLabel' | 'signerEmail' | 'rule' | 'manual'>
export interface Blocker { kind: 'no_meeting' | 'check_pending' | 'check_failed' | 'punch_a' | 'summary'; label: string }
export interface ChainPerson { label: string; email: string; state: 'signed' | 'rejected' | 'pending'; by: string | null; at: string | null; comment: string; fileUrl: string | null; manualSigner: string; manualSignedOn: string | null }
export interface ChainStep { seq: number; label: string; rule: 'any' | 'all'; manual: boolean; persons: ChainPerson[]; state: 'signed' | 'rejected' | 'next' | 'waiting'; at: string | null }
export interface SystemStatus {
  stage: PssrStage
  blockers: Blocker[]
  /** share of the RFSU conditions met: mandatory checks resolved + category-A punches verified + the meeting, 0…100 */
  readiness: number
  checks: { total: number; mandatory: number; ok: number; na: number; fail: number; pending: number }
  punches: Record<'A' | 'B' | 'C', { open: number; total: number }>
  overdue: number
  chain: ChainStep[]
  nextStep: ChainStep | null
  rfsuAt: string | null
  gasin: { checksDone: number; checksTotal: number; canApprove: boolean; status: GasinPermit['status'] | null }
}

const isResolved = (c: PssrCheck) => c.status === 'ok' || c.status === 'na'

export function chainOf(signers: SignerRow[], signoffs: PssrSignoff[]): ChainStep[] {
  const seqs = [...new Set(signers.map((s) => s.seq))].sort((a, b) => a - b)
  let blocked = false
  return seqs.map((seq) => {
    const rows = signers.filter((s) => s.seq === seq)
    const persons: ChainPerson[] = rows.map((r) => {
      const last = signoffs.filter((x) => x.seq === seq && (x.personLabel || '') === r.personLabel).sort((a, b) => a.signedAt.localeCompare(b.signedAt)).at(-1)
      return { label: r.personLabel || r.roleLabel, email: r.signerEmail, state: last ? (last.decision === 'sign' ? 'signed' : 'rejected') : 'pending', by: last?.signedBy ?? null, at: last?.signedAt ?? null, comment: last?.comment ?? '', fileUrl: last?.fileUrl ?? null, manualSigner: last?.manualSigner ?? '', manualSignedOn: last?.manualSignedOn ?? null }
    })
    const rule = rows[0]?.rule ?? 'any', manual = rows.some((r) => r.manual)
    const signed = persons.filter((p) => p.state === 'signed')
    const done = rule === 'all' ? signed.length === persons.length : signed.length > 0
    const rejected = persons.some((p) => p.state === 'rejected') && !(rule === 'any' && signed.length > 0)
    const at = done ? signed.map((p) => p.at ?? '').sort().at(-1) ?? null : null
    let state: ChainStep['state']
    if (blocked) state = 'waiting'
    else if (done) state = 'signed'
    else { blocked = true; state = rejected ? 'rejected' : 'next' }
    if (blocked && state === 'signed') state = 'waiting'
    return { seq, label: rows[0]?.roleLabel ?? '', rule, manual, persons: state === 'waiting' ? persons.map((p) => ({ ...p })) : persons, state, at }
  })
}

export function systemStatus(input: { checks: PssrCheck[]; meetings: Pick<PssrMeeting, 'id'>[]; punches: PssrPunch[]; signers: SignerRow[]; signoffs: PssrSignoff[]; permit?: GasinPermit | null; summary?: Record<string, boolean> | null }, today = new Date().toISOString().slice(0, 10)): SystemStatus {
  const { checks, meetings, punches } = input
  const mand = checks.filter((c) => c.mandatory)
  const blockers: Blocker[] = []
  if (!meetings.length) blockers.push({ kind: 'no_meeting', label: 'جلسهٔ PSSR هنوز برگزار و ثبت نشده است' })
  for (const c of mand) {
    if (c.status === 'fail') blockers.push({ kind: 'check_failed', label: `بند رد شده: ${c.title}` })
    else if (c.status === 'pending') blockers.push({ kind: 'check_pending', label: `بند بررسی نشده: ${c.title}` })
  }
  const openA = punches.filter((p) => p.category === 'A' && p.status !== 'verified')
  for (const p of openA) blockers.push({ kind: 'punch_a', label: `پانچ A باز: ${p.title}` })
  // a system on the official form also needs the form's six-statement summary confirmed before anyone signs
  const official = checks.some((c) => !!c.priority)
  const summaryOk = !official || SUMMARY_ITEMS.every((x) => input.summary?.[x.key])
  if (!summaryOk) blockers.push({ kind: 'summary', label: `جمع‌بندی فرم PSSR: ${SUMMARY_ITEMS.filter((x) => !input.summary?.[x.key]).length} مورد از ۶ مورد تأیید نشده است` })

  const punchStat = (k: 'A' | 'B' | 'C') => { const l = punches.filter((p) => p.category === k); return { open: l.filter((p) => p.status !== 'verified').length, total: l.length } }
  const aTotal = punches.filter((p) => p.category === 'A').length
  const denom = mand.length + aTotal + 1 + (official ? 1 : 0)
  const met = mand.filter(isResolved).length + (aTotal - openA.length) + (meetings.length ? 1 : 0) + (official && summaryOk ? 1 : 0)
  const chain = chainOf(input.signers, input.signoffs)
  const allSigned = chain.length > 0 && chain.every((s) => s.state === 'signed')
  const anySign = chain.some((s) => s.persons.some((p) => p.state !== 'pending'))
  const started = meetings.length > 0 || checks.some((c) => c.status !== 'pending') || punches.length > 0
  const rfsu = blockers.length === 0 && allSigned
  const permit = input.permit ?? null
  const checksDone = GASIN_CHECKS.filter((g) => permit?.checks[g.key]?.ok).length

  const stage: PssrStage = rfsu && permit?.status === 'completed' ? 'live'
    : rfsu && permit?.status === 'in_progress' ? 'gasin'
    : rfsu && permit?.status === 'approved' ? 'permit'
    : rfsu ? 'rfsu'
    : blockers.length === 0 && anySign ? 'signing'
    : blockers.length === 0 ? 'ready'
    : started ? 'pssr' : 'mc'

  return {
    stage, blockers,
    readiness: Math.round((met / denom) * 100),
    checks: { total: checks.length, mandatory: mand.length, ok: checks.filter((c) => c.status === 'ok').length, na: checks.filter((c) => c.status === 'na').length, fail: checks.filter((c) => c.status === 'fail').length, pending: checks.filter((c) => c.status === 'pending').length },
    punches: { A: punchStat('A'), B: punchStat('B'), C: punchStat('C') },
    overdue: punches.filter((p) => p.status === 'open' && p.dueDate != null && p.dueDate < today).length,
    chain,
    nextStep: blockers.length ? null : chain.find((s) => s.state === 'next' || s.state === 'rejected') ?? null,
    rfsuAt: rfsu ? chain.at(-1)?.at ?? null : null,
    gasin: { checksDone, checksTotal: GASIN_CHECKS.length, canApprove: rfsu && checksDone === GASIN_CHECKS.length && (!permit || permit.status === 'draft' || permit.status === 'aborted'), status: permit?.status ?? null },
  }
}

/** Can this user sign for this person of the current step? Their own email, or an admin (when no email is set or as override). */
export function canSign(step: ChainStep | null, person: ChainPerson | null, email: string | null | undefined, isAdmin: boolean): boolean {
  if (!step || !person || !email || person.state === 'signed') return false
  if (isAdmin) return true
  return !!person.email && person.email.toLowerCase() === email.toLowerCase()
}

/** Who may approve the gas-in permit: the persons of the last non-manual step (the employer), or an admin. */
export function permitApprovers(signers: SignerRow[]): SignerRow[] {
  const sys = signers.filter((s) => !s.manual)
  const last = Math.max(...sys.map((s) => s.seq), -Infinity)
  return sys.filter((s) => s.seq === last)
}

export function projectReadiness(list: SystemStatus[]) {
  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, list.filter((x) => x.stage === s).length])) as Record<PssrStage, number>
  const sum = (k: 'A' | 'B' | 'C') => list.reduce((n, x) => n + x.punches[k].open, 0)
  const withRfsu = byStage.rfsu + byStage.permit + byStage.gasin + byStage.live
  return {
    systems: list.length, byStage, withRfsu, live: byStage.live,
    openA: sum('A'), openB: sum('B'), openC: sum('C'),
    overdue: list.reduce((n, x) => n + x.overdue, 0),
    rfsuPct: list.length ? Math.round((withRfsu / list.length) * 100) : 0,
    livePct: list.length ? Math.round((byStage.live / list.length) * 100) : 0,
    avgReadiness: list.length ? Math.round(list.reduce((n, x) => n + x.readiness, 0) / list.length) : 0,
  }
}
