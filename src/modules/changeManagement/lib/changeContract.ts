import { supabase } from '../../../lib/supabaseClient'
import { finContractAmendmentFromRow, finContractFromRow } from '../../finance/lib/financeData'
import { currentContractValue } from '../../finance/lib/financeCalc'
import type { FinContract } from '../../finance/types'

/** The contract percentages in this module are measured against — the main EPC contract if one
 * is recorded for this project, else the largest by value. Returns null when no contract has
 * been entered yet (change requests can still be submitted; percent/tier just can't be computed). */
export async function fetchCurrentContractValue(masterProjectId: string): Promise<number | null> {
  const { data: contractRows } = await supabase
    .from('fin_contracts').select('*').eq('master_project_id', masterProjectId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts = ((contractRows ?? []) as any[]).map(finContractFromRow) as FinContract[]
  if (contracts.length === 0) return null
  const contract = contracts.find((c) => c.contractRole === 'main_epc')
    ?? [...contracts].sort((a, b) => b.contractValue - a.contractValue)[0]

  const { data: amendRows } = await supabase.from('fin_contract_amendments').select('*').eq('contract_id', contract.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const amendments = ((amendRows ?? []) as any[]).map(finContractAmendmentFromRow)
  return currentContractValue(contract, amendments)
}
