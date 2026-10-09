import type { RiskState } from '../../lib/riskState'
import type { RmPolicy, RmRisk } from '../../types'

export interface TabProps {
  risk: RmRisk
  state: RiskState
  policy: RmPolicy
  canEdit: boolean
  canManage: boolean
}
