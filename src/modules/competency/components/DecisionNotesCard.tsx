import { useEffect, useState } from 'react'
import { EyeOff } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { formatJalali } from '../../../lib/jalali'
import { DECISION_LABEL_FA, fetchDecisionNotes, type DecisionNote } from '../lib/decisionNotes'

/** Confidential interview summaries — rendered ONLY for a site admin (the database also refuses to return them to anyone else). */
export function DecisionNotesCard({ assessmentId, refreshKey = 0 }: { assessmentId: string; refreshKey?: number }) {
  const isSiteAdmin = useAuthStore((s) => Boolean(s.profile?.isAdmin))
  const profiles = useCompetencyStore((s) => s.profiles)
  const [notes, setNotes] = useState<DecisionNote[] | null>(null)
  useEffect(() => {
    if (!isSiteAdmin) return
    let live = true
    void fetchDecisionNotes(assessmentId).then((n) => live && setNotes(n))
    return () => { live = false }
  }, [assessmentId, isSiteAdmin, refreshKey])
  if (!isSiteAdmin) return null
  return (
    <div className="fx-card space-y-2 p-4">
      <p className="flex items-center gap-1.5 text-[12.5px] font-extrabold"><EyeOff size={14} aria-hidden /> جمع‌بندی محرمانهٔ مصاحبه <span className="fx-muted text-[10.5px] font-normal">(فقط ادمین سامانه)</span></p>
      {notes == null ? <p className="fx-muted text-[11px]">در حال بارگذاری…</p> : notes.length === 0 ? <p className="fx-muted text-[11px]">هنوز جمع‌بندی ثبت نشده است.</p> : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="fx-sub p-3">
              <p className="mb-1 flex flex-wrap items-center gap-2 text-[10.5px]">
                <b>{DECISION_LABEL_FA[n.decision]}{n.projectName ? ` — ${n.projectName}` : ''}</b>
                <span className="fx-muted">{formatJalali(n.createdAt)}{n.authorId ? ` · ${profiles.find((p) => p.id === n.authorId)?.fullName ?? ''}` : ''}</span>
              </p>
              <p className="whitespace-pre-wrap text-[11.5px] leading-6">{n.note}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
