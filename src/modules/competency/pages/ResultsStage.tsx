import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Award,
  Briefcase,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Globe,
  GraduationCap,
  Mail,
  MessageSquareText,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  User,
} from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { getCompDocSignedUrl } from '../lib/compStorage'
import { exportElementToPdf } from '../../../lib/export'
import { formatJalali } from '../../../lib/jalali'
import { CompetencyRadarChart } from '../components/CompetencyRadarChart'
import { CompetencyPrintReport, type PanelSummaryRow } from '../components/CompetencyPrintReport'
import { ApprovalMedal } from '../components/ApprovalMedal'
import {
  computeCompletion,
  computeDomainScores,
  computeOverallPercent,
  domainFlags,
  maturityBand,
  tierColor,
} from '../lib/competencyModel'
import type { CompetencyAssessment } from '../types'

interface ResultsStageProps {
  assessment: CompetencyAssessment
}

/** The final report: a professional candidate card, radar chart, maturity band, strengths/weaknesses, and position recommendations — all on one printable/exportable page. */
export function ResultsStage({ assessment }: ResultsStageProps) {
  const setStatus = useCompetencyStore((s) => s.setStatus)
  const setApproved = useCompetencyStore((s) => s.setApproved)
  const regenerateResultsShareLink = useCompetencyStore((s) => s.regenerateResultsShareLink)
  const allPanelists = useCompetencyStore((s) => s.panelists)
  const allPanelistScores = useCompetencyStore((s) => s.panelistScores)
  const profiles = useCompetencyStore((s) => s.profiles)
  const reportRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [settingApproval, setSettingApproval] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

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
    { label: 'مدرک تحصیلی', icon: GraduationCap, value: assessment.educationScore },
    { label: 'سوابق کاری مرتبط', icon: Briefcase, value: assessment.experienceScore },
    { label: 'دوره‌های حرفه‌ای', icon: BookOpen, value: assessment.pmTrainingScore },
    { label: 'صلاحیت حرفه‌ای', icon: Award, value: assessment.pmCertificationScore },
    { label: 'نتایج مصاحبه', icon: MessageSquareText, value: overall != null ? Math.round((overall / 20) * 10) / 10 : null },
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

    const marginMm = 8
    doc.open()
    doc.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>ارزیابی شایستگی — ${assessment.candidateName}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap">
<style>
  @page { size: A4 portrait; margin: ${marginMm}mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: "Vazirmatn", "Segoe UI", sans-serif; }
  svg, img { break-inside: avoid; page-break-inside: avoid; }
</style></head><body><div id="fit-wrap" style="margin:0 auto;overflow:hidden;">${node.innerHTML}</div></body></html>`)
    doc.close()

    // Without waiting, Chrome snapshots the page before the webfont arrives and prints fallback
    // glyphs with the wrong metrics.
    try {
      await doc.fonts?.ready
    } catch {
      /* fonts API unavailable — print with whatever is loaded */
    }

    // The report is authored at a fixed 900px, sized for the PDF capture, without regard for
    // whether that happens to fit one A4 page. Reflowing its width to the page (the previous
    // approach) let the report's internal fixed-px columns overflow instead of shrinking, which is
    // exactly the "page size doesn't match the text" symptom. Uniformly scaling the whole,
    // unreflowed report down to fit the page's printable box — same idea as the PDF export's
    // fitToOnePage — keeps every internal proportion intact and guarantees it never spills onto a
    // second page.
    const wrap = doc.getElementById('fit-wrap')
    const reportEl = wrap?.firstElementChild as HTMLElement | undefined
    if (wrap && reportEl) {
      const mmToPx = 96 / 25.4
      const maxWidthPx = (210 - marginMm * 2) * mmToPx
      const maxHeightPx = (297 - marginMm * 2) * mmToPx
      const naturalWidth = reportEl.scrollWidth
      const naturalHeight = reportEl.scrollHeight
      const scale = Math.min(1, maxWidthPx / naturalWidth, maxHeightPx / naturalHeight)
      reportEl.style.transformOrigin = 'top left'
      reportEl.style.transform = `scale(${scale})`
      wrap.style.width = `${naturalWidth * scale}px`
      wrap.style.height = `${naturalHeight * scale}px`
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
    await exportElementToPdf(printRef.current, `ارزیابی-${assessment.candidateName}.pdf`, {
      orientation: 'portrait',
      backgroundColor: '#ffffff',
      fitToOnePage: true,
      marginMm: 6,
    })
    setExporting(false)
  }

  const handleApprove = async () => {
    setSettingApproval(true)
    await setApproved(assessment.id, !assessment.isApproved)
    setSettingApproval(false)
  }

  const resultsShareUrl = `${window.location.origin}${window.location.pathname}?results=${assessment.resultsShareToken}`

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

      <div className="no-print glass-panel space-y-2.5 rounded-2xl p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Globe size={14} className="text-purple-300" /> لینک عمومی نتایج
        </p>
        <p className="text-[11px] leading-5 text-muted">
          این لینک را برای هر کسی ارسال کنید تا بدون ورود به سامانه، فقط همین بخش نتایج را به‌صورت آنلاین ببیند — بدون نام مصاحبه‌گران و بدون سایر اطلاعات نامزد.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input readOnly value={resultsShareUrl} dir="ltr" className="input flex-1 text-[11px]" onFocus={(e) => e.target.select()} />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(resultsShareUrl)
              setLinkCopied(true)
              setTimeout(() => setLinkCopied(false), 2000)
            }}
            className="flex items-center gap-1.5 rounded-lg bg-purple-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400"
          >
            <Copy size={12} /> {linkCopied ? 'کپی شد' : 'کپی لینک'}
          </button>
          <button
            type="button"
            onClick={() => regenerateResultsShareLink(assessment.id)}
            title="صدور لینک جدید (لینک قبلی غیرفعال می‌شود)"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-secondary hover:bg-white/5"
          >
            <RefreshCw size={12} /> لینک جدید
          </button>
        </div>
      </div>

      {/* Off-screen, light-mode print/PDF template — kept out of view (print-only) so the on-screen
          dark card above stays as-is, but window.print()/PDF export both target this instead, since
          html2canvas captures literal colors and a dark background prints/exports poorly. */}
      <div className="comp-print-offscreen" ref={printRef} aria-hidden="true">
        <CompetencyPrintReport assessment={assessment} panel={panelSummary} />
      </div>

      <div ref={reportRef} className="no-print space-y-4 rounded-2xl bg-[#0b0f16] p-1">
        {/* Personnel card header */}
        <div className="glass-panel relative overflow-hidden rounded-2xl">
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-l from-purple-500/15 via-transparent to-transparent p-5 sm:flex-row sm:items-center">
            <PhotoBadge path={assessment.photoUrl} approved={assessment.isApproved} />
            <div className="flex-1 text-center sm:text-right">
              <p className="flex items-center justify-center gap-1.5 text-lg font-extrabold sm:justify-start">
                {assessment.candidateName}
                {assessment.isApproved && <ApprovalMedal />}
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
          <p className="mb-3 text-sm font-extrabold">کارت امتیاز شایستگی</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {qualificationChips.map((c) => {
              const color = tierColor(c.value != null ? (c.value / 5) * 100 : null)
              return (
                <div
                  key={c.label}
                  className="relative overflow-hidden rounded-2xl border p-3.5 text-center transition-transform hover:-translate-y-0.5"
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
              <p className="mt-2 rounded-lg bg-purple-500/10 p-2.5 text-[11px] leading-6 text-purple-200">سمت‌های شغلی پیشنهادی: {band.suggestedPositions}</p>
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

            {(assessment.strengths || assessment.developmentAreas) && (
              <div className="glass-panel space-y-2.5 rounded-2xl p-4">
                <p className="text-[11px] font-bold text-purple-200">جمع‌بندی مسئول ارزیابی</p>
                {assessment.strengths && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-green-300">
                      <TrendingUp size={12} /> نقاط قوت
                    </p>
                    <p className="text-[11px] leading-6 text-secondary">{assessment.strengths}</p>
                  </div>
                )}
                {assessment.developmentAreas && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                      <TrendingDown size={12} /> زمینه‌های قابل بهبود
                    </p>
                    <p className="text-[11px] leading-6 text-secondary">{assessment.developmentAreas}</p>
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
                <div className="h-full rounded-full transition-all" style={{ width: `${d.percentScore ?? 0}%`, background: tierColor(d.percentScore) }} />
              </div>
              <span className="num w-20 shrink-0 text-left text-[11px] text-muted">
                {d.percentScore != null ? `٪${d.percentScore.toLocaleString('fa-IR')}` : '—'} ({d.answeredCount.toLocaleString('fa-IR')}/{d.totalCount.toLocaleString('fa-IR')})
              </span>
            </div>
          ))}
        </div>

        {panelSummary.length > 0 && (
          <div className="glass-panel space-y-2 rounded-2xl p-4">
            <p className="text-xs font-bold">پنل مصاحبه‌گران</p>
            {panelSummary.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 text-[11px]">
                <span className="text-secondary">{p.name}</span>
                <span className={`num font-bold ${p.submitted ? 'text-purple-300' : 'text-muted'}`}>
                  {p.submitted ? (p.overallPercent != null ? `٪${p.overallPercent.toLocaleString('fa-IR')}` : 'بدون امتیاز') : 'ثبت نهایی نشده'}
                </span>
              </div>
            ))}
            <p className="text-[10px] leading-5 text-muted">امتیاز کلی این گزارش، نظر نهایی مسئول ارزیابی است و میانگین سادهٔ اعضای پنل نیست.</p>
          </div>
        )}
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
