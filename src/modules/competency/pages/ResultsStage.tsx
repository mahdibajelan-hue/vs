import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Mail, Printer, Sparkles, TrendingDown, TrendingUp, User } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { exportElementToPdf } from '../../../lib/export'
import { formatJalali } from '../../../lib/jalali'
import { CompetencyRadarChart } from '../components/CompetencyRadarChart'
import {
  computeCompletion,
  computeDomainScores,
  computeOverallPercent,
  domainFlags,
  maturityBand,
} from '../lib/competencyModel'
import type { CompetencyAssessment } from '../types'

interface ResultsStageProps {
  assessment: CompetencyAssessment
}

/** The final report: a professional candidate card, radar chart, maturity band, strengths/weaknesses, and position recommendations — all on one printable/exportable page. */
export function ResultsStage({ assessment }: ResultsStageProps) {
  const setStatus = useCompetencyStore((s) => s.setStatus)
  const reportRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)

  const domainScores = computeDomainScores(assessment.answers)
  const overall = computeOverallPercent(domainScores)
  const band = maturityBand(overall)
  const completion = computeCompletion(assessment.answers)
  const { strengths, weaknesses } = domainFlags(domainScores)

  const qualificationChips = [
    { label: 'مدرک تحصیلی', value: assessment.educationScore },
    { label: 'سوابق کاری مرتبط', value: assessment.experienceScore },
    { label: 'دوره‌های حرفه‌ای', value: assessment.pmTrainingScore },
    { label: 'صلاحیت حرفه‌ای', value: assessment.pmCertificationScore },
    { label: 'نتایج مصاحبه', value: overall != null ? Math.round((overall / 20) * 10) / 10 : null },
  ]

  const handlePdf = async () => {
    if (!reportRef.current) return
    setExporting(true)
    await exportElementToPdf(reportRef.current, `ارزیابی-${assessment.candidateName}.pdf`, { orientation: 'portrait', backgroundColor: '#ffffff' })
    setExporting(false)
  }

  const handleSend = () => {
    const subject = encodeURIComponent(`نتیجه مصاحبه ارزیابی شایستگی — ${assessment.candidateName}`)
    const body = encodeURIComponent(
      `با سلام\n\nنتیجه ارزیابی شایستگی جناب/سرکار خانم ${assessment.candidateName}:\nامتیاز کلی: ${overall != null ? overall + '٪' : '—'}\nسطح بلوغ: ${band.label}\n\nبرای گزارش کامل، فایل PDF پیوست را مشاهده کنید.`,
    )
    window.location.href = `mailto:${assessment.candidateEmail}?subject=${subject}&body=${body}`
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-end gap-2">
        <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5">
          <Printer size={14} /> پرینت
        </button>
        <button
          onClick={handlePdf}
          disabled={exporting}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5 disabled:opacity-50"
        >
          <Download size={14} /> {exporting ? 'در حال ساخت PDF…' : 'دانلود PDF'}
        </button>
        <button
          onClick={handleSend}
          disabled={!assessment.candidateEmail}
          title={!assessment.candidateEmail ? 'ابتدا ایمیل نامزد را در بخش مشخصات ثبت کنید' : ''}
          className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-400 disabled:opacity-40"
        >
          <Mail size={14} /> ارسال به نامزد
        </button>
        {assessment.status !== 'completed' && (
          <button
            onClick={() => setStatus(assessment.id, 'completed')}
            className="flex items-center gap-1.5 rounded-xl bg-green-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-400"
          >
            <CheckCircle2 size={14} /> ثبت نهایی ارزیابی
          </button>
        )}
      </div>

      <div ref={reportRef} className="space-y-4 rounded-2xl bg-[#0b0f16] p-1">
        {/* Personnel card header */}
        <div className="glass-panel overflow-hidden rounded-2xl">
          <div className="flex flex-col items-center gap-4 bg-gradient-to-l from-purple-500/15 via-transparent to-transparent p-5 sm:flex-row sm:items-center">
            <PhotoBadge path={assessment.photoUrl} />
            <div className="flex-1 text-center sm:text-right">
              <p className="text-lg font-extrabold">{assessment.candidateName}</p>
              <p className="text-xs text-muted">{assessment.candidatePosition}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-secondary sm:justify-start">
                {assessment.candidatePhone && <span dir="ltr">{assessment.candidatePhone}</span>}
                {assessment.candidateEmail && <span dir="ltr">{assessment.candidateEmail}</span>}
                <span>تاریخ مصاحبه: {formatJalali(assessment.interviewDate)}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center rounded-2xl border border-white/10 bg-black/20 px-6 py-3 text-center">
              <p className="num text-3xl font-extrabold text-purple-300">{overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}</p>
              <p className="mt-0.5 text-[11px] font-bold">{band.label}</p>
            </div>
          </div>
        </div>

        {/* Qualification scorecard */}
        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 text-xs font-bold">کارت امتیاز شایستگی</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {qualificationChips.map((c) => (
              <div key={c.label} className="rounded-xl border border-white/10 p-2.5 text-center">
                <p className="num text-lg font-extrabold text-purple-300">{c.value != null ? c.value.toLocaleString('fa-IR') : '—'}</p>
                <p className="mt-0.5 text-[10px] text-muted leading-4">{c.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Radar + maturity guidance */}
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
              <p className="mt-2 rounded-lg bg-purple-500/10 p-2.5 text-[11px] leading-6 text-purple-200">پوزیشن‌های پیشنهادی: {band.suggestedPositions}</p>
            </div>

            {assessment.capstoneScore != null && (
              <div className="glass-panel rounded-2xl p-4">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold">
                  <AlertTriangle size={13} className="text-amber-300" /> امتیاز سناریوی پایانی (بحران چندوجهی)
                </p>
                <p className="num text-lg font-extrabold">{assessment.capstoneScore.toLocaleString('fa-IR')} / ۵</p>
                {assessment.capstoneNote && <p className="mt-1 text-[11px] leading-5 text-secondary">{assessment.capstoneNote}</p>}
              </div>
            )}

            {(strengths.length > 0 || weaknesses.length > 0) && (
              <div className="glass-panel space-y-2.5 rounded-2xl p-4">
                {strengths.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-green-300">
                      <TrendingUp size={12} /> نقاط قوت برجسته
                    </p>
                    <p className="text-[11px] leading-6 text-secondary">{strengths.map((s) => s.domain.title).join('، ')}</p>
                  </div>
                )}
                {weaknesses.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-red-300">
                      <TrendingDown size={12} /> حوزه‌های نیازمند توسعه
                    </p>
                    <p className="text-[11px] leading-6 text-secondary">{weaknesses.map((s) => s.domain.title).join('، ')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Domain breakdown */}
        <div className="glass-panel space-y-2 rounded-2xl p-4">
          <p className="mb-1 text-xs font-bold">امتیاز به تفکیک حوزه (با وزن)</p>
          {domainScores.map((d) => (
            <div key={d.domain.key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-[11px] text-secondary">
                {d.domain.shortTitle} <span className="text-muted">(٪{d.domain.weight})</span>
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div className="h-full rounded-full bg-purple-500" style={{ width: `${d.percentScore ?? 0}%` }} />
              </div>
              <span className="num w-20 shrink-0 text-left text-[11px] text-muted">
                {d.percentScore != null ? `٪${d.percentScore.toLocaleString('fa-IR')}` : '—'} ({d.answeredCount.toLocaleString('fa-IR')}/{d.totalCount.toLocaleString('fa-IR')})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PhotoBadge({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (path) getCompDocSignedUrl(path).then((u) => active && setUrl(u))
    return () => {
      active = false
    }
  }, [path])
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-purple-400/40 bg-white/5">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <User size={28} className="text-muted" />}
    </div>
  )
}
