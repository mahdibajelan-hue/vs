import { supabase } from './supabaseClient'
import { browserAnswers } from './answerStore'
import { covers, insideProject } from './projectScope'
import { useExecutionStore } from '../modules/execution/store/useExecutionStore'
import { forgetTemplates, useEpcStore } from '../modules/execution/store/useEpcStore'
import { useMaterialStore } from '../modules/material/store/useMaterialStore'
import { useMaterialControlStore } from '../modules/material/store/useMaterialControlStore'
import { useFinanceStore } from '../modules/finance/store/useFinanceStore'
import { useFinanceControlStore } from '../modules/finance/store/useFinanceControlStore'
import type { Coverage, ScopeRequest } from './projectScope'

/**
 * A page drawn from answers kept in the browser is read again once the network has answered differently: the
 * store that read a changed table (named by its keepReads tag) fetches again for what it holds (the fresh answers are by then in memory, so this
 * costs no extra request). Kept answers are emptied when the person signs out.
 */
interface Refreshable { getState(): { coverage: Coverage; fetchAll: (o?: { scope?: ScopeRequest }) => Promise<void> } }
const STORES: Record<string, Refreshable> = {
  exec: useExecutionStore as unknown as Refreshable, epc: useEpcStore as unknown as Refreshable,
  mat: useMaterialStore as unknown as Refreshable, matc: useMaterialControlStore as unknown as Refreshable,
  fin: useFinanceStore as unknown as Refreshable, finc: useFinanceControlStore as unknown as Refreshable,
}

const pending = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

function flush() {
  timer = null
  const keys = [...pending]; pending.clear()
  const pid = insideProject()
  for (const k of keys) {
    const s = STORES[k]?.getState()
    if (!s) continue
    // read again what the store holds now: the open project, or every project when it holds them all
    if (pid && covers(s.coverage, pid)) void s.fetchAll({ scope: pid })
    else if (s.coverage.all) void s.fetchAll({ scope: 'all' })
  }
}

export function installLiveRefresh() {
  window.addEventListener('rasta:revalidated', (e) => {
    const { table, store } = (e as CustomEvent<{ table: string; store: string }>).detail
    if (table === 'ex_form_templates') forgetTemplates()
    pending.add(store)
    if (!timer) timer = setTimeout(flush, 400)
  })
  supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') browserAnswers.clear() })
}
