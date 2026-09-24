import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, Lightbulb, Loader2, MessagesSquare, Save, Star, Users } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { usePersonalityStore } from '../../personality/store/usePersonalityStore'
import type { CandidateAiFollowUpQuestion, CompCompetency, CompInterviewRating, CompJobCompetencyRequirement, CompProfileLite, CompetencyAssessment } from '../types'

const RATINGS = [1, 2, 3, 4, 5] as const

interface StructuredInterviewStageProps {
  assessment: CompetencyAssessment
  /** The lead sees every rater's ratings summarized; a panelist only ever sees their own. */
  isLead: boolean
  /** Advances to «نتیجه» — omitted for a panelist, for whom this is the last stage. */
  onContinue?: () => void
}

interface InterviewItem {
  competency: CompCompetency
  requirement: CompJobCompetencyRequirement
  followUps: CandidateAiFollowUpQuestion[]
  watchpoints: string[]
}

/**
 * «مصاحبه ساختاریافته» (schema.sql Section 50): every interviewer independently rates each of the
 * job's required competencies that has a STRUCTURED_INTERVIEW evidence source configured, on the
 * competency's own proficiency anchors. Each save is the rater's own comp_interview_ratings row and
 * immediately refreshes the candidate's competency profile, so the results page never shows scores
 * that predate the latest rating.
 */
export function StructuredInterviewStage({ assessment, isLead, onContinue }: StructuredInterviewStageProps) {
  const competencies = useCompetencyStore((s) => s.competencies)
  const fetchCompetencies = useCompetencyStore((s) => s.fetchCompetencies)
  const requirements = useCompetencyStore((s) => s.jobCompetencyRequirements)
  const fetchJobCompetencyRequirements = useCompetencyStore((s) => s.fetchJobCompetencyRequirements)
  const evidenceSources = useCompetencyStore((s) => s.evidenceSources)
  const fetchEvidenceSources = useCompetencyStore((s) => s.fetchEvidenceSources)
  const allRatings = useCompetencyStore((s) => s.interviewRatings)
  const fetchInterviewRatings = useCompetencyStore((s) => s.fetchInterviewRatings)
  const saveInterviewRating = useCompetencyStore((s) => s.saveInterviewRating)
  const computeCompetencyProfile = useCompetencyStore((s) => s.computeCompetencyProfile)
  const profiles = useCompetencyStore((s) => s.profiles)
  const aiAnalysis = useCompetencyStore((s) => s.candidateAiAnalysisByAssessment[assessment.id])
  const fetchCandidateAiAnalysis = useCompetencyStore((s) => s.fetchCandidateAiAnalysis)
  const personalityAssessments = usePersonalityStore((s) => s.assessments)
  const fetchPersonalityAssessments = usePersonalityStore((s) => s.fetchAssessments)
  const myId = useAuthStore((s) => s.profile?.id ?? null)

  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!assessment.needsStructuredInterview) return
    Promise.all([
      competencies.length === 0 ? fetchCompetencies() : null,
      requirements.length === 0 ? fetchJobCompetencyRequirements() : null,
      evidenceSources.length === 0 ? fetchEvidenceSources() : null,
      fetchInterviewRatings(assessment.id),
    ]).then(() => setLoaded(true))
    if (aiAnalysis === undefined) fetchCandidateAiAnalysis(assessment.id)
    if (personalityAssessments.length === 0) fetchPersonalityAssessments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.id, assessment.needsStructuredInterview])

  const personalityAssessment = personalityAssessments.find((a) => a.assessmentId === assessment.id)

  const items = useMemo<InterviewItem[]>(() => {
    const competencyById = new Map(competencies.map((c) => [c.id, c]))
    const followUps = aiAnalysis?.analysis.follow_up_questions ?? []
    const watchpoints = personalityAssessment?.computedWatchpoints ?? []
    return requirements
      .filter((r) => r.jobRole === assessment.jobRole)
      .flatMap((requirement) => {
        const competency = competencyById.get(requirement.competencyId)
        if (!competency?.active) return []
        const sources = evidenceSources.filter((s) => s.competencyId === competency.id)
        if (!sources.some((s) => s.sourceType === 'STRUCTURED_INTERVIEW')) return []
        const dimensionKeys = new Set(sources.filter((s) => s.sourceType === 'PERSONALITY_DIMENSION' || s.sourceType === 'SJT').map((s) => s.sourceRef))
        return [
          {
            competency,
            requirement,
            followUps: followUps.filter((q) => dimensionKeys.has(q.dimension_key)),
            watchpoints: watchpoints.filter((w) => w.dimensionKeys.some((k) => dimensionKeys.has(k))).map((w) => w.topic),
          },
        ]
      })
      .sort(
        (a, b) =>
          Number(b.requirement.isCritical) - Number(a.requirement.isCritical) ||
          b.requirement.weight - a.requirement.weight ||
          a.competency.labelFa.localeCompare(b.competency.labelFa, 'fa'),
      )
  }, [competencies, requirements, evidenceSources, assessment.jobRole, aiAnalysis, personalityAssessment])

  const ratings = allRatings.filter((r) => r.assessmentId === assessment.id)
  const myRatings = ratings.filter((r) => r.raterId === myId)
  const ratedByMe = items.filter((i) => myRatings.some((r) => r.competencyId === i.competency.id)).length

  if (!assessment.needsStructuredInterview) {
    return (
      <div className="glass-panel space-y-3 rounded-2xl p-6 text-center">
        <p className="text-xs text-secondary">مصاحبه ساختاریافته در طرح ارزیابی این متقاضی قرار ندارد.</p>
        {onContinue && (
          <button
            onClick={onContinue}
            className="mx-auto flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400"
          >
            رفتن به نتیجه <ArrowLeft size={13} />
          </button>
        )}
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="glass-panel flex items-center justify-center gap-2 rounded-2xl p-6 text-xs text-muted">
        <Loader2 size={14} className="animate-spin" /> در حال بارگذاری شایستگی‌های مصاحبه…
      </div>
    )
  }

  const handleSave = async (competencyId: string, rating: number, notes: string) => {
    const ok = await saveInterviewRating(assessment.id, competencyId, rating, notes)
    if (ok) computeCompetencyProfile(assessment.id)
    return ok
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <MessagesSquare size={15} className="text-sky-300" /> مصاحبه ساختاریافته
          </p>
          {items.length > 0 && (
            <span className="num rounded-full bg-sky-500/15 px-2.5 py-1 text-[10.5px] font-bold text-sky-200">
              {ratedByMe.toLocaleString('fa-IR')} از {items.length.toLocaleString('fa-IR')} شایستگی را امتیاز داده‌اید
            </span>
          )}
        </div>
        <p className="text-[11px] leading-6 text-muted">
          هر شایستگی را مستقل از سایر داوران و بر اساس شواهد رفتاری مشخصی که در مصاحبه مشاهده کرده‌اید، روی سطوح مهارت همان شایستگی امتیاز دهید.
          امتیاز هر داور جداگانه ثبت می‌شود و میانگین آن‌ها به‌عنوان شواهد مصاحبه در پروفایل شایستگی متقاضی لحاظ می‌شود.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="glass-panel rounded-2xl p-6 text-center text-xs text-secondary">
          برای شغل این متقاضی هیچ شایستگی‌ای با منبع شواهد «مصاحبه ساختاریافته» تعریف نشده است (تنظیمات ← مدل شایستگی و مشاغل).
        </div>
      ) : (
        <>
          {isLead && <PanelSummary items={items} ratings={ratings} profiles={profiles} />}
          <div className="space-y-3">
            {items.map((item) => {
              const mine = myRatings.find((r) => r.competencyId === item.competency.id)
              return <InterviewCompetencyCard key={`${item.competency.id}:${mine?.id ?? 'new'}`} item={item} mine={mine} onSave={handleSave} />
            })}
          </div>
        </>
      )}

      {onContinue && (
        <div className="flex justify-end">
          <button onClick={onContinue} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-2 text-xs font-bold text-white hover:bg-purple-400">
            مشاهده نتیجه <ArrowLeft size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Maps a 1-5 interview rating onto the competency's own scale — the engine does the same linear
 * mapping ((rating−1)/4 → actual_level), so the anchor shown is the level the rating will produce. */
function anchorLabel(competency: CompCompetency, rating: number): string {
  const levels = [...competency.proficiencyLevels].sort((a, b) => a.level - b.level)
  if (levels.length === 0) return ''
  const index = Math.round(((rating - 1) / 4) * (levels.length - 1))
  return levels[index]?.labelFa ?? ''
}

function InterviewCompetencyCard({
  item,
  mine,
  onSave,
}: {
  item: InterviewItem
  mine: CompInterviewRating | undefined
  onSave: (competencyId: string, rating: number, notes: string) => Promise<boolean>
}) {
  const { competency, requirement, followUps, watchpoints } = item
  const [rating, setRating] = useState<number | null>(mine?.rating ?? null)
  const [notes, setNotes] = useState(mine?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = rating !== (mine?.rating ?? null) || notes !== (mine?.notes ?? '')

  const handleSave = async () => {
    if (rating == null) return
    setSaving(true)
    await onSave(competency.id, rating, notes.trim())
    setSaving(false)
  }

  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <p className="text-[12.5px] font-bold">{competency.labelFa}</p>
        {requirement.isCritical && (
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[9.5px] font-bold text-red-300">
            <AlertTriangle size={10} /> حیاتی
          </span>
        )}
        <span className="num rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-secondary">
          سطح مورد نیاز: {requirement.requiredLevel.toLocaleString('fa-IR')}
          {anchorLabelForLevel(competency, requirement.requiredLevel) && ` (${anchorLabelForLevel(competency, requirement.requiredLevel)})`}
        </span>
        {mine && !dirty && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
            <CheckCircle2 size={10} /> ثبت‌شده
          </span>
        )}
      </div>
      {competency.description && <p className="mb-3 text-[11px] leading-6 text-muted">{competency.description}</p>}

      {(followUps.length > 0 || watchpoints.length > 0) && (
        <div className="mb-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.05] p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold text-amber-200">
            <Lightbulb size={12} /> پیشنهاد برای کاوش در مصاحبه
          </p>
          <ul className="space-y-1.5 text-[10.5px] leading-5 text-secondary">
            {followUps.map((q, i) => (
              <li key={`q${i}`}>
                <span className="font-bold text-primary">{q.question}</span>
                {q.evidence_to_look_for && <span className="text-muted"> — شواهد مورد انتظار: {q.evidence_to_look_for}</span>}
              </li>
            ))}
            {watchpoints.map((topic, i) => (
              <li key={`w${i}`} className="text-amber-100/90">
                نکته قابل توجه (آزمون شخصیت): {topic}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-2 grid grid-cols-5 gap-1.5">
        {RATINGS.map((r) => {
          const active = rating === r
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRating(r)}
              className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-center transition-colors ${
                active ? 'border-sky-400/60 bg-sky-500/20 text-sky-100' : 'border-white/10 text-secondary hover:bg-white/5'
              }`}
            >
              <span className="num flex items-center gap-1 text-[13px] font-extrabold">
                {r.toLocaleString('fa-IR')} {active && <Star size={11} className="fill-current" />}
              </span>
              <span className="text-[9.5px] leading-4">{anchorLabel(competency, r)}</span>
            </button>
          )
        })}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="شواهد رفتاری مشاهده‌شده و دلیل امتیاز…"
        className="input mb-2 w-full text-[11px] leading-6"
      />

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || rating == null || !dirty}
          className="flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-xs font-bold text-white hover:bg-sky-400 disabled:opacity-40"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} ثبت امتیاز
        </button>
      </div>
    </div>
  )
}

function anchorLabelForLevel(competency: CompCompetency, level: number): string {
  return competency.proficiencyLevels.find((l) => l.level === Math.round(level))?.labelFa ?? ''
}

function PanelSummary({ items, ratings, profiles }: { items: InterviewItem[]; ratings: CompInterviewRating[]; profiles: CompProfileLite[] }) {
  const raterIds = [...new Set(ratings.map((r) => r.raterId))]
  return (
    <div className="glass-panel rounded-2xl p-4">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
        <Users size={14} className="text-sky-300" /> خلاصه امتیازهای پنل
      </p>
      <p className="mb-2 text-[10.5px] text-muted">
        {raterIds.length === 0
          ? 'هنوز هیچ داوری امتیازی ثبت نکرده است.'
          : `داوران: ${raterIds.map((id) => profiles.find((p) => p.id === id)?.fullName ?? 'داور').join('، ')}`}
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.02] text-muted">
              <th className="p-2 text-right font-bold">شایستگی</th>
              <th className="num p-2 text-center font-bold">تعداد داور</th>
              <th className="num p-2 text-center font-bold">میانگین (۱ تا ۵)</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ competency }) => {
              const rows = ratings.filter((r) => r.competencyId === competency.id)
              const average = rows.length > 0 ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : null
              return (
                <tr key={competency.id} className="border-b border-white/5 last:border-0">
                  <td className="p-2 font-bold">{competency.labelFa}</td>
                  <td className="num p-2 text-center">{rows.length.toLocaleString('fa-IR')}</td>
                  <td className="num p-2 text-center">
                    {average == null ? '—' : average.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
