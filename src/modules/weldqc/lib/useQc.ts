import { useMemo } from 'react'
import { useWqStore } from '../store/useWqStore'
import { latestByRound, qcState, type QEval, type QcState, type QWeld, type QDefect } from './analytics'
import { thicknessMm } from './rules'
import { allWelders, PASSES, type CrewRow } from './crew'
import { jointHealth, smoothed, welderScore, type Health } from './health'
import { codeOfType, type Api1104Criteria, type Code } from './api1104'
import { isoToJalali, JALALI_MONTHS } from '../../../lib/jalali'
import type { Evaluation, Joint, QcWeld, Coating } from '../repo'

export const fa = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: 0 }))
export const weldLabel = (w: { sec: string; weld: string }) => `${w.sec || '—'} / ${w.weld || '—'}`
/** Jalali month key (YYYY-MM) and its label */
export const monthKey = (iso: string) => { const j = isoToJalali(iso.slice(0, 10)); return j ? `${j.jy}-${String(j.jm).padStart(2, '0')}` : iso.slice(0, 7) }
export const monthLabel = (k: string) => { const [y, m] = k.split('-').map(Number); return `${JALALI_MONTHS[m - 1] ?? m} ${String(y).slice(2).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x])}` }
export const faDate = (iso: string | null | undefined) => { if (!iso) return '—'; const j = isoToJalali(iso.slice(0, 10)); return j ? `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`.replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x]) : iso }

export const toQEval = (e: Evaluation): QEval => ({ weldId: e.weldId, round: e.round, overall: e.overall, at: e.evaluatedAt, signed: !!e.signedAt })
/** the code of a defect (recorded, else derived from its broad type) */
export const codeOf = (d: { code: Code | ''; type: string }): Code | '' => d.code || codeOfType(d.type)
/** the single-length limit that applied to an accepted indication (for the share of margin it used) */
export function singleLimit(code: Code | '', c: Api1104Criteria, thk: number): number {
  switch (code) {
    case 'IP': return c.ip.single; case 'IPD': return c.ipd.single; case 'ICP': return c.icp.single; case 'IF': return c.if.single; case 'IFD': return c.ifd.single
    case 'ESI': return c.esi.length; case 'ISI': return c.isi.agg; case 'P': return Math.min(c.p.pore, (c.p.porePctT / 100) * thk); case 'CP': return c.cp.dia; case 'HB': return c.hb.single
    case 'BT': return c.bt.maxDim; case 'EU': case 'IU': return c.undercut.agg; case 'C': return c.crack.crater; default: return 0
  }
}

export interface WeldQc { weld: QcWeld; joint: Joint | null; state: QcState; round: number; lastEval: Evaluation | undefined; thk: number | null; odMm: number | null; films: number; defects: number; crew: CrewRow[]; welders: string[]; coatings: Coating[]; health: Health }
export interface WelderStat {
  key: string; welds: number; evaluated: number; firstOk: number; repaired: number; cutOuts: number; severe: number
  fpy: number | null; repairRate: number | null; rejectRate: number | null; smoothRate: number; score: number | null; rank: number | null; of: number
  results: { at: string; repaired: boolean; weldId: string }[]; lastWeld: string; applicator: boolean
}

/** every weld of the register with its QC state and health, welder and applicator statistics, and the shared series */
export function useQc() {
  const st = useWqStore()
  return useMemo(() => {
    const joints = new Map(st.joints.map((j) => [j.weldId, j]))
    const lastEval = new Map<string, Evaluation>()
    for (const e of st.evaluations) lastEval.set(e.weldId, e) // sorted by time: the last wins
    const qEvals = st.evaluations.map(toQEval)
    const last = latestByRound(qEvals)
    const filmsBy = new Map<string, { round: number; quality: string }[]>()
    for (const f of st.films) { const x = filmsBy.get(f.weldId) ?? []; x.push({ round: f.round, quality: f.quality }); filmsBy.set(f.weldId, x) }
    const live = st.defects.filter((d) => !d.removed)
    const defBy = new Map<string, typeof live>()
    for (const d of live) { const x = defBy.get(d.weldId) ?? []; x.push(d); defBy.set(d.weldId, x) }
    const crewBy = new Map<string, CrewRow[]>()
    for (const c of st.crew) { const x = crewBy.get(c.weldId) ?? []; x.push(c); crewBy.set(c.weldId, x) }
    const coatBy = new Map<string, Coating[]>()
    for (const c of st.coatings) if (!c.removed) { const x = coatBy.get(c.weldId) ?? []; x.push(c); coatBy.set(c.weldId, x) }
    const welderName = new Map(st.welders.map((w) => [w.key, w.name || w.raw]))
    const welderByKey = new Map(st.welders.map((w) => [w.key, w]))

    // welders: every weld they worked on (any pass, any quadrant), judged by its first radiography
    const ws = new Map<string, WelderStat>()
    const stat = (k: string) => { let x = ws.get(k); if (!x) { x = { key: k, welds: 0, evaluated: 0, firstOk: 0, repaired: 0, cutOuts: 0, severe: 0, fpy: null, repairRate: null, rejectRate: null, smoothRate: 0, score: null, rank: null, of: 0, results: [], lastWeld: '', applicator: welderByKey.get(k)?.kind === 'coater' }; ws.set(k, x) } return x }
    const weldersOf = new Map<string, string[]>()
    let ev0 = 0, rep0 = 0
    for (const w of st.welds) {
      const keys = allWelders(crewBy.get(w.id) ?? [], w.sides).length ? allWelders(crewBy.get(w.id) ?? [], w.sides) : [...new Set(PASSES.flatMap((p) => w.stampsBy[p]))]
      weldersOf.set(w.id, keys)
      const e0 = last.get(`${w.id}#0`)
      if (e0) { ev0++; if (e0.overall !== 'accept') rep0++ }
      for (const k of keys) {
        const s = stat(k); s.welds++; if (w.weldDate > s.lastWeld) s.lastWeld = w.weldDate
        if (!e0) continue
        s.evaluated++; if (e0.overall === 'accept') s.firstOk++; else s.repaired++
        if (joints.get(w.id)?.finalStatus === 'cut_out') s.cutOuts++
        s.results.push({ at: e0.at, repaired: e0.overall !== 'accept', weldId: w.id })
      }
    }
    for (const d of live) if (['C', 'BT', 'IP', 'IF', 'HB'].includes(codeOf(d)) && d.verdict && d.verdict !== 'accept') for (const k of new Set(d.welders)) stat(k).severe++
    const projectRate = ev0 ? rep0 / ev0 : 0
    const projectFpy = 1 - projectRate
    for (const s of ws.values()) {
      s.fpy = s.evaluated ? s.firstOk / s.evaluated : null; s.repairRate = s.evaluated ? s.repaired / s.evaluated : null; s.rejectRate = s.evaluated ? s.cutOuts / s.evaluated : null
      s.smoothRate = smoothed(s.repaired, s.evaluated, projectRate); s.score = welderScore({ evaluated: s.evaluated, firstOk: s.firstOk, cutOuts: s.cutOuts, severe: s.severe, projectFpy })
    }
    const ranked = [...ws.values()].filter((s) => s.score != null && s.evaluated >= 3).sort((a, b) => (b.score as number) - (a.score as number) || b.evaluated - a.evaluated)
    ranked.forEach((s, i) => { s.rank = i > 0 && ranked[i - 1].score === s.score ? ranked[i - 1].rank : i + 1; s.of = ranked.length })
    for (const s of ws.values()) if (s.rank == null) s.of = ranked.length

    // applicators: the share of their coated welds that failed or needed repair
    const coatFail = (w: QcWeld, cs: Coating[]) => w.coat.fj?.result === 'rej' || w.coat.bond?.verdict === 'rej' || cs.some((c) => c.result === 'fail' || c.kind === 'repair')
    const app = new Map<string, { n: number; bad: number }>()
    let coated = 0, coatedBad = 0
    for (const w of st.welds) {
      const cs = coatBy.get(w.id) ?? []
      if (!(w.coat.fj || w.coat.bond || cs.length)) continue
      coated++; const bad = coatFail(w, cs); if (bad) coatedBad++
      const a = [...cs].reverse().find((c) => c.applicatorKey)?.applicatorKey
      if (a) { const x = app.get(a) ?? { n: 0, bad: 0 }; x.n++; if (bad) x.bad++; app.set(a, x) }
    }
    const projectCoatRate = coated ? coatedBad / coated : 0

    const qualOn = (key: string, date: string): 'valid' | 'expired' | 'none' => {
      const w = welderByKey.get(key); if (!w) return 'none'
      const qs = st.quals.filter((q) => q.welderId === w.id && q.status !== 'revoked')
      if (!qs.length) return 'none'
      const d = date || new Date().toISOString().slice(0, 10)
      return qs.some((q) => (!q.issueDate || q.issueDate <= d) && (!q.expiryDate || q.expiryDate >= d)) ? 'valid' : 'expired'
    }

    const rows: WeldQc[] = st.welds.map((w) => {
      const j = joints.get(w.id) ?? null, le = lastEval.get(w.id), round = j?.round ?? 0
      const state = qcState({ closed: !!j?.closed, finalStatus: j?.finalStatus ?? null, round, films: filmsBy.get(w.id) ?? [], lastEval: le ? toQEval(le) : undefined })
      const thk = j?.thkMm ?? thicknessMm(w.central.thk)
      const sizeIn = Number(String(w.central.size ?? '').replace(/[^\d.]/g, ''))
      const odMm = j?.odMm ?? (sizeIn > 0 ? sizeIn * 25.4 : null)
      const ds = defBy.get(w.id) ?? [], crew = crewBy.get(w.id) ?? [], cs = coatBy.get(w.id) ?? [], keys = weldersOf.get(w.id) ?? []
      const repairs = st.repairs.filter((r) => r.weldId === w.id).length
      const finalRound = Math.max(0, ...st.evaluations.filter((e) => e.weldId === w.id).map((e) => e.round))
      const residual = j?.finalStatus === 'accept' && thk ? ds.filter((d) => d.round === finalRound && d.verdict === 'accept').map((d) => ({ code: codeOf(d) as Code, lengthMm: d.lengthMm, limitMm: singleLimit(codeOf(d), st.crit, thk) })) : []
      const appKey = [...cs].reverse().find((c) => c.applicatorKey)?.applicatorKey
      const a = appKey ? app.get(appKey) : undefined
      const health = jointHealth({
        radiographed: !!le, closed: !!j?.closed, finalStatus: j?.finalStatus === 'cut_out' ? 'cut_out' : j?.finalStatus === 'accept' ? 'accept' : null, repairs,
        crackEver: ds.some((d) => codeOf(d) === 'C' && d.lengthMm > st.crit.crack.crater),
        residual, vtRejects: st.vts.filter((v) => v.weldId === w.id && v.result === 'reject').length + crew.filter((c) => !c.removed && c.vt === 'reject').length + (w.vtReport === 'rej' ? 1 : 0),
        welders: keys.map((k) => { const s = ws.get(k); return { key: k, rate: s && s.evaluated ? s.smoothRate : null, qual: qualOn(k, w.weldDate) } }),
        projectRate,
        coating: w.coat.fj || w.coat.bond || cs.length ? { failed: coatFail(w, cs) && !cs.some((c) => c.kind === 'repair'), repairs: cs.filter((c) => c.kind === 'repair').length, holidays: (w.coat.bond?.holidays ?? 0) > 0 || cs.some((c) => (c.holidayCount ?? 0) > 0), adhesionFail: !!w.coat.bond?.adhesionFail, applicatorRate: a ? smoothed(a.bad, a.n, projectCoatRate) : null, projectCoatRate, randomPassed: cs.some((c) => c.random && c.result === 'pass') } : null,
      })
      return { weld: w, joint: j, state, round, lastEval: le, thk, odMm, films: (filmsBy.get(w.id) ?? []).length, defects: ds.length, crew, welders: keys, coatings: cs, health }
    })
    const qWelds: QWeld[] = st.welds.map((w) => ({ id: w.id, label: weldLabel(w), date: w.weldDate, stamps: Object.fromEntries(PASSES.map((p) => [p, [...new Set([...w.sides[p].R, ...w.sides[p].C, ...(crewBy.get(w.id) ?? []).filter((c) => !c.removed && c.pass === p).map((c) => c.welderKey), ...w.stampsBy[p]])]])) as QWeld['stamps'] }))
    const qDefects: QDefect[] = live.map((d) => ({ id: d.id, weldId: d.weldId, round: d.round, type: d.type, pass: d.pass, welders: d.welders, verdict: d.verdict, lengthMm: d.lengthMm, removed: d.removed }))
    return {
      rows, byId: new Map(rows.map((r) => [r.weld.id, r])), qWelds, qEvals, qDefects, last, welderName,
      nameOf: (k: string) => welderName.get(k) || k, welderStats: ws, projectRate, projectCoatRate, applicators: app,
    }
  }, [st.welds, st.joints, st.evaluations, st.films, st.defects, st.welders, st.crew, st.coatings, st.quals, st.repairs, st.vts, st.crit])
}
