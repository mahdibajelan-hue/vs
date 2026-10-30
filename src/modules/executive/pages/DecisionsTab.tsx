import { useMemo, useState, type CSSProperties } from 'react'
import { Ban, CalendarClock, Gavel, History, Lock, PieChart, ShieldQuestion } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { usePortfolioStore } from '../store/usePortfolioStore'
import { DECISION_FA, HEALTH_FA, type PfDecisionKind, type PfHealth, type PfProjectView } from '../lib/portfolioCore'
import { Empty, faNum, Kpi, Panel } from '../components/pfUi'
import { Donut } from '../components/viz'
import { useDrill } from '../components/DrillSheet'

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
  const { drill, open } = useDrill()
  const undecided = views.filter((v) => !v.lastDecision)
  const overdue = views.filter((v) => v.lastDecision?.reviewBy && v.lastDecision.reviewBy < today)

  async function voidIt(id: string) {
    const reason = window.prompt('دلیل ابطال این تصمیم؟ (تصمیم حذف نمی‌شود و با علامت «ابطال‌شده» می‌ماند)')
    if (reason && reason.trim()) await st.voidDecision(id, reason)
  }

  return (
    <div className="pf-stack">
      <div className="pf-kpis">
        <Kpi icon={<Gavel size={14} />} label="دارای تصمیم معتبر" value={views.length - undecided.length} sub={`از ${faNum(views.length)} پروژه`} tone="#22c55e" onClick={() => drill('پروژه‌های دارای تصمیم سبد', views.filter((v) => v.lastDecision).map((v) => v.input.id))} />
        <Kpi icon={<ShieldQuestion size={14} />} label="بدون تصمیم" value={undecided.length} sub="هنوز تصمیم سبدی ثبت نشده" tone="#64748b" onClick={undecided.length ? () => drill('پروژه‌های بدون تصمیم سبد', undecided.map((v) => v.input.id)) : undefined} />
        <Kpi icon={<CalendarClock size={14} />} label="سررسید بازبینی گذشته" value={overdue.length} sub="تصمیم باید دوباره بررسی شود" tone={overdue.length ? '#f97316' : '#22c55e'} onClick={overdue.length ? () => drill('سررسید بازبینی تصمیم گذشته', overdue.map((v) => v.input.id)) : undefined} />
        <Kpi icon={<History size={14} />} label="تصمیم ثبت‌شده" value={st.decisions.filter((d) => ids.has(d.projectId) && !d.voided).length} sub="کل دفتر، بدون ابطال‌شده‌ها" tone="#6366f1" />
      </div>

      <Panel title="ترکیب تصمیم‌ها" icon={<PieChart size={15} />} hint="آخرین تصمیم معتبر هر پروژه. روی هر بخش بزنید تا دفتر پایین به همان نوع تصمیم محدود شود."
        right={st.canGovern ? <button type="button" className="pf-btn is-primary" onClick={() => onDecide(null)}><Gavel size={14} /> ثبت تصمیم</button> : <span className="pf-muted"><Lock size={12} /> ثبت تصمیم: دسترسی «تصویب» پرتفولیو</span>}>
        <Donut sub="پروژه" picked={kind === 'all' ? null : kind} onPick={(k) => (k === 'none' ? drill('پروژه‌های بدون تصمیم سبد', undecided.map((v) => v.input.id)) : setKind((k as PfDecisionKind | null) ?? 'all'))}
          parts={[...counts.map(({ k, n }) => ({ key: k, label: DECISION_FA[k].label, value: n, color: DECISION_FA[k].color })), { key: 'none', label: 'بدون تصمیم', value: undecided.length, color: '#64748b' }]} />
      </Panel>

      <Panel title="دفتر تصمیم‌های سبد" icon={<History size={15} />} hint="تصمیم‌ها حذف نمی‌شوند؛ ابطال با دلیل ثبت می‌شود."
        right={<label className="pf-check"><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> نمایش ابطال‌شده‌ها</label>}>
        {!list.length ? <Empty>تصمیمی با این فیلتر ثبت نشده است.</Empty> : (
          <ol className="pf-log">
            {list.map((d) => (
              <li key={d.id} className={d.voided ? 'is-void' : ''} style={{ '--c': DECISION_FA[d.decision].color } as CSSProperties}>
                <div className="pf-log-head">
                  <span className="pf-dec">{DECISION_FA[d.decision].label}</span>
                  <button type="button" className="vz-link" onClick={() => open(d.projectId)}>{name(d.projectId)}</button>
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
