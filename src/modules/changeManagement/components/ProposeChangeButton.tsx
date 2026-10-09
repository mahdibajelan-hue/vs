import { useState } from 'react'
import { GitPullRequestArrow } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useDeepLinkStore } from '../../../store/useDeepLinkStore'
import { useModuleStore } from '../../../store/useModuleStore'
import { friendly } from '../lib/changeFlow'

/** From a risk or an issue: create (once) a DRAFT change request linked back to it, then open it in Change Management. Nothing is sent for approval. */
export function ProposeChangeButton({ type, id, className = 'im-btn im-btn-ghost im-btn-sm' }: { type: 'risk' | 'issue'; id: string; className?: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('cm_create_from_source', { p_type: type, p_target: id })
    setBusy(false)
    if (error) { setErr(friendly(error)); return }
    useDeepLinkStore.getState().request({ module: 'change', recordId: (data as { id: string }).id })
    useModuleStore.getState().enterModule('change')
  }
  return <span><button type="button" className={className} disabled={busy} onClick={go}><GitPullRequestArrow size={13} /> پیشنهاد تغییر</button>{err && <span className="im-err" role="alert" style={{ marginInlineStart: 8 }}>{err}</span>}</span>
}
