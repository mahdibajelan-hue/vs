import { useEffect } from 'react'
import { Inbox } from 'lucide-react'
import { ToolbarButton } from '../../../components/common/ToolbarButton'
import { TOOLBAR_ACCENTS } from '../../../components/common/ToolbarGuide'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { selectVisible, useInboxStore } from '../store/useInboxStore'

/**
 * One poll for the whole page, however many headers are mounted: every 5 minutes while the tab is visible, and on
 * coming back to the tab when the lists are older than a minute. (Each poll runs ~14 database functions per person,
 * so with a thousand people the cadence is what decides the database's load.)
 */
let pollers = 0, timer: ReturnType<typeof setInterval> | null = null
function startPolling(refresh: () => Promise<void>, refreshNotes: () => Promise<void>) {
  const onVisible = () => { if (document.visibilityState === 'visible') { void useInboxStore.getState().refreshIfStale(); void useNotificationStore.getState().refreshIfStale() } }
  if (pollers++ === 0) {
    timer = setInterval(() => { if (document.visibilityState === 'visible') { void refresh(); void refreshNotes() } }, 5 * 60_000)
    document.addEventListener('visibilitychange', onVisible)
  }
  return () => { if (--pollers === 0) { if (timer) clearInterval(timer); timer = null; document.removeEventListener('visibilitychange', onVisible) } }
}

/** The header shortcut of the whole system: opens «کارتابل من» from any module, with the number of things waiting. */
export function InboxButton() {
  const refresh = useInboxStore((s) => s.refresh)
  const refreshNotes = useNotificationStore((s) => s.refresh)
  const setOpen = useInboxStore((s) => s.setOpen)
  const n = useInboxStore((s) => selectVisible(s).length)
  useEffect(() => {
    // a header mounts with every module: read again only if the lists are older than a minute
    void useInboxStore.getState().refreshIfStale(); void useNotificationStore.getState().refreshIfStale()
    return startPolling(refresh, refreshNotes)
  }, [refresh, refreshNotes])
  return (
    <ToolbarButton label={n ? `کارتابل من — ${n.toLocaleString('fa-IR')} مورد در انتظار` : 'کارتابل من'} caption="کارتابل" accent={TOOLBAR_ACCENTS.inbox} attention={n > 0} badge={n} onClick={() => setOpen(true)}>
      <Inbox size={16} />
    </ToolbarButton>
  )
}
