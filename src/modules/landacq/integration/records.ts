import { useDeepLinkStore, useModuleStore, useProjectContextStore } from '../platform'
import type { TransferTarget } from '../types'

const MODULE_FOR_TARGET = { risk: 'risk', issue: 'issues', schedule: 'lifecycle' } as const

/** Jump to the Risk / Issue record (or the Lifecycle schedule) a parcel was handed over to. */
export function openRecord(target: TransferTarget, recordId: string, masterProjectId: string): void {
  useProjectContextStore.getState().setProject(masterProjectId)
  if (target !== 'schedule') useDeepLinkStore.getState().request({ module: target === 'issue' ? 'issues' : 'risk', recordId, masterProjectId })
  useModuleStore.getState().enterModule(MODULE_FOR_TARGET[target])
}

export const TARGET_LABEL: Record<TransferTarget, string> = { risk: 'مدیریت ریسک', issue: 'مدیریت مسائل', schedule: 'برنامه زمان‌بندی (هشدار زودهنگام)' }
