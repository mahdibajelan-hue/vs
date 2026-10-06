import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '../platform'
import { useMissionStore } from '../store/useMissionStore'
import type { Mission } from '../types'

/** Only the «مجری طرح» role may delete missions — typically duplicate or mistaken requests. */
export function useCanDeleteMissions(): boolean {
  const user = useMissionStore((s) => s.user)
  return !!(user?.isExecutive ?? user?.isManager)
}

export function DeleteMissionButton({ mission, onDeleted, compact }: { mission: Pick<Mission, 'id' | 'code' | 'projectName' | 'requesterName'>; onDeleted?: () => void; compact?: boolean }) {
  const deleteMission = useMissionStore((s) => s.deleteMission)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const allowed = useCanDeleteMissions()
  if (!allowed) return null
  return (
    <>
      <button className={`ms-btn ms-btn-ghost ms-btn-sm ${compact ? '' : 'ms-btn-danger'}`} title="حذف مأموریت" aria-label={`حذف مأموریت ${mission.code}`} onClick={() => setOpen(true)}>
        <Trash2 size={14} aria-hidden /> {compact ? null : 'حذف مأموریت'}
      </button>
      {open && (
        <Modal title="حذف مأموریت" subtitle={`${mission.code} · ${mission.projectName}`} onClose={() => !busy && setOpen(false)} width="max-w-md">
          <div className="ms-root flex flex-col gap-3" dir="rtl" style={{ background: 'transparent' }}>
            <p className="text-[12.5px] leading-7">
              مأموریت <b>{mission.code}</b> ({mission.requesterName}) همراه با اهداف، یافته‌ها، گزارش، مستندات و تاریخچه‌اش برای همیشه حذف می‌شود و قابل بازگشت نیست. اگر فقط درخواست تکراری است، همین کار را بکنید.
            </p>
            <div className="flex justify-end gap-2">
              <button className="ms-btn" disabled={busy} onClick={() => setOpen(false)}>انصراف</button>
              <button
                className="ms-btn ms-btn-danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  await deleteMission(mission.id)
                  setBusy(false)
                  setOpen(false)
                  onDeleted?.()
                }}
              >
                <Trash2 size={14} aria-hidden /> بله، حذف شود
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
