import { Fragment, useState } from 'react'
import { ScheduleBacklink } from '../../scheduling/components/ScheduleBacklink'
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronLeft, ChevronsDownUp, ChevronsUpDown, CircleDashed, Cog, FileText, FlaskConical, FolderTree, Gauge, PenLine, Send, ShieldAlert, Sigma, Workflow, Zap, type LucideIcon } from 'lucide-react'
import { jalaliText } from '../../execution/lib/periods'
import type { EpcModel } from '../../execution/lib/useEpcModel'
import { ENG_STATUS_LABEL_FA, type EngDocRow, type EngStatus } from '../../execution/epcTypes'
import { fa, pct } from '../../execution/components/common'
import { canonDiscipline } from '../lib/disciplines'
import { COURT_COLOR, COURT_LABEL_FA, courtOf, type EngLens } from '../lib/roles'
import { creditAt, plannedCreditAt } from '../../execution/lib/engine/engineering'
import { DocCycle, cycleLine } from './DocCycle'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const ST_UI: Record<EngStatus, { icon: LucideIcon; color: string }> = {
  required: { icon: CircleDashed, color: '#94a3b8' }, in_preparation: { icon: PenLine, color: '#f97316' }, issued: { icon: Send, color: '#0ea5e9' },
  pending_approval: { icon: Send, color: '#0ea5e9' }, approved: { icon: CheckCircle2, color: '#22c55e' }, restricted: { icon: ShieldAlert, color: '#84cc16' }, superseded: { icon: FileText, color: '#94a3b8' },
}
const DISC_UI: [RegExp, LucideIcon, string][] = [[/civil|عمران|ساز/i, Building2, '#f59e0b'], [/mech|مکانیک/i, Cog, '#0ea5e9'], [/elec|برق/i, Zap, '#eab308'], [/instr|ابزار|کنترل/i, Gauge, '#8b5cf6'], [/pip|لوله/i, Workflow, '#14b8a6'], [/proc|فرآیند|process/i, FlaskConical, '#ec4899']]
const discUi = (n: string): [LucideIcon, string] => { const f = DISC_UI.find(([r]) => r.test(n)); return f ? [f[1], f[2]] : [FolderTree, '#64748b'] }
const CSS = `.dt{display:grid;gap:8px}.dt-g{border:1px solid var(--im-line,rgba(148,163,184,.25));border-radius:12px;overflow:hidden;background:var(--im-surface,transparent)}
.dt-h{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-inline-start:3px solid var(--c);background:linear-gradient(90deg,color-mix(in srgb,var(--c) 10%,transparent),transparent)}
.dt-h b{font-size:13px}.dt-ic{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent)}
.dt-bar{height:5px;border-radius:3px;background:rgba(148,163,184,.25);overflow:hidden;width:90px}.dt-bar i{display:block;height:100%;background:var(--c)}
.dt-r{display:grid;grid-template-columns:24px minmax(96px,150px) 1fr 50px 92px 74px 150px 84px;gap:8px;align-items:center;padding:4px 10px;font-size:12px;border-top:1px solid var(--im-line,rgba(148,163,184,.15))}
.dt-r:hover{background:rgba(148,163,184,.08)}.dt-r.dt-top{font-size:10.5px;color:var(--im-muted,#94a3b8);padding:3px 10px;border-top:0}
.dt-t{all:unset;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.dt-t:hover{color:var(--im-accent,#0ea5e9)}
.dt-code{font-family:ui-monospace,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dt-n{text-align:end;font-variant-numeric:tabular-nums}
.dt-st{display:inline-flex;align-items:center;gap:4px;font-weight:600;white-space:nowrap}.dt-d{padding:8px 12px;background:rgba(148,163,184,.07);border-top:1px solid var(--im-line,rgba(148,163,184,.15))}
.dt-sum{position:sticky;top:0;z-index:3;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:10px 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--im-accent,#6366f1) 35%,transparent);background:linear-gradient(90deg,color-mix(in srgb,var(--im-accent,#6366f1) 12%,var(--im-panel,#fff)),var(--im-panel,#fff));backdrop-filter:blur(6px)}
.dt-sum>div{display:grid;gap:2px;min-width:0}.dt-sum small{font-size:10.5px;color:var(--im-muted,#94a3b8)}.dt-sum b{font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dt-sum .dt-bar{width:100%;height:6px}.dt-pg{display:flex;align-items:center;gap:5px}.dt-pg .dt-bar{width:36px}.dt-cyc{font-size:10.5px;color:var(--im-muted,#94a3b8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media(max-width:900px){.dt-sum{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:760px){.dt-r{grid-template-columns:22px 1fr auto;grid-auto-rows:auto}.dt-code{display:none}.dt-r>.dt-hide{display:none}.dt-sum{grid-template-columns:repeat(2,minmax(0,1fr));position:static}}`

const money = (v: number | null) => (v == null ? '—' : fa(Math.round(v)))
const bn = (v: number) => (Math.abs(v) >= 1e9 ? `${fa(v / 1e9, 1)} میلیارد` : Math.abs(v) >= 1e6 ? `${fa(v / 1e6, 0)} میلیون` : fa(Math.round(v)))

/** The document list by discipline: a compact line per document (number, title, weight, cost, status, who has it); the rest opens under the title. Weights roll up per discipline and a document's cost is its share of the total engineering amount. */
export function DocTable({ docs, all, m, can, lens, projectId, total, upd }: { docs: EngDocRow[]; all: EngDocRow[]; m: EpcModel; can: boolean; lens: EngLens; projectId: string; total: number; upd: (x: EngDocRow, p: Partial<EngDocRow>) => void }) {
  const [open, setOpen] = useState<string>('')
  const [shut, setShut] = useState<Set<string>>(new Set())
  const live = (x: EngDocRow) => x.status !== 'superseded'
  const sumW = all.filter(live).reduce((a, x) => a + x.weight, 0)
  const cost = (x: EngDocRow) => (sumW > 0 && total > 0 ? (x.weight / sumW) * total : null)
  // the progress credit of a document today (issue / review cycle and the project's stage weights)
  const credit = (x: EngDocRow) => { const d = m.docById.get(x.id); return d ? creditAt(d, m.today, m.rules.credits) : 0 }
  const plannedCredit = (x: EngDocRow) => { const d = m.docById.get(x.id); return d ? plannedCreditAt(d, m.today, m.rules.credits) : 0 }
  const shownLive = docs.filter(live)
  const roll = { n: shownLive.length, w: shownLive.reduce((a, x) => a + x.weight, 0), earned: shownLive.reduce((a, x) => a + x.weight * credit(x), 0), plan: shownLive.reduce((a, x) => a + x.weight * plannedCredit(x), 0) }
  const rollAmount = sumW > 0 && total > 0 ? (roll.w / sumW) * total : null
  const groups = [...docs.reduce((g, x) => { const k = canonDiscipline(x.discipline, x.docNo) || 'بدون رشته'; g.set(k, [...(g.get(k) ?? []), x]); return g }, new Map<string, EngDocRow[]>())].sort((a, b) => a[0].localeCompare(b[0]))
  const toggle = (k: string) => setShut((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  return (
    <div className="dt"><style>{CSS}</style>
      <div className="dt-sum" role="group" aria-label="جمع مدارک نمایش‌داده‌شده">
        <div><small><Sigma size={11} style={{ verticalAlign: -1 }} /> مدارک</small><b>{fa(roll.n)}</b></div>
        <div><small>جمع وزن</small><b>{fa(roll.w, 2)}</b><small>{sumW ? `${pct(roll.w / sumW, 1)} از کل` : '—'}</small></div>
        <div><small>جمع مبلغ (ریال)</small><b title={money(rollAmount)}>{rollAmount == null ? '—' : bn(rollAmount)}</b><small>{rollAmount == null ? 'مبلغ کل وارد نشده' : `کسب‌شده ${bn(roll.w ? (roll.earned / roll.w) * rollAmount : 0)}`}</small></div>
        <div><small>پیشرفت وزنی</small><b>{roll.w ? pct(roll.earned / roll.w, 1) : '—'}</b><span className="dt-bar" style={{ ['--c' as string]: '#14b8a6' }}><i style={{ width: `${roll.w ? (roll.earned / roll.w) * 100 : 0}%` }} /></span></div>
        <div><small>پیشرفت برنامه‌ای</small><b>{roll.w ? pct(roll.plan / roll.w, 1) : '—'}</b><small>{roll.w ? `انحراف ${fa(((roll.earned - roll.plan) / roll.w) * 100, 1)} واحد درصد` : ''}</small></div>
        <div><small>تأیید نهایی</small><b>{fa(shownLive.filter((x) => x.status === 'approved').length)}</b><small>{fa(shownLive.filter((x) => courtOf(x.status) === 'consultant').length)} منتظر مشاور</small></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="im-btn im-btn-sm" onClick={() => setShut(shut.size >= groups.length ? new Set() : new Set(groups.map(([k]) => k)))}>{shut.size >= groups.length ? <><ChevronsUpDown size={13} /> باز کردن همه</> : <><ChevronsDownUp size={13} /> جمع کردن همه</>}</button></div>
      {groups.map(([disc, rows]) => {
        const w = rows.filter(live).reduce((a, x) => a + x.weight, 0), done = rows.filter(live).reduce((a, x) => a + x.weight * credit(x), 0)
        const closed = shut.has(disc), [Icon, color] = discUi(disc), prog = w ? done / w : 0
        return (
          <div key={disc} className="dt-g" style={{ ['--c' as string]: color }}>
            <div className="dt-h" onClick={() => toggle(disc)} role="button" aria-expanded={!closed}>
              <span className="dt-ic"><Icon size={14} /></span><b>{disc}</b><small className="sub">{fa(rows.length)} مدرک</small>
              <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 11.5 }}>
                <span title="جمع وزن رشته و سهم آن از کل">وزن <b>{fa(w, 3)}</b> <small className="sub">({sumW ? pct(w / sumW, 1) : '—'})</small></span>
                <span title="سهم از مبلغ کل مهندسی (ریال)" className="dt-hide">{sumW > 0 && total > 0 ? <b>{money((w / sumW) * total)}</b> : <small className="sub">—</small>}</span>
                <span title={`پیشرفت وزنی ${pct(prog, 0)}`} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="dt-bar"><i style={{ width: `${prog * 100}%` }} /></span><b>{pct(prog, 0)}</b></span>
                {closed ? <ChevronLeft size={15} /> : <ChevronDown size={15} />}
              </span>
            </div>
            {!closed && <>
              <div className="dt-r dt-top"><span>#</span><span>شناسه</span><span>عنوان</span><span className="dt-n">وزن</span><span className="dt-n dt-hide">هزینه (ریال)</span><span className="dt-hide">پیشرفت</span><span>وضعیت</span><span className="dt-hide">توپ دست</span></div>
              {rows.map((x, ri) => {
                const c = courtOf(x.status), fc = m.docFc.get(x.id), isOpen = open === x.id, ui = ST_UI[x.status], SI = ui.icon
                return (
                  <Fragment key={x.id}>
                    <div className="dt-r" style={x.status === 'approved' ? { opacity: 0.75 } : undefined}>
                      <span className="sub" style={{ fontSize: 10.5 }}>{fa(ri + 1)}</span>
                      <span className="dt-code" title={x.docNo} dir="ltr">{x.critical && <AlertTriangle size={11} color="#ef4444" style={{ marginInlineEnd: 3, verticalAlign: -1 }} />}{x.docNo}</span>
                      <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}><button type="button" className="dt-t" onClick={() => setOpen(isOpen ? '' : x.id)} aria-expanded={isOpen} title={x.title}>{x.title || x.docNo}</button>{fc?.overdue && <small className="ex-bad" style={{ whiteSpace: 'nowrap' }}>{fa(fc.overdueDays)}ر دیرکرد</small>}</span>
                      <span className="dt-n">{fa(x.weight, 3)}</span><span className="dt-n dt-hide">{money(cost(x))}</span>
                      <span className="dt-pg dt-hide" title="سهم پیشرفت این مدرک بر پایهٔ مرحلهٔ گردش"><span className="dt-bar"><i style={{ width: `${credit(x) * 100}%`, background: ui.color }} /></span><b style={{ fontSize: 11 }}>{fa(Math.round(credit(x) * 100))}٪</b></span>
                      <span style={{ display: 'grid', minWidth: 0 }}><span className="dt-st" style={{ color: ui.color }}><SI size={13} />{STATUS_SHORT[x.status]}</span>{cycleLine(x) && <span className="dt-cyc" dir="auto" title={cycleLine(x) ?? ''}>{cycleLine(x)}</span>}</span>
                      <span className="dt-hide" style={{ color: c === 'done' ? undefined : COURT_COLOR[c], fontWeight: 600 }}>{c === 'done' ? '—' : COURT_LABEL_FA[c].replace(' / طراح', '').replace(' نظارت', '')}</span>
                    </div>
                    {isOpen && <div className="dt-d"><Detail x={x} can={can} lens={lens} projectId={projectId} upd={upd} credit={credit(x)} /></div>}
                  </Fragment>)
              })}
            </>}
          </div>)
      })}
      {!groups.length && <div className="im-card im-empty" style={{ padding: 20 }}>مدرکی با این فیلترها نیست.</div>}
    </div>
  )
}

const STATUS_SHORT: Record<EngStatus, string> = { required: 'شروع‌نشده', in_preparation: 'نزد پیمانکار', issued: 'نزد مشاور', pending_approval: 'نزد مشاور', approved: 'تأیید نهایی', restricted: 'تأیید با ملاحظات', superseded: 'منسوخ' }
/** before the first submission the contractor marks a document started; a document can be retired as superseded */
const MANUAL: EngStatus[] = ['required', 'in_preparation', 'superseded']

function Detail({ x, can, lens, projectId, upd, credit }: { x: EngDocRow; can: boolean; lens: EngLens; projectId: string; upd: (x: EngDocRow, p: Partial<EngDocRow>) => void; credit: number }) {
  const facts: [string, string][] = [['Rev ثبت', x.rev], ['نوع مدرک', x.category], ['مرحله', x.phase], ['هدف صدور', x.targetIssue], ['پیمان', x.contract], ['مسئول تهیه', x.preparer], ['مسئول تأیید', x.approver]]
  const manualOk = MANUAL.includes(x.status) && !x.cycles.some((c) => c.result === 'pending')
  return (
    <div style={{ display: 'grid', gap: 10, padding: '6px 4px' }}>
      <div><ScheduleBacklink projectId={projectId} kind="eng_doc" id={x.id} /></div>
      <div style={{ display: 'flex', gap: '6px 18px', flexWrap: 'wrap', fontSize: 12 }}>{facts.filter(([, v]) => v).map(([k, v]) => <span key={k}><span className="sub">{k}: </span><b dir="auto">{v}</b></span>)}<span><span className="sub">پیشرفت: </span><b>{fa(Math.round(credit * 100))}٪</b></span></div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="ex-lab">وضعیت{can && manualOk && !x.cycles.length ? <select value={x.status} onChange={(e) => upd(x, { status: e.target.value as EngStatus })}>{MANUAL.map((k) => <option key={k} value={k}>{ENG_STATUS_LABEL_FA[k]}</option>)}</select> : <b>{STATUS_SHORT[x.status]}</b>}</label>
        <label className="ex-lab">ارسال — برنامه<b>{d(x.plannedPrepared)}</b></label>
        <label className="ex-lab">ارسال اول — واقعی<b>{d(x.actualPrepared)}</b></label>
        <label className="ex-lab">تأیید — برنامه<b>{d(x.plannedApproved)}</b></label>
        <label className="ex-lab">تأیید — واقعی<b>{d(x.actualApproved)}</b></label>
        {can && <label className="ex-lab">وزن<input type="number" min={0} step="0.5" defaultValue={x.weight} onBlur={(e) => Number(e.target.value) !== x.weight && upd(x, { weight: Number(e.target.value) || 0 })} style={{ width: 70 }} /></label>}
        {can && <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={x.critical} onChange={(e) => upd(x, { critical: e.target.checked })} /> بحرانی</label>}
        {can && x.status !== 'superseded' && x.cycles.length > 0 && <button className="im-btn im-btn-sm" onClick={() => window.confirm('این مدرک منسوخ شود؟ از پیشرفت حذف می‌شود.') && upd(x, { status: 'superseded' })}>منسوخ کردن</button>}
      </div>
      <label className="ex-lab">توضیح مدیریتی{can ? <input defaultValue={x.note} dir="auto" onBlur={(e) => e.target.value !== x.note && upd(x, { note: e.target.value })} /> : <span>{x.note || '—'}</span>}</label>
      <DocCycle doc={x} lens={lens} canSubmit={can} />
    </div>
  )
}
