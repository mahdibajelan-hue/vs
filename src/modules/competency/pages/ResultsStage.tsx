import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, Mail, Printer, ShieldCheck, Sparkles, TrendingDown, TrendingUp, User } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { exportElementToPdf } from '../../../lib/export'
import { formatJalali } from '../../../lib/jalali'
import { CompetencyRadarChart } from '../components/CompetencyRadarChart'
import { CompetencyPrintReport, type PanelSummaryRow } from '../components/CompetencyPrintReport'
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

/** Tiered color for a 0-100 score — used to make domain bars and score chips read at a glance instead of every value looking identically purple. */
function tierColor(percent: number | null): string {
  if (percent == null) return '#6b7280'
  if (percent >= 80) return '#34d399'
  if (percent >= 60) return '#a78bfa'
  if (percent >= 40) return '#fbbf24'
  return '#f87171'
}

/** The final report: a professional candidate card, radar chart, maturity band, strengths/weaknesses, and position recommendations — all on one printable/exportable page. */
export function ResultsStage({ assessment }: ResultsStageProps) {
  const setStatus = useCompetencyStore((s) => s.setStatus)
  const setApproved = useCompetencyStore((s) => s.setApproved)
  const allPanelists = useCompetencyStore((s) => s.panelists)
  const allPanelistScores = useCompetencyStore((s) => s.panelistScores)
  const profiles = useCompetencyStore((s) => s.profiles)
  const reportRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [settingApproval, setSettingApproval] = useState(false)

  const domainScores = computeDomainScores(assessment.answers)
  const overall = computeOverallPercent(domainScores)
  const band = maturityBand(overall)
  const completion = computeCompletion(assessment.answers)
  const { strengths, weaknesses } = domainFlags(domainScores)

  // The panel's contribution, kept alongside the lead's verdict rather than blended into it —
  // the headline score on this report is the lead's final call, not an average of the three.
  const panelSummary: PanelSummaryRow[] = allPanelists
    .filter((p) => p.assessmentId === assessment.id)
    .map((p) => {
      const sheet = allPanelistScores.find((s) => s.assessmentId === assessment.id && s.panelistId === p.userId)
      return {
        name: profiles.find((pr) => pr.id === p.userId)?.fullName ?? 'داور',
        overallPercent: sheet ? computeOverallPercent(computeDomainScores(sheet.answers)) : null,
        submitted: sheet?.submittedAt != null,
      }
    })

  const qualificationChips = [
    { label: 'مدرک تحصیلی', value: assessment.educationScore },
    { label: 'سوابق کاری مرتبط', value: assessment.experienceScore },
    { label: 'دوره‌های حرفه‌ای', value: assessment.pmTrainingScore },
    { label: 'صلاحیت حرفه‌ای', value: assessment.pmCertificationScore },
    { label: 'نتایج مصاحبه', value: overall != null ? Math.round((overall / 20) * 10) / 10 : null },
  ]

  /**
   * Prints the light-mode report on its own, inside a throwaway iframe.
   *
   * Calling window.print() on the app can't produce a usable page: the module shell paints its
   * dark background through inline styles that print CSS can't reach, and the app's global @page
   * rule is A4 landscape for the wide dashboards. The iframe starts from a blank document, so the
   * report is the only thing on the paper and it gets its own portrait page box.
   */
  const handlePrint = async () => {
    const node = printRef.current
    if (!node) return
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    document.body.appendChild(frame)

    const doc = frame.contentDocument
    const win = frame.contentWindow
    if (!doc || !win) {
      frame.remove()
      return
    }

    doc.open()
    doc.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>ارزیابی شایستگی — ${assessment.candidateName}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap">
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Vazirmatn", "Segoe UI", sans-serif; }
  /* The report is authored at a fixed 900px for the PDF capture; on paper let it reflow to the
     page width instead of overflowing the sheet. */
  body > div { width: 100% !important; max-width: 100% !important; padding: 0 !important; }
  svg, img { break-inside: avoid; page-break-inside: avoid; }
</style></head><body>${node.innerHTML}</body></html>`)
    doc.close()

    // Without waiting, Chrome snapshots the page before the webfont arrives and prints fallback
    // glyphs with the wrong metrics.
    try {
      await doc.fonts?.ready
    } catch {
      /* fonts API unavailable — print with whatever is loaded */
    }

    win.focus()
    win.print()
    // Safari fires afterprint late (or not at all when the dialog is dismissed), so also sweep up
    // on a timer; removing an already-removed node is a no-op.
    win.addEventListener('afterprint', () => frame.remove())
    setTimeout(() => frame.remove(), 60_000)
  }

  const handlePdf = async () => {
    if (!printRef.current) return
    setExporting(true)
    await exportElementToPdf(printRef.current, `ارزیابی-${assessment.candidateName}.pdf`, { orientation: 'portrait', backgroundColor: '#ffffff' })
    setExporting(false)
  }

  const handleApprove = async () => {
    setSettingApproval(true)
    await setApproved(assessment.id, !assessment.isApproved)
    setSettingApproval(false)
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
        <button onClick={handlePrint} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2 text-xs text-secondary hover:bg-white/5">
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
        <button
          onClick={handleApprove}
          disabled={settingApproval}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
            assessment.isApproved ? 'border border-white/10 text-secondary hover:bg-white/5' : 'bg-emerald-500 text-white hover:bg-emerald-400'
          }`}
        >
          <ShieldCheck size={14} /> {assessment.isApproved ? 'لغو تایید صلاحیت' : 'تایید صلاحیت'}
        </button>
      </div>

      {/* Off-screen, light-mode print/PDF template — kept out of view (print-only) so the on-screen
          dark card above stays as-is, but window.print()/PDF export both target this instead, since
          html2canvas captures literal colors and a dark background prints/exports poorly. */}
      <div className="comp-print-offscreen" ref={printRef} aria-hidden="true">
        <CompetencyPrintReport assessment={assessment} panel={panelSummary} />
      </div>

      <div ref={reportRef} className="no-print space-y-4 rounded-2xl bg-[#0b0f16] p-1">
        {/* Personnel card header */}
        <div className="glass-panel overflow-hidden rounded-2xl">
          <div className="flex flex-col items-center gap-4 bg-gradient-to-l from-purple-500/15 via-transparent to-transparent p-5 sm:flex-row sm:items-center">
            <PhotoBadge path={assessment.photoUrl} approved={assessment.isApproved} />
            <div className="flex-1 text-center sm:text-right">
              <p className="flex items-center justify-center gap-1.5 text-lg font-extrabold sm:justify-start">
                {assessment.candidateName}
                {assessment.isApproved && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <ShieldCheck size={11} /> تاییدشده
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">{assessment.candidatePosition}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-secondary sm:justify-start">
                {assessment.candidatePhone && <span dir="ltr">{assessment.candidatePhone}</span>}
                {assessment.candidateEmail && <span dir="ltr">{assessment.candidateEmail}</span>}
                <span>تاریخ مصاحبه: {formatJalali(assessment.interviewDate)}</span>
              </div>
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

        {/* Qualification scorecard */}
        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 text-xs font-bold">کارت امتیاز شایستگی</p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
            {qualificationChips.map((c) => {
              const color = tierColor(c.value != null ? (c.value / 5) * 100 : null)
              return (
                <div key={c.label} className="relative overflow-hidden rounded-xl border border-white/10 p-2.5 text-center">
                  <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />
                  <p className="num text-lg font-extrabold" style={{ color }}>
                    {c.value != null ? c.value.toLocaleString('fa-IR') : '—'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted leading-4">{c.label}</p>
                </div>
              )
            })}
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

        {panelSummary.length > 0 && (
          <div className="glass-panel space-y-2 rounded-2xl p-4">
            <p className="text-xs font-bold">پنل داوران مصاحبه</p>
            {panelSummary.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 text-[11px]">
                <span className="text-secondary">{p.name}</span>
                <span className={`num font-bold ${p.submitted ? 'text-purple-300' : 'text-muted'}`}>
                  {p.submitted ? (p.overallPercent != null ? `٪${p.overallPercent.toLocaleString('fa-IR')}` : 'بدون امتیاز') : 'ثبت نهایی نشده'}
                </span>
              </div>
            ))}
            <p className="text-[10px] leading-5 text-muted">امتیاز کلی این گزارش، نظر نهایی مسئول ارزیابی است و میانگین سادهٔ داوران نیست.</p>
          </div>
        )}

        {/* Domain breakdown */}
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
      </div>
    </div>
  )
}

function PhotoBadge({ path, approved }: { path: string; approved?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (path) getCompDocSignedUrl(path).then((u) => active && setUrl(u))
    return () => {
      active = false
    }
  }, [path])
  return (
    <div className="relative shrink-0">
      <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border-2 border-purple-400/40 bg-white/5">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <User size={28} className="text-muted" />}
      </div>
      {approved && (
        <span className="absolute -bottom-1.5 -left-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0b0f16] bg-emerald-500 text-white shadow-lg">
          <ShieldCheck size={13} />
        </span>
      )}
    </div>
  )
}
