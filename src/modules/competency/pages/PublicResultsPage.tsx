import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { CheckCircle2, Sparkles, User } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { FARIN_NAME_FA } from '../../../components/common/Logo'
import { formatJalali } from '../../../lib/jalali'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { computeCompletion, computeDomainScores, computeOverallPercent, domainFlags, tierColor } from '../lib/competencyModel'
import { computeResultStatus, interpretMaturity } from '../lib/maturityGuidance'
import { useRoleGuidanceStore } from '../store/useRoleGuidanceStore'
import { computeCategoryScores, isProjectManagerRole } from '../lib/roleCompetencyModel'
import type { CompetencyAnswers, JobRole, QuestionType } from '../types'
import '../styles/idCard.css'

interface ResolvedQuestion {
  id: string
  category: QuestionType
  score: number | null
}

interface PublicResultsRow {
  id: string
  candidate_name: string
  candidate_position: string
  job_role: JobRole
  interview_date: string
  status: string
  answers: CompetencyAnswers
  capstone_score: number | null
  capstone_note: string
  education_score: number | null
  experience_score: number | null
  pm_training_score: number | null
  pm_certification_score: number | null
  is_approved: boolean
  strengths: string
  development_areas: string
  resolved_questions: ResolvedQuestion[]
  photo_url: string | null
}

/**
 * Public, unauthenticated "view results online" page reached via a secret-link token
 * (?results=<token>). Deliberately shows only what comp_public_results_get returns — the scored
 * result itself, never the interviewer panel (who scored, their names, their individual sheets)
 * and never the candidate's contact/personal-profile fields. See supabase/schema.sql section 19.
 *
 * Redesigned (product request) as a minimal "certificate / ID badge" rather than a full report:
 * photo, role, overall score and a short list of standout strengths only — no domain breakdown,
 * no radar chart, no development areas. The full report stays available to staff inside the app.
 */
export function PublicResultsPage({ token }: { token: string }) {
  const [row, setRow] = useState<PublicResultsRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // Role- and band-specific interpretation text (Section 57; readable anonymously) — only the band
  // label is shown here now, but interpretMaturity is what computes it.
  const guidanceRows = useRoleGuidanceStore((s) => s.rows)
  const fetchGuidance = useRoleGuidanceStore((s) => s.fetch)
  useEffect(() => {
    fetchGuidance()
  }, [fetchGuidance])

  useEffect(() => {
    supabase
      .rpc('comp_public_results_get', { p_token: token })
      .then(({ data, error }) => {
        setLoading(false)
        if (error || !data || data.length === 0) {
          setNotFound(true)
          return
        }
        setRow(data[0] as PublicResultsRow)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (loading) {
    return (
      <div className="id-card-stage">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
      </div>
    )
  }

  if (notFound || !row) {
    return (
      <div className="id-card-stage">
        <p className="max-w-sm text-center text-sm text-white/70">این لینک نامعتبر است یا منقضی شده. لطفاً با تیم مصاحبه‌کننده تماس بگیرید.</p>
      </div>
    )
  }

  // A PM candidate can now be scored either way — the fixed in-code rubric (legacy, resolved_questions
  // empty) or the DB-backed question bank exactly like every other role (resolved_questions
  // populated) — see usesLegacyPmRubric/comp_public_results_get.
  const isPM = isProjectManagerRole(row.job_role) && row.resolved_questions.length === 0
  const officialAnswers: CompetencyAnswers = isPM
    ? row.answers
    : Object.fromEntries(row.resolved_questions.map((q) => [q.id, { score: q.score, note: '' }]))
  const domainScores = isPM ? computeDomainScores(officialAnswers) : computeCategoryScores(row.resolved_questions, officialAnswers)
  const overall = computeOverallPercent(domainScores)
  const completion = isPM
    ? computeCompletion(officialAnswers)
    : {
        answered: row.resolved_questions.filter((q) => q.score != null).length,
        total: row.resolved_questions.length,
        percent: row.resolved_questions.length === 0 ? 0 : Math.round((row.resolved_questions.filter((q) => q.score != null).length / row.resolved_questions.length) * 100),
      }
  const { strengths: domainStrengths } = domainFlags(domainScores)
  const resultStatus = computeResultStatus(domainScores, overall, completion)
  const interp = interpretMaturity({
    jobRole: row.job_role,
    roleLabel: row.candidate_position || row.job_role,
    overall,
    domainScores,
    guidanceRows,
    sufficient: resultStatus.state === 'final',
  })
  const tier = tierColor(overall)

  // The evaluator's own written strengths take priority (more specific than a generic domain-title
  // list); fall back to the top-scoring domains when no free-text summary was written yet.
  const strengthTags = row.strengths
    ? row.strengths
        .split(/[،,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : domainStrengths.map((s) => s.domain.shortTitle).slice(0, 5)

  return (
    <div className="id-card-stage">
      <p className="text-[11px] font-bold tracking-wide text-white/50">کارت گواهی شایستگی — سامانه {FARIN_NAME_FA}</p>

      <HoloIdCard tier={tier} score={overall ?? 0}>
        <PublicPhoto path={row.photo_url} tier={tier} score={overall ?? 0} approved={row.is_approved} />

        <div>
          <p className="text-lg font-extrabold text-white">{row.candidate_name}</p>
          {row.candidate_position && (
            <p className="mt-1 inline-block rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[11px] font-bold text-white/80">
              {row.candidate_position}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-0.5">
          <p className="num text-4xl font-black leading-none" style={{ color: tier }}>
            {overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}
          </p>
          <p className="text-[11px] font-bold text-white/60">{interp.bandLabel}</p>
        </div>

        {strengthTags.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
            {strengthTags.map((s) => (
              <span key={s} className="id-card-strength-pill" style={{ '--tier': tier } as React.CSSProperties}>
                <Sparkles size={10} /> {s}
              </span>
            ))}
          </div>
        )}

        {row.is_approved && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
            <CheckCircle2 size={13} /> دارای صلاحیت تأییدشده
          </div>
        )}

        <p className="mt-2 text-[10px] text-white/35">تاریخ صدور: {formatJalali(row.interview_date)}</p>
      </HoloIdCard>

      <p className="max-w-[380px] text-center text-[10.5px] leading-5 text-white/35">
        این یک نمای فقط‌خواندنی و خلاصه از نتیجه‌ی ارزیابی شایستگی است؛ جزئیات کامل نزد تیم ارزیابی محفوظ است.
      </p>
    </div>
  )
}

/** The holographic "ID badge" shell — pointer position drives both a gentle 3D tilt and a spotlight
 * highlight; a slow auto-rotating rainbow sheen keeps the same premium feel on touch/no-pointer
 * devices, which never fire pointermove. */
function HoloIdCard({ tier, score, children }: { tier: string; score: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 50, y: 50 })

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setPos({
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    })
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={() => setPos({ x: 50, y: 50 })}
      className="id-card-outer"
      style={{ '--px': pos.x, '--py': pos.y, '--tier': tier } as React.CSSProperties}
    >
      <div className="id-card-inner">
        <div className="id-card-holo" />
        <div className="id-card-spotlight" />
        <div className="id-card-content" style={{ '--score': score } as React.CSSProperties}>
          {children}
        </div>
      </div>
    </div>
  )
}

function PublicPhoto({ path, tier, score, approved }: { path: string | null; tier: string; score: number; approved: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (path) getCompDocSignedUrl(path).then((u) => active && setUrl(u))
    return () => {
      active = false
    }
  }, [path])
  return (
    <div className="relative">
      <div className="id-card-photo-ring" style={{ '--tier': tier, '--score': score } as React.CSSProperties}>
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-[#150c24]">
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <User size={30} className="text-white/40" />}
        </div>
      </div>
      {approved && (
        <span className="absolute -bottom-0.5 -left-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#150c24] bg-emerald-400 text-emerald-950">
          <CheckCircle2 size={13} />
        </span>
      )}
    </div>
  )
}
