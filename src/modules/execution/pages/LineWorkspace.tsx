import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, CornerUpLeft, CornerUpRight, Flame, GitCommitHorizontal, Layers, ListChecks, Search, Spline, Warehouse, X } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useExecutionStore } from '../store/useExecutionStore'
import { useEpcStore } from '../store/useEpcStore'
import { useExecutionModel } from '../lib/useExecutionModel'
import { projectParties } from '../lib/projectParties'
import { chainText } from '../lib/chainage'
import { registerKey, welderQualified } from '../lib/registers'
import { stringRows, yardPipes, type YardPipe } from '../lib/pipeYard'
import { DEFAULT_SECTION_PLAN, lineSections, type JointRec, type SectionPlan, type Slot, type StrungPipe } from '../lib/sections'
import { OPEN_FOR_ENTRY, PASSES, SIDES, bendRow, bendsByPipe, dayReport, jointRecords, lineEndKm, stampField, strungPipes, weldRow, type BendInput, type Stamps } from '../lib/lineWork'
import { fa } from '../components/common'
import { KmInput } from '../components/KmInput'
import { LineStrip, thicknessColors } from '../components/LineStrip'
import { SectionBoard } from '../components/SectionBoard'
import { PipeYard } from '../components/PipeYard'
import { fmtD } from '../../finance/components/fn'

type Mode = 'string' | 'bend' | 'fitup' | 'weld'
const MODES: { id: Mode; form: string; label: string; hint: string; icon: typeof Warehouse }[] = [
  { id: 'string', form: 'string', label: 'ریسه از دپو', hint: 'لوله‌ها را دسته‌ای از دپو بردارید و روی خط بچینید', icon: Warehouse },
  { id: 'bend', form: 'bend', label: 'خمکاری', hint: 'لوله را روی خط پیدا کنید، جهت و زاویهٔ خم را بزنید', icon: Spline },
  { id: 'fitup', form: 'fitup', label: 'فیت‌آپ', hint: 'جای سرجوش‌ها را بین لوله‌ها علامت بزنید', icon: GitCommitHorizontal },
  { id: 'weld', form: 'welding', label: 'جوشکاری', hint: 'سرجوش را بزنید و مهر جوشکاران هر پاس را بگذارید', icon: Flame },
]

/**
 * «میز کار خط» — the site's work entered on a picture of the line instead of in tables: strings from the depot, bends
 * on a pipe, joints between pipes, welders on a joint. Every act becomes rows of that day's site minute of its form
 * (one per day and front), which is then completed, signed and sent like any minute; its rows can still be corrected
 * in the minute's table.
 */
export function LineWorkspace({ projectId }: { projectId: string; sub?: string; onGo?: unknown }) {
  const m = useExecutionModel(projectId)
  const ex = useExecutionStore()
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === projectId)), orgs = useMasterDataStore((s) => s.organizations)
  const regPipes = useEpcStore((x) => x.pipes), regWelders = useEpcStore((x) => x.welders), regQuals = useEpcStore((x) => x.quals)
  useEffect(() => { void useEpcStore.getState().refreshRegisters(projectId) }, [projectId])
  const pipeList = useMemo(() => regPipes.filter((p) => p.projectId === projectId), [regPipes, projectId])
  const [mode, setMode] = useState<Mode>('string')
  const [date, setDate] = useState(m.today)
  const fronts = useMemo(() => [...new Set([...m.settings.expectedFronts, ...m.reports.map((r) => r.front).filter(Boolean)])], [m.settings.expectedFronts, m.reports])
  const [front, setFront] = useState(() => m.reports.filter((r) => ['string', 'fitup', 'welding', 'bend'].includes(r.formKey)).sort((a, b) => b.reportDate.localeCompare(a.reportDate))[0]?.front ?? fronts[0] ?? '')
  const [toast, setToast] = useState<{ ok: boolean; text: string; reportId?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const canRecord = ex.can(projectId, 'record')

  const plan: SectionPlan = useMemo(() => ({ ...DEFAULT_SECTION_PLAN, ...(m.settings.sectionPlan ?? {}) }), [m.settings.sectionPlan])
  const strung = useMemo(() => strungPipes(m.lines, m.reports, pipeList), [m.lines, m.reports, pipeList])
  const joints = useMemo(() => jointRecords(m.lines, m.reports), [m.lines, m.reports])
  const sections = useMemo(() => lineSections(strung, joints.filter((j) => j.before && j.after), plan), [strung, joints, plan])
  const colors = useMemo(() => thicknessColors([...pipeList.map((p) => p.wtIn)]), [pipeList])
  const cur = MODES.find((x) => x.id === mode)!
  const minute = dayReport(m.reports, cur.form, date, front)
  const minuteRows = minute ? (m.linesByReport.get(minute.id) ?? []).length : 0

  /** write rows into the day's minute of the mode's form and say where they went */
  const commit = async (form: string, rows: Record<string, unknown>[], what: string) => {
    if (!rows.length) return false
    setBusy(true)
    const myOrg = ex.roles.find((x) => x.projectId === projectId && x.active && x.organizationId)?.organizationId ?? null
    const res = await ex.appendToDay({ projectId, formKey: form, date, front, contractorOrgId: projectParties(project, orgs).contractor?.id ?? myOrg, rows })
    setBusy(false)
    if ('error' in res) { setToast({ ok: false, text: res.error }); return false }
    setToast({ ok: true, text: `${what} در صورتجلسهٔ ${res.reportNo}${res.created ? ' (تازه ساخته شد)' : ''} ثبت شد.`, reportId: res.reportId })
    return true
  }
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t) }, [toast])
  const openMinute = (id: string) => useExecutionStore.getState().setFocus(id, 'daily')

  return (
    <div className="lw" dir="rtl">
      <header className="lw-head im-card">
        <div className="lw-title"><span className="lw-ico" aria-hidden><Layers size={20} /></span><div><b>میز کار خط</b><small>کار امروز را روی تصویر خط ثبت کنید؛ صورتجلسه‌ها خودکار ساخته می‌شوند و گردش امضا را طی می‌کنند.</small></div></div>
        <div className="lw-ctx">
          <label><span>تاریخ کار</span><JalaliDateInput value={date} onChange={(v) => setDate(v || m.today)} /></label>
          <label><span>جبهه</span><select value={front} onChange={(e) => setFront(e.target.value)}>{!fronts.includes(front) && <option value={front}>{front || '—'}</option>}{fronts.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
        </div>
      </header>

      <nav className="lw-modes" role="tablist" aria-label="عملیات">
        {MODES.map((x, i) => { const r = dayReport(m.reports, x.form, date, front); const n = r ? (m.linesByReport.get(r.id) ?? []).length : 0; return (
          <button key={x.id} type="button" role="tab" aria-selected={mode === x.id} className={mode === x.id ? 'on' : ''} onClick={() => setMode(x.id)}>
            <span className="lw-step">{fa(i + 1)}</span><x.icon size={17} aria-hidden /><b>{x.label}</b>{n > 0 && <em title={`${fa(n)} ردیف در صورتجلسهٔ ${r!.reportNo}`}>{fa(n)}</em>}
          </button>
        ) })}
      </nav>

      <div className="lw-minute">
        <ListChecks size={15} aria-hidden />
        {minute
          ? <span>صورتجلسهٔ امروز: <b dir="ltr">{minute.reportNo}</b> · {fa(minuteRows)} ردیف · {OPEN_FOR_ENTRY.includes(minute.status) ? 'در حال تکمیل' : 'ارسال‌شده — ردیف تازه نمی‌گیرد'}</span>
          : <span>صورتجلسهٔ «{cur.label}» برای {fmtD(date)} هنوز ساخته نشده؛ با اولین ثبت ساخته می‌شود.</span>}
        {minute && <button type="button" className="im-btn im-btn-sm" onClick={() => openMinute(minute.id)}>باز کردن صورتجلسه (ویرایش ردیف‌ها، امضا و ارسال)</button>}
        <small className="lw-hint">{cur.hint}</small>
      </div>

      {!canRecord && <p className="im-card lw-ro">نقش شما در این پروژه ثبت گزارش ندارد؛ می‌توانید خط را ببینید.</p>}

      <div className="lw-stage" key={mode}>
        {mode === 'string' && <StringStage projectId={projectId} pipeList={pipeList} strung={strung} lines={m.lines} reports={m.reports} colors={colors} disabled={!canRecord || busy}
          onString={(rows, n) => commit('string', rows, `ریسهٔ ${fa(n)} شاخه`)} />}
        {mode === 'fitup' && (sections.length ? <SectionBoard inline sections={sections} plan={plan} joints={joints} canPlan={ex.can(projectId, 'configure')} onPlan={(p) => ex.saveSettings(projectId, { sectionPlan: p })}
          onAdd={(rows) => { if (canRecord) void commit('fitup', rows, `${fa(rows.length)} سرجوش فیت‌آپ`) }} /> : <Empty />)}
        {(mode === 'bend' || mode === 'weld') && (sections.length
          ? <LineStage mode={mode} sections={sections} colors={colors} bends={bendsByPipe(m.lines, m.reports)} welders={regWelders.filter((w) => w.projectId === projectId && w.kind !== 'coater' && w.status === 'active')} quals={regQuals.filter((q) => q.projectId === projectId)}
              lastStamps={lastStamps(m.lines, m.reports)} date={date} disabled={!canRecord || busy}
              onBend={(p, b) => commit('bend', [bendRow(p, b)], `خم لولهٔ ${p.raw}`)}
              onWeld={(js, stamps, vt) => commit('welding', js.map(({ j, after }) => weldRow(j, after, stamps, vt)), `جوش ${fa(js.length)} سرجوش`)} />
          : <Empty />)}
      </div>

      {toast && (
        <div className={`lw-toast ${toast.ok ? 'ok' : 'bad'}`} role="status">
          <span className="lw-toast-ico" aria-hidden>{toast.ok ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}</span>
          <span>{toast.text}</span>
          {toast.reportId && <button type="button" className="im-btn im-btn-sm" onClick={() => openMinute(toast.reportId!)}>دیدن صورتجلسه</button>}
          <button type="button" className="lw-toast-x" onClick={() => setToast(null)} aria-label="بستن"><X size={14} /></button>
        </div>
      )}
    </div>
  )
}

const Empty = () => <p className="im-card lw-empty">هنوز لوله‌ای با محل ریسه روی خط نیست؛ از مرحلهٔ «ریسه از دپو» شروع کنید.</p>

/** the stamps of the last joint welded (by date): «like the last joint» for the next one */
function lastStamps(lines: { reportId: string; status: string; detail: Record<string, unknown> }[], reports: { id: string; formKey: string; reportDate: string }[]): Stamps {
  const date = new Map(reports.filter((r) => r.formKey === 'welding').map((r) => [r.id, r.reportDate]))
  const pick = lines.filter((l) => date.has(l.reportId) && l.status !== 'rejected').sort((a, b) => (date.get(b.reportId) ?? '').localeCompare(date.get(a.reportId) ?? ''))[0]
  const out: Stamps = {}
  if (pick) for (const p of PASSES) for (const s of SIDES) { const f = stampField(p.k, s.k); if (pick.detail[f]) out[f] = String(pick.detail[f]) }
  return out
}

/* ── stringing: the depot as racks of pipe ends, picked by the stack ───────────────────────── */
function StringStage({ pipeList, strung, lines, reports, colors, disabled, onString }: {
  projectId: string; pipeList: Parameters<typeof yardPipes>[0]; strung: StrungPipe[]; lines: Parameters<typeof yardPipes>[1]; reports: Parameters<typeof yardPipes>[2]
  colors: Map<number, string>; disabled: boolean; onString: (rows: Record<string, unknown>[], n: number) => Promise<boolean>
}) {
  const yard = useMemo(() => yardPipes(pipeList, lines, reports, '', []), [pipeList, lines, reports])
  const depots = useMemo(() => {
    const m = new Map<string, Map<number, YardPipe[]>>()
    for (const p of yard) { const d = m.get(p.depot) ?? new Map<number, YardPipe[]>(); const k = p.wtIn ?? -1; d.set(k, [...(d.get(k) ?? []), p]); m.set(p.depot, d) }
    return [...m].map(([name, piles]) => ({ name, piles: [...piles].sort((a, b) => a[0] - b[0]).map(([thk, ps]) => ({ thk, ps })) }))
  }, [yard])
  const end = lineEndKm(strung)
  const [pick, setPick] = useState<{ depot: string; thk: number } | null>(null)
  const [count, setCount] = useState(10)
  const [km, setKm] = useState<number | null>(end)
  useEffect(() => { setKm(end) }, [end])
  const [flying, setFlying] = useState(false)
  const [list, setList] = useState(false)
  const pile = pick ? depots.find((d) => d.name === pick.depot)?.piles.find((p) => p.thk === pick.thk)?.ps ?? [] : []
  const take = pile.slice(0, Math.min(count, pile.length)) // the oldest delivery first
  const go = async () => {
    if (!take.length) return
    setFlying(true)
    await new Promise((r) => setTimeout(r, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650))
    const ok = await onString(stringRows(take, km), take.length)
    setFlying(false)
    if (ok && take.length >= pile.length) setPick(null) // the stack is used up
  }
  return (
    <div className="lw-string">
      <div className="lw-yardbar">
        <span><Warehouse size={15} aria-hidden /> {fa(yard.length)} شاخهٔ ریسه‌نشده در {fa(depots.length)} دپو</span>
        <span>انتهای ریسه روی خط: <b dir="ltr">{end != null ? chainText(end) : '—'}</b></span>
        <button type="button" className="im-btn im-btn-sm" disabled={disabled || !yard.length} onClick={() => setList(true)}>انتخاب تک‌به‌تک از فهرست</button>
      </div>
      {depots.length === 0 ? <p className="im-card lw-empty">لولهٔ ریسه‌نشده‌ای در دپو نیست؛ ابتدا صورتجلسهٔ ورود لوله ثبت شود.</p> : (
        <div className="lw-depots">
          {depots.map((d) => (
            <section key={d.name} className="lw-depot im-card" aria-label={d.name}>
              <header><b>{d.name}</b><small>{fa(d.piles.reduce((s, p) => s + p.ps.length, 0))} شاخه · {fa(d.piles.reduce((s, p) => s + p.ps.reduce((t, x) => t + (x.lengthM ?? 0), 0), 0), 0)} متر</small></header>
              <div className="lw-piles">
                {d.piles.map((p) => { const on = pick?.depot === d.name && pick.thk === p.thk; const c = colors.get(p.thk) ?? '#64748b'; const shown = Math.min(p.ps.length, 21); const lifted = on ? Math.min(count, p.ps.length) : 0; return (
                  <button key={p.thk} type="button" className={`lw-pile${on ? ' on' : ''}${on && flying ? ' fly' : ''}`} style={{ ['--c' as string]: c }} aria-pressed={on} disabled={disabled}
                    onClick={() => setPick(on ? null : { depot: d.name, thk: p.thk })}>
                    <span className="lw-stack" aria-hidden>{pyramid(shown).map((row, ri) => <span key={ri} className="lw-row">{row.map((idx) => <i key={idx} className={idx < lifted ? 'lift' : ''} style={{ ['--i' as string]: idx }} />)}</span>)}</span>
                    <b>{p.thk >= 0 ? `${fa(p.thk, 3)}″` : 'بدون ضخامت'}</b>
                    <small>{fa(p.ps.length)} شاخه · {fa(p.ps.reduce((s, x) => s + (x.lengthM ?? 0), 0), 0)} م</small>
                  </button>
                ) })}
              </div>
            </section>
          ))}
        </div>
      )}
      <div className={`lw-dock im-card${pick ? ' open' : ''}`} aria-hidden={!pick}>
        {pick && <>
          <span className="lw-dock-what"><i style={{ background: colors.get(pick.thk) }} /> {pick.depot} · {pick.thk >= 0 ? `${fa(pick.thk, 3)}″` : '—'}</span>
          <span className="lw-count" role="group" aria-label="تعداد شاخه">
            {[5, 10, 15, 20].map((n) => <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}>{fa(n)}</button>)}
            <input type="number" min={1} max={pile.length} value={count} onChange={(e) => setCount(Math.max(1, Math.min(pile.length || 1, Number(e.target.value) || 1)))} aria-label="تعداد دلخواه" />
          </span>
          <label className="lw-km"><span>از کیلومتر</span><KmInput value={km} onValue={setKm} label="کیلومتر شروع ریسه" placeholder="اختیاری" /></label>
          <span className="lw-dock-sum">{fa(take.length)} شاخه · {fa(take.reduce((s, x) => s + (x.lengthM ?? 0), 0), 1)} متر{km != null && take.length ? <> · تا <b dir="ltr">{chainText(km + take.reduce((s, x) => s + (x.lengthM ?? 0), 0) / 1000)}</b></> : null}</span>
          <button type="button" className="im-btn im-btn-primary" disabled={disabled || !take.length} onClick={() => void go()}><Check size={15} /> ریسهٔ {fa(take.length)} شاخه</button>
        </>}
      </div>
      {list && <PipeYard pipes={yard} startKm={km} onClose={() => setList(false)} onAdd={(rows) => { setList(false); void onString(rows, rows.length) }} />}
    </div>
  )
}
/** pipe ends stacked like a rack: rows of 6, 5, 4 … from the bottom */
function pyramid(n: number): number[][] {
  const rows: number[][] = []; let i = 0
  for (let w = 6; w > 0 && i < n; w--) { const row: number[] = []; for (let k = 0; k < w && i < n; k++) row.push(i++); rows.push(row) }
  return rows.reverse()
}

/* ── bending and welding: on the line ───────────────────────────────────────────────────── */
function LineStage({ mode, sections, colors, bends, welders, quals, lastStamps: last, date, disabled, onBend, onWeld }: {
  mode: 'bend' | 'weld'; sections: ReturnType<typeof lineSections>; colors: Map<number, string>; bends: Map<string, { lr: string; so: string; result: string }>
  welders: { key: string; raw: string; fullName: string; id: string }[]; quals: { welderId: string }[]; lastStamps: Stamps; date: string; disabled: boolean
  onBend: (p: StrungPipe, b: BendInput) => Promise<boolean>; onWeld: (js: { j: JointRec; after?: StrungPipe }[], stamps: Stamps, vt: 'acc' | 'rej' | '') => Promise<boolean>
}) {
  // open on the section where the work stands: bending → the newest strung section; welding → the first with joints waiting for the welder
  const startSec = mode === 'weld' ? (sections.find((s) => s.slots.some((x) => x.joint && !x.joint.welded))?.sec ?? sections[0].sec) : sections[sections.length - 1].sec
  const [cur, setCur] = useState(startSec)
  const [q, setQ] = useState('')
  const [flash, setFlash] = useState('')
  const [pipe, setPipe] = useState<StrungPipe | null>(null)
  const [sel, setSel] = useState<Slot[]>([])
  const v = sections.find((s) => s.sec === cur) ?? sections[0]
  const strip = useRef<HTMLDivElement>(null), rail = useRef<HTMLElement>(null)
  useEffect(() => { rail.current?.querySelector('.sb-sec.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [cur])
  useEffect(() => {
    const el = flash ? strip.current?.querySelector(`[data-pipe="${CSS.escape(flash)}"]`) : strip.current?.querySelector(mode === 'weld' ? '.sb-slot.wait' : '.sb-cell:last-child')
    el?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [cur, flash, mode])
  const find = () => {
    const k = registerKey(q); if (!k) return
    for (const s of sections) {
      const p = s.pipes.find((x) => x.key === k) ?? s.slots.find((x) => x.joint && registerKey(x.joint.no) === k)?.after
      if (p) { setCur(s.sec); setFlash(p.key); if (mode === 'bend') setPipe(p); return }
    }
    setFlash('?')
  }
  const isSel = (s: Slot) => sel.some((x) => x.before.key === s.before.key)
  const waiting = v.slots.filter((s) => s.joint && !s.joint.welded)
  return (
    <div className="lw-line">
      <nav className="sb-rail" ref={rail} aria-label="سکشن‌ها">
        {sections.map((s) => { const w = s.slots.filter((x) => x.joint && !x.joint.welded).length; return (
          <button key={s.sec} type="button" className={`sb-sec${s.sec === cur ? ' on' : ''}${s.stats.ready ? ' ready' : ''}`} aria-pressed={s.sec === cur} onClick={() => { setCur(s.sec); setSel([]) }}>
            <b>سکشن {fa(s.sec)}</b><small dir="ltr">{chainText(s.fromKm)} – {chainText(s.toKm)}</small>
            <span className="sb-bar" aria-hidden><i style={{ width: `${s.stats.slots ? Math.round((mode === 'weld' ? s.stats.welded : s.stats.fitted) / s.stats.slots * 100) : 0}%` }} /></span>
            <small>{mode === 'weld' ? (w ? `${fa(w)} سرجوش منتظر جوش` : `${fa(s.stats.welded)} جوش‌شده`) : `${fa(s.pipes.length)} لوله · ${fa(s.pipes.filter((p) => bends.has(p.key)).length)} خم`}</small>
          </button>
        ) })}
      </nav>
      <div className="lw-find">
        <label className="lw-search"><Search size={14} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') find() }} placeholder={mode === 'bend' ? 'شمارهٔ لوله (مثلاً SP-0123)' : 'شمارهٔ لوله یا سرجوش'} dir="ltr" aria-label="جستجو روی خط" /></label>
        <button type="button" className="im-btn im-btn-sm" onClick={find}>پیدا کن</button>
        {flash === '?' && <span className="lw-miss">روی خط پیدا نشد (ریسه نشده یا شماره اشتباه است)</span>}
        {mode === 'weld' && <span className="lw-help">{waiting.length ? <>سرجوش‌های نارنجی منتظر جوش‌اند؛ یکی یا چند تا را بزنید. {waiting.length > 1 && <button type="button" className="im-link" onClick={() => setSel(waiting)}>انتخاب همهٔ {fa(waiting.length)} سرجوش این سکشن</button>}</> : 'در این سکشن سرجوش فیت‌آپ‌شدهٔ بی‌جوش نیست.'}</span>}
        {mode === 'bend' && <span className="lw-help">روی لوله بزنید تا جهت و زاویهٔ خم را ثبت کنید؛ لوله‌های خم‌شده نشانه دارند.</span>}
      </div>
      <LineStrip ref={strip} view={v} colors={colors} label={`سکشن ${v.sec}`}
        look={(p) => { const b = bends.get(p.key); return {
          cls: `${flash === p.key ? 'flash ' : ''}${b ? 'bent ' : ''}${pipe?.key === p.key ? 'picked' : ''}`,
          mark: b ? <span className="lw-bendmark" title={[b.lr, b.so].filter(Boolean).join(' · ')}>{b.so.startsWith('OB') ? <ChevronUp size={11} /> : b.so.startsWith('SB') ? <ChevronDown size={11} /> : b.lr.startsWith('IPL') ? <CornerUpLeft size={11} /> : <CornerUpRight size={11} />}</span> : undefined,
          onClick: mode === 'bend' && !disabled ? () => setPipe(p) : undefined, pressed: pipe?.key === p.key,
        } }}
        slot={(s) => {
          if (mode === 'bend' || !s.joint) return <span className={`sb-slot ${s.joint ? 'done' : 'mute'}`}><span className="sb-dot">{s.joint ? <Check size={11} strokeWidth={3} /> : ''}</span></span>
          if (s.joint.welded) return <span className="sb-slot done" title={`سرجوش ${s.joint.no} جوش شده`}><span className="sb-dot"><Flame size={12} /></span><small>{s.joint.no}</small></span>
          return <button type="button" className={`sb-slot free wait${isSel(s) ? ' sel' : ''}`} disabled={disabled} aria-pressed={isSel(s)} onClick={() => setSel((a) => (isSel(s) ? a.filter((x) => x.before.key !== s.before.key) : [...a, s]))} title={`سرجوش ${s.joint.no} — منتظر جوش`}>
            <span className="sb-dot">{isSel(s) ? <Check size={12} strokeWidth={3} /> : <Flame size={12} />}</span><small>{s.joint.no}</small></button>
        }} />
      {mode === 'bend' && pipe && <BendPanel key={pipe.key} pipe={pipe} existing={bends.get(pipe.key)} disabled={disabled} onClose={() => setPipe(null)} onSave={async (b) => { if (await onBend(pipe, b)) setPipe(null) }} />}
      {mode === 'weld' && sel.length > 0 && <WeldPanel joints={sel} welders={welders} quals={quals} last={last} date={date} disabled={disabled} onClose={() => setSel([])}
        onSave={async (stamps, vt) => { if (await onWeld(sel.map((s) => ({ j: s.joint!, after: s.after })), stamps, vt)) setSel([]) }} />}
    </div>
  )
}

/* ── the bend of one pipe: direction icons, angle, ovality ─────────────────────────────── */
function BendPanel({ pipe, existing, disabled, onClose, onSave }: { pipe: StrungPipe; existing?: { lr: string; so: string; result: string }; disabled: boolean; onClose: () => void; onSave: (b: BendInput) => Promise<void> }) {
  const [b, setB] = useState<BendInput>({ plan: '', planDeg: null, profile: '', profileDeg: null, ovalPct: null, ovalMm: null, result: 'acc' })
  const num = (v: string) => { const n = Number(v.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٫,]/g, '.')); return v.trim() === '' || !Number.isFinite(n) ? null : n }
  const planA = b.plan ? (b.planDeg ?? 0) * (b.plan === 'IPL' ? -1 : 1) : 0, profA = b.profile ? (b.profileDeg ?? 0) * (b.profile === 'OB' ? -1 : 1) : 0
  const ok = (b.plan && (b.planDeg ?? 0) > 0) || (b.profile && (b.profileDeg ?? 0) > 0)
  const Dir = ({ v, label, icon: I, group }: { v: string; label: string; icon: typeof CornerUpLeft; group: 'plan' | 'profile' }) => {
    const on = b[group] === v
    return <button type="button" className={`lw-dir${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setB({ ...b, [group]: on ? '' : v })}><I size={22} aria-hidden /><b>{v}</b><small>{label}</small></button>
  }
  return (
    <aside className="lw-panel im-card" aria-label={`خم لولهٔ ${pipe.raw}`}>
      <header><div><b dir="ltr">{pipe.raw}</b><small>km {chainText(pipe.km)} · {fa(pipe.lengthM, 2)} متر · {pipe.thkIn != null ? `${fa(pipe.thkIn, 3)}″` : '—'}</small></div><button type="button" className="im-modal-close" onClick={onClose} aria-label="بستن"><X size={15} /></button></header>
      {existing && <p className="lw-note">این لوله قبلاً خم ثبت شده دارد ({[existing.lr, existing.so].filter(Boolean).join(' · ') || '—'}). ثبت تازه یک ردیف دیگر می‌سازد.</p>}
      <div className="lw-bendviz" aria-hidden>
        <svg viewBox="0 0 200 70"><g transform="translate(20 35)"><rect x="0" y="-6" width="70" height="12" rx="6" className="seg" /></g>
          <g className="arm" style={{ transform: `translate(90px, 35px) rotate(${Math.max(-30, Math.min(30, planA || profA))}deg)` }}><rect x="0" y="-6" width="80" height="12" rx="6" className="seg on" /></g>
          <circle cx="90" cy="35" r="4" className="pivot" /></svg>
        <small>{b.plan && b.planDeg ? `افقی ${b.plan === 'IPL' ? 'به چپ' : 'به راست'} ${fa(b.planDeg, 1)}°` : ''}{b.plan && b.profile && b.planDeg && b.profileDeg ? ' · ' : ''}{b.profile && b.profileDeg ? `عمودی ${b.profile === 'SB' ? 'رو به پایین (Sag)' : 'رو به بالا (Over)'} ${fa(b.profileDeg, 1)}°` : ''}</small>
      </div>
      <div className="lw-dirs">
        <fieldset><legend>خم افقی (در پلان)</legend><div><Dir v="IPL" label="به چپ" icon={CornerUpLeft} group="plan" /><Dir v="IPR" label="به راست" icon={CornerUpRight} group="plan" /></div>
          <label className="lw-deg"><input inputMode="decimal" dir="ltr" disabled={!b.plan} value={b.planDeg ?? ''} onChange={(e) => setB({ ...b, planDeg: num(e.target.value) })} aria-label="زاویهٔ خم افقی" placeholder="زاویه" /><span>°</span></label></fieldset>
        <fieldset><legend>خم عمودی (در پروفیل)</legend><div><Dir v="SB" label="رو به پایین" icon={ChevronDown} group="profile" /><Dir v="OB" label="رو به بالا" icon={ChevronUp} group="profile" /></div>
          <label className="lw-deg"><input inputMode="decimal" dir="ltr" disabled={!b.profile} value={b.profileDeg ?? ''} onChange={(e) => setB({ ...b, profileDeg: num(e.target.value) })} aria-label="زاویهٔ خم عمودی" placeholder="زاویه" /><span>°</span></label></fieldset>
      </div>
      <div className="lw-oval">
        <label><span>بیضی‌شدگی %</span><input inputMode="decimal" dir="ltr" value={b.ovalPct ?? ''} onChange={(e) => setB({ ...b, ovalPct: num(e.target.value) })} /></label>
        <label><span>بیضی‌شدگی mm</span><input inputMode="decimal" dir="ltr" value={b.ovalMm ?? ''} onChange={(e) => setB({ ...b, ovalMm: num(e.target.value) })} /></label>
        <span className="lw-res" role="radiogroup" aria-label="نتیجه">{(['acc', 'rej'] as const).map((r) => <button key={r} type="button" role="radio" aria-checked={b.result === r} className={b.result === r ? `on ${r}` : ''} onClick={() => setB({ ...b, result: r })}>{r === 'acc' ? 'قبول' : 'رد'}</button>)}</span>
      </div>
      <button type="button" className="im-btn im-btn-primary lw-save" disabled={disabled || !ok} onClick={() => void onSave(b)}><Check size={15} /> ثبت خم لولهٔ {pipe.raw}</button>
    </aside>
  )
}

/* ── the welders of one or more joints: four passes on the R and the C side ────────────── */
function WeldPanel({ joints, welders, quals, last, date, disabled, onClose, onSave }: {
  joints: Slot[]; welders: { key: string; raw: string; fullName: string; id: string }[]; quals: { welderId: string }[]; last: Stamps; date: string; disabled: boolean
  onClose: () => void; onSave: (stamps: Stamps, vt: 'acc' | 'rej' | '') => Promise<void>
}) {
  const cells = PASSES.flatMap((p) => SIDES.map((s) => ({ f: stampField(p.k, s.k), pass: p.fa, side: s.fa })))
  const [stamps, setStamps] = useState<Stamps>({})
  const [at, setAt] = useState(cells[0].f)
  const [vt, setVt] = useState<'acc' | 'rej' | ''>('acc')
  // a welder must hold a valid qualification for the wall and size of every joint picked
  const check = (w: { id: string }) => { const qs = quals.filter((q) => q.welderId === w.id) as Parameters<typeof welderQualified>[0]
    const bad = joints.map((s) => welderQualified(qs, { date, thk: s.after.thkIn, dia: s.after.odIn })).find((r) => !r.ok); return bad ? bad.reasons.join('، ') : '' }
  const put = (raw: string) => { setStamps((x) => ({ ...x, [at]: x[at] === raw ? '' : raw })); const i = cells.findIndex((c) => c.f === at); if (i < cells.length - 1) setAt(cells[i + 1].f) }
  const filled = Object.values(stamps).filter(Boolean).length
  return (
    <aside className="lw-panel lw-weld im-card" aria-label="مهر جوشکاران">
      <header><div><b>{joints.length === 1 ? `سرجوش ${joints[0].joint!.no}` : `${fa(joints.length)} سرجوش`}</b><small dir="ltr">{joints.slice(0, 6).map((s) => s.joint!.no).join(' · ')}{joints.length > 6 ? ' …' : ''}</small></div><button type="button" className="im-modal-close" onClick={onClose} aria-label="بستن"><X size={15} /></button></header>
      <p className="lw-note">خانهٔ هر پاس را بزنید و جوشکار را از پایین انتخاب کنید؛ مکان‌نما خودش به خانهٔ بعد می‌رود. {Object.keys(last).length > 0 && <button type="button" className="im-link" onClick={() => setStamps(last)}>مثل آخرین سرجوش جوش‌شده</button>}</p>
      <div className="lw-grid" role="grid" aria-label="پاس‌ها">
        <span /> {SIDES.map((s) => <b key={s.k}>{s.fa}</b>)}
        {PASSES.map((p) => <Fragment key={p.k}>
          <b>{p.fa}<small> {p.k}</small></b>
          {SIDES.map((s) => { const f = stampField(p.k, s.k); return <button key={f} type="button" role="gridcell" className={`lw-cell${at === f ? ' at' : ''}${stamps[f] ? ' has' : ''}`} onClick={() => setAt(f)} aria-label={`${p.fa} ${s.fa}`}>{stamps[f] || '—'}</button> })}
        </Fragment>)}
      </div>
      <div className="lw-welders" role="listbox" aria-label="جوشکاران">
        {welders.length === 0 ? <span className="im-helper">جوشکاری در شناسنامهٔ جوشکاران پروژه ثبت نشده است.</span> : welders.map((w) => { const why = check(w); return (
          <button key={w.id} type="button" role="option" aria-selected={stamps[at] === w.raw} className={`lw-welder${why ? ' warn' : ''}`} title={why ? `صلاحیت: ${why}` : w.fullName} onClick={() => put(w.raw)}>
            <b dir="ltr">{w.raw}</b><small>{w.fullName || '—'}</small>{why && <em>!</em>}
          </button>
        ) })}
      </div>
      <div className="lw-oval">
        <span className="im-helper" style={{ margin: 0 }}>بازرسی چشمی (VT)</span>
        <span className="lw-res" role="radiogroup" aria-label="VT">{(['acc', 'rej', ''] as const).map((r) => <button key={r || 'none'} type="button" role="radio" aria-checked={vt === r} className={vt === r ? `on ${r}` : ''} onClick={() => setVt(r)}>{r === 'acc' ? 'قبول' : r === 'rej' ? 'رد' : 'بعداً'}</button>)}</span>
      </div>
      <button type="button" className="im-btn im-btn-primary lw-save" disabled={disabled || !filled} onClick={() => void onSave(stamps, vt)}><Check size={15} /> ثبت جوش {joints.length === 1 ? `سرجوش ${joints[0].joint!.no}` : `${fa(joints.length)} سرجوش`}</button>
    </aside>
  )
}
