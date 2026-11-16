import { useEffect, useMemo, useRef } from 'react'
import { useWqStore } from '../store/useWqStore'
import { useEpcStore } from '../../execution/store/useEpcStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { todayTehran } from '../../../lib/today'
import * as repo from '../repo'
import { codeOf, monthKey, useQc, weldLabel } from './useQc'
import { CODE_FA, type Code } from './api1104'
import { detectTriggers, lateness, type CapaInput, type Trigger } from './capa'
import { useTickerFeed, type Head } from '../../../components/common/tickerFeed'

/** the quality records of the project, in the plain shape the CAPA rules read */
export function useCapaInput(): CapaInput {
  const st = useWqStore(), q = useQc()
  const ncrs = useEpcStore((s) => s.ncrs)
  return useMemo(() => {
    const label = (id: string) => { const r = q.byId.get(id); return r ? weldLabel(r.weld) : '—' }
    const firsts = [...q.last.entries()].filter(([k]) => k.endsWith('#0')).map(([, e]) => ({ weldId: e.weldId, label: label(e.weldId), at: e.at, repaired: e.overall !== 'accept', welders: q.byId.get(e.weldId)?.welders ?? [] }))
    const evalAt = new Map(st.evaluations.map((e) => [`${e.weldId}#${e.round}`, e.evaluatedAt]))
    const rejected = st.defects.filter((d) => !d.removed && d.verdict && d.verdict !== 'accept').map((d) => ({ weldId: d.weldId, code: codeOf(d), at: evalAt.get(`${d.weldId}#${d.round}`) ?? d.createdAt, crack: codeOf(d) === 'C' && d.lengthMm > st.crit.crack.crater }))
    const cutouts = st.joints.filter((j) => j.finalStatus === 'cut_out').map((j) => ({ weldId: j.weldId, label: label(j.weldId), at: j.closedAt ?? '' })).filter((c) => c.at)
    const repeats = st.repairs.filter((r) => r.round >= 1).map((r) => ({ weldId: r.weldId, label: label(r.weldId), at: r.createdAt }))
    return {
      firsts, rejected, cutouts, repeats,
      films: st.films.filter((f) => f.quality !== 'pending').map((f) => ({ at: f.qualityAt ?? f.createdAt, bad: f.quality !== 'accepted' })),
      coat: st.coatings.filter((c) => !c.removed && c.kind === 'inspection' && c.result).map((c) => ({ at: c.at, bad: c.result !== 'pass' })),
      ncrs: ncrs.filter((n) => n.projectId === st.projectId).map((n) => ({ id: n.id, code: n.code, kind: n.kind, severity: n.severity, rcaRequired: n.rcaRequired, status: n.status, createdAt: n.createdAt, description: n.description })),
      hydroFailed: st.sections.filter((s) => s.failed).map((s) => s.code),
      nameOf: q.nameOf, codeName: (c: string) => CODE_FA[c as Code] ?? c, periodOf: monthKey,
    }
  }, [q, st.evaluations, st.defects, st.joints, st.repairs, st.films, st.coatings, st.sections, st.crit, st.projectId, ncrs])
}

export const triggerPayload = (t: Trigger) => ({ fingerprint: t.fingerprint, rule: t.rule, source: t.rule === 'ncr' ? 'ncr' : 'system', mandatory: t.mandatory, severity: t.severity, title: t.title, problem: t.problem, evidence: t.evidence, scope: t.scope, baseline: t.metric, ncr_id: t.scope.ncrId ?? null })

/** today's triggers, split into those that already have a case and those that do not */
export function useCapa() {
  const st = useWqStore(), input = useCapaInput()
  const today = todayTehran()
  return useMemo(() => {
    const triggers = detectTriggers(input, st.capaCfg, today)
    const fps = new Set(st.capa.map((c) => c.fingerprint).filter(Boolean))
    const me = useAuthStore.getState().profile?.id ?? ''
    const cases = st.capa.map((c) => {
      const actions = st.capaActions.filter((a) => a.caseId === c.id), attendees = st.capaAttendees.filter((a) => a.caseId === c.id)
      const late = lateness({ status: c.status, meetingDue: c.meetingDue, verifyDue: c.verifyDue, actionsDue: actions.filter((a) => a.status === 'open').map((a) => a.dueDate) }, today)
      const mySign = c.status === 'rca' && attendees.some((a) => a.round === c.round && a.present && a.userId === me && !a.signedAt)
      const myActions = actions.filter((a) => a.status === 'open' && a.ownerId === me).length
      return { c, actions, attendees, late, mySign, myActions }
    })
    return { input, today, triggers, pending: triggers.filter((t) => !fps.has(t.fingerprint)), cases }
  }, [input, st.capaCfg, st.capa, st.capaActions, st.capaAttendees, today])
}

/** opens a case for every mandatory trigger that has none yet — the clock of the meeting starts when the pattern appears, not when someone agrees to look */
export function useCapaAuto() {
  const st = useWqStore(), { pending } = useCapa()
  const epcLoaded = useEpcStore((s) => s.loaded)
  const sent = useRef(new Set<string>())
  useEffect(() => {
    if (!st.projectId || st.loading || !st.capaCfg.auto || !(st.caps.edit || st.caps.configure)) return
    const due = pending.filter((t) => t.mandatory && !sent.current.has(`${st.projectId}|${t.fingerprint}`) && (epcLoaded || !t.rule.startsWith('ncr')))
    if (!due.length) return
    const pid = st.projectId
    for (const t of due) sent.current.add(`${pid}|${t.fingerprint}`)
    void (async () => {
      let n = 0
      for (const t of due) { try { await repo.capaOpen(pid, triggerPayload(t)); n++ } catch { /* missing table or right: the list still shows the trigger */ } }
      if (n && useWqStore.getState().projectId === pid) { await useWqStore.getState().load(pid, true); useWqStore.setState({ flash: { tone: 'bad', text: `${n.toLocaleString('fa-IR')} پروندهٔ الزامی اقدام اصلاحی باز شد — جلسهٔ ریشه‌یابی باید برگزار شود` } }) }
    })()
  }, [pending, st.projectId, st.loading, st.capaCfg.auto, st.caps.edit, st.caps.configure, epcLoaded])
}

/** publishes the CAPA headlines of the open project to the module's news bar: overdue meetings, minutes awaiting the user's signature, their open actions */
export function useCapaHeadlines() {
  const capa = useWqStore((s) => s.capa), pid = useWqStore((s) => s.projectId), att = useWqStore((s) => s.capaAttendees), act = useWqStore((s) => s.capaActions)
  const me = useAuthStore((s) => s.profile?.id ?? '')
  useEffect(() => {
    if (!pid) return
    const today = todayTehran(), fa = (n: number) => n.toLocaleString('fa-IR')
    const go = (id: string) => () => window.dispatchEvent(new CustomEvent('qc:capa', { detail: { capa: id } }))
    const out: Head[] = []
    for (const c of capa) {
      if (c.status === 'closed' || c.status === 'void') continue
      const late = (c.status === 'open' || c.status === 'rca') && c.meetingDue < today
      if (late) out.push({ id: `capa:${c.id}`, text: `${c.code}: جلسهٔ ریشه‌یابی از مهلت گذشته است`, sub: c.title, tone: 'bad', open: go(c.id) })
      else if (c.mandatory && (c.status === 'open' || c.status === 'rca')) out.push({ id: `capa:${c.id}`, text: `${c.code}: جلسهٔ ریشه‌یابی الزامی است`, sub: c.title, tone: 'warn', open: go(c.id) })
      if (c.status === 'rca' && att.some((a) => a.caseId === c.id && a.round === c.round && a.present && a.userId === me && !a.signedAt)) out.push({ id: `capas:${c.id}`, text: `${c.code}: صورتجلسه منتظر امضای شماست`, sub: c.title, tone: 'bad', open: go(c.id) })
      const mine = act.filter((a) => a.caseId === c.id && a.status === 'open' && a.ownerId === me)
      if (mine.length && c.status === 'agreed') out.push({ id: `capaa:${c.id}`, text: `${c.code}: ${fa(mine.length)} اقدام به نام شما باز است`, sub: mine[0].title, tone: mine.some((a) => a.dueDate < today) ? 'bad' : 'warn', open: go(c.id) })
    }
    useTickerFeed.getState().publish('weldqc', pid, out)
  }, [capa, pid, att, act, me])
}
