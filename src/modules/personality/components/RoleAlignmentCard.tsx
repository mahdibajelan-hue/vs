import { AlertTriangle, CheckCircle2, Gauge, TrendingDown, TrendingUp } from 'lucide-react'
import { useCompetencyStore } from '../../competency/store/useCompetencyStore'
import { jobRoleLabel } from '../../competency/lib/competencyData'
import { tone } from '../../competency/lib/tone'
import { RingChart } from '../../competency/components/DonutChart'
import type { JobRole } from '../../competency/types'
import { usePersonalityStore } from '../store/usePersonalityStore'
import { bilingual, dimensionFamily } from '../lib/bilingual'
import { overallVerdict, type RoleAlignmentResult, type RoleAlignmentRow, type RoleAlignmentStatus } from '../lib/roleAlignment'
import '../../competency/styles/farinTheme.css'

const STATUS_META: Record<RoleAlignmentStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  MEETS_CRITICAL: { label: 'برآورده — الزام حیاتی', color: '#10b981', icon: CheckCircle2 },
  MEETS: { label: 'برآورده', color: '#10b981', icon: CheckCircle2 },
  BELOW_PREFERRED: { label: 'کمی زیر بازه ترجیحی', color: '#f59e0b', icon: TrendingDown },
  BELOW_MIN: { label: 'زیر حداقل الزام', color: '#ef4444', icon: AlertTriangle },
  ABOVE_PREFERRED: { label: 'بالاتر از بازه ترجیحی', color: '#0ea5e9', icon: TrendingUp },
  NO_DATA: { label: 'بدون شواهد کافی', color: '#94a3b8', icon: Gauge },
}

/**
 * «تطابق با الزامات رفتاری شغل» — Role Alignment: a deterministic (no AI) side-by-side of the
 * candidate's behavioral-dimension scores against the job's required profile
 * (personality_job_behavioral_requirements, see computeRoleAlignment). Labels are bilingual
 * «English (فارسی)»; the bar shows the minimum (solid tick) and the preferred band (shaded).
 */
export function RoleAlignmentCard({ jobRole, hasProfile, alignment }: { jobRole: JobRole; hasProfile: boolean; alignment: RoleAlignmentResult }) {
  const jobRoleConfigs = useCompetencyStore((s) => s.jobRoleConfigs)
  const dimensions = usePersonalityStore((s) => s.dimensions)
  const roleLabel = jobRoleLabel(jobRoleConfigs, jobRole)

  if (!hasProfile) {
    return (
      <div className="fx fx-card fx-muted p-4 text-[12px]">
        هنوز نیم‌رخ رفتاری شغلی برای «{roleLabel}» تعریف نشده است — تحلیل تطابق با الزامات شغل پس از تعریف آن در داده‌های پایه ماژول در دسترس خواهد بود.
      </div>
    )
  }

  const verdict = overallVerdict(alignment.overallAlignmentPercent, alignment.criticalGapCount)
  const met = alignment.rows.filter((r) => r.status === 'MEETS' || r.status === 'MEETS_CRITICAL').length
  const pct = alignment.overallAlignmentPercent

  return (
    <div className="fx fx-card p-4 sm:p-5">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <RingChart value={pct} color={verdict.color} size={96} strokeWidth={11} label="تطابق شغلی" className="self-center">
          <span className="num fx-tone-text text-xl font-black" style={tone(verdict.color)}>
            {pct != null ? `٪${pct.toLocaleString('fa-IR')}` : '—'}
          </span>
          <span className="fx-muted text-[9.5px]">Role Fit</span>
        </RingChart>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[14px] font-extrabold">
            <Gauge size={16} style={{ color: '#0ea5e9' }} /> Role Alignment (تطابق با الزامات رفتاری شغل «{roleLabel}»)
          </p>
          <p className="mt-1.5 text-[12.5px] font-bold" style={tone(verdict.color)}>
            <span className="fx-tone-text">{verdict.label}</span>
          </p>
          <p className="fx-muted num mt-1 text-[11px]">
            {met.toLocaleString('fa-IR')} از {alignment.rows.length.toLocaleString('fa-IR')} الزام برآورده
            {alignment.criticalGapCount > 0 && `، ${alignment.criticalGapCount.toLocaleString('fa-IR')} کمبود در الزام حیاتی`}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {alignment.rows.map((row) => (
          <AlignmentRow key={row.requirementId} row={row} labelEn={dimensions.find((d) => d.id === row.dimensionId)?.labelEn} />
        ))}
      </div>
      <p className="fx-muted mt-3 text-[10.5px]">خط تیره: حداقل الزام شغل؛ ناحیه روشن: بازه ترجیحی؛ ★ الزام حیاتی.</p>
    </div>
  )
}

function AlignmentRow({ row, labelEn }: { row: RoleAlignmentRow; labelEn?: string }) {
  const meta = STATUS_META[row.status]
  const Icon = meta.icon
  const label = bilingual('dimension', { key: row.dimensionKey, labelFa: row.dimensionLabelFa, labelEn })
  const fam = dimensionFamily(row.dimensionKey)
  return (
    <div className="fx-sub fx-accent-bar p-3" style={tone(fam.tone)}>
      <div className="mb-1.5 flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 text-[12px] font-bold leading-5">
          <span className="fx-tone-text" dir="ltr">
            {label.en}
          </span>{' '}
          <span className="fx-text-2 font-medium">({label.fa})</span>
          {row.isCritical && (
            <span title="الزام حیاتی برای این شغل" style={{ color: '#f59e0b' }}>
              {' '}
              ★
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold" style={tone(meta.color)}>
          <span className="fx-tone-bg fx-tone-text flex items-center gap-1 rounded-full px-2 py-0.5">
            <Icon size={12} /> {meta.label}
          </span>
        </span>
      </div>
      <ThresholdBar value={row.score} color={meta.color} min={row.minThreshold} preferredMin={row.preferredMin} preferredMax={row.preferredMax} />
      <div className="fx-muted num mt-1 flex justify-between text-[10.5px]">
        <span>{row.score != null ? `امتیاز: ${Math.round(row.score).toLocaleString('fa-IR')}` : 'بدون شواهد'}</span>
        {row.minThreshold != null && <span>حداقل لازم: {row.minThreshold.toLocaleString('fa-IR')}</span>}
      </div>
    </div>
  )
}

/** A 0-100 bar (fills from the right in RTL) with the job's minimum as a tick and the preferred
 * band shaded behind it. Positions are measured from the right edge, like the fill itself. */
export function ThresholdBar({
  value,
  color,
  min,
  preferredMin,
  preferredMax,
  height = 10,
}: {
  value: number | null
  color: string
  min?: number | null
  preferredMin?: number | null
  preferredMax?: number | null
  height?: number
}) {
  const pct = Math.max(0, Math.min(100, value ?? 0))
  const bandFrom = preferredMin ?? (preferredMax != null ? min ?? 0 : null)
  const bandTo = preferredMax ?? (preferredMin != null ? 100 : null)
  return (
    <div className="fx-track relative overflow-hidden rounded-full" style={{ height }}>
      {bandFrom != null && bandTo != null && (
        <div className="absolute inset-y-0" style={{ right: `${bandFrom}%`, width: `${Math.max(0, bandTo - bandFrom)}%`, background: 'color-mix(in srgb, #10b981 18%, transparent)' }} />
      )}
      <div
        className="absolute inset-y-0 right-0 rounded-full transition-all"
        style={{ width: `${pct}%`, background: `linear-gradient(270deg, color-mix(in srgb, ${color} 55%, transparent), ${color})` }}
      />
      {min != null && <div className="absolute inset-y-0 w-[3px] rounded-full" style={{ right: `calc(${min}% - 1.5px)`, background: 'var(--text-primary)', opacity: 0.85 }} />}
    </div>
  )
}
