import { useModuleStore } from '../../../store/useModuleStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'

/** a welder another module asked the quality-control module to show (the competency module's «performance» link) */
let pending: string | null = null
/** read without clearing (the initializer may run twice in development); clearFocusWelder once it is shown */
export const peekFocusWelder = () => pending
export const clearFocusWelder = () => { pending = null }
/** open a welder's performance card in the quality-control module, on the welder's project */
export function openPerformance(projectId: string, welderKey: string, coater = false) {
  pending = coater ? null : welderKey
  useProjectContextStore.getState().setProject(projectId)
  useModuleStore.getState().enterModule('weldqc', undefined, coater ? 'coating' : 'welders')
}
