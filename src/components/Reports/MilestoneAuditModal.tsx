import { useState } from 'react'
import { Modal } from '../common/Modal'
import { useStore } from '../../store/useStore'
import type { Milestone } from '../../types'

export function MilestoneAuditModal({ projectId, milestone, onClose }: { projectId: string; milestone: Milestone; onClose: () => void }) {
  const auditMilestoneAsOwner = useStore((s) => s.auditMilestoneAsOwner)
  const [percentComplete, setPercentComplete] = useState(milestone.percentComplete)
  const [busy, setBusy] = useState(false)

  const changed = percentComplete !== milestone.percentComplete

  const submit = async () => {
    setBusy(true)
    await auditMilestoneAsOwner(projectId, milestone.id, percentComplete)
    setBusy(false)
    onClose()
  }

  return (
    <Modal title="ممیزی و تایید کارفرما" subtitle={milestone.label} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-secondary">
            <span>درصد پیشرفت</span>
            <span className="num font-bold" style={{ color: milestone.color }}>
              {percentComplete}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={percentComplete}
            onChange={(e) => setPercentComplete(parseInt(e.target.value, 10))}
            className="w-full accent-brand-500"
          />
        </div>
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
