import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleDot, Eye, Lightbulb, Loader2, Lock, MessagesSquare, RotateCcw, Save, ShieldAlert, Users } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { usePersonalityStore } from '../../personality/store/usePersonalityStore'
import { StructuredInterviewGuidance } from '../components/StructuredInterviewGuidance'
import { tone } from '../lib/tone'
import type { CandidateAiFollowUpQuestion, CompCompetency, CompInterviewRating, CompJobCompetencyRequirement, CompProfileLite, CompetencyAssessment } from '../types'
import '../styles/farinTheme.css'

const RATINGS = [1, 2, 3, 4, 5] as const
/** One hue per rating level (low → high), always shown with its number and anchor label. */
const RATING_TONE: Record<number, string> = { 1: '#f43f5e', 2: '#f97316', 3: '#eab308', 4: '#0ea5e9', 5: '#10b981' }
/** A distinct accent per competency card (left bar + icon). */
const CARD_TONES = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#6366f1', '#f43f5e']

const LEAVE_WARNING = 'امتیازهای ثبت‌نشده دارید. اگر از این صفحه خارج شوید، تغییرات از بین می‌رود. ادامه می‌دهید؟'

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

interface Draft {
  rating: number | null
  notes: string
}

/**
 * «مصاحبه ساختاریافته» (schema.sql Section 50): every interviewer independently rates each of the
 * job's required competencies that has a STRUCTURED_INTERVIEW evidence source, on the competency's
 * own proficiency anchors. Ratings are edited freely on the page and saved together with one
 * «ثبت امتیازها» (only the changed rows, in one upsert of the rater's own rows — not every
 * competency has to be rated), after which the candidate's competency profile is recomputed once.
 * Unsaved edits are flagged and guarded against leaving the page. Read-only when the assessment is
 * completed (Section 53 lock) or when the viewer is not on this candidate's panel
 * (comp_can_rate_interview: panelist or creator, and the interview is in the design).
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
  const saveInterviewRatings = useCompetencyStore((s) => s.saveInterviewRatings)
  const computeCompetencyProfile = useCompetencyStore((s) => s.computeCompetencyProfile)
  const profiles = useCompetencyStore((s) => s.profiles)
  const allPanelists = useCompetencyStore((s) => s.panelists)
  const fetchPanelists = useCompetencyStore((s) => s.fetchPanelists)
  const aiAnalysis = useCompetencyStore((s) => s.candidateAiAnalysisByAssessment[assessment.id])
  const fetchCandidateAiAnalysis = useCompetencyStore((s) => s.fetchCandidateAiAnalysis)
  const personalityAssessments = usePersonalityStore((s) => s.assessments)
  const fetchPersonalityAssessments = usePersonalityStore((s) => s.fetchAssessments)
  const myId = useAuthStore((s) => s.profile?.id ?? null)

  const [loaded, setLoaded] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => {
    setDrafts({})
    if (!assessment.needsStructuredInterview) return
    Promise.all([
      competencies.length === 0 ? fetchCompetencies() : null,
      requirements.length === 0 ? fetchJobCompetencyRequirements() : null,
      evidenceSources.length === 0 ? fetchEvidenceSources() : null,
      fetchInterviewRatings(assessment.id),
      fetchPanelists(assessment.id),
    ]).then(() => setLoaded(true))
    if (aiAnalysis === undefined) fetchCandidateAiAnalysis(assessment.id)
    // Always refetch: the store is shared across candidates.
    fetchPersonalityAssessments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.id, assessment.needsStructuredInterview])

  const personalityAssessment = useMemo(() => personalityAssessments.find((a) => a.assessmentId === assessment.id), [personalityAssessments, assessment.id])

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

  const ratings = useMemo(() => allRatings.filter((r) => r.assessmentId === assessment.id), [allRatings, assessment.id])
  const myRatings = useMemo(() => ratings.filter((r) => r.raterId === myId), [ratings, myId])

  // Same rule as comp_can_rate_interview: this candidate's panelist or its creator, interview in design.
  const canRate =
    assessment.needsStructuredInterview && !!myId && (assessment.createdBy === myId || allPanelists.some((p) => p.assessmentId === assessment.id && p.userId === myId))
  const locked = assessment.status === 'completed'
  const readOnly = locked || !canRate

  const valueOf = (competencyId: string): Draft => {
    const d = drafts[competencyId]
    if (d) return d
    const saved = myRatings.find((r) => r.competencyId === competencyId)
    return { rating: saved?.rating ?? null, notes: saved?.notes ?? '' }
  }
  const changes = useMemo(() => {
    return Object.entries(drafts)
      .map(([competencyId, d]) => {
        const saved = myRatings.find((r) => r.competencyId === competencyId)
        const changed = d.rating !== (saved?.rating ?? null) || d.notes.trim() !== (saved?.notes ?? '').trim()
        return { competencyId, draft: d, saved, changed }
      })
      .filter((c) => c.changed)
  }, [drafts, myRatings])
  const saveable = changes.filter((c) => c.draft.rating != null)
  const unsaveable = changes.filter((c) => c.draft.rating == null)
  const dirty = changes.length > 0

  // ---- leave guard: tab close/reload + in-app navigation (sidebar / header / continue)
  const dirtyRef = useRef(false)
  useEffect(() => {
    dirtyRef.current = dirty && !readOnly
  }, [dirty, readOnly])
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    const onClickCapture = (e: MouseEvent) => {
      if (!dirtyRef.current) return
      const target = e.target as HTMLElement | null
      const nav = target?.closest('.comp-shell > aside button, .comp-shell header button, [data-leave-guard]')
      if (!nav || nav.closest('[data-no-leave-guard]')) return
      if (!window.confirm(LEAVE_WARNING)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('click', onClickCapture, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  const setDraft = (competencyId: string, patch: Partial<Draft>) => {
    if (readOnly) return
    setSavedAt(null)
    setDrafts((prev) => ({ ...prev, [competencyId]: { ...valueOf(competencyId), ...prev[competencyId], ...patch } }))
  }

  const handleSaveAll = async () => {
    if (readOnly || saveable.length === 0) return
    setSaving(true)
    setSaveFailed(false)
    const ok = await saveInterviewRatings(
      assessment.id,
      saveable.map((c) => ({ competencyId: c.competencyId, rating: c.draft.rating as number, notes: c.draft.notes.trim() })),
    )
    if (ok) {
      setDrafts((prev) => {
        const next = { ...prev }
        saveable.forEach((c) => delete next[c.competencyId])
        return next
      })
      setSavedAt(Date.now())
      computeCompetencyProfile(assessment.id)
    } else setSaveFailed(true)
    setSaving(false)
  }

  const discardAll = () => setDrafts({})

  if (!assessment.needsStructuredInterview) {
    return (
      <div className="fx fx-remap">
        <div className="fx-card space-y-3 p-6 text-center">
          <MessagesSquare size={28} className="fx-muted mx-auto" />
          <p className="fx-text-2 text-[13px]">مصاحبه ساختاریافته در طرح ارزیابی این متقاضی قرار ندارد.</p>
          {onContinue && (
            <button onClick={onContinue} className="mx-auto flex min-h-11 items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500">
              رفتن به نتیجه <ArrowLeft size={13} />
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="fx">
        <div className="fx-card fx-muted flex items-center justify-center gap-2 p-6 text-xs">
          <Loader2 size={14} className="animate-spin" /> در حال بارگذاری شایستگی‌های مصاحبه…
        </div>
      </div>
    )
  }

  const ratedByMe = items.filter((i) => valueOf(i.competency.id).rating != null).length
  const savedByMe = items.filter((i) => myRatings.some((r) => r.competencyId === i.competency.id)).length
  const progress = items.length === 0 ? 0 : Math.round((ratedByMe / items.length) * 100)
  const raters = new Set(ratings.map((r) => r.raterId)).size

  return (
    <div className="fx fx-remap space-y-4 pb-2">
      {/* Hero */}
      <div className="fx-card fx-tone-wash overflow-hidden p-5" style={tone('#0ea5e9')}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="fx-tone-bg-strong fx-tone-text flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
              <MessagesSquare size={22} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-black">مصاحبه ساختاریافته</h2>
              <p className="fx-text-2 mt-1 text-[12px] leading-6">
                هر شایستگی را مستقل از سایر داوران و بر اساس شواهد رفتاری مشخصی که در مصاحبه دیده‌اید، روی سطوح مهارت همان شایستگی امتیاز دهید. لازم نیست همه را
                یک‌جا امتیاز دهید؛ هر زمان با «ثبت امتیازها» تغییرات ذخیره می‌شود.
              </p>
            </div>
          </div>
          {items.length > 0 && (
            <div className="grid shrink-0 grid-cols-3 gap-2 text-center md:w-[330px]">
              <Stat label="امتیاز شما" value={`${ratedByMe.toLocaleString('fa-IR')}/${items.length.toLocaleString('fa-IR')}`} color="#0ea5e9" />
              <Stat label="ثبت‌شده" value={savedByMe.toLocaleString('fa-IR')} color="#10b981" />
              <Stat label="داوران فعال" value={raters.toLocaleString('fa-IR')} color="#8b5cf6" />
            </div>
          )}
        </div>
        {items.length > 0 && (
          <div className="mt-4">
            <div className="fx-muted mb-1 flex justify-between text-[11px]">
              <span>پیشرفت امتیازدهی شما</span>
              <span className="num font-bold">٪{progress.toLocaleString('fa-IR')}</span>
            </div>
            <div
              className="fx-track h-2.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              aria-label="پیشرفت امتیازدهی"
            >
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #0ea5e9, #10b981)' }} />
            </div>
          </div>
        )}
        {locked && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] font-bold" style={tone('#f59e0b')}>
            <Lock size={14} className="fx-tone-text" />
            <span className="fx-tone-text">این ارزیابی ثبت نهایی شده و امتیازهای مصاحبه قفل است؛ اصلاح فقط پس از بازگشایی توسط ادمین ماژول ممکن است.</span>
          </p>
        )}
        {!locked && !canRate && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] font-bold" style={tone('#6366f1')}>
            <Eye size={14} className="fx-tone-text" />
            <span className="fx-tone-text">فقط اعضای پنل این متقاضی می‌توانند در مصاحبه امتیاز ثبت کنند؛ این صفحه برای شما فقط‌خواندنی است.</span>
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <div className="fx-card fx-text-2 p-6 text-center text-[12px]">
          برای شغل این متقاضی هیچ شایستگی‌ای با منبع شواهد «مصاحبه ساختاریافته» تعریف نشده است (تنظیمات ← مدل شایستگی و مشاغل).
        </div>
      ) : (
        <>
          {/* Product owner: judges didn't know what basis to score on — real guidance, shown right
              before the scoring UI, collapsible per viewer so an experienced judge isn't slowed down
              on repeat visits. */}
          <StructuredInterviewGuidance />
          {(isLead || !canRate) && <PanelSummary items={items} ratings={ratings} profiles={profiles} />}
          {canRate && (
            <div className="space-y-3">
              {items.map((item, idx) => (
                <InterviewCompetencyCard
                  key={item.competency.id}
                  item={item}
                  accent={CARD_TONES[idx % CARD_TONES.length]}
                  value={valueOf(item.competency.id)}
                  saved={myRatings.find((r) => r.competencyId === item.competency.id)}
                  changed={changes.some((c) => c.competencyId === item.competency.id)}
                  readOnly={readOnly}
                  onChange={(patch) => setDraft(item.competency.id, patch)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Sticky save bar */}
      {canRate && !locked && items.length > 0 && (
        <div className="fx-savebar sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl p-3 sm:flex-row sm:items-center" role="region" aria-label="ذخیره امتیازها">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[12px]" aria-live="polite">
            {dirty ? (
              <span className="flex items-center gap-1.5 font-bold" style={tone('#f59e0b')}>
                <CircleDot size={15} className="fx-tone-text animate-pulse" />
                <span className="fx-tone-text">
                  {changes.length.toLocaleString('fa-IR')} تغییر ذخیره‌نشده
                  {unsaveable.length > 0 && ` (${unsaveable.length.toLocaleString('fa-IR')} مورد بدون امتیاز ذخیره نمی‌شود)`}
                </span>
              </span>
            ) : saveFailed ? (
              <span className="flex items-center gap-1.5 font-bold" style={tone('#ef4444')}>
                <ShieldAlert size={15} className="fx-tone-text" />
                <span className="fx-tone-text">ثبت امتیازها ناموفق بود؛ دوباره تلاش کنید.</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5" style={tone('#10b981')}>
                <CheckCircle2 size={15} className="fx-tone-text" />
                <span className="fx-text-2">{savedAt ? 'امتیازها ثبت شد و پروفایل شایستگی به‌روز شد.' : 'همه تغییرات ذخیره شده‌اند.'}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <button type="button" onClick={discardAll} disabled={saving} className="fx-sub flex min-h-11 items-center gap-1.5 px-3.5 text-xs font-bold disabled:opacity-50">
                <RotateCcw size={14} /> بازگردانی
              </button>
            )}
            <button
              type="button"
              data-no-leave-guard
              onClick={handleSaveAll}
              disabled={saving || saveable.length === 0}
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-5 text-[13px] font-extrabold text-white shadow-lg shadow-sky-900/20 transition-colors hover:bg-sky-500 disabled:opacity-40 sm:flex-none"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} ثبت امتیازها
              {saveable.length > 0 && <span className="num rounded-full bg-white/20 px-1.5 text-[11px]">{saveable.length.toLocaleString('fa-IR')}</span>}
            </button>
          </div>
        </div>
      )}

      {onContinue && (
        <div className="flex justify-end">
          <button
            onClick={() => {
              if (dirtyRef.current && !window.confirm(LEAVE_WARNING)) return
              onContinue()
            }}
            className="flex min-h-11 items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500"
          >
            مشاهده نتیجه <ArrowLeft size={13} />
          </button>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="fx-sub px-2 py-2" style={tone(color)}>
      <p className="num fx-tone-text text-lg font-black leading-6">{value}</p>
      <p className="fx-muted text-[10.5px]">{label}</p>
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

function anchorLabelForLevel(competency: CompCompetency, level: number): string {
  return competency.proficiencyLevels.find((l) => l.level === Math.round(level))?.labelFa ?? ''
}

function InterviewCompetencyCard({
  item,
  accent,
  value,
  saved,
  changed,
  readOnly,
  onChange,
}: {
  item: InterviewItem
  accent: string
  value: Draft
  saved: CompInterviewRating | undefined
  changed: boolean
  readOnly: boolean
  onChange: (patch: Partial<Draft>) => void
}) {
  const { competency, requirement, followUps, watchpoints } = item
  const groupRef = useRef<HTMLDivElement>(null)
  const requiredLabel = anchorLabelForLevel(competency, requirement.requiredLevel)
  const notesId = `notes-${competency.id}`

  // Radio-group keyboard support: arrows move (RTL: ← is "next"), Home/End jump.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly) return
    const current = value.rating ?? 0
    let next: number | null = null
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.min(5, current + 1)
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.max(1, current - 1 || 1)
    else if (e.key === 'Home') next = 1
    else if (e.key === 'End') next = 5
    if (next == null) return
    e.preventDefault()
    onChange({ rating: next })
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-rating="${next}"]`)?.focus()
  }

  return (
    <div className="fx-card fx-accent-bar p-4 sm:p-5" style={tone(accent)}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-extrabold">{competency.labelFa}</h3>
        {requirement.isCritical && (
          <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold" style={tone('#ef4444')}>
            <span className="fx-tone-bg fx-tone-text flex items-center gap-1 rounded-full px-2 py-0.5">
              <AlertTriangle size={11} /> حیاتی
            </span>
          </span>
        )}
        <span className="fx-sub num px-2 py-0.5 text-[11px]">
          سطح مورد نیاز: <b>{requirement.requiredLevel.toLocaleString('fa-IR')}</b>
          {requiredLabel && ` (${requiredLabel})`}
        </span>
        <span className="mr-auto">
          {changed ? (
            <span className="fx-tone-bg fx-tone-text flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={tone('#f59e0b')}>
              <CircleDot size={11} /> ذخیره‌نشده
            </span>
          ) : saved ? (
            <span className="fx-tone-bg fx-tone-text flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold" style={tone('#10b981')}>
              <CheckCircle2 size={11} /> ثبت‌شده
            </span>
          ) : (
            <span className="fx-muted text-[10.5px]">هنوز امتیاز نداده‌اید</span>
          )}
        </span>
      </div>
      {competency.description && <p className="fx-text-2 mb-3 text-[12px] leading-6">{competency.description}</p>}

      {(followUps.length > 0 || watchpoints.length > 0) && (
        <div className="fx-sub mb-3 p-3" style={tone('#f59e0b')}>
          <p className="fx-tone-text mb-1.5 flex items-center gap-1.5 text-[11.5px] font-bold">
            <Lightbulb size={13} /> پیشنهاد برای کاوش در مصاحبه
          </p>
          <ul className="fx-text-2 space-y-1.5 text-[11.5px] leading-6">
            {followUps.map((q, i) => (
              <li key={`q${i}`}>
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                  {q.question}
                </span>
                {q.evidence_to_look_for && <span className="fx-muted"> — شواهد مورد انتظار: {q.evidence_to_look_for}</span>}
              </li>
            ))}
            {watchpoints.map((topic, i) => (
              <li key={`w${i}`}>
                <span className="fx-tone-text font-bold">نکته آزمون شخصیت: </span>
                {topic}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p id={`lbl-${competency.id}`} className="fx-muted mb-1.5 text-[11px] font-bold">
        امتیاز شما (۱ تا ۵)
      </p>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-labelledby={`lbl-${competency.id}`}
        aria-readonly={readOnly || undefined}
        onKeyDown={onKeyDown}
        className="mb-3 grid grid-cols-5 gap-1.5 sm:gap-2"
      >
        {RATINGS.map((r) => {
          const active = value.rating === r
          const focusable = value.rating == null ? r === 1 : active
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={active}
              data-rating={r}
              tabIndex={focusable ? 0 : -1}
              disabled={readOnly}
              onClick={() => onChange({ rating: active && !saved ? null : r })}
              className="fx-chip flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-center"
              style={tone(RATING_TONE[r])}
            >
              <span className="num fx-tone-text text-[18px] font-black leading-6">{r.toLocaleString('fa-IR')}</span>
              <span className="text-[10.5px] font-bold leading-4">{anchorLabel(competency, r)}</span>
            </button>
          )
        })}
      </div>

      <label htmlFor={notesId} className="fx-muted mb-1 block text-[11px] font-bold">
        شواهد رفتاری و دلیل امتیاز
      </label>
      <textarea
        id={notesId}
        value={value.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        readOnly={readOnly}
        rows={2}
        placeholder="رفتار مشاهده‌شده، مثال مشخص، نتیجه…"
        className="input w-full text-[12px] leading-6"
      />
      {changed && value.rating == null && value.notes.trim() && (
        <p className="mt-1 text-[11px]" style={tone('#f59e0b')}>
          <span className="fx-tone-text">برای ثبت یادداشت، یک امتیاز هم انتخاب کنید.</span>
        </p>
      )}
    </div>
  )
}

function PanelSummary({ items, ratings, profiles }: { items: InterviewItem[]; ratings: CompInterviewRating[]; profiles: CompProfileLite[] }) {
  const raterIds = [...new Set(ratings.map((r) => r.raterId))]
  return (
    <div className="fx-card p-4" style={tone('#8b5cf6')}>
      <p className="mb-1 flex items-center gap-1.5 text-[13px] font-extrabold">
        <Users size={15} className="fx-tone-text" /> خلاصه امتیازهای پنل
      </p>
      <p className="fx-muted mb-3 text-[11px]">
        {raterIds.length === 0
          ? 'هنوز هیچ داوری امتیازی ثبت نکرده است.'
          : `داوران: ${raterIds.map((id) => profiles.find((p) => p.id === id)?.fullName ?? 'داور').join('، ')}`}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ competency, requirement }) => {
          const rows = ratings.filter((r) => r.competencyId === competency.id)
          const average = rows.length > 0 ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : null
          const t = average == null ? '#94a3b8' : RATING_TONE[Math.max(1, Math.min(5, Math.round(average)))]
          return (
            <div key={competency.id} className="fx-sub flex items-center gap-3 p-2.5" style={tone(t)}>
              <span className="fx-tone-bg-strong fx-tone-text num flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[15px] font-black">
                {average == null ? '—' : average.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-bold">
                  {competency.labelFa}
                  {requirement.isCritical && <span style={{ color: '#ef4444' }}> ★</span>}
                </p>
                <p className="fx-muted num text-[10.5px]">
                  {rows.length.toLocaleString('fa-IR')} داور، میانگین از ۵
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
