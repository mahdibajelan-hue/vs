import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  AlertTriangle, ArrowLeft, BookmarkPlus, ChevronDown, ChevronLeft, Link2, Lock, Plus, Sparkles, Trash2, Wand2,
} from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useLifecycleStore } from '../store/useLifecycleStore'
import { usePlanStore } from '../store/usePlanStore'
import {
  autoFitDates, autoFitWeights, baselineVariance, coverageIssues, dependencyViolations, fromTemplate,
  makeBaseline, rollupProgress, toTemplate, validateWeights, type PlanNode,
} from '../lib/planTree'
import { DEP_LABEL_FA, DEP_TYPES, addDaysIso, diffDaysIso, runCpm, type DepType } from '../lib/cpm'
import type { Activity } from '../types'
import { STAGE_LABEL_FA } from '../types'
import { EmptyState, STATUS_COLOR, STATUS_TEXT_COLOR, fa, faNum } from '../components/ui'
import { TowerTile } from '../components/TowerTile'

const toNode = (a: Activity): PlanNode => ({
  id: a.id, parentId: a.parentId, name: a.name, weight: a.weight, manualPct: a.manualPct,
  start: a.forecastStart, finish: a.forecastFinish,
})

/** Depth-first flattening with depth, honouring collapsed nodes. */
function flatten(nodes: PlanNode[], collapsed: Set<string>): { node: PlanNode; depth: number; hasKids: boolean }[] {
  const out: { node: PlanNode; depth: number; hasKids: boolean }[] = []
  const ids = new Set(nodes.map((n) => n.id))
  const walk = (parent: string | null, depth: number) => {
    for (const n of nodes.filter((x) => (parent === null ? !x.parentId || !ids.has(x.parentId) : x.parentId === parent))) {
      const hasKids = nodes.some((x) => x.parentId === n.id)
      out.push({ node: n, depth, hasKids })
      if (hasKids && !collapsed.has(n.id)) walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/** Master Plan as a weighted tree: bottom-up progress, FS/SS/FF/SF dependencies, drag-to-move
 * bars, coverage validation with Auto-Fit, frozen baselines and reusable success templates. */
export function PlanTreePage({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const activities = useLifecycleStore((s) => s.bundle.activities)
  const stages = useLifecycleStore((s) => s.bundle.stages)
  const createActivity = useLifecycleStore((s) => s.createActivity)
  const updateActivity = useLifecycleStore((s) => s.updateActivity)
  const deleteActivity = useLifecycleStore((s) => s.deleteActivity)
  const patchActivities = useLifecycleStore((s) => s.patchActivities)
  const insertTree = useLifecycleStore((s) => s.insertActivityTree)
  const plan = usePlanStore()

  useEffect(() => { plan.load(projectId) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [projectId])

  const [stageFilter, setStageFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [cmpBaseline, setCmpBaseline] = useState('')
  const [depForm, setDepForm] = useState({ from: '', to: '', type: 'FS' as DepType, lag: 0 })
  const [drag, setDrag] = useState<{ id: string; startX: number; width: number; delta: number } | null>(null)
  const [tplName, setTplName] = useState('')
  const [tplStart, setTplStart] = useState(new Date().toISOString().slice(0, 10))
  const [msg, setMsg] = useState('')

  const scoped = useMemo(() => {
    const all = activities.slice().sort((a, b) => a.sequence - b.sequence)
    return stageFilter ? all.filter((a) => a.stageKey === stageFilter) : all
  }, [activities, stageFilter])
  const nodes = useMemo(() => scoped.map(toNode), [scoped])
  const progress = useMemo(() => rollupProgress(nodes), [nodes])
  const rows = useMemo(() => flatten(nodes, collapsed), [nodes, collapsed])
  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities])
  const nameOf = (id: string) => byId.get(id)?.name ?? '—'

  const weightIssues = validateWeights(nodes)
  const covIssues = coverageIssues(nodes)
  const violations = dependencyViolations(nodes, plan.deps.map((d) => ({ from: d.fromId, to: d.toId, type: d.type, lag: d.lag })))
  const baseline = plan.baselines.find((b) => b.id === cmpBaseline)
  const variance = baseline ? baselineVariance(nodes, { ...baseline }) : null

  const dated = nodes.filter((n) => n.start && n.finish)
  const winStart = dated.reduce((m, n) => (n.start! < m ? n.start! : m), dated[0]?.start ?? new Date().toISOString().slice(0, 10))
  const winEnd = dated.reduce((m, n) => (n.finish! > m ? n.finish! : m), dated[0]?.finish ?? winStart)
  const span = Math.max(1, diffDaysIso(winStart, winEnd))
  const pos = (iso: string) => Math.min(100, Math.max(0, (diffDaysIso(winStart, iso) / span) * 100))

  const descendants = (id: string): string[] => {
    const kids = nodes.filter((n) => n.parentId === id).map((n) => n.id)
    return kids.flatMap((k) => [k, ...descendants(k)])
  }

  async function addChild(parent: PlanNode | null) {
    const name = prompt('عنوان آیتم جدید')
    if (!name?.trim()) return
    await createActivity(projectId, {
      name: name.trim(), parentId: parent?.id ?? null, weight: 0, stageKey: stageFilter || (parent ? byId.get(parent.id)?.stageKey : '') || '',
      forecastStart: parent?.start ?? null, forecastFinish: parent?.finish ?? null,
    })
    setMsg('آیتم اضافه شد؛ وزن آن را تنظیم کنید یا «تنظیم خودکار وزن» را بزنید.')
  }

  async function onFitWeights() {
    const fitted = autoFitWeights(nodes)
    await patchActivities(projectId, fitted.filter((n, i) => n.weight !== nodes[i].weight).map((n) => ({ id: n.id, patch: { weight: n.weight } })), 'weights_autofit')
  }
  async function onFitDates(parentId: string) {
    const fitted = autoFitDates(nodes, parentId)
    await patchActivities(projectId, fitted.filter((n, i) => n.start !== nodes[i].start || n.finish !== nodes[i].finish)
      .map((n) => ({ id: n.id, patch: { forecastStart: n.start, forecastFinish: n.finish } })), 'dates_autofit')
  }

  /** Re-times leaves from their dependencies (CPM), preserving each leaf's duration, then
   * stretches every parent to span its children. */
  async function onApplyDeps() {
    const leaves = nodes.filter((n) => n.start && n.finish && !nodes.some((x) => x.parentId === n.id))
    const origin = leaves.reduce((m, n) => (n.start! < m ? n.start! : m), leaves[0]?.start ?? winStart)
    const out = runCpm(
      leaves.map((n) => ({ id: n.id, duration: Math.max(1, diffDaysIso(n.start!, n.finish!)), notBefore: diffDaysIso(origin, n.start!) })),
      plan.deps.map((d) => ({ from: d.fromId, to: d.toId, type: d.type, lag: d.lag })),
    )
    if (out.cycle) { setMsg('وابستگی‌ها حلقه دارند؛ ابتدا حلقه را برطرف کنید.'); return }
    let next = nodes.map((n) => {
      const r = out.tasks.get(n.id)
      return r ? { ...n, start: addDaysIso(origin, r.es), finish: addDaysIso(origin, r.ef) } : n
    })
    // Parents span their children, deepest first.
    const depth = (n: PlanNode): number => (n.parentId ? 1 + depth(next.find((x) => x.id === n.parentId) ?? { ...n, parentId: null }) : 0)
    for (const p of [...next].filter((n) => next.some((x) => x.parentId === n.id)).sort((a, b) => depth(b) - depth(a))) {
      const ch = next.filter((x) => x.parentId === p.id && x.start && x.finish)
      if (ch.length === 0) continue
      const s = ch.reduce((m, c) => (c.start! < m ? c.start! : m), ch[0].start!)
      const f = ch.reduce((m, c) => (c.finish! > m ? c.finish! : m), ch[0].finish!)
      next = next.map((n) => (n.id === p.id ? { ...n, start: s, finish: f } : n))
    }
    await patchActivities(projectId, next.filter((n, i) => n.start !== nodes[i].start || n.finish !== nodes[i].finish)
      .map((n) => ({ id: n.id, patch: { forecastStart: n.start, forecastFinish: n.finish } })), 'deps_applied')
    setMsg('تاریخ‌ها بر اساس وابستگی‌ها محاسبه شد.')
  }

  async function onBaseline() {
    const label = `خط مبنا ${faNum(plan.baselines.length + 1)}`
    const b = makeBaseline('', label, '', activities.map(toNode))
    await plan.takeBaseline(projectId, label, b.rows.map((r) => ({ ...r })))
  }

  async function onSaveTemplate() {
    if (!tplName.trim()) return
    await plan.saveTemplate(tplName.trim(), '', toTemplate(nodes))
    setTplName('')
  }
  async function onApplyTemplate(tplId: string) {
    const t = plan.templates.find((x) => x.id === tplId)
    if (!t) return
    const ids = new Map<string, string>()
    const nid = (k: string) => { if (!ids.has(k)) ids.set(k, crypto.randomUUID()); return ids.get(k)! }
    const made = fromTemplate(t.nodes, tplStart, nid)
    await insertTree(projectId, made.map((n) => ({ id: n.id, parentId: n.parentId, name: n.name, weight: n.weight, start: n.start!, finish: n.finish!, stageKey: stageFilter })))
    setMsg(`قالب «${t.name}» روی تاریخ شروع ${fa(tplStart)} اعمال شد.`)
  }

  function startDrag(e: ReactPointerEvent<HTMLDivElement>, id: string, width: number) {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id, startX: e.clientX, width, delta: 0 })
  }
  function moveDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return
    const delta = Math.round(((e.clientX - drag.startX) / drag.width) * span)
    if (delta !== drag.delta) setDrag({ ...drag, delta })
  }
  async function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    const { id, delta } = drag
    setDrag(null)
    if (delta === 0) return
    const ids = [id, ...descendants(id)]
    await patchActivities(projectId, ids.flatMap((i) => {
      const n = nodes.find((x) => x.id === i)
      return n?.start && n.finish ? [{ id: i, patch: { forecastStart: addDaysIso(n.start, delta), forecastFinish: addDaysIso(n.finish, delta) } }] : []
    }), 'drag_move')
  }

  const stageOptions = [...new Set(activities.map((a) => a.stageKey).filter(Boolean))]
  const stageName = (k: string) => stages.find((s) => s.stageKey === k)?.nameFa ?? STAGE_LABEL_FA[k as keyof typeof STAGE_LABEL_FA] ?? k

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted hover:text-primary">
          <ArrowLeft size={13} /> بازگشت به برج کنترل
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-lg border bg-black/20 px-2 py-1.5 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
            <option value="">همه گیت‌ها</option>
            {stageOptions.map((k) => <option key={k} value={k}>{stageName(k)}</option>)}
          </select>
          <button onClick={() => addChild(null)} className="flex items-center gap-1 rounded-lg bg-sky-500 px-2.5 py-1.5 text-[11px] font-bold text-white">
            <Plus size={12} /> آیتم ریشه
          </button>
          <button onClick={onApplyDeps} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
            <Link2 size={12} /> اعمال وابستگی‌ها
          </button>
          <button onClick={onBaseline} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
            <Lock size={12} /> ثبت خط مبنا
          </button>
        </div>
      </div>

      {msg && <p className="rounded-lg border px-3 py-2 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>{msg}</p>}

      {(weightIssues.length > 0 || covIssues.length > 0 || violations.length > 0) && (
        <div className="space-y-1.5 rounded-xl border p-3" style={{ borderColor: `${STATUS_COLOR.yellow}55`, background: `${STATUS_COLOR.yellow}0d` }}>
          <p className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: STATUS_TEXT_COLOR.yellow }}>
            <AlertTriangle size={13} /> اعتبارسنجی برنامه
          </p>
          {weightIssues.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-[11px]">
              مجموع وزن خواهر-برادرها در {faNum(weightIssues.length)} گروه ۱۰۰٪ نیست (مثلاً {faNum(weightIssues[0].sum)}٪).
              <button onClick={onFitWeights} className="flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300">
                <Wand2 size={11} /> تنظیم خودکار وزن
              </button>
            </p>
          )}
          {[...new Set(covIssues.map((c) => c.parentId))].map((pid) => (
            <p key={pid} className="flex flex-wrap items-center gap-2 text-[11px]">
              زیرآیتم‌های «{nameOf(pid)}» کل بازهٔ آن را دقیق پوشش نمی‌دهند یا از آن بیرون‌اند.
              <button onClick={() => onFitDates(pid)} className="flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 font-bold text-amber-300">
                <Sparkles size={11} /> Auto-Fit بازه
              </button>
            </p>
          ))}
          {violations.map((v, i) => (
            <p key={i} className="text-[11px]">وابستگی «{nameOf(v.from)}» → «{nameOf(v.to)}» به اندازهٔ {faNum(v.shortBy)} روز نقض شده است.</p>
          ))}
        </div>
      )}

      <TowerTile span={12} icon={<ChevronDown size={13} />} eyebrow="Plan tree" title={`درخت برنامه (${faNum(rows.length)} آیتم)`}>
        {rows.length === 0 ? (
          <EmptyState message="هنوز آیتمی نیست. یک آیتم ریشه بسازید یا از یک قالب موفق استفاده کنید." />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px] space-y-1">
              {rows.map(({ node, depth, hasKids }) => {
                const pct = progress.get(node.id) ?? 0
                const act = byId.get(node.id)
                const open = editing === node.id
                const delta = drag?.id === node.id ? drag.delta : 0
                const s = node.start ? pos(addDaysIso(node.start, delta)) : 0
                const f = node.finish ? pos(addDaysIso(node.finish, delta)) : 0
                const v = variance?.get(node.id)
                return (
                  <div key={node.id} className="rounded-lg border px-2 py-1.5" style={{ borderColor: 'var(--border-soft)' }}>
                    <div className="flex items-center gap-2">
                      <div className="flex w-[240px] shrink-0 items-center gap-1" style={{ paddingInlineStart: depth * 14 }}>
                        {hasKids ? (
                          <button onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(node.id)) n.delete(node.id); else n.add(node.id); return n })}>
                            {collapsed.has(node.id) ? <ChevronLeft size={13} /> : <ChevronDown size={13} />}
                          </button>
                        ) : <span className="w-[13px]" />}
                        <button onClick={() => setEditing(open ? null : node.id)} className={`truncate text-start text-[12px] ${hasKids ? 'font-extrabold' : ''}`}>{node.name}</button>
                      </div>
                      <input type="number" min={0} max={100} value={node.weight}
                        onChange={(e) => act && updateActivity(act, { weight: Math.max(0, Math.min(100, Number(e.target.value))) })}
                        title="وزن بین خواهر-برادرها (٪)"
                        className="w-12 rounded border bg-black/20 px-1 py-0.5 text-center text-[11px]" style={{ borderColor: 'var(--border-soft)' }} />
                      {hasKids ? (
                        <span className="w-14 text-center text-[11px] font-bold" title="محاسبه‌شده از زیرآیتم‌ها">{faNum(Math.round(pct))}٪ ∑</span>
                      ) : (
                        <input type="number" min={0} max={100} value={node.manualPct}
                          onChange={(e) => act && updateActivity(act, { manualPct: Math.max(0, Math.min(100, Number(e.target.value))) })}
                          className="w-14 rounded border bg-black/20 px-1 py-0.5 text-center text-[11px]" style={{ borderColor: 'var(--border-soft)' }} />
                      )}
                      <div className="relative h-5 min-w-0 flex-1 rounded bg-white/[0.04]"
                        ref={(el) => { if (el && drag?.id === node.id && drag.width !== el.clientWidth) drag.width = el.clientWidth }}>
                        {node.start && node.finish && (
                          <div
                            onPointerDown={(e) => startDrag(e, node.id, (e.currentTarget.parentElement as HTMLElement).clientWidth)}
                            onPointerMove={moveDrag} onPointerUp={endDrag}
                            className="absolute top-0.5 h-4 cursor-grab touch-none overflow-hidden rounded active:cursor-grabbing"
                            style={{ right: `${100 - f}%`, left: `${s}%`, background: hasKids ? '#475569' : '#0ea5e955', border: '1px solid #38bdf8aa' }}
                          >
                            <div className="h-full" style={{ width: `${pct}%`, background: pct >= 100 ? STATUS_COLOR.green : '#38bdf8' }} />
                          </div>
                        )}
                      </div>
                      {v !== undefined && (
                        <span className="w-14 text-center text-[10px] font-bold" style={{ color: v > 0 ? STATUS_TEXT_COLOR.red : v < 0 ? STATUS_TEXT_COLOR.green : undefined }}>
                          {v === 0 ? '±۰' : `${v > 0 ? '+' : ''}${faNum(v)}د`}
                        </span>
                      )}
                      <button onClick={() => addChild(node)} title="افزودن زیرآیتم"><Plus size={13} /></button>
                      <button onClick={() => confirm(`«${node.name}» و زیرآیتم‌هایش حذف شود؟`) && deleteActivity(node.id, projectId)} title="حذف"><Trash2 size={13} className="text-red-400" /></button>
                    </div>
                    {open && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 border-t pt-2" style={{ borderColor: 'var(--border-soft)' }}>
                        <span className="plc-stat-sub">شروع</span>
                        <JalaliDateInput value={node.start ?? ''} onChange={(iso) => act && updateActivity(act, { forecastStart: iso }, 'ویرایش دستی تاریخ')} />
                        <span className="plc-stat-sub">پایان</span>
                        <JalaliDateInput value={node.finish ?? ''} onChange={(iso) => act && updateActivity(act, { forecastFinish: iso }, 'ویرایش دستی تاریخ')} />
                        <span className="plc-stat-sub">{node.start && node.finish ? `${faNum(diffDaysIso(node.start, node.finish))} روز` : ''}</span>
                        {plan.deps.filter((d) => d.toId === node.id).map((d) => (
                          <span key={d.id} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px]">
                            ← {nameOf(d.fromId)} ({d.type}{d.lag ? `${d.lag > 0 ? '+' : ''}${faNum(d.lag)}` : ''})
                            <button className="ms-1 text-red-400" onClick={() => plan.removeDep(projectId, d.id)}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <p className="plc-stat-sub pt-1">ستون‌ها: عنوان · وزن · پیشرفت (∑ = محاسبه‌شده از فرزندان) · نوار قابل کشیدن{baseline ? ' · انحراف از خط مبنا' : ''}. {faNum(rows.length)} ردیف.</p>
            </div>
          </div>
        )}
      </TowerTile>

      <div className="plc-bento">
        <TowerTile span={4} icon={<Link2 size={13} />} eyebrow="Dependencies" title="وابستگی‌ها">
          <div className="space-y-1.5">
            <select value={depForm.from} onChange={(e) => setDepForm({ ...depForm, from: e.target.value })} className="w-full rounded border bg-black/20 px-1.5 py-1 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
              <option value="">پیش‌نیاز (از)</option>{scoped.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={depForm.to} onChange={(e) => setDepForm({ ...depForm, to: e.target.value })} className="w-full rounded border bg-black/20 px-1.5 py-1 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
              <option value="">پس‌نیاز (به)</option>{scoped.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <div className="flex gap-1.5">
              <select value={depForm.type} onChange={(e) => setDepForm({ ...depForm, type: e.target.value as DepType })} className="flex-1 rounded border bg-black/20 px-1.5 py-1 text-[11px]" style={{ borderColor: 'var(--border-soft)' }}>
                {DEP_TYPES.map((t) => <option key={t} value={t}>{t} — {DEP_LABEL_FA[t]}</option>)}
              </select>
              <input type="number" value={depForm.lag} onChange={(e) => setDepForm({ ...depForm, lag: Number(e.target.value) })} title="Lag (+) / Lead (−) به روز"
                className="w-16 rounded border bg-black/20 px-1.5 py-1 text-center text-[11px]" style={{ borderColor: 'var(--border-soft)' }} />
            </div>
            <button disabled={!depForm.from || !depForm.to || depForm.from === depForm.to}
              onClick={() => plan.addDep(projectId, depForm.from, depForm.to, depForm.type, depForm.lag)}
              className="w-full rounded-lg bg-sky-500 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">افزودن وابستگی</button>
            <p className="plc-stat-sub">عدد منفی = Lead، مثبت = Lag (روز). {faNum(plan.deps.length)} وابستگی ثبت شده.</p>
          </div>
        </TowerTile>

        <TowerTile span={4} icon={<Lock size={13} />} eyebrow="Baselines" title="خط‌های مبنا (تغییرناپذیر)">
          {plan.baselines.length === 0 ? <EmptyState message="هنوز خط مبنایی ثبت نشده" /> : (
            <ul className="space-y-1">
              {plan.baselines.map((b) => (
                <li key={b.id} className="flex items-center justify-between text-[11px]">
                  <span>{b.label} <span className="text-muted">· {fa(b.createdAt)}</span></span>
                  <label className="flex items-center gap-1 text-[10px]">
                    <input type="radio" name="cmp" checked={cmpBaseline === b.id} onChange={() => setCmpBaseline(b.id)} /> مقایسه
                  </label>
                </li>
              ))}
              {cmpBaseline && <button className="plc-stat-sub underline" onClick={() => setCmpBaseline('')}>پاک‌کردن مقایسه</button>}
            </ul>
          )}
          <p className="plc-stat-sub mt-2">هر ثبت یک عکس‌برداری جدید است؛ خط مبنای قبلی هرگز ویرایش نمی‌شود.</p>
        </TowerTile>

        <TowerTile span={4} icon={<BookmarkPlus size={13} />} eyebrow="Success templates" title="قالب‌های موفق">
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="نام قالب"
                className="min-w-0 flex-1 rounded border bg-black/20 px-1.5 py-1 text-[11px]" style={{ borderColor: 'var(--border-soft)' }} />
              <button disabled={!tplName.trim() || nodes.length === 0} onClick={onSaveTemplate} className="rounded-lg bg-sky-500 px-2.5 text-[11px] font-bold text-white disabled:opacity-40">ذخیره</button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="plc-stat-sub shrink-0">شروع پروژهٔ جدید</span>
              <JalaliDateInput value={tplStart} onChange={setTplStart} />
            </div>
            <ul className="max-h-32 space-y-1 overflow-auto">
              {plan.templates.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-[11px]">
                  <span>{t.name} <span className="text-muted">({faNum(t.nodes.length)})</span></span>
                  <span className="flex gap-1.5">
                    <button className="font-bold text-sky-400" onClick={() => onApplyTemplate(t.id)}>اعمال</button>
                    <button className="text-red-400" onClick={() => plan.deleteTemplate(t.id)}>حذف</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </TowerTile>
      </div>
    </div>
  )
}
