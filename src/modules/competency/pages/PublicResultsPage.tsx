import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Award, BriefcaseBusiness, Calendar, CheckCircle2, FileText, GraduationCap, HandCoins, History, IdCard, Lightbulb, Settings2, Shield, ShieldAlert, Sparkles, User, Users, Wrench } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { FarinMark } from '../../../components/common/Logo'
import { formatJalali, isoToJalali } from '../../../lib/jalali'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { computeCompletion, computeDomainScores, computeOverallPercent, tierColor } from '../lib/competencyModel'
import { computeResultStatus, interpretMaturity } from '../lib/maturityGuidance'
import { useRoleGuidanceStore } from '../store/useRoleGuidanceStore'
import { computeCategoryScores, isProjectManagerRole } from '../lib/roleCompetencyModel'
import type { CompetencyAnswers, CompetencyDomainKey, DomainScore, JobRole, QuestionType } from '../types'
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

// A generic icon per evaluated competency domain — covers both the fixed PM rubric's 8 domains and
// the 4 category "buckets" every other role is scored against (roleCompetencyModel.ts), so whichever
// domains actually placed in a candidate's top scores always get a sensible icon rather than a guess.
const DOMAIN_ICON: Record<CompetencyDomainKey, typeof FileText> = {
  governance: FileText,
  planning: Calendar,
  cost: HandCoins,
  hse: Shield,
  quality: Award,
  changeRisk: ShieldAlert,
  stakeholder: Users,
  execution: Settings2,
  roleGeneral: BriefcaseBusiness,
  roleTechnical: Wrench,
  roleScenario: Lightbulb,
  roleExperience: History,
  roleHse: Shield,
  roleBehavioral: Users,
  roleJudgment: Lightbulb,
}

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
 * Redesigned (product request) as a permanent, printable-looking "Professional Qualification Card"
 * matching a physical ID-card reference: photo, role, a credential number + issue/expiry date, a
 * qualification-level badge, a QR code pointing back at this same page, and up to 4 tiles for the
 * candidate's own top-scoring competency domains (never generic placeholders) — no radar chart, no
 * development areas. The full report stays available to staff inside the app.
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

  // The evaluator's own written strengths are specific to THIS candidate (e.g. "جوشکاری خط لوله",
  // "مدیریت پیمانکار فرعی") — real, per-candidate content, exactly the "متناسب با نتیجه مصاحبه"
  // requirement. The 4 category "buckets" every non-PM role is scored against (roleGeneral/
  // roleTechnical/roleScenario/roleExperience) are the SAME 4 titles for every candidate in that
  // role family, so they only ever act as a last-resort fallback when no strengths text was written.
  const strengthTags = row.strengths
    ? row.strengths
        .split(/[،,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4)
    : null
  const topDomains: DomainScore[] = strengthTags
    ? []
    : [...domainScores]
        .filter((d): d is DomainScore & { percentScore: number } => d.percentScore != null)
        .sort((a, b) => b.percentScore - a.percentScore)
        .slice(0, 4)

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
              <img src={`${import.meta.env.BASE_URL}credential-medal.png`} alt="" className="cred-medal" />
              <p className="cred-level-label text-[10.5px] font-extrabold leading-4 text-stone-800">{interp.bandLabel}</p>
            </div>
          </div>

          <div className="cred-main">
            <div className="cred-identity">
              <PublicPhoto path={row.photo_url} approved={row.is_approved} />
              <div className="cred-identity-text">
                <p className="text-[16px] font-extrabold leading-6 text-stone-900">{row.candidate_name}</p>
                {row.candidate_position && <p className="text-[11.5px] font-bold text-stone-500">{row.candidate_position}</p>}
                <div className="mt-1.5 flex flex-col gap-0.5">
                  <div className="cred-meta-row">
                    <span className="num text-[10.5px] font-bold text-stone-600">
                      FAR-{isoToJalali(row.interview_date)?.jy ?? ''}-{cardNo}
                    </span>
                    <IdCard size={11} className="text-stone-400" />
                  </div>
                  <div className="cred-meta-row">
                    <span className="num text-[10px] text-stone-500">
                      صادر: {issued} — اعتبار تا: {expires}
                    </span>
                    <Calendar size={11} className="text-stone-400" />
                  </div>
                  {row.is_approved && (
                    <div className="cred-meta-row">
                      <span className="text-[10px] font-bold text-emerald-700">دارای صلاحیت تأییدشده</span>
                      <CheckCircle2 size={11} className="text-emerald-600" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="cred-footer">
            <div className="cred-qr-block">
              <div className="cred-qr-box">
                <QRCodeSVG value={shareUrl} size={72} level="M" fgColor="#4a3c0f" bgColor="#ffffff" />
              </div>
              <p className="max-w-[92px] text-center text-[9px] leading-4 text-stone-500">برای مشاهده جزئیات اسکن کنید</p>
            </div>

            {strengthTags && strengthTags.length > 0 && (
              <div className="cred-skills">
                {strengthTags.map((s) => (
                  <div key={s} className="cred-skill-tile">
                    <span className="cred-skill-icon">
                      <Sparkles size={15} />
                    </span>
                    <span className="text-[9.5px] font-bold leading-3.5 text-stone-700">{s}</span>
                  </div>
                ))}
              </div>
            )}
            {!strengthTags && topDomains.length > 0 && (
              <div className="cred-skills">
                {topDomains.map((d) => {
                  const Icon = DOMAIN_ICON[d.domain.key] ?? GraduationCap
                  return (
                    <div key={d.domain.key} className="cred-skill-tile">
                      <span className="cred-skill-icon">
                        <Icon size={15} />
                      </span>
                      <span className="text-[9.5px] font-bold leading-3.5 text-stone-700">{d.domain.shortTitle}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="max-w-[420px] text-center text-[10.5px] leading-5 text-stone-500">
        این کارت خلاصه‌ای رسمی از نتیجه ارزیابی صلاحیت حرفه‌ای است؛ جزئیات کامل نزد تیم ارزیابی محفوظ است.
      </p>
    </div>
  )
}

function PublicPhoto({ path, approved }: { path: string | null; approved: boolean }) {
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
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><User size={26} className="text-stone-300" /></div>}
      {approved && (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white">
          <CheckCircle2 size={11} />
        </span>
      )}
    </div>
  )
}
