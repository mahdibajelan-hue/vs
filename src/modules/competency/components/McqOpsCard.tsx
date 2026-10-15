import { useEffect, useState } from 'react'
import { ArrowUpLeft, ListChecks, ShieldAlert } from 'lucide-react'
import { supabase } from '../../../lib/supabaseClient'

const fa = (n: number) => n.toLocaleString('fa-IR')
interface Q { job_role: string; approval_status: string; active: boolean }
interface T { score_percent: number | null }

/** Exam operations at a glance for the dashboard: how much of the question bank is waiting for review, and which sittings need a confirmatory check. */
export function McqOpsCard({ roleName, onOpenBank }: { roleName: (role: string) => string; onOpenBank?: () => void }) {
  const [qs, setQs] = useState<Q[] | null>(null)
  const [tests, setTests] = useState<T[]>([])
  useEffect(() => {
    let live = true
    void (async () => {
      const q = await supabase.from('comp_mcq_questions').select('job_role, approval_status, active')
      const t = await supabase.from('comp_mcq_tests').select('score_percent').eq('status', 'SCORED')
      if (!live) return
      setQs((q.data as Q[] | null) ?? [])
      setTests((t.data as T[] | null) ?? [])
    })()
    return () => { live = false }
  }, [])
  if (qs == null) return null
  const pending = qs.filter((x) => x.approval_status === 'PENDING_REVIEW')
  const approved = qs.filter((x) => x.approval_status === 'APPROVED' && x.active).length
  const byRole = new Map<string, number>()
  for (const x of pending) byRole.set(x.job_role, (byRole.get(x.job_role) ?? 0) + 1)
  const roles = [...byRole.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const high = tests.filter((x) => (x.score_percent ?? 0) >= 95).length
  if (pending.length === 0 && high === 0) return null
  return (
    <section className="im-card comp-box">
      <header>
        <h3><ListChecks size={15} aria-hidden /> وضعیت آزمون تستی</h3>
        {onOpenBank && pending.length > 0 && <button className="im-btn im-btn-ghost im-btn-sm" onClick={onOpenBank}>بانک سؤال <ArrowUpLeft size={13} /></button>}
      </header>
      <div className="comp-rows" style={{ display: 'grid', gap: 8 }}>
        {pending.length > 0 && (
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9 }}>
            <b>{fa(pending.length)}</b> سؤال منتظر تأیید ادمین است و تا آن زمان در آزمون استفاده نمی‌شود (سؤال تأییدشدهٔ فعال: {fa(approved)}).
            {' '}{roles.map(([r, n]) => `${roleName(r)}: ${fa(n)}`).join('، ')}
          </p>
        )}
        {high > 0 && (
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <ShieldAlert size={14} style={{ marginTop: 5, color: '#f59e0b', flexShrink: 0 }} aria-hidden />
            <span>{fa(high)} آزمون نمرهٔ ۹۵٪ یا بیشتر دارد؛ پیش از استفاده در انتخاب ناظر، آزمون تأییدی حضوری کوتاه توصیه می‌شود.</span>
          </p>
        )}
      </div>
    </section>
  )
}
