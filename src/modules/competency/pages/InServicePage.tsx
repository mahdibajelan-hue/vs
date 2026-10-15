import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardCheck, Lock, Plus, Trash2, Unlock, UserPlus } from 'lucide-react'
import { useCompetencyStore } from '../store/useCompetencyStore'
import { useInServiceStore, type InServiceCycle } from '../store/useInServiceStore'
import { CompetencySidebarShell, type CompetencySection } from '../components/CompetencySidebarShell'
import { BAND_FA, COMPONENT_LABEL_FA, cycleScore, jalaliQuarter, KIND_LABEL_FA, type RaterKind, type ResultItem } from '../lib/inservice'
import { HBars, PB } from '../../finance/components/charts'
import { useAuthStore } from '../../../store/useAuthStore'
import { formatJalali } from '../../../lib/jalali'
import '../../finance/finance-dashboard.css'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const KINDS: RaterKind[] = ['employer', 'supervisor', 'peer', 'subordinate']

/** Quarterly evaluation of people working on projects: employer + 360° ratings per competency, a technical assessment and measured project results, combined into one score per quarter. */
export function InServicePage({ onExitToHub, nav }: { onExitToHub: () => void; nav: Partial<Record<CompetencySection, () => void>> }) {
  const st = useInServiceStore()
  const assessments = useCompetencyStore((s) => s.assessments)
  const competencies = useCompetencyStore((s) => s.competencies)
  const requirements = useCompetencyStore((s) => s.jobCompetencyRequirements)
  const profiles = useCompetencyStore((s) => s.profiles)
  const fetchProfiles = useCompetencyStore((s) => s.fetchProfiles)
  const moduleAdmins = useCompetencyStore((s) => s.moduleAdmins)
  const designers = useCompetencyStore((s) => s.assessmentDesigners)
  const me = useAuthStore((s) => s.profile)
  const [sel, setSel] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draftRatings, setDraftRatings] = useState<Record<string, { rating: number; notes: string }>>({})
  const isManager = Boolean(me?.isAdmin) || moduleAdmins.some((m) => m.userId === me?.id) || designers.some((d) => d.userId === me?.id)
  useEffect(() => { void st.fetchAll(); void fetchProfiles() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const person = (id: string) => assessments.find((a) => a.id === id)
  const name = (uid: string) => profiles.find((p) => p.id === uid)?.fullName || profiles.find((p) => p.id === uid)?.email || 'کاربر'
  const cycle = st.cycles.find((c) => c.id === sel) ?? null
  const mine = (c: InServiceCycle) => st.raters.find((r) => r.cycleId === c.id && r.userId === me?.id)
  const visible = st.cycles
  // people working on a project who have no cycle for the current quarter yet: a cycle is only ever created by a manager, so without this list they would never appear on the page
  const quarter = useMemo(() => jalaliQuarter(new Date().toISOString().slice(0, 10)), [])
  const waiting = useMemo(() => assessments.filter((a) => a.workStatus === 'on_project' && !st.cycles.some((c) => c.assessmentId === a.id && c.periodStart === quarter.start)), [assessments, st.cycles, quarter])
  const [bulkBusy, setBulkBusy] = useState(false)
  const openFor = async (a: { id: string; workProjectName: string }) => { const id = await st.createCycle({ assessmentId: a.id, periodLabel: quarter.label, periodStart: quarter.start, periodEnd: quarter.end, projectName: a.workProjectName, dueDate: quarter.end }); if (id) setSel(id) }
  const openAll = async () => { setBulkBusy(true); for (const a of waiting) await openFor(a); setBulkBusy(false) }
  const sc = useMemo(() => {
    if (!cycle) return null
    const kindOf = new Map(st.raters.filter((r) => r.cycleId === cycle.id).map((r) => [r.userId, r.kind]))
    const ratings = st.ratings.filter((r) => r.cycleId === cycle.id && kindOf.has(r.raterId)).map((r) => ({ kind: kindOf.get(r.raterId) as RaterKind, rating: r.rating }))
    return cycleScore({ ratings, technical: cycle.technicalScore, results: cycle.resultsItems, weights: cycle.weights })
  }, [cycle, st.raters, st.ratings])
  const reqs = useMemo(() => { const p = cycle ? person(cycle.assessmentId) : null; return p ? requirements.filter((r) => r.jobRole === p.jobRole).map((r) => ({ req: r, comp: competencies.find((c) => c.id === r.competencyId) })).filter((x) => x.comp) : [] }, [cycle, requirements, competencies, assessments]) // eslint-disable-line react-hooks/exhaustive-deps
  const myRatings = (c: InServiceCycle) => new Map(st.ratings.filter((r) => r.cycleId === c.id && r.raterId === me?.id).map((r) => [r.competencyId, r]))

  return (
    <CompetencySidebarShell active="inservice" nav={nav} title="ارزیابی حین کار (فصلی)" onExitToHub={onExitToHub} headerRight={isManager ? <button className="im-btn im-btn-primary" onClick={() => setAdding(true)}><Plus size={14} /> دورهٔ ارزیابی جدید</button> : undefined}>
      {st.error && <div className="im-card" role="alert" style={{ padding: '10px 14px', borderColor: 'var(--im-coral)' }}>{st.error}</div>}
      <p className="im-helper" style={{ margin: 0 }}>برای افرادی که در پروژه‌ها مشغول‌اند، هر فصل یک دورهٔ ارزیابی باز می‌شود؛ کارفرما، سرپرست، همکاران و زیردستان هر شایستگی را ۱ تا ۵ نمره می‌دهند، ارزیابی تخصصی و نتایج اقدام‌های فرد در پروژه ثبت می‌شود و امتیاز فصل از ترکیب وزنی آن‌ها به دست می‌آید.</p>

      <div className="comp-inv">
        <section className="im-card comp-box">
          {isManager && waiting.length > 0 && (
            <div className="im-card" style={{ padding: 10, marginBottom: 10, display: 'grid', gap: 6, borderInlineStart: '3px solid var(--im-amber)' }}>
              <b>شاغلان در پروژه بدون دورهٔ {quarter.label}</b>
              <small className="im-helper" style={{ margin: 0 }}>دورهٔ ارزیابی خودکار ساخته نمی‌شود؛ برای هر فرد شاغل باید باز شود.</small>
              {waiting.map((a) => <div key={a.id} className="comp-talent-row" style={{ alignItems: 'center' }}><span style={{ flex: 1 }}><b>{a.candidateName}</b>{a.workProjectName ? <small className="im-helper"> — {a.workProjectName}</small> : null}</span><button className="im-btn im-btn-sm im-btn-primary" disabled={bulkBusy} onClick={() => void openFor(a)}>باز کردن دوره</button></div>)}
              {waiting.length > 1 && <button className="im-btn im-btn-sm" disabled={bulkBusy} onClick={() => void openAll()}>باز کردن دوره برای همهٔ {fa(waiting.length)} نفر</button>}
            </div>
          )}
          <header><h3><ClipboardCheck size={15} aria-hidden /> دوره‌ها <em>{fa(visible.length)}</em></h3></header>
          {visible.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>{isManager ? 'هنوز دوره‌ای ثبت نشده است. با «دورهٔ ارزیابی جدید» برای یک فرد شاغل در پروژه شروع کنید.' : 'ارزیابی‌ای به شما ارجاع نشده است.'}</p> : (
            <ul className="comp-rows">
              {visible.map((c) => { const p = person(c.assessmentId); const m = mine(c); const band = BAND_FA(c.finalScore); return (
                <li key={c.id}><button className={c.id === sel ? 'sel' : ''} onClick={() => setSel(c.id)}>
                  <span className="av">{(p?.candidateName ?? '؟').split(' ').slice(0, 2).map((w) => w[0]).join('')}</span>
                  <span className="who"><b>{p?.candidateName ?? '—'}</b><small>{c.periodLabel}{c.projectName ? ` · ${c.projectName}` : ''}</small></span>
                  <span className="step" style={{ color: c.status === 'closed' ? band.color : undefined }}>{c.status === 'closed' ? `${fa(c.finalScore ?? 0)} · ${band.label}` : m && !m.submittedAt ? 'منتظر نمرهٔ شما' : 'در جریان'}</span>
                  <span />
                </button></li>
              ) })}
            </ul>
          )}
        </section>

        {cycle && sc && (() => { const p = person(cycle.assessmentId); const band = BAND_FA(sc.final); const m = mine(cycle); const open = cycle.status === 'open'; const mr = myRatings(cycle); return (
          <div className="comp-inv-detail">
            <section className="im-card comp-box">
              <header>
                <div><h3>{p?.candidateName} <span className="im-helper">· {p?.candidatePosition}</span></h3><p className="im-helper" style={{ margin: 0 }}>{cycle.periodLabel} ({formatJalali(cycle.periodStart)} تا {formatJalali(cycle.periodEnd)}){cycle.projectName ? ` · پروژه ${cycle.projectName}` : ''}</p></div>
                <div style={{ textAlign: 'end' }}><b style={{ fontSize: 26, color: band.color }}>{sc.final == null ? '—' : fa(sc.final)}</b><div className="im-helper">{band.label} · پوشش شواهد {fa(sc.coverage * 100)}٪</div></div>
              </header>
              <div className="fx-remap"><HBars fmt={(x) => fa(x)} h={sc.components.length * 34 + 16} data={sc.components.map((c, i) => ({ name: COMPONENT_LABEL_FA[c.key], value: Math.round(c.score ?? 0), color: c.score == null ? 'var(--im-line-2)' : [PB.teal, PB.blue, PB.yellow, PB.violet, PB.orange, PB.sky][i % 6] }))} /></div>
              <p className="im-helper" style={{ margin: 0 }}>وزن هر منبع: {sc.components.map((c) => `${COMPONENT_LABEL_FA[c.key]} ${fa(c.weight)}`).join(' · ')}</p>
              {sc.missing.length > 0 && <p className="im-helper" style={{ margin: 0 }}>دادهٔ این منبع‌ها هنوز نرسیده و در امتیاز حساب نشده است: {sc.missing.join('، ')}.</p>}
              {isManager && <div className="comp-talent-row">
                {open ? <button className="im-btn im-btn-primary" onClick={() => void st.closeCycle(cycle.id, sc.final)}><Lock size={14} /> بستن دوره و ثبت امتیاز</button> : <button className="im-btn im-btn-ghost" onClick={() => void st.reopenCycle(cycle.id)}><Unlock size={14} /> بازگشایی دوره</button>}
              </div>}
            </section>

            <section className="im-card comp-box">
              <header><h3><UserPlus size={15} aria-hidden /> ارزیابان</h3></header>
              <ul className="comp-rows">
                {st.raters.filter((r) => r.cycleId === cycle.id).map((r) => (
                  <li key={r.userId}><div className="comp-row-static"><span className="who"><b>{name(r.userId)}</b><small>{KIND_LABEL_FA[r.kind]}</small></span>
                    <span className="step">{r.submittedAt ? <span style={{ color: 'var(--im-mint)' }}><CheckCircle2 size={13} /> ثبت‌شده</span> : 'منتظر'}</span>
                    {isManager && open && <button className="im-btn im-btn-ghost im-btn-sm" aria-label="حذف ارزیاب" onClick={() => void st.removeRater(cycle.id, r.userId)}><Trash2 size={13} /></button>}</div></li>
                ))}
              </ul>
              {isManager && open && <AddRater onAdd={(uid, kind) => void st.addRater(cycle.id, uid, kind)} users={profiles.map((x) => ({ id: x.id, name: x.fullName || x.email }))} />}
            </section>

            {m && open && (
              <section className="im-card comp-box">
                <header><h3>فرم ارزیابی من ({KIND_LABEL_FA[m.kind]}) {m.submittedAt && <em style={{ background: 'var(--im-mint)' }}>ثبت‌شده</em>}</h3></header>
                {reqs.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>برای این شغل الزام شایستگی تعریف نشده است (تنظیمات ← مدل شایستگی).</p> : (
                  <div className="comp-form">
                    {reqs.map(({ req, comp }) => { const d = draftRatings[req.competencyId] ?? { rating: mr.get(req.competencyId)?.rating ?? 0, notes: mr.get(req.competencyId)?.notes ?? '' }; return (
                      <div key={req.competencyId} className="comp-form-row">
                        <div><b>{comp!.labelFa}</b>{req.isCritical && <em className="crit">حیاتی</em>}<small>الزام شغل: سطح {fa(req.requiredLevel)}</small></div>
                        <div className="comp-scale" role="radiogroup" aria-label={comp!.labelFa}>{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={d.rating === n} className={d.rating === n ? 'on' : ''} onClick={() => setDraftRatings({ ...draftRatings, [req.competencyId]: { ...d, rating: n } })}>{fa(n)}</button>)}</div>
                        <input placeholder="یادداشت یا نمونهٔ رفتاری (اختیاری)" value={d.notes} onChange={(e) => setDraftRatings({ ...draftRatings, [req.competencyId]: { ...d, notes: e.target.value } })} />
                      </div>
                    ) })}
                    <div className="comp-talent-row">
                      <button className="im-btn im-btn-ghost" onClick={() => void st.saveMyRatings(cycle.id, reqs.map(({ req }) => ({ req, d: draftRatings[req.competencyId] ?? { rating: mr.get(req.competencyId)?.rating ?? 0, notes: mr.get(req.competencyId)?.notes ?? '' } })).filter((x) => x.d.rating > 0).map((x) => ({ competencyId: x.req.competencyId, rating: x.d.rating, notes: x.d.notes })), false)}>ذخیرهٔ پیش‌نویس</button>
                      <button className="im-btn im-btn-primary" onClick={() => void st.saveMyRatings(cycle.id, reqs.map(({ req }) => ({ req, d: draftRatings[req.competencyId] ?? { rating: mr.get(req.competencyId)?.rating ?? 0, notes: mr.get(req.competencyId)?.notes ?? '' } })).filter((x) => x.d.rating > 0).map((x) => ({ competencyId: x.req.competencyId, rating: x.d.rating, notes: x.d.notes })), true)}>ثبت نهایی نمره‌ها</button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {isManager && (
              <>
                <section className="im-card comp-box">
                  <header><h3>ارزیابی تخصصی</h3></header>
                  <div className="comp-talent-row">
                    <label className="comp-talent-f"><span>نمرهٔ ارزیابی تخصصی (۰ تا ۱۰۰)</span><input type="number" min={0} max={100} disabled={!open} defaultValue={cycle.technicalScore ?? ''} onBlur={(e) => void st.patchCycle(cycle.id, { technical_score: e.target.value === '' ? null : Math.min(100, Math.max(0, +e.target.value)) })} /></label>
                    <label className="comp-talent-f" style={{ flex: '2 1 280px' }}><span>یادداشت (موضوع‌ها و سؤال‌های تخصصی پرسیده‌شده)</span><input disabled={!open} defaultValue={cycle.technicalNote} onBlur={(e) => void st.patchCycle(cycle.id, { technical_note: e.target.value })} /></label>
                  </div>
                </section>
                <ResultsEditor cycle={cycle} onChange={(items) => void st.patchCycle(cycle.id, { results_items: items })} disabled={!open} />
              </>
            )}
          </div>
        ) })()}
      </div>

      {adding && <NewCycle onClose={() => setAdding(false)} onCreate={async (a) => { const id = await st.createCycle(a); if (id) { setSel(id); setAdding(false) } }} people={assessments.filter((a) => a.workStatus === 'on_project')} all={assessments} />}
    </CompetencySidebarShell>
  )
}

function AddRater({ users, onAdd }: { users: { id: string; name: string }[]; onAdd: (id: string, kind: RaterKind) => void }) {
  const [u, setU] = useState(''); const [k, setK] = useState<RaterKind>('employer')
  return (
    <div className="comp-talent-row">
      <select value={u} onChange={(e) => setU(e.target.value)} aria-label="کاربر" style={{ maxWidth: 260 }}><option value="">کاربر…</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select value={k} onChange={(e) => setK(e.target.value as RaterKind)} aria-label="نقش ارزیاب" style={{ maxWidth: 170 }}>{KINDS.map((x) => <option key={x} value={x}>{KIND_LABEL_FA[x]}</option>)}</select>
      <button className="im-btn im-btn-ghost" disabled={!u} onClick={() => { onAdd(u, k); setU('') }}>افزودن ارزیاب</button>
    </div>
  )
}

function ResultsEditor({ cycle, onChange, disabled }: { cycle: InServiceCycle; onChange: (items: ResultItem[]) => void; disabled: boolean }) {
  const items = cycle.resultsItems
  const set = (i: number, p: Partial<ResultItem>) => onChange(items.map((x, k) => (k === i ? { ...x, ...p } : x)))
  return (
    <section className="im-card comp-box">
      <header><h3>نتایج اقدام‌های فرد در پروژه</h3>{!disabled && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => onChange([...items, { label: '', score: 70, weight: 1 }])}><Plus size={13} /> شاخص</button>}</header>
      <p className="im-helper" style={{ margin: 0 }}>شاخص‌های اندازه‌گیری‌شده (مثل پیشرفت فیزیکی، نرخ تعمیر جوش، رعایت HSE، تحویل به‌موقع) را با نمرهٔ ۰ تا ۱۰۰ و وزن ثبت کنید.</p>
      {items.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>شاخصی ثبت نشده است.</p> : items.map((it, i) => (
        <div key={i} className="comp-talent-row" style={{ alignItems: 'center' }}>
          <input style={{ flex: '2 1 200px' }} placeholder="شاخص" disabled={disabled} defaultValue={it.label} onBlur={(e) => set(i, { label: e.target.value })} />
          <input style={{ flex: '0 0 90px' }} type="number" min={0} max={100} disabled={disabled} defaultValue={it.score} aria-label="نمره" onBlur={(e) => set(i, { score: Math.min(100, Math.max(0, +e.target.value)) })} />
          <input style={{ flex: '0 0 80px' }} type="number" min={0} step={0.5} disabled={disabled} defaultValue={it.weight} aria-label="وزن" onBlur={(e) => set(i, { weight: Math.max(0, +e.target.value) })} />
          {!disabled && <button className="im-btn im-btn-ghost im-btn-sm" aria-label="حذف" onClick={() => onChange(items.filter((_, k) => k !== i))}><Trash2 size={13} /></button>}
        </div>
      ))}
    </section>
  )
}

function NewCycle({ people, all, onCreate, onClose }: { people: { id: string; candidateName: string; workProjectName: string }[]; all: { id: string; candidateName: string; workProjectName: string }[]; onCreate: (a: { assessmentId: string; periodLabel: string; periodStart: string; periodEnd: string; projectName: string; dueDate: string | null }) => void; onClose: () => void }) {
  const q = jalaliQuarter(new Date().toISOString().slice(0, 10))
  const [showAll, setShowAll] = useState(people.length === 0)
  const list = showAll ? all : people
  const [id, setId] = useState(''); const [label, setLabel] = useState(q.label)
  const p = list.find((x) => x.id === id)
  return (
    <div className="comp-drawer-bg" onClick={onClose}>
      <div className="im-card" role="dialog" aria-modal="true" aria-label="دورهٔ ارزیابی جدید" onClick={(e) => e.stopPropagation()} style={{ position: 'fixed', top: '12%', insetInline: 0, margin: 'auto', width: 'min(520px, 94vw)', padding: 18, display: 'grid', gap: 12, zIndex: 62 }}>
        <h3 style={{ margin: 0 }}>دورهٔ ارزیابی جدید</h3>
        <label>فرد<select value={id} onChange={(e) => setId(e.target.value)}><option value="">انتخاب…</option>{list.map((x) => <option key={x.id} value={x.id}>{x.candidateName}{x.workProjectName ? ` — ${x.workProjectName}` : ''}</option>)}</select></label>
        <label className="comp-talent-check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> نمایش همهٔ افراد (نه فقط شاغلان در پروژه)</label>
        <label>دوره<input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <div className="comp-talent-row"><button className="im-btn im-btn-primary" disabled={!id || !label.trim()} onClick={() => onCreate({ assessmentId: id, periodLabel: label.trim(), periodStart: q.start, periodEnd: q.end, projectName: p?.workProjectName ?? '', dueDate: q.end })}>ایجاد دوره</button><button className="im-btn im-btn-ghost" onClick={onClose}>انصراف</button></div>
      </div>
    </div>
  )
}
