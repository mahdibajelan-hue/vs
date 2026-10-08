import { Fragment, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowLeft, GanttChartSquare, Lock, Plus, Trash2 } from 'lucide-react'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { jalaliToIso, isoToJalali, JALALI_MONTHS } from '../../../lib/jalali'
import { DEFAULT_STAGE_ORDER, STAGE_LABEL_FA, type Activity, type StageKey } from '../types'
import { EmptyState, STATUS_COLOR, fa, faNum } from '../components/ui'
import { StatSlicer } from '../components/StatSlicer'
import { TowerTile } from '../components/TowerTile'

type ActivityStatus = 'not_started' | 'in_progress' | 'completed' | 'on_hold'
const ACTIVITY_STATUS_LABEL_FA: Record<ActivityStatus, string> = {
  not_started: 'شروع‌نشده', in_progress: 'در حال انجام', completed: 'تکمیل‌شده', on_hold: 'متوقف',
}

const DAY_MS = 86_400_000
const LABEL_COL = '190px'

function toTime(iso: string): number {
  return Date.parse(iso.slice(0, 10))
}
function addDays(iso: string, days: number): string {
  return new Date(toTime(iso) + days * DAY_MS).toISOString().slice(0, 10)
}
function dayDiff(a: string, b: string): number {
  return Math.round((toTime(b) - toTime(a)) / DAY_MS)
}

/** Default accent for a bar that is neither finished nor in trouble — the module's generic
 * telemetry tone (see TowerTile's icon badges), not a health colour: a plan is not "good" or
 * "bad" just for being on track, it is just normal. */
const ON_TRACK_TONE = '#38bdf8'

function activityTone(a: Activity, today: string): string {
  if (a.status === 'completed') return STATUS_COLOR.green
  if (a.status === 'on_hold') return STATUS_COLOR.black
  if (a.forecastFinish && a.forecastFinish < today) return STATUS_COLOR.red
  if (a.baselineFinish && a.forecastFinish && a.forecastFinish > a.baselineFinish) return STATUS_COLOR.yellow
  return ON_TRACK_TONE
}

/**
 * Master Plan — the interactive Gantt that plc_activities never had a screen for. The table has
 * carried baseline/forecast/actual columns and a dependency pointer since the schema was written;
 * nothing in the module could create a row or move one, so the schedule-variance and health
 * engines (see useProjectAnalysis) have been quietly computing against an empty table. This page
 * closes that loop — once a project's activities are populated here, the Control Tower's existing
 * schedule-variance tile starts reflecting real numbers with no further change on that side.
 */
export function MasterPlanPage({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const bundle = useLifecycleStore((s) => s.bundle)
  const createActivity = useLifecycleStore((s) => s.createActivity)
  const updateActivity = useLifecycleStore((s) => s.updateActivity)
  const deleteActivity = useLifecycleStore((s) => s.deleteActivity)
  const lockActivityBaselines = useLifecycleStore((s) => s.lockActivityBaselines)

  const today = new Date().toISOString().slice(0, 10)
  const activities = useMemo(() => bundle.activities.slice().sort((a, b) => a.sequence - b.sequence), [bundle.activities])

  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [draft, setDraft] = useState({ name: '', wbsCode: '', stageKey: '' as StageKey | '', forecastStart: '', forecastFinish: '', isCritical: false })
  const [drag, setDrag] = useState<{ id: string; baseStart: string; baseFinish: string; pxPerDay: number; startX: number; deltaDays: number } | null>(null)

  const win = useMemo(() => {
    const dates: string[] = [today]
    for (const a of activities) {
      for (const d of [a.baselineStart, a.baselineFinish, a.forecastStart, a.forecastFinish, a.actualStart, a.actualFinish]) {
        if (d) dates.push(d)
      }
    }
    const min = addDays(dates.reduce((m, d) => (d < m ? d : m)), -7)
    const max = addDays(dates.reduce((m, d) => (d > m ? d : m)), 21)
    const totalDays = Math.max(1, dayDiff(min, max))
    return {
      min, max, totalDays,
      pos: (iso: string) => Math.min(100, Math.max(0, (dayDiff(min, iso) / totalDays) * 100)),
    }
  }, [activities, today])

  const months = useMemo(() => {
    const out: { label: string; left: number }[] = []
    const first = isoToJalali(win.min)
    const last = isoToJalali(win.max)
    if (!first || !last) return out
    let jy = first.jy
    let jm = first.jm
    for (let guard = 0; guard < 36; guard += 1) {
      const iso = jalaliToIso(jy, jm, 1)
      if (jy > last.jy || (jy === last.jy && jm > last.jm)) break
      out.push({ label: `${JALALI_MONTHS[jm - 1]} ${faNum(jy)}`, left: win.pos(iso) })
      jm += 1
      if (jm > 12) { jm = 1; jy += 1 }
    }
    return out
  }, [win])

  const todayPct = win.pos(today)
  const kpis = useMemo(() => ({
    total: activities.length,
    critical: activities.filter((a) => a.isCritical).length,
    completed: activities.filter((a) => a.status === 'completed').length,
    avgProgress: activities.length === 0 ? 0 : Math.round(activities.reduce((s, a) => s + a.progress, 0) / activities.length),
  }), [activities])

  function startDrag(e: ReactPointerEvent<HTMLDivElement>, a: Activity, trackWidth: number) {
    if (!a.forecastStart || !a.forecastFinish) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: a.id, baseStart: a.forecastStart, baseFinish: a.forecastFinish, pxPerDay: trackWidth / win.totalDays, startX: e.clientX, deltaDays: 0 })
  }
  function moveDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return
    const deltaDays = Math.round((e.clientX - drag.startX) / drag.pxPerDay)
    if (deltaDays !== drag.deltaDays) setDrag({ ...drag, deltaDays })
  }
  async function endDrag(e: ReactPointerEvent<HTMLDivElement>, a: Activity) {
    if (!drag || drag.id !== a.id) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    const { deltaDays, baseStart, baseFinish } = drag
    setDrag(null)
    if (deltaDays === 0) return
    await updateActivity(a, { forecastStart: addDays(baseStart, deltaDays), forecastFinish: addDays(baseFinish, deltaDays) }, 'جابه‌جایی در Master Plan (کشیدن نوار)')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-primary">
          <ArrowLeft size={13} /> بازگشت به برج کنترل
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (confirm('تاریخ پیش‌بینی هر ردیفی که هنوز Baseline ندارد، به‌عنوان Baseline ثبت شود؟ ردیف‌هایی که از قبل Baseline دارند دست‌نخورده می‌مانند.')) {
                await lockActivityBaselines(projectId)
              }
            }}
            className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] text-secondary transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <Lock size={12} /> قفل Baseline
          </button>
          <button
            onClick={() => setShowNew((v) => !v)}
            className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] text-sky-400 transition-colors hover:bg-white/5"
            style={{ borderColor: 'var(--border-soft)' }}
          >
            <Plus size={12} /> ردیف جدید
          </button>
        </div>
      </div>

      <div className="plc-bento">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" style={{ gridColumn: 'span 12' }}>
          <StatSlicer icon={<GanttChartSquare size={15} />} label="کل ردیف‌ها" value={faNum(kpis.total)} />
          <StatSlicer icon={<GanttChartSquare size={15} />} label="مسیر بحرانی" tone={kpis.critical > 0 ? 'red' : 'green'} value={faNum(kpis.critical)} />
          <StatSlicer icon={<GanttChartSquare size={15} />} label="تکمیل‌شده" tone="green" value={faNum(kpis.completed)} />
          <StatSlicer icon={<GanttChartSquare size={15} />} label="میانگین پیشرفت" value={`${faNum(kpis.avgProgress)}٪`} />
        </div>

        <TowerTile span={12} icon={<GanttChartSquare size={13} />} title="برنامه زمانی اصلی (Master Plan)">
          {showNew && (
            <div className="mb-3 rounded-xl border p-3" style={{ borderColor: 'var(--border-soft)' }}>
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="شرح ردیف"
                  className="w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--border-soft)' }}
                />
                <input
                  value={draft.wbsCode}
                  onChange={(e) => setDraft({ ...draft, wbsCode: e.target.value })}
                  placeholder="کد WBS (اختیاری)"
                  className="w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--border-soft)' }}
                />
              </div>
              <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  value={draft.stageKey}
                  onChange={(e) => setDraft({ ...draft, stageKey: e.target.value as StageKey | '' })}
                  className="w-full rounded-lg border bg-black/20 px-2 py-2 text-xs outline-none"
                  style={{ borderColor: 'var(--border-soft)' }}
                >
                  <option value="">مرحله — بدون اتصال</option>
                  {DEFAULT_STAGE_ORDER.map((sk) => <option key={sk} value={sk}>{STAGE_LABEL_FA[sk]}</option>)}
                </select>
                <label className="text-[10px] text-muted">
                  شروع پیش‌بینی
                  <input type="date" value={draft.forecastStart} onChange={(e) => setDraft({ ...draft, forecastStart: e.target.value })}
                    className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
                </label>
                <label className="text-[10px] text-muted">
                  پایان پیش‌بینی
                  <input type="date" value={draft.forecastFinish} onChange={(e) => setDraft({ ...draft, forecastFinish: e.target.value })}
                    className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
                </label>
              </div>
              <label className="mb-2 flex items-center gap-1.5 text-[11px]">
                <input type="checkbox" checked={draft.isCritical} onChange={(e) => setDraft({ ...draft, isCritical: e.target.checked })} />
                روی مسیر بحرانی است
              </label>
              <button
                disabled={!draft.name.trim()}
                onClick={async () => {
                  await createActivity(projectId, {
                    name: draft.name.trim(),
                    wbsCode: draft.wbsCode.trim(),
                    stageKey: draft.stageKey || undefined,
                    forecastStart: draft.forecastStart || null,
                    forecastFinish: draft.forecastFinish || null,
                    isCritical: draft.isCritical,
                  })
                  setDraft({ name: '', wbsCode: '', stageKey: '', forecastStart: '', forecastFinish: '', isCritical: false })
                  setShowNew(false)
                }}
                className="rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                style={{ background: '#3b82f6' }}
              >
                افزودن
              </button>
            </div>
          )}

          {activities.length === 0 ? (
            <EmptyState message="هنوز ردیفی در برنامه زمانی ثبت نشده — با «ردیف جدید» شروع کنید." />
          ) : (
            <div className="grid gap-y-1.5" style={{ gridTemplateColumns: `${LABEL_COL} 1fr` }}>
              <div />
              <div dir="ltr" className="relative" style={{ height: 22 }}>
                {months.map((m, i) => (
                  <span key={i} className="absolute top-0 whitespace-nowrap text-[9px] text-muted" style={{ left: `${m.left}%` }}>
                    {m.label}
                  </span>
                ))}
              </div>

              {activities.map((a) => {
                const isOpen = expanded === a.id
                const dragging = drag?.id === a.id
                const shiftPct = dragging ? (drag.deltaDays / win.totalDays) * 100 : 0
                const tone = activityTone(a, today)
                const dependsOn = a.dependsOnId ? activities.find((x) => x.id === a.dependsOnId) : null
                return (
                  <Fragment key={a.id}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : a.id)}
                      className="min-w-0 text-right"
                      title={a.name}
                    >
                      <div className="flex items-center gap-1 text-[11px] font-medium">
                        {a.isCritical && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR.red }} />}
                        <span className="truncate">{a.wbsCode ? `${a.wbsCode} — ${a.name}` : a.name}</span>
                      </div>
                      {dependsOn && <div className="truncate text-[9px] text-muted">⤷ بعد از: {dependsOn.name}</div>}
                    </button>

                    <div dir="ltr" className="relative" style={{ height: 26 }}>
                      <div className="absolute inset-y-0 w-px" style={{ left: `${todayPct}%`, background: STATUS_COLOR.yellow, opacity: 0.4 }} />

                      {a.baselineStart && a.baselineFinish && (
                        <div
                          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full border border-dashed"
                          style={{ left: `${win.pos(a.baselineStart)}%`, width: `${Math.max(1, win.pos(a.baselineFinish) - win.pos(a.baselineStart))}%`, borderColor: 'rgba(148,163,184,0.5)' }}
                          title={`Baseline: ${fa(a.baselineStart)} تا ${fa(a.baselineFinish)}`}
                        />
                      )}

                      {a.forecastStart && a.forecastFinish && (
                        <div
                          onPointerDown={(e) => startDrag(e, a, (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width)}
                          onPointerMove={moveDrag}
                          onPointerUp={(e) => endDrag(e, a)}
                          className="absolute top-1/2 h-3.5 -translate-y-1/2 cursor-grab overflow-hidden rounded-full active:cursor-grabbing"
                          style={{
                            left: `${win.pos(a.forecastStart) + shiftPct}%`,
                            width: `${Math.max(1.2, win.pos(a.forecastFinish) - win.pos(a.forecastStart))}%`,
                            background: `color-mix(in srgb, ${tone} 35%, transparent)`,
                          }}
                          title={`پیش‌بینی: ${fa(a.forecastStart)} تا ${fa(a.forecastFinish)} — ${faNum(a.progress)}٪`}
                        >
                          <div className="h-full rounded-full" style={{ width: `${a.progress}%`, background: tone }} />
                        </div>
                      )}

                      {a.actualStart && (
                        <div
                          className="absolute bottom-0 h-1 rounded-full"
                          style={{
                            left: `${win.pos(a.actualStart)}%`,
                            width: `${Math.max(1, win.pos(a.actualFinish ?? today) - win.pos(a.actualStart))}%`,
                            background: STATUS_COLOR.green,
                          }}
                          title={`واقعی: ${fa(a.actualStart)} تا ${a.actualFinish ? fa(a.actualFinish) : 'در حال انجام'}`}
                        />
                      )}
                    </div>

                    {isOpen && (
                      <ActivityEditor
                        activity={a}
                        others={activities.filter((x) => x.id !== a.id)}
                        onSave={(patch) => updateActivity(a, patch)}
                        onDelete={async () => {
                          if (confirm(`ردیف «${a.name}» حذف شود؟`)) {
                            await deleteActivity(a.id, projectId)
                            setExpanded(null)
                          }
                        }}
                      />
                    )}
                  </Fragment>
                )
              })}
            </div>
          )}
          <p className="mt-3 text-[9px] text-muted">
            نوار کم‌رنگ هاشور‌دار = Baseline · نوار پررنگ قابل‌کشیدن = پیش‌بینی (کشیدن = جابه‌جایی تاریخ) · خط سبز زیرین = واقعی · خط زرد عمودی = امروز
          </p>
        </TowerTile>
      </div>
    </div>
  )
}

function ActivityEditor({ activity, others, onSave, onDelete }: {
  activity: Activity
  others: Activity[]
  onSave: (patch: Partial<Activity>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [form, setForm] = useState({
    name: activity.name,
    wbsCode: activity.wbsCode,
    status: activity.status as ActivityStatus,
    progress: activity.progress,
    baselineStart: activity.baselineStart ?? '',
    baselineFinish: activity.baselineFinish ?? '',
    forecastStart: activity.forecastStart ?? '',
    forecastFinish: activity.forecastFinish ?? '',
    actualStart: activity.actualStart ?? '',
    actualFinish: activity.actualFinish ?? '',
    isCritical: activity.isCritical,
    dependsOnId: activity.dependsOnId ?? '',
  })

  return (
    <div className="rounded-xl border p-3" style={{ gridColumn: '1 / -1', borderColor: 'var(--border-soft)' }}>
      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} placeholder="شرح ردیف" />
        <input value={form.wbsCode} onChange={(e) => setForm({ ...form, wbsCode: e.target.value })}
          className="w-full rounded-lg border bg-black/20 px-2.5 py-2 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} placeholder="کد WBS" />
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['baselineStart', 'baselineFinish', 'forecastStart', 'forecastFinish'] as const).map((k) => (
          <label key={k} className="text-[10px] text-muted">
            {k === 'baselineStart' ? 'شروع Baseline' : k === 'baselineFinish' ? 'پایان Baseline' : k === 'forecastStart' ? 'شروع پیش‌بینی' : 'پایان پیش‌بینی'}
            <input type="date" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
          </label>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[10px] text-muted">
          شروع واقعی
          <input type="date" value={form.actualStart} onChange={(e) => setForm({ ...form, actualStart: e.target.value })}
            className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
        </label>
        <label className="text-[10px] text-muted">
          پایان واقعی
          <input type="date" value={form.actualFinish} onChange={(e) => setForm({ ...form, actualFinish: e.target.value })}
            className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }} />
        </label>
        <label className="text-[10px] text-muted">
          وضعیت
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ActivityStatus })}
            className="mt-1 w-full rounded-lg border bg-black/20 px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }}>
            {Object.entries(ACTIVITY_STATUS_LABEL_FA).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-muted">
          پیشرفت ({faNum(form.progress)}٪)
          <input type="range" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })}
            className="mt-2.5 w-full" />
        </label>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select value={form.dependsOnId} onChange={(e) => setForm({ ...form, dependsOnId: e.target.value })}
          className="w-full rounded-lg border bg-black/20 px-2 py-2 text-xs outline-none" style={{ borderColor: 'var(--border-soft)' }}>
          <option value="">وابسته به — ندارد</option>
          {others.map((o) => <option key={o.id} value={o.id}>{o.wbsCode ? `${o.wbsCode} — ${o.name}` : o.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" checked={form.isCritical} onChange={(e) => setForm({ ...form, isCritical: e.target.checked })} />
          روی مسیر بحرانی است
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => onSave({
            name: form.name.trim() || activity.name,
            wbsCode: form.wbsCode.trim(),
            status: form.status,
            progress: form.progress,
            baselineStart: form.baselineStart || null,
            baselineFinish: form.baselineFinish || null,
            forecastStart: form.forecastStart || null,
            forecastFinish: form.forecastFinish || null,
            actualStart: form.actualStart || null,
            actualFinish: form.actualFinish || null,
            isCritical: form.isCritical,
            dependsOnId: form.dependsOnId || null,
          })}
          className="rounded-lg px-3 py-2 text-xs font-medium text-white" style={{ background: '#3b82f6' }}
        >
          ذخیره
        </button>
        <button onClick={onDelete} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors hover:bg-white/5"
          style={{ borderColor: 'var(--border-soft)', color: STATUS_COLOR.red }}>
          <Trash2 size={12} /> حذف ردیف
        </button>
      </div>
    </div>
  )
}
