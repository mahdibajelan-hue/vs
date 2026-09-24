import { AlertTriangle, CheckCircle2, Gauge, TrendingDown, TrendingUp } from 'lucide-react'
import { useCompetencyStore } from '../../competency/store/useCompetencyStore'
import { jobRoleLabel } from '../../competency/lib/competencyData'
import type { JobRole } from '../../competency/types'
import type { RoleAlignmentResult, RoleAlignmentRow, RoleAlignmentStatus } from '../lib/roleAlignment'

const STATUS_META: Record<RoleAlignmentStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  MEETS_CRITICAL: { label: 'برآورده — الزام حیاتی', color: '#34d399', icon: CheckCircle2 },
  MEETS: { label: 'برآورده', color: '#34d399', icon: CheckCircle2 },
  BELOW_PREFERRED: { label: 'کمی زیر بازه ترجیحی', color: '#fbbf24', icon: TrendingDown },
  BELOW_MIN: { label: 'زیر حداقل الزام', color: '#f87171', icon: AlertTriangle },
  ABOVE_PREFERRED: { label: 'بالاتر از بازه ترجیحی', color: '#38bdf8', icon: TrendingUp },
  NO_DATA: { label: 'بدون شواهد کافی', color: '#6b7280', icon: Gauge },
}

function overallVerdict(percent: number | null, criticalGapCount: number): { label: string; color: string } {
  if (percent == null) return { label: 'داده کافی برای تعیین تطابق وجود ندارد', color: '#6b7280' }
  if (criticalGapCount > 0) return { label: 'نیازمند بررسی دقیق — کمبود در الزامات حیاتی', color: '#f87171' }
  if (percent >= 80) return { label: 'تطابق قوی با الزامات رفتاری شغل', color: '#34d399' }
  if (percent >= 60) return { label: 'تطابق متوسط با الزامات رفتاری شغل', color: '#fbbf24' }
  return { label: 'تطابق ضعیف — نیازمند بررسی بیشتر', color: '#f87171' }
}

/**
 * The "تحلیل جامع ارتباط با الزامات شغل" centerpiece requested for the personality results view:
 * a deterministic, always-available (no AI dependency) side-by-side of the candidate's actual
 * behavioral-dimension scores against the target job's own required profile
 * (personality_job_behavioral_requirements) — see computeRoleAlignment. Gemini's own role-fit
 * narrative (rendered separately, right below this) is computed FROM these same rows, so the two
 * never contradict each other.
 */
export function RoleAlignmentCard({ jobRole, hasProfile, alignment }: { jobRole: JobRole; hasProfile: boolean; alignment: RoleAlignmentResult }) {
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const roleLabel = jobRoleLabel(jobRoleConfigs, jobRole)

  if (!hasProfile) {
    return (
      <div className="glass-panel rounded-2xl border border-white/10 p-4 text-[11px] text-muted">
        هنوز نیم‌رخ رفتاری شغلی برای «{roleLabel}» تعریف نشده است — تحلیل تطابق با الزامات شغل پس از تعریف آن در داده‌های پایه ماژول در دسترس خواهد بود.
      </div>
    )
  }

  const verdict = overallVerdict(alignment.overallAlignmentPercent, alignment.criticalGapCount)

  return (
    <div className="glass-panel rounded-2xl border border-white/10 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Gauge size={15} className="text-sky-300" /> تطابق با الزامات رفتاری شغل «{roleLabel}»
        </p>
        {alignment.overallAlignmentPercent != null && (
          <span className="num rounded-full px-3 py-1 text-sm font-extrabold" style={{ background: `${verdict.color}20`, color: verdict.color }}>
            ٪{alignment.overallAlignmentPercent.toLocaleString('fa-IR')}
          </span>
        )}
      </div>
      <p className="mb-3 text-[11.5px] font-bold" style={{ color: verdict.color }}>
        {verdict.label}
      </p>
      <div className="space-y-2">
        {alignment.rows.map((row) => (
          <AlignmentRow key={row.requirementId} row={row} />
        ))}
      </div>
    </div>
  )
}

function AlignmentRow({ row }: { row: RoleAlignmentRow }) {
  const meta = STATUS_META[row.status]
  const Icon = meta.icon
  const pct = Math.max(0, Math.min(100, row.score ?? 0))
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold">
          {row.dimensionLabelFa} {row.isCritical && <span title="الزام حیاتی برای این شغل" className="text-amber-300">★</span>}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-bold" style={{ color: meta.color }}>
          <Icon size={12} /> {meta.label}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
        {row.minThreshold != null && (
          <div className="absolute top-0 h-full w-px bg-white/50" style={{ right: `${100 - row.minThreshold}%` }} title={`حداقل الزام: ${row.minThreshold}`} />
        )}
      </div>
      <div className="num mt-1 flex justify-between text-[9.5px] text-muted">
        <span>{row.score != null ? `امتیاز متقاضی: ${Math.round(row.score).toLocaleString('fa-IR')}` : 'بدون شواهد'}</span>
        {row.minThreshold != null && <span>حداقل لازم: {row.minThreshold.toLocaleString('fa-IR')}</span>}
      </div>
    </div>
  )
}
