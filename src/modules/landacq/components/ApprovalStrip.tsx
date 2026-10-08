import { useMemo, useState } from 'react'
import { Check, CornerUpLeft, Send, ShieldCheck, Stamp, UserCheck } from 'lucide-react'
import { Modal, useAuthStore } from '../platform'
import type { Parcel, ReviewAction } from '../types'
import { useLandStore } from '../store/useLandStore'
import { ACTION_LABEL, APPROVAL_LABEL, APPROVAL_STEPS, ROLE_LABEL, allowedActions } from '../lib/approval'
import { fmtDate } from '../lib/fa'
import { Field } from './ui'
import { HelpButton } from './Help'

const ORDER = ['draft', 'submitted', 'consultant_approved', 'legal_attested', 'approved'] as const
const ICON: Record<string, typeof Check> = { submit: Send, approve: UserCheck, attest: Stamp, final: ShieldCheck, return: CornerUpLeft, reopen: CornerUpLeft }

/** Where this parcel's data stands in the contractor -> consultant -> employer legal -> project manager chain, and what the signed-in user may do next. */
export function ApprovalStrip({ p }: { p: Parcel }) {
  const role = useLandStore((s) => s.data?.myRole ?? null)
  const allApprovals = useLandStore((s) => s.data?.approvals)
  const history = useMemo(() => (allApprovals ?? []).filter((a) => a.parcelId === p.id), [allApprovals, p.id])
  const review = useLandStore((s) => s.review)
  const isAdmin = !!useAuthStore((s) => s.profile?.isAdmin)
  const [ask, setAsk] = useState<ReviewAction | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const actions = allowedActions(p.approvalStatus, role, isAdmin)
  const at = ORDER.indexOf(p.approvalStatus)

  const run = async (a: ReviewAction, c = '') => {
    setBusy(true)
    await review(p.id, a, c)
    setBusy(false)
    setAsk(null)
    setComment('')
  }

  return (
    <section className="border-b px-5 py-4" style={{ borderColor: 'var(--la-line)', background: 'var(--la-surface-2)' }} aria-label="زنجیرهٔ تأیید">
      <p className="la-eyebrow m-0 mb-2 flex items-center gap-1.5">زنجیرهٔ تأیید اطلاعات <HelpButton topic="approval" /></p>
      <ol className="m-0 flex list-none items-start gap-1 p-0">
        {APPROVAL_STEPS.map((s, i) => {
          const done = at > i
          const now = at === i
          return (
            <li key={s.status} className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: done ? 'var(--la-ok)' : now ? 'var(--la-accent)' : 'var(--la-surface-3)', color: done || now ? '#fff' : 'var(--la-muted)', boxShadow: now ? '0 0 0 4px var(--la-accent-soft)' : undefined }}>
                {done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <span className="text-[11px] font-bold leading-4" style={{ color: now ? 'var(--la-ink)' : 'var(--la-ink-2)' }}>{s.label}</span>
              <span className="la-eyebrow leading-4" style={{ fontSize: 10 }}>{s.who}</span>
            </li>
          )
        })}
      </ol>
      <p className="m-0 mt-3 text-[12px] font-semibold" style={{ color: p.approvalStatus === 'approved' ? 'var(--la-ok)' : 'var(--la-ink)' }}>
        {APPROVAL_LABEL[p.approvalStatus]}
        {role && <span className="la-eyebrow font-normal"> · نقش شما: {ROLE_LABEL[role]}</span>}
      </p>
      {p.approvalStatus === 'draft' && p.approvalNote && (
        <p className="m-0 mt-2 rounded-lg px-3 py-2 text-[12px] leading-6" style={{ background: 'color-mix(in srgb, #f59e0b 12%, transparent)', border: '1px solid color-mix(in srgb, #f59e0b 40%, transparent)' }}>برگشت برای اصلاح: {p.approvalNote}</p>
      )}
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((a) => {
            const Icon = ICON[a]
            const needsComment = a === 'return' || a === 'reopen'
            return (
              <button key={a} disabled={busy} className={`la-btn la-btn-sm ${needsComment ? '' : 'la-btn-primary'}`} onClick={() => (needsComment ? setAsk(a) : run(a))}>
                <Icon size={13} /> {ACTION_LABEL[a]}
              </button>
            )
          })}
        </div>
      )}
      {history.length > 0 && (
        <details className="mt-3">
          <summary className="la-eyebrow cursor-pointer">سابقهٔ تأیید ({history.length.toLocaleString('fa-IR')})</summary>
          <ul className="m-0 mt-2 list-none p-0 text-[11.5px] leading-6">
            {history.slice(0, 12).map((h) => (
              <li key={h.id}><b>{ACTION_LABEL[h.action] ?? h.action}</b> · {fmtDate(h.at.slice(0, 10))}{h.comment ? ` · ${h.comment}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
      {ask && (
        <Modal title={ACTION_LABEL[ask]} subtitle={`قطعهٔ ${p.code}`} onClose={() => setAsk(null)} width="max-w-md" isDirty={!!comment}>
          <div className="la-root" dir="rtl">
            <Field label="توضیح (الزامی)" hint="دلیل برگشت یا بازگشایی برای پیمانکار نمایش داده می‌شود.">
              <textarea className="la-input la-textarea" autoFocus value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <button className="la-btn" onClick={() => setAsk(null)}>انصراف</button>
              <button className="la-btn la-btn-primary" disabled={!comment.trim() || busy} onClick={() => run(ask, comment.trim())}>{ACTION_LABEL[ask]}</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  )
}
