import { useEffect, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'
import { useDeepLinkStore } from '../../../store/useDeepLinkStore'
import { useModuleStore } from '../../../store/useModuleStore'

/**
 * «ریسک محقق شد → مسئله»: creates ONE Issue linked to the risk (idempotent on the server). The risk itself is not modified or
 * closed — its assessment history stays intact; the Issue keeps a snapshot of the risk's assessment and a `derived_from` link.
 */
const ERR: Record<string, string> = {
  risk_project_not_mapped: 'پروژهٔ این ریسک هنوز به پروژهٔ مرجع نگاشت نشده است (مدیریت نگاشت پروژه‌ها).',
  no_issue_mapping: 'پروژهٔ مرجع این ریسک در ماژول مدیریت مسائل نگاشت نشده است.',
  not_authorized_for_project: 'دسترسی لازم به این پروژه را ندارید.',
}

export function RiskToIssue({ riskId }: { riskId: string }) {
  const [issue, setIssue] = useState<{ id: string; code: string } | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [cause, setCause] = useState('')
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    supabase.from('im_issues').select('id,code').eq('source', 'risk').eq('source_ref_id', riskId).maybeSingle().then(({ data }) => live && setIssue(data ? { id: data.id, code: data.code } : null))
    return () => { live = false }
  }, [riskId])

  const go = (id: string) => { useDeepLinkStore.getState().request({ module: 'issues', recordId: id }); useModuleStore.getState().enterModule('issues') }
  const convert = async () => {
    setBusy(true); setErr('')
    const { data, error } = await supabase.rpc('im_convert_risk_to_issue', { p_risk: riskId, p_cause: cause.trim(), p_pursuer: null, p_deadline_days: days })
    setBusy(false)
    if (error) { const k = Object.keys(ERR).find((x) => error.message.includes(x)); setErr(k ? ERR[k] : error.message); return }
    const id = (data as { id: string }).id
    setIssue({ id, code: '' }); setOpen(false)
  }

  if (issue === undefined) return null
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
      {issue ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-secondary">این ریسک محقق شده و به مسئله تبدیل شده است {issue.code && <b className="text-text">({issue.code})</b>}</span>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-secondary transition-colors hover:bg-white/10" onClick={() => go(issue.id)}><ArrowLeftRight size={13} /> مشاهده در مدیریت مسائل</button>
        </div>
      ) : !open ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-secondary">اگر این ریسک رخ داده است، یک مسئلهٔ پیگیری‌پذیر بسازید (ریسک بدون تغییر می‌ماند).</span>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-secondary transition-colors hover:bg-white/10" onClick={() => setOpen(true)}>ریسک محقق شد → مسئله</button>
        </div>
      ) : (
        <div className="grid gap-2">
          <label className="text-secondary">علت یا شرح وقوع</label>
          <textarea className="input !h-auto" rows={2} value={cause} onChange={(e) => setCause(e.target.value)} />
          <label className="text-secondary">مهلت رفع (روز)</label>
          <input className="input !h-auto !py-1.5" type="number" min={1} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} />
          {err && <div className="text-red-400">{err}</div>}
          <div className="flex gap-2"><button className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs text-cyan-200 transition-colors hover:bg-cyan-500/30 disabled:opacity-50" disabled={busy} onClick={convert}>{busy ? 'در حال ساخت…' : 'ساخت مسئله'}</button><button className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-secondary transition-colors hover:bg-white/10" onClick={() => setOpen(false)}>انصراف</button></div>
        </div>
      )}
    </div>
  )
}
