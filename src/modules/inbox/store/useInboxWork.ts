import { useMemo } from 'react'
import type { ModuleKey } from '../../../store/useModuleStore'
import { SOURCE_MODULE } from '../types'
import { selectVisible, useInboxStore } from './useInboxStore'

/** The person's waiting work, as module + project pairs — what the module badges count beside the bell's alerts. */
export function useInboxWork(): { module: ModuleKey; projectId: string | null }[] {
  const items = useInboxStore((s) => s.items)
  const snoozed = useInboxStore((s) => s.snoozed)
  return useMemo(() => selectVisible({ items, snoozed }).map((i) => ({ module: SOURCE_MODULE[i.source], projectId: i.projectId })), [items, snoozed])
}
