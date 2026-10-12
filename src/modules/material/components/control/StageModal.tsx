import { useState } from 'react'
import { JalaliDateInput } from '../../../../components/common/JalaliDateInput'
import { AttachmentField } from '../../../finance/components/AttachmentField'
import { Chip, fmtD, parseNum, faDigits } from '../../../finance/components/fn'
import { useMaterialControlStore } from '../../store/useMaterialControlStore'
import { STAGE_STATUS_LABEL_FA, type ItemStage, type Material, type PackageItem, type StageDef } from '../../types'
import { fa } from './common'
import { useMaterialModel } from '../../lib/control/useMaterialModel'
import { stageBackingLimit } from '../../lib/control/progress'
import { ModalPortal } from '../../../../components/common/ModalPortal'

const TONE = { pending: 'neutral', submitted: 'warn', reviewed: 'warn', approved: 'good', rejected: 'bad' } as const

/** One stage of one item: plan it, mark it not applicable (with a reason), submit evidence, then review / approve or reject. What a person can do here follows their role in the project. */
export function StageModal({ projectId, stage, def, item, material, onClose }: { projectId: string; stage: ItemStage; def: StageDef; item: PackageItem; material?: Material; onClose: () => void }) {
  const cs = useMaterialControlStore()
  const model = useMaterialModel(projectId)
  const people = cs.people
  const [planned, setPlanned] = useState(stage.plannedDate ?? '')
  const [resp, setResp] = useState(stage.responsible ?? '')
  const [actual, setActual] = useState(stage.actualDate ?? new Date().toISOString().slice(0, 10))
  const [qty, setQty] = useState<number>(stage.doneQty ?? item.qty)
  const [evidence, setEvidence] = useState(stage.evidenceUrl)
  const [note, setNote] = useState(stage.evidenceNote)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const canPlan = cs.can(projectId, 'edit_packages')
  const canSubmit = cs.can(projectId, 'submit_stage')
  const canDecide = cs.can(projectId, 'review_stage') || cs.can(projectId, 'approve_stage')
  const awaiting = stage.status === 'submitted' || stage.status === 'reviewed'
  const canSend = stage.applicable && (stage.status === 'pending' || stage.status === 'rejected' || (stage.status === 'approved' && stage.approvedQty < item.qty))
  const run = async (f: () => Promise<boolean>) => { setBusy(true); const ok = await f(); setBusy(false); if (ok) onClose() }
  const limit = stageBackingLimit(stage.stageKey, model.positions.get(item.materialId))
  const needsReceipt = stage.stageKey === 'site_receipt' || stage.stageKey === 'entry_inspection'
  const unbacked = limit != null && (qty > limit + 1e-9 || limit <= 0)
  const who = (id: string | null) => (id ? people.get(id) ?? 'کاربر' : '—')
  return (
    <ModalPortal>
    <div className="im-overlay">
      <div className="im-modal fn-form" style={{ maxWidth: 640 }} role="dialog" aria-modal="true" aria-label={def.title}>
        <div className="im-modal-head"><div><div className="im-modal-title">{def.title}</div><p className="im-helper" style={{ margin: 0 }}>{material?.description} · وزن این مرحله {fa(stage.weight, 1)}٪ · تأیید: {def.reviewLevel === 'employer' ? 'کارفرما' : def.reviewLevel === 'both' ? 'مشاور سپس کارفرما' : 'مشاور'}</p></div><button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <Chip tone={stage.applicable ? TONE[stage.status] : 'neutral'}>{stage.applicable ? STAGE_STATUS_LABEL_FA[stage.status] : 'غیرقابل‌اعمال'}</Chip>
          {stage.plannedDate && <Chip>برنامه {fmtD(stage.plannedDate)}</Chip>}
          {stage.approvedAt && <Chip tone="good">تأیید {fmtD(stage.approvedAt)} · {who(stage.approvedBy)}</Chip>}
          {stage.status === 'approved' && stage.approvedQty < item.qty && <Chip tone="warn">تأییدشده: {fa(stage.approvedQty, 2)} از {fa(item.qty, 2)}</Chip>}
        </div>
        {stage.status === 'rejected' && <div className="im-card" style={{ padding: '8px 12px', marginBottom: 10, borderColor: 'var(--im-coral)' }}>رد شد: {stage.rejectReason}</div>}
        {(stage.evidenceUrl || stage.evidenceNote) && awaiting && <div className="im-card" style={{ padding: '8px 12px', marginBottom: 10 }}><b>مدرک ارسال‌شده:</b> {stage.evidenceNote || 'پیوست'} {stage.submittedBy && <small>· {who(stage.submittedBy)}</small>}</div>}

        {canPlan && stage.status === 'pending' && (
          <div className="fn-form-grid" style={{ marginBottom: 10 }}>
            <div className="im-field"><label>تاریخ برنامه‌ای</label><JalaliDateInput value={planned} onChange={setPlanned} /></div>
            <div className="im-field"><label>مسئول</label><select value={resp} onChange={(e) => setResp(e.target.value)}><option value="">—</option>{[...people].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="im-btn im-btn-sm" disabled={busy} onClick={() => void run(() => cs.planStage(stage.id, { plannedDate: planned || null, responsible: resp || null }))}>ذخیرهٔ برنامه</button>
              {stage.applicable ? <><input placeholder="علت غیرقابل‌اعمال‌بودن" value={reason} onChange={(e) => setReason(e.target.value)} style={{ maxWidth: 260 }} /><button className="im-btn im-btn-sm" disabled={busy || !reason.trim()} onClick={() => void run(() => cs.setApplicable(stage.id, false, reason))}>غیرقابل‌اعمال برای این قلم</button></>
                : <button className="im-btn im-btn-sm" disabled={busy} onClick={() => void run(() => cs.setApplicable(stage.id, true, ''))}>قابل‌اعمال کردن ({stage.naReason})</button>}
            </div>
          </div>
        )}

        {limit != null && (stage.status !== 'approved' || stage.approvedQty < item.qty) && (
          <div className={`mt-allow ${unbacked ? 'locked' : ''}`} style={{ marginBottom: 10 }}>
            {`${needsReceipt ? 'رسید انبار ثبت‌شده' : 'سفارش خرید ثبت‌شده'}: ${fa(limit, 2)} ${material?.unit ?? ''} از ${fa(item.qty, 2)} ${material?.unit ?? ''}.`}{unbacked ? (needsReceipt ? ' بدون رسید انبار، این مرحله پیشرفت نمی‌گیرد؛ ابتدا رسید را در «موجودی و انبار ← رسید و بازرسی ورودی» ثبت کنید.' : ' بدون سفارش خرید، این مرحله پیشرفت نمی‌گیرد؛ ابتدا سفارش را در «بسته‌های خرید ← درخواست خرید و سفارش» ثبت کنید.') : ''}
          </div>
        )}

        {canSubmit && canSend && (
          <div className="fn-form-grid" style={{ marginBottom: 10 }}>
            <div className="im-field"><label>تاریخ انجام</label><JalaliDateInput value={actual} onChange={setActual} /></div>
            <div className="im-field"><label>مقدار انجام‌شده ({material?.unit}){item.qty > 0 && ' — برای تحویل جزئی کمتر از کل'}</label><input dir="ltr" style={{ textAlign: 'right' }} defaultValue={faDigits(String(qty))} onBlur={(e) => setQty(parseNum(e.target.value))} /></div>
            <div className="im-field" style={{ gridColumn: '1 / -1' }}><label>مدرک اثبات انجام کار *</label><AttachmentField folder="material-stages" value={evidence} onChange={setEvidence} /></div>
            <div className="im-field" style={{ gridColumn: '1 / -1' }}><label>توضیح / شمارهٔ سند</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1' }}><button className="im-btn im-btn-primary" disabled={busy || unbacked || (!evidence && !note.trim())} onClick={() => void run(() => cs.stageSubmit(stage.id, { actual, doneQty: qty >= item.qty ? null : qty, evidence, note }))}>ارسال برای تأیید</button></div>
          </div>
        )}

        {canDecide && awaiting && (
          <div className="fn-form-grid">
            <div className="im-field" style={{ gridColumn: '1 / -1' }}><label>توضیح (برای رد لازم است)</label><input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
              <button className="im-btn im-btn-primary" disabled={busy} onClick={() => void run(() => cs.stageDecide(stage.id, 'approve', reason))}>{stage.status === 'submitted' && def.reviewLevel === 'both' ? 'تأیید بررسی' : 'تأیید مرحله'}</button>
              <button className="im-btn" disabled={busy || !reason.trim()} onClick={() => void run(() => cs.stageDecide(stage.id, 'reject', reason))}>رد و بازگشت برای اصلاح</button>
            </div>
          </div>
        )}
        {!canPlan && !canSubmit && !canDecide && <p className="im-helper">نقش شما در این پروژه فقط مشاهده است.</p>}
      </div>
    </div>
    </ModalPortal>
  )
}
