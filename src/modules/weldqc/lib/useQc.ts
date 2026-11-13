import { useMemo } from 'react'
import { useWqStore } from '../store/useWqStore'
import { latestByRound, qcState, type QEval, type QcState, type QWeld, type QDefect } from './analytics'
import { thicknessMm } from './rules'
import { isoToJalali, JALALI_MONTHS } from '../../../lib/jalali'
import type { Evaluation, Joint, QcWeld } from '../repo'

export const fa = (n: number | null | undefined, d = 0) => (n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: d, minimumFractionDigits: 0 }))
export const weldLabel = (w: { sec: string; weld: string }) => `${w.sec || '—'} / ${w.weld || '—'}`
/** Jalali month key (YYYY-MM) and its label */
export const monthKey = (iso: string) => { const j = isoToJalali(iso.slice(0, 10)); return j ? `${j.jy}-${String(j.jm).padStart(2, '0')}` : iso.slice(0, 7) }
export const monthLabel = (k: string) => { const [y, m] = k.split('-').map(Number); return `${JALALI_MONTHS[m - 1] ?? m} ${String(y).slice(2).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x])}` }
export const faDate = (iso: string | null | undefined) => { if (!iso) return '—'; const j = isoToJalali(iso.slice(0, 10)); return j ? `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`.replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x]) : iso }

export const toQEval = (e: Evaluation): QEval => ({ weldId: e.weldId, round: e.round, overall: e.overall, at: e.evaluatedAt, signed: !!e.signedAt })

export interface WeldQc { weld: QcWeld; joint: Joint | null; state: QcState; round: number; lastEval: Evaluation | undefined; thk: number | null; films: number; defects: number }

/** every weld of the register with its QC state, plus the shared series the reports read */
export function useQc() {
  const st = useWqStore()
  return useMemo(() => {
    const joints = new Map(st.joints.map((j) => [j.weldId, j]))
    const lastEval = new Map<string, Evaluation>()
    for (const e of st.evaluations) lastEval.set(e.weldId, e) // sorted by time: the last wins
    const filmsBy = new Map<string, { round: number; quality: string }[]>()
    for (const f of st.films) { const x = filmsBy.get(f.weldId) ?? []; x.push({ round: f.round, quality: f.quality }); filmsBy.set(f.weldId, x) }
    const defBy = new Map<string, number>()
    for (const d of st.defects) if (!d.removed) defBy.set(d.weldId, (defBy.get(d.weldId) ?? 0) + 1)
    const rows: WeldQc[] = st.welds.map((w) => {
      const j = joints.get(w.id) ?? null, le = lastEval.get(w.id), round = j?.round ?? 0
      const state = qcState({ closed: !!j?.closed, finalStatus: j?.finalStatus ?? null, round, films: filmsBy.get(w.id) ?? [], lastEval: le ? toQEval(le) : undefined })
      return { weld: w, joint: j, state, round, lastEval: le, thk: j?.thkMm ?? thicknessMm(w.central.thk), films: (filmsBy.get(w.id) ?? []).length, defects: defBy.get(w.id) ?? 0 }
    })
    const qWelds: QWeld[] = st.welds.map((w) => ({ id: w.id, label: weldLabel(w), date: w.weldDate, stamps: w.stampsBy }))
    const qEvals = st.evaluations.map(toQEval)
    const qDefects: QDefect[] = st.defects.map((d) => ({ id: d.id, weldId: d.weldId, round: d.round, type: d.type, pass: d.pass, welders: d.welders, verdict: d.verdict, lengthMm: d.lengthMm, removed: d.removed }))
    const welderName = new Map(st.welders.map((w) => [w.key, w.name || w.raw]))
    return { rows, byId: new Map(rows.map((r) => [r.weld.id, r])), qWelds, qEvals, qDefects, last: latestByRound(qEvals), welderName, nameOf: (k: string) => welderName.get(k) || k }
  }, [st.welds, st.joints, st.evaluations, st.films, st.defects, st.welders])
}
