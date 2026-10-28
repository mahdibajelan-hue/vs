import { useMemo, useState, type CSSProperties } from 'react'
import { Ban, Gavel, History, Lock } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { usePortfolioStore } from '../store/usePortfolioStore'
import { DECISION_FA, HEALTH_FA, type PfDecisionKind, type PfHealth, type PfProjectView } from '../lib/portfolioCore'
import { Empty, faNum, Panel } from '../components/pfUi'

/** The portfolio's decision record: who decided what, why, under which health and priority, and when it must be reviewed. */
export function DecisionsTab({ views, onDecide }: { views: PfProjectView[]; onDecide: (projectId: string | null) => void }) {
  const st = usePortfolioStore()
  const [kind, setKind] = useState<PfDecisionKind | 'all'>('all')
  const [showVoided, setShowVoided] = useState(false)
  const ids = useMemo(() => new Set(views.map((v) => v.input.id)), [views])
  const name = (id: string) => views.find((v) => v.input.id === id)?.input.name ?? '—'
  const today = new Date().toISOString().slice(0, 10)
  const list = st.decisions.filter((d) => ids.has(d.projectId) && (showVoided || !d.voided) && (kind === 'all' || d.decision === kind))
  const counts = (Object.keys(DECISION_FA) as PfDecisionKind[]).map((k) => ({ k, n: views.filter((v) => v.lastDecision?.decision === k).length }))

  async function voidIt(id: string) {
    const reason = window.prompt('دلیل ابطال این تصمیم؟ (تصمیم حذف نمی‌شود و با علامت «ابطال‌شده» می‌ماند)')
    if (reason && reason.trim()) await st.voidDecision(id, reason)
  }

  return (
    <div className="pf-stack">
      <Panel title="وضعیت تصمیم پروژه‌ها" icon={<Gavel size={15} />} hint="آخرین تصمیم معتبر هر پروژه."
        right={st.canGovern ? <button type="button" className="pf-btn is-primary" onClick={() => onDecide(null)}><Gavel size={14} /> ثبت تصمیم</button> : <span className="pf-muted"><Lock size={12} /> ثبت تصمیم: دسترسی «تصویب» پرتفولیو</span>}>
        <div className="pf-dec-counts">
          {counts.map(({ k, n }) => (
            <button key={k} type="button" aria-pressed={kind === k} className={`pf-dec-count ${kind === k ? 'is-on' : ''}`} style={{ '--c': DECISION_FA[k].color } as CSSProperties} onClick={() => setKind(kind === k ? 'all' : k)}>
              <b>{faNum(n)}</b><span>{DECISION_FA[k].label}</span>
            </button>
          ))}
          <div className="pf-dec-count is-none"><b>{faNum(views.filter((v) => !v.lastDecision).length)}</b><span>بدون تصمیم</span></div>
        </div>
      </Panel>

      <Panel title="دفتر تصمیم‌های سبد" icon={<History size={15} />} hint="تصمیم‌ها حذف نمی‌شوند؛ ابطال با دلیل ثبت می‌شود."
        right={<label className="pf-check"><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> نمایش ابطال‌شده‌ها</label>}>
        {!list.length ? <Empty>تصمیمی با این فیلتر ثبت نشده است.</Empty> : (
          <ol className="pf-log">
            {list.map((d) => (
              <li key={d.id} className={d.voided ? 'is-void' : ''} style={{ '--c': DECISION_FA[d.decision].color } as CSSProperties}>
                <div className="pf-log-head">
                  <span className="pf-dec">{DECISION_FA[d.decision].label}</span>
                  <b>{name(d.projectId)}</b>
                  <small className="pf-muted">{formatJalali(d.decidedAt)} · {st.names.get(d.decidedBy ?? '') ?? '—'}</small>
                  {d.reviewBy && <small className={!d.voided && d.reviewBy < today ? 'pf-bad' : 'pf-muted'}>بازبینی: {formatJalali(d.reviewBy)}</small>}
                  {st.canGovern && !d.voided && <button type="button" className="pf-icon" title="ابطال" aria-label="ابطال تصمیم" onClick={() => void voidIt(d.id)}><Ban size={14} /></button>}
                </div>
                <p>{d.rationale}</p>
                {d.conditions && <p className="pf-muted">شرایط: {d.conditions}</p>}
                <small className="pf-muted">در لحظهٔ تصمیم: سلامت {HEALTH_FA[(d.healthAtDecision ?? 'unknown') as PfHealth]?.label ?? '—'} · اولویت {d.priorityAtDecision == null ? '—' : faNum(d.priorityAtDecision)}</small>
                {d.voided && <p className="pf-bad">ابطال‌شده: {d.voidReason}</p>}
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}
