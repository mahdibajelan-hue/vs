import { useEffect, useMemo } from 'react'
import { AlertTriangle, BarChart3, BrainCircuit, ClipboardList, FileBarChart2, Home, ShieldAlert, Users } from 'lucide-react'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { SignOutButton } from '../../../components/Auth/SignOutButton'
import { StorageErrorBanner } from '../../../components/Layout/StorageErrorBanner'
import { JOB_ROLES, JOB_ROLE_LABEL_FA } from '../../competency/types'
import {
  PERSONALITY_ASSESSMENT_STATUS_LABEL_FA,
  PERSONALITY_VALIDITY_STATUS_LABEL_FA,
  type PersonalityAssessmentStatus,
  type PersonalityValidityStatus,
} from '../types'

const ALL_STATUSES: PersonalityAssessmentStatus[] = [
  'DRAFT',
  'DESIGNED',
  'GENERATED',
  'ASSIGNED',
  'STARTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'VALIDITY_CHECK',
  'SCORING',
  'FINGERPRINT',
  'AI_ANALYSIS',
  'FINAL_REVIEW',
  'LOCKED',
  'ARCHIVED',
]

const ALL_VALIDITY_STATUSES: PersonalityValidityStatus[] = ['VALID', 'ACCEPTABLE', 'REVIEW_REQUIRED', 'INVALID']

const VALIDITY_TONE: Record<PersonalityValidityStatus, string> = {
  VALID: '#34d399',
  ACCEPTABLE: '#38bdf8',
  REVIEW_REQUIRED: '#fbbf24',
  INVALID: '#f87171',
}

interface PersonalityReportsPageProps {
  onExitToHub: () => void
  onNavDashboard: () => void
  onNavQuestionBank: () => void
  onNavSettings?: () => void
}

function Bar({ label, value, count, color }: { label: string; value: number | null; count?: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium text-secondary">{label}</span>
        <span className="num font-bold">
          {value != null ? value.toLocaleString('fa-IR') : '—'}
          {count != null && <span className="mr-1 text-[10px] font-normal text-muted">({count.toLocaleString('fa-IR')} مورد)</span>}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

/**
 * Admin analytics/reports page for the Personality module — mirrors CompetencyReportsPage.tsx's
 * role, adapted to this module's own aggregate signal: status/validity distribution, average
 * trait/dimension scores across every scored assessment, and which behavioral watchpoints recur
 * most often across candidates. Visible to anyone who can reach the dashboard, same as the
 * competency module's reports page (see CompetencyApp.tsx's moduleNav — reports is not
 * admin-gated there).
 */
export function PersonalityReportsPage({ onExitToHub, onNavDashboard, onNavQuestionBank, onNavSettings }: PersonalityReportsPageProps) {
  const assessments = usePersonalityStore((s) => s.assessments)
  const fetchAssessments = usePersonalityStore((s) => s.fetchAssessments)
  const dimensionScores = usePersonalityStore((s) => s.dimensionScores)
  const validityResults = usePersonalityStore((s) => s.validityResults)
  const fetchAllScoresForReports = usePersonalityStore((s) => s.fetchAllScoresForReports)
  const traits = usePersonalityStore((s) => s.traits)
  const dimensions = usePersonalityStore((s) => s.dimensions)
  const fetchCatalog = usePersonalityStore((s) => s.fetchCatalog)

  useEffect(() => {
    if (assessments.length === 0) fetchAssessments()
    if (traits.length === 0) fetchCatalog()
    fetchAllScoresForReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const statusCounts = useMemo(() => {
    const counts = new Map<PersonalityAssessmentStatus, number>()
    assessments.forEach((a) => counts.set(a.status, (counts.get(a.status) ?? 0) + 1))
    return counts
  }, [assessments])

  const traitAverages = useMemo(() => {
    const byTrait = new Map<string, number[]>()
    dimensionScores
      .filter((d) => d.scoreKind === 'TRAIT' && d.traitId && d.normalizedScore != null)
      .forEach((d) => {
        const arr = byTrait.get(d.traitId as string) ?? []
        arr.push(d.normalizedScore as number)
        byTrait.set(d.traitId as string, arr)
      })
    return traits
      .map((t) => {
        const arr = byTrait.get(t.id) ?? []
        return { key: t.id, label: t.labelFa, avg: arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null, count: arr.length }
      })
      .filter((r) => r.count > 0)
  }, [dimensionScores, traits])

  const dimensionAverages = useMemo(() => {
    const byDim = new Map<string, number[]>()
    dimensionScores
      .filter((d) => d.scoreKind === 'BEHAVIORAL_DIMENSION' && d.dimensionId && d.normalizedScore != null)
      .forEach((d) => {
        const arr = byDim.get(d.dimensionId as string) ?? []
        arr.push(d.normalizedScore as number)
        byDim.set(d.dimensionId as string, arr)
      })
    return dimensions
      .map((d) => {
        const arr = byDim.get(d.id) ?? []
        return { key: d.id, label: d.labelFa, avg: arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null, count: arr.length }
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0))
  }, [dimensionScores, dimensions])

  const watchpointFrequency = useMemo(() => {
    const counts = new Map<string, number>()
    assessments.forEach((a) => a.computedWatchpoints.forEach((w) => counts.set(w.topic, (counts.get(w.topic) ?? 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [assessments])

  const validityCounts = useMemo(() => {
    const counts = new Map<PersonalityValidityStatus, number>()
    validityResults.forEach((v) => counts.set(v.overallStatus, (counts.get(v.overallStatus) ?? 0) + 1))
    return counts
  }, [validityResults])

  const flaggedResults = useMemo(() => validityResults.filter((v) => v.overallStatus === 'REVIEW_REQUIRED' || v.overallStatus === 'INVALID'), [validityResults])
  const reviewReasons = useMemo(
    () => ({
      straightLining: flaggedResults.filter((v) => v.straightLiningFlag).length,
      randomPattern: flaggedResults.filter((v) => v.randomPatternFlag).length,
      missingResponses: flaggedResults.filter((v) => v.missingResponseCount > 0).length,
      contradictions: flaggedResults.filter((v) => v.contradictionCount > 0).length,
    }),
    [flaggedResults],
  )

  const roleRows = useMemo(() => {
    return JOB_ROLES.filter((role) => assessments.some((a) => a.jobRole === role)).map((role) => {
      const roleAssessments = assessments.filter((a) => a.jobRole === role)
      const ids = new Set(roleAssessments.map((a) => a.id))
      const dimScores = dimensionScores.filter((d) => d.scoreKind === 'BEHAVIORAL_DIMENSION' && ids.has(d.personalityAssessmentId) && d.normalizedScore != null)
      const avg = dimScores.length > 0 ? Math.round(dimScores.reduce((s, d) => s + (d.normalizedScore ?? 0), 0) / dimScores.length) : null
      const reviewCount = validityResults.filter((v) => ids.has(v.personalityAssessmentId) && (v.overallStatus === 'REVIEW_REQUIRED' || v.overallStatus === 'INVALID')).length
      return { role, count: roleAssessments.length, avg, reviewCount }
    })
  }, [assessments, dimensionScores, validityResults])

  const scoredCount = new Set(dimensionScores.map((d) => d.personalityAssessmentId)).size
  const mostCommonWatchpoint = watchpointFrequency[0]

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0b0f16]/90 px-5 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-300">
            <FileBarChart2 size={16} />
          </div>
          <h1 className="text-sm font-extrabold">گزارش‌های تحلیلی ارزیابی شخصیت</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onNavDashboard} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
            داشبورد
          </button>
          <button onClick={onNavQuestionBank} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
            <ClipboardList size={13} /> بانک سؤالات
          </button>
          {onNavSettings && (
            <button onClick={onNavSettings} className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
              تنظیمات
            </button>
          )}
          <button onClick={onExitToHub} title="بازگشت به ماژول‌ها" className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5">
            <Home size={14} />
          </button>
          <SignOutButton className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10" />
        </div>
      </header>

      <StorageErrorBanner />

      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="glass-panel rounded-2xl p-3.5">
            <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <Users size={12} /> کل ارزیابی‌ها
            </p>
            <p className="num mt-1 text-xl font-extrabold">{assessments.length.toLocaleString('fa-IR')}</p>
          </div>
          <div className="glass-panel rounded-2xl p-3.5">
            <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <BrainCircuit size={12} /> دارای امتیازدهی
            </p>
            <p className="num mt-1 text-xl font-extrabold">{scoredCount.toLocaleString('fa-IR')}</p>
          </div>
          <div className="glass-panel rounded-2xl p-3.5">
            <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <ShieldAlert size={12} /> نیازمند بازبینی اعتبار
            </p>
            <p className="num mt-1 text-xl font-extrabold text-amber-300">{(validityCounts.get('REVIEW_REQUIRED') ?? 0).toLocaleString('fa-IR')}</p>
          </div>
          <div className="glass-panel rounded-2xl p-3.5">
            <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <AlertTriangle size={12} /> پرتکرارترین نقطه قابل بررسی
            </p>
            <p className="mt-1 truncate text-[12.5px] font-bold" title={mostCommonWatchpoint?.[0]}>
              {mostCommonWatchpoint ? mostCommonWatchpoint[0] : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="glass-panel rounded-2xl p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold">
              <BarChart3 size={13} className="text-pink-300" /> ارزیابی‌ها بر حسب وضعیت
            </p>
            <div className="space-y-2.5">
              {ALL_STATUSES.filter((st) => (statusCounts.get(st) ?? 0) > 0).map((st) => (
                <Bar
                  key={st}
                  label={PERSONALITY_ASSESSMENT_STATUS_LABEL_FA[st]}
                  value={assessments.length > 0 ? Math.round(((statusCounts.get(st) ?? 0) / assessments.length) * 100) : 0}
                  count={statusCounts.get(st) ?? 0}
                  color="#f472b6"
                />
              ))}
              {assessments.length === 0 && <p className="text-[11px] text-muted">هنوز ارزیابی‌ای ثبت نشده است.</p>}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold">
              <ShieldAlert size={13} className="text-amber-300" /> وضعیت اعتبار پاسخ‌ها
            </p>
            <div className="space-y-2.5">
              {ALL_VALIDITY_STATUSES.filter((st) => (validityCounts.get(st) ?? 0) > 0).map((st) => (
                <Bar
                  key={st}
                  label={PERSONALITY_VALIDITY_STATUS_LABEL_FA[st]}
                  value={validityResults.length > 0 ? Math.round(((validityCounts.get(st) ?? 0) / validityResults.length) * 100) : 0}
                  count={validityCounts.get(st) ?? 0}
                  color={VALIDITY_TONE[st]}
                />
              ))}
              {validityResults.length === 0 && <p className="text-[11px] text-muted">هنوز نتیجه اعتبارسنجی‌ای ثبت نشده است.</p>}
            </div>
            {flaggedResults.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-white/5 pt-2.5 text-[10.5px] text-muted">
                <p className="font-bold text-secondary">دلایل بازبینی/عدم اعتبار ({flaggedResults.length.toLocaleString('fa-IR')} مورد)</p>
                <p>الگوی پاسخ یکنواخت: <span className="num font-bold text-primary">{reviewReasons.straightLining.toLocaleString('fa-IR')}</span></p>
                <p>الگوی پاسخ تصادفی: <span className="num font-bold text-primary">{reviewReasons.randomPattern.toLocaleString('fa-IR')}</span></p>
                <p>سؤالات بی‌پاسخ: <span className="num font-bold text-primary">{reviewReasons.missingResponses.toLocaleString('fa-IR')}</span></p>
                <p>تناقض در پاسخ‌ها: <span className="num font-bold text-primary">{reviewReasons.contradictions.toLocaleString('fa-IR')}</span></p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {traitAverages.length > 0 && (
            <div className="glass-panel rounded-2xl p-4">
              <p className="mb-3 text-xs font-bold">میانگین ویژگی‌های شخصیتی (تمام متقاضیان)</p>
              <div className="space-y-2.5">
                {traitAverages.map((r) => (
                  <Bar key={r.key} label={r.label} value={r.avg} count={r.count} color="#f472b6" />
                ))}
              </div>
            </div>
          )}

          {dimensionAverages.length > 0 && (
            <div className="glass-panel rounded-2xl p-4">
              <p className="mb-3 text-xs font-bold">میانگین ابعاد رفتاری (کم‌امتیازترین در بالا)</p>
              <div className="space-y-2.5">
                {dimensionAverages.map((r) => (
                  <Bar key={r.key} label={r.label} value={r.avg} count={r.count} color="#38bdf8" />
                ))}
              </div>
            </div>
          )}
        </div>

        {watchpointFrequency.length > 0 && (
          <div className="glass-panel rounded-2xl p-4">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <AlertTriangle size={13} /> پرتکرارترین نقاط قابل بررسی (بین همه متقاضیان)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px]">
                <thead>
                  <tr className="border-b border-white/10 text-muted">
                    <th className="p-1.5">موضوع</th>
                    <th className="p-1.5">تعداد متقاضیان</th>
                  </tr>
                </thead>
                <tbody>
                  {watchpointFrequency.map(([topic, count]) => (
                    <tr key={topic} className="border-b border-white/5">
                      <td className="p-1.5">{topic}</td>
                      <td className="num p-1.5">{count.toLocaleString('fa-IR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-bold">
            <Users size={13} className="text-pink-300" /> تفکیک بر حسب شغل
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px]">
              <thead>
                <tr className="border-b border-white/10 text-muted">
                  <th className="p-1.5">شغل</th>
                  <th className="p-1.5">تعداد ارزیابی</th>
                  <th className="p-1.5">میانگین ابعاد رفتاری</th>
                  <th className="p-1.5">نیازمند بازبینی اعتبار</th>
                </tr>
              </thead>
              <tbody>
                {roleRows.map(({ role, count, avg, reviewCount }) => (
                  <tr key={role} className="border-b border-white/5">
                    <td className="p-1.5 font-bold">{JOB_ROLE_LABEL_FA[role]}</td>
                    <td className="num p-1.5">{count.toLocaleString('fa-IR')}</td>
                    <td className="num p-1.5">{avg != null ? avg.toLocaleString('fa-IR') : '—'}</td>
                    <td className="num p-1.5">{reviewCount.toLocaleString('fa-IR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {roleRows.length === 0 && <p className="p-4 text-center text-[11px] text-muted">هنوز ارزیابی‌ای ثبت نشده است.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
