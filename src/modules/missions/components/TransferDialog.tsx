import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '../platform'
import type { Finding, TransferTarget } from '../types'
import { shamsi } from '../lib/fa'

const TARGETS: { id: TransferTarget; label: string; creates: string }[] = [
  { id: 'issue', label: 'مدیریت Issue', creates: 'یک Issue باز با پیگیر و مهلت' },
  { id: 'risk', label: 'مدیریت ریسک', creates: 'یک ریسک تهدید با احتمال و اثر اولیه' },
  { id: 'action', label: 'مدیریت اقدامات', creates: 'یک اقدام «شروع‌نشده» در مرکز تصمیم' },
]
const LEVELS = ['۱ — خیلی کم', '۲ — کم', '۳ — متوسط', '۴ — زیاد', '۵ — خیلی زیاد']

/** Same defaults as ms_transfer_finding uses when no value is passed. */
const defaultLevel = (sev: Finding['severity']) => (sev === 'critical' ? 5 : sev === 'high' ? 4 : sev === 'medium' ? 3 : 2)
const defaultProbability = (sev: Finding['severity']) => (sev === 'critical' || sev === 'high' ? 4 : sev === 'medium' ? 3 : 2)

/**
 * The manager's last look before a finding leaves this module: pick where it goes (the default follows the
 * finding's kind, but an «Issue» that reads like a risk can be sent as one), set the few values the owning
 * system needs, and add a note. Nothing is created until «تأیید و انتقال».
 */
export function TransferDialog({
  finding: f,
  missionCode,
  defaultTarget,
  busy,
  onConfirm,
  onClose,
}: {
  finding: Finding
  missionCode?: string
  defaultTarget: TransferTarget
  busy?: boolean
  onConfirm: (target: TransferTarget, params: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [target, setTarget] = useState<TransferTarget>(defaultTarget)
  const [deadlineDays, setDeadlineDays] = useState(7)
  const [probability, setProbability] = useState(defaultProbability(f.severity))
  const [impact, setImpact] = useState(defaultLevel(f.severity))
  const [note, setNote] = useState(f.managerNote)

  const submit = () => {
    const params: Record<string, unknown> = { note: note.trim() }
    if (target === 'issue') params.deadline_days = Math.max(1, Math.min(365, Math.round(deadlineDays) || 7))
    if (target === 'risk') Object.assign(params, { probability, impact })
    onConfirm(target, params)
  }
  const actionMissing = target === 'action' ? [!f.ownerText ? 'مسئول' : '', !f.dueDate ? 'موعد' : ''].filter(Boolean) : []

  return (
    <Modal title="تأیید و انتقال یافته" subtitle={f.title} onClose={onClose} width="max-w-lg">
      <div className="ms-root flex flex-col gap-4 text-[12.5px]" dir="rtl" style={{ background: 'transparent' }}>
        <fieldset>
          <legend className="ms-muted mb-1.5 text-[11.5px]">انتقال به</legend>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="مقصد انتقال">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={target === t.id}
                onClick={() => setTarget(t.id)}
                className="rounded-xl p-2.5 text-right transition-colors"
                style={{ border: `2px solid ${target === t.id ? 'var(--ms-accent)' : 'var(--ms-line)'}`, background: target === t.id ? 'color-mix(in srgb, var(--ms-accent) 14%, transparent)' : 'var(--ms-panel-2)' }}
              >
                <span className="block text-[12.5px] font-extrabold">{t.label}</span>
                <span className="ms-muted block text-[10.5px] leading-5">{t.creates}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {target === 'issue' && (
          <label className="block">
            <span className="ms-muted mb-1 block text-[11.5px]">مهلت رفع (روز از امروز)</span>
            <input type="number" min={1} max={365} value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value))} className="ms-input w-32" />
            <span className="ms-muted mt-1 block text-[11px]">پیگیر: {f.ownerText || 'تعیین‌نشده — در مدیریت Issue انتخاب می‌شود'}</span>
          </label>
        )}
        {target === 'risk' && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="ms-muted mb-1 block text-[11.5px]">احتمال وقوع</span>
              <select value={probability} onChange={(e) => setProbability(Number(e.target.value))} className="ms-input w-full">
                {LEVELS.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="ms-muted mb-1 block text-[11.5px]">اثر</span>
              <select value={impact} onChange={(e) => setImpact(Number(e.target.value))} className="ms-input w-full">
                {LEVELS.map((l, i) => <option key={l} value={i + 1}>{l}</option>)}
              </select>
            </label>
            <p className="ms-muted col-span-2 text-[11px]">مالک ریسک: {f.ownerText || 'تعیین‌نشده'} — دسته از موضوع بازدید تعیین می‌شود.</p>
          </div>
        )}
        {target === 'action' && (
          <p className="ms-ink2 text-[11.5px] leading-6">
            مسئول: {f.ownerText || '—'} · موعد: {f.dueDate ? shamsi(f.dueDate) : '—'}
            {actionMissing.length > 0 && <span className="block font-bold" style={{ color: 'var(--ms-warn)' }}>⚠ {actionMissing.join(' و ')} مشخص نشده است؛ بعداً در مدیریت اقدامات کامل کنید.</span>}
          </p>
        )}

        <label className="block">
          <span className="ms-muted mb-1 block text-[11.5px]">یادداشت مجری طرح (اختیاری)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="ms-input w-full" />
        </label>

        <p className="ms-muted rounded-lg p-2.5 text-[11px] leading-6" style={{ background: 'var(--ms-panel-2)' }}>
          رکورد جدید در {TARGETS.find((t) => t.id === target)?.label} ساخته می‌شود و با برچسب «از بازدید {missionCode ?? 'این مأموریت'}» علامت می‌خورد؛ از آن پس همان سامانه مالک آن است و وضعیتش روی این کارت زنده نشان داده می‌شود.
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className="ms-btn ms-btn-ghost" onClick={onClose} disabled={busy}>انصراف</button>
          <button type="button" className="ms-btn ms-btn-primary" onClick={submit} disabled={busy}>
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden />} تأیید و انتقال
          </button>
        </div>
      </div>
    </Modal>
  )
}
