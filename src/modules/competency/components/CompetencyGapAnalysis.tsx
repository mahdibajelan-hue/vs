import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpDown, CheckCircle2, ChevronLeft, HelpCircle, Layers, Loader2, RefreshCw, ShieldAlert, Target, TrendingDown, Trophy } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import {
  ASSESSMENT_METHOD_LABEL_FA,
  EVIDENCE_SOURCE_CHIP,
  GAP_CONFIDENCE_META,
  GAP_STATUS_META,
  buildGapRows,
  formatLevel,
  formatPercent,
  isConfidentStrength,
  isCriticalGap,
  isDevelopmentGap,
  sortGapRows,
  summarizeGapAnalysis,
  type AssessmentMethodKey,
  type GapRow,
  type GapSortKey,
} from '../lib/competencyGap'
import { CompetencyEvidenceDrawer } from './CompetencyEvidenceDrawer'
import type { CompCompetencyStatus, CompEvidenceSourceType, CompetencyAssessment } from '../types'

const SORT_LABEL: Record<GapSortKey, string> = {
  severity: 'شدت وضعیت',
  gap: 'اندازه شکاف',
  criticality: 'حیاتی‌بودن',
  name: 'نام شایستگی',
}

const STATUS_FILTERS: (CompCompetencyStatus | 'ALL')[] = ['ALL', 'CRITICAL_GAP', 'GAP', 'INSUFFICIENT_EVIDENCE', 'MEETS', 'EXCEEDS']

interface CompetencyGapAnalysisProps {
  assessment: CompetencyAssessment
  /** Lead / assessment designer who may re-run comp_compute_competency_profile. */
  canRecompute: boolean
}

/**
 * Candidate 360 competency gap analysis (Phase 4) — the job's required competencies against the
 * Competency Engine's evidence-backed actual levels, with a summary header, a sortable/filterable
 * gap table (cards on small screens), strengths / development / critical lists, and a
 * Candidate → Competency → Evidence → Assessment Item drill-down (CompetencyEvidenceDrawer).
 * INSUFFICIENT_EVIDENCE is always rendered as "unknown", never as a low score.
 */
export function CompetencyGapAnalysis({ assessment, canRecompute }: CompetencyGapAnalysisProps) {
  const profile = useCompetencyStore((s) => s.competencyProfileByAssessment[assessment.id])
  const fetchCompetencyProfile = useCompetencyStore((s) => s.fetchCompetencyProfile)
  const computeCompetencyProfile = useCompetencyStore((s) => s.computeCompetencyProfile)
  const competencies = useCompetencyStore((s) => s.competencies)
  const fetchCompetencies = useCompetencyStore((s) => s.fetchCompetencies)
  const [recomputing, setRecomputing] = useState(false)
  const [sortKey, setSortKey] = useState<GapSortKey>('severity')
  const [statusFilter, setStatusFilter] = useState<CompCompetencyStatus | 'ALL'>('ALL')
  const [openCompetencyId, setOpenCompetencyId] = useState<string | null>(null)

  useEffect(() => {
    if (competencies.length === 0) fetchCompetencies()
    if (!profile) fetchCompetencyProfile(assessment.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment.id])

  const rows = useMemo(() => buildGapRows(profile?.scores ?? [], profile?.evidence ?? [], competencies), [profile, competencies])
  const summary = useMemo(() => summarizeGapAnalysis(profile?.scores ?? [], assessment), [profile, assessment])
  const visibleRows = useMemo(
    () => sortGapRows(statusFilter === 'ALL' ? rows : rows.filter((r) => r.score.status === statusFilter), sortKey),
    [rows, statusFilter, sortKey],
  )
  const lastComputedAt = profile?.scores.reduce<string | null>((max, s) => (!max || s.computedAt > max ? s.computedAt : max), null) ?? null

  const handleRecompute = async () => {
    setRecomputing(true)
    await computeCompetencyProfile(assessment.id)
    setRecomputing(false)
  }

  const recomputeButton = canRecompute && (
    <button
      onClick={handleRecompute}
      disabled={recomputing}
      className="flex items-center gap-1.5 rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-[11px] font-bold text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
    >
      {recomputing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} {recomputing ? 'در حال محاسبه…' : 'محاسبه مجدد'}
    </button>
  )

  if (!profile || rows.length === 0) {
    return (
      <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl p-5 text-center text-[11px] text-muted">
        {!profile ? (
          <span className="flex items-center gap-1.5">
            <Loader2 size={13} className="animate-spin" /> در حال بارگذاری تحلیل شکاف شایستگی…
          </span>
        ) : (
          <span>برای شغل این متقاضی هنوز شایستگی الزامی تعریف نشده یا پروفایل شایستگی او محاسبه نشده است.</span>
        )}
        {recomputeButton}
      </div>
    )
  }

  const strengths = sortGapRows(rows.filter((r) => isConfidentStrength(r.score)), 'severity').reverse()
  const developmentGaps = sortGapRows(rows.filter((r) => isDevelopmentGap(r.score)), 'gap')
  const criticalGaps = sortGapRows(rows.filter((r) => isCriticalGap(r.score)), 'gap')

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.35fr_1fr]">
        <div
          className="glass-panel flex flex-col justify-between gap-2 rounded-2xl border p-4"
          style={{ borderColor: `${summary.fitColor}40`, background: `linear-gradient(160deg, ${summary.fitColor}14, transparent 65%)` }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <Target size={14} style={{ color: summary.fitColor }} /> آمادگی برای الزامات شغل
            </p>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] text-muted" title="برآوردی مشتق‌شده از امتیازهای موتور شایستگی — نه یک امتیاز مستقل">
              شاخص مشتق‌شده
            </span>
          </div>
          <p className="num text-3xl font-black" style={{ color: summary.fitColor }}>
            {summary.readinessPercent != null ? `٪${summary.readinessPercent.toLocaleString('fa-IR')}` : '—'}
          </p>
          <p className="text-[11px] font-bold" style={{ color: summary.fitColor }}>
            {summary.fitLabel}
          </p>
          <p className="text-[9.5px] leading-5 text-muted">
            میانگین وزنی نسبت سطح واقعی به سطح الزامی (شایستگی‌های حیاتی با وزن دوبرابر)، فقط روی شایستگی‌های دارای شواهد — بر پایه{' '}
            {formatPercent(summary.readinessBasisShare)} از وزن الزامات این شغل.
          </p>
        </div>

        <div className="glass-panel grid grid-cols-2 gap-2 rounded-2xl p-3 sm:grid-cols-4">
          <SummaryTile icon={Trophy} color="#34d399" label="نقاط قوت" value={summary.strengths} hint={summary.tentativeStrengths > 0 ? `+${summary.tentativeStrengths.toLocaleString('fa-IR')} با اطمینان کم` : undefined} />
          <SummaryTile icon={TrendingDown} color="#fbbf24" label="شکاف توسعه‌ای" value={summary.developmentGaps} />
          <SummaryTile icon={ShieldAlert} color="#f87171" label="شکاف حیاتی" value={summary.criticalGaps} />
          <SummaryTile icon={HelpCircle} color="#94a3b8" label="شواهد ناکافی" value={summary.insufficientEvidence} dashed />
          <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 sm:col-span-4">
            <span className="text-[10.5px] text-muted">اطمینان کلی شواهد (مشتق‌شده)</span>
            <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-bold" style={{ background: `${GAP_CONFIDENCE_META[summary.overallConfidence].color}1f`, color: GAP_CONFIDENCE_META[summary.overallConfidence].color }}>
              {GAP_CONFIDENCE_META[summary.overallConfidence].label}
            </span>
          </div>
        </div>

        <div className="glass-panel space-y-2 rounded-2xl p-4">
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <Layers size={14} className="text-sky-300" /> پوشش ارزیابی
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ASSESSMENT_METHOD_LABEL_FA) as AssessmentMethodKey[]).map((m) => (
              <span
                key={m}
                title={summary.methods[m] ? 'در طرح آزمون این متقاضی' : 'خارج از طرح آزمون (ارزیابی‌نشده به انتخاب طراح — نه کمبود شواهد)'}
                className={`rounded-full border px-2 py-0.5 text-[10px] ${summary.methods[m] ? 'border-sky-400/30 bg-sky-500/10 text-sky-200' : 'border-dashed border-white/15 text-muted line-through'}`}
              >
                {ASSESSMENT_METHOD_LABEL_FA[m]}
              </span>
            ))}
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[10.5px]">
              <span className="text-muted">شایستگی‌های الزامی دارای شواهد</span>
              <span className="num font-bold text-sky-200">
                {summary.competenciesWithEvidence.toLocaleString('fa-IR')} از {summary.total.toLocaleString('fa-IR')} ({formatPercent(summary.evidenceCoverageShare)})
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-sky-400" style={{ width: `${summary.evidenceCoverageShare * 100}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[9.5px] text-muted">{lastComputedAt ? `آخرین محاسبه: ${new Date(lastComputedAt).toLocaleString('fa-IR')}` : ''}</span>
            {recomputeButton}
          </div>
        </div>
      </div>

      {/* Filters + sort */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const count = f === 'ALL' ? rows.length : rows.filter((r) => r.score.status === f).length
            const active = statusFilter === f
            const color = f === 'ALL' ? '#a855f7' : GAP_STATUS_META[f].color
            return (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                disabled={count === 0 && f !== 'ALL'}
                className={`rounded-full border px-2.5 py-1 text-[10.5px] font-bold transition-colors disabled:opacity-35 ${active ? '' : 'border-white/10 text-secondary hover:bg-white/5'}`}
                style={active ? { borderColor: `${color}80`, background: `${color}26`, color } : undefined}
              >
                {f === 'ALL' ? 'همه' : GAP_STATUS_META[f].label} <span className="num">({count.toLocaleString('fa-IR')})</span>
              </button>
            )
          })}
        </div>
        <label className="flex items-center gap-1.5 text-[10.5px] text-muted">
          <ArrowUpDown size={12} /> مرتب‌سازی:
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as GapSortKey)} className="input py-1 text-[11px]">
            {(Object.keys(SORT_LABEL) as GapSortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Desktop table */}
      <div className="glass-panel hidden overflow-x-auto rounded-2xl md:block">
        <table className="w-full text-right text-[11px]">
          <thead>
            <tr className="border-b border-white/10 text-[10px] text-muted">
              <th className="px-3 py-2.5 font-bold">شایستگی</th>
              <th className="px-2 py-2.5 text-center font-bold">سطح الزامی</th>
              <th className="px-2 py-2.5 text-center font-bold">سطح واقعی</th>
              <th className="px-2 py-2.5 text-center font-bold">شکاف</th>
              <th className="px-2 py-2.5 text-center font-bold">حیاتی‌بودن</th>
              <th className="px-2 py-2.5 text-center font-bold">اطمینان شواهد</th>
              <th className="px-2 py-2.5 font-bold">شواهد پشتیبان</th>
              <th className="px-3 py-2.5 font-bold">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const insufficient = row.score.status === 'INSUFFICIENT_EVIDENCE'
              return (
                <tr
                  key={row.competencyId}
                  onClick={() => setOpenCompetencyId(row.competencyId)}
                  className={`cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.04]`}
                  style={insufficient ? { backgroundImage: 'repeating-linear-gradient(135deg, rgba(148,163,184,0.06) 0 6px, transparent 6px 12px)' } : undefined}
                >
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1 font-bold">
                      {row.labelFa} <ChevronLeft size={12} className="text-muted" />
                    </span>
                  </td>
                  <td className="num px-2 py-2.5 text-center">{formatLevel(row.score.requiredLevel)}</td>
                  <td className="px-2 py-2.5 text-center">
                    <ActualLevelCell row={row} />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <GapCell gap={row.score.gap} />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <CriticalityBadge isCritical={row.score.isCritical} />
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <ConfidenceBadge confidence={row.score.confidence} coverage={row.score.coverage} />
                  </td>
                  <td className="px-2 py-2.5">
                    <EvidenceChips row={row} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={row.score.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {visibleRows.map((row) => {
          const insufficient = row.score.status === 'INSUFFICIENT_EVIDENCE'
          return (
            <button
              key={row.competencyId}
              onClick={() => setOpenCompetencyId(row.competencyId)}
              className={`glass-panel w-full rounded-2xl border p-3 text-right ${insufficient ? 'border-dashed border-slate-400/30' : 'border-white/10'}`}
              style={insufficient ? { backgroundImage: 'repeating-linear-gradient(135deg, rgba(148,163,184,0.06) 0 6px, transparent 6px 12px)' } : undefined}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="flex items-center gap-1 text-[11.5px] font-bold">
                  {row.labelFa} {row.score.isCritical && <span className="text-amber-300" title="حیاتی">★</span>}
                </span>
                <StatusBadge status={row.score.status} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="rounded-lg bg-white/[0.03] p-1.5">
                  <p className="text-muted">الزامی</p>
                  <p className="num text-[12px] font-bold">{formatLevel(row.score.requiredLevel)}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] p-1.5">
                  <p className="text-muted">واقعی</p>
                  <ActualLevelCell row={row} />
                </div>
                <div className="rounded-lg bg-white/[0.03] p-1.5">
                  <p className="text-muted">شکاف</p>
                  <GapCell gap={row.score.gap} />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <EvidenceChips row={row} />
                <ConfidenceBadge confidence={row.score.confidence} coverage={row.score.coverage} />
              </div>
            </button>
          )
        })}
      </div>

      <p className="text-[9.5px] leading-5 text-muted">
        «شواهد ناکافی» یعنی هنوز داده‌ای برای سنجش این شایستگی ثبت نشده — این به معنای ضعف متقاضی نیست و در شاخص آمادگی لحاظ نمی‌شود. برای مشاهده شواهد و
        سؤالات پشتوانه هر شایستگی روی آن کلیک کنید.
      </p>

      {/* Three lists */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <GapList
          icon={Trophy}
          color="#34d399"
          title="نقاط قوت"
          subtitle="مطابق یا فراتر از الزام، با اطمینان متوسط یا بالا"
          rows={strengths}
          empty="هنوز نقطه قوتی با پشتوانه کافی شواهد ثبت نشده است."
          onOpen={setOpenCompetencyId}
          metric={(r) => `${formatLevel(r.score.actualLevel)} / ${formatLevel(r.score.requiredLevel)}`}
        />
        <GapList
          icon={TrendingDown}
          color="#fbbf24"
          title="شکاف‌های توسعه‌ای"
          subtitle="زیر سطح الزامی در شایستگی‌های غیرحیاتی"
          rows={developmentGaps}
          empty="شکاف توسعه‌ای مشاهده نشد."
          onOpen={setOpenCompetencyId}
          metric={(r) => `کمبود ${formatLevel(r.score.gap)}`}
        />
        <GapList
          icon={AlertTriangle}
          color="#f87171"
          title="شکاف‌های حیاتی"
          subtitle="زیر سطح الزامی در شایستگی‌های حیاتی شغل"
          rows={criticalGaps}
          empty="شکاف حیاتی مشاهده نشد."
          onOpen={setOpenCompetencyId}
          metric={(r) => `کمبود ${formatLevel(r.score.gap)}`}
        />
      </div>

      {openCompetencyId && (
        <CompetencyEvidenceDrawer assessmentId={assessment.id} competencyId={openCompetencyId} onClose={() => setOpenCompetencyId(null)} />
      )}
    </div>
  )
}

function SummaryTile({ icon: Icon, color, label, value, hint, dashed }: { icon: typeof Trophy; color: string; label: string; value: number; hint?: string; dashed?: boolean }) {
  return (
    <div className={`rounded-xl border p-2.5 text-center ${dashed ? 'border-dashed' : ''}`} style={{ borderColor: `${color}40`, background: `linear-gradient(160deg, ${color}14, transparent 70%)` }}>
      <Icon size={14} className="mx-auto mb-1" style={{ color }} />
      <p className="num text-xl font-black leading-none" style={{ color }}>
        {value.toLocaleString('fa-IR')}
      </p>
      <p className="mt-1 text-[10px] font-bold text-secondary">{label}</p>
      {hint && <p className="text-[9px] text-muted">{hint}</p>}
    </div>
  )
}

export function StatusBadge({ status }: { status: CompCompetencyStatus }) {
  const meta = GAP_STATUS_META[status]
  const insufficient = status === 'INSUFFICIENT_EVIDENCE'
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold ${insufficient ? 'border-dashed' : ''}`}
      style={{ borderColor: `${meta.color}55`, background: insufficient ? 'transparent' : `${meta.color}1c`, color: meta.color }}
    >
      {insufficient ? <HelpCircle size={11} /> : status === 'MEETS' || status === 'EXCEEDS' ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
      {meta.label}
    </span>
  )
}

function ActualLevelCell({ row }: { row: GapRow }) {
  if (row.score.actualLevel == null) {
    return <span className="text-[10px] italic text-muted">نامعلوم</span>
  }
  const color = GAP_STATUS_META[row.score.status].color
  return (
    <span className="num text-[12px] font-bold" style={{ color }} title={row.score.actualScore != null ? `امتیاز ${row.score.actualScore.toLocaleString('fa-IR')} از ۱۰۰` : undefined}>
      {formatLevel(row.score.actualLevel)}
    </span>
  )
}

function GapCell({ gap }: { gap: number | null }) {
  if (gap == null) return <span className="text-[10px] italic text-muted">نامعلوم</span>
  if (gap > 0) return <span className="num text-[11px] font-bold text-red-300">{formatLevel(gap)} کمبود</span>
  if (gap < 0) return <span className="num text-[11px] font-bold text-emerald-300">{formatLevel(-gap)} مازاد</span>
  return <span className="text-[10.5px] text-emerald-300">بدون شکاف</span>
}

function CriticalityBadge({ isCritical }: { isCritical: boolean }) {
  return isCritical ? (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">★ حیاتی</span>
  ) : (
    <span className="text-[10px] text-muted">عادی</span>
  )
}

export function ConfidenceBadge({ confidence, coverage }: { confidence: keyof typeof GAP_CONFIDENCE_META; coverage?: number }) {
  const meta = GAP_CONFIDENCE_META[confidence]
  return (
    <span className="inline-flex flex-col items-center leading-tight" title={coverage != null ? `پوشش منابع شواهد: ${formatPercent(coverage)}` : undefined}>
      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${meta.color}1c`, color: meta.color }}>
        {meta.label}
      </span>
      {coverage != null && confidence !== 'NONE' && <span className="num text-[9px] text-muted">پوشش {formatPercent(coverage)}</span>}
    </span>
  )
}

function EvidenceChips({ row }: { row: GapRow }) {
  const entries = Object.entries(row.sourceCounts) as [CompEvidenceSourceType, number][]
  if (entries.length === 0) return <span className="text-[10px] italic text-muted">بدون شواهد</span>
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="num text-[10.5px] font-bold">{row.score.evidenceCount.toLocaleString('fa-IR')}</span>
      {entries.map(([type, count]) => (
        <span
          key={type}
          className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
          style={{ background: `${EVIDENCE_SOURCE_CHIP[type].color}1f`, color: EVIDENCE_SOURCE_CHIP[type].color }}
        >
          {EVIDENCE_SOURCE_CHIP[type].label} <span className="num">{count.toLocaleString('fa-IR')}</span>
        </span>
      ))}
    </span>
  )
}

function GapList({
  icon: Icon,
  color,
  title,
  subtitle,
  rows,
  empty,
  onOpen,
  metric,
}: {
  icon: typeof Trophy
  color: string
  title: string
  subtitle: string
  rows: GapRow[]
  empty: string
  onOpen: (competencyId: string) => void
  metric: (row: GapRow) => string
}) {
  return (
    <div className="glass-panel rounded-2xl border p-3.5" style={{ borderColor: `${color}30` }}>
      <p className="flex items-center gap-1.5 text-xs font-bold" style={{ color }}>
        <Icon size={13} /> {title} <span className="num text-muted">({rows.length.toLocaleString('fa-IR')})</span>
      </p>
      <p className="mb-2 text-[9.5px] text-muted">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="py-2 text-[10.5px] text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.competencyId}>
              <button onClick={() => onOpen(r.competencyId)} className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-right text-[11px] hover:bg-white/[0.04]">
                <span className="flex items-center gap-1 text-secondary">
                  {r.labelFa} {r.score.isCritical && <span className="text-amber-300">★</span>}
                </span>
                <span className="num shrink-0 text-[10px] font-bold" style={{ color }}>
                  {metric(r)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
