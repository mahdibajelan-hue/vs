import { AlertTriangle, ArrowLeft, CalendarClock, ChevronLeft, Flag, ShieldAlert, Target } from 'lucide-react'
import type { MasterProject } from '../../masterdata/types'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { useProjectAnalysis } from '../lib/useProjectAnalysis'
import { deriveMilestoneStatus, milestoneVariance } from '../lib/milestones'
import { ESCALATION_LABEL_FA } from '../lib/earlyWarning'
import {
  HEALTH_DIMENSION_LABEL_FA, HEALTH_STATUS_LABEL_FA, MILESTONE_STATUS_LABEL_FA,
  STAGE_LABEL_FA, WARNING_SEVERITY_LABEL_FA, type StageKey,
} from '../types'
import { LifecycleStepper } from '../components/LifecycleStepper'
import { Bar, Card, EmptyState, Kpi, SeverityPill, StatusDot, STATUS_COLOR, fa, faNum, faVariance } from '../components/ui'

/**
 * The Project Control Tower — the module's centrepiece and the answer to spec §25.
 *
 * Reading order is deliberate and top-down: identity → where in the lifecycle → how healthy and
 * why → what is on fire → what the manager should do. A manager should never have to open a
 * second page to know whether this project is in trouble.
 */
export function ControlTowerPage({
  project, onBack, onOpenStage, onOpenMilestones,
}: {
  project: MasterProject
  onBack: () => void
  onOpenStage: (stageKey: string) => void
  onOpenMilestones: () => void
}) {
  const bundle = useLifecycleStore((s) => s.bundle)
  const loading = useLifecycleStore((s) => s.loadingProject)
  const analysis = useProjectAnalysis(bundle)

  const currentStageKey = bundle.lifecycle?.currentStageKey ?? ''
  const stageLabel = STAGE_LABEL_FA[currentStageKey as StageKey] ?? currentStageKey ?? '—'

  if (loading) return <EmptyState message="در حال بارگذاری..." />

  if (!bundle.lifecycle) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <button onClick={onBack} className="mb-3 flex items-center gap-1 text-xs text-muted hover:text-primary">
          <ArrowLeft size={13} /> بازگشت
        </button>
        <Card>
          <p className="mb-1 text-sm font-bold">چرخه عمر برای این پروژه تعریف نشده است</p>
          <p className="text-xs text-muted">
            برای فعال‌سازی برج کنترل، ابتدا یک قالب چرخه عمر به پروژه «{project.officialName}» تخصیص دهید
            (تب «قالب‌ها»). با تخصیص قالب، مراحل، گیت‌ها و چک‌لیست‌های آن به پروژه کپی می‌شوند.
          </p>
        </Card>
      </div>
    )
  }

  const criticalMilestones = bundle.milestones
    .map((m) => ({ ms: m, status: deriveMilestoneStatus(m) }))
    .filter((x) => x.status === 'delayed' || x.status === 'at_risk' || x.status === 'blocked')
    .sort((a, b) => (milestoneVariance(b.ms) ?? 0) - (milestoneVariance(a.ms) ?? 0))
    .slice(0, 6)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted hover:text-primary">
        <ArrowLeft size={13} /> بازگشت به فهرست پروژه‌ها
      </button>

      {/* ── Identity + headline numbers ─────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <StatusDot status={analysis.overall.status} size={10} />
              <h1 className="truncate text-base font-extrabold">{project.officialName}</h1>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted" dir="ltr">{project.projectIdCode}</span>
            </div>
            <p className="text-[11px] text-muted">
              مرحله جاری: <b className="text-primary">{stageLabel}</b>
              {bundle.lifecycle.stageEnteredAt && <> — از {fa(bundle.lifecycle.stageEnteredAt)}</>}
            </p>
            {analysis.overall.isOverridden ? (
              <p className="mt-1 text-[10px]" style={{ color: STATUS_COLOR.yellow }}>
                وضعیت سلامت به‌صورت دستی تعیین شده — دلیل: {analysis.overall.overrideReason || '—'}
              </p>
            ) : analysis.overall.drivenBy ? (
              <p className="mt-1 text-[10px] text-muted">
                وضعیت کلی توسط بُعد «{HEALTH_DIMENSION_LABEL_FA[analysis.overall.drivenBy]}» تعیین شده است
              </p>
            ) : null}
          </div>

          <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4" style={{ minWidth: 280 }}>
            <Kpi label="سلامت کلی" value={HEALTH_STATUS_LABEL_FA[analysis.overall.status]} status={analysis.overall.status} />
            <Kpi label="آمادگی مرحله جاری" value={`${faNum(analysis.currentReadiness?.percent ?? 0)}٪`} />
            <Kpi label="اتمام Baseline" value={fa(analysis.baselineFinish)} />
            <Kpi
              label="پیش‌بینی اتمام"
              value={fa(analysis.forecastFinish)}
              sub={faVariance(analysis.forecastVarianceDays)}
              status={
                analysis.forecastVarianceDays === null ? undefined
                : analysis.forecastVarianceDays > 30 ? 'red'
                : analysis.forecastVarianceDays > 0 ? 'yellow' : 'green'
              }
            />
          </div>
        </div>
      </Card>

      {/* ── Lifecycle ───────────────────────────────────────────────── */}
      <Card title="چرخه عمر پروژه">
        <LifecycleStepper
          stages={bundle.stages}
          currentStageKey={currentStageKey}
          gates={bundle.gates}
          onSelectStage={onOpenStage}
        />
        {analysis.currentReadiness && (
          <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--border-soft)' }}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold">آمادگی برای عبور از مرحله «{stageLabel}»</span>
              <span className="text-xs font-extrabold">{faNum(analysis.currentReadiness.percent)}٪</span>
            </div>
            <Bar
              percent={analysis.currentReadiness.percent}
              blocked={analysis.currentReadiness.blockers.length > 0}
            />
            <p className="mt-2 text-[10px] text-muted">
              الزامات: {faNum(analysis.currentReadiness.mandatoryDone)} از {faNum(analysis.currentReadiness.mandatoryTotal)} تکمیل‌شده
              {analysis.currentReadiness.blockers.length > 0 && (
                <> — <span style={{ color: STATUS_COLOR.red }}>{faNum(analysis.currentReadiness.blockers.length)} مانع عبور</span></>
              )}
            </p>
            {analysis.currentReadiness.blockers.length > 0 && (
              <ul className="mt-2 space-y-1">
                {analysis.currentReadiness.blockers.slice(0, 4).map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] text-secondary">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: STATUS_COLOR.red }} />
                    <span><b>{b.label}</b> — {b.detail}</span>
                  </li>
                ))}
                {analysis.currentReadiness.blockers.length > 4 && (
                  <li className="text-[10px] text-muted">
                    و {faNum(analysis.currentReadiness.blockers.length - 4)} مورد دیگر…
                  </li>
                )}
              </ul>
            )}
            <button
              onClick={() => onOpenStage(currentStageKey)}
              className="mt-2 flex items-center gap-1 text-[11px] text-brand-400 hover:underline"
            >
              مشاهده چک‌لیست و گیت این مرحله <ChevronLeft size={12} />
            </button>
          </div>
        )}
      </Card>

      {/* ── Health dimensions ───────────────────────────────────────── */}
      <Card title="وضعیت سلامت پروژه">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {analysis.health.map((h) => (
            <div key={h.dimension} className="rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--border-soft)' }}>
              <div className="mb-1 flex items-center gap-1.5">
                <StatusDot status={h.status} size={7} />
                <span className="truncate text-[11px] font-medium">{HEALTH_DIMENSION_LABEL_FA[h.dimension]}</span>
                {h.isManual && <span className="text-[8px] text-muted">دستی</span>}
              </div>
              <div className="mb-1 text-sm font-extrabold" style={{ color: STATUS_COLOR[h.status] }}>
                {faNum(h.score)}
              </div>
              <p className="text-[9px] leading-relaxed text-muted">{h.explanation}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Critical alerts ───────────────────────────────────────── */}
        <Card title="هشدارهای بحرانی">
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Kpi label="Milestone تأخیرکرده" value={faNum(analysis.milestoneKpis.delayed)}
              status={analysis.milestoneKpis.delayed > 0 ? 'red' : 'green'} />
            <Kpi label="بحرانی تأخیرکرده" value={faNum(analysis.milestoneKpis.criticalDelayed)}
              status={analysis.milestoneKpis.criticalDelayed > 0 ? 'red' : 'green'} />
            <Kpi label="اقدام معوق" value={faNum(analysis.overdueActions)}
              status={analysis.overdueActions > 0 ? 'yellow' : 'green'} />
            <Kpi label="گیت مسدود" value={faNum(analysis.blockedGateCount)}
              status={analysis.blockedGateCount > 0 ? 'black' : 'green'} />
          </div>

          {criticalMilestones.length === 0 ? (
            <EmptyState message="Milestone در معرض تأخیر یا تأخیرکرده وجود ندارد" />
          ) : (
            <ul className="space-y-1.5">
              {criticalMilestones.map(({ ms, status }) => (
                <li key={ms.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--border-soft)' }}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {ms.isCritical && <Flag size={11} style={{ color: STATUS_COLOR.red }} />}
                      <span className="truncate text-[11px] font-medium">{ms.name}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted">
                      Baseline {fa(ms.baselineDate)} · پیش‌بینی {fa(ms.forecastDate)}
                    </div>
                  </div>
                  <div className="shrink-0 text-left">
                    <div className="text-[11px] font-bold" style={{ color: status === 'delayed' ? STATUS_COLOR.red : STATUS_COLOR.yellow }}>
                      {faVariance(milestoneVariance(ms))}
                    </div>
                    <div className="text-[9px] text-muted">{MILESTONE_STATUS_LABEL_FA[status]}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button onClick={onOpenMilestones} className="mt-2 flex items-center gap-1 text-[11px] text-brand-400 hover:underline">
            مشاهده همه Milestoneها <ChevronLeft size={12} />
          </button>
        </Card>

        {/* ── Management attention ──────────────────────────────────── */}
        <Card title="نیازمند توجه مدیریت">
          {analysis.attention.length === 0 ? (
            <EmptyState message="موردی که نیاز به دخالت فوری مدیریت داشته باشد شناسایی نشد" />
          ) : (
            <ol className="space-y-2">
              {analysis.attention.map((a) => (
                <li key={a.rank} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--border-soft)' }}>
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold"
                        style={{ background: 'var(--border-soft)' }}>
                        {faNum(a.rank)}
                      </span>
                      <span className="text-[11px] font-bold leading-snug">{a.problem}</span>
                    </div>
                    <SeverityPill severity={a.severity} label={WARNING_SEVERITY_LABEL_FA[a.severity]} />
                  </div>
                  <p className="mb-1 pr-5.5 text-[10px] leading-relaxed text-muted">
                    <b className="text-secondary">اثر:</b> {a.impact}
                  </p>
                  <p className="pr-5.5 text-[10px] leading-relaxed text-secondary">
                    <b>اقدام پیشنهادی:</b> {a.recommendedAction}
                  </p>
                  <p className="mt-1 pr-5.5 text-[9px] text-muted">
                    سطح ارجاع: {ESCALATION_LABEL_FA[a.escalation]}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* ── Milestone + action KPI strip ─────────────────────────────── */}
      <Card title="شاخص‌های کلیدی پروژه">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label="کل Milestoneها" value={faNum(analysis.milestoneKpis.total)} />
          <Kpi label="محقق‌شده" value={faNum(analysis.milestoneKpis.achieved)} />
          <Kpi label="تحقق به‌موقع" value={`${faNum(analysis.milestoneKpis.onTimeAchievementPct)}٪`}
            status={analysis.milestoneKpis.onTimeAchievementPct >= 80 ? 'green' : analysis.milestoneKpis.onTimeAchievementPct >= 50 ? 'yellow' : 'red'} />
          <Kpi label="تحقق بحرانی‌ها" value={`${faNum(analysis.milestoneKpis.criticalAchievementPct)}٪`}
            status={analysis.milestoneKpis.criticalAchievementPct >= 80 ? 'green' : 'yellow'} />
          <Kpi label="اقدامات باز" value={faNum(analysis.openActions)} />
          <Kpi label="نرخ تکمیل اقدامات" value={`${faNum(analysis.actionCompletionRate)}٪`} />
        </div>
      </Card>

      {/* ── Full warning list ────────────────────────────────────────── */}
      {analysis.warnings.length > 0 && (
        <Card title={`هشدارهای زودهنگام (${faNum(analysis.warnings.length)})`}>
          <ul className="space-y-1.5">
            {analysis.warnings.map((w, i) => (
              <li key={`${w.triggerKey}-${i}`} className="flex items-start gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--border-soft)' }}>
                {w.severity === 'critical' ? <ShieldAlert size={13} className="mt-0.5 shrink-0" style={{ color: STATUS_COLOR.red }} />
                  : w.triggerKey.includes('milestone') ? <Target size={13} className="mt-0.5 shrink-0 text-muted" />
                  : w.triggerKey.includes('checklist') ? <CalendarClock size={13} className="mt-0.5 shrink-0 text-muted" />
                  : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-muted" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold">{w.title}</span>
                    <SeverityPill severity={w.severity} label={WARNING_SEVERITY_LABEL_FA[w.severity]} />
                  </div>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{w.detail}</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-secondary">← {w.requiredAction}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
