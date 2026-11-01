import { useMemo } from 'react'
import { useFinanceControlStore } from '../store/useFinanceControlStore'
import { effectiveThresholds } from './financeControl'
import { todayTehran } from '../../../lib/today'

/** Settings in force today (newest version whose valid-from has arrived). */
export function useThresholds() {
  const versions = useFinanceControlStore((s) => s.settingsVersions)
  return useMemo(() => effectiveThresholds(versions, todayTehran()), [versions])
}
