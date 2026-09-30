import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Calendar, IdCard, User } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { FarinMark } from '../../../components/common/Logo'
import { formatJalali, isoToJalali } from '../../../lib/jalali'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { computeCompletion, computeDomainScores, computeOverallPercent, tierColor } from '../lib/competencyModel'
import { computeResultStatus, interpretMaturity } from '../lib/maturityGuidance'
import { useRoleGuidanceStore } from '../store/useRoleGuidanceStore'
import { computeCategoryScores, isProjectManagerRole } from '../lib/roleCompetencyModel'
import type { CompetencyAnswers, DomainScore, JobRole, QuestionType } from '../types'
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

// A varied, attractive fixed palette for the per-domain mini rings — cycled by array position
// (domain order, not score order) so the same domain reads the same color across a re-render. Each
// entry pairs a vivid ring color with a darker same-hue shade for the number inside it — the vivid
// tone alone was too low-contrast to read at this size, especially for the lighter hues (amber, sky).
const CHART_PALETTE: { ring: string; text: string }[] = [
  { ring: '#8b5cf6', text: '#5b21b6' },
  { ring: '#0ea5e9', text: '#075985' },
  { ring: '#f59e0b', text: '#92400e' },
  { ring: '#10b981', text: '#065f46' },
  { ring: '#ec4899', text: '#9d174d' },
  { ring: '#6366f1', text: '#3730a3' },
  { ring: '#ef4444', text: '#991b1b' },
  { ring: '#14b8a6', text: '#115e59' },
]

/** A short, stable 6-digit credential number derived from the assessment's own (immutable) id — no
 * schema change needed, and it never changes on reload since it's a pure function of the id. */
function credentialNumber(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return String(100000 + (h % 900000))
}

/** Same Jalali date the rest of the app shows for "issued", plus the same date 2 years later for
 * "valid until" — a conventional certificate validity window, computed rather than stored. */
function issueAndExpiry(iso: string): { issued: string; expires: string } {
  const issued = formatJalali(iso)
  const j = isoToJalali(iso)
  const expires = j ? `${j.jy + 2}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}` : ''
  return { issued, expires }
}

/**
 * Public, unauthenticated "view results online" page reached via a secret-link token
 * (?results=<token>). Deliberately shows only what comp_public_results_get returns — the scored
 * result itself, never the interviewer panel (who scored, their names, their individual sheets)
 * and never the candidate's contact/personal-profile fields. See supabase/schema.sql section 19.
 *
 * A permanent, printable-looking "Professional Qualification Card" matching a physical-ID-card
 * reference: photo, role, a credential number + issue/expiry date, a qualification-level medal, a QR
 * code pointing back at this same page, an overall-score ring, and a compact multi-color mini-chart
 * of the structured interview's own domain breakdown (never generic placeholder tiles) — no full
 * radar chart, no development areas. The full report stays available to staff inside the app.
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
      <div className="cred-stage">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    )
  }

  if (notFound || !row) {
    return (
      <div className="cred-stage">
        <p className="max-w-sm text-center text-sm text-stone-600">این لینک نامعتبر است یا منقضی شده. لطفاً با تیم مصاحبه‌کننده تماس بگیرید.</p>
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

  // The structured interview's own domain-level breakdown — real evidence specific to this candidate
  // (their actual per-domain interview scores), never a generic placeholder set.
  const chartDomains: (DomainScore & { percentScore: number; ring: string; text: string })[] = domainScores
    .filter((d): d is DomainScore & { percentScore: number } => d.percentScore != null)
    .map((d, i) => ({ ...d, ...CHART_PALETTE[i % CHART_PALETTE.length] }))

  const { issued, expires } = issueAndExpiry(row.interview_date)
  const cardNo = credentialNumber(row.id)
  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  return (
    <div className="cred-stage">
      <div className="cred-card-wrap">
        <div className="cred-card" style={{ '--cred-tier': tier } as React.CSSProperties}>
          <div className="cred-header">
            <div className="cred-logo">
              <FarinMark size={32} />
              <div className="cred-logo-text">
                <p className="text-[13px] font-extrabold text-stone-800">فرین</p>
                <p className="text-[10px] font-medium text-stone-500">Farin</p>
              </div>
            </div>
            <div className="cred-title-badge">
              <div className="cred-title">
                <p className="text-[12.5px] font-extrabold leading-5 text-stone-800">کارت صلاحیت حرفه‌ای</p>
                <p className="text-[9.5px] font-medium text-stone-500">Professional Qualification Card</p>
              </div>
              <div className="cred-medal-wrap">
                <img src={`${import.meta.env.BASE_URL}credential-medal.png`} alt="" className="cred-medal" />
                <span className="cred-medal-score">{overall != null ? overall.toLocaleString('fa-IR') : '—'}</span>
              </div>
              <p className="cred-level-label text-[10.5px] font-extrabold leading-4 text-stone-800">{interp.bandLabel}</p>
            </div>
          </div>

          <div className="cred-main">
            <div className="cred-identity">
              <PublicPhoto path={row.photo_url} />
              <div className="cred-identity-text">
                <p className="text-[16px] font-extrabold leading-6 text-stone-900">{row.candidate_name}</p>
                {row.candidate_position && <p className="text-[12px] font-semibold leading-5 text-stone-600">{row.candidate_position}</p>}
                <div className="mt-1.5 flex flex-col gap-1">
                  <div className="cred-meta-row">
                    <span className="num text-[10.5px] font-bold text-stone-600">
                      FAR-{isoToJalali(row.interview_date)?.jy ?? ''}-{cardNo}
                    </span>
                    <IdCard size={11} className="text-stone-400" />
                  </div>
                  <div className="cred-meta-row">
                    <span className="num text-[10.5px] font-medium leading-4 text-stone-600">
                      صادر: {issued} — اعتبار تا: {expires}
                    </span>
                    <Calendar size={11} className="text-stone-400" />
                  </div>
                  {row.is_approved && (
                    <div className="cred-meta-row">
                      <span className="text-[10.5px] font-bold text-emerald-700">دارای صلاحیت تأییدشده</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {chartDomains.length > 0 && (
            <div className="cred-domain-chart">
              <p className="cred-domain-chart-title text-[10.5px] font-bold text-stone-500">نتایج مصاحبه ساختاریافته</p>
              <div className="cred-domain-grid">
                {chartDomains.map((d) => (
                  <div key={d.domain.key} className="cred-domain-tile">
                    <MiniRing value={d.percentScore} color={d.ring} size={50} strokeWidth={5}>
                      <span className="text-[13px] font-black leading-none" style={{ color: d.text }}>
                        {d.percentScore.toLocaleString('fa-IR')}
                      </span>
                    </MiniRing>
                    <span className="text-[9px] font-bold leading-3.5 text-stone-600">{d.domain.shortTitle}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="cred-footer">
            <div className="cred-qr-block">
              <div className="cred-qr-box">
                <QRCodeSVG value={shareUrl} size={64} level="M" fgColor="#4a3c0f" bgColor="#ffffff" />
              </div>
            </div>
            <p className="cred-qr-caption text-[9px] leading-4 text-stone-500">برای مشاهده جزئیات این کارت را اسکن کنید</p>
          </div>
        </div>
      </div>

      <p className="max-w-[420px] text-center text-[10.5px] leading-5 text-stone-500">
        این کارت خلاصه‌ای رسمی از نتیجه ارزیابی صلاحیت حرفه‌ای است؛ جزئیات کامل نزد تیم ارزیابی محفوظ است.
      </p>
    </div>
  )
}

/** Self-contained SVG ring (no farinTheme.css token dependency — this page must look identical
 * regardless of the viewer's own device theme). Used for both the single overall-score ring and the
 * small per-domain rings in the structured-interview mini-chart. */
function MiniRing({ value, color, size, strokeWidth, children }: { value: number | null; color: string; size: number; strokeWidth: number; children?: React.ReactNode }) {
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value ?? 0))
  const offset = c * (1 - pct / 100)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${value != null ? Math.round(value).toLocaleString('fa-IR') : '—'} از ۱۰۰`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ece2bd" strokeWidth={strokeWidth} />
        {value != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  )
}

function PublicPhoto({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (path) getCompDocSignedUrl(path).then((u) => active && setUrl(u))
    return () => {
      active = false
    }
  }, [path])
  return (
    <div className="cred-photo">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <User size={26} className="text-stone-300" />
        </div>
      )}
    </div>
  )
}
