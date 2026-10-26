/**
 * PSSR rules — one place. A system moves MC → PSSR → ready for RFSU → RFSU issued; nothing here is stored, everything is
 * derived from its checklist, meetings, punches and sign-offs. Pure: rows in, verdicts out.
 *  - RFSU can be signed only when: a PSSR meeting was held, every mandatory check is «ok» or «n/a» (none failed), and no
 *    category-A punch is still open (A = must close before start-up; closed means verified by someone else).
 *  - the sign chain runs in order; a rejection stops it until the system is reworked (a later «sign» by the same step).
 */
import type { PssrCheck, PssrMeeting, PssrPunch, PssrSignoff } from '../types'

export type PssrStage = 'mc' | 'pssr' | 'ready' | 'signing' | 'rfsu'
export const STAGE_FA: Record<PssrStage, string> = { mc: 'تکمیل مکانیکی', pssr: 'در حال PSSR', ready: 'آمادهٔ امضای RFSU', signing: 'در حال امضای RFSU', rfsu: 'RFSU صادر شد' }
export const STAGE_ORDER: PssrStage[] = ['mc', 'pssr', 'ready', 'signing', 'rfsu']

export interface Blocker { kind: 'no_meeting' | 'check_pending' | 'check_failed' | 'punch_a'; label: string }
export interface ChainStep { seq: number; role: string; email: string; state: 'signed' | 'rejected' | 'next' | 'waiting'; by: string | null; at: string | null; comment: string }
export interface SystemStatus {
  stage: PssrStage
  blockers: Blocker[]
  /** share of the RFSU conditions met: mandatory checks resolved + category-A punches verified, 0…100 */
  readiness: number
  checks: { total: number; mandatory: number; ok: number; na: number; fail: number; pending: number }
  punches: Record<'A' | 'B' | 'C', { open: number; total: number }>
  overdue: number
  chain: ChainStep[]
  nextStep: ChainStep | null
  rfsuAt: string | null
}

const isResolved = (c: PssrCheck) => c.status === 'ok' || c.status === 'na'

/** The latest decision of each chain step decides it (a «reject» can be followed by a «sign» after rework). */
export function chainOf(signers: { seq: number; roleLabel: string; signerEmail: string }[], signoffs: PssrSignoff[]): ChainStep[] {
  const steps = [...signers].sort((a, b) => a.seq - b.seq)
  let blocked = false
  return steps.map((s) => {
    const last = signoffs.filter((x) => x.seq === s.seq).sort((a, b) => a.signedAt.localeCompare(b.signedAt)).at(-1)
    if (!blocked && last?.decision === 'sign') return { seq: s.seq, role: s.roleLabel, email: s.signerEmail, state: 'signed' as const, by: last.signedBy, at: last.signedAt, comment: last.comment }
    if (blocked) return { seq: s.seq, role: s.roleLabel, email: s.signerEmail, state: 'waiting' as const, by: null, at: null, comment: '' }
    blocked = true
    if (last?.decision === 'reject') return { seq: s.seq, role: s.roleLabel, email: s.signerEmail, state: 'rejected' as const, by: last.signedBy, at: last.signedAt, comment: last.comment }
    return { seq: s.seq, role: s.roleLabel, email: s.signerEmail, state: 'next' as const, by: null, at: null, comment: '' }
  })
}

export function systemStatus(input: { checks: PssrCheck[]; meetings: PssrMeeting[]; punches: PssrPunch[]; signers: { seq: number; roleLabel: string; signerEmail: string }[]; signoffs: PssrSignoff[] }, today = new Date().toISOString().slice(0, 10)): SystemStatus {
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

  const punchStat = (k: 'A' | 'B' | 'C') => { const l = punches.filter((p) => p.category === k); return { open: l.filter((p) => p.status !== 'verified').length, total: l.length } }
  const aTotal = punches.filter((p) => p.category === 'A').length
  const denom = mand.length + aTotal + 1 // +1: the meeting
  const met = mand.filter(isResolved).length + (aTotal - openA.length) + (meetings.length ? 1 : 0)
  const chain = chainOf(input.signers, input.signoffs)
  const allSigned = chain.length > 0 && chain.every((s) => s.state === 'signed')
  const anySign = chain.some((s) => s.state === 'signed' || s.state === 'rejected')
  const started = meetings.length > 0 || checks.some((c) => c.status !== 'pending') || punches.length > 0

  const stage: PssrStage = blockers.length === 0 && allSigned ? 'rfsu'
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
    rfsuAt: stage === 'rfsu' ? chain.at(-1)?.at ?? null : null,
  }
}

/** Can this user sign the next step? The designated email, or anyone with admin rights when no email is set / as override. */
export function canSign(step: ChainStep | null, email: string | null | undefined, isAdmin: boolean): boolean {
  if (!step || !email) return false
  if (isAdmin) return true
  return !!step.email && step.email.toLowerCase() === email.toLowerCase()
}

/** Project picture: systems per stage, open punches, and the lifecycle G7 share (systems with RFSU ÷ systems). */
export function projectReadiness(list: SystemStatus[]) {
  const byStage = Object.fromEntries(STAGE_ORDER.map((s) => [s, list.filter((x) => x.stage === s).length])) as Record<PssrStage, number>
  const sum = (k: 'A' | 'B' | 'C') => list.reduce((n, x) => n + x.punches[k].open, 0)
  return {
    systems: list.length, byStage,
    openA: sum('A'), openB: sum('B'), openC: sum('C'),
    overdue: list.reduce((n, x) => n + x.overdue, 0),
    rfsuPct: list.length ? Math.round((byStage.rfsu / list.length) * 100) : 0,
    avgReadiness: list.length ? Math.round(list.reduce((n, x) => n + x.readiness, 0) / list.length) : 0,
  }
}
