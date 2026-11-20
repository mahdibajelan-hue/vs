/**
 * How long a daily report takes to enter, measured in the app on real use (migration 056). The editor records the
 * moments the person touches it; active time is the sum of the gaps between those moments, each gap capped (a person
 * who leaves the phone on the table for ten minutes is not "entering" for ten minutes). Nothing of the report itself
 * is kept — only time, edit count, line count, device class and the outcome.
 */
export type EntryOutcome = 'saved' | 'submitted' | 'closed'
export type Device = 'mobile' | 'tablet' | 'desktop'
export interface EntryTiming {
  id: string; projectId: string; reportId: string | null; userId: string; formKey: string; outcome: EntryOutcome; newReport: boolean
  startedAt: string; endedAt: string; activeSec: number; wallSec: number; edits: number; lines: number; device: Device
}

/** a gap longer than this between two touches counts only this long */
export const IDLE_CAP_MS = 30_000
/** sessions shorter than this with no edit are a glance, not an entry */
export const GLANCE_SEC = 5

/** active milliseconds from the touch moments (ascending or not), each gap capped */
export function activeMs(moments: number[], cap = IDLE_CAP_MS): number {
  const t = [...moments].filter(Number.isFinite).sort((a, b) => a - b)
  let s = 0
  for (let i = 1; i < t.length; i++) s += Math.min(t[i] - t[i - 1], cap)
  return s
}

export function deviceClass(width: number, touch: boolean): Device {
  if (width < 640) return 'mobile'
  if (touch && width < 1100) return 'tablet'
  return 'desktop'
}

/** the strongest outcome wins: sending beats saving, saving beats closing */
export const strongest = (a: EntryOutcome, b: EntryOutcome): EntryOutcome => (a === 'submitted' || b === 'submitted' ? 'submitted' : a === 'saved' || b === 'saved' ? 'saved' : 'closed')

/** a session worth keeping: something was edited, or the person spent more than a glance */
export const worthKeeping = (activeSec: number, edits: number) => edits > 0 || activeSec > GLANCE_SEC

export function median(xs: number[]): number | null {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}
export function quantile(xs: number[], q: number): number | null {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!v.length) return null
  const pos = (v.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos)
  return v[lo] + (v[hi] - v[lo]) * (pos - lo)
}

export interface EntryGroup { key: string; sessions: number; reports: number; submitted: number; medianActiveSec: number | null; p90ActiveSec: number | null; medianEdits: number | null; secPerLine: number | null; mobileShare: number }

/**
 * Sessions grouped by person / form / device. A report entered in several sittings is one entry: its sittings' active
 * time adds up, and the median is over reports, not sittings — what matters is the time a report costs.
 */
export function summarize(rows: EntryTiming[], keyOf: (r: EntryTiming) => string): EntryGroup[] {
  const groups = new Map<string, EntryTiming[]>()
  for (const r of rows) { const k = keyOf(r); const g = groups.get(k); if (g) g.push(r); else groups.set(k, [r]) }
  return [...groups.entries()].map(([key, g]) => {
    const perReport = new Map<string, { active: number; edits: number; lines: number; submitted: boolean }>()
    for (const r of g) {
      const k = r.reportId ?? r.id, x = perReport.get(k) ?? { active: 0, edits: 0, lines: 0, submitted: false }
      x.active += r.activeSec; x.edits += r.edits; x.lines = Math.max(x.lines, r.lines); x.submitted ||= r.outcome === 'submitted'
      perReport.set(k, x)
    }
    const reps = [...perReport.values()], done = reps.filter((x) => x.submitted)
    const base = done.length ? done : reps
    const withLines = base.filter((x) => x.lines > 0)
    return {
      key, sessions: g.length, reports: reps.length, submitted: done.length,
      medianActiveSec: median(base.map((x) => x.active)), p90ActiveSec: quantile(base.map((x) => x.active), 0.9),
      medianEdits: median(base.map((x) => x.edits)),
      secPerLine: withLines.length ? median(withLines.map((x) => x.active / x.lines)) : null,
      mobileShare: g.filter((r) => r.device !== 'desktop').length / g.length,
    }
  }).sort((a, b) => b.reports - a.reports || a.key.localeCompare(b.key))
}

/** ISO week start (Saturday, the Iranian work week) of a timestamp, as yyyy-mm-dd */
export function weekOf(iso: string): string {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''
  const back = (d.getUTCDay() + 1) % 7 // Saturday → 0
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back))
  return s.toISOString().slice(0, 10)
}

export const fmtDur = (sec: number | null) => {
  if (sec == null) return '—'
  const s = Math.round(sec)
  if (s < 60) return `${s.toLocaleString('fa-IR')} ثانیه`
  const m = Math.floor(s / 60), r = s % 60
  return r ? `${m.toLocaleString('fa-IR')} دقیقه و ${r.toLocaleString('fa-IR')} ثانیه` : `${m.toLocaleString('fa-IR')} دقیقه`
}

/** compact «9:18» (minutes:seconds) for tight places */
export const fmtClock = (sec: number | null) => { if (sec == null) return '—'; const s = Math.round(sec); return `${Math.floor(s / 60).toLocaleString('fa-IR')}:${String(s % 60).padStart(2, '0').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])}` }

export const timingRow = (x: Record<string, unknown>): EntryTiming => ({
  id: String(x.id), projectId: String(x.project_id), reportId: (x.report_id as string | null) ?? null, userId: String(x.user_id), formKey: String(x.form_key ?? 'work'),
  outcome: x.outcome as EntryOutcome, newReport: !!x.new_report, startedAt: String(x.started_at), endedAt: String(x.ended_at),
  activeSec: Number(x.active_sec) || 0, wallSec: Number(x.wall_sec) || 0, edits: Number(x.edits) || 0, lines: Number(x.lines) || 0, device: (x.device as Device) ?? 'desktop',
})
