import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Trash2 } from 'lucide-react'
import { MsModal } from './MsModal'
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
  const [menu, setMenu] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const allowed = useCanDeleteMissions()
  useEffect(() => {
    if (!menu) return
    const off = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', off)
    return () => {
      document.removeEventListener('pointerdown', off)
      document.removeEventListener('keydown', off)
    }
  }, [menu])
  if (!allowed) return null
  return (
    <>
      {compact ? (
        <div ref={box} className="relative">
          <button className="ms-btn ms-btn-ghost ms-btn-sm ms-btn-icon" aria-haspopup="menu" aria-expanded={menu} aria-label={`گزینه‌های مأموریت ${mission.code}`} onClick={() => setMenu((v) => !v)}>
            <MoreVertical size={15} aria-hidden />
          </button>
          {menu && (
            <div className="ms-menu" role="menu">
              <button role="menuitem" className="is-danger" onClick={() => { setMenu(false); setOpen(true) }}>
                <Trash2 size={14} aria-hidden /> حذف مأموریت
              </button>
            </div>
          )}
        </div>
      ) : (
        <button className="ms-btn ms-btn-ghost ms-btn-sm ms-btn-danger" aria-label={`حذف مأموریت ${mission.code}`} onClick={() => setOpen(true)}>
          <Trash2 size={14} aria-hidden /> حذف مأموریت
        </button>
      )}
      {open && (
        <MsModal title="حذف مأموریت" subtitle={`${mission.code} · ${mission.projectName}`} onClose={() => !busy && setOpen(false)} width="max-w-md">
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
        </MsModal>
      )}
    </>
  )
}
