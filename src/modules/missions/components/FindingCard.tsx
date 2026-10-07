import { useState } from 'react'
import { AlertTriangle, Check, ExternalLink, Link2, Lock, Pencil, Trash2, X } from 'lucide-react'
import { FINDING_KIND_LABEL, type Finding, type LinkedStatus, type TransferTarget } from '../types'
import { shamsi } from '../lib/fa'
import { KindBadge, Pill, SeverityDot } from './ui'
import { TransferDialog } from './TransferDialog'

const LINKED_STATUS_LABEL: Record<string, string> = {
  open: 'باز',
  in_progress: 'در حال انجام',
  pending_approval: 'در انتظار تأیید',
  approved: 'بسته‌شده',
  rejected: 'ردشده',
  monitoring: 'تحت پایش',
  escalated: 'ارجاع‌شده',
  closed: 'بسته‌شده',
  not_started: 'شروع نشده',
  completed: 'تکمیل شد',
  cancelled: 'لغو شد',
}
const TARGET_LABEL: Record<TransferTarget, string> = { issue: 'مدیریت Issue', risk: 'مدیریت ریسک', action: 'مدیریت اقدامات' }
const TARGET_FOR_KIND: Partial<Record<Finding['kind'], TransferTarget>> = { issue: 'issue', risk: 'risk', action: 'action', commitment: 'action' }

export function defaultTarget(f: Finding): TransferTarget | null {
  return TARGET_FOR_KIND[f.kind] ?? null
}

function detailRows(f: Finding): [string, string][] {
  const d = f.details
  const rows: [string, string][] = []
  const push = (label: string, v?: string) => v && rows.push([label, v])
  if (f.kind === 'issue') {
    push('علت', d.cause)
    push('اثر', d.impact)
    push('وضعیت', d.status)
    push('طرف درگیر', f.ownerText || d.party)
    push('تاریخ رفع', d.newDate && /^\d{4}-/.test(d.newDate) ? shamsi(d.newDate) : d.newDate)
    push('اقدام لازم', d.needAction)
  } else if (f.kind === 'risk') {
    push('پیامد', d.impact)
    push('احتمال', d.probability)
    push('کنترل', d.mitigation)
    push('مسئول', f.ownerText)
  } else {
    push('مسئول', f.ownerText || d.owner)
    push('موعد', f.dueDate ? shamsi(f.dueDate) : undefined)
  }
  return rows
}

export function FindingCard({
  finding: f,
  linked,
  onEdit,
  onRemove,
  onDecide,
  onTransfer,
  onOpenLinked,
  missionLabel,
  missionCode,
  onOpenMission,
  transferring,
}: {
  finding: Finding
  linked?: LinkedStatus
  onEdit?: () => void
  onRemove?: () => void
  /** Manager review: approve or reject the proposal. */
  onDecide?: (approval: 'approved' | 'rejected' | 'proposed') => void
  onTransfer?: (target: TransferTarget, params: Record<string, unknown>) => void | Promise<unknown>
  /** Jump to the transferred record inside the module that owns it. */
  onOpenLinked?: () => void
  missionLabel?: string
  /** Shown in the transfer dialog; defaults to the code part of missionLabel. */
  missionCode?: string
  onOpenMission?: () => void
  transferring?: boolean
}) {
  const rows = detailRows(f)
  const target = defaultTarget(f)
  const [dialog, setDialog] = useState(false)
  const missing = [(f.kind === 'action' || f.kind === 'commitment') && !f.ownerText ? 'مسئول' : '', (f.kind === 'action' || f.kind === 'commitment') && !f.dueDate ? 'موعد' : ''].filter(Boolean)
  return (
    <article className={`ms-ledger-item is-plain ms-k-${f.kind}`} style={{ animation: 'none' }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <KindBadge kind={f.kind} />
        {(f.kind === 'issue' || f.kind === 'risk') && <SeverityDot severity={f.severity} withLabel />}
        {f.approval === 'approved' && !f.transferredId && <Pill tone="good">تأیید مجری طرح</Pill>}
        {f.approval === 'rejected' && <Pill tone="bad">ردشده</Pill>}
        {f.confidential && <Pill tone="warn"><Lock size={11} aria-hidden className="inline" /> محرمانه</Pill>}
        {f.userConfirmed && <span className="ms-muted text-[10.5px]">تأیید بازدیدکننده</span>}
      </div>
      <h3 className="mt-1.5 text-[13px] font-extrabold leading-7">{f.title}</h3>
      {missionLabel && (
        <button className="ms-muted text-[11px] underline-offset-2 hover:underline" onClick={onOpenMission}>
          {missionLabel}
        </button>
      )}
      {rows.length > 0 && (
        <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-[11.5px] leading-6 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <dt className="ms-muted shrink-0">{k}:</dt>
              <dd className="ms-ink2 min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {missing.length > 0 && <p className="mt-1 flex items-center gap-1 text-[11px] font-bold" style={{ color: 'var(--ms-warn)' }}><AlertTriangle size={12} aria-hidden /> {missing.join(' و ')} مشخص نشده است</p>}
      {f.managerNote && <p className="ms-ink2 mt-1 text-[11.5px] leading-6">یادداشت مجری طرح: {f.managerNote}</p>}

      {linked && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <Link2 size={13} style={{ color: 'var(--ms-good)' }} aria-hidden />
          <span className="ms-ink2">در {TARGET_LABEL[linked.target]} ثبت شد</span>
          <Pill tone="good">{linked.linkedCode}</Pill>
          <Pill>{LINKED_STATUS_LABEL[linked.linkedStatus] ?? linked.linkedStatus}</Pill>
          {onOpenLinked && (
            <button type="button" className="ms-btn ms-btn-sm mr-auto" onClick={onOpenLinked}>
              <ExternalLink size={13} aria-hidden /> مشاهده در {TARGET_LABEL[linked.target]}
            </button>
          )}
        </p>
      )}
      {f.transferredId && !linked && (
        <p className="ms-ink2 mt-2 flex items-center gap-1.5 text-[11.5px]">
          <ExternalLink size={13} aria-hidden /> به {TARGET_LABEL[f.transferredTo ?? 'issue']} منتقل شده است
          {onOpenLinked && (
            <button type="button" className="ms-btn ms-btn-sm mr-auto" onClick={onOpenLinked}>
              مشاهده
            </button>
          )}
        </p>
      )}

      {(onEdit || onRemove || onDecide || onTransfer) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {onDecide && !f.transferredId && (
            <>
              <button className={`ms-btn ms-btn-sm ${f.approval === 'approved' ? 'ms-btn-primary' : ''}`} onClick={() => onDecide(f.approval === 'approved' ? 'proposed' : 'approved')}>
                <Check size={13} aria-hidden /> {f.approval === 'approved' ? 'تأیید شد' : 'تأیید'}
              </button>
              <button className={`ms-btn ms-btn-sm ${f.approval === 'rejected' ? 'ms-btn-danger' : ''}`} onClick={() => onDecide(f.approval === 'rejected' ? 'proposed' : 'rejected')}>
                <X size={13} aria-hidden /> رد
              </button>
            </>
          )}
          {onTransfer && target && !f.transferredId && f.approval !== 'rejected' && (
            <button className="ms-btn ms-btn-sm ms-btn-primary" disabled={transferring} onClick={() => setDialog(true)}>
              <ExternalLink size={13} aria-hidden /> {transferring ? 'در حال انتقال…' : `تأیید و انتقال…`}
            </button>
          )}
          {onEdit && (
            <button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={onEdit}>
              <Pencil size={13} aria-hidden /> ویرایش
            </button>
          )}
          {onRemove && (
            <button className="ms-btn ms-btn-ghost ms-btn-sm" onClick={onRemove} aria-label={`حذف ${FINDING_KIND_LABEL[f.kind]}`}>
              <Trash2 size={13} aria-hidden /> حذف
            </button>
          )}
        </div>
      )}
      {dialog && target && onTransfer && (
        <TransferDialog
          finding={f}
          missionCode={missionCode ?? missionLabel?.split(' · ')[0]}
          defaultTarget={target}
          busy={transferring}
          onClose={() => setDialog(false)}
          onConfirm={async (t, params) => {
            await onTransfer(t, params)
            setDialog(false)
          }}
        />
      )}
    </article>
  )
}
