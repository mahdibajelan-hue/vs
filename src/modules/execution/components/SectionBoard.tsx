import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, GitCommitHorizontal, Settings2, Sparkles, X } from 'lucide-react'
import { fa } from './common'
import { KmInput } from './KmInput'
import { chainText } from '../lib/chainage'
import { fitupRows, type SectionPlan, type SectionView, type Slot } from '../lib/sections'

const THK_COLORS = ['#38bdf8', '#a78bfa', '#f59e0b', '#f43f5e', '#10b981', '#eab308']
const slotId = (s: Slot) => `${s.before.key}|${s.after.key}`

/**
 * «سرجوش‌گذاری روی خط» — the fit-up record's picker. The strung pipes of a section lie in chainage order; between two
 * neighbours is the place of a joint. Joints already made carry their number and their state (welded · radiography ·
 * coating); a free place is picked with a tap; the guide marks where the fit-up front stands. Section ends are left
 * open for the radiography crawler. Picking gives each joint its section and the section's next joint number, and
 * the fit-up rows get the two pipes and the facts of the pipe after the joint from the register.
 */
export function SectionBoard({ sections, plan, joints, canPlan, onPlan, onAdd, onClose }: {
  sections: SectionView[]; plan: SectionPlan; joints: { sec: string; no: string }[]
  canPlan: boolean; onPlan: (p: SectionPlan) => Promise<boolean>; onAdd: (rows: Record<string, unknown>[]) => void; onClose: () => void
}) {
  const thkColor = useMemo(() => { const t = [...new Set(sections.flatMap((s) => s.pipes.map((p) => p.thkIn)).filter((x): x is number => x != null))].sort((a, b) => a - b); return new Map(t.map((v, i) => [v, THK_COLORS[i % THK_COLORS.length]])) }, [sections])
  // open on the section where the fit-up front stands: the first with a suggested free place after joints already made
  const start = useMemo(() => (sections.find((s) => s.stats.fitted > 0 && s.slots.some((x) => x.kind === 'free')) ?? sections.find((s) => s.slots.some((x) => x.kind === 'free')) ?? sections[0])?.sec ?? 0, [sections])
  const [cur, setCur] = useState(start)
  const [sel, setSel] = useState<Slot[]>([])
  const [quick, setQuick] = useState(10)
  const [planOpen, setPlanOpen] = useState(false)
  const [draft, setDraft] = useState<SectionPlan>(plan)
  const [busy, setBusy] = useState(false)
  const v = sections.find((s) => s.sec === cur) ?? sections[0]
  const preview = useMemo(() => fitupRows(sel, joints), [sel, joints])
  const noOf = useMemo(() => new Map(preview.map((r) => [`${r.pipeNo2}|${r.pipeNo}`.toUpperCase(), String(r.jointNo)])), [preview])
  const strip = useRef<HTMLDivElement>(null)
  // bring the guide's suggestion into view when a section opens
  useEffect(() => { const el = strip.current?.querySelector('.sb-slot.sug, .sb-slot.free'); el?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [cur])
  const rail = useRef<HTMLElement>(null)
  useEffect(() => { rail.current?.querySelector('.sb-sec.on')?.scrollIntoView({ block: 'nearest', inline: 'center' }) }, [cur])

  const isSel = (s: Slot) => sel.some((x) => slotId(x) === slotId(s))
  const toggle = (s: Slot) => setSel((a) => (a.some((x) => slotId(x) === slotId(s)) ? a.filter((x) => slotId(x) !== slotId(s)) : [...a, s]))
  // the next joints along the line from the guide's suggestion, skipping what is already picked
  const pickNext = (n: number) => {
    if (!v) return
    const free = v.slots.filter((s) => s.kind === 'free' && !isSel(s))
    const from = Math.max(0, free.findIndex((s) => s.suggested))
    setSel((a) => [...a, ...free.slice(from, from + n), ...(free.slice(from, from + n).length < n ? free.slice(0, Math.max(0, from)).slice(0, n - free.slice(from, from + n).length) : [])])
  }
  const savePlan = async () => { setBusy(true); const ok = await onPlan(draft); setBusy(false); if (ok) { setPlanOpen(false); setSel([]) } }
  const pending = v ? v.slots.filter((s) => s.kind === 'free').length : 0

  return (
    <div className="im-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="im-modal py-modal sb-modal" role="dialog" aria-modal="true" aria-label="سرجوش‌گذاری روی خط">
        <header className="py-head">
          <span className="py-ico sb-ico" aria-hidden><GitCommitHorizontal size={20} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="im-modal-title">سرجوش‌گذاری روی خط</div>
            <p className="im-helper" style={{ margin: 0 }}>سکشن‌های {fa(plan.lengthM)} متری از کیلومتر {chainText(plan.startKm)} · دو سر هر سکشن برای کرالر رادیوگرافی باز می‌ماند</p>
          </div>
          {canPlan && <button type="button" className="im-btn im-btn-sm" onClick={() => { setDraft(plan); setPlanOpen((o) => !o) }} aria-expanded={planOpen}><Settings2 size={14} /> سکشن‌بندی</button>}
          <button type="button" className="im-modal-close" onClick={onClose} aria-label="بستن"><X size={16} /></button>
        </header>

        {planOpen && (
          <div className="sb-plan">
            <label><span>کیلومتر شروع سکشن ۱</span><KmInput value={draft.startKm} onValue={(n) => setDraft({ ...draft, startKm: n ?? 0 })} label="کیلومتر شروع سکشن ۱" /></label>
            <label><span>طول هر سکشن (متر)</span><input type="number" min={100} step={50} value={draft.lengthM} onChange={(e) => setDraft({ ...draft, lengthM: Math.max(100, Number(e.target.value) || 1000) })} /></label>
            <label><span>حداکثر سرجوش هر سکشن</span><input type="number" min={10} value={draft.maxJoints} onChange={(e) => setDraft({ ...draft, maxJoints: Math.max(10, Number(e.target.value) || 100) })} /></label>
            <button type="button" className="im-btn im-btn-primary im-btn-sm" disabled={busy} onClick={() => void savePlan()}>ذخیرهٔ سکشن‌بندی پروژه</button>
            <small className="im-helper">شمارهٔ سکشن هر لوله از کیلومتر ریسهٔ آن به دست می‌آید؛ سرجوش‌هایی که قبلاً ثبت شده‌اند شمارهٔ خود را نگه می‌دارند.</small>
          </div>
        )}

        {sections.length === 0 ? <p className="py-empty">هنوز لوله‌ای با کیلومتر ریسه ثبت نشده است؛ ابتدا گزارش ریسه (با محل ریسه) ثبت شود.</p> : <>
          <nav className="sb-rail" ref={rail} aria-label="سکشن‌ها">
            {sections.map((s) => { const pct = s.stats.slots ? s.stats.fitted / s.stats.slots : 0; const mine = sel.filter((x) => x.sec === s.sec).length; return (
              <button key={s.sec} type="button" className={`sb-sec${s.sec === cur ? ' on' : ''}${s.stats.ready ? ' ready' : ''}`} aria-pressed={s.sec === cur} onClick={() => setCur(s.sec)}>
                <b>سکشن {fa(s.sec)}</b>
                <small dir="ltr">{chainText(s.fromKm)} – {chainText(s.toKm)}</small>
                <span className="sb-bar" aria-hidden><i style={{ width: `${Math.round(pct * 100)}%` }} /></span>
                <small>{s.stats.ready ? 'آمادهٔ لوله‌گذاری' : `${fa(s.stats.fitted)} از ${fa(s.stats.slots)} سرجوش`}{mine ? ` · +${fa(mine)}` : ''}</small>
              </button>
            ) })}
          </nav>

          {v && <>
            <div className="sb-stats">
              <span><b>{fa(v.pipes.length)}</b> لولهٔ ریسه‌شده</span>
              <span className="st fit"><i />فیت‌آپ <b>{fa(v.stats.fitted)}/{fa(v.stats.slots)}</b></span>
              <span className="st weld"><i />جوش <b>{fa(v.stats.welded)}</b></span>
              <span className="st rt"><i />رادیوگرافی قبول <b>{fa(v.stats.rtOk)}</b></span>
              <span className="st coat"><i />عایق سرجوش <b>{fa(v.stats.coated)}</b></span>
              {v.stats.ready && <span className="sb-ready"><Check size={13} /> همهٔ عملیات تأیید شده — آمادهٔ لوله‌گذاری</span>}
              {v.stats.fitted + sel.filter((x) => x.sec === v.sec).length > plan.maxJoints && <span className="sb-warn">بیش از {fa(plan.maxJoints)} سرجوش در این سکشن</span>}
            </div>

            <div className="sb-tools">
              <span className="py-q"><span>انتخاب</span><input type="number" min={1} max={100} value={quick} onChange={(e) => setQuick(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} aria-label="تعداد سرجوش برای انتخاب سریع" />
                <button type="button" className="im-btn im-btn-sm" disabled={!pending} onClick={() => pickNext(quick)}><Sparkles size={13} /> سرجوش بعدی از جبههٔ کار</button></span>
              {sel.length > 0 && <button type="button" className="im-btn im-btn-sm" onClick={() => setSel([])}>پاک کردن انتخاب</button>}
              <span className="sb-legend" aria-hidden><i className="k-done" />ثبت‌شده <i className="k-mine" />در این گزارش <i className="k-sel" />انتخاب شما <i className="k-free" />آزاد</span>
            </div>

            <div className="sb-strip" ref={strip} dir="ltr" role="list" aria-label={`لوله‌ها و سرجوش‌های سکشن ${v.sec} به ترتیب کیلومتر`}>
              {v.pipes.map((p, i) => { const s = v.slots.find((x) => x.before.key === p.key); return (
                <span key={p.key} className="sb-cell" role="listitem">
                  <span className="sb-pipe" style={{ ['--c' as string]: p.thkIn != null ? thkColor.get(p.thkIn) : '#64748b', width: `${Math.max(56, Math.min(96, p.lengthM * 6))}px` }} title={`${p.raw} · ${p.lengthM} m · ${p.thkIn ?? '—'}″ · km ${chainText(p.km)}`}>
                    <b>{p.raw}</b><small>{fa(p.lengthM, 2)} م</small>
                    {i % 5 === 0 && <em className="sb-km">{chainText(p.km)}</em>}
                  </span>
                  {s && (s.kind === 'boundary' ? <span className="sb-end" title={s.why}><span>انتهای سکشن</span></span>
                    : s.kind === 'gap' ? <span className="sb-gap" title={s.why}><span>≈</span></span>
                    : s.kind === 'done' || s.kind === 'mine' ? (
                      <span className={`sb-slot ${s.kind}`} title={`سرجوش ${s.joint!.no} (سکشن ${s.joint!.sec}) · ${s.before.raw} ← ${s.after.raw}${s.joint!.welded ? ' · جوش‌شده' : ''}${s.joint!.rtOk ? ' · رادیوگرافی قبول' : s.joint!.rtRep ? ' · نیاز به تعمیر' : ''}${s.joint!.coated ? ' · عایق‌شده' : ''}`}>
                        <span className="sb-dot"><Check size={12} strokeWidth={3} /></span><small>{s.joint!.no}</small>
                        <span className="sb-steps" aria-hidden><i className={s.joint!.welded ? 'on' : ''} /><i className={s.joint!.rtOk ? 'on' : s.joint!.rtRep ? 'bad' : ''} /><i className={s.joint!.coated ? 'on' : ''} /></span>
                      </span>)
                    : s.kind === 'blocked' ? <span className="sb-slot blocked" title={s.why}><span className="sb-dot">!</span></span>
                    : <button type="button" className={`sb-slot free${s.suggested ? ' sug' : ''}${isSel(s) ? ' sel' : ''}`} aria-pressed={isSel(s)} onClick={() => toggle(s)}
                        title={`سرجوش بین ${s.before.raw} و ${s.after.raw} · km ${chainText(s.km)}${s.suggested ? ' · پیشنهاد سامانه: ادامهٔ جبههٔ فیت‌آپ' : ''}`}>
                        <span className="sb-dot">{isSel(s) ? <Check size={12} strokeWidth={3} /> : '+'}</span>
                        <small>{isSel(s) ? noOf.get(`${s.before.raw}|${s.after.raw}`.toUpperCase()) : s.suggested ? 'پیشنهاد' : ''}</small>
                      </button>)}
                </span>
              ) })}
            </div>
          </>}
        </>}

        <footer className="py-foot">
          <div className="sb-picked">
            {preview.length === 0 ? <span className="im-helper" style={{ margin: 0 }}>روی دایره‌های «+» بین لوله‌ها بزنید؛ سامانه شمارهٔ سکشن و سرجوش را می‌دهد.</span>
              : preview.slice(0, 6).map((r) => <span key={String(r.jointNo) + r.sec} className="sb-chip"><b>{String(r.jointNo)}</b><small>سکشن {fa(Number(r.sec))} · {String(r.pipeNo2)} ← {String(r.pipeNo)}</small></span>)}
            {preview.length > 6 && <span className="im-helper" style={{ margin: 0 }}>و {fa(preview.length - 6)} سرجوش دیگر</span>}
          </div>
          <button type="button" className="im-btn im-btn-primary" disabled={!preview.length} onClick={() => onAdd(preview)}><Check size={15} /> افزودن {fa(preview.length)} سرجوش به گزارش</button>
        </footer>
      </div>
    </div>
  )
}
