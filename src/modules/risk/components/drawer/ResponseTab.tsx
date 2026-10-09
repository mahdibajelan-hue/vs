import { useMemo, useState } from 'react'
import { Ban, CheckCircle2, ChevronDown, ChevronUp, CornerDownLeft, Pencil, Play, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { formatJalali } from '../../../../lib/jalali'
import { JalaliDateField } from '../../../issues/components/JalaliDateField'
import { useRiskStore } from '../../store/useRiskStore'
import { useRiskDirectory } from '../../lib/useRiskData'
import { useRiskPeopleStore } from '../../store/useRiskPeopleStore'
import { todayIso } from '../../lib/riskScore'
import { analyzeActionEffects, EFFECT_VERDICT_LABEL_FA } from '../../lib/riskEffect'
import { addDays } from '../../lib/riskState'
import {
  RM_ACCEPT_STATUS_LABEL_FA, RM_ACTION_STATUS_LABEL_FA, RM_ACTION_TYPE_LABEL_FA, RM_CONTINGENCY_STATUS_LABEL_FA, RM_EFFECT_LABEL_FA, RM_RESPONSE_STRATEGY_DESCRIPTION_FA, RM_RESPONSE_STRATEGY_LABEL_FA,
  type RmActionType, type RmEffectStatus, type RmRiskAction,
} from '../../types'
import { digitsOnly, Field, nf, PersonSelect } from '../rk'
import { STRATEGY_FIELDS } from '../../lib/strategyFields'
import type { TabProps } from './common'

const ST_COLOR: Record<string, string> = { not_started: '#94a3b8', in_progress: '#0ea5e9', completed: '#22c55e', blocked: '#ef4444', cancelled: '#64748b' }
const EFFECT_COLOR: Record<RmEffectStatus, string> = { pending: '#94a3b8', effective: '#22c55e', partial: '#eab308', ineffective: '#ef4444', not_applicable: '#64748b' }

interface ActionForm { description: string; actionType: RmActionType; ownerId: string | null; dueDate: string | null; plannedStart: string | null; expectedOutput: string; expectedEffect: string; resources: string; completionCriteria: string; cost: number | null; benefit: number | null; parent: string | null }
const emptyForm = (owner: string | null): ActionForm => ({ description: '', actionType: 'mitigating', ownerId: owner, dueDate: addDays(todayIso(), 14), plannedStart: null, expectedOutput: '', expectedEffect: '', resources: '', completionCriteria: '', cost: null, benefit: null, parent: null })

function OptDate({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><div style={{ flex: 1 }}><JalaliDateField value={value ?? todayIso()} onChange={onChange} /></div>{value && <button type="button" className="im-ghostlink" onClick={() => onChange(null)}>بدون تاریخ</button>}{!value && <span className="im-helper">تعیین‌نشده</span>}</div>
}

export function ResponseTab({ risk, state, policy, canEdit, canManage }: TabProps) {
  const allActions = useRiskStore((s) => s.actions)
  const assessments = useRiskStore((s) => s.assessments)
  const contingency = useRiskStore((s) => s.contingency).filter((c) => c.riskId === risk.id)
  const acceptances = useRiskStore((s) => s.acceptances).filter((a) => a.riskId === risk.id)
  const { addAction, updateAction, deleteAction, addContingency, updateContingency, deleteContingency, requestAcceptance, decideAcceptance, updateRisk } = useRiskStore.getState()
  const people = useRiskPeopleStore((s) => s.byProject[risk.projectId]) ?? []
  const dir = useRiskDirectory()
  const today = todayIso()
  const actions = useMemo(() => allActions.filter((a) => a.riskId === risk.id), [allActions, risk.id])
  const effects = useMemo(() => new Map(analyzeActionEffects(risk, assessments, actions, today).map((e) => [e.action.id, e])), [risk, assessments, actions, today])
  const roots = actions.filter((a) => !a.parentActionId)

  const [form, setForm] = useState<{ id: string | null; f: ActionForm } | null>(null)
  const [err, setErr] = useState('')
  const [block, setBlock] = useState<{ id: string; reason: string } | null>(null)
  const [verify, setVerify] = useState<{ id: string; status: RmEffectStatus; note: string } | null>(null)
  const [cform, setCform] = useState<{ trigger: string; plan: string; ownerId: string | null; budget: number | null } | null>(null)
  const [acc, setAcc] = useState<{ rationale: string; until: string | null } | null>(null)
  const [accErr, setAccErr] = useState('')
  const [showMore, setShowMore] = useState(false)

  const saveAction = async () => {
    if (!form) return
    const f = form.f
    if (f.description.trim().length < 3) { setErr('شرح اقدام را بنویسید'); return }
    const payload = { description: f.description.trim(), actionType: f.actionType, ownerId: f.ownerId, dueDate: f.dueDate, plannedStart: f.plannedStart, expectedOutput: f.expectedOutput, expectedEffect: f.expectedEffect, resources: f.resources, completionCriteria: f.completionCriteria, costEstimate: f.cost, benefitEstimate: f.benefit, parentActionId: f.parent }
    const r = form.id ? await updateAction(form.id, payload) : await addAction(risk.id, payload)
    if (!r.ok) { setErr(r.error ?? ''); return }
    setErr(''); setForm(null); setShowMore(false)
  }
  const setStatus = async (a: RmRiskAction, status: RmRiskAction['status'], extra: Partial<RmRiskAction> = {}) => {
    const r = await updateAction(a.id, { status, ...extra })
    if (!r.ok) setErr(r.error ?? '')
    else setErr('')
  }
  const doBlock = async () => {
    if (!block) return
    if (block.reason.trim().length < 3) { setErr('علت انسداد را بنویسید'); return }
    const a = actions.find((x) => x.id === block.id)!
    await setStatus(a, 'blocked', { blockedReason: block.reason.trim() })
    setBlock(null)
  }
  const doVerify = async () => {
    if (!verify) return
    const r = await updateAction(verify.id, { effectStatus: verify.status, effectNote: verify.note.trim() })
    if (!r.ok) { setErr(r.error ?? ''); return }
    setErr(''); setVerify(null)
  }

  const renderAction = (a: RmRiskAction, depth = 0) => {
    const e = effects.get(a.id)
    const overdue = a.status !== 'completed' && a.status !== 'cancelled' && a.dueDate && a.dueDate < today
    const kids = actions.filter((x) => x.parentActionId === a.id)
    return (
      <div key={a.id} style={{ marginInlineStart: depth * 22 }}>
        <div className="im-task" style={{ borderInlineStart: `4px solid ${ST_COLOR[a.status]}`, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ textDecoration: a.status === 'completed' || a.status === 'cancelled' ? 'line-through' : undefined, opacity: a.status === 'cancelled' ? 0.6 : 1, fontWeight: 700 }}>{a.description}</div>
              <div className="im-helper">{RM_ACTION_TYPE_LABEL_FA[a.actionType]} · {a.ownerId ? dir.name(a.ownerId) : 'بدون مسئول'}{a.dueDate ? ` · سررسید ${formatJalali(a.dueDate)}` : ' · بدون سررسید'}{a.costEstimate ? ` · هزینه ${nf(a.costEstimate)} ریال` : ''}</div>
              {(a.expectedOutput || a.expectedEffect || a.completionCriteria) && <div className="im-helper">{a.expectedOutput && <>خروجی: {a.expectedOutput}. </>}{a.expectedEffect && <>اثر مورد انتظار: {a.expectedEffect}. </>}{a.completionCriteria && <>معیار تکمیل: {a.completionCriteria}</>}</div>}
              {a.status === 'blocked' && <div className="rk-flag" style={{ ['--c' as string]: '#ef4444', marginTop: 4 }}>مسدود: {a.blockedReason}</div>}
            </div>
            <div style={{ textAlign: 'left' }}>
              <span className="rk-flag" style={{ ['--c' as string]: ST_COLOR[a.status] }}>{RM_ACTION_STATUS_LABEL_FA[a.status]}</span>
              {overdue && <span className="rk-flag" style={{ ['--c' as string]: '#ef4444', marginInlineStart: 4 }}>{Math.round((Date.parse(today) - Date.parse(a.dueDate!)) / 86400000)} روز تأخیر</span>}
            </div>
          </div>
          {(a.status === 'in_progress' || a.status === 'not_started') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div className="im-bar" style={{ flex: 1 }}><i style={{ width: `${a.completionPercentage}%` }} /></div>
              {canEdit ? <input type="range" min={0} max={90} step={10} value={a.completionPercentage} aria-label="درصد پیشرفت" style={{ width: 110 }} onChange={(ev) => updateAction(a.id, { completionPercentage: Number(ev.target.value), status: a.status === 'not_started' && Number(ev.target.value) > 0 ? 'in_progress' : a.status })} /> : null}
              <span className="im-helper">{a.completionPercentage}٪</span>
            </div>
          )}
          {a.status === 'completed' && e && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="rk-flag" style={{ ['--c' as string]: EFFECT_COLOR[a.effectStatus === 'pending' ? 'pending' : a.effectStatus] }}>اثر: {a.effectStatus === 'pending' ? EFFECT_VERDICT_LABEL_FA[e.verdict] : RM_EFFECT_LABEL_FA[a.effectStatus]}</span>
              {e.delta !== null && <span className="im-helper">امتیاز {e.before} ← {e.after} پس از اقدام</span>}
              {e.overdueForReassessment && <span className="rk-flag" style={{ ['--c' as string]: '#f59e0b' }}>ریسک پس از این اقدام دوباره ارزیابی نشده</span>}
              {a.effectNote && <span className="im-helper">{a.effectNote}</span>}
              {canManage && a.effectStatus === 'pending' && <button className="im-ghostlink" onClick={() => setVerify({ id: a.id, status: 'effective', note: '' })}>راستی‌آزمایی اثر</button>}
            </div>
          )}
          {canEdit && (
            <div className="im-actions" style={{ marginTop: 6 }}>
              {a.status === 'not_started' && <button className="im-ghostlink" onClick={() => setStatus(a, 'in_progress')}><Play size={11} /> شروع</button>}
              {(a.status === 'in_progress' || a.status === 'not_started') && <button className="im-ghostlink" onClick={() => setStatus(a, 'completed')}><CheckCircle2 size={11} /> تکمیل شد</button>}
              {(a.status === 'in_progress' || a.status === 'not_started') && <button className="im-ghostlink" onClick={() => setBlock({ id: a.id, reason: '' })}><Ban size={11} /> مسدود</button>}
              {a.status === 'blocked' && <button className="im-ghostlink" onClick={() => setStatus(a, 'in_progress')}><CornerDownLeft size={11} /> رفع انسداد</button>}
              {(a.status === 'completed' || a.status === 'cancelled') && <button className="im-ghostlink" onClick={() => setStatus(a, 'in_progress')}><RotateCcw size={11} /> بازگشایی</button>}
              {a.status !== 'cancelled' && a.status !== 'completed' && <button className="im-ghostlink" onClick={() => setStatus(a, 'cancelled')}>لغو</button>}
              <button className="im-ghostlink" onClick={() => setForm({ id: a.id, f: { description: a.description, actionType: a.actionType, ownerId: a.ownerId, dueDate: a.dueDate, plannedStart: a.plannedStart, expectedOutput: a.expectedOutput, expectedEffect: a.expectedEffect, resources: a.resources, completionCriteria: a.completionCriteria, cost: a.costEstimate, benefit: a.benefitEstimate, parent: a.parentActionId } })}><Pencil size={11} /> ویرایش</button>
              {depth === 0 && <button className="im-ghostlink" onClick={() => setForm({ id: null, f: { ...emptyForm(a.ownerId), parent: a.id } })}><Plus size={11} /> زیراقدام</button>}
              <button className="im-ghostlink" style={{ color: 'var(--im-coral)' }} onClick={() => { if (window.confirm('این اقدام حذف شود؟')) deleteAction(a.id) }}><Trash2 size={11} /></button>
            </div>
          )}
          {block?.id === a.id && (
            <div className="im-card-flat" style={{ marginTop: 8 }}>
              <Field label="علت انسداد *"><input value={block.reason} onChange={(ev) => setBlock({ ...block, reason: ev.target.value })} placeholder="منتظر تصمیم، مدرک، منبع…" autoFocus /></Field>
              <div className="im-actions"><button className="im-btn im-btn-primary im-btn-sm" onClick={doBlock}>ثبت انسداد</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setBlock(null)}>انصراف</button></div>
            </div>
          )}
          {verify?.id === a.id && (
            <div className="im-card-flat" style={{ marginTop: 8 }}>
              <div className="rk-grid2">
                <Field label="نتیجهٔ اثر"><select value={verify.status} onChange={(ev) => setVerify({ ...verify, status: ev.target.value as RmEffectStatus })}><option value="effective">مؤثر — اثر مورد انتظار حاصل شد</option><option value="partial">اثر نسبی</option><option value="ineffective">بی‌اثر — اثر مورد انتظار حاصل نشد</option><option value="not_applicable">نامربوط</option></select></Field>
                <Field label={verify.status === 'not_applicable' ? 'یادداشت' : 'شاهد / یادداشت *'}><input value={verify.note} onChange={(ev) => setVerify({ ...verify, note: ev.target.value })} placeholder="چه شاهدی اثر را تأیید می‌کند؟" /></Field>
              </div>
              <div className="im-actions"><button className="im-btn im-btn-primary im-btn-sm" onClick={doVerify}>ثبت نتیجه</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setVerify(null)}>انصراف</button></div>
            </div>
          )}
        </div>
        {kids.map((k) => renderAction(k, depth + 1))}
      </div>
    )
  }

  const stratFields = STRATEGY_FIELDS[risk.responseStrategy] ?? []
  const pendingAcc = acceptances.find((a) => a.status === 'requested')
  const approvedAcc = acceptances.find((a) => a.status === 'approved' && (!a.validUntil || a.validUntil >= today))

  return (
    <div>
      <div className="im-card-flat" style={{ marginBottom: 14 }}>
        <div className="im-section-title" style={{ marginBottom: 4 }}>راهبرد پاسخ: {RM_RESPONSE_STRATEGY_LABEL_FA[risk.responseStrategy]}</div>
        <div className="im-helper">{RM_RESPONSE_STRATEGY_DESCRIPTION_FA[risk.responseStrategy]}</div>
        {stratFields.some((sf) => risk.strategyDetails[sf.key]) && <div style={{ marginTop: 8, display: 'grid', gap: 3, fontSize: 12.5 }}>{stratFields.filter((sf) => risk.strategyDetails[sf.key]).map((sf) => <div key={sf.key}><b>{sf.label.split('—')[0].trim()}:</b> {risk.strategyDetails[sf.key]}</div>)}</div>}
        <div style={{ marginTop: 8, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {state.planProgress !== null ? <><div className="im-bar" style={{ width: 160 }}><i style={{ width: `${state.planProgress}%` }} /></div><span className="im-helper">پیشرفت برنامه {state.planProgress}٪ · {state.openActions} باز · {state.overdueActions} معوق · {state.blockedActions} مسدود</span></> : <span className="rk-flag" style={{ ['--c' as string]: state.level === 'high' || state.level === 'critical' ? '#ef4444' : '#94a3b8' }}>برنامهٔ پاسخ تعریف نشده</span>}
        </div>
      </div>

      <div className="im-actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="im-section-title" style={{ margin: 0 }}>اقدام‌های کاهشی <span className="im-chip">{actions.length}</span></div>
        {canEdit && <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setForm({ id: null, f: emptyForm(risk.responseOwnerId ?? risk.ownerId) })}><Plus size={13} /> اقدام جدید</button>}
      </div>
      {err && <div className="im-notice bad" role="alert" style={{ marginBottom: 8 }}>{err}</div>}
      {form && (
        <div className="im-card-flat" style={{ marginBottom: 12 }}>
          <div className="im-section-title">{form.id ? 'ویرایش اقدام' : form.f.parent ? 'زیراقدام جدید' : 'اقدام جدید'}</div>
          <Field label="شرح اقدام *"><input value={form.f.description} onChange={(e) => setForm({ ...form, f: { ...form.f, description: e.target.value } })} autoFocus /></Field>
          <div className="rk-grid3">
            <Field label="نوع"><select value={form.f.actionType} onChange={(e) => setForm({ ...form, f: { ...form.f, actionType: e.target.value as RmActionType } })}>{Object.entries(RM_ACTION_TYPE_LABEL_FA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="مسئول"><PersonSelect value={form.f.ownerId} onChange={(v) => setForm({ ...form, f: { ...form.f, ownerId: v } })} people={people.map((p) => ({ userId: p.userId, name: p.name }))} /></Field>
            <Field label="مهلت"><OptDate value={form.f.dueDate} onChange={(v) => setForm({ ...form, f: { ...form.f, dueDate: v } })} /></Field>
          </div>
          <button type="button" className="im-ghostlink" onClick={() => setShowMore((v) => !v)}>{showMore ? <ChevronUp size={12} /> : <ChevronDown size={12} />} خروجی، اثر مورد انتظار، منابع، هزینه و منفعت</button>
          {showMore && (
            <div style={{ marginTop: 8 }}>
              <div className="rk-grid2">
                <Field label="خروجی مورد انتظار"><input value={form.f.expectedOutput} onChange={(e) => setForm({ ...form, f: { ...form.f, expectedOutput: e.target.value } })} /></Field>
                <Field label="اثر مورد انتظار بر ریسک"><input value={form.f.expectedEffect} onChange={(e) => setForm({ ...form, f: { ...form.f, expectedEffect: e.target.value } })} placeholder="مثلاً احتمال از ۴ به ۲" /></Field>
                <Field label="منابع مورد نیاز"><input value={form.f.resources} onChange={(e) => setForm({ ...form, f: { ...form.f, resources: e.target.value } })} /></Field>
                <Field label="معیار تکمیل"><input value={form.f.completionCriteria} onChange={(e) => setForm({ ...form, f: { ...form.f, completionCriteria: e.target.value } })} /></Field>
                <Field label="هزینهٔ برآوردی (ریال)"><input inputMode="numeric" dir="ltr" style={{ textAlign: 'right' }} value={form.f.cost ? nf(form.f.cost) : ''} onChange={(e) => setForm({ ...form, f: { ...form.f, cost: digitsOnly(e.target.value) || null } })} /></Field>
                <Field label="منفعت مورد انتظار (ریال)" hint="فقط با دادهٔ معتبر"><input inputMode="numeric" dir="ltr" style={{ textAlign: 'right' }} value={form.f.benefit ? nf(form.f.benefit) : ''} onChange={(e) => setForm({ ...form, f: { ...form.f, benefit: digitsOnly(e.target.value) || null } })} /></Field>
              </div>
              <Field label="زیراقدام برای"><select value={form.f.parent ?? ''} onChange={(e) => setForm({ ...form, f: { ...form.f, parent: e.target.value || null } })}><option value="">— اقدام اصلی —</option>{roots.filter((r) => r.id !== form.id).map((r) => <option key={r.id} value={r.id}>{r.description.slice(0, 50)}</option>)}</select></Field>
            </div>
          )}
          <div className="im-actions" style={{ marginTop: 8 }}><button className="im-btn im-btn-primary im-btn-sm" onClick={saveAction}>ذخیره</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => { setForm(null); setErr('') }}>بستن</button></div>
        </div>
      )}
      {roots.length === 0 ? <div className="im-empty">هنوز اقدامی تعریف نشده است. اقدام باید مسئول، مهلت و خروجی مشخص داشته باشد.</div> : roots.map((a) => renderAction(a))}

      <div className="rk-sect">
        <h3>برنامهٔ اقتضایی (اگر ریسک رخ داد)</h3>
        {contingency.map((c) => (
          <div key={c.id} className="im-task" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><b>اگر:</b> {c.triggerCondition}<br /><b>آنگاه:</b> {c.plan}<div className="im-helper">{c.ownerId ? dir.name(c.ownerId) : 'بدون مسئول'}{c.budget ? ` · بودجه ${nf(c.budget)} ریال` : ''}</div></div><span className="rk-flag">{RM_CONTINGENCY_STATUS_LABEL_FA[c.status]}</span></div>
            {canEdit && <div className="im-actions" style={{ marginTop: 6 }}>{c.status === 'draft' && <button className="im-ghostlink" onClick={() => updateContingency(c.id, { status: 'ready' })}>آماده است</button>}{c.status === 'ready' && <button className="im-ghostlink" onClick={() => { if (window.confirm('برنامهٔ اقتضایی فعال شود؟')) updateContingency(c.id, { status: 'activated' }) }}>فعال‌سازی</button>}{c.status !== 'retired' && <button className="im-ghostlink" onClick={() => updateContingency(c.id, { status: 'retired' })}>بازنشسته</button>}<button className="im-ghostlink" style={{ color: 'var(--im-coral)' }} onClick={() => deleteContingency(c.id)}><Trash2 size={11} /></button></div>}
          </div>
        ))}
        {canEdit && (cform ? (
          <div className="im-card-flat">
            <Field label="شرط فعال‌سازی *"><input value={cform.trigger} onChange={(e) => setCform({ ...cform, trigger: e.target.value })} placeholder="مثلاً: تأخیر تحویل لوله بیش از ۳۰ روز" /></Field>
            <Field label="اقدام اقتضایی *"><textarea style={{ minHeight: 50 }} value={cform.plan} onChange={(e) => setCform({ ...cform, plan: e.target.value })} /></Field>
            <div className="rk-grid2"><Field label="مسئول"><PersonSelect value={cform.ownerId} onChange={(v) => setCform({ ...cform, ownerId: v })} people={people.map((p) => ({ userId: p.userId, name: p.name }))} /></Field><Field label="بودجه (ریال)"><input inputMode="numeric" dir="ltr" style={{ textAlign: 'right' }} value={cform.budget ? nf(cform.budget) : ''} onChange={(e) => setCform({ ...cform, budget: digitsOnly(e.target.value) || null })} /></Field></div>
            <div className="im-actions"><button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { if (cform.trigger.trim().length < 3 || cform.plan.trim().length < 3) { setErr('شرط فعال‌سازی و اقدام اقتضایی را بنویسید'); return } const r = await addContingency(risk.id, { triggerCondition: cform.trigger.trim(), plan: cform.plan.trim(), ownerId: cform.ownerId, budget: cform.budget }); if (!r.ok) setErr(r.error ?? ''); else setCform(null) }}>ثبت</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setCform(null)}>بستن</button></div>
          </div>
        ) : <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setCform({ trigger: '', plan: '', ownerId: null, budget: null })}><Plus size={13} /> برنامهٔ اقتضایی جدید</button>)}
      </div>

      <div className="rk-sect">
        <h3>پذیرش رسمی ریسک باقیمانده</h3>
        <div className="im-helper" style={{ marginBottom: 8 }}>اگر ریسک باقیمانده خارج از «پذیرش» است ولی سازمان آگاهانه آن را می‌پذیرد، با دلیل ثبت و مرجع مجاز تأیید می‌کند. ناحیهٔ «ارجاع» فقط با مدیریت ارشد قابل پذیرش است.</div>
        {approvedAcc && <div className="im-notice ok" style={{ marginBottom: 8 }}>پذیرش تأییدشده در {formatJalali((approvedAcc.decidedAt ?? approvedAcc.requestedAt).slice(0, 10))} توسط {dir.name(approvedAcc.decidedBy)} — باقیمانده {approvedAcc.residualScore}{approvedAcc.validUntil ? ` · اعتبار تا ${formatJalali(approvedAcc.validUntil)}` : ''}<div className="im-helper">{approvedAcc.rationale}</div></div>}
        {acceptances.filter((a) => a !== approvedAcc).map((a) => (
          <div key={a.id} className="im-task" style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><div><b>باقیمانده {a.residualScore}</b> — {a.rationale}<div className="im-helper">{dir.name(a.requestedBy)} · {formatJalali(a.requestedAt.slice(0, 10))}{a.decisionNote ? ` · تصمیم: ${a.decisionNote}` : ''}</div></div><span className="rk-flag" style={{ ['--c' as string]: a.status === 'approved' ? '#22c55e' : a.status === 'requested' ? '#f59e0b' : '#94a3b8' }}>{RM_ACCEPT_STATUS_LABEL_FA[a.status]}</span></div>
            {a.status === 'requested' && (
              <div className="im-actions" style={{ marginTop: 6 }}>
                <button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { const r = await decideAcceptance(a.id, true, ''); setAccErr(r.ok ? '' : r.error ?? '') }}>تأیید پذیرش</button>
                <button className="im-btn im-btn-danger im-btn-sm" onClick={async () => { const n = window.prompt('دلیل رد:') ?? ''; const r = await decideAcceptance(a.id, false, n); setAccErr(r.ok ? '' : r.error ?? '') }}>رد</button>
              </div>
            )}
          </div>
        ))}
        {accErr && <div className="im-err">{accErr}</div>}
        {canEdit && !pendingAcc && state.residualZone !== 'acceptable' && (acc ? (
          <div className="im-card-flat">
            <Field label="دلیل پذیرش *" hint={`باقیمانده ${state.residual} (${state.residualZone === 'escalate' ? 'ناحیهٔ ارجاع — نیازمند مدیریت ارشد' : 'خارج از پذیرش'}؛ پذیرش ≤ ${policy.appetiteMax})`}><textarea style={{ minHeight: 56 }} value={acc.rationale} onChange={(e) => setAcc({ ...acc, rationale: e.target.value })} placeholder="چرا هزینهٔ کاهش بیشتر نمی‌ارزد و چه کنترلی ادامه دارد؟" /></Field>
            <Field label="اعتبار تا (اختیاری)"><OptDate value={acc.until} onChange={(v) => setAcc({ ...acc, until: v })} /></Field>
            <div className="im-actions"><button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { const r = await requestAcceptance(risk.id, acc.rationale.trim(), acc.until); if (!r.ok) setAccErr(r.error ?? ''); else { setAcc(null); setAccErr('') } }}>ارسال درخواست</button><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setAcc(null)}>انصراف</button></div>
          </div>
        ) : <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setAcc({ rationale: '', until: null })}>درخواست پذیرش رسمی</button>)}
        {canManage && <div className="im-actions" style={{ marginTop: 10 }}><span className="im-helper">راهبرد:</span><button className="im-ghostlink" onClick={() => updateRisk(risk.id, { responseStrategy: risk.responseStrategy === 'escalate' ? 'mitigate' : 'escalate' })}>{risk.responseStrategy === 'escalate' ? 'بازگشت به کاهش' : 'تغییر به «ارجاع»'}</button></div>}
      </div>
    </div>
  )
}
