import { useEffect } from 'react'
import { Inbox } from 'lucide-react'
import { ToolbarButton } from '../../../components/common/ToolbarButton'
import { TOOLBAR_ACCENTS } from '../../../components/common/ToolbarGuide'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { selectVisible, useInboxStore } from '../store/useInboxStore'

/** The header shortcut of the whole system: opens «کارتابل من» from any module, with the number of things waiting. */
export function InboxButton() {
  const refresh = useInboxStore((s) => s.refresh)
  const refreshNotes = useNotificationStore((s) => s.refresh)
  const setOpen = useInboxStore((s) => s.setOpen)
  const n = useInboxStore((s) => selectVisible(s).length)
  useEffect(() => {
    void refresh(); void refreshNotes()
    const t = setInterval(() => { if (document.visibilityState === 'visible') { void refresh(); void refreshNotes() } }, 2 * 60_000)
    return () => clearInterval(t)
  }, [refresh, refreshNotes])
  return (
    <ToolbarButton label={n ? `کارتابل من — ${n.toLocaleString('fa-IR')} مورد در انتظار` : 'کارتابل من'} caption="کارتابل" accent={TOOLBAR_ACCENTS.inbox} attention={n > 0} badge={n} onClick={() => setOpen(true)}>
      <Inbox size={16} />
    </ToolbarButton>
  )
}
