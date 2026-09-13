import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Award,
  Banknote,
  BarChart3,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Compass,
  Copy,
  Download,
  FileBarChart2,
  Globe,
  GraduationCap,
  HardHat,
  History,
  LayoutDashboard,
  ListChecks,
  Lock,
  Mail,
  MessageSquareText,
  Plus,
  Printer,
  Puzzle,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Users,
  Wrench,
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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
import {
  computeCategoryScores,
  computeRoleCompletion,
  isProjectManagerRole,
  questionsForAssessment,
  recommendationForRole,
  ROLE_RECOMMENDATION_COLOR,
  ROLE_RECOMMENDATION_LABEL_FA,
} from '../lib/roleCompetencyModel'
import { JOB_ROLE_LABEL_FA, type CompetencyAssessment, type CompetencyDomainKey, type DomainScore } from '../types'

// Matches COMPETENCY_ACCENT in CompetencyApp.tsx (Tailwind purple-500) — duplicated as a literal
// rather than imported to avoid a circular import back through CompetencyApp -> AssessmentWizardPage -> this file.
const COMPETENCY_ACCENT = '#a855f7'

interface ResultsStageProps {
  assessment: CompetencyAssessment
  /** Sidebar navigation — all optional so this page still renders standalone if a caller doesn't wire them. */
  onOpenList?: () => void
  onOpenPanel?: () => void
  onOpenQuestionBank?: () => void
  onNew?: () => void
}

const PM_DOMAIN_ICON: Partial<Record<CompetencyDomainKey, typeof Compass>> = {
  governance: Compass,
  planning: Calendar,
  cost: Banknote,
  hse: HardHat,
  quality: ShieldCheck,
  changeRisk: AlertTriangle,
  stakeholder: Users,
  execution: Wrench,
}

const ROLE_BUCKET_ICON: Record<string, typeof Compass> = {
  roleGeneral: Briefcase,
  roleTechnical: GraduationCap,
  roleScenario: Puzzle,
  roleExperience: History,
}

const PEER_SERIES_COLORS = ['#38bdf8', '#34d399']

/** The final report: a full-screen candidate dashboard — score ring, KPI tiles, radar with a peer
 * benchmark overlay, comparison against top peers of the same role, an evaluation-stage timeline,
 * and a closing recommendation banner — reachable from a right-hand sidebar (mirroring the rest of
 * the RTL app: first flex child sits on the right).
 */
export function ResultsStage({ assessment, onOpenList, onOpenPanel, onOpenQuestionBank, onNew }: ResultsStageProps) {
  const setStatus = useCompetencyStore((s) => s.setStatus)
  const setApproved = useCompetencyStore((s) => s.setApproved)
  const regenerateResultsShareLink = useCompetencyStore((s) => s.regenerateResultsShareLink)
  const allAssessments = useCompetencyStore((s) => s.assessments)
  const allPanelists = useCompetencyStore((s) => s.panelists)
  const allPanelistScores = useCompetencyStore((s) => s.panelistScores)
  const profiles = useCompetencyStore((s) => s.profiles)
  const questionBank = useCompetencyStore((s) => s.questionBank)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBank)
  const reportRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const compareRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const [settingApproval, setSettingApproval] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    if (questionBank.length === 0) fetchQuestionBank()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isPM = isProjectManagerRole(assessment.jobRole)
  const roleQuestions = isPM ? [] : questionsForAssessment(assessment, questionBank)
  const domainScoresFor = (answers: CompetencyAssessment['answers']) => (isPM ? computeDomainScores(answers) : computeCategoryScores(roleQuestions, answers))

  const domainScores = domainScoresFor(assessment.answers)
  const overall = computeOverallPercent(domainScores)
  const band = maturityBand(overall)
  const completion = isPM ? computeCompletion(assessment.answers) : computeRoleCompletion(roleQuestions, assessment.answers)
  const { strengths, weaknesses } = domainFlags(domainScores)
  const roleRecommendation = isPM ? null : recommendationForRole(overall, domainScores)
  const statusColor = isPM ? tierColor(overall) : ROLE_RECOMMENDATION_COLOR[roleRecommendation!.grade]
  const statusLabel = isPM ? band.label : ROLE_RECOMMENDATION_LABEL_FA[roleRecommendation!.grade]
  const statusGuidance = isPM ? band.guidance : roleRecommendation!.reason || `امتیاز کلی ٪${overall ?? 0} — بدون نقص حیاتی در حوزه‌های ارزیابی‌شده.`

  // Peers: other candidates evaluated for the same job role, used for the benchmark radar overlay,
  // the comparison bar chart, and the rank card. Each peer's own domain scores are computed with the
  // exact same function used above, over its own answers (and, for role-based assessments, its own
  // selected questions) — never guessed or interpolated.
  const peers = useMemo(() => {
    return allAssessments
      .filter((a) => a.id !== assessment.id && a.jobRole === assessment.jobRole)
      .map((a) => {
        const aRoleQuestions = isPM ? [] : questionsForAssessment(a, questionBank)
        const aDomainScores = isPM ? computeDomainScores(a.answers) : computeCategoryScores(aRoleQuestions, a.answers)
        return { assessment: a, domainScores: aDomainScores, overall: computeOverallPercent(aDomainScores) }
      })
      .filter((p) => p.overall != null)
      .sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0))
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAssessments, assessment.id, assessment.jobRole, questionBank, isPM])

  const benchmarkScores: DomainScore[] | undefined =
    peers.length > 0
      ? domainScores.map((d, i) => {
          const values = peers.map((p) => p.domainScores[i]?.percentScore).filter((v): v is number => typeof v === 'number')
          const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null
          return { ...d, percentScore: avg }
        })
      : undefined

  const allOveralls = [overall, ...peers.map((p) => p.overall)].filter((v): v is number => typeof v === 'number')
  const rank = overall != null ? allOveralls.filter((v) => v > overall).length + 1 : null
  const avgOverall = allOveralls.length > 0 ? Math.round(allOveralls.reduce((a, b) => a + b, 0) / allOveralls.length) : null
  const maxOverall = allOveralls.length > 0 ? Math.max(...allOveralls) : null

  const topPeers = peers.slice(0, 2)
  const comparisonData = domainScores.map((d, i) => {
    const row: Record<string, string | number> = { domain: d.domain.shortTitle, [assessment.candidateName]: d.percentScore ?? 0 }
    topPeers.forEach((p) => {
      row[p.assessment.candidateName] = p.domainScores[i]?.percentScore ?? 0
    })
    return row
  })

  const kpiTiles = domainScores.map((d) => ({
    domain: d,
    Icon: isPM ? PM_DOMAIN_ICON[d.domain.key as CompetencyDomainKey] ?? Compass : ROLE_BUCKET_ICON[d.domain.key] ?? Compass,
  }))

  const keyProjects = [...assessment.employmentHistory].slice(0, 3)

  // Real, honest signals rather than fabricated dates: each step reflects something actually
  // recorded on this assessment (submission, panel completion, final sign-off) — a step with no
  // reliable date just shows its checkmark without one, instead of inventing a timestamp.
  const submittedScores = allPanelistScores.filter((s) => s.assessmentId === assessment.id && s.submittedAt)
  const panelists = allPanelists.filter((p) => p.assessmentId === assessment.id)
  const stages = [
    { label: 'ثبت رزومه', done: true, date: assessment.createdAt },
    { label: 'غربالگری اولیه', done: assessment.selfServiceStatus === 'submitted' || assessment.selfServiceStatus === 'reviewed', date: null as string | null },
    { label: 'پاسخ به سؤالات', done: completion.percent === 100, date: assessment.interviewDate || null },
    { label: 'امتیازدهی پنل', done: panelists.length > 0 && submittedScores.length === panelists.length, date: null as string | null },
    { label: 'ثبت نهایی', done: assessment.status === 'completed', date: assessment.status === 'completed' ? assessment.reviewedAt || assessment.updatedAt : null },
  ]

  const qualificationChips = [
    { label: 'مدرک تحصیلی', icon: GraduationCap, value: assessment.educationScore },
    { label: 'سوابق کاری مرتبط', icon: Briefcase, value: assessment.experienceScore },
    { label: 'دوره‌های حرفه‌ای', icon: BookOpen, value: assessment.pmTrainingScore },
    { label: 'صلاحیت حرفه‌ای', icon: Award, value: assessment.pmCertificationScore },
  ]

  const panelSummary: PanelSummaryRow[] = allPanelists
    .filter((p) => p.assessmentId === assessment.id)
    .map((p) => {
      const sheet = allPanelistScores.find((s) => s.assessmentId === assessment.id && s.panelistId === p.userId)
      return {
        name: profiles.find((pr) => pr.id === p.userId)?.fullName ?? 'داور',
        overallPercent: sheet ? computeOverallPercent(domainScoresFor(sheet.answers)) : null,
        submitted: sheet?.submittedAt != null,
      }
    })

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

    try {
      await doc.fonts?.ready
    } catch {
      /* fonts API unavailable — print with whatever is loaded */
    }

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
      `با سلام\n\nنتیجه ارزیابی شایستگی جناب/سرکار خانم ${assessment.candidateName}:\nامتیاز کلی: ${overall != null ? overall + '٪' : '—'}\nسطح: ${statusLabel}\n\nبرای گزارش کامل، فایل PDF پیوست را مشاهده کنید.`,
    )
    window.location.href = `mailto:${assessment.candidateEmail}?subject=${subject}&body=${body}`
  }

  const navItems: { label: string; icon: typeof LayoutDashboard; onClick?: () => void; active?: boolean }[] = [
    { label: 'داشبورد', icon: LayoutDashboard, active: true },
    { label: 'لیست متقاضیان', icon: Users, onClick: onOpenList },
    { label: 'فرآیند ارزیابی', icon: ListChecks, onClick: onOpenPanel },
    { label: 'مقایسه کاندیدها', icon: BarChart3, onClick: () => compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    { label: 'گزارش‌های مدیریتی', icon: FileBarChart2 },
    { label: 'کتابخانه سوالات', icon: BookOpen, onClick: onOpenQuestionBank },
    { label: 'تنظیمات', icon: Settings },
  ]

  return (
    <div className="comp-results-dashboard fixed inset-0 z-40 flex" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      {/* Sidebar — first flex child, so it lands on the right in this RTL app without any direction hacks. */}
      <aside className="no-print flex w-14 shrink-0 flex-col gap-1 border-l border-white/10 bg-[#0b0f16] px-2 py-5 sm:w-56 sm:px-3">
        <div className="mb-5 flex items-center gap-2 px-1 sm:px-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `${COMPETENCY_ACCENT}22`, color: COMPETENCY_ACCENT }}>
            <Award size={16} />
          </div>
          <p className="hidden text-xs font-extrabold sm:block">ارزیابی شایستگی</p>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              disabled={!item.active && !item.onClick}
              onClick={item.onClick}
              title={item.label}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-colors sm:px-3 ${
                item.active ? 'bg-purple-500/20 text-purple-200' : item.onClick ? 'text-secondary hover:bg-white/5 hover:text-primary' : 'text-muted/50'
              }`}
            >
              <item.icon size={15} className="shrink-0" />
              <span className="hidden flex-1 text-right sm:block">{item.label}</span>
              {!item.active && !item.onClick && <Lock size={11} className="hidden opacity-60 sm:block" />}
            </button>
          ))}
        </nav>
        <p className="hidden px-2 text-[10px] text-muted sm:block">v1.0.0</p>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <header className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0b0f16]/90 px-5 py-3.5 backdrop-blur">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-purple-300" />
            <h1 className="text-sm font-extrabold">پنل ارزیابی متقاضیان {JOB_ROLE_LABEL_FA[assessment.jobRole]}</h1>
          </div>
          {onNew && (
            <button onClick={onNew} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-400">
              <Plus size={14} /> ارزیابی جدید
            </button>
          )}
        </header>

        <div className="space-y-4 p-4 sm:p-5">
          {/* Toolbar */}
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
          </div>

          <div className="no-print glass-panel space-y-2.5 rounded-2xl p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Globe size={14} className="text-purple-300" /> لینک عمومی نتایج
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

          <div className="comp-print-offscreen" ref={printRef} aria-hidden="true">
            <CompetencyPrintReport assessment={assessment} panel={panelSummary} domainScoresOverride={isPM ? undefined : domainScores} roleRecommendation={roleRecommendation} />
          </div>

          <div ref={reportRef} className="space-y-4">
            {/* Candidate header + score ring + status card */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_0.9fr_1fr]">
              <div className="glass-panel flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-l from-purple-500/15 via-transparent to-transparent p-5 sm:flex-row">
                <PhotoBadge path={assessment.photoUrl} approved={assessment.isApproved} />
                <div className="flex-1 text-center sm:text-right">
                  <p className="flex items-center justify-center gap-1.5 text-lg font-extrabold sm:justify-start">
                    {assessment.candidateName}
                    {assessment.isApproved && <ApprovalMedal />}
                    {overall != null && overall >= 85 && <Star size={16} className="fill-amber-400 text-amber-400" />}
                  </p>
                  <p className="text-xs text-muted">متقاضی سمت: {assessment.candidatePosition || JOB_ROLE_LABEL_FA[assessment.jobRole]}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                    {assessment.yearsExperienceTotal != null && (
                      <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10.5px] text-secondary">{assessment.yearsExperienceTotal.toLocaleString('fa-IR')} سال سابقه</span>
                    )}
                    {assessment.certifications.slice(0, 2).map((c) => (
                      <span key={c.id} className="rounded-full bg-purple-500/15 px-2.5 py-1 text-[10.5px] font-bold text-purple-200">
                        {c.title}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="glass-panel flex items-center justify-center rounded-2xl p-5">
                <div
                  className="flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full text-center"
                  style={{ background: `conic-gradient(${tierColor(overall)} ${(overall ?? 0) * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}
                >
                  <div className="flex h-[92px] w-[92px] flex-col items-center justify-center rounded-full bg-[#120a1e]">
                    <p className="num text-2xl font-extrabold" style={{ color: tierColor(overall) }}>
                      {overall != null ? overall.toLocaleString('fa-IR') : '—'}
                    </p>
                    <p className="text-[10px] text-muted">از ۱۰۰</p>
                  </div>
                </div>
              </div>

              <div className="glass-panel flex flex-col justify-between gap-3 rounded-2xl p-4" style={{ borderColor: `${statusColor}40` }}>
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                    وضعیت: <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
                  </p>
                  <p className="text-base font-extrabold" style={{ color: statusColor }}>
                    {statusLabel}
                  </p>
                  <p className="mt-1.5 line-clamp-3 text-[10.5px] leading-5 text-secondary">{statusGuidance}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={handlePdf} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-purple-500 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-purple-400">
                    <Download size={12} /> گزارش کامل
                  </button>
                  <button
                    onClick={() => compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-secondary hover:bg-white/5"
                  >
                    <BarChart3 size={12} /> مقایسه با سایرین
                  </button>
                </div>
              </div>
            </div>

            {/* KPI tiles */}
            <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-4 ${kpiTiles.length > 4 ? 'lg:grid-cols-4' : ''}`}>
              {kpiTiles.map(({ domain: d, Icon }) => {
                const color = tierColor(d.percentScore)
                return (
                  <div key={d.domain.key} className="glass-panel rounded-2xl p-3.5">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-secondary">
                      <Icon size={13} style={{ color }} /> {d.domain.shortTitle}
                    </div>
                    <p className="num text-xl font-extrabold" style={{ color }}>
                      {d.percentScore != null ? d.percentScore.toLocaleString('fa-IR') : '—'} <span className="text-[11px] font-bold text-muted">/۱۰۰</span>
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full transition-all" style={{ width: `${d.percentScore ?? 0}%`, background: color }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Strengths / radar / rank */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[0.85fr_1.3fr_0.85fr]">
              <div className="space-y-3">
                {strengths.length > 0 && (
                  <div className="glass-panel rounded-2xl p-4">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-green-300">
                      <Trophy size={13} /> نقاط قوت
                    </p>
                    <ul className="space-y-1.5">
                      {strengths.map((s) => (
                        <li key={s.domain.key} className="flex items-center gap-1.5 text-[11px] text-secondary">
                          <CheckCircle2 size={12} className="shrink-0 text-green-400" /> {s.domain.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {weaknesses.length > 0 && (
                  <div className="glass-panel rounded-2xl p-4">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-300">
                      <AlertTriangle size={13} /> نقاط قابل بهبود
                    </p>
                    <ul className="space-y-1.5">
                      {weaknesses.map((s) => (
                        <li key={s.domain.key} className="flex items-center gap-1.5 text-[11px] text-secondary">
                          <AlertTriangle size={12} className="shrink-0 text-amber-400" /> {s.domain.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="glass-panel rounded-2xl p-4">
                <p className="mb-2 text-center text-xs font-bold">نمودار شایستگی‌ها</p>
                <CompetencyRadarChart domainScores={domainScores} benchmarkScores={benchmarkScores} />
                <p className="text-center text-[11px] text-muted">
                  {completion.answered.toLocaleString('fa-IR')} از {completion.total.toLocaleString('fa-IR')} سوال پاسخ داده شده ({completion.percent.toLocaleString('fa-IR')}٪)
                </p>
              </div>

              <div className="glass-panel rounded-2xl p-4">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-bold">
                  <Trophy size={13} className="text-amber-300" /> رتبه در میان متقاضیان
                </p>
                {rank != null ? (
                  <>
                    <p className="text-center">
                      <span className="num text-3xl font-black text-purple-300">{rank.toLocaleString('fa-IR')}</span>
                      <span className="num text-lg text-muted"> / {allOveralls.length.toLocaleString('fa-IR')}</span>
                    </p>
                    <p className="mb-3 text-center text-[10.5px] text-muted">رتبه این متقاضی از میان کل متقاضیان این شغل</p>
                    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-center">
                      <div className="flex-1">
                        <p className="num text-sm font-bold">{avgOverall?.toLocaleString('fa-IR') ?? '—'}</p>
                        <p className="text-[10px] text-muted">میانگین کل</p>
                      </div>
                      <div className="flex-1">
                        <p className="num text-sm font-bold text-emerald-300">{maxOverall?.toLocaleString('fa-IR') ?? '—'}</p>
                        <p className="text-[10px] text-muted">بالاترین امتیاز</p>
                      </div>
                    </div>
                    {overall != null && maxOverall != null && (
                      <div className="mt-3">
                        <div className="relative h-1.5 rounded-full bg-white/5">
                          <div className="absolute inset-y-0 right-0 rounded-full bg-purple-500/40" style={{ width: `${maxOverall}%` }} />
                          <div className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[#0b0f16] bg-purple-400" style={{ right: `calc(${overall}% - 6px)` }} />
                        </div>
                        <div className="mt-1 flex justify-between text-[9px] text-muted">
                          <span>۰</span>
                          <span>۱۰۰</span>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="py-6 text-center text-[11px] text-muted">هنوز متقاضی دیگری با این شغل ثبت نشده — رتبه‌بندی پس از ثبت چند متقاضی دیگر نمایش داده می‌شود.</p>
                )}
              </div>
            </div>

            {/* Comparison vs top peers + key project history */}
            <div ref={compareRef} className="grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1fr]">
              <div className="glass-panel rounded-2xl p-4">
                <p className="mb-3 text-xs font-bold">مقایسه با سایر متقاضیان برتر</p>
                {topPeers.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={comparisonData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="domain" tick={{ fill: '#9aa4b8', fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#9aa4b8', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: 'rgba(20,10,32,0.94)', border: `1px solid ${COMPETENCY_ACCENT}55`, borderRadius: 10, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey={assessment.candidateName} fill={COMPETENCY_ACCENT} radius={[4, 4, 0, 0]} />
                      {topPeers.map((p, i) => (
                        <Bar key={p.assessment.id} dataKey={p.assessment.candidateName} fill={PEER_SERIES_COLORS[i]} radius={[4, 4, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-10 text-center text-[11px] text-muted">هنوز متقاضی دیگری برای مقایسه در این شغل ثبت نشده است.</p>
                )}
              </div>

              <div className="glass-panel rounded-2xl p-4">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-bold">
                  <Briefcase size={13} className="text-purple-300" /> سوابق کلیدی پروژه‌ها
                </p>
                {keyProjects.length > 0 ? (
                  <div className="space-y-2">
                    {keyProjects.map((p) => (
                      <div key={p.id} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-300">
                          <Building2 size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-bold">{p.employer || '—'}</p>
                          <p className="truncate text-[10px] text-muted">
                            {p.position} {p.startDate && `— از ${formatJalali(p.startDate)}`}
                          </p>
                        </div>
                        <CheckCircle2 size={14} className="shrink-0 text-green-400" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-[11px] text-muted">سابقه کاری ثبت‌شده‌ای موجود نیست.</p>
                )}
              </div>
            </div>

            {/* Evaluation stages timeline */}
            <div className="glass-panel rounded-2xl p-4">
              <p className="mb-4 flex items-center gap-1.5 text-xs font-bold">
                <ListChecks size={13} className="text-purple-300" /> مراحل ارزیابی
              </p>
              <div className="flex items-start justify-between overflow-x-auto pb-1">
                {stages.map((s, i) => (
                  <div key={s.label} className="flex flex-1 flex-col items-center gap-1.5 px-1 text-center">
                    <div className="flex w-full items-center">
                      <div className={`h-px flex-1 ${i === 0 ? 'opacity-0' : s.done ? 'bg-emerald-400/50' : 'bg-white/10'}`} />
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                          s.done ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-white/15 text-muted'
                        }`}
                      >
                        {s.done ? <CheckCircle2 size={14} /> : <span className="num text-[10px]">{i + 1}</span>}
                      </div>
                      <div className={`h-px flex-1 ${i === stages.length - 1 ? 'opacity-0' : stages[i + 1]?.done ? 'bg-emerald-400/50' : 'bg-white/10'}`} />
                    </div>
                    <p className="text-[10.5px] font-bold">{s.label}</p>
                    <p className="num text-[9.5px] text-muted">{s.date ? formatJalali(s.date) : s.done ? '' : 'در انتظار'}</p>
                  </div>
                ))}
              </div>
            </div>

            {isPM && qualificationChips.some((c) => c.value != null) && (
              <div className="glass-panel rounded-2xl p-4">
                <p className="mb-3 text-sm font-extrabold">کارت امتیاز شایستگی</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
            )}

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

            {/* Final recommendation banner */}
            <div className="glass-panel flex flex-col items-start gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center" style={{ borderColor: `${statusColor}40` }}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${statusColor}1c`, color: statusColor }}>
                <MessageSquareText size={18} />
              </div>
              <div className="flex-1">
                <p className="text-xs font-extrabold">جمع‌بندی و پیشنهاد</p>
                <p className="mt-0.5 text-[11px] leading-6 text-secondary">{assessment.strengths || assessment.developmentAreas ? assessment.strengths : statusGuidance}</p>
              </div>
              <button
                onClick={handleApprove}
                disabled={settingApproval}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
                  assessment.isApproved ? 'border border-white/10 text-secondary hover:bg-white/5' : 'bg-emerald-500 text-white hover:bg-emerald-400'
                }`}
              >
                <ShieldCheck size={14} /> {assessment.isApproved ? 'لغو تایید صلاحیت' : 'تایید و ارسال به مرحله بعد'}
              </button>
            </div>
          </div>
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
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Users size={28} className="text-muted" />}
      </div>
      {approved && (
        <span className="absolute -bottom-1.5 -left-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#0b0f16] bg-emerald-500 text-white shadow-lg">
          <ShieldCheck size={13} />
        </span>
      )}
    </div>
  )
}
