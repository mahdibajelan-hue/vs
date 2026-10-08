import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, HelpCircle, Loader2, Minus, ShieldAlert, TrendingUp } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { formatJalali } from '../../../lib/jalali'
import { formatLevel } from '../lib/competencyGap'
import { ACTION_STATUS_META, GAP_OUTCOME_META } from '../lib/developmentPlan'
import { StatusBadge } from './CompetencyGapAnalysis'
import type { CompReassessmentComparison, CompReassessmentSide, CompetencyAssessment } from '../types'

/**
 * «مقایسه با ارزیابی قبلی» (Phase 5) — shown on the results of a reassessment: per competency, the
 * predecessor's vs this assessment's level/status (comp_get_reassessment_comparison), the delta with
 * an up/down arrow, the gap outcome and how the predecessor's development actions ended. A side
 * with INSUFFICIENT_EVIDENCE is always "unknown" — never shown as a decline.
 */
export function ReassessmentComparison({ assessment, onOpenPrevious }: { assessment: CompetencyAssessment; onOpenPrevious: (id: string) => void }) {
  const fetchReassessmentComparison = useCompetencyStore((s) => s.fetchReassessmentComparison)
  // Refetch whenever this candidate's profile is recomputed (the results page recomputes on visit).
  const computedAt = useCompetencyStore((s) =>
    (s.competencyProfileByAssessment[assessment.id]?.scores ?? []).reduce<string>((max, sc) => (sc.computedAt > max ? sc.computedAt : max), ''),
  )
  const [data, setData] = useState<CompReassessmentComparison | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchReassessmentComparison(assessment.id).then((d) => {
      if (!active) return
      setData(d)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [assessment.id, computedAt, fetchReassessmentComparison])

  if (loading) {
    return (
      <div className="glass-panel flex items-center gap-1.5 rounded-2xl p-4 text-[11px] text-muted">
        <Loader2 size={13} className="animate-spin" /> در حال بارگذاری مقایسه…
      </div>
    )
  }
  if (!data) {
    return <div className="glass-panel rounded-2xl p-4 text-center text-[11px] text-muted">مقایسه با ارزیابی قبلی در دسترس نیست.</div>
  }

  const s = data.summary
  const previousMissing = data.competencies.every((c) => c.previous == null)

  return (
    <div className="space-y-3">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3.5 text-[11px]">
        <span className="text-muted">
          ارزیابی قبلی: <span className="num font-bold text-secondary">{formatJalali(data.previousInterviewDate)}</span> ← ارزیابی فعلی:{' '}
          <span className="num font-bold text-secondary">{formatJalali(data.currentInterviewDate)}</span>
          {data.plan && (
            <span>
              {' '}
              · برنامه توسعه: <span className="num font-bold text-teal-200">{data.plan.actionsDone.toLocaleString('fa-IR')}</span> از{' '}
              {data.plan.actionsTotal.toLocaleString('fa-IR')} اقدام انجام شد
            </span>
          )}
        </span>
        <button
          onClick={() => onOpenPrevious(data.previousAssessmentId)}
          className="flex items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[10.5px] font-bold text-sky-200 hover:bg-sky-500/20"
        >
          <ExternalLink size={11} /> نتایج ارزیابی قبلی
        </button>
      </div>

      {previousMissing && (
        <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-2.5 text-[10.5px] text-amber-200">
          پروفایل شایستگی ارزیابی قبلی محاسبه نشده است — صفحه نتایج آن را یک بار باز کنید تا مقایسه کامل شود.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile icon={ShieldAlert} color="#f87171" label="شکاف‌ها (قبل ← بعد)" value={`${s.gapsBefore.toLocaleString('fa-IR')} ← ${s.gapsAfter.toLocaleString('fa-IR')}`} />
        <Tile icon={CheckCircle2} color="#34d399" label="شکاف‌های بسته‌شده" value={s.closed.toLocaleString('fa-IR')} hint={s.narrowed > 0 ? `+${s.narrowed.toLocaleString('fa-IR')} کاهش‌یافته` : undefined} />
        <Tile
          icon={TrendingUp}
          color="#38bdf8"
          label="بهبود / افت سطح"
          value={`${s.improved.toLocaleString('fa-IR')} / ${s.declined.toLocaleString('fa-IR')}`}
          hint={`از ${s.comparable.toLocaleString('fa-IR')} شایستگی قابل مقایسه`}
        />
        <Tile icon={HelpCircle} color="#94a3b8" label="نامعلوم (شواهد ناکافی)" value={s.unknown.toLocaleString('fa-IR')} dashed />
      </div>

      <div className="glass-panel overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[720px] text-right text-[11px]">
          <thead>
            <tr className="border-b border-white/10 text-[10px] text-muted">
              <th className="px-3 py-2.5 font-bold">شایستگی</th>
              <th className="px-2 py-2.5 text-center font-bold">الزامی</th>
              <th className="px-2 py-2.5 font-bold">ارزیابی قبلی</th>
              <th className="px-2 py-2.5 font-bold">ارزیابی فعلی</th>
              <th className="px-2 py-2.5 text-center font-bold">تغییر سطح</th>
              <th className="px-2 py-2.5 font-bold">نتیجه شکاف</th>
              <th className="px-3 py-2.5 font-bold">اقدامات توسعه</th>
            </tr>
          </thead>
          <tbody>
            {data.competencies.map((c) => {
              const outcome = GAP_OUTCOME_META[c.gapOutcome]
              return (
                <tr key={c.competencyId} className="border-b border-white/5 align-top">
                  <td className="px-3 py-2.5 font-bold">
                    {c.labelFa} {c.isCritical && <span className="text-amber-300">★</span>}
                  </td>
                  <td className="num px-2 py-2.5 text-center">{formatLevel(c.requiredLevel)}</td>
                  <td className="px-2 py-2.5">
                    <SideCell side={c.previous} />
                  </td>
                  <td className="px-2 py-2.5">
                    <SideCell side={c.current} />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <DeltaCell delta={c.levelDelta} scoreDelta={c.scoreDelta} />
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${outcome.color}1c`, color: outcome.color }}>
                      {outcome.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {c.actions.total === 0 ? (
                      <span className="text-[10px] text-muted">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        <span className="num text-[10.5px] font-bold text-teal-200">
                          {c.actions.done.toLocaleString('fa-IR')} از {c.actions.total.toLocaleString('fa-IR')} انجام شد
                        </span>
                        {c.actions.items.map((a) => (
                          <p key={a.id} className="flex items-center gap-1 text-[9.5px] text-muted">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ACTION_STATUS_META[a.status].color }} />
                            <span className="truncate">{a.title}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[9.5px] leading-5 text-muted">
        تغییر سطح فقط وقتی نمایش داده می‌شود که هر دو ارزیابی برای آن شایستگی شواهد داشته باشند؛ «نامعلوم» یعنی در یکی از دو ارزیابی شواهد کافی ثبت نشده و نباید
        آن را بهبود یا افت تلقی کرد. «شکاف‌های بسته‌شده با اقدام انجام‌شده»: {s.closedWithDoneActions.toLocaleString('fa-IR')}.
      </p>
    </div>
  )
}

function SideCell({ side }: { side: CompReassessmentSide | null }) {
  if (!side) return <span className="text-[10px] italic text-muted">ارزیابی نشده</span>
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="num text-[11.5px] font-bold">{side.actualLevel != null ? formatLevel(side.actualLevel) : <span className="text-[10px] font-normal italic text-muted">نامعلوم</span>}</span>
      <StatusBadge status={side.status} />
    </span>
  )
}

function DeltaCell({ delta, scoreDelta }: { delta: number | null; scoreDelta: number | null }) {
  if (delta == null) return <span className="text-[10px] italic text-muted">نامعلوم</span>
  const title = scoreDelta != null ? `تغییر امتیاز: ${scoreDelta > 0 ? '+' : ''}${scoreDelta.toLocaleString('fa-IR')}` : undefined
  if (delta > 0)
    return (
      <span title={title} className="num inline-flex items-center gap-0.5 font-bold text-emerald-300">
        <ArrowUp size={13} /> {formatLevel(delta)}+
      </span>
    )
  if (delta < 0)
    return (
      <span title={title} className="num inline-flex items-center gap-0.5 font-bold text-red-300">
        <ArrowDown size={13} /> {formatLevel(-delta)}−
      </span>
    )
  return (
    <span title={title} className="inline-flex items-center gap-0.5 text-muted">
      <Minus size={13} /> ۰
    </span>
  )
}

function Tile({ icon: Icon, color, label, value, hint, dashed }: { icon: typeof Minus; color: string; label: string; value: string; hint?: string; dashed?: boolean }) {
  return (
    <div className={`glass-panel rounded-2xl border p-3 text-center ${dashed ? 'border-dashed' : ''}`} style={{ borderColor: `${color}40`, background: `linear-gradient(160deg, ${color}14, transparent 70%)` }}>
      <Icon size={14} className="mx-auto mb-1" style={{ color }} />
      <p className="num text-lg font-black leading-none" style={{ color }}>
        {value}
      </p>
      <p className="mt-1 text-[10px] font-bold text-secondary">{label}</p>
      {hint && <p className="text-[9px] text-muted">{hint}</p>}
    </div>
  )
}
