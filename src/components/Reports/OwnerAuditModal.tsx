import { useState } from 'react'
import { Modal } from '../common/Modal'
import { useStore } from '../../store/useStore'
import type { DailyLog } from '../../types'

export function OwnerAuditModal({ projectId, log, onClose }: { projectId: string; log: DailyLog; onClose: () => void }) {
  const auditLogAsOwner = useStore((s) => s.auditLogAsOwner)
  const [lengthDone, setLengthDone] = useState(log.lengthDone)
  const [weldCount, setWeldCount] = useState(log.weldCount)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const changed = lengthDone !== log.lengthDone || weldCount !== log.weldCount

  const submit = async () => {
    setBusy(true)
    await auditLogAsOwner(projectId, log.id, { lengthDone, weldCount, note: note.trim() })
    setBusy(false)
    onClose()
  }

  return (
    <Modal title="ممیزی و تایید کارفرما" subtitle="در صورت نیاز مقادیر را اصلاح کنید، سپس تایید کنید" onClose={onClose}>
      <div className="space-y-3">
        <p className="rounded-lg bg-white/[0.03] p-2.5 text-[11px] text-muted leading-5">
          مقادیر تایید‌شده توسط مشاور: {log.consultantLengthDone ?? log.lengthDone}m متراژ، {log.consultantWeldCount ?? log.weldCount} سرجوش. اگر این مقادیر را
          درست می‌دانید همین‌طور «تایید بدون تغییر» را بزنید، در غیر این صورت اصلاح کنید.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">متراژ کارشده (متر)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={lengthDone}
              onChange={(e) => setLengthDone(parseFloat(e.target.value) || 0)}
              className="input num"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">تعداد سرجوش</span>
            <input
              type="number"
              min={0}
              value={weldCount}
              onChange={(e) => setWeldCount(parseInt(e.target.value, 10) || 0)}
              className="input num"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">یادداشت ممیزی (اختیاری)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input resize-none" placeholder="دلیل اصلاح یا نکته‌ای برای ثبت..." />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            {busy ? 'در حال ذخیره...' : changed ? 'اصلاح و تایید' : 'تایید بدون تغییر'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
