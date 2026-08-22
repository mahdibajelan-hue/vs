import { useState } from 'react'
import { ArrowLeft, CircleCheckBig, Flag, ListChecks, Plus, ShieldAlert, TrendingUp } from 'lucide-react'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { useProjectAnalysis } from '../lib/useProjectAnalysis'
import { analyseDrift, deriveMilestoneStatus, milestoneVariance } from '../lib/milestones'
import {
  MILESTONE_STATUS_LABEL_FA, MILESTONE_TYPE_LABEL_FA, STAGE_LABEL_FA,
  type MilestoneStatus, type StageKey,
} from '../types'
import { EmptyState, STATUS_COLOR, STATUS_TEXT_COLOR, fa, faNum, faVariance } from '../components/ui'
import { StatSlicer } from '../components/StatSlicer'
import { TowerTile } from '../components/TowerTile'

const STATUS_TO_HEALTH: Record<MilestoneStatus, 'green' | 'yellow' | 'red' | 'black'> = {
  achieved: 'green', on_track: 'green', at_risk: 'yellow', delayed: 'red', blocked: 'black',
}

type Filter = 'all' | 'achieved' | 'at_risk' | 'delayed' | 'critical'

/**
 * Milestone register: baseline vs forecast vs actual with the variance made explicit, plus the
 * drift sparkline that turns a single number into a trend. Every row can be drilled into for the
 * actions raised against it — the MILESTONE → ACTION → OWNER half of the spec's chain.
 *
 * The KPI strip is also the filter, same idea as the Portfolio dashboard's slicer cards: click
 * "تأخیرکرده" and the list narrows to exactly that, with the active card lit up so the connection
 * between what you clicked and what you're looking at stays visible.
 */
export function MilestonesPage({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const bundle = useLifecycleStore((s) => s.bundle)
  const updateMilestone = useLifecycleStore((s) => s.updateMilestone)
  const createMilestone = useLifecycleStore((s) => s.createMilestone)
  const createAction = useLifecycleStore((s) => s.createAction)
  const analysis = useProjectAnalysis(bundle)

  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [draft, setDraft] = useState({ name: '', baselineDate: '', forecastDate: '', isCritical: false })
  const [forecastEdit, setForecastEdit] = useState<{ id: string; date: string; reason: string } | null>(null)
  const [actionDraft, setActionDraft] = useState<{ milestoneId: string; title: string } | null>(null)

  const rows = bundle.milestones
    .map((ms) => ({ ms, status: deriveMilestoneStatus(ms), variance: milestoneVariance(ms) }))
    .filter((r) =>
      filter === 'all' ? true
      : filter === 'critical' ? r.ms.isCritical
      : filter === 'achieved' ? r.status === 'achieved'
      : filter === 'at_risk' ? r.status === 'at_risk'
      : r.status === 'delayed' || r.status === 'blocked',
    )
    .sort((a, b) => (b.variance ?? -9999) - (a.variance ?? -9999))

  const k = analysis.milestoneKpis

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-primary">
        <ArrowLeft size={13} /> بازگشت به برج کنترل
      </button>

      <div className="plc-bento">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" style={{ gridColumn: 'span 12' }}>
          <StatSlicer
            icon={<ListChecks size={15} />} label="کل Milestoneها" value={faNum(k.total)}
            active={filter === 'all'} onClick={() => setFilter('all')}
          />
          <StatSlicer
            icon={<CircleCheckBig size={15} />} label="محقق‌شده" tone="green" value={faNum(k.achieved)}
            active={filter === 'achieved'} onClick={() => setFilter('achieved')}
          />
          <StatSlicer
            icon={<TrendingUp size={15} />} label="در معرض تأخیر" tone={k.atRisk > 0 ? 'yellow' : 'green'} value={faNum(k.atRisk)}
            active={filter === 'at_risk'} onClick={() => setFilter('at_risk')}
          />
          <StatSlicer
            icon={<ShieldAlert size={15} />} label="تأخیرکرده / مسدود" tone={k.delayed + k.blocked > 0 ? 'red' : 'green'} value={faNum(k.delayed + k.blocked)}
            active={filter === 'delayed'} onClick={() => setFilter('delayed')}
          />
          <StatSlicer
            icon={<Flag size={15} />} label="بحرانی تأخیرکرده" tone={k.criticalDelayed > 0 ? 'red' : 'green'} value={faNum(k.criticalDelayed)}
            active={filter === 'critical'} onClick={() => setFilter('critical')}
          />
          <div className="plc-tile flex flex-col justify-center gap-1" style={{ padding: '14px 16px' }}>
            <span className="plc-stat-label">تحقق به‌موقع</span>
            <span className="plc-stat-value">{faNum(k.onTimeAchievementPct)}٪</span>
          </div>
        </div>

        <TowerTile
          span={12}
          icon={<Flag size={13} />}
          title={filter === 'all' ? `Milestoneها (${faNum(rows.length)})` : `Milestoneها (${faNum(rows.length)} از ${faNum(k.total)})`}
          action={
            <div className="flex items-center gap-2">
              {filter !== 'all' && (
                <button onClick={() => setFilter('all')} className="rounded-full border px-2.5 py-1 text-[10px] font-medium text-sky-400 transition-colors hover:bg-white/5"
                  style={{ borderColor: 'rgba(56,189,248,0.4)' }}>
                  پاک‌کردن پالایش ✕
                </button>
              )}
              <button onClick={() => setShowNew((v) => !v)} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] text-sky-400 transition-colors hover:bg-white/5"
                style={{ borderColor: 'var(--border-soft)' }}>
                <Plus size={12} /> جدید
              </button>
            </div>
          }
        >
          {showNew && (
            <div className="mb-3 rounded-xl border p-3" style={{ borderColor: 'var(--border-soft)' }}>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="نام Milestone"
                className="mb-2 w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none"
                style={{ borderColor: 'var(--border-soft)' }}
              />
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="text-[10px] text-muted">
                  تاریخ Baseline (میلادی)
                  <input type="date" value={draft.baselineDate} onChange={(e) => setDraft({ ...draft, baselineDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
                </label>
                <label className="text-[10px] text-muted">
                  پیش‌بینی (میلادی)
                  <input type="date" value={draft.forecastDate} onChange={(e) => setDraft({ ...draft, forecastDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
                </label>
              </div>
              <label className="mb-2 flex items-center gap-1.5 text-[11px]">
                <input type="checkbox" checked={draft.isCritical} onChange={(e) => setDraft({ ...draft, isCritical: e.target.checked })} />
                Milestone بحرانی است
              </label>
              <button
                disabled={!draft.name.trim()}
                onClick={async () => {
                  await createMilestone(projectId, {
                    name: draft.name.trim(),
                    baselineDate: draft.baselineDate || null,
                    forecastDate: draft.forecastDate || null,
                    isCritical: draft.isCritical,
                  })
                  setDraft({ name: '', baselineDate: '', forecastDate: '', isCritical: false })
                  setShowNew(false)
                }}
                className="rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                style={{ background: '#3b82f6' }}
              >
                افزودن
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState message="Milestoneای با این پالایش یافت نشد" />
          ) : (
            <div className="space-y-1.5">
              {rows.map(({ ms, status, variance }) => {
                const drift = analyseDrift(ms.id, bundle.forecastHistory)
                const isOpen = expanded === ms.id
                const linkedActions = bundle.actions.filter((a) => a.relatedMilestoneId === ms.id)
                return (
                  <div key={ms.id} className="rounded-xl border" style={{ borderColor: 'var(--border-soft)' }}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : ms.id)}
                      className="w-full px-3 py-2.5 text-right"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {ms.isCritical && <Flag size={12} style={{ color: STATUS_TEXT_COLOR.red }} />}
                            <span className="text-[12px] font-bold">{ms.name}</span>
                            <span className="rounded px-1.5 py-px text-[9px] text-muted" style={{ background: 'var(--border-soft)' }}>
                              {MILESTONE_TYPE_LABEL_FA[ms.milestoneType]}
                            </span>
                            {ms.stageKey && (
                              <span className="text-[10px] text-muted">{STAGE_LABEL_FA[ms.stageKey as StageKey] ?? ms.stageKey}</span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 plc-stat-sub">
                            <span>Baseline: {fa(ms.baselineDate)}</span>
                            <span>پیش‌بینی: {fa(ms.forecastDate)}</span>
                            {ms.actualDate && <span style={{ color: STATUS_TEXT_COLOR.green }}>واقعی: {fa(ms.actualDate)}</span>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {drift && drift.series.length > 1 && <DriftSpark series={drift.series} />}
                          <div className="text-left">
                            <div className="text-[12px] font-bold"
                              style={{ color: (variance ?? 0) > 0 ? STATUS_TEXT_COLOR.red : STATUS_TEXT_COLOR.green }}>
                              {faVariance(variance)}
                            </div>
                            <div className="text-[10px]" style={{ color: STATUS_TEXT_COLOR[STATUS_TO_HEALTH[status]] }}>
                              {MILESTONE_STATUS_LABEL_FA[status]}
                            </div>
                          </div>
                        </div>
                      </div>
                      {drift?.isWorsening && (
                        <p className="mt-1.5 flex items-center gap-1 text-[10px]" style={{ color: STATUS_TEXT_COLOR.red }}>
                          <TrendingUp size={10} /> روند تأخیر فزاینده: {drift.series.map(faNum).join(' ← ')} روز
                        </p>
                      )}
                    </button>

                    {isOpen && (
                      <div className="border-t px-3 py-2.5" style={{ borderColor: 'var(--border-soft)' }}>
                        {/* Record achievement / move forecast */}
                        <div className="mb-3 flex flex-wrap gap-2">
                          {!ms.actualDate && (
                            <button
                              onClick={() => updateMilestone(ms, { actualDate: new Date().toISOString().slice(0, 10), status: 'achieved' })}
                              className="rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-white"
                              style={{ background: STATUS_COLOR.green }}
                            >
                              ثبت تحقق امروز
                            </button>
                          )}
                          <button
                            onClick={() => setForecastEdit({ id: ms.id, date: ms.forecastDate ?? '', reason: '' })}
                            className="rounded-lg border px-2.5 py-1.5 text-[10px]"
                            style={{ borderColor: 'var(--border-soft)' }}
                          >
                            تغییر تاریخ پیش‌بینی
                          </button>
                          <button
                            onClick={() => setActionDraft({ milestoneId: ms.id, title: '' })}
                            className="rounded-lg border px-2.5 py-1.5 text-[10px]"
                            style={{ borderColor: 'var(--border-soft)' }}
                          >
                            ثبت اقدام برای این Milestone
                          </button>
                        </div>

                        {forecastEdit?.id === ms.id && (
                          <div className="mb-3 rounded-lg border p-2.5" style={{ borderColor: 'var(--border-soft)' }}>
                            <p className="mb-2 plc-stat-sub">
                              هر تغییر پیش‌بینی در تاریخچه ثبت می‌شود تا روند تأخیر قابل تشخیص باشد.
                            </p>
                            <input type="date" value={forecastEdit.date}
                              onChange={(e) => setForecastEdit({ ...forecastEdit, date: e.target.value })}
                              className="mb-2 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
                            <input value={forecastEdit.reason}
                              onChange={(e) => setForecastEdit({ ...forecastEdit, reason: e.target.value })}
                              placeholder="دلیل تغییر (در سابقه ثبت می‌شود)"
                              className="mb-2 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
                            <button
                              onClick={async () => {
                                await updateMilestone(ms, { forecastDate: forecastEdit.date || null }, forecastEdit.reason)
                                setForecastEdit(null)
                              }}
                              className="rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-white" style={{ background: '#3b82f6' }}
                            >
                              ثبت تغییر
                            </button>
                          </div>
                        )}

                        {actionDraft?.milestoneId === ms.id && (
                          <div className="mb-3 rounded-lg border p-2.5" style={{ borderColor: 'var(--border-soft)' }}>
                            <input value={actionDraft.title}
                              onChange={(e) => setActionDraft({ ...actionDraft, title: e.target.value })}
                              placeholder="شرح اقدام"
                              className="mb-2 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
                            <button
                              disabled={!actionDraft.title.trim()}
                              onClick={async () => {
                                await createAction(projectId, {
                                  title: actionDraft.title.trim(), source: 'milestone',
                                  relatedMilestoneId: ms.id, priority: ms.isCritical ? 'critical' : 'medium',
                                })
                                setActionDraft(null)
                              }}
                              className="rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-white disabled:opacity-40" style={{ background: '#3b82f6' }}
                            >
                              ثبت اقدام
                            </button>
                          </div>
                        )}

                        {/* Linked actions — the drill-down the spec asks for */}
                        <h4 className="mb-1 text-[10px] font-bold text-muted">اقدامات مرتبط ({faNum(linkedActions.length)})</h4>
                        {linkedActions.length === 0 ? (
                          <p className="plc-stat-sub">اقدامی برای این Milestone ثبت نشده است</p>
                        ) : (
                          <ul className="space-y-1">
                            {linkedActions.map((a) => (
                              <li key={a.id} className="flex items-center justify-between gap-2 text-[10px]">
                                <span>{a.title}</span>
                                <span className="text-muted">{a.dueDate ? fa(a.dueDate) : '—'}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {ms.comments && <p className="mt-2 plc-stat-sub">یادداشت: {ms.comments}</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </TowerTile>
      </div>
    </div>
  )
}

/** Tiny inline trend of successive variance readings. Deliberately unlabelled — it is a shape,
 * not a chart; the exact numbers are spelled out in the drift line beneath it. */
function DriftSpark({ series }: { series: number[] }) {
  const max = Math.max(1, ...series.map(Math.abs))
  return (
    <div className="flex h-6 items-end gap-0.5" dir="ltr" title={series.join(' → ')}>
      {series.slice(-6).map((v, i) => (
        <div
          key={i}
          className="w-1 rounded-sm"
          style={{
            height: `${Math.max(10, (Math.abs(v) / max) * 100)}%`,
            background: v > 0 ? STATUS_COLOR.red : STATUS_COLOR.green,
          }}
        />
      ))}
    </div>
  )
}
