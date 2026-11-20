import { useCallback, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { activeMs, deviceClass, strongest, worthKeeping, type EntryOutcome } from './entryTiming'

/**
 * Measures one sitting in the report editor: from opening to closing it (or leaving the page). Touches inside the
 * editor (typing, choosing, tapping) are the moments; each «input» event is one edit; the sitting is written once, when it ends, as one row of
 * ex_entry_timings (056). A failed write is ignored — measuring must never get in the way of entering the report.
 */
export function useEntryMeter(o: { enabled: boolean; projectId: string; reportId: string; formKey: string; newReport: boolean }) {
  const root = useRef<HTMLElement | null>(null)
  const s = useRef({ start: Date.now(), moments: [Date.now()] as number[], edits: 0, lines: 0, outcome: 'closed' as EntryOutcome, done: false, o })
  s.current.o = o

  const flush = useCallback(() => {
    const x = s.current
    if (x.done || !x.o.enabled) return
    const end = Date.now(), active = Math.round(activeMs(x.moments) / 1000)
    if (!worthKeeping(active, x.edits)) return
    x.done = true
    const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
    void supabase.from('ex_entry_timings').insert({
      project_id: x.o.projectId, report_id: x.o.reportId, form_key: x.o.formKey || 'work', outcome: x.outcome, new_report: x.o.newReport,
      started_at: new Date(x.start).toISOString(), ended_at: new Date(end).toISOString(),
      active_sec: Math.min(active, 86_400), wall_sec: Math.min(Math.round((end - x.start) / 1000), 604_800),
      edits: x.edits, lines: x.lines, device: deviceClass(window.innerWidth, touch),
    }).then(() => undefined, () => undefined)
  }, [])

  useEffect(() => {
    const el = root.current
    if (!el) return
    const touch = () => { s.current.moments.push(Date.now()) }
    const edit = () => { s.current.edits++; touch() }
    el.addEventListener('pointerdown', touch, true); el.addEventListener('keydown', touch, true)
    el.addEventListener('input', edit, true);
    // leaving the app (camera, another app, a locked phone) ends the sitting; coming back starts a new one of the same
    // report — the statistics add the sittings of a report together
    const hide = () => {
      if (document.visibilityState === 'hidden') { flush(); return }
      const x = s.current; if (x.done) { const now = Date.now(); x.start = now; x.moments = [now]; x.edits = 0; x.outcome = 'closed'; x.done = false }
    }
    window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hide)
    return () => {
      el.removeEventListener('pointerdown', touch, true); el.removeEventListener('keydown', touch, true)
      el.removeEventListener('input', edit, true);
      window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hide)
      flush()
    }
  }, [flush])

  /** the editor reports what happened: saved / sent, and how many work lines the report has */
  const mark = useCallback((outcome: EntryOutcome, lines: number) => { const x = s.current; x.outcome = strongest(x.outcome, outcome); x.lines = lines; x.moments.push(Date.now()) }, [])
  return { root, mark }
}
