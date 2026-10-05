import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Calendar, CalendarCheck, IdCard, User } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { FarinMark } from '../../../components/common/Logo'
import { formatJalali, isoToJalali } from '../../../lib/jalali'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { approvalLevel, computeCompletion, computeDomainScores, computeOverallPercent, tierColor } from '../lib/competencyModel'
import { OpenToWorkRing } from '../components/OpenToWorkRing'
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
  work_status?: string | null
  work_project_name?: string | null
}

/** One behavioral/HSE interview competency from comp_public_competency_scores_get (schema.sql Section 60). */
interface PublicCompetencyScore {
  key: string
  label_fa: string
  score: number
}

interface RingTileData {
  key: string
  label: string
  value: number
  ring: string
  text: string
}

// Two varied fixed palettes — one cycled over the interview domains, a different one for the
// competency row so the two rows never read as the same series. Each entry pairs a vivid ring
// color with a darker same-hue shade for the number inside it: the vivid tone alone was too low-contrast
// to read at this size (especially amber/sky).
const DOMAIN_PALETTE: { ring: string; text: string }[] = [
  { ring: '#8b5cf6', text: '#5b21b6' },
  { ring: '#0ea5e9', text: '#075985' },
  { ring: '#f59e0b', text: '#92400e' },
  { ring: '#10b981', text: '#065f46' },
  { ring: '#ec4899', text: '#9d174d' },
  { ring: '#6366f1', text: '#3730a3' },
  { ring: '#ef4444', text: '#991b1b' },
  { ring: '#14b8a6', text: '#115e59' },
]
const COMPETENCY_PALETTE: { ring: string; text: string }[] = [
  { ring: '#ef4444', text: '#991b1b' },
  { ring: '#0ea5e9', text: '#075985' },
  { ring: '#8b5cf6', text: '#5b21b6' },
  { ring: '#14b8a6', text: '#115e59' },
]

/** Zones of the proficiency bar, taken from the module's maturity bands (MATURITY_BAND_DEFS):
 * red = پرریسک+پایه (0-49), orange = مشروط (50-59, the conditional-approval band), yellow = قابل‌قبول
 * (60-74), green = توانمند+راهبردی (75-100). The bar draws the zones at equal width (like the PMI
 * result bar) and maps the score piecewise onto them, so the marker lands in the zone the
 * candidate's band actually belongs to. */
const ZONES = [
  { key: 'red', label: 'نیازمند توسعه', range: '۰ تا ۴۹', min: 0, span: 50, from: '#f87171', to: '#dc2626' },
  { key: 'orange', label: 'مشروط', range: '۵۰ تا ۵۹', min: 50, span: 10, from: '#fdba74', to: '#ea580c' },
  { key: 'yellow', label: 'قابل‌قبول', range: '۶۰ تا ۷۴', min: 60, span: 15, from: '#fde047', to: '#eab308' },
  { key: 'green', label: 'توانمند', range: '۷۵ تا ۱۰۰', min: 75, span: 25, from: '#4ade80', to: '#16a34a' },
] as const
// The bar is drawn left→right red, orange, yellow, green, so green ends up on the right.

function zoneIndex(score: number): number {
  return score < 50 ? 0 : score < 60 ? 1 : score < 75 ? 2 : 3
}

/** 0-1 position of a 0-100 score along the equal-width zones. */
function zonePosition(score: number): number {
  const p = Math.max(0, Math.min(100, score))
  const i = zoneIndex(p)
  const z = ZONES[i]
  return (i + Math.min(1, (p - z.min) / z.span)) / ZONES.length
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const toFa = (s: string | number) => String(s).replace(/\d/g, (d) => FA_DIGITS[Number(d)])

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
  return { issued: toFa(issued), expires: toFa(expires) }
}

/**
 * Public, unauthenticated "view results online" page reached via a secret-link token
 * (?results=<token>). Deliberately shows only what comp_public_results_get / comp_public_competency_scores_get
 * return — the scored result itself and a few aggregate indicators, never the interviewer panel (who
 * scored, their names, their individual sheets) and never the candidate's contact/personal-profile
 * fields. See supabase/schema.sql sections 19 and 60.
 *
 * A permanent, printable-looking "Professional Qualification Card" matching a physical-ID-card
 * reference: photo and qualification medal (carrying the overall score out of 100) on one row, a QR
 * code pointing back at this same page beside the credential number and issue/expiry dates, a
 * three-zone proficiency bar marking where the candidate stands, then rows of mini-rings for the
 * structured interview — its own domain breakdown plus four behavioral/HSE competencies. The full report stays available
 * to staff inside the app.
 */
export function PublicResultsPage({ token }: { token: string }) {
  const [row, setRow] = useState<PublicResultsRow | null>(null)
  const [competencies, setCompetencies] = useState<PublicCompetencyScore[]>([])
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
    // Best-effort: the card is complete without these, so a failure just hides the competency row.
    supabase.rpc('comp_public_competency_scores_get', { p_token: token }).then(({ data, error }) => {
      if (!error && Array.isArray(data)) setCompetencies(data as PublicCompetencyScore[])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (loading) {
    return (
      <div className="cred-stage">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
      </div>
    )
  }

  if (notFound || !row) {
    return (
      <div className="cred-stage">
        <p className="max-w-sm text-center text-sm text-stone-200">این لینک نامعتبر است یا منقضی شده. لطفاً با تیم مصاحبه‌کننده تماس بگیرید.</p>
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
  const approval = approvalLevel(row.is_approved, overall)

  // The structured interview's own domain-level breakdown — real evidence specific to this candidate
  // (their actual per-domain interview scores), never a generic placeholder set.
  const domainTiles: RingTileData[] = domainScores
    .filter((d) => d.percentScore != null)
    .map((d, i) => ({ key: d.domain.key, label: d.domain.shortTitle, value: d.percentScore as number, ...DOMAIN_PALETTE[i % DOMAIN_PALETTE.length] }))

  const competencyTiles: RingTileData[] = competencies.map((c, i) => ({
    key: c.key,
    label: c.label_fa,
    value: c.score,
    ...COMPETENCY_PALETTE[i % COMPETENCY_PALETTE.length],
  }))

  const { issued, expires } = issueAndExpiry(row.interview_date)
  const cardNo = credentialNumber(row.id)
  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  return (
    <div className="cred-stage">
      <div className="cred-card-wrap">
        <div className="cred-card" style={{ '--cred-tier': tier } as React.CSSProperties}>
          <div className="cred-header">
            <div className="cred-logo">
              <FarinMark size={48} />
              <div className="cred-logo-text">
                <p className="text-[17px] font-extrabold text-stone-800">فرین</p>
                <p className="text-[11.5px] font-medium text-stone-500">Farin</p>
              </div>
            </div>
            <div className="cred-title">
              <p className="text-[13.5px] font-extrabold leading-5 text-stone-800">کارت صلاحیت حرفه‌ای</p>
              <p className="text-[10px] font-medium text-stone-500">Professional Qualification Card</p>
            </div>
          </div>

          <div className="cred-band">
            <div className="cred-left-col">
              <OpenToWorkRing active={row.work_status === 'open_to_work'} size={112} shape="square" radius={20}>
                <PublicPhoto path={row.photo_url} />
              </OpenToWorkRing>
            </div>
            <div className="cred-band-name">
              <p className="text-[22px] font-black leading-8 text-stone-900">{row.candidate_name}</p>
              {row.candidate_position && <p className="text-[12.5px] font-semibold leading-5 text-stone-600">{row.candidate_position}</p>}
              {row.work_status === 'on_project' && row.work_project_name && (
                <p className="mt-1 text-[12px] font-extrabold leading-5 text-sky-800">شاغل در پروژه {row.work_project_name}</p>
              )}
              {approval === 'approved' && <p className="mt-1 text-[11px] font-bold text-emerald-700">دارای صلاحیت تأییدشده</p>}
              {approval === 'conditional' && <p className="mt-1 text-[11px] font-bold text-orange-700">دارای صلاحیت با تأیید مشروط</p>}
            </div>
            <div className="cred-medal-box">
              <div className="cred-medal-wrap" role="img" aria-label={`امتیاز کلی ${overall != null ? toFa(overall) : '—'} از ۱۰۰`}>
                <img src={`${import.meta.env.BASE_URL}credential-medal.png`} alt="" className="cred-medal" />
                <span className="cred-medal-score">
                  <b>{overall != null ? toFa(overall) : '—'}</b>
                  <small>از ۱۰۰</small>
                </span>
              </div>
              <p className="cred-level-label text-[11px] font-extrabold leading-4 text-stone-800">{interp.bandLabel}</p>
            </div>
          </div>

          <div className="cred-details">
            <div className="cred-left-col">
              <div className="cred-qr-box">
                <QRCodeSVG value={shareUrl} size={96} level="M" fgColor="#4a3c0f" bgColor="#ffffff" />
              </div>
            </div>
            <div className="cred-details-text">
              <div className="cred-meta-row">
                <span dir="ltr" className="text-[12px] font-bold tracking-wide text-stone-700">
                  FAR-{isoToJalali(row.interview_date)?.jy ?? ''}-{cardNo}
                </span>
                <IdCard size={13} className="shrink-0 text-stone-400" />
              </div>
              <div className="cred-meta-row">
                <span dir="rtl" className="text-[11.5px] font-medium leading-5 text-stone-600">
                  تاریخ صدور: {issued}
                </span>
                <Calendar size={13} className="shrink-0 text-stone-400" />
              </div>
              <div className="cred-meta-row">
                <span dir="rtl" className="text-[11.5px] font-medium leading-5 text-stone-600">
                  اعتبار تا: {expires}
                </span>
                <CalendarCheck size={13} className="shrink-0 text-stone-400" />
              </div>
            </div>
          </div>

          {overall != null && <ProficiencyBar score={overall} label={interp.bandLabel} />}

          {(domainTiles.length > 0 || competencyTiles.length > 0) && (
            <div className="cred-ring-section">
              <p className="cred-ring-section-title text-[11px] font-bold text-stone-600">نتایج مصاحبه ساختاریافته</p>
              {domainTiles.length > 0 && <RingRow tiles={domainTiles} />}
              {competencyTiles.length > 0 && <RingRow tiles={competencyTiles} />}
            </div>
          )}
        </div>
      </div>

      <p className="max-w-[420px] text-center text-[10.5px] leading-5 text-stone-300">
        این کارت خلاصه‌ای رسمی از نتیجه ارزیابی صلاحیت حرفه‌ای است؛ جزئیات کامل نزد تیم ارزیابی محفوظ است.
      </p>
    </div>
  )
}

/** One non-wrapping row of mini rings. Ring size steps down as tiles are added so a longer series
 * (the legacy PM rubric has 8 domains) still fits a single line on a phone. */
function RingRow({ tiles }: { tiles: RingTileData[] }) {
  const n = tiles.length
  const size = n <= 4 ? 54 : n <= 6 ? 44 : 36
  const numSize = n <= 4 ? 14 : n <= 6 ? 12 : 10
  const labelSize = n <= 4 ? 9.5 : n <= 6 ? 9 : 8
  return (
    <div className="cred-ring-block">
      <div className="cred-ring-row" dir="rtl">
        {tiles.map((t) => (
          <div key={t.key} className="cred-ring-tile">
            <MiniRing value={t.value} color={t.ring} size={size} strokeWidth={size >= 44 ? 5 : 4}>
              <span className="font-black leading-none" style={{ color: t.text, fontSize: numSize }}>
                {toFa(Math.round(t.value))}
              </span>
            </MiniRing>
            <span className="font-bold leading-4 text-stone-600" style={{ fontSize: labelSize }}>
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** PMI-style result bar: one continuous bar of three equal zones (red / yellow / green, green on the
 * right) with a marker where the candidate stands. The knob sits at the exact position; the status
 * pill above it is clamped inside the bar so it never leaves the card. */
function ProficiencyBar({ score, label }: { score: number; label: string }) {
  const t = zonePosition(score)
  const zoneIdx = zoneIndex(score)
  const pillT = Math.max(0.14, Math.min(0.86, t))
  return (
    <div className="cred-spectrum">
      <p className="cred-ring-section-title text-[11px] font-bold text-stone-600">جایگاه متقاضی در ارزیابی</p>
      <div className="cred-spectrum-body" dir="ltr">
        <div className="cred-spectrum-pill" style={{ left: `${pillT * 100}%`, borderColor: ZONES[zoneIdx].to }}>
          <span dir="rtl" className="text-[10.5px] font-extrabold text-stone-800">
            وضعیت متقاضی: {label}
          </span>
        </div>
        <div className="cred-spectrum-caret" style={{ left: `${t * 100}%`, borderTopColor: ZONES[zoneIdx].to }} />
        <div className="cred-spectrum-bar">
          {ZONES.map((z) => (
            <div key={z.key} className="cred-spectrum-seg" style={{ background: `linear-gradient(180deg, ${z.from}, ${z.to})` }} />
          ))}
          <div className="cred-spectrum-knob" style={{ left: `${t * 100}%` }} />
        </div>
        <div className="cred-spectrum-labels">
          {ZONES.map((z) => (
            <div key={z.key} className="cred-spectrum-label">
              <span className="text-[10.5px] font-bold text-stone-700">{z.label}</span>
              <span className="text-[9.5px] font-medium text-stone-500">{z.range}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Self-contained SVG ring (no farinTheme.css token dependency — this page must look identical
 * regardless of the viewer's own device theme). */
function MiniRing({ value, color, size, strokeWidth, children }: { value: number | null; color: string; size: number; strokeWidth: number; children?: React.ReactNode }) {
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value ?? 0))
  const offset = c * (1 - pct / 100)
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${value != null ? toFa(Math.round(value)) : '—'} از ۱۰۰`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#dccb9a" strokeWidth={strokeWidth} />
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
          <User size={28} className="text-stone-300" />
        </div>
      )}
    </div>
  )
}
