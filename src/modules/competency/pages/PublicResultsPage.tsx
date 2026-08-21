import { useEffect, useState } from 'react'
import { AlertTriangle, Award, Briefcase, BookOpen, GraduationCap, MessageSquareText, ShieldCheck, Sparkles, TrendingDown, TrendingUp, User } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { formatJalali } from '../../../lib/jalali'
import { CompetencyRadarChart } from '../components/CompetencyRadarChart'
import { ApprovalMedal } from '../components/ApprovalMedal'
import { computeCompletion, computeDomainScores, computeOverallPercent, domainFlags, maturityBand, tierColor } from '../lib/competencyModel'
import type { CompetencyAnswers } from '../types'

interface PublicResultsRow {
  id: string
  candidate_name: string
  candidate_position: string
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
}

/**
 * Public, unauthenticated "view results online" page reached via a secret-link token
 * (?results=<token>). Deliberately shows only what comp_public_results_get returns — the scored
 * result itself, never the interviewer panel (who scored, their names, their individual sheets)
 * and never the candidate's contact/personal-profile fields. See supabase/schema.sql section 19.
 */
export function PublicResultsPage({ token }: { token: string }) {
  const [row, setRow] = useState<PublicResultsRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
      </div>
    )
  }

  if (notFound || !row) {
    return (
      <div className="flex h-screen w-screen items-center justify-center p-6 text-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <p className="max-w-sm text-sm text-secondary">این لینک نامعتبر است یا منقضی شده. لطفاً با تیم مصاحبه‌کننده تماس بگیرید.</p>
      </div>
    )
  }

  const domainScores = computeDomainScores(row.answers)
  const overall = computeOverallPercent(domainScores)
  const band = maturityBand(overall)
  const completion = computeCompletion(row.answers)
  const { strengths, weaknesses } = domainFlags(domainScores)

  const qualificationChips = [
    { label: 'مدرک تحصیلی', icon: GraduationCap, value: row.education_score },
    { label: 'سوابق کاری مرتبط', icon: Briefcase, value: row.experience_score },
    { label: 'دوره‌های حرفه‌ای', icon: BookOpen, value: row.pm_training_score },
    { label: 'صلاحیت حرفه‌ای', icon: Award, value: row.pm_certification_score },
    { label: 'نتایج مصاحبه', icon: MessageSquareText, value: overall != null ? Math.round((overall / 20) * 10) / 10 : null },
  ]

  return (
    <div className="comp-shell min-h-screen p-4 sm:p-6" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="glass-panel rounded-2xl p-4 text-center">
          <p className="text-sm font-bold">نتیجه ارزیابی شایستگی — سامانه RASTA</p>
          <p className="mt-1 text-[11px] text-muted">این نمای فقط‌خواندنی نتیجهٔ ارزیابی است.</p>
        </div>

        <div className="glass-panel relative overflow-hidden rounded-2xl">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-l from-purple-500/15 via-transparent to-transparent p-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-purple-400/40 bg-white/5">
              <User size={28} className="text-muted" />
            </div>
            <div className="flex-1 text-center sm:text-right">
              <p className="flex items-center justify-center gap-1.5 text-lg font-extrabold sm:justify-start">
                {row.candidate_name}
                {row.is_approved && <ApprovalMedal />}
              </p>
              <p className="text-xs text-muted">{row.candidate_position}</p>
              <p className="mt-2 text-[11px] text-secondary">تاریخ مصاحبه: {formatJalali(row.interview_date)}</p>
            </div>
            <div
              className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full text-center"
              style={{ background: `conic-gradient(${tierColor(overall)} ${(overall ?? 0) * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}
            >
              <div className="flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full bg-[#120a1e]">
                <p className="num text-2xl font-extrabold" style={{ color: tierColor(overall) }}>
                  {overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}
                </p>
                <p className="mt-0.5 text-[10px] font-bold">{band.label}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 text-sm font-extrabold">کارت امتیاز شایستگی</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {qualificationChips.map((c) => {
              const color = tierColor(c.value != null ? (c.value / 5) * 100 : null)
              return (
                <div
                  key={c.label}
                  className="relative overflow-hidden rounded-2xl border p-3.5 text-center"
                  style={{ borderColor: `${color}40`, background: `linear-gradient(160deg, ${color}1c, transparent 70%)` }}
                >
                  <c.icon size={16} className="mx-auto mb-1.5" style={{ color }} />
                  <p className="num text-2xl font-black leading-none" style={{ color }}>
                    {c.value != null ? c.value.toLocaleString('fa-IR') : '—'}
                    <span className="text-xs font-bold text-muted"> /۵</span>
                  </p>
                  <p className="mt-1.5 text-[10.5px] font-bold leading-4 text-secondary">{c.label}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="glass-panel rounded-2xl p-4">
            <p className="mb-2 text-xs font-bold">نمودار رادار بلوغ شایستگی</p>
            <CompetencyRadarChart domainScores={domainScores} />
            <p className="text-center text-[11px] text-muted">
              {completion.answered.toLocaleString('fa-IR')} از {completion.total.toLocaleString('fa-IR')} سوال پاسخ داده شده ({completion.percent.toLocaleString('fa-IR')}٪)
            </p>
          </div>

          <div className="space-y-3">
            <div className="glass-panel rounded-2xl p-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold">
                <Sparkles size={13} className="text-purple-300" /> تفسیر بلوغ و توصیه استفاده
              </p>
              <p className="text-[11px] leading-6 text-secondary">{band.guidance}</p>
              <p className="mt-2 rounded-lg bg-purple-500/10 p-2.5 text-[11px] leading-6 text-purple-200">سمت‌های شغلی پیشنهادی: {band.suggestedPositions}</p>
            </div>

            {row.capstone_score != null && (
              <div className="glass-panel rounded-2xl p-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
                  <AlertTriangle size={13} className="text-amber-300" /> امتیاز سناریوی پایانی (بحران چندوجهی)
                </p>
                <p className="num text-lg font-extrabold">{row.capstone_score.toLocaleString('fa-IR')} / ۵</p>
                {row.capstone_note && <p className="mt-1 text-[11px] leading-5 text-secondary">{row.capstone_note}</p>}
              </div>
            )}

            {(strengths.length > 0 || weaknesses.length > 0) && (
              <div className="glass-panel space-y-2.5 rounded-2xl p-4">
                {strengths.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-green-300">
                      <TrendingUp size={12} /> نقاط قوت برجسته (بر اساس امتیاز حوزه‌ها)
                    </p>
                    <p className="text-[11px] leading-6 text-secondary">{strengths.map((s) => s.domain.title).join('، ')}</p>
                  </div>
                )}
                {weaknesses.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-red-300">
                      <TrendingDown size={12} /> حوزه‌های نیازمند توسعه (بر اساس امتیاز حوزه‌ها)
                    </p>
                    <p className="text-[11px] leading-6 text-secondary">{weaknesses.map((s) => s.domain.title).join('، ')}</p>
                  </div>
                )}
              </div>
            )}

            {(row.strengths || row.development_areas) && (
              <div className="glass-panel space-y-2.5 rounded-2xl p-4">
                <p className="text-[11px] font-bold text-purple-200">جمع‌بندی مسئول ارزیابی</p>
                {row.strengths && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-green-300">
                      <TrendingUp size={12} /> نقاط قوت
                    </p>
                    <p className="text-[11px] leading-6 text-secondary">{row.strengths}</p>
                  </div>
                )}
                {row.development_areas && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                      <TrendingDown size={12} /> زمینه‌های قابل بهبود
                    </p>
                    <p className="text-[11px] leading-6 text-secondary">{row.development_areas}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="glass-panel space-y-2 rounded-2xl p-4">
          <p className="mb-1 text-xs font-bold">امتیاز به تفکیک حوزه (با وزن)</p>
          {domainScores.map((d) => (
            <div key={d.domain.key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-[11px] text-secondary">
                {d.domain.shortTitle} <span className="text-muted">(٪{d.domain.weight})</span>
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full transition-all" style={{ width: `${d.percentScore ?? 0}%`, background: tierColor(d.percentScore) }} />
              </div>
              <span className="num w-20 shrink-0 text-left text-[11px] text-muted">
                {d.percentScore != null ? `٪${d.percentScore.toLocaleString('fa-IR')}` : '—'} ({d.answeredCount.toLocaleString('fa-IR')}/{d.totalCount.toLocaleString('fa-IR')})
              </span>
            </div>
          ))}
        </div>

        {row.is_approved && (
          <div className="glass-panel flex items-center justify-center gap-1.5 rounded-2xl p-3 text-[11px] font-bold text-emerald-300">
            <ShieldCheck size={14} /> صلاحیت این نامزد تایید شده است
          </div>
        )}
      </div>
    </div>
  )
}
