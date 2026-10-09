import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useChangeStore } from '../store/useChangeStore'
import { useChangeCtx } from '../lib/useChangeData'
import { canSubmit } from '../lib/changeFlow'
import { PHASE_FA, PRIORITY_FA, REASON_FA, REQUESTER_ORG_FA, TYPE_FA, TYPE_ORDER, type ChangeRequest, type ChangeType, type Priority } from '../types'
import { Field, MoneyInput } from './cm'
import { ResolutionPanel } from './RouteTrack'
import { HelpButton } from '../../issues/components/Help'
import { CM_HELP } from '../lib/help'

type F = Pick<ChangeRequest, 'masterProjectId' | 'contractId' | 'changeType' | 'title' | 'description' | 'reason' | 'proposedCost' | 'proposedDays' | 'priority' | 'requesterName' | 'requesterOrganization' | 'projectPhase' | 'orgUnit' | 'currentSituation' | 'reasonCategories' | 'affectedDocuments' | 'scopeEffect' | 'originalContractAmount' | 'originalDurationDays'>
const blank = (projectId: string): F => ({ masterProjectId: projectId, contractId: null, changeType: null, title: '', description: '', reason: '', proposedCost: 0, proposedDays: 0, priority: 'medium', requesterName: '', requesterOrganization: null, projectPhase: null, orgUnit: '', currentSituation: '', reasonCategories: [], affectedDocuments: [], scopeEffect: '', originalContractAmount: 0, originalDurationDays: 0 })

/** Short, three-step request form. The preview shows the base, the current and cumulative percentages and the route the rules will choose — before anything is sent. */
export function RequestFormModal({ request, defaultProjectId, defaultLinks, onClose, onSaved }: { request?: ChangeRequest; defaultProjectId?: string; defaultLinks?: { type: 'risk' | 'issue'; id: string; relation: 'caused_by' | 'raises' }[]; onClose: () => void; onSaved: (id: string) => void }) {
  const ctx = useChangeCtx()
  const createDraft = useChangeStore((s) => s.createDraft)
  const updateDraft = useChangeStore((s) => s.updateDraft)
  const rpc = useChangeStore((s) => s.rpc)
  const allowed = useMemo(() => { const a = ctx.projects.filter((p) => canSubmit(ctx.perms(p.id))); return a.length ? a : ctx.projects }, [ctx])
  const [f, setF] = useState<F>(() => (request ? { ...request } : blank(defaultProjectId && allowed.some((p) => p.id === defaultProjectId) ? defaultProjectId : allowed[0]?.id ?? '')))
  const [step, setStep] = useState(0)
  const [more, setMore] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState('')
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }))
  const contracts = ctx.contracts.filter((c) => c.masterProjectId === f.masterProjectId)
  const preview = useMemo(() => (f.masterProjectId ? ctx.preview({ id: request?.id, ...f }) : null), [ctx, f, request?.id])
  const thresholds = useMemo(() => [...new Set((ctx.activeRules?.rules ?? []).filter((r) => r.dimension === 'cost' && r.active).flatMap((r) => [r.pctMin, r.pctMax]).filter((x): x is number => x != null))].sort((a, b) => a - b), [ctx.activeRules])
  const needManual = preview?.basis.base_source === 'none' || preview?.basis.base_source === 'manual'

  const validate = (upTo: number): boolean => {
    const e: Record<string, string> = {}
    if (!f.masterProjectId) e.project = 'پروژه را انتخاب کنید.'
    if (!f.changeType) e.type = 'نوع تغییر را انتخاب کنید.'
    if (f.title.trim().length < 3) e.title = 'عنوان را وارد کنید.'
    if (f.description.trim().length < 3) e.description = 'شرح تغییر را وارد کنید.'
    if (f.reason.trim().length < 3) e.reason = 'دلیل تغییر را وارد کنید.'
    if (upTo >= 1 && f.changeType === 'time_extension' && f.proposedDays === 0) e.days = 'برای «تمدید مدت»، تعداد روز را وارد کنید.'
    if (upTo >= 1 && f.proposedCost === 0 && f.proposedDays === 0 && f.changeType !== 'new_work' && f.changeType !== 'technical') e.cost = 'اثر مالی یا زمانی را وارد کنید.'
    setErrors(e)
    return Object.keys(e).length === 0
  }
  const save = async (send: boolean) => {
    if (!validate(send ? 1 : 0)) { setStep(Object.keys(errors).length ? 0 : step); return }
    setBusy(true); setFail('')
    const payload: Partial<ChangeRequest> = { ...f, requesterName: f.requesterName.trim(), contractNumber: contracts.find((c) => c.id === f.contractId)?.number ?? '', contractorOrgId: contracts.find((c) => c.id === f.contractId)?.contractorOrgId ?? ctx.project(f.masterProjectId)?.contractorOrgId ?? null }
    const r = request ? await updateDraft(request.id, payload) : await createDraft(payload)
    if (!r.ok || !r.id) { setBusy(false); setFail(r.error ?? 'ذخیره نشد'); return }
    if (!request && defaultLinks) for (const l of defaultLinks) await rpc('cm_link', { p_request: r.id, p_type: l.type, p_target: l.id, p_relation: l.relation, p_source: 'manual' })
    if (send) { const s = await rpc('cm_submit', { p_request: r.id }, r.id); if (!s.ok) { setBusy(false); setFail(s.error ?? 'ارسال نشد؛ پیش‌نویس ذخیره شد.'); return } }
    setBusy(false); onSaved(r.id); onClose()
  }

  return (
    <div className="im-overlay">
      <div className="im-modal" style={{ maxWidth: 780 }} role="dialog" aria-modal="true" aria-label="درخواست تغییر">
        <div className="im-modal-head">
          <div className="im-modal-title">{request ? `ویرایش ${request.crNumber}` : 'درخواست تغییر جدید'}</div>
          <div className="im-actions"><HelpButton content={CM_HELP.form} /><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        </div>
        <div className="cm-steps" aria-hidden>{['۱ · چه تغییری؟', '۲ · آثار و مسیر تصویب', '۳ · اطلاعات تکمیلی'].map((t, i) => <span key={t} className={i === step ? 'on' : ''}>{t}</span>)}</div>

        {step === 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="im-row">
              <Field label="پروژه" error={errors.project} htmlFor="cm-prj"><select id="cm-prj" value={f.masterProjectId} onChange={(e) => setF((x) => ({ ...x, masterProjectId: e.target.value, contractId: null }))} disabled={!!request}>{allowed.map((p) => <option key={p.id} value={p.id}>{p.code ? p.code + ' · ' : ''}{p.name}</option>)}</select></Field>
              <Field label="قرارداد" hint={contracts.length ? 'درصدها نسبت به مبلغ اولیهٔ همین قرارداد سنجیده می‌شود' : 'برای این پروژه قرارداد ثبت نشده؛ مبلغ قرارداد پروژه مبنا است'} htmlFor="cm-ctr">
                <select id="cm-ctr" value={f.contractId ?? ''} onChange={(e) => set('contractId', e.target.value || null)}><option value="">{contracts.length ? '— قرارداد اصلی پروژه —' : '— بدون قرارداد جدا —'}</option>{contracts.map((c) => <option key={c.id} value={c.id}>{c.number || c.title}{c.title && c.number ? ' · ' + c.title : ''}</option>)}</select>
              </Field>
            </div>
            <Field label="نوع تغییر" error={errors.type}>
              <div className="cm-type-cards" role="radiogroup" aria-label="نوع تغییر">{TYPE_ORDER.map((t) => <button type="button" key={t} role="radio" aria-checked={f.changeType === t} className={f.changeType === t ? 'on' : ''} onClick={() => set('changeType', t as ChangeType)}>{TYPE_FA[t]}</button>)}</div>
            </Field>
            <Field label="عنوان" error={errors.title} htmlFor="cm-title"><input id="cm-title" value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={160} placeholder="مثلاً: افزایش مقدار خاک‌برداری کیلومتر ۱۲ تا ۱۸" /></Field>
            <Field label="شرح تغییر" error={errors.description} htmlFor="cm-desc"><textarea id="cm-desc" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
            <Field label="دلیل تغییر" error={errors.reason} htmlFor="cm-reason"><textarea id="cm-reason" rows={2} value={f.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="im-row">
              <Field label="اثر مالی (ریال) — افزایش مثبت، کاهش منفی" error={errors.cost} htmlFor="cm-cost"><MoneyInput id="cm-cost" value={f.proposedCost} onChange={(n) => set('proposedCost', n)} /></Field>
              <Field label="اثر زمانی (روز) — تمدید مثبت" error={errors.days} htmlFor="cm-days"><input id="cm-days" type="number" dir="ltr" value={f.proposedDays || ''} onChange={(e) => set('proposedDays', Number(e.target.value) || 0)} placeholder="0" /></Field>
              <Field label="اولویت" htmlFor="cm-pri"><select id="cm-pri" value={f.priority} onChange={(e) => set('priority', e.target.value as Priority)}>{(Object.keys(PRIORITY_FA) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_FA[p]}</option>)}</select></Field>
            </div>
            {needManual && (
              <div className="cm-warn"><div>مبلغ یا مدت اولیهٔ قرارداد در داده‌های پایه ثبت نشده است. بهتر است مدیر داده‌های پایه آن را ثبت کند؛ تا آن زمان می‌توانید مقدار دستی بدهید (در گزارش‌ها «دستی» علامت می‌خورد).
                <div className="im-row" style={{ marginTop: 6 }}><Field label="مبلغ اولیهٔ قرارداد (ریال)"><MoneyInput value={f.originalContractAmount} onChange={(n) => set('originalContractAmount', n)} /></Field><Field label="مدت اولیه (روز)"><input type="number" dir="ltr" value={f.originalDurationDays || ''} onChange={(e) => set('originalDurationDays', Number(e.target.value) || 0)} /></Field></div></div>
            </div>)}
            {preview && <ResolutionPanel res={preview} thresholds={thresholds} />}
            <div className="im-helper">این پیش‌نمایش با قواعد فعال محاسبه شده است؛ مسیر قطعی هنگام «تکمیل ارزیابی» توسط سرور تعیین و همراه نسخهٔ قواعد ثبت می‌شود.</div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'grid', gap: 10 }}>
            <button type="button" className="im-btn im-btn-ghost" onClick={() => setMore((m) => !m)} aria-expanded={more}>{more ? <ChevronUp size={14} /> : <ChevronDown size={14} />} اطلاعات تکمیلی (اختیاری)</button>
            {more && (
              <>
                <div className="im-row">
                  <Field label="درخواست‌کننده" htmlFor="cm-req"><input id="cm-req" value={f.requesterName} onChange={(e) => set('requesterName', e.target.value)} /></Field>
                  <Field label="سازمان درخواست‌کننده" htmlFor="cm-org"><select id="cm-org" value={f.requesterOrganization ?? ''} onChange={(e) => set('requesterOrganization', e.target.value || null)}><option value="">—</option>{Object.entries(REQUESTER_ORG_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                  <Field label="فاز پروژه" htmlFor="cm-phase"><select id="cm-phase" value={f.projectPhase ?? ''} onChange={(e) => set('projectPhase', e.target.value || null)}><option value="">—</option>{Object.entries(PHASE_FA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                  <Field label="واحد سازمانی" htmlFor="cm-unit"><input id="cm-unit" value={f.orgUnit} onChange={(e) => set('orgUnit', e.target.value)} /></Field>
                </div>
                <Field label="وضعیت فعلی" htmlFor="cm-cur"><textarea id="cm-cur" rows={2} value={f.currentSituation} onChange={(e) => set('currentSituation', e.target.value)} /></Field>
                <Field label="علل تغییر">
                  <div className="im-row" style={{ flexWrap: 'wrap', gap: 6 }}>{Object.entries(REASON_FA).map(([k, v]) => <label key={k} className="im-check"><input type="checkbox" checked={f.reasonCategories.includes(k)} onChange={(e) => set('reasonCategories', e.target.checked ? [...f.reasonCategories, k] : f.reasonCategories.filter((x) => x !== k))} /> {v}</label>)}</div>
                </Field>
                <Field label="اسناد متأثر">
                  <div style={{ display: 'grid', gap: 6 }}>
                    {f.affectedDocuments.map((d, i) => (
                      <div key={i} className="im-row"><input dir="ltr" placeholder="شمارهٔ سند" value={d.docNumber} onChange={(e) => set('affectedDocuments', f.affectedDocuments.map((x, j) => (j === i ? { ...x, docNumber: e.target.value } : x)))} /><input placeholder="عنوان" value={d.title} onChange={(e) => set('affectedDocuments', f.affectedDocuments.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} /><button type="button" className="im-btn im-btn-ghost" aria-label="حذف" onClick={() => set('affectedDocuments', f.affectedDocuments.filter((_, j) => j !== i))}><Trash2 size={14} /></button></div>
                    ))}
                    <button type="button" className="im-btn im-btn-ghost" onClick={() => set('affectedDocuments', [...f.affectedDocuments, { docNumber: '', title: '' }])}><Plus size={14} /> افزودن سند</button>
                  </div>
                </Field>
                <Field label="اثر بر دامنهٔ کار" htmlFor="cm-scope"><textarea id="cm-scope" rows={2} value={f.scopeEffect} onChange={(e) => set('scopeEffect', e.target.value)} /></Field>
              </>
            )}
            {!more && <div className="im-helper">اطلاعات تکمیلی برای ارسال لازم نیست و در مرحلهٔ ارزیابی هم قابل تکمیل است.</div>}
          </div>
        )}

        {fail && <div className="im-err" role="alert" style={{ marginTop: 8 }}>{fail}</div>}
        <div className="im-actions" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="im-btn im-btn-ghost" onClick={onClose}>بستن</button>
          <div className="im-actions">
            {step > 0 && <button className="im-btn im-btn-ghost" onClick={() => setStep(step - 1)}>قبلی</button>}
            {step < 2 && <button className="im-btn" onClick={() => { if (validate(step)) setStep(step + 1) }}>بعدی</button>}
            <button className="im-btn" disabled={busy} onClick={() => save(false)}>ذخیرهٔ پیش‌نویس</button>
            {step === 2 && <button className="im-btn im-btn-primary" disabled={busy} onClick={() => save(true)}>ثبت و ارسال</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
