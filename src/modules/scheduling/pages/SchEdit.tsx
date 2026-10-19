import { Fragment, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, Copy, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { jalaliText } from '../../execution/lib/periods'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { fa } from '../../execution/components/common'
import { CONSTRAINT_LABEL_FA, CONSTRAINT_TYPES } from '../lib/engine2'
import { calendarMap, computeSchedule, pickCalendar } from '../lib/schedule'
import { REL_LABEL_FA, type ActType, type RelType, type SchActivity, type SchCalendar, type SchRelation } from '../lib/types'
import { useSchedulingStore, type VersionBundle } from '../store/useSchedulingStore'
import type { ScheduleModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const DAYS = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']
const PAGE = 50

/** Commits on blur / Enter, so typing never writes per keystroke. */
function TextCell({ value, onCommit, dir, width, disabled }: { value: string; onCommit: (v: string) => void; dir?: 'auto' | 'ltr'; width?: number | string; disabled?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input value={v} disabled={disabled} dir={dir ?? 'auto'} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onCommit(v) }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} style={{ width: width ?? '100%', minWidth: 0 }} />
}
function NumCell({ value, onCommit, min = 0, step = 1, width = 64, disabled }: { value: number | null; onCommit: (v: number | null) => void; min?: number; step?: number; width?: number; disabled?: boolean }) {
  const [v, setV] = useState(value == null ? '' : String(value))
  useEffect(() => setV(value == null ? '' : String(value)), [value])
  const commit = () => { const n = v === '' ? null : Number(v); if (n !== value && (n == null || Number.isFinite(n))) onCommit(n == null ? null : Math.max(min, n)) }
  return <input type="number" value={v} min={min} step={step} disabled={disabled} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} style={{ width }} />
}

/** In-app editing of a DRAFT version: activities, durations, relations, per-activity calendars and date constraints. Approved versions are never edited — a draft copy is made first. */
export function SchEdit({ projectId, m }: { projectId: string; m: ScheduleModel }) {
  const st = useSchedulingStore()
  const versions = useMemo(() => [...st.versions].sort((a, b) => (a.status === 'draft' ? 0 : 1) - (b.status === 'draft' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt)), [st.versions])
  const [vid, setVid] = useState('')
  const [tab, setTab] = useState<'acts' | 'cals'>('acts')
  useEffect(() => { if (!vid && versions.length) setVid(versions[0].id) }, [versions, vid])
  useEffect(() => { if (vid) void st.loadBundle(vid) }, [vid]) // eslint-disable-line react-hooks/exhaustive-deps
  const v = st.versions.find((x) => x.id === vid)
  const bundle = vid ? st.bundles.get(vid) ?? null : null
  const draft = v?.status === 'draft' && st.canEdit
  const [label, setLabel] = useState(''), [kind, setKind] = useState<'update' | 'scenario' | 'initial'>('scenario'), [busy, setBusy] = useState(false)

  const plan = useMemo(() => (bundle && bundle.activities.length ? computeSchedule({ activities: bundle.activities, relations: bundle.relations, calendar: pickCalendar(bundle.calendars), calendars: calendarMap(bundle.calendars), mode: 'plan' }) : null), [bundle])
  const makeDraft = async () => {
    if (!v || !label.trim()) return
    setBusy(true); const id = await st.copyVersion(v.id, label.trim(), kind); setBusy(false)
    if (id) { setVid(id); setLabel('') }
  }

  if (!versions.length) return <div className="im-card im-empty" style={{ padding: 24 }}>هنوز نسخه‌ای نیست؛ ابتدا برنامه را وارد کنید.</div>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Section title={<span>ویرایش برنامه <Hint id="edit-draft" /></span>} hint="فقط پیش‌نویس ویرایش می‌شود؛ نسخهٔ تأییدشده ثابت می‌ماند">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="ex-lab" style={{ minWidth: 260 }}>نسخه<select value={vid} onChange={(e) => setVid(e.target.value)}>{versions.map((x) => <option key={x.id} value={x.id}>{x.status === 'draft' ? '✎ ' : ''}{x.label}</option>)}</select></label>
          {v && <Chip tone={v.status === 'draft' ? 'warn' : 'good'}>{v.status === 'draft' ? 'پیش‌نویس — قابل ویرایش' : 'تأییدشده — قفل'}</Chip>}
          {v?.status === 'draft' && <label className="ex-lab">تاریخ وضعیت <Hint id="data-date" /><JalaliDateInput value={v.dataDate ?? ''} onChange={(x) => { if (draft) void st.setVersionDataDate(v.id, x || null) }} /></label>}
        </div>
        {st.canEdit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
            <label className="ex-lab" style={{ flex: '1 1 240px' }}>ساخت پیش‌نویس جدید از نسخهٔ انتخاب‌شده<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="برچسب نسخهٔ جدید، مثلاً Rev3" dir="auto" /></label>
            <label className="ex-lab">نوع<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="scenario">سناریو</option><option value="update">به‌روزرسانی</option><option value="initial">برنامهٔ اولیه</option></select></label>
            <button className="im-btn im-btn-primary" disabled={busy || !label.trim() || !v} onClick={() => void makeDraft()}><Copy size={14} /> {busy ? 'در حال ساخت…' : 'ساخت پیش‌نویس'}</button>
          </div>
        )}
        {!st.canEdit && <p className="im-helper" style={{ margin: '8px 0 0' }}>شما اجازهٔ ویرایش برنامه را ندارید (نقش «ثبت نسخهٔ مبنا» لازم است).</p>}
      </Section>

      {!bundle ? <div className="im-skeleton" style={{ height: 200 }} /> : (
        <>
          {plan && (
            <div className="fn-kpis">
              <KpiCard i={0} label="فعالیت" value={fa(bundle.activities.filter((a) => a.type !== 'summary').length)} />
              <KpiCard i={1} label="پایان محاسبه‌شده (منطق شبکه)" value={d(plan.projectFinish)} tone={plan.ok ? 'good' : 'bad'} sub={plan.ok ? `${fa(plan.duration)} روز کاری` : plan.cycle ? `چرخه: ${plan.cycle.slice(0, 4).join('، ')}` : 'محاسبه ناموفق'} />
              <KpiCard i={2} label="فعالیت بحرانی" value={fa(plan.criticalPath.length)} />
              <KpiCard i={3} label="هشدار محاسبه" value={fa(plan.warnings.length)} tone={plan.warnings.length ? 'warn' : 'good'} />
            </div>
          )}
          {plan && plan.warnings.length > 0 && <div className="im-card" style={{ padding: '8px 12px', fontSize: 12.5 }}>{plan.warnings.slice(0, 6).map((w) => <div key={w}>⚠ {w}</div>)}</div>}
          <div role="tablist" style={{ display: 'flex', gap: 6 }}>
            <button role="tab" aria-selected={tab === 'acts'} className={`im-btn im-btn-sm${tab === 'acts' ? ' im-btn-primary' : ''}`} onClick={() => setTab('acts')}>فعالیت‌ها و روابط</button>
            <button role="tab" aria-selected={tab === 'cals'} className={`im-btn im-btn-sm${tab === 'cals' ? ' im-btn-primary' : ''}`} onClick={() => setTab('cals')}><CalendarDays size={13} /> تقویم‌ها <Hint id="edit-calendar" /></button>
            {draft && plan?.ok && <button className="im-btn im-btn-sm" style={{ marginInlineStart: 'auto' }} onClick={() => { const dates = new Map([...plan.byId].map(([id, r]) => [id, { start: r.start, finish: r.finish }])); if (window.confirm('تاریخ‌های شروع و پایان برنامه‌ای این پیش‌نویس از منطق شبکه بازنویسی شود؟')) void st.writePlannedDates(vid, dates) }}><RefreshCw size={13} /> محاسبهٔ تاریخ‌ها و نوشتن در نسخه</button>}
          </div>
          {tab === 'acts' ? <Activities vid={vid} bundle={bundle} draft={draft} plan={plan} /> : <Calendars vid={vid} bundle={bundle} draft={draft} />}
        </>
      )}
      <span className="sub" hidden>{projectId}{m.today}</span>
    </div>
  )
}

function Activities({ vid, bundle, draft, plan }: { vid: string; bundle: VersionBundle; draft: boolean; plan: ReturnType<typeof computeSchedule> | null }) {
  const st = useSchedulingStore()
  const [q, setQ] = useState(''), [page, setPage] = useState(0), [open, setOpen] = useState<string | null>(null)
  const acts = bundle.activities
  const list = useMemo(() => { const n = q.trim().toLowerCase(); return acts.filter((a) => a.type !== 'summary' && (!n || `${a.code} ${a.name} ${a.wbsPath}`.toLowerCase().includes(n))) }, [acts, q])
  const pages = Math.max(1, Math.ceil(list.length / PAGE)), cur = Math.min(page, pages - 1)
  const rows = list.slice(cur * PAGE, cur * PAGE + PAGE)
  const defCal = bundle.calendars.find((c) => c.isDefault)?.id ?? bundle.calendars[0]?.id ?? null
  const [nw, setNw] = useState({ code: '', name: '', type: 'task' as ActType, dur: 5, cal: '' })
  const upd = (id: string, patch: Partial<SchActivity>) => void st.updateActivity(vid, id, patch)
  const nextCode = () => { const nums = acts.map((a) => /(\d+)$/.exec(a.code)).filter(Boolean).map((x) => Number(x![1])); return `A${String(Math.max(1000, ...nums) + 10)}` }
  const add = async () => {
    const id = await st.addActivity(vid, { code: nw.code.trim() || nextCode(), name: nw.name.trim(), type: nw.type, origDuration: nw.dur, calendarId: nw.cal || defCal })
    if (id) { setNw({ code: '', name: '', type: 'task', dur: 5, cal: '' }); setOpen(id) }
  }
  return (
    <>
      {draft && (
        <Section title="افزودن فعالیت">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="ex-lab">کد<input value={nw.code} onChange={(e) => setNw({ ...nw, code: e.target.value })} placeholder={nextCode()} dir="ltr" style={{ width: 100 }} /></label>
            <label className="ex-lab" style={{ flex: '1 1 240px' }}>نام<input value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} dir="auto" /></label>
            <label className="ex-lab">نوع<select value={nw.type} onChange={(e) => setNw({ ...nw, type: e.target.value as ActType })}><option value="task">فعالیت</option><option value="milestone">نقطهٔ عطف</option></select></label>
            <label className="ex-lab">مدت (روز کاری)<input type="number" min={0} value={nw.type === 'milestone' ? 0 : nw.dur} disabled={nw.type === 'milestone'} onChange={(e) => setNw({ ...nw, dur: Math.max(0, Number(e.target.value)) })} style={{ width: 80 }} /></label>
            <label className="ex-lab">تقویم<select value={nw.cal} onChange={(e) => setNw({ ...nw, cal: e.target.value })}><option value="">پیش‌فرض</option>{bundle.calendars.map((c) => <option key={c.id} value={c.id}>{c.name || c.code}</option>)}</select></label>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!nw.name.trim()} onClick={() => void add()}><Plus size={13} /> افزودن</button>
          </div>
        </Section>
      )}
      <Section title={`فعالیت‌ها (${fa(list.length)})`} flush hint={draft ? 'روی نام یا مقدار کلیک و ویرایش کنید؛ با خروج از کادر ذخیره می‌شود' : 'نسخه قفل است؛ برای ویرایش پیش‌نویس بسازید'}>
        <div style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="جست‌وجوی کد، نام یا WBS…" dir="auto" aria-label="جست‌وجو" style={{ width: 260 }} />
          <span className="sub">صفحه {fa(cur + 1)} از {fa(pages)}</span>
          <button className="im-btn im-btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>قبلی</button>
          <button className="im-btn im-btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>بعدی</button>
        </div>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th /><th>کد</th><th>نام</th><th className="num">مدت</th><th>تقویم</th><th>قید <Hint id="edit-constraint" /></th><th>شروع / پایان محاسبه‌شده</th><th /></tr></thead><tbody>
          {rows.map((a) => {
            const r = plan?.byId.get(a.id), isOpen = open === a.id
            return (
              <Fragment key={a.id}>
                <tr>
                  <td><button className="im-btn im-btn-sm" aria-label="جزئیات و روابط" onClick={() => setOpen(isOpen ? null : a.id)}>{isOpen ? <ChevronDown size={12} /> : <ChevronLeft size={12} />}</button></td>
                  <td><b className="fn-code">{a.code}</b></td>
                  <td style={{ minWidth: 220 }}><TextCell value={a.name} disabled={!draft} onCommit={(x) => upd(a.id, { name: x })} /></td>
                  <td className="num">{a.type === 'milestone' ? '۰' : <NumCell value={a.origDuration} disabled={!draft} onCommit={(x) => upd(a.id, { origDuration: x ?? 0 })} />}</td>
                  <td><select value={a.calendarId ?? ''} disabled={!draft} onChange={(e) => upd(a.id, { calendarId: e.target.value || null })} style={{ width: 'auto' }}>{bundle.calendars.map((c) => <option key={c.id} value={c.id}>{c.name || c.code}</option>)}</select></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <select value={a.constraintType} disabled={!draft} onChange={(e) => upd(a.id, { constraintType: e.target.value, constraintDate: e.target.value ? a.constraintDate : null })} style={{ width: 'auto' }}><option value="">بدون قید</option><option value="ALAP">در دیرترین زمان ممکن (ALAP)</option>{CONSTRAINT_TYPES.map((c) => <option key={c} value={c}>{CONSTRAINT_LABEL_FA[c]}</option>)}</select>
                    {a.constraintType && a.constraintType !== 'ALAP' && <JalaliDateInput value={a.constraintDate ?? ''} onChange={(x) => draft && upd(a.id, { constraintDate: x || null })} />}
                    {a.constraintType && a.constraintType !== 'ALAP' && !a.constraintDate && <Chip tone="warn">تاریخ؟</Chip>}
                  </td>
                  <td className="sub">{r ? <>{d(r.start)} → {d(r.finish)}{r.totalFloat != null && r.totalFloat < 0 && <Chip tone="bad">شناوری {fa(r.totalFloat)}</Chip>}{r.critical && r.totalFloat != null && r.totalFloat >= 0 && <Chip tone="bad">بحرانی</Chip>}</> : '—'}</td>
                  <td>{draft && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف فعالیت" onClick={() => { if (window.confirm(`فعالیت ${a.code} و رابطه‌هایش حذف شود؟`)) void st.deleteActivity(vid, a.id) }}><Trash2 size={12} /></button>}</td>
                </tr>
                {isOpen && <tr><td colSpan={8} style={{ background: 'var(--im-panel-2, transparent)' }}><Detail vid={vid} a={a} bundle={bundle} draft={draft} upd={upd} /></td></tr>}
              </Fragment>
            )
          })}
        </tbody></table></div>
      </Section>
    </>
  )
}

function reaches(rels: SchRelation[], from: string, to: string): boolean {
  const out = new Map<string, string[]>(); for (const r of rels) out.set(r.predId, [...(out.get(r.predId) ?? []), r.succId])
  const seen = new Set<string>(), stack = [from]
  while (stack.length) { const x = stack.pop()!; if (x === to) return true; if (seen.has(x)) continue; seen.add(x); stack.push(...(out.get(x) ?? [])) }
  return false
}

function Detail({ vid, a, bundle, draft, upd }: { vid: string; a: SchActivity; bundle: VersionBundle; draft: boolean; upd: (id: string, p: Partial<SchActivity>) => void }) {
  const st = useSchedulingStore()
  const byId = new Map(bundle.activities.map((x) => [x.id, x]))
  const preds = bundle.relations.filter((r) => r.succId === a.id), succs = bundle.relations.filter((r) => r.predId === a.id)
  const [pq, setPq] = useState(''), [pid, setPid] = useState(''), [rt, setRt] = useState<RelType>('FS'), [lag, setLag] = useState(0), [msg, setMsg] = useState('')
  const options = useMemo(() => { const n = pq.trim().toLowerCase(); return bundle.activities.filter((x) => x.id !== a.id && x.type !== 'summary' && (!n || `${x.code} ${x.name}`.toLowerCase().includes(n))).slice(0, 60) }, [bundle.activities, pq, a.id])
  const addPred = async () => {
    if (!pid) return
    if (preds.some((r) => r.predId === pid && r.type === rt)) { setMsg('این رابطه قبلاً ثبت شده است.'); return }
    if (reaches(bundle.relations, a.id, pid)) { setMsg('این رابطه چرخهٔ منطقی می‌سازد و ثبت نمی‌شود.'); return }
    setMsg(''); if (await st.addRelation(vid, pid, a.id, rt, lag)) { setPid(''); setPq('') }
  }
  const rel = (r: SchRelation, other: string) => { const o = byId.get(other); return (
    <tr key={r.id}><td><b className="fn-code">{o?.code}</b> {o?.name}</td>
      <td><select value={r.type} disabled={!draft} onChange={(e) => void st.updateRelation(vid, r.id, { type: e.target.value as RelType })} style={{ width: 'auto' }}>{(Object.keys(REL_LABEL_FA) as RelType[]).map((t) => <option key={t} value={t}>{REL_LABEL_FA[t]}</option>)}</select></td>
      <td><NumCell value={r.lag} min={-999} disabled={!draft} onCommit={(x) => void st.updateRelation(vid, r.id, { lag: x ?? 0 })} width={60} /> روز</td>
      <td>{draft && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف رابطه" onClick={() => void st.removeRelation(vid, r.id)}><Trash2 size={12} /></button>}</td></tr>) }
  return (
    <div style={{ display: 'grid', gap: 10, padding: '6px 4px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
        <b style={{ fontSize: 12.5 }}>پیش‌نیازها ({fa(preds.length)})</b>
        {preds.length > 0 && <table className="ex-lines"><tbody>{preds.map((r) => rel(r, r.predId))}</tbody></table>}
        {draft && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="جست‌وجوی پیش‌نیاز…" dir="auto" style={{ width: 130 }} aria-label="جست‌وجوی پیش‌نیاز" />
            <select value={pid} onChange={(e) => setPid(e.target.value)} style={{ width: 'auto', maxWidth: 220 }}><option value="">— پیش‌نیاز —</option>{options.map((x) => <option key={x.id} value={x.id}>{x.code} — {x.name.slice(0, 40)}</option>)}</select>
            <select value={rt} onChange={(e) => setRt(e.target.value as RelType)} style={{ width: 'auto' }}>{(Object.keys(REL_LABEL_FA) as RelType[]).map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <input type="number" value={lag} onChange={(e) => setLag(Number(e.target.value))} style={{ width: 60 }} aria-label="تأخیر (Lag)" />
            <button className="im-btn im-btn-sm im-btn-primary" disabled={!pid} onClick={() => void addPred()}><Plus size={12} /> رابطه</button>
          </div>
        )}
        {msg && <span className="ex-bad" style={{ fontSize: 12 }}>{msg}</span>}
        <b style={{ fontSize: 12.5, marginTop: 6 }}>پس‌نیازها ({fa(succs.length)})</b>
        {succs.length > 0 && <table className="ex-lines"><tbody>{succs.map((r) => rel(r, r.succId))}</tbody></table>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', alignContent: 'start' }}>
        <label className="ex-lab">شروع واقعی<JalaliDateInput value={a.actualStart ?? ''} onChange={(x) => draft && upd(a.id, { actualStart: x || null })} /></label>
        <label className="ex-lab">پایان واقعی<JalaliDateInput value={a.actualFinish ?? ''} onChange={(x) => draft && upd(a.id, { actualFinish: x || null })} /></label>
        <label className="ex-lab">٪ پیشرفت<NumCell value={a.pctComplete} step={5} disabled={!draft} onCommit={(x) => upd(a.id, { pctComplete: x == null ? null : Math.min(100, x) })} /></label>
        <label className="ex-lab">مدت باقی‌مانده<NumCell value={a.remDuration} disabled={!draft} onCommit={(x) => upd(a.id, { remDuration: x })} /></label>
        <label className="ex-lab">بودجه (ریال)<NumCell value={a.budgetCost} width={130} disabled={!draft} onCommit={(x) => upd(a.id, { budgetCost: x ?? 0 })} /></label>
        <label className="ex-lab">WBS<TextCell value={a.wbsPath} width={170} disabled={!draft} onCommit={(x) => upd(a.id, { wbsPath: x })} /></label>
      </div>
    </div>
  )
}

function Calendars({ vid, bundle, draft }: { vid: string; bundle: VersionBundle; draft: boolean }) {
  const st = useSchedulingStore()
  const used = (id: string) => bundle.activities.filter((a) => a.calendarId === id).length
  const blank = { code: '', name: '', workDays: [0, 1, 2, 3, 4], hoursPerDay: 8, holidays: [] as string[], isDefault: false }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {bundle.calendars.map((c) => <CalendarCard key={c.id} cal={c} used={used(c.id)} draft={draft} onSave={(x) => st.saveCalendar(vid, { ...x, id: c.id })} onDelete={() => st.deleteCalendar(vid, c.id)} />)}
      {draft && <CalendarCard cal={{ id: '', sourceId: '', ...blank }} used={0} draft isNew onSave={(x) => st.saveCalendar(vid, x)} />}
    </div>
  )
}

function CalendarCard({ cal, used, draft, isNew, onSave, onDelete }: { cal: SchCalendar; used: number; draft: boolean; isNew?: boolean; onSave: (c: Omit<SchCalendar, 'id' | 'sourceId'>) => Promise<boolean>; onDelete?: () => Promise<boolean> }) {
  const [c, setC] = useState(cal), [h, setH] = useState(''), [dirty, setDirty] = useState(false)
  useEffect(() => { setC(cal); setDirty(false) }, [cal])
  const ch = (p: Partial<SchCalendar>) => { setC({ ...c, ...p }); setDirty(true) }
  const ok = c.code.trim() && c.workDays.length > 0 && c.hoursPerDay > 0
  return (
    <Section title={isNew ? 'تقویم جدید' : <span>{c.name || c.code} {c.isDefault && <Chip tone="good">پیش‌فرض</Chip>} <span className="sub">· {fa(used)} فعالیت</span></span>}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="ex-lab">کد<input value={c.code} disabled={!draft} onChange={(e) => ch({ code: e.target.value })} dir="ltr" style={{ width: 110 }} /></label>
        <label className="ex-lab" style={{ flex: '1 1 200px' }}>نام<input value={c.name} disabled={!draft} onChange={(e) => ch({ name: e.target.value })} dir="auto" /></label>
        <label className="ex-lab">ساعت کار روزانه<input type="number" min={1} max={24} value={c.hoursPerDay} disabled={!draft} onChange={(e) => ch({ hoursPerDay: Number(e.target.value) })} style={{ width: 80 }} /></label>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={c.isDefault} disabled={!draft} onChange={(e) => ch({ isDefault: e.target.checked })} /> تقویم پیش‌فرض</label>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '8px 0' }}>
        {DAYS.map((n, i) => <label key={n} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" style={{ width: 'auto' }} checked={c.workDays.includes(i)} disabled={!draft} onChange={(e) => ch({ workDays: e.target.checked ? [...c.workDays, i].sort() : c.workDays.filter((x) => x !== i) })} />{n}</label>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="sub">تعطیلات ({fa(c.holidays.length)}):</span>
        {[...c.holidays].sort().map((x) => <Chip key={x} tone="neutral"><button type="button" disabled={!draft} onClick={() => ch({ holidays: c.holidays.filter((y) => y !== x) })} aria-label="حذف تعطیلی" style={{ all: 'unset', cursor: draft ? 'pointer' : 'default' }}>{jalaliText(x)} {draft && '×'}</button></Chip>)}
        {draft && <><JalaliDateInput value={h} onChange={setH} /><button className="im-btn im-btn-sm" disabled={!h || c.holidays.includes(h)} onClick={() => { ch({ holidays: [...c.holidays, h] }); setH('') }}><Plus size={12} /> تعطیلی</button></>}
      </div>
      {draft && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="im-btn im-btn-primary im-btn-sm" disabled={!ok || (!dirty && !isNew)} onClick={() => void onSave({ code: c.code.trim(), name: c.name.trim(), workDays: c.workDays, hoursPerDay: c.hoursPerDay, holidays: c.holidays, isDefault: c.isDefault }).then((s) => { if (s && isNew) { setC(cal); setDirty(false) } })}>{isNew ? 'افزودن تقویم' : 'ذخیره'}</button>
          {onDelete && !c.isDefault && <button className="im-btn im-btn-sm im-btn-danger" onClick={() => { if (window.confirm(used ? `${fa(used)} فعالیت به تقویم پیش‌فرض منتقل می‌شوند. حذف شود؟` : 'تقویم حذف شود؟')) void onDelete() }}><Trash2 size={12} /> حذف</button>}
        </div>
      )}
    </Section>
  )
}
