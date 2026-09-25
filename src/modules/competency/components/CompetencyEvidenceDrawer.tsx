import { useEffect, useState } from 'react'
import { Ban, ChevronDown, ChevronUp, FileSearch, Loader2, Lock, X } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { EVIDENCE_SOURCE_CHIP, formatLevel, formatPercent, GAP_STATUS_META } from '../lib/competencyGap'
import { ConfidenceBadge, StatusBadge } from './CompetencyGapAnalysis'
import { PERSONALITY_QUESTION_TYPE_LABEL_FA, type PersonalityQuestionType } from '../../personality/types'
import {
  COMP_EVIDENCE_SOURCE_TYPE_LABEL_FA,
  COMP_EXPERIENCE_METRIC_LABEL_FA,
  type CompCompetencyEvidenceDetail,
  type CompEvidenceDetailItem,
  type CompEvidenceDetailRow,
  type CompExperienceMetric,
} from '../types'

const fa = (n: number | null | undefined, digits = 1) => (n == null ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: digits }))

interface CompetencyEvidenceDrawerProps {
  assessmentId: string
  competencyId: string
  onClose: () => void
}

/**
 * The Candidate → Competency → Evidence → Assessment Item drill-down: every evidence row behind one
 * competency score (source, raw/normalized score, effective weight, contribution) and, beneath each,
 * the underlying assessment items it came from (read via comp_get_competency_evidence_detail).
 */
export function CompetencyEvidenceDrawer({ assessmentId, competencyId, onClose }: CompetencyEvidenceDrawerProps) {
  const fetchDetail = useCompetencyStore((s) => s.fetchCompetencyEvidenceDetail)
  const [detail, setDetail] = useState<CompCompetencyEvidenceDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setDetail(null)
    fetchDetail(assessmentId, competencyId).then((d) => {
      if (!active) return
      setDetail(d)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [assessmentId, competencyId, fetchDetail])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const score = detail?.score
  const levelLabel = (level: number | null | undefined) => {
    if (level == null || !detail) return null
    return detail.competency.proficiencyLevels.find((l) => l.level === Math.round(level))?.label_fa ?? null
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="glass-panel flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-none border-r border-white/10 bg-[#0f0a19]/95 sm:rounded-r-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] text-muted">
              <FileSearch size={12} /> متقاضی ← شایستگی ← شواهد ← آیتم ارزیابی
            </p>
            <p className="mt-0.5 truncate text-base font-extrabold">{detail?.competency.labelFa ?? '…'}</p>
            {detail?.competency.description && <p className="mt-1 text-[10.5px] leading-5 text-muted">{detail.competency.description}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-white/5" aria-label="بستن">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading && (
            <p className="flex items-center justify-center gap-1.5 py-10 text-[11px] text-muted">
              <Loader2 size={14} className="animate-spin" /> در حال بارگذاری شواهد…
            </p>
          )}
          {!loading && !detail && <p className="py-10 text-center text-[11px] text-muted">بارگذاری شواهد این شایستگی ممکن نشد.</p>}

          {detail && (
            <>
              {/* Score block */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="سطح الزامی" value={formatLevel(detail.requirement?.requiredLevel ?? score?.requiredLevel)} sub={levelLabel(detail.requirement?.requiredLevel ?? score?.requiredLevel)} />
                <Stat
                  label="سطح واقعی"
                  value={score?.actualLevel != null ? formatLevel(score.actualLevel) : 'نامعلوم'}
                  sub={score?.actualScore != null ? `امتیاز ${fa(score.actualScore)} از ۱۰۰` : 'بدون شواهد'}
                  color={score ? GAP_STATUS_META[score.status].color : undefined}
                />
                <Stat
                  label="شکاف"
                  value={score?.gap == null ? 'نامعلوم' : score.gap > 0 ? `${formatLevel(score.gap)} کمبود` : score.gap < 0 ? `${formatLevel(-score.gap)} مازاد` : '۰'}
                />
                <Stat label="وزن / حیاتی" value={`${fa(detail.requirement?.weight ?? score?.weight)}${detail.requirement?.isCritical ? ' ★' : ''}`} sub={detail.requirement?.isCritical ? 'شایستگی حیاتی' : 'عادی'} />
              </div>
              {score && (
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={score.status} />
                  <ConfidenceBadge confidence={score.confidence} coverage={score.coverage} />
                  <span className="num text-[10px] text-muted">
                    {fa(score.evidenceCount, 0)} مورد شواهد از {fa(score.sourceTypesCovered, 0)} نوع منبع
                  </span>
                </div>
              )}
              {score?.status === 'INSUFFICIENT_EVIDENCE' && (
                <p className="rounded-xl border border-dashed border-slate-400/30 p-2.5 text-[10.5px] leading-6 text-muted">
                  برای این شایستگی هنوز هیچ شاهدی ثبت نشده است. این وضعیت «نامعلوم» است، نه ضعف — برای قضاوت، شواهد منابع زیر را تکمیل کنید.
                </p>
              )}

              {/* Configured sources */}
              <div className="rounded-xl border border-white/10 p-3">
                <p className="mb-2 text-[11px] font-bold">منابع شواهد تعریف‌شده برای این شایستگی</p>
                <div className="flex flex-wrap gap-1.5">
                  {detail.sources.map((s) => {
                    const chip = EVIDENCE_SOURCE_CHIP[s.sourceType]
                    const state = s.excludedByDesign ? 'excluded' : s.itemCount > 0 ? 'covered' : 'missing'
                    return (
                      <span
                        key={`${s.sourceType}:${s.sourceRef}`}
                        title={state === 'excluded' ? 'این روش در طرح آزمون متقاضی نبوده (ارزیابی‌نشده به انتخاب طراح)' : state === 'missing' ? 'هنوز شاهدی از این منبع ثبت نشده' : undefined}
                        className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${state === 'excluded' ? 'border-dashed border-white/15 text-muted line-through' : state === 'missing' ? 'border-dashed border-slate-400/30 text-muted' : ''}`}
                        style={state === 'covered' ? { borderColor: `${chip.color}50`, background: `${chip.color}14`, color: chip.color } : undefined}
                      >
                        {state === 'excluded' && <Ban size={10} />}
                        {sourceTitle(s.sourceType, s.sourceRef)}
                        <span className="num">
                          · وزن {fa(s.weight)}
                          {state === 'covered' ? ` · ${fa(s.itemCount, 0)} مورد` : ''}
                        </span>
                      </span>
                    )
                  })}
                  {detail.sources.length === 0 && <span className="text-[10.5px] text-muted">هیچ منبع شواهدی برای این شایستگی تنظیم نشده است.</span>}
                </div>
              </div>

              {/* Evidence rows */}
              <div className="space-y-2">
                {detail.evidence.map((row) => (
                  <EvidenceRowCard
                    key={row.id}
                    row={row}
                    expanded={expanded === row.id}
                    onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
                  />
                ))}
              </div>
              {detail.evidence.length > 0 && (
                <p className="text-[9.5px] leading-5 text-muted">
                  سهم هر شاهد = امتیاز نرمال‌شده × وزن مؤثر ÷ مجموع وزن‌ها؛ مجموع سهم‌ها برابر امتیاز شایستگی ({fa(score?.actualScore)}) است. وزن هر منبع به‌طور مساوی بین
                  موارد آن تقسیم می‌شود.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function sourceTitle(sourceType: CompEvidenceDetailRow['sourceType'], sourceRef: string) {
  const base = EVIDENCE_SOURCE_CHIP[sourceType].label
  if (!sourceRef) return base
  if (sourceType === 'EXPERIENCE') return `${base}: ${COMP_EXPERIENCE_METRIC_LABEL_FA[sourceRef as CompExperienceMetric]?.split(' (')[0] ?? sourceRef}`
  return `${base}: ${sourceRef}`
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string | null; color?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-center">
      <p className="text-[9.5px] text-muted">{label}</p>
      <p className="num text-[13px] font-extrabold" style={color ? { color } : undefined}>
        {value}
      </p>
      {sub && <p className="text-[9px] text-muted">{sub}</p>}
    </div>
  )
}

function EvidenceRowCard({ row, expanded, onToggle }: { row: CompEvidenceDetailRow; expanded: boolean; onToggle: () => void }) {
  const chip = EVIDENCE_SOURCE_CHIP[row.sourceType]
  const raw = row.rawValue ?? {}
  const rawScoreLabel = (() => {
    switch (row.sourceType) {
      case 'TECHNICAL_CATEGORY':
        return `امتیاز رسمی ${fa(raw.score as number)} از ۵ (${raw.scoreOrigin === 'PANEL_AVERAGE' ? `میانگین ${fa(raw.panelistCount as number, 0)} داور` : 'ثبت سرپرست'})`
      case 'PERSONALITY_DIMENSION':
      case 'PERSONALITY_TRAIT':
        return `امتیاز خام ${fa(raw.rawScore as number, 2)} · ${fa(raw.coverageCount as number, 0)} سؤال`
      case 'SJT':
        return `امتیاز گزینه ${fa(raw.optionScore as number)} از ۵`
      case 'STRUCTURED_INTERVIEW':
        return `امتیاز ${fa(raw.rating as number)} از ۵`
      case 'EXPERIENCE':
        return raw.years != null ? `${fa(raw.years as number)} سال (سقف ${fa(raw.saturatesAt as number, 0)})` : `${fa(raw.count as number, 0)} مورد (سقف ${fa(raw.saturatesAt as number, 0)})`
      default:
        return ''
    }
  })()

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      <button onClick={onToggle} className="flex w-full items-start justify-between gap-2 p-3 text-right">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-bold" style={{ background: `${chip.color}1f`, color: chip.color }}>
              {COMP_EVIDENCE_SOURCE_TYPE_LABEL_FA[row.sourceType]}
            </span>
            {row.sourceRef && <span className="text-[9.5px] text-muted">{row.sourceRef}</span>}
          </div>
          <p className="line-clamp-2 text-[11px] font-bold leading-5">{row.sourceLabel || row.sourceItemId}</p>
          <p className="num mt-0.5 text-[9.5px] text-muted">{rawScoreLabel}</p>
        </div>
        <div className="shrink-0 text-left">
          <p className="num text-[13px] font-extrabold" style={{ color: chip.color }}>
            {fa(row.normalizedScore)}
          </p>
          <p className="num text-[9px] text-muted">وزن مؤثر {fa(row.effectiveWeight, 2)}</p>
          <p className="num text-[9px] text-muted">
            سهم {fa(row.contribution, 2)}
            {row.weightShare != null ? ` (${formatPercent(row.weightShare)})` : ''}
          </p>
          {expanded ? <ChevronUp size={13} className="mr-auto mt-1 text-muted" /> : <ChevronDown size={13} className="mr-auto mt-1 text-muted" />}
        </div>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-white/10 p-3">
          {row.itemsRestricted ? (
            <p className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <Lock size={12} /> جزئیات پاسخ‌های شخصیتی فقط برای دارندگان دسترسی ماژول شخصیت قابل مشاهده است.
            </p>
          ) : !row.items || row.items.length === 0 ? (
            <p className="text-[10.5px] text-muted">آیتم ارزیابی قابل‌ردیابی برای این شاهد یافت نشد.</p>
          ) : (
            row.items.map((item, i) => <EvidenceItem key={i} item={item} />)
          )}
        </div>
      )}
    </div>
  )
}

function EvidenceItem({ item }: { item: CompEvidenceDetailItem }) {
  switch (item.kind) {
    case 'TECHNICAL_QUESTION':
      return (
        <div className="space-y-1.5 text-[10.5px]">
          <p className="leading-6 text-secondary">{item.questionText}</p>
          <p className="text-[9.5px] text-muted">
            {item.category}
            {item.subCategory ? ` · ${item.subCategory}` : ''} · سطح {item.difficulty}
          </p>
          {item.candidateAnswer && (
            <p className="rounded-lg bg-white/[0.03] p-2 leading-6">
              <span className="font-bold text-secondary">پاسخ متقاضی: </span>
              <span className="text-muted">{item.candidateAnswer}</span>
            </p>
          )}
          <div className="space-y-1">
            {item.ratings.map((r) => (
              <div key={r.raterId} className="flex items-start justify-between gap-2 rounded-lg border border-white/5 px-2 py-1.5">
                <span className="min-w-0">
                  <span className="font-bold">{r.raterName}</span>
                  {r.note && <span className="block text-[9.5px] leading-5 text-muted">{r.note}</span>}
                </span>
                <span className="num shrink-0 font-bold text-purple-300">{r.score != null ? `${fa(r.score)} / ۵` : 'بدون امتیاز'}</span>
              </div>
            ))}
            {item.ratings.length === 0 && (
              <div className="flex items-start justify-between gap-2 rounded-lg border border-white/5 px-2 py-1.5">
                <span className="min-w-0">
                  <span className="font-bold">ثبت سرپرست پنل</span>
                  {item.leadNote && <span className="block text-[9.5px] leading-5 text-muted">{item.leadNote}</span>}
                </span>
                <span className="num shrink-0 font-bold text-purple-300">{item.leadScore != null ? `${fa(item.leadScore)} / ۵` : '—'}</span>
              </div>
            )}
          </div>
        </div>
      )
    case 'PERSONALITY_ITEM': {
      const selected = item.response?.selected
      return (
        <div className="flex items-start justify-between gap-2 rounded-lg border border-white/5 px-2 py-1.5 text-[10.5px]">
          <span className="min-w-0">
            <span className="block leading-5 text-secondary">{item.questionText}</span>
            <span className="text-[9.5px] text-muted">
              {PERSONALITY_QUESTION_TYPE_LABEL_FA[item.questionType as PersonalityQuestionType] ?? item.questionType}
              {item.reverseScored ? ' · معکوس' : ''}
            </span>
          </span>
          <span className="num shrink-0 font-bold text-pink-300">{item.chosenOptionLabel ?? (selected != null ? String(selected) : '—')}</span>
        </div>
      )
    }
    case 'SJT_ITEM':
      return (
        <div className="space-y-1.5 text-[10.5px]">
          {item.scenarioContext && <p className="leading-6 text-muted">{item.scenarioContext}</p>}
          <p className="leading-6 text-secondary">{item.questionText}</p>
          <ul className="space-y-1">
            {item.options.map((o) => (
              <li
                key={o.key}
                className={`flex items-start justify-between gap-2 rounded-lg border px-2 py-1 ${o.chosen ? 'border-indigo-400/40 bg-indigo-500/10' : 'border-white/5'}`}
              >
                <span className={o.chosen ? 'font-bold' : 'text-muted'}>
                  {o.chosen && '✓ '}
                  {o.labelFa}
                </span>
                <span className="num shrink-0 text-[9.5px] text-muted">
                  {o.score != null ? `${fa(o.score)} / ۵` : ''}
                  {o.dimensionKey ? ` · ${o.dimensionKey}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'INTERVIEW_RATING':
      return (
        <div className="rounded-lg border border-white/5 px-2 py-1.5 text-[10.5px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold">{item.raterName}</span>
            <span className="num font-bold text-sky-300">{fa(item.rating)} / ۵</span>
          </div>
          <p className="mt-0.5 leading-5 text-muted">{item.notes || 'بدون یادداشت'}</p>
          {item.ratedAt && <p className="num text-[9px] text-muted">{new Date(item.ratedAt).toLocaleDateString('fa-IR')}</p>}
        </div>
      )
    case 'EXPERIENCE':
      return (
        <div className="space-y-1 text-[10.5px]">
          <p className="text-[9.5px] text-muted">{COMP_EXPERIENCE_METRIC_LABEL_FA[item.metric]}</p>
          {(item.metric === 'years_total' || item.metric === 'years_pipeline') && (
            <>
              <p className="num">
                سابقه کل: {fa(item.yearsExperienceTotal)} سال · خطوط لوله: {fa(item.yearsExperiencePipeline)} سال
              </p>
              {(item.employmentHistory ?? []).slice(0, 6).map((e, i) => (
                <p key={i} className="text-muted">
                  {e.employer || '—'} — {e.position || '—'}
                  {e.isPipelineRole ? ' (خط لوله)' : ''}
                </p>
              ))}
            </>
          )}
          {item.metric === 'certifications' &&
            (item.certifications ?? [])
              .filter((c) => (c.title ?? '').trim())
              .map((c, i) => (
                <p key={i} className="text-muted">
                  {c.title}
                  {c.issuer ? ` — ${c.issuer}` : ''}
                </p>
              ))}
          {item.metric === 'education' &&
            (item.education ?? []).map((e, i) => (
              <p key={i} className="text-muted">
                {[e.degree, e.field, e.institution].filter(Boolean).join(' · ') || '—'}
              </p>
            ))}
        </div>
      )
  }
}
