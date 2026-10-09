import { useState, type ReactNode } from 'react'
import { JalaliDateField } from '../../../issues/components/JalaliDateField'
import { useChangeStore } from '../../store/useChangeStore'
import { useChangeCtx } from '../../lib/useChangeData'
import type { ChangeRequest, ChangeStep } from '../../types'
import { Field, MoneyInput, nf, todayIso } from '../cm'

export function Dialog({ title, children, confirm, danger, onConfirm, onClose, wide }: { title: string; children: ReactNode; confirm: string; danger?: boolean; onConfirm: () => Promise<string | null>; onClose: () => void; wide?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => { setBusy(true); setErr(''); const e = await onConfirm(); setBusy(false); if (e) setErr(e); else onClose() }
  return (
    <div className="im-overlay" style={{ zIndex: 80 }}>
      <div className="im-modal" style={{ maxWidth: wide ? 640 : 480 }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="im-modal-head"><div className="im-modal-title">{title}</div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        <div style={{ display: 'grid', gap: 10 }}>{children}</div>
        {err && <div className="im-err" role="alert" style={{ marginTop: 8 }}>{err}</div>}
        <div className="im-actions" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="im-btn im-btn-ghost" onClick={onClose}>بستن</button>
          <button className={`im-btn ${danger ? 'im-btn-danger' : 'im-btn-primary'}`} disabled={busy} onClick={go}>{confirm}</button>
        </div>
      </div>
    </div>
  )
}

export function DecideDialog({ step, request, isLast, onClose, onDone }: { step: ChangeStep; request: ChangeRequest; isLast: boolean; onClose: () => void; onDone: () => void }) {
  const rpc = useChangeStore((s) => s.rpc)
  const [decision, setDecision] = useState<'approve' | 'return' | 'reject'>('approve')
  const [opinion, setOpinion] = useState('')
  const [ref, setRef] = useState('')
  const [refDate, setRefDate] = useState(todayIso())
  const [amount, setAmount] = useState(request.proposedCost)
  const [days, setDays] = useState(request.proposedDays)
  const lastApproval = isLast && step.kind !== 'opinion'
  return (
    <Dialog title={`تصمیم: ${step.label || step.roleName}`} confirm={decision === 'approve' ? (step.kind === 'opinion' ? 'ثبت نظر موافق' : 'تأیید') : decision === 'return' ? 'عودت به ثبت‌کننده' : 'رد درخواست'} danger={decision !== 'approve'} onClose={onClose}
      onConfirm={async () => {
        const r = await rpc('cm_decide_step', { p_step: step.id, p_decision: decision, p_opinion: opinion, p_ref_no: ref, p_ref_date: step.requiresReference && decision === 'approve' ? refDate : null, p_amount: decision === 'approve' && lastApproval && amount !== request.proposedCost ? amount : null, p_days: decision === 'approve' && lastApproval && days !== request.proposedDays ? days : null }, request.id)
        if (!r.ok) return r.error ?? 'ثبت نشد'
        onDone(); return null
      }}>
      <div className="im-seg" role="radiogroup" aria-label="تصمیم">
        <button type="button" className={decision === 'approve' ? 'on' : ''} onClick={() => setDecision('approve')}>{step.kind === 'opinion' ? 'نظر موافق' : 'تأیید'}</button>
        <button type="button" className={decision === 'return' ? 'on' : ''} onClick={() => setDecision('return')}>عودت برای اصلاح</button>
        {step.kind !== 'opinion' && <button type="button" className={decision === 'reject' ? 'on' : ''} onClick={() => setDecision('reject')}>رد</button>}
      </div>
      <Field label={decision === 'approve' ? 'نظر / توضیح (اختیاری)' : 'دلیل (الزامی)'} htmlFor="cm-op"><textarea id="cm-op" rows={3} value={opinion} onChange={(e) => setOpinion(e.target.value)} /></Field>
      {decision === 'approve' && step.requiresReference && <div className="im-row"><Field label="شمارهٔ مصوبه (الزامی)" htmlFor="cm-ref"><input id="cm-ref" dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} /></Field><Field label="تاریخ مصوبه"><JalaliDateField value={refDate} onChange={setRefDate} /></Field></div>}
      {decision === 'approve' && lastApproval && (
        <div className="cm-note"><div>این آخرین تأیید است؛ مبلغ و مدت مصوب را در صورت نیاز کمتر از درخواست تعیین کنید (بیشتر مجاز نیست).
          <div className="im-row" style={{ marginTop: 6 }}><Field label={`مبلغ مصوب (درخواست: ${nf(request.proposedCost)})`}><MoneyInput value={amount} onChange={setAmount} /></Field><Field label={`مدت مصوب (درخواست: ${request.proposedDays})`}><input type="number" dir="ltr" value={days || ''} onChange={(e) => setDays(Number(e.target.value) || 0)} /></Field></div></div></div>
      )}
    </Dialog>
  )
}

export function ImplementDialog({ request, onClose }: { request: ChangeRequest; onClose: () => void }) {
  const rpc = useChangeStore((s) => s.rpc)
  const ctx = useChangeCtx()
  const [owner, setOwner] = useState(request.implementationOwnerId ?? '')
  const [due, setDue] = useState('')
  const [note, setNote] = useState('')
  return (
    <Dialog title="ابلاغ تغییر مصوب و شروع اجرا" confirm="شروع اجرا" onClose={onClose} onConfirm={async () => { const r = await rpc('cm_start_implementation', { p_request: request.id, p_owner: owner || null, p_due: due || null, p_note: note }, request.id); return r.ok ? null : r.error ?? 'ثبت نشد' }}>
      <Field label="مسئول اجرا" htmlFor="cm-own"><select id="cm-own" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">— انتخاب کنید —</option>{ctx.people.map((p) => <option key={p.userId} value={p.userId}>{p.name}{p.position ? ' · ' + p.position : ''}</option>)}</select></Field>
      <Field label="مهلت اجرا"><JalaliDateField value={due} onChange={setDue} /></Field>
      <Field label="توضیح (اختیاری)"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
  )
}

export function ResultDialog({ request, onClose }: { request: ChangeRequest; onClose: () => void }) {
  const rpc = useChangeStore((s) => s.rpc)
  const [cost, setCost] = useState(request.approvedCost ?? request.proposedCost)
  const [days, setDays] = useState(request.approvedDays ?? request.proposedDays)
  const [as, setAs] = useState(true)
  const [docs, setDocs] = useState(false)
  const [note, setNote] = useState('')
  const over = Math.abs(cost) > Math.abs(request.approvedCost ?? request.proposedCost) || Math.abs(days) > Math.abs(request.approvedDays ?? request.proposedDays)
  return (
    <Dialog title="ثبت نتیجهٔ اجرا" confirm="ثبت نتیجه" onClose={onClose} onConfirm={async () => { const r = await rpc('cm_record_result', { p_request: request.id, p_actual_cost: cost, p_actual_days: days, p_as_approved: as, p_note: note, p_docs_updated: docs }, request.id); return r.ok ? null : r.error ?? 'ثبت نشد' }}>
      <div className="im-row"><Field label={`هزینهٔ واقعی (مصوب: ${nf(request.approvedCost ?? request.proposedCost)})`}><MoneyInput value={cost} onChange={setCost} /></Field><Field label={`تأخیر/تمدید واقعی (مصوب: ${request.approvedDays ?? request.proposedDays})`}><input type="number" dir="ltr" value={days || ''} onChange={(e) => setDays(Number(e.target.value) || 0)} /></Field></div>
      {over && <div className="cm-warn">مقدار واقعی از مصوب بیشتر است؛ این درخواست «مغایر با مصوبه» ثبت می‌شود و توضیح الزامی است.</div>}
      <label className="im-check"><input type="checkbox" checked={as && !over} disabled={over} onChange={(e) => setAs(e.target.checked)} /> مطابق مصوبه اجرا شد</label>
      <label className="im-check"><input type="checkbox" checked={docs} onChange={(e) => setDocs(e.target.checked)} /> مدارک و نقشه‌های مرتبط به‌روزرسانی شد</label>
      <Field label="توضیح نتیجه" htmlFor="cm-res"><textarea id="cm-res" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
  )
}

export function ReasonDialog({ title, label, confirm, rpcName, args, refresh, danger, onClose }: { title: string; label: string; confirm: string; rpcName: string; args: (text: string) => Record<string, unknown>; refresh: string; danger?: boolean; onClose: () => void }) {
  const rpc = useChangeStore((s) => s.rpc)
  const [text, setText] = useState('')
  return (
    <Dialog title={title} confirm={confirm} danger={danger} onClose={onClose} onConfirm={async () => { const r = await rpc(rpcName, args(text), refresh); return r.ok ? null : r.error ?? 'ثبت نشد' }}>
      <Field label={label} htmlFor="cm-reason-d"><textarea id="cm-reason-d" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
    </Dialog>
  )
}

export function ExceptionDialog({ request, onClose, onDone }: { request: ChangeRequest; onClose: () => void; onDone: () => void }) {
  const rpc = useChangeStore((s) => s.rpc)
  const [just, setJust] = useState('')
  const [ev, setEv] = useState('')
  return (
    <Dialog title="درخواست مجوز استثنا برای اجرای زودتر" confirm="ثبت درخواست استثنا" onClose={onClose} onConfirm={async () => { const r = await rpc('cm_request_exception', { p_request: request.id, p_justification: just, p_evidence: ev }, request.id); if (!r.ok) return r.error ?? 'ثبت نشد'; onDone(); return null }}>
      <div className="cm-note"><div>اجرای تغییری که هنوز تصویب نشده فقط در شرایط اضطراری و با مجوز جداگانهٔ مدیرعامل یا مجری طرح ممکن است. تصویب نهایی طبق مسیر همچنان لازم است و اجرا با علامت «تحت استثنا» ثبت می‌شود.</div></div>
      <Field label="توجیه ضرورت اضطراری (دست‌کم ۱۰ نویسه)" htmlFor="cm-ex1"><textarea id="cm-ex1" rows={3} value={just} onChange={(e) => setJust(e.target.value)} /></Field>
      <Field label="مستند / ارجاع (شمارهٔ نامه، گزارش HSE و …)" htmlFor="cm-ex2"><input id="cm-ex2" value={ev} onChange={(e) => setEv(e.target.value)} /></Field>
    </Dialog>
  )
}

export function ExceptionDecisionDialog({ id, requestId, onClose, onDone }: { id: string; requestId: string; onClose: () => void; onDone: () => void }) {
  const rpc = useChangeStore((s) => s.rpc)
  const [ok, setOk] = useState(true)
  const [note, setNote] = useState('')
  return (
    <Dialog title="تصمیم دربارهٔ مجوز استثنا" confirm={ok ? 'صدور مجوز' : 'رد درخواست استثنا'} danger={!ok} onClose={onClose} onConfirm={async () => { const r = await rpc('cm_decide_exception', { p_id: id, p_authorise: ok, p_note: note }, requestId); if (!r.ok) return r.error ?? 'ثبت نشد'; onDone(); return null }}>
      <div className="im-seg"><button type="button" className={ok ? 'on' : ''} onClick={() => setOk(true)}>صدور مجوز</button><button type="button" className={!ok ? 'on' : ''} onClick={() => setOk(false)}>رد</button></div>
      <Field label={ok ? 'یادداشت (اختیاری)' : 'دلیل رد (الزامی)'}><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Dialog>
  )
}
