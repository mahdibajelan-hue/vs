import {
  Activity, AlertOctagon, AlertTriangle, ArrowLeft, BarChart3, Bell, CalendarClock, ChevronLeft, Flag,
  Gauge, HeartPulse, ShieldAlert, ShieldCheck, Target, TrendingUp,
} from 'lucide-react'
import type { MasterProject } from '../../masterdata/types'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { useProjectAnalysis } from '../lib/useProjectAnalysis'
import { deriveMilestoneStatus, milestoneVariance } from '../lib/milestones'
import { ESCALATION_LABEL_FA } from '../lib/earlyWarning'
import {
  HEALTH_DIMENSION_LABEL_FA, MILESTONE_STATUS_LABEL_FA, STAGE_LABEL_FA,
  WARNING_SEVERITY_LABEL_FA, type StageKey,
} from '../types'
import { ProjectJourneyTimeline } from '../components/ProjectJourneyTimeline'
import { DriftTrendChart, HealthRadar, StageReadinessBars } from '../components/TowerCharts'
import { GateLadder, HealthGauge, ReadinessWaffle } from '../components/TowerInstruments'
import { TowerTile } from '../components/TowerTile'
import { VerdictTile, buildVerdict } from '../components/VerdictTile'
import { OverdueActionsIssuePanel } from '../components/OverdueActionsIssuePanel'
import { Card, EmptyState, SeverityPill, StatusDot, STATUS_COLOR, STATUS_TEXT_COLOR, fa, faNum, faText, faVariance } from '../components/ui'

/**
 * The Project Control Tower.
 *
 * Laid out as a bento canvas on a 12-column grid, where TILE SIZE CARRIES IMPORTANCE. The page
 * this replaced gave every fact an identically sized card, so a blocked gate and a milestone
 * count looked equally urgent and the eye had nowhere to land first.
 *
 * The thesis tile leads with a SENTENCE, not a number. Spec §25 asks this module to answer "what
 * should the manager do now?", and no KPI has ever answered that — so the verdict, its cause, and
 * the single top action occupy the largest tile, and the numbers arrange themselves underneath.
 *
 * Reading order: verdict → health → where the project is → what is shut → what is late → why.
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
  const selectProject = useLifecycleStore((s) => s.selectProject)
  const users = useMasterDataStore((s) => s.users)
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

  const verdict = buildVerdict(
    analysis.overall,
    analysis.currentReadiness,
    currentStageKey,
    analysis.blockedGateCount,
    analysis.milestoneKpis.criticalDelayed,
    analysis.forecastVarianceDays,
  )

  const criticalMilestones = bundle.milestones
    .map((m) => ({ ms: m, status: deriveMilestoneStatus(m) }))
    .filter((x) => x.status === 'delayed' || x.status === 'at_risk' || x.status === 'blocked')
    .sort((a, b) => (milestoneVariance(b.ms) ?? 0) - (milestoneVariance(a.ms) ?? 0))
    .slice(0, 5)

  const stageOrder = [...bundle.stages].sort((a, b) => a.sequence - b.sequence).map((s) => s.stageKey)
  const orderedGates = [...bundle.gates].sort(
    (a, b) => stageOrder.indexOf(a.stageKey) - stageOrder.indexOf(b.stageKey),
  )

  return (
    <div className="mx-auto max-w-[1400px] p-3 sm:p-4">
      {/* Identity strip — deliberately thin. The project's name is context, not the message. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-primary">
          <ArrowLeft size={13} /> فهرست پروژه‌ها
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={analysis.overall.status} size={8} />
          <h1 className="truncate text-sm font-extrabold">{project.officialName}</h1>
          <span className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted" dir="ltr">
            {project.projectIdCode}
          </span>
          <span className="hidden shrink-0 text-[10px] text-muted sm:inline">
            مرحله {stageLabel}
            {bundle.lifecycle.stageEnteredAt && <> · از {fa(bundle.lifecycle.stageEnteredAt)}</>}
          </span>
        </div>
      </div>

      <div className="plc-bento">
        {/* ── Row 1 — the thesis ───────────────────────────────────── */}
        <TowerTile span={8} variant="verdict" edge={analysis.overall.status}>
          <VerdictTile
            headline={verdict.headline}
            because={verdict.because}
            top={analysis.attention[0] ?? null}
            currentStageKey={currentStageKey}
            onOpenStage={onOpenStage}
          />
        </TowerTile>

        <TowerTile span={4} variant="raised" delay={40}>
          <HealthGauge
            score={analysis.overall.score}
            status={analysis.overall.status}
            drivenBy={analysis.overall.drivenBy}
            isOverridden={analysis.overall.isOverridden}
          />
        </TowerTile>

        {/* ── Row 2 — where the project is ─────────────────────────── */}
        <div className="plc-rise" style={{ gridColumn: 'span 12', animationDelay: '80ms' }}>
          <ProjectJourneyTimeline
            stages={bundle.stages}
            gates={bundle.gates}
            milestones={bundle.milestones}
            currentStageKey={currentStageKey}
            gateStatuses={analysis.gateStatuses}
            stageEnteredAt={bundle.lifecycle.stageEnteredAt}
            baselineFinish={analysis.baselineFinish}
            forecastFinish={analysis.forecastFinish}
            onSelectStage={onOpenStage}
          />
        </div>

        {/* ── Row 3 — what is shut, what is unfinished, what to do ─── */}
        <TowerTile
          span={3}
          eyebrow="Mandatory items"
          title={`بندهای الزامی مرحله «${stageLabel}»`}
          icon={<Target size={13} />}
          delay={120}
        >
          <ReadinessWaffle readiness={analysis.currentReadiness} />
        </TowerTile>

        <TowerTile
          span={4}
          eyebrow="Gates"
          title="نردبان گیت‌ها"
          icon={<ShieldCheck size={13} />}
          delay={160}
          accent="var(--plc-amber)"
          edge={analysis.blockedGateCount > 0 ? 'red' : undefined}
        >
          <GateLadder
            gates={orderedGates}
            gateStatuses={analysis.gateStatuses}
            readiness={analysis.readiness}
            currentStageKey={currentStageKey}
            stageOrder={stageOrder}
            onOpenStage={onOpenStage}
          />
        </TowerTile>

        <TowerTile span={5} eyebrow="Management attention" title="نیازمند توجه مدیریت" icon={<Bell size={13} />} delay={200}>
          {analysis.attention.length === 0 ? (
            <EmptyState message="موردی که نیاز به دخالت فوری مدیریت داشته باشد شناسایی نشد" />
          ) : (
            <ol className="space-y-1.5">
              {analysis.attention.map((a) => (
                <li
                  key={a.rank}
                  className="rounded-xl border p-2.5"
                  style={{
                    borderColor: a.severity === 'critical' ? `${STATUS_COLOR.red}3d` : 'var(--border-soft)',
                    background: a.severity === 'critical' ? `${STATUS_COLOR.red}08` : undefined,
                  }}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-start gap-1.5">
                      <span
                        className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-md text-[9px] font-extrabold"
                        style={{ background: 'var(--border-soft)' }}
                      >
                        {faNum(a.rank)}
                      </span>
                      <span className="text-[11px] font-bold leading-snug">{faText(a.problem)}</span>
                    </span>
                    <SeverityPill severity={a.severity} label={WARNING_SEVERITY_LABEL_FA[a.severity]} />
                  </div>
                  <p className="pr-5.5 text-[10px] leading-relaxed text-secondary">
                    <b>اقدام:</b> {faText(a.recommendedAction)}
                  </p>
                  <p className="pr-5.5 text-[9px] text-muted">
                    اثر: {faText(a.impact)} · ارجاع به {ESCALATION_LABEL_FA[a.escalation]}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </TowerTile>

        {/* ── Row 4 — the analytics ────────────────────────────────── */}
        <TowerTile span={4} eyebrow="Balance" title="توازن سلامت پروژه" icon={<Activity size={13} />} delay={240}>
          <HealthRadar health={analysis.health} />
          <p className="text-[9px] leading-relaxed text-muted">
            شکل نامتوازن یعنی یک بُعد کل پروژه را پایین می‌کشد.
          </p>
        </TowerTile>

        <TowerTile span={4} eyebrow="Readiness by stage" title="آمادگی مراحل چرخه عمر" icon={<BarChart3 size={13} />} delay={280}>
          <StageReadinessBars readiness={analysis.readiness} stageOrder={stageOrder} />
          <p className="text-[9px] leading-relaxed text-muted">
            میله خاکستری = مرحله دارای مانع؛ درصد بالا در آن به معنی نزدیک‌بودن به تصویب نیست.
          </p>
        </TowerTile>

        <TowerTile span={4} eyebrow="Forecast drift" title="روند رانش پیش‌بینی" icon={<TrendingUp size={13} />} delay={320}>
          <DriftTrendChart history={bundle.forecastHistory} milestones={bundle.milestones} />
          <p className="text-[9px] leading-relaxed text-muted">
            یک جابه‌جایی تاریخ رویداد است؛ منحنی صعودی، روند.
          </p>
        </TowerTile>

        {/* ── Row 5 — late milestones + the schedule numbers ───────── */}
        <TowerTile
          span={7}
          eyebrow="Milestones at risk"
          title="Milestoneهای در معرض تأخیر"
          icon={<Flag size={13} />}
          delay={360}
          edge={analysis.milestoneKpis.criticalDelayed > 0 ? 'red' : undefined}
          action={
            <button onClick={onOpenMilestones} className="flex shrink-0 items-center gap-1 text-[10px] text-sky-400 hover:underline">
              همه <ChevronLeft size={11} />
            </button>
          }
        >
          {criticalMilestones.length === 0 ? (
            <EmptyState message="Milestone در معرض تأخیر یا تأخیرکرده وجود ندارد" />
          ) : (
            <ul className="space-y-1">
              {criticalMilestones.map(({ ms, status }) => (
                <li
                  className="flex items-center justify-between gap-2 rounded-xl border px-2.5 py-1.5"
                  key={ms.id}
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      {ms.isCritical && <Flag size={10} style={{ color: STATUS_TEXT_COLOR.red }} />}
                      <span className="truncate text-[11px] font-medium">{ms.name}</span>
                    </span>
                    <span className="block text-[9px] text-muted">
                      Baseline {fa(ms.baselineDate)} · پیش‌بینی {fa(ms.forecastDate)}
                    </span>
                  </span>
                  <span className="shrink-0 text-left">
                    <span
                      className="plc-num block text-[11px] font-extrabold"
                      style={{ color: status === 'delayed' ? STATUS_TEXT_COLOR.red : STATUS_TEXT_COLOR.yellow }}
                    >
                      {faVariance(milestoneVariance(ms))}
                    </span>
                    <span className="block text-[9px] text-muted">{MILESTONE_STATUS_LABEL_FA[status]}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </TowerTile>

        <TowerTile span={5} eyebrow="Schedule & actions" title="شاخص‌های کلیدی" icon={<Gauge size={13} />} delay={400}>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="اتمام Baseline" value={fa(analysis.baselineFinish)} />
            <Metric
              label="پیش‌بینی اتمام"
              value={fa(analysis.forecastFinish)}
              sub={faVariance(analysis.forecastVarianceDays)}
              status={
                analysis.forecastVarianceDays === null ? undefined
                : analysis.forecastVarianceDays > 30 ? 'red'
                : analysis.forecastVarianceDays > 0 ? 'yellow' : 'green'
              }
            />
            <Metric
              label="تحقق به‌موقع Milestone"
              value={`${faNum(analysis.milestoneKpis.onTimeAchievementPct)}٪`}
              sub={`${faNum(analysis.milestoneKpis.achieved)} از ${faNum(analysis.milestoneKpis.total)} محقق‌شده`}
              status={
                analysis.milestoneKpis.onTimeAchievementPct >= 80 ? 'green'
                : analysis.milestoneKpis.onTimeAchievementPct >= 50 ? 'yellow' : 'red'
              }
            />
            <Metric
              label="اقدامات معوق"
              value={faNum(analysis.overdueActions)}
              sub={`${faNum(analysis.openActions)} اقدام باز · تکمیل ${faNum(analysis.actionCompletionRate)}٪`}
              status={analysis.overdueActions > 0 ? 'yellow' : 'green'}
            />
          </div>
        </TowerTile>

        {/* ── Row 5b — overdue actions, convertible to Issue Management right here ── */}
        {analysis.overdueActionsList.length > 0 && (
          <TowerTile
            span={12}
            eyebrow="Overdue actions"
            title="اقدامات دیرکردشده — تبدیل به Issue"
            icon={<AlertOctagon size={13} />}
            delay={420}
            edge="red"
          >
            <OverdueActionsIssuePanel
              masterProjectId={project.id}
              actions={analysis.overdueActionsList}
              users={users}
              onConverted={() => selectProject(project.id)}
            />
          </TowerTile>
        )}

        {/* ── Row 6 — the ten dimensions, compact ──────────────────── */}
        <TowerTile span={12} eyebrow="Health dimensions" title="سلامت به تفکیک بُعد" icon={<HeartPulse size={13} />} delay={440}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {analysis.health.map((h) => (
              <div
                key={h.dimension}
                className="rounded-xl border px-2.5 py-2"
                style={{
                  borderColor: h.status === 'green' ? 'var(--border-soft)' : `${STATUS_COLOR[h.status]}3d`,
                  background: h.status === 'green' ? undefined : `${STATUS_COLOR[h.status]}08`,
                }}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <StatusDot status={h.status} size={7} />
                  <span className="truncate text-[10px] font-medium">{HEALTH_DIMENSION_LABEL_FA[h.dimension]}</span>
                  {h.isManual && <span className="shrink-0 text-[8px] text-muted">دستی</span>}
                </div>
                <div className="mb-1 flex items-end gap-1">
                  <span className="plc-num text-lg font-extrabold leading-none" style={{ color: STATUS_TEXT_COLOR[h.status] }}>
                    {faNum(h.score)}
                  </span>
                  <span className="text-[8px] text-muted">/۱۰۰</span>
                </div>
                <div className="mb-1 h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--border-soft)' }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${h.score}%`, background: STATUS_COLOR[h.status] }}
                  />
                </div>
                <p className="text-[9px] leading-relaxed text-muted">{faText(h.explanation)}</p>
              </div>
            ))}
          </div>
        </TowerTile>

        {/* ── Row 7 — the full warning log ─────────────────────────── */}
        {analysis.warnings.length > 0 && (
          <TowerTile
            span={12}
            eyebrow="Early warnings"
            title={`هشدارهای زودهنگام (${faNum(analysis.warnings.length)})`}
            delay={480}
          >
            <ul className="grid gap-1.5 lg:grid-cols-2">
              {analysis.warnings.map((w, i) => (
                <li
                  key={`${w.triggerKey}-${i}`}
                  className="flex items-start gap-2 rounded-xl border px-2.5 py-2"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  {w.severity === 'critical' ? <ShieldAlert size={13} className="mt-0.5 shrink-0" style={{ color: STATUS_TEXT_COLOR.red }} />
                    : w.triggerKey.includes('milestone') ? <Target size={13} className="mt-0.5 shrink-0 text-muted" />
                    : w.triggerKey.includes('checklist') ? <CalendarClock size={13} className="mt-0.5 shrink-0 text-muted" />
                    : <AlertTriangle size={13} className="mt-0.5 shrink-0 text-muted" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-bold">{faText(w.title)}</span>
                      <SeverityPill severity={w.severity} label={WARNING_SEVERITY_LABEL_FA[w.severity]} />
                    </div>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-muted">{faText(w.detail)}</p>
                    <p className="mt-0.5 text-[10px] leading-relaxed text-secondary">← {faText(w.requiredAction)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </TowerTile>
        )}
      </div>
    </div>
  )
}

/** A number with its label. Uncoloured unless the value itself carries a status. */
function Metric({ label, value, sub, status }: {
  label: string
  value: string
  sub?: string
  status?: 'green' | 'yellow' | 'red' | 'black'
}) {
  return (
    <div
      className="rounded-xl border px-2.5 py-2"
      style={{
        borderColor: status && status !== 'green' ? `${STATUS_COLOR[status]}3d` : 'var(--border-soft)',
        background: status && status !== 'green' ? `${STATUS_COLOR[status]}08` : undefined,
      }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        {status && <StatusDot status={status} size={6} />}
        <span className="truncate text-[9px] text-muted">{label}</span>
      </div>
      <div className="plc-num text-[15px] font-extrabold leading-none" style={status ? { color: STATUS_TEXT_COLOR[status] } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[9px] leading-relaxed text-muted">{sub}</div>}
    </div>
  )
}
