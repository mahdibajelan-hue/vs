import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { ArrowRight, ExternalLink, Gavel, Layers, X } from 'lucide-react'
import { useModuleStore } from '../../../store/useModuleStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { formatJalali } from '../../../lib/jalali'
import { DECISION_FA, HEALTH_FA, type PfHealth, type PfProjectView } from '../lib/portfolioCore'
import { faNum, fmtIdx, fmtMoney, HealthChip } from './pfUi'
import { Gauge, IDX_BANDS, Num, Ring, StackBar } from './viz'

/**
 * Drill-through for the whole module: any chart hands a group of projects to `drill()`; the sheet lists them with their
 * totals, and a project in the list opens its own detail — from the portfolio to the group to the single project.
 */
interface DrillState {
  title: string | null
  sub: string | null
  ids: string[] | null
  project: string | null
  drill: (title: string, ids: string[], sub?: string) => void
  open: (projectId: string) => void
  back: () => void
  close: () => void
}
export const useDrill = create<DrillState>()((set, get) => ({
  title: null, sub: null, ids: null, project: null,
  drill: (title, ids, sub) => set({ title, ids, sub: sub ?? null, project: null }),
  open: (project) => set({ project, ...(get().ids ? {} : { title: null, ids: null }) }),
  back: () => set({ project: null }),
  close: () => set({ title: null, sub: null, ids: null, project: null }),
}))

const HEALTH_ORDER: PfHealth[] = ['red', 'black', 'yellow', 'green', 'unknown']

export function DrillSheet({ views, onDecide, canGovern }: { views: PfProjectView[]; onDecide: (id: string) => void; canGovern: boolean }) {
  const { title, sub, ids, project, back, close, open } = useDrill()
  const closeRef = useRef<HTMLButtonElement>(null)
  const isOpen = !!(ids || project)
  const list = useMemo(() => (ids ? views.filter((v) => ids.includes(v.input.id)) : []), [ids, views])
  const pv = project ? views.find((v) => v.input.id === project) : undefined

  useEffect(() => {
    if (!isOpen) return
    closeRef.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') (useDrill.getState().project && useDrill.getState().ids ? back() : close()) }
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [isOpen, back, close])
  if (!isOpen) return null

  const bac = list.reduce((n, v) => n + (v.bac ?? 0), 0)
  const eac = list.reduce((n, v) => n + (v.eac ?? 0), 0)
  const healthParts = HEALTH_ORDER.map((h) => ({ key: h, label: HEALTH_FA[h].label, value: list.filter((v) => v.health === h).length, color: HEALTH_FA[h].color }))

  return createPortal(
    <div className="vz-sheet-root" dir="rtl">
      <div className="vz-sheet-scrim" onClick={close} aria-hidden />
      <aside className="vz-sheet" role="dialog" aria-modal="true" aria-label={pv ? pv.input.name : title ?? ''}>
        <header className="vz-sheet-head">
          {pv && ids ? <button type="button" className="vz-sheet-back" onClick={back}><ArrowRight size={14} aria-hidden /> {title}</button> : <span className="vz-sheet-crumb"><Layers size={13} aria-hidden /> سبد پروژه‌ها</span>}
          <button ref={closeRef} type="button" className="vz-sheet-x" onClick={close} aria-label="بستن"><X size={16} /></button>
        </header>

        {pv ? <ProjectDetail v={pv} onDecide={canGovern ? () => onDecide(pv.input.id) : undefined} /> : (
          <div className="vz-sheet-body" key={title ?? ''}>
            <h2>{title}</h2>
            {sub && <p className="vz-sheet-sub">{sub}</p>}
            <div className="vz-sheet-sum">
              <span><small>پروژه</small><b><Num value={list.length} /></b></span>
              <span><small>بودجه</small><b>{fmtMoney(bac, '')}</b></span>
              <span><small>پیش‌بینی تمام‌شده</small><b className={eac > bac && bac > 0 ? 'pf-bad' : ''}>{fmtMoney(eac, '')}</b></span>
            </div>
            <StackBar parts={healthParts} />
            <ul className="vz-sheet-list">
              {list.map((v, i) => (
                <li key={v.input.id} style={{ '--i': i } as CSSProperties}>
                  <button type="button" onClick={() => open(v.input.id)}>
                    <Ring pct={v.input.snapshot?.actual ?? null} color={HEALTH_FA[v.health].color} size={40} stroke={5}>
                      <small>{v.input.snapshot ? faNum(v.input.snapshot.actual) : '—'}</small>
                    </Ring>
                    <span className="vz-sheet-name"><b>{v.input.name}</b><small>{v.input.snapshot?.phase ? `${v.input.snapshot.phase.code} · ${v.input.snapshot.phase.title}` : 'مرحله نامشخص'} · {fmtMoney(v.bac, '')}</small></span>
                    <HealthChip health={v.health} />
                  </button>
                </li>
              ))}
              {!list.length && <li className="pf-muted">پروژه‌ای در این گروه نیست.</li>}
            </ul>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  )
}

function ProjectDetail({ v, onDecide }: { v: PfProjectView; onDecide?: () => void }) {
  const s = v.input.snapshot
  const d = v.input.delivery
  const openDashboard = () => { useProjectContextStore.getState().setProject(v.input.id); useModuleStore.getState().enterModule('projectdashboard', 'project') }
  return (
    <div className="vz-sheet-body vz-proj" key={v.input.id}>
      <h2>{v.input.name}</h2>
      <p className="vz-sheet-sub">{v.input.code}{s?.phase ? ` · ${s.phase.code} ${s.phase.title}` : ''}</p>
      <div className="vz-proj-top">
        <HealthChip health={v.health} />
        {v.rank != null && <span className="vz-chip">رتبهٔ اولویت <b>{faNum(v.rank)}</b></span>}
        {v.input.riskLevel && <span className="vz-chip">بالاترین ریسک <b>{({ critical: 'بحرانی', high: 'بالا', medium: 'متوسط', low: 'کم' } as const)[v.input.riskLevel]}</b></span>}
      </div>
      <div className="vz-proj-gauges">
        <Ring pct={s?.actual ?? null} color="#6366f1" size={104} stroke={10}>
          <b>{s ? `${faNum(s.actual, 0)}٪` : '—'}</b><small>برنامه {s ? `${faNum(s.planned, 0)}٪` : '—'}</small>
        </Ring>
        <Gauge value={s?.spi ?? null} min={0.5} max={1.5} bands={IDX_BANDS} target={1} label="SPI" size={140} display={fmtIdx(s?.spi)} />
        <Gauge value={s?.cpi ?? null} min={0.5} max={1.5} bands={IDX_BANDS} target={1} label="CPI" size={140} display={fmtIdx(s?.cpi)} />
      </div>
      <dl className="vz-proj-dl">
        <div><dt>بودجه (BAC)</dt><dd>{fmtMoney(v.bac)}</dd></div>
        <div><dt>پیش‌بینی تمام‌شده (EAC)</dt><dd>{fmtMoney(v.eac)}{v.eacSource ? <small> · {v.eacSource === 'evm' ? 'EVM' : 'دستی'}</small> : null}</dd></div>
        <div><dt>انحراف در پایان (VAC)</dt><dd className={v.vac != null && v.vac < 0 ? 'pf-bad' : ''}>{fmtMoney(v.vac)}</dd></div>
        <div><dt>امتیاز اولویت</dt><dd>{v.priority == null ? '—' : faNum(v.priority)} <small>· پوشش {faNum(Math.round(v.coverage * 100))}٪</small></dd></div>
        {d && <div><dt>Milestone / اقدام عقب‌افتاده</dt><dd>{faNum(d.milestonesDelayed)} / {faNum(d.overdueActions)} <small>(بحرانی {faNum(d.criticalMilestonesDelayed + d.criticalOverdueActions)})</small></dd></div>}
        {v.lastDecision && <div><dt>آخرین تصمیم سبد</dt><dd><span className="pf-dec" style={{ '--c': DECISION_FA[v.lastDecision.decision].color } as CSSProperties}>{DECISION_FA[v.lastDecision.decision].label}</span> <small>{formatJalali(v.lastDecision.decidedAt)}</small></dd></div>}
      </dl>
      {v.health === 'black' && s?.blockers?.length ? <div className="vz-proj-why"><b>علت مسدود بودن گیت</b><ul>{s.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>
        : s?.drivenBy ? <div className="vz-proj-why"><b>عامل اصلی وضعیت</b><p>{s.drivenBy}</p></div> : null}
      <div className="vz-proj-actions">
        {onDecide && <button type="button" className="pf-btn is-primary" onClick={onDecide}><Gavel size={14} /> ثبت تصمیم</button>}
        <button type="button" className="pf-btn" onClick={openDashboard}><ExternalLink size={14} /> داشبورد کامل پروژه</button>
      </div>
    </div>
  )
}
