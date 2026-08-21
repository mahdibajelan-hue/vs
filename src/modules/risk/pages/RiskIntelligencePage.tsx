import { useMemo, useState } from 'react'
import { AlertTriangle, Brain, CalendarClock, Copy, Gauge } from 'lucide-react'
import type { RmProjectDetail } from '../store/useRiskStore'
import {
  computeAverageQualityScore,
  computeReviewsDue,
  computeRiskQualityScore,
  detectDuplicateRisks,
  detectEarlyWarnings,
} from '../lib/riskIntelligence'
import { RiskDetailModal } from '../components/RiskDetailModal'

export function RiskIntelligencePage({ project }: { project: RmProjectDetail }) {
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null)

  const duplicates = useMemo(() => detectDuplicateRisks(project.risks), [project.risks])
  const reviewsDue = useMemo(() => computeReviewsDue(project.risks, project.assessments), [project.risks, project.assessments])
  const earlyWarnings = useMemo(() => detectEarlyWarnings(project.risks, project.assessments, project.actions), [project.risks, project.assessments, project.actions])
  const avgQuality = useMemo(() => computeAverageQualityScore(project.risks, project.assessments, project.actions), [project.risks, project.assessments, project.actions])
  const lowQualityRisks = useMemo(
    () =>
      project.risks
        .filter((r) => r.status !== 'closed')
        .map((r) => computeRiskQualityScore(r, project.assessments, project.actions))
        .filter((q) => q.score < 70)
        .sort((a, b) => a.score - b.score),
    [project.risks, project.assessments, project.actions],
  )

  const selectedRisk = selectedRiskId ? project.risks.find((r) => r.id === selectedRiskId) ?? null : null

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold">
            <Brain size={15} className="text-red-400" /> هوش ریسک — {project.name}
          </p>
          <p className="text-[11px] text-muted">تحلیل‌های قانون‌محور روی داده‌های ثبت‌شده — بدون فراخوانی هیچ مدل خارجی، همه چیز از همین داده‌های پروژه محاسبه می‌شود.</p>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <Gauge size={15} className="text-purple-400" /> کیفیت ثبت داده ریسک‌ها
            </p>
            <span className="num rounded-full bg-purple-500/15 px-3 py-1 text-sm font-bold text-purple-300">میانگین {avgQuality}٪</span>
          </div>
          {lowQualityRisks.length === 0 ? (
            <p className="text-[11px] text-muted">همه ریسک‌های فعال کیفیت ثبت قابل‌قبولی دارند</p>
          ) : (
            <div className="space-y-1.5">
              {lowQualityRisks.map((q) => (
                <button
                  key={q.risk.id}
                  onClick={() => setSelectedRiskId(q.risk.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-white/5 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="num text-muted">{q.risk.code}</span>
                    <span className="font-medium">{q.risk.title}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="num rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] text-orange-300">{q.score}٪</span>
                    <span className="text-[10px] text-muted">{q.missing[0]}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold">
            <Copy size={15} className="text-orange-400" /> ریسک‌های مشابه/تکراری احتمالی ({duplicates.length})
          </p>
          {duplicates.length === 0 ? (
            <p className="text-[11px] text-muted">هیچ جفت ریسک مشابهی شناسایی نشد</p>
          ) : (
            <div className="space-y-1.5">
              {duplicates.map((d, i) => (
                <div key={i} className="rounded-lg bg-white/[0.02] p-2.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="num rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] text-orange-300">{Math.round(d.similarity * 100)}٪ شباهت</span>
                    {d.sameCategory && <span className="text-[10px] text-muted">هم‌دسته</span>}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <button onClick={() => setSelectedRiskId(d.riskA.id)} className="rounded-lg px-2 py-1 font-medium hover:bg-white/5 transition-colors">
                      {d.riskA.code} — {d.riskA.title}
                    </button>
                    <span className="text-muted">↔</span>
                    <button onClick={() => setSelectedRiskId(d.riskB.id)} className="rounded-lg px-2 py-1 font-medium hover:bg-white/5 transition-colors">
                      {d.riskB.code} — {d.riskB.title}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold">
            <CalendarClock size={15} className="text-blue-400" /> بازبینی‌های سررسیدشده ({reviewsDue.length})
          </p>
          <p className="mb-2 text-[10px] text-muted">دوره بازبینی بر اساس سطح ریسک: بحرانی/زیاد هر ۱۴ روز، متوسط هر ۳۰ روز، کم هر ۶۰ روز</p>
          {reviewsDue.length === 0 ? (
            <p className="text-[11px] text-muted">بازبینی سررسیدشده‌ای نیست</p>
          ) : (
            <div className="space-y-1.5">
              {reviewsDue.map((r) => (
                <button
                  key={r.risk.id}
                  onClick={() => setSelectedRiskId(r.risk.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-white/5 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="num text-muted">{r.risk.code}</span>
                    <span className="font-medium">{r.risk.title}</span>
                  </span>
                  <span className="num rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] text-blue-300">
                    {r.neverReviewed ? 'هرگز بازبینی نشده' : `${r.daysSinceLastReview} روز از آخرین بازبینی`} — سررسید {r.cadenceDays} روز
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold">
            <AlertTriangle size={15} className="text-red-400" /> هشدار زودهنگام — روند و مسیر ریسک ({earlyWarnings.length})
          </p>
          {earlyWarnings.length === 0 ? (
            <p className="text-[11px] text-muted">هشدار روندی فعال نیست</p>
          ) : (
            <div className="space-y-1.5">
              {earlyWarnings.map((w, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedRiskId(w.risk.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right text-xs hover:bg-white/5 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="num text-muted">{w.risk.code}</span>
                    <span className="font-medium">{w.risk.title}</span>
                  </span>
                  <span className="text-[10px] text-red-300">{w.reason}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedRisk && <RiskDetailModal project={project} risk={selectedRisk} onClose={() => setSelectedRiskId(null)} />}
    </div>
  )
}
