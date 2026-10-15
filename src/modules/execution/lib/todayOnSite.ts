/** «Today on site»: for the activities that have work today (or planned), which technical forms are required and which of them are already submitted. Pure; nothing here changes any number elsewhere. */
export interface TodayActivity { id: string; title: string; plannedStart: string | null; plannedEnd: string | null; active: boolean }
export interface TodayRequired { activityId: string; formKey: string }
export interface TodayReport { formKey: string; reportDate: string; status: string; front: string }
export type FormState = 'missing' | 'draft' | 'submitted' | 'approved'
export interface TodayItem { activityId: string; title: string; forms: { formKey: string; state: FormState }[] }
const rank: Record<FormState, number> = { missing: 0, draft: 1, submitted: 2, approved: 3 }
export const stateOf = (status: string): FormState => (status === 'approved' || status === 'partially_approved' ? 'approved' : status === 'draft' || status === 'returned' || status === 'rejected' ? 'draft' : 'submitted')
/** An activity is «on site today» when today falls in its planned window or it has a report line today (workedToday). Activities without any required form are left out. */
export function todayOnSite(acts: TodayActivity[], req: TodayRequired[], reports: TodayReport[], today: string, workedToday: ReadonlySet<string>, front?: string): TodayItem[] {
  const out: TodayItem[] = []
  for (const a of acts) {
    if (!a.active) continue
    const planned = !!a.plannedStart && !!a.plannedEnd && a.plannedStart <= today && today <= a.plannedEnd
    if (!planned && !workedToday.has(a.id)) continue
    const need = [...new Set(req.filter((r) => r.activityId === a.id).map((r) => r.formKey))]
    if (!need.length) continue
    out.push({ activityId: a.id, title: a.title, forms: need.map((formKey) => {
      const mine = reports.filter((r) => r.formKey === formKey && r.reportDate === today && (!front || !r.front || r.front === front))
      let state: FormState = 'missing'
      for (const r of mine) { const s = stateOf(r.status); if (rank[s] > rank[state]) state = s }
      return { formKey, state }
    }) })
  }
  return out
}
