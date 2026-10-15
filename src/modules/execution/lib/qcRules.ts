/**
 * Quality alerts from the technical-form rows — pure functions, evidence-carrying, nothing is created automatically.
 * The thresholds are PARAMETERS: the numbers in QC_RULE_EXAMPLE are placeholders for the tests, not project policy (they must come from the quality manager).
 */
export interface QcRow { lineId: string; reportId: string; formKey: string; date: string /* ISO yyyy-mm-dd */; weld?: string; welder?: string; front?: string; result?: string; defect?: string }
export interface QcRuleParams { windowDays: number; repairRatePct: number; minRows: number; repeatN: number; repeatWindowDays: number }
export const QC_RULE_EXAMPLE: QcRuleParams = { windowDays: 5, repairRatePct: 8, minRows: 20, repeatN: 3, repeatWindowDays: 7 }

export type QcAlertKind = 'single' | 'rate' | 'repeat'
export interface QcAlert { kind: QcAlertKind; subject: string; message: string; lineIds: string[]; value?: number; threshold?: number }

const DAY = 86400000
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const isFinding = (r: QcRow) => (r.formKey === 'rt_report' && r.result === 'rep') || (r.formKey === 'welding' && r.result === 'rej') || r.formKey === 'weld_repair'
const defectKey = (r: QcRow) => (r.defect ?? '').trim().toUpperCase().replace(/\s+/g, ' ')

/** `asOf` is the day the rules are evaluated for (ISO). Rows after it are ignored. */
export function evaluateQc(rows: QcRow[], p: QcRuleParams, asOf: string): QcAlert[] {
  const end = t(asOf), alerts: QcAlert[] = []
  const upTo = rows.filter((r) => t(r.date) <= end)
  // single findings: every row that already says repair / rejected (the short path — one record, no RCA)
  for (const r of upTo.filter(isFinding)) alerts.push({ kind: 'single', subject: r.weld ?? r.lineId, message: r.formKey === 'weld_repair' ? 'تعمیر ثبت‌شده' : r.formKey === 'welding' ? 'بازرسی چشمی: مردود' : 'رادیوگرافی: نیاز به تعمیر', lineIds: [r.lineId] })
  // repair rate over the window, per welder and overall: only with enough rows to mean something
  const win = upTo.filter((r) => r.formKey === 'rt_report' && end - t(r.date) < p.windowDays * DAY)
  const rate = (rs: QcRow[]) => (rs.length ? (rs.filter((r) => r.result === 'rep').length / rs.length) * 100 : 0)
  const groups = new Map<string, QcRow[]>([['همهٔ جوشکاران', win]])
  for (const r of win) { const w = r.welder?.trim(); if (w) groups.set(w, [...(groups.get(w) ?? []), r]) }
  for (const [who, rs] of groups) {
    if (rs.length < p.minRows) continue
    const v = rate(rs)
    if (v > p.repairRatePct) alerts.push({ kind: 'rate', subject: who, message: `نرخ تعمیر ${v.toFixed(1)}٪ در ${p.windowDays} روز اخیر (آستانه ${p.repairRatePct}٪)`, lineIds: rs.filter((r) => r.result === 'rep').map((r) => r.lineId), value: v, threshold: p.repairRatePct })
  }
  // the same defect repeating inside the window
  const rep = upTo.filter((r) => isFinding(r) && defectKey(r) && end - t(r.date) < p.repeatWindowDays * DAY)
  const byDefect = new Map<string, QcRow[]>()
  for (const r of rep) byDefect.set(defectKey(r), [...(byDefect.get(defectKey(r)) ?? []), r])
  for (const [d, rs] of byDefect) if (rs.length >= p.repeatN) alerts.push({ kind: 'repeat', subject: d, message: `عیب «${d}» ${rs.length} بار در ${p.repeatWindowDays} روز اخیر تکرار شده (آستانه ${p.repeatN})`, lineIds: rs.map((r) => r.lineId), value: rs.length, threshold: p.repeatN })
  return alerts
}
