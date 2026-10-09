import { useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, MapPin, ShieldCheck, Target, UserRound } from 'lucide-react'
import { useRiskStore, type RiskDraft } from '../store/useRiskStore'
import { useRiskPeopleStore } from '../store/useRiskPeopleStore'
import { useRiskRole } from '../lib/useRiskData'
import { JalaliDateField } from '../../issues/components/JalaliDateField'
import { HelpButton } from '../../issues/components/Help'
import { RK_HELP } from '../lib/help'
import { todayIso } from '../lib/riskScore'
import { IMPACT_ANCHORS_FA, IMPACT_LABELS_FA, PROBABILITY_LABELS_FA, effectivePolicy, impactFromDims, levelOf, zoneOf, ZONE_COLOR, ZONE_LABEL_FA } from '../lib/riskPolicy'
import { STRATEGY_FIELDS } from '../lib/strategyFields'
import {
  RM_IMPACT_DIMS, RM_IMPACT_DIM_LABEL_FA, RM_PROJECT_PHASES, RM_PROJECT_PHASE_LABEL_FA, RM_RESPONSE_STRATEGY_DESCRIPTION_FA, RM_RESPONSE_STRATEGY_LABEL_FA, RM_RISK_TYPE_LABEL_FA, strategiesForRiskType,
  type RmImpactDim, type RmRisk,
} from '../types'
import { Field, PersonSelect, Scale, Section, ScoreBox, digitsOnly, nf } from './rk'

type Errs = Partial<Record<'project' | 'title' | 'category' | 'probability' | 'impact' | 'identified' | 'general', string>>

const blank = (projectId: string): RiskDraft & { projectId: string } => ({
  projectId, title: '', description: '', category: '', subcategory: null, riskType: 'threat', cause: '', riskEvent: '', consequence: '', ownerId: null, monitorId: null, approverId: null, responseOwnerId: null,
  identifiedDate: todayIso(), projectPhase: null, discipline: '', timeToImpactDays: null, probability: 3, impact: 3, impactDims: {}, impactTimeDays: null, impactCost: null, impactObjectives: '',
  responseStrategy: 'mitigate', strategyDetails: {}, assumptions: '', assessmentBasis: '', kmFrom: null, kmTo: null, routeSegment: '', station: '', workFront: '', contractor: '', workPackage: '', execStage: '',
  reviewIntervalDays: null, tags: [], firstAction: '',
})

/** Create or edit a risk. Required fields are marked; a missing/invalid one is explained under the field and stays editable. The inherent score is frozen after creation. */
export function RiskFormModal({ risk, defaultProjectId, onClose, onSaved }: { risk?: RmRisk; defaultProjectId?: string; onClose: () => void; onSaved?: (id: string) => void }) {
  const projects = useRiskStore((s) => s.projects)
  const categories = useRiskStore((s) => s.categories)
  const policies = useRiskStore((s) => s.policies)
  const scope = useRiskStore((s) => s.scopeProjectId)
  const addRisk = useRiskStore((s) => s.addRisk)
  const updateRisk = useRiskStore((s) => s.updateRisk)
  const people = useRiskPeopleStore((s) => s.byProject)
  const allPeople = useRiskPeopleStore((s) => s.all)
  const fetchProject = useRiskPeopleStore((s) => s.fetchProject)
  const fetchAllPeople = useRiskPeopleStore((s) => s.fetchAll)
  const edit = !!risk

  const [f, setF] = useState<RiskDraft & { projectId: string }>(() => risk ? {
    projectId: risk.projectId, title: risk.title, description: risk.description, category: risk.category, subcategory: risk.subcategory, riskType: risk.riskType, cause: risk.cause, riskEvent: risk.riskEvent, consequence: risk.consequence,
    ownerId: risk.ownerId, monitorId: risk.monitorId, approverId: risk.approverId, responseOwnerId: risk.responseOwnerId, identifiedDate: risk.identifiedDate, projectPhase: risk.projectPhase, discipline: risk.discipline,
    timeToImpactDays: risk.timeToImpactDays, probability: risk.initialProbability, impact: risk.initialImpact, impactDims: risk.impactDims, impactTimeDays: risk.impactTimeDays, impactCost: risk.impactCost, impactObjectives: risk.impactObjectives,
    responseStrategy: risk.responseStrategy, strategyDetails: risk.strategyDetails, assumptions: risk.assumptions, assessmentBasis: risk.assessmentBasis, kmFrom: risk.kmFrom, kmTo: risk.kmTo, routeSegment: risk.routeSegment,
    station: risk.station, workFront: risk.workFront, contractor: risk.contractor, workPackage: risk.workPackage, execStage: risk.execStage, reviewIntervalDays: risk.reviewIntervalDays, tags: risk.tags,
  } : blank(defaultProjectId ?? (scope !== 'all' ? scope : '')))
  const [errs, setErrs] = useState<Errs>({})
  const [busy, setBusy] = useState(false)
  const refs = { project: useRef<HTMLSelectElement>(null), title: useRef<HTMLInputElement>(null), category: useRef<HTMLSelectElement>(null) }
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }))
  const clear = (k: keyof Errs) => setErrs((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n })

  useEffect(() => { fetchAllPeople() }, [fetchAllPeople])
  useEffect(() => { if (f.projectId) fetchProject(f.projectId) }, [f.projectId, fetchProject])
  const { canManage } = useRiskRole(f.projectId || null)
  const pool = (f.projectId && people[f.projectId]?.length ? people[f.projectId] : allPeople).map((p) => ({ userId: p.userId, name: p.name, position: p.position }))
  const policy = effectivePolicy(policies, f.projectId || null)

  const score = f.probability * f.impact
  const zone = zoneOf(score, policy)
  const roots = categories.filter((c) => !c.parentKey && c.active)
  const subs = categories.filter((c) => c.parentKey === f.category && c.active)
  const setDim = (d: RmImpactDim, v: number) => setF((o) => { const dims = { ...o.impactDims, [d]: v }; const mx = impactFromDims(dims); return { ...o, impactDims: dims, impact: mx > 0 ? mx : o.impact } })
  const strat = useMemo(() => strategiesForRiskType(f.riskType), [f.riskType])
  const pipelineOpen = useMemo(() => !!(f.kmFrom !== null || f.kmTo !== null || f.station || f.routeSegment || f.workFront || f.contractor || f.workPackage || f.execStage), [f.kmFrom, f.kmTo, f.station, f.routeSegment, f.workFront, f.contractor, f.workPackage, f.execStage])

  const submit = async () => {
    const e: Errs = {}
    if (!f.projectId) e.project = 'پروژه را انتخاب کنید'
    if (f.title.trim().length < 4) e.title = f.title.trim() ? 'عنوان دست‌کم ۴ نویسه باشد' : 'عنوان ریسک را بنویسید'
    if (!f.category) e.category = 'دسته‌بندی را انتخاب کنید'
    if (!edit && !(f.probability >= 1 && f.probability <= 5)) e.probability = 'احتمال را انتخاب کنید'
    if (f.kmFrom !== null && f.kmTo !== null && f.kmFrom > f.kmTo) e.general = 'کیلومتر شروع نباید از کیلومتر پایان بزرگ‌تر باشد'
    setErrs(e)
    const first = (['project', 'title', 'category'] as const).find((k) => e[k])
    if (first) { refs[first].current?.focus(); refs[first].current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
    if (e.general) return
    setBusy(true)
    let r
    if (edit) {
      r = await updateRisk(risk!.id, {
        title: f.title.trim(), description: f.description, category: f.category, subcategory: f.subcategory, riskType: f.riskType, cause: f.cause, riskEvent: f.riskEvent, consequence: f.consequence,
        ownerId: f.ownerId, monitorId: f.monitorId, approverId: f.approverId, responseOwnerId: f.responseOwnerId, identifiedDate: f.identifiedDate, projectPhase: f.projectPhase, discipline: f.discipline,
        timeToImpactDays: f.timeToImpactDays, impactDims: f.impactDims, impactTimeDays: f.impactTimeDays, impactCost: f.impactCost, impactObjectives: f.impactObjectives, responseStrategy: f.responseStrategy,
        strategyDetails: f.strategyDetails, assumptions: f.assumptions, assessmentBasis: f.assessmentBasis, kmFrom: f.kmFrom, kmTo: f.kmTo, routeSegment: f.routeSegment, station: f.station, workFront: f.workFront,
        contractor: f.contractor, workPackage: f.workPackage, execStage: f.execStage, reviewIntervalDays: f.reviewIntervalDays, tags: f.tags,
      })
    } else r = await addRisk(f.projectId, f)
    setBusy(false)
    if (!r.ok) { setErrs({ general: r.error }); return }
    onSaved?.(r.id ?? risk!.id)
    onClose()
  }

  const errList = Object.entries(errs).filter(([, v]) => v).map(([, v]) => v as string)

  return (
    <div className="im-overlay">
      <div className="im-modal" style={{ maxWidth: 820 }} role="dialog" aria-modal="true" aria-label={edit ? 'ویرایش ریسک' : 'ثبت ریسک جدید'}>
        <div className="im-modal-head">
          <div className="im-modal-title">{edit ? `ویرایش ریسک ${risk!.code}` : 'ثبت ریسک جدید'}</div>
          <div className="im-actions"><HelpButton content={RK_HELP.form} /><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        </div>

        {errList.length > 0 && <div className="im-notice bad" role="alert" style={{ marginBottom: 12 }}>{errs.general ? errs.general : <>برای ثبت، این موارد را تکمیل کنید:<ul style={{ margin: '4px 0 0', paddingInlineStart: 18, listStyle: 'disc' }}>{errList.map((m) => <li key={m}>{m}</li>)}</ul></>}</div>}

        <Section title="شناسنامهٔ ریسک" icon={<Target size={15} />}>
          <div className="rk-grid2">
            <Field label="پروژه *" error={errs.project} htmlFor="rk-project">
              <select id="rk-project" ref={refs.project} value={f.projectId} disabled={edit} aria-invalid={!!errs.project} onChange={(e) => { set('projectId', e.target.value); clear('project') }}>
                <option value="">— انتخاب کنید —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.shortCode ? p.shortCode + ' · ' : ''}{p.name}</option>)}
              </select>
            </Field>
            <Field label="تاریخ شناسایی" htmlFor="rk-date"><JalaliDateField id="rk-date" value={f.identifiedDate} onChange={(v) => set('identifiedDate', v)} max={todayIso()} /></Field>
          </div>
          <Field label="عنوان ریسک *" error={errs.title} htmlFor="rk-title">
            <input id="rk-title" ref={refs.title} value={f.title} aria-invalid={!!errs.title} onChange={(e) => { set('title', e.target.value); clear('title') }} placeholder="مثلاً: تأخیر در تحویل لولهٔ ۵۶ اینچ از تأمین‌کننده" autoFocus />
          </Field>
          <div className="rk-grid3">
            <Field label="علت (چرا ممکن است رخ دهد؟)"><textarea style={{ minHeight: 64 }} value={f.cause} onChange={(e) => set('cause', e.target.value)} placeholder="ظرفیت کارخانه، تحریم، شرایط جوی…" /></Field>
            <Field label="رویداد ریسک (چه اتفاقی می‌افتد؟)"><textarea style={{ minHeight: 64 }} value={f.riskEvent} onChange={(e) => set('riskEvent', e.target.value)} placeholder="لوله ۴۵ روز دیرتر تحویل می‌شود" /></Field>
            <Field label="پیامد (چه می‌شود؟)"><textarea style={{ minHeight: 64 }} value={f.consequence} onChange={(e) => set('consequence', e.target.value)} placeholder="توقف جبهه کاری و جریمه قرارداد" /></Field>
          </div>
          <Field label="شرح تکمیلی"><textarea style={{ minHeight: 54 }} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <div className="rk-grid3">
            <Field label="دسته‌بندی *" error={errs.category} htmlFor="rk-cat">
              <select id="rk-cat" ref={refs.category} value={f.category} aria-invalid={!!errs.category} onChange={(e) => { set('category', e.target.value); set('subcategory', null); clear('category') }}>
                <option value="">— انتخاب کنید —</option>{roots.map((c) => <option key={c.key} value={c.key}>{c.labelFa}</option>)}
              </select>
            </Field>
            <Field label="زیردسته"><select value={f.subcategory ?? ''} disabled={!subs.length} onChange={(e) => set('subcategory', e.target.value || null)}><option value="">{subs.length ? '— بدون زیردسته —' : 'ندارد'}</option>{subs.map((c) => <option key={c.key} value={c.key}>{c.labelFa}</option>)}</select></Field>
            <Field label="نوع"><select value={f.riskType} onChange={(e) => { const t = e.target.value as RmRisk['riskType']; set('riskType', t); set('responseStrategy', t === 'threat' ? 'mitigate' : 'exploit') }}>{(['threat', 'opportunity'] as const).map((t) => <option key={t} value={t}>{RM_RISK_TYPE_LABEL_FA[t]}</option>)}</select></Field>
          </div>
          <div className="rk-grid3">
            <Field label="مرحلهٔ چرخه عمر"><select value={f.projectPhase ?? ''} onChange={(e) => set('projectPhase', (e.target.value || null) as RmRisk['projectPhase'])}><option value="">—</option>{RM_PROJECT_PHASES.map((p) => <option key={p} value={p}>{RM_PROJECT_PHASE_LABEL_FA[p]}</option>)}</select></Field>
            <Field label="حوزهٔ تخصصی"><input value={f.discipline} onChange={(e) => set('discipline', e.target.value)} placeholder="مکانیک، خط لوله، برق، …" /></Field>
            <Field label="زمان تا وقوع احتمالی (روز)"><input type="number" min={0} value={f.timeToImpactDays ?? ''} onChange={(e) => set('timeToImpactDays', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} /></Field>
          </div>
        </Section>

        <Section title="مالکیت و مسئولان" icon={<UserRound size={15} />}>
          <div className="im-helper" style={{ marginBottom: 8 }}>فهرست از «مدیریت کاربران» سامانه (کاربران دارای دسترسی به این پروژه) می‌آید.</div>
          <div className="rk-grid2">
            <Field label="مالک ریسک"><PersonSelect value={f.ownerId} onChange={(v) => set('ownerId', v)} people={pool} /></Field>
            <Field label="مسئول اقدامات کاهشی"><PersonSelect value={f.responseOwnerId} onChange={(v) => set('responseOwnerId', v)} people={pool} /></Field>
            <Field label="مسئول پایش"><PersonSelect value={f.monitorId} onChange={(v) => set('monitorId', v)} people={pool} /></Field>
            <Field label="مرجع تأیید"><PersonSelect value={f.approverId} onChange={(v) => set('approverId', v)} people={pool} /></Field>
          </div>
        </Section>

        <Section title={edit ? 'ارزیابی اولیه (ریسک ذاتی — قفل‌شده)' : 'ارزیابی اولیه (ریسک ذاتی)'} icon={<Gauge size={15} />}>
          {edit && <div className="im-notice info" style={{ marginBottom: 10 }}>ریسک ذاتی پس از ثبت تغییر نمی‌کند تا مبنای مقایسه بماند. برای تغییر وضعیت از تب «ارزیابی» یک ارزیابی جدید ثبت کنید.</div>}
          <Field label="احتمال وقوع *" error={errs.probability}><Scale value={f.probability} onChange={(v) => { set('probability', v); clear('probability') }} labels={PROBABILITY_LABELS_FA} disabled={edit} /></Field>
          <Field label={`اثر کلی (بدترین بُعد) *`}><Scale value={f.impact} onChange={(v) => set('impact', v)} labels={IMPACT_LABELS_FA} disabled={edit} /></Field>
          <details open={Object.keys(f.impactDims).length > 0} style={{ margin: '4px 0 10px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}>ارزیابی چندبعدی اثر (زمان، هزینه، کیفیت، HSE، محیط زیست، قانونی، اهداف)</summary>
            <div className="rk-dims" style={{ marginTop: 10 }}>
              {RM_IMPACT_DIMS.map((d) => (
                <div className="rk-dim" key={d}>
                  <label>{RM_IMPACT_DIM_LABEL_FA[d]}</label>
                  <div className="rk-scale" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                    {[0, 1, 2, 3, 4, 5].map((v) => <button key={v} type="button" disabled={edit && false} className={(f.impactDims[d] ?? 0) === v ? 'on' : ''} title={v ? IMPACT_ANCHORS_FA[d][v - 1] : 'ندارد'} onClick={() => setDim(d, v)}>{v || '—'}</button>)}
                  </div>
                </div>
              ))}
              <div className="im-helper">اثر کلی برابر بدترین بُعد است (نه میانگین)؛ یک اثر کوچک مالی نباید اثر ایمنی را پنهان کند.</div>
            </div>
          </details>
          <div className="rk-grid3">
            <Field label="اثر زمانی (روز)"><input type="number" min={0} value={f.impactTimeDays ?? ''} onChange={(e) => set('impactTimeDays', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} /></Field>
            <Field label="اثر مالی (ریال)"><input inputMode="numeric" dir="ltr" style={{ textAlign: 'right' }} value={f.impactCost ? nf(f.impactCost) : ''} placeholder="مثلاً 1,500,000,000" onChange={(e) => set('impactCost', digitsOnly(e.target.value) || null)} /></Field>
            <Field label="اثر بر اهداف فنی/عملیاتی"><input value={f.impactObjectives} onChange={(e) => set('impactObjectives', e.target.value)} /></Field>
          </div>
          <div className="rk-grid2">
            <Field label="مبنا و دلیل امتیازدهی" hint="چرا این احتمال و اثر؟ (آمار، تجربهٔ پروژه‌های قبل، نظر کارشناس)"><textarea style={{ minHeight: 54 }} value={f.assessmentBasis} onChange={(e) => set('assessmentBasis', e.target.value)} /></Field>
            <Field label="فرضیات ارزیابی"><textarea style={{ minHeight: 54 }} value={f.assumptions} onChange={(e) => set('assumptions', e.target.value)} /></Field>
          </div>
          <div className="rk-preview" style={{ ['--c' as string]: ZONE_COLOR[zone] }}>
            <ScoreBox score={score} label="ذاتی" policy={policy} /> <b>{levelLabel(score, policy)}</b> <span style={{ color: ZONE_COLOR[zone], fontWeight: 800 }}>{ZONE_LABEL_FA[zone]}</span>
            <span className="im-helper">آستانه‌ها: پذیرش ≤ {policy.appetiteMax} · تحمل ≤ {policy.toleranceMax} · ارجاع ≥ {policy.escalationMin}</span>
          </div>
        </Section>

        <Section title="راهبرد پاسخ" icon={<ShieldCheck size={15} />}>
          <div className="rk-grid2">
            <Field label="راهبرد"><select value={f.responseStrategy} onChange={(e) => { set('responseStrategy', e.target.value as RmRisk['responseStrategy']); set('strategyDetails', {}) }}>{strat.map((s) => <option key={s} value={s}>{RM_RESPONSE_STRATEGY_LABEL_FA[s]}</option>)}</select></Field>
            {!edit && <Field label="اولین اقدام کاهشی (اختیاری)"><input value={f.firstAction ?? ''} onChange={(e) => set('firstAction', e.target.value)} placeholder="مثلاً: بازدید و ممیزی کارخانهٔ تأمین‌کننده" /></Field>}
          </div>
          <div className="im-helper" style={{ marginBottom: 8 }}>{RM_RESPONSE_STRATEGY_DESCRIPTION_FA[f.responseStrategy]}</div>
          <div className="rk-grid2">
            {STRATEGY_FIELDS[f.responseStrategy].map((sf) => (
              <Field key={sf.key} label={sf.label}>
                {sf.type === 'textarea' ? <textarea style={{ minHeight: 48 }} value={f.strategyDetails[sf.key] ?? ''} onChange={(e) => set('strategyDetails', { ...f.strategyDetails, [sf.key]: e.target.value })} />
                  : sf.type === 'select' ? <select value={f.strategyDetails[sf.key] ?? ''} onChange={(e) => set('strategyDetails', { ...f.strategyDetails, [sf.key]: e.target.value })}><option value="">—</option>{sf.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  : <input type={sf.type === 'date' ? 'date' : 'text'} value={f.strategyDetails[sf.key] ?? ''} onChange={(e) => set('strategyDetails', { ...f.strategyDetails, [sf.key]: e.target.value })} />}
              </Field>
            ))}
          </div>
          {f.responseStrategy === 'accept' && <div className="im-notice" style={{ marginTop: 8 }}>پذیرش رسمی ریسک باقیمانده پس از ثبت، از تب «پاسخ» و با تأیید مرجع مجاز انجام می‌شود.</div>}
        </Section>

        <details open={pipelineOpen} className="rk-sect">
          <summary style={{ cursor: 'pointer', fontWeight: 800, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 7 }}><MapPin size={15} /> جزئیات خط لوله و اجرا (کیلومتراژ، قطعه، ایستگاه، جبهه کاری)</summary>
          <div className="rk-grid3" style={{ marginTop: 10 }}>
            <Field label="از کیلومتر"><input type="number" step="0.1" value={f.kmFrom ?? ''} onChange={(e) => set('kmFrom', e.target.value === '' ? null : Number(e.target.value))} /></Field>
            <Field label="تا کیلومتر"><input type="number" step="0.1" value={f.kmTo ?? ''} onChange={(e) => set('kmTo', e.target.value === '' ? null : Number(e.target.value))} /></Field>
            <Field label="قطعهٔ مسیر"><input value={f.routeSegment} onChange={(e) => set('routeSegment', e.target.value)} /></Field>
            <Field label="ایستگاه"><input value={f.station} onChange={(e) => set('station', e.target.value)} /></Field>
            <Field label="جبهه کاری"><input value={f.workFront} onChange={(e) => set('workFront', e.target.value)} /></Field>
            <Field label="پیمانکار / تأمین‌کننده"><input value={f.contractor} onChange={(e) => set('contractor', e.target.value)} /></Field>
            <Field label="بستهٔ کاری"><input value={f.workPackage} onChange={(e) => set('workPackage', e.target.value)} /></Field>
            <Field label="مرحلهٔ اجرایی"><input value={f.execStage} onChange={(e) => set('execStage', e.target.value)} placeholder="جوشکاری، پوشش، خوابانیدن…" /></Field>
          </div>
        </details>

        <Section title="بازنگری">
          <div className="rk-grid2">
            <Field label="فاصلهٔ بازنگری (روز)" hint={`خالی = طبق سیاست: بحرانی ${policy.reviewDays.critical} · زیاد ${policy.reviewDays.high} · متوسط ${policy.reviewDays.medium} · کم ${policy.reviewDays.low} روز`}>
              <input type="number" min={1} max={730} value={f.reviewIntervalDays ?? ''} onChange={(e) => set('reviewIntervalDays', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="برچسب‌ها (با ویرگول جدا کنید)"><input value={f.tags.join('، ')} onChange={(e) => set('tags', e.target.value.split(/[,،]/).map((t) => t.trim()).filter(Boolean))} /></Field>
          </div>
          {!canManage && edit && <div className="im-helper">ارزیابی رسمی (ثبت بازبینی) فقط برای مدیر پروژه و مدیر ریسک است.</div>}
        </Section>

        <div className="im-actions" style={{ marginTop: 16 }}>
          <button className="im-btn im-btn-primary im-btn-lg" style={{ flex: 1 }} onClick={submit} disabled={busy}>{busy ? 'در حال ذخیره…' : edit ? 'ذخیرهٔ تغییرات' : 'ثبت ریسک'}</button>
          <button className="im-btn im-btn-ghost im-btn-lg" onClick={onClose} disabled={busy}>بستن</button>
        </div>
      </div>
    </div>
  )
}

const levelLabel = (score: number, p: Parameters<typeof levelOf>[1]) => ({ low: 'سطح کم', medium: 'سطح متوسط', high: 'سطح زیاد', critical: 'سطح بحرانی' }[levelOf(score, p)])
