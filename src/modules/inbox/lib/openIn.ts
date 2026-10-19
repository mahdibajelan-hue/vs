import { useDeepLinkStore } from '../../../store/useDeepLinkStore'
import { useModuleStore } from '../../../store/useModuleStore'
import { useExecutionStore } from '../../execution/store/useExecutionStore'
import { SOURCE_MODULE, type InboxItem } from '../types'

const idOf = (v: unknown) => (typeof v === 'string' ? v : '')

/** Open the item in its own module (the long way round — for everything the inbox cannot do by itself). */
export function openInModule(item: InboxItem): void {
  const e = item.extra
  const link = useDeepLinkStore.getState().request
  if (item.source === 'execution') {
    if (item.kind === 'review') useExecutionStore.getState().setFocus(item.refId, 'review')
    else if (item.kind === 'fix') useExecutionStore.getState().setFocus(item.refId, 'daily')
    else if (item.kind === 'delay_assess' || item.kind === 'delay_notice') useExecutionStore.getState().setFocus(item.refId, 'delays')
  } else if (item.source === 'issues') {
    const id = item.kind === 'extension' || item.kind === 'verify' || item.kind === 'task' ? idOf(e.issueId) : ''
    if (id) link({ module: 'issues', recordId: id, masterProjectId: item.projectId ?? undefined })
  } else if (item.source === 'risk') {
    const id = idOf(e.riskId)
    if (id) link({ module: 'risk', recordId: id, masterProjectId: item.projectId ?? undefined })
  } else if (item.source === 'change') {
    const id = idOf(e.requestId)
    if (id) link({ module: 'change', recordId: id, masterProjectId: item.projectId ?? undefined })
  } else if (item.source === 'scheduling') {
    if (item.kind === 'sch_eot') window.sessionStorage.setItem('sch.openTab', 'delay')
    else window.sessionStorage.setItem('sch.openTab', 'versions')
    if (item.projectId) window.sessionStorage.setItem('sch.openProject', item.projectId)
  } else if (item.source === 'missions') link({ module: 'missions', recordId: item.refId })
  useModuleStore.getState().enterModule(SOURCE_MODULE[item.source])
}
