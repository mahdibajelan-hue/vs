import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarClock, CheckCircle2, History, Rocket, Route } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { usePlanStore } from '../store/usePlanStore'
import { GATE_META } from '../lib/gateModel'
import { diffDaysIso } from '../lib/cpm'
import {
  GOV_STATUS_LABEL_FA, GOV_STATUS_ORDER, STRATEGY_HINT_FA, STRATEGY_LABEL_FA, canTransition,
  computeMasterSchedule, nextVersionLabel, type GovStatus, type StrategyKey,
} from '../lib/strategy'
import { EmptyState, STATUS_COLOR, fa, faNum } from '../components/ui'
import { TowerTile } from '../components/TowerTile'

const STRATEGIES: StrategyKey[] = ['sequential', 'overlapping', 'fast_track', 'emergency']
const STRATEGY_COLOR: Record<StrategyKey, string> = { sequential: '#64748b', overlapping: '#3b82f6', fast_track: '#f59e0b', emergency: '#ef4444' }

/** Execution strategy: pick how consecutive gates overlap, compute the CPM master schedule from
 * the fixed standard gate durations, write it to the gates, and keep immutable versions. */
export function StrategyPage({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const stages = useLifecycleStore((s) => s.bundle.stages)
  const setStagePlan = useLifecycleStore((s) => s.setStagePlan)
  const plan = usePlanStore()
  useEffect(() => { plan.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  const saved = plan.strategy
  const [strategy, setStrategy] = useState<StrategyKey>('sequential')
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10))
  const [gov, setGov] = useState<GovStatus>('draft')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (saved) { setStrategy(saved.strategy); setGov(saved.govStatus); if (saved.startDate) setStart(saved.startDate) }
  }, [saved])

  const sched = useMemo(() => computeMasterSchedule(strategy, start), [strategy, start])
  const all = useMemo(() => Object.fromEntries(STRATEGIES.map((k) => [k, computeMasterSchedule(k, start)])) as Record<StrategyKey, ReturnType<typeof computeMasterSchedule>>, [start])
  const seqDays = all.sequential.totalDays
  const ordered = stages.slice().sort((a, b) => a.sequence - b.sequence)
  const first = plan.versions[0]

  async function persist(next: Partial<{ strategy: StrategyKey; gov: GovStatus; start: string }>) {
    await plan.saveStrategy({
      projectId, strategy: next.strategy ?? strategy, govStatus: next.gov ?? gov, startDate: next.start ?? start, durations: null,
    })
  }
  async function applyToGates() {
    await setStagePlan(projectId, sched.gates.flatMap((g, i) => {
      const st = ordered[i]
      return st ? [{ stageKey: st.stageKey, start: g.start, finish: g.finish, standardDays: g.days }] : []
    }))
  }
  async function snapshot(kind: 'minor' | 'major') {
    const label = nextVersionLabel(plan.versions.map((v) => v.label), kind)
    await plan.recordVersion(projectId, label, strategy, sched, note)
    setNote('')
  }
  async function transition(to: GovStatus) {
    setGov(to)
    await persist({ gov: to })
    if (to === 'baseline') await snapshot('major')
    if (to === 'revised') await snapshot('minor')
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
      <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted hover:text-primary">
        <ArrowLeft size={13} /> بازگشت به برج کنترل
      </button>

      <div className="plc-bento">
        <TowerTile span={8} icon={<Route size={13} />} eyebrow="Execution strategy" title="راهبرد اجرا و زمان‌بندی کلان">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STRATEGIES.map((k) => {
              const active = strategy === k
              const saving = seqDays - all[k].totalDays
              return (
                <button key={k} onClick={() => { setStrategy(k); persist({ strategy: k }) }}
                  className="rounded-xl border p-2.5 text-start transition-colors"
                  style={{ borderColor: active ? STRATEGY_COLOR[k] : 'var(--border-soft)', background: active ? `${STRATEGY_COLOR[k]}1f` : undefined }}>
                  <p className="text-[11px] font-extrabold" style={{ color: active ? STRATEGY_COLOR[k] : undefined }}>{STRATEGY_LABEL_FA[k]}</p>
                  <p className="mt-0.5 text-[15px] font-extrabold">{faNum(all[k].totalDays)} <span className="text-[10px] font-normal text-muted">روز</span></p>
                  <p className="plc-stat-sub">{saving > 0 ? `${faNum(saving)} روز کوتاه‌تر از متوالی` : 'مبنای مقایسه'}</p>
                </button>
              )
            })}
          </div>
          <p className="plc-stat-sub mt-2">{STRATEGY_HINT_FA[strategy]} · مدت استاندارد هر گیت هرگز کوتاه نمی‌شود، فقط همپوشانی تغییر می‌کند.</p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="plc-stat-sub">تاریخ شروع پروژه</span>
            <JalaliDateInput value={start} onChange={(iso) => { setStart(iso); persist({ start: iso }) }} />
          </div>

          {/* Gate bars */}
          <div className="mt-4 space-y-1.5">
            {sched.gates.map((g, i) => {
              const m = GATE_META[i]
              const left = (g.es / sched.totalDays) * 100
              const width = (g.days / sched.totalDays) * 100
              return (
                <div key={g.code} className="flex items-center gap-2 text-[11px]">
                  <span className="w-20 shrink-0 font-bold">{m.icon} {g.code}</span>
                  <div className="relative h-5 flex-1 rounded bg-white/[0.04]">
                    <div className="absolute top-0.5 h-4 rounded" style={{ right: `${left}%`, width: `${width}%`, background: g.critical ? STATUS_COLOR.red : '#38bdf8', opacity: 0.85 }} />
                  </div>
                  <span className="w-44 shrink-0 text-muted">{fa(g.start)} ← {fa(g.finish)}</span>
                  <span className="w-16 shrink-0 text-muted">{g.critical ? 'بحرانی' : `شناوری ${faNum(g.float)}`}</span>
                </div>
              )
            })}
          </div>
        </TowerTile>

        <TowerTile span={4} icon={<CalendarClock size={13} />} eyebrow="Master schedule" title="خلاصهٔ زمان‌بندی کلان">
          <dl className="space-y-1.5 text-[12px]">
            <div className="flex justify-between"><dt className="text-muted">شروع</dt><dd className="font-bold">{fa(sched.startDate)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">شروع راه‌اندازی (G7)</dt><dd className="font-bold">{fa(sched.commissioningStart)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">تکمیل نهایی</dt><dd className="font-bold">{fa(sched.finishDate)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">مدت کل</dt><dd className="font-bold">{faNum(sched.totalDays)} روز</dd></div>
          </dl>
          <button onClick={applyToGates} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-500 py-2 text-[11px] font-bold text-white">
            <Rocket size={13} /> نوشتن تاریخ‌ها روی گیت‌ها
          </button>
          <p className="plc-stat-sub mt-1.5">فقط تاریخ‌های برنامه‌ای گیت‌ها نوشته می‌شود؛ چیز دیگری تغییر نمی‌کند.</p>
        </TowerTile>

        <TowerTile span={12} icon={<CheckCircle2 size={13} />} eyebrow="Governance" title="وضعیت حاکمیتی برنامه">
          <div className="flex flex-wrap items-center gap-1.5">
            {GOV_STATUS_ORDER.map((g, i) => {
              const active = g === gov
              const reachable = canTransition(gov, g)
              return (
                <div key={g} className="flex items-center gap-1.5">
                  <button disabled={!reachable} onClick={() => transition(g)}
                    className="rounded-full border px-3 py-1 text-[11px] font-bold disabled:cursor-default"
                    style={{
                      borderColor: active ? '#3b82f6' : 'var(--border-soft)',
                      background: active ? '#3b82f6' : undefined, color: active ? '#fff' : reachable ? undefined : '#64748b',
                    }}>{GOV_STATUS_LABEL_FA[g]}</button>
                  {i < GOV_STATUS_ORDER.length - 1 && <span className="text-muted">›</span>}
                </div>
              )
            })}
          </div>
          <p className="plc-stat-sub mt-2">با رفتن به «خط مبنا» نسخهٔ اصلی جدید و با «تجدیدنظرشده» نسخهٔ فرعی ثبت می‌شود. نسخه‌ها پس از ثبت قابل ویرایش نیستند.</p>
        </TowerTile>

        <TowerTile span={12} icon={<History size={13} />} eyebrow="Versions" title="نسخه‌های زمان‌بندی کلان (تغییرناپذیر)">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت نسخه"
              className="min-w-[180px] flex-1 rounded border bg-black/20 px-2 py-1.5 text-[11px]" style={{ borderColor: 'var(--border-soft)' }} />
            <button onClick={() => snapshot('minor')} className="rounded-lg border px-3 py-1.5 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>ثبت نسخهٔ فرعی</button>
            <button onClick={() => snapshot('major')} className="rounded-lg bg-sky-500 px-3 py-1.5 text-[11px] font-bold text-white">ثبت نسخهٔ اصلی</button>
          </div>
          {plan.versions.length === 0 ? <EmptyState message="هنوز نسخه‌ای ثبت نشده" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[11px]">
                <thead className="text-muted"><tr>
                  <th className="p-1 text-start">نسخه</th><th className="p-1 text-start">راهبرد</th><th className="p-1 text-start">شروع</th>
                  <th className="p-1 text-start">راه‌اندازی</th><th className="p-1 text-start">تکمیل</th><th className="p-1 text-start">مدت</th>
                  <th className="p-1 text-start">انحراف از اولین نسخه</th>
                </tr></thead>
                <tbody>
                  {[...plan.versions].reverse().map((v) => {
                    const d = first ? diffDaysIso(first.finishDate, v.finishDate) : 0
                    return (
                      <tr key={v.id} className="border-t" style={{ borderColor: 'var(--border-soft)' }}>
                        <td className="p-1 font-extrabold">{v.label}</td><td className="p-1">{STRATEGY_LABEL_FA[v.strategy]}</td>
                        <td className="p-1">{fa(v.startDate)}</td><td className="p-1">{fa(v.commissioningStart)}</td>
                        <td className="p-1">{fa(v.finishDate)}</td><td className="p-1">{faNum(v.totalDays)} روز</td>
                        <td className="p-1 font-bold" style={{ color: d > 0 ? STATUS_COLOR.red : d < 0 ? STATUS_COLOR.green : undefined }}>
                          {d === 0 ? '—' : `${d > 0 ? '+' : ''}${faNum(d)} روز`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TowerTile>
      </div>
    </div>
  )
}
