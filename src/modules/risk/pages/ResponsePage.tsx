import { useMemo, useState } from 'react'
import { Ban, ClipboardCheck, ShieldOff, Stamp } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { HelpButton } from '../../issues/components/Help'
import { Kpi } from '../../issues/components/ui'
import { useRiskData, useRiskDirectory } from '../lib/useRiskData'
import { RK_HELP } from '../lib/help'
import { todayIso } from '../lib/riskScore'
import { isOpenAction } from '../lib/riskState'
import { LevelChip, ScoreTriple } from '../components/rk'
import { RM_ACTION_STATUS_LABEL_FA, RM_ACTION_TYPE_LABEL_FA } from '../types'
import type { PageProps } from '../RiskApp'

const ST_COLOR: Record<string, string> = { not_started: '#94a3b8', in_progress: '#0ea5e9', completed: '#22c55e', blocked: '#ef4444', cancelled: '#64748b' }

export function ResponsePage({ onOpenRisk }: PageProps) {
  const d = useRiskData()
  const dir = useRiskDirectory()
  const today = todayIso()
  const [filter, setFilter] = useState<'open' | 'overdue' | 'blocked' | 'done' | 'all'>('open')
  const [owner, setOwner] = useState('all')
  const riskOf = useMemo(() => new Map(d.risks.map((r) => [r.id, r])), [d.risks])

  const stats = useMemo(() => {
    const open = d.actions.filter(isOpenAction)
    return {
      open: open.length, overdue: open.filter((a) => a.dueDate && a.dueDate < today).length, blocked: open.filter((a) => a.status === 'blocked').length,
      unverified: d.actions.filter((a) => a.status === 'completed' && a.effectStatus === 'pending').length,
    }
  }, [d.actions, today])

  const weakPlans = useMemo(() => d.active.filter((r) => {
    const s = d.states.get(r.id)!
    if (s.level !== 'high' && s.level !== 'critical') return false
    if (r.responseStrategy === 'accept') return !d.acceptances.some((a) => a.riskId === r.id && a.status === 'approved')
    const acts = d.actions.filter((a) => a.riskId === r.id && a.status !== 'cancelled')
    return acts.length === 0 || (s.openActions === 0 && s.residualZone !== 'acceptable') || (s.openActions > 0 && s.overdueActions === s.openActions)
  }), [d.active, d.states, d.actions, d.acceptances])

  const rows = useMemo(() => d.actions.filter((a) => {
    const open = isOpenAction(a)
    if (filter === 'open' && !open) return false
    if (filter === 'overdue' && !(open && a.dueDate && a.dueDate < today)) return false
    if (filter === 'blocked' && a.status !== 'blocked') return false
    if (filter === 'done' && a.status !== 'completed') return false
    if (owner !== 'all' && (owner === 'none' ? !!a.ownerId : a.ownerId !== owner)) return false
    return !!riskOf.get(a.riskId)
  }).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')), [d.actions, filter, owner, today, riskOf])

  const pendingAcc = d.acceptances.filter((a) => a.status === 'requested')
  const cont = d.contingency

  return (
    <div className="im-page">
      <div className="im-topbar"><div><div className="im-page-title">پاسخ و اقدامات کاهشی</div><div className="im-page-sub">{d.actions.length} اقدام برای {new Set(d.actions.map((a) => a.riskId)).size} ریسک</div></div><div className="im-actions"><HelpButton content={RK_HELP.response} /></div></div>

      <div className="im-kpi-grid">
        <Kpi label="اقدام باز" value={stats.open} icon={ClipboardCheck} color="#0ea5e9" index={0} />
        <Kpi label="معوق" value={stats.overdue} tone={stats.overdue ? 'bad' : 'good'} icon={ClipboardCheck} index={1} />
        <Kpi label="مسدود" value={stats.blocked} tone={stats.blocked ? 'warn' : 'good'} icon={Ban} index={2} />
        <Kpi label="تکمیل‌شدهٔ راستی‌آزمایی‌نشده" value={stats.unverified} tone={stats.unverified ? 'warn' : 'good'} icon={ClipboardCheck} hint="اثر این اقدام‌ها هنوز تأیید نشده است" index={3} />
        <Kpi label="ریسک مهم بدون برنامهٔ کافی" value={weakPlans.length} tone={weakPlans.length ? 'bad' : 'good'} icon={ShieldOff} index={4} />
        <Kpi label="پذیرش در انتظار تصمیم" value={pendingAcc.length} tone={pendingAcc.length ? 'warn' : 'good'} icon={Stamp} index={5} />
      </div>

      {weakPlans.length > 0 && (
        <div className="im-card" style={{ marginBottom: 14 }}>
          <div className="im-section-title"><ShieldOff size={16} style={{ color: 'var(--im-coral)' }} /> ریسک‌های مهم بدون برنامهٔ پاسخ کافی <span className="im-helper">زیاد/بحرانی که اقدام باز ندارند، همهٔ اقدام‌هایشان معوق است، یا پذیرش رسمی ندارند</span></div>
          <div className="im-grid" style={{ gap: 6 }}>{weakPlans.slice(0, 12).map((r) => <button key={r.id} className="im-task" style={{ display: 'flex', width: '100%', textAlign: 'right', justifyContent: 'space-between', gap: 8 }} onClick={() => onOpenRisk(r.id, 'response')}><span><span className="im-code">{r.code}</span> <b>{r.title}</b><div className="im-helper">{dir.name(r.ownerId)}</div></span><span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><ScoreTriple state={d.states.get(r.id)!} policy={d.policyFor(r.projectId)} /><LevelChip level={d.states.get(r.id)!.level} /></span></button>)}</div>
        </div>
      )}

      {pendingAcc.length > 0 && (
        <div className="im-card" style={{ marginBottom: 14 }}>
          <div className="im-section-title"><Stamp size={16} style={{ color: 'var(--im-amber)' }} /> درخواست‌های پذیرش رسمی ریسک باقیمانده</div>
          {pendingAcc.map((a) => { const r = riskOf.get(a.riskId); return r ? <button key={a.id} className="im-task" style={{ display: 'block', width: '100%', textAlign: 'right', marginBottom: 6 }} onClick={() => onOpenRisk(r.id, 'response')}><span className="im-code">{r.code}</span> <b>{r.title}</b> — باقیمانده {a.residualScore}<div className="im-helper">{a.rationale} · {dir.name(a.requestedBy)} · {formatJalali(a.requestedAt.slice(0, 10))}</div></button> : null })}
        </div>
      )}

      <div className="im-card">
        <div className="im-section-title" style={{ justifyContent: 'space-between' }}>اقدام‌ها
          <div className="im-actions">
            <div className="im-seg" role="tablist">{([['open', 'باز'], ['overdue', 'معوق'], ['blocked', 'مسدود'], ['done', 'تکمیل‌شده'], ['all', 'همه']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="مسئول" style={{ width: 'auto' }}><option value="all">همهٔ مسئولان</option><option value="none">بدون مسئول</option>{dir.all.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</select>
          </div>
        </div>
        {rows.length === 0 ? <div className="im-empty">اقدامی با این فیلتر نیست.</div> : (
          <div className="im-table-wrap"><table className="im-table"><thead><tr><th>ریسک</th><th>اقدام</th><th>نوع</th><th>مسئول</th><th>سررسید</th><th>وضعیت</th></tr></thead><tbody>
            {rows.slice(0, 200).map((a) => {
              const r = riskOf.get(a.riskId)!
              const late = isOpenAction(a) && a.dueDate && a.dueDate < today ? Math.round((Date.parse(today) - Date.parse(a.dueDate)) / 86400000) : 0
              return (
                <tr key={a.id} className="rk-row-click" onClick={() => onOpenRisk(r.id, 'response')}>
                  <td><span className="im-code">{r.code}</span><div className="im-helper" style={{ fontSize: 10.5 }}>{r.title.slice(0, 40)}</div></td>
                  <td style={{ textDecoration: a.status === 'completed' ? 'line-through' : undefined, minWidth: 220 }}>{a.description}{a.status === 'blocked' && <div className="rk-flag" style={{ ['--c' as string]: '#ef4444' }}>{a.blockedReason}</div>}</td>
                  <td className="im-helper">{RM_ACTION_TYPE_LABEL_FA[a.actionType]}</td>
                  <td className="im-helper">{a.ownerId ? dir.name(a.ownerId) : <span style={{ color: 'var(--im-coral)' }}>—</span>}</td>
                  <td className="im-helper">{a.dueDate ? formatJalali(a.dueDate) : '—'}{late > 0 && <span className="rk-flag" style={{ ['--c' as string]: '#ef4444', marginInlineStart: 4 }}>{late} روز</span>}</td>
                  <td><span className="rk-flag" style={{ ['--c' as string]: ST_COLOR[a.status] }}>{RM_ACTION_STATUS_LABEL_FA[a.status]}</span></td>
                </tr>
              )
            })}
          </tbody></table></div>
        )}
        {cont.length > 0 && <div className="im-helper" style={{ marginTop: 10 }}>{cont.length} برنامهٔ اقتضایی ثبت شده ({cont.filter((c) => c.status === 'ready').length} آماده، {cont.filter((c) => c.status === 'activated').length} فعال‌شده).</div>}
      </div>
    </div>
  )
}
