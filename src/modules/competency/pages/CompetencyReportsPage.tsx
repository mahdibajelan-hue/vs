import { useEffect, useMemo, useRef, useState } from 'react'
import { FileBarChart2, Printer } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { computeDomainScores, computeOverallPercent } from '../lib/competencyModel'
import { computeCategoryScores, isProjectManagerRole, questionsForAssessment, resolveOfficialAnswers } from '../lib/roleCompetencyModel'
import { formatJalali } from '../../../lib/jalali'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { JOB_ROLES, JOB_ROLE_LABEL_FA, type JobRole } from '../types'

interface CompetencyReportsPageProps {
  onExitToHub: () => void
  nav: Partial<Record<CompetencySection, () => void>>
}

const STATUS_LABEL_FA: Record<string, string> = { draft: 'در حال انجام', completed: 'تکمیل‌شده' }

/** A printable roster of candidates grouped by job role, with full contact details — for HR/team
 * leads who need a hand-off list rather than the interactive dashboard. */
export function CompetencyReportsPage({ onExitToHub, nav }: CompetencyReportsPageProps) {
  const assessments = useCompetencyStore((s) => s.assessments)
  // Category/weight-only classification for scoring, not the evaluator-only reference-answer
  // material — see the same note in CompetencyDashboardPage.tsx.
  const questionBank = useCompetencyStore((s) => s.questionBankPublic)
  const fetchQuestionBank = useCompetencyStore((s) => s.fetchQuestionBankPublic)
  const panelistScores = useCompetencyStore((s) => s.panelistScores)
  const [roleFilter, setRoleFilter] = useState<JobRole | 'all'>('all')
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (questionBank.length === 0) fetchQuestionBank()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const usedRoles = useMemo(() => JOB_ROLES.filter((r) => assessments.some((a) => a.jobRole === r)), [assessments])

  const rows = useMemo(() => {
    return assessments
      .filter((a) => roleFilter === 'all' || a.jobRole === roleFilter)
      .map((a) => {
        const isPM = isProjectManagerRole(a.jobRole)
        const officialAnswers = resolveOfficialAnswers(
          a.answers,
          panelistScores.filter((s) => s.assessmentId === a.id),
        )
        const domainScores = isPM ? computeDomainScores(officialAnswers) : computeCategoryScores(questionsForAssessment(a, questionBank), officialAnswers)
        return { a, overall: computeOverallPercent(domainScores) }
      })
      .sort((x, y) => JOB_ROLE_LABEL_FA[x.a.jobRole].localeCompare(JOB_ROLE_LABEL_FA[y.a.jobRole]))
  }, [assessments, roleFilter, questionBank, panelistScores])

  const handlePrint = () => {
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
<title>گزارش متقاضیان</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;800&display=swap">
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: "Vazirmatn", "Segoe UI", sans-serif; color: #111; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: right; }
  th { background: #f3f0fa; font-weight: 800; }
  h1 { font-size: 14px; margin: 0 0 10px; }
</style></head><body>${node.innerHTML}</body></html>`)
    doc.close()
    win.focus()
    setTimeout(() => {
      win.print()
      win.addEventListener('afterprint', () => frame.remove())
      setTimeout(() => frame.remove(), 60_000)
    }, 200)
  }

  const headerRight = (
    <button onClick={handlePrint} className="flex items-center gap-1.5 rounded-xl bg-purple-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-purple-400">
      <Printer size={14} /> چاپ گزارش
    </button>
  )

  return (
    <CompetencySidebarShell active="reports" nav={nav} title="گزارش متقاضیان بر حسب شغل" onExitToHub={onExitToHub} headerRight={headerRight}>
      <div className="glass-panel rounded-2xl p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <FileBarChart2 size={14} className="text-purple-300" /> فیلتر بر اساس شغل:
          </p>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as JobRole | 'all')} className="input max-w-xs">
            <option value="all">همه مشاغل</option>
            {usedRoles.map((r) => (
              <option key={r} value={r}>
                {JOB_ROLE_LABEL_FA[r]}
              </option>
            ))}
          </select>
          <span className="num text-[11px] text-muted">{rows.length.toLocaleString('fa-IR')} متقاضی</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-[11px]">
            <thead>
              <tr className="border-b border-white/10 text-muted">
                <th className="p-1.5">نام</th>
                <th className="p-1.5">شغل</th>
                <th className="p-1.5">شماره تماس</th>
                <th className="p-1.5">کد ملی</th>
                <th className="p-1.5">ایمیل</th>
                <th className="p-1.5">سابقه کل</th>
                <th className="p-1.5">کارفرمای فعلی</th>
                <th className="p-1.5">تاریخ مصاحبه</th>
                <th className="p-1.5">وضعیت</th>
                <th className="p-1.5">امتیاز</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, overall }) => (
                <tr key={a.id} className="border-b border-white/5">
                  <td className="p-1.5 font-bold">{a.candidateName}</td>
                  <td className="p-1.5">{JOB_ROLE_LABEL_FA[a.jobRole]}</td>
                  <td className="num p-1.5" dir="ltr">
                    {a.candidatePhone || '—'}
                  </td>
                  <td className="num p-1.5">{a.candidateNationalId || '—'}</td>
                  <td className="p-1.5" dir="ltr">
                    {a.candidateEmail || '—'}
                  </td>
                  <td className="num p-1.5">{a.yearsExperienceTotal != null ? `${a.yearsExperienceTotal} سال` : '—'}</td>
                  <td className="p-1.5">{a.currentEmployer || '—'}</td>
                  <td className="num p-1.5">{formatJalali(a.interviewDate) || '—'}</td>
                  <td className="p-1.5">{STATUS_LABEL_FA[a.status] ?? a.status}</td>
                  <td className="num p-1.5">{overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-4 text-center text-[11px] text-muted">متقاضی‌ای یافت نشد.</p>}
        </div>
      </div>

      {/* Offscreen print target — plain HTML table, independent of the app's dark theme/layout. */}
      <div className="hidden" aria-hidden="true">
        <div ref={printRef}>
          <h1>گزارش متقاضیان{roleFilter !== 'all' ? ` — ${JOB_ROLE_LABEL_FA[roleFilter]}` : ''}</h1>
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>شغل</th>
                <th>شماره تماس</th>
                <th>کد ملی</th>
                <th>ایمیل</th>
                <th>سابقه کل</th>
                <th>کارفرمای فعلی</th>
                <th>تاریخ مصاحبه</th>
                <th>وضعیت</th>
                <th>امتیاز</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ a, overall }) => (
                <tr key={a.id}>
                  <td>{a.candidateName}</td>
                  <td>{JOB_ROLE_LABEL_FA[a.jobRole]}</td>
                  <td dir="ltr">{a.candidatePhone || '—'}</td>
                  <td>{a.candidateNationalId || '—'}</td>
                  <td dir="ltr">{a.candidateEmail || '—'}</td>
                  <td>{a.yearsExperienceTotal != null ? `${a.yearsExperienceTotal} سال` : '—'}</td>
                  <td>{a.currentEmployer || '—'}</td>
                  <td>{formatJalali(a.interviewDate) || '—'}</td>
                  <td>{STATUS_LABEL_FA[a.status] ?? a.status}</td>
                  <td>{overall != null ? `٪${overall.toLocaleString('fa-IR')}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </CompetencySidebarShell>
  )
}
