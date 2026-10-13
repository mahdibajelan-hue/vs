import { useEffect } from 'react'
import { Inbox } from 'lucide-react'
import { ToolbarButton } from '../../../components/common/ToolbarButton'
import { selectVisible, useInboxStore } from '../store/useInboxStore'

/** The header shortcut of the whole system: opens «کارتابل من» from any module, with the number of things waiting. */
export function InboxButton() {
  const refresh = useInboxStore((s) => s.refresh)
  const setOpen = useInboxStore((s) => s.setOpen)
  const n = useInboxStore((s) => selectVisible(s).length)
  useEffect(() => {
    void refresh()
    const t = setInterval(() => document.visibilityState === 'visible' && void refresh(), 2 * 60_000)
    return () => clearInterval(t)
  }, [refresh])
  return (
    <ToolbarButton label={n ? `کارتابل من — ${n.toLocaleString('fa-IR')} مورد در انتظار` : 'کارتابل من'} badge={n} onClick={() => setOpen(true)}>
      <Inbox size={16} />
    </ToolbarButton>
  )
}
