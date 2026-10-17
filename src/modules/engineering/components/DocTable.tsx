import { Fragment, useEffect, useState } from 'react'
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronLeft, CircleDashed, Cog, FileText, FlaskConical, FolderTree, Gauge, MessageSquare, PenLine, Send, ShieldAlert, Workflow, Zap, type LucideIcon } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { supabase } from '../../../lib/supabaseClient'
import { jalaliText } from '../../execution/lib/periods'
import type { EpcModel } from '../../execution/lib/useEpcModel'
import { ENG_STATUS_LABEL_FA, type EngDocRow, type EngStatus } from '../../execution/epcTypes'
import { fa, pct } from '../../execution/components/common'
import { COURT_COLOR, COURT_LABEL_FA, courtOf, type EngLens } from '../lib/roles'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const ST_UI: Record<EngStatus, { icon: LucideIcon; color: string }> = {
  required: { icon: CircleDashed, color: '#94a3b8' }, in_preparation: { icon: PenLine, color: '#f97316' }, issued: { icon: Send, color: '#0ea5e9' },
  pending_approval: { icon: Send, color: '#0ea5e9' }, approved: { icon: CheckCircle2, color: '#22c55e' }, restricted: { icon: ShieldAlert, color: '#eab308' }, superseded: { icon: FileText, color: '#94a3b8' },
}
const DISC_UI: [RegExp, LucideIcon, string][] = [[/civil|عمران|ساز/i, Building2, '#f59e0b'], [/mech|مکانیک/i, Cog, '#0ea5e9'], [/elec|برق/i, Zap, '#eab308'], [/instr|ابزار|کنترل/i, Gauge, '#8b5cf6'], [/pip|لوله/i, Workflow, '#14b8a6'], [/proc|فرآیند|process/i, FlaskConical, '#ec4899']]
const discUi = (n: string): [LucideIcon, string] => { const f = DISC_UI.find(([r]) => r.test(n)); return f ? [f[1], f[2]] : [FolderTree, '#64748b'] }
const CSS = `.dt{display:grid;gap:8px}.dt-g{border:1px solid var(--im-line,rgba(148,163,184,.25));border-radius:12px;overflow:hidden;background:var(--im-surface,transparent)}
.dt-h{display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-inline-start:3px solid var(--c);background:linear-gradient(90deg,color-mix(in srgb,var(--c) 10%,transparent),transparent)}
.dt-h b{font-size:13px}.dt-ic{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent)}
.dt-bar{height:5px;border-radius:3px;background:rgba(148,163,184,.25);overflow:hidden;width:90px}.dt-bar i{display:block;height:100%;background:var(--c)}
.dt-r{display:grid;grid-template-columns:minmax(96px,150px) 1fr 44px 92px 112px 84px;gap:8px;align-items:center;padding:4px 10px;font-size:12px;border-top:1px solid var(--im-line,rgba(148,163,184,.15))}
.dt-r:hover{background:rgba(148,163,184,.08)}.dt-r.dt-top{font-size:10.5px;color:var(--im-muted,#94a3b8);padding:3px 10px;border-top:0}
.dt-t{all:unset;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.dt-t:hover{color:var(--im-accent,#0ea5e9)}
.dt-code{font-family:ui-monospace,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dt-n{text-align:end;font-variant-numeric:tabular-nums}
.dt-st{display:inline-flex;align-items:center;gap:4px;font-weight:600;white-space:nowrap}.dt-d{padding:8px 12px;background:rgba(148,163,184,.07);border-top:1px solid var(--im-line,rgba(148,163,184,.15))}
@media(max-width:760px){.dt-r{grid-template-columns:1fr auto;grid-auto-rows:auto}.dt-r>.dt-hide{display:none}}`

const STATUS_OPTS = (Object.entries(ENG_STATUS_LABEL_FA) as [EngStatus, string][]).filter(([k]) => k !== 'pending_approval')
const money = (v: number | null) => (v == null ? '—' : fa(Math.round(v)))
interface Comment { id: string; author_name: string; author_role: string; body: string; created_at: string }
const ROLE_FA: Record<string, string> = { employer: 'کارفرما', consultant: 'مشاور', manager: 'مدیر' }

/** The document list by discipline: a compact line per document (number, title, weight, cost, status, who has it); the rest opens under the title. Weights roll up per discipline and a document's cost is its share of the total engineering amount. */
export function DocTable({ docs, all, m, can, lens, projectId, total, upd }: { docs: EngDocRow[]; all: EngDocRow[]; m: EpcModel; can: boolean; lens: EngLens; projectId: string; total: number; upd: (x: EngDocRow, p: Partial<EngDocRow>) => void }) {
  const [open, setOpen] = useState<string>('')
  const [shut, setShut] = useState<Set<string>>(new Set())
  const live = (x: EngDocRow) => x.status !== 'superseded'
  const sumW = all.filter(live).reduce((a, x) => a + x.weight, 0)
  const cost = (x: EngDocRow) => (sumW > 0 && total > 0 ? (x.weight / sumW) * total : null)
  const groups = [...docs.reduce((g, x) => { const k = x.discipline || 'بدون رشته'; g.set(k, [...(g.get(k) ?? []), x]); return g }, new Map<string, EngDocRow[]>())].sort((a, b) => a[0].localeCompare(b[0]))
  const toggle = (k: string) => setShut((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  return (
    <div className="dt"><style>{CSS}</style>
      {groups.map(([disc, rows]) => {
        const w = rows.filter(live).reduce((a, x) => a + x.weight, 0), done = rows.filter((x) => x.status === 'approved').reduce((a, x) => a + x.weight, 0)
        const closed = shut.has(disc), [Icon, color] = discUi(disc), prog = w ? done / w : 0
        return (
          <div key={disc} className="dt-g" style={{ ['--c' as string]: color }}>
            <div className="dt-h" onClick={() => toggle(disc)} role="button" aria-expanded={!closed}>
              <span className="dt-ic"><Icon size={14} /></span><b>{disc}</b><small className="sub">{fa(rows.length)} مدرک</small>
              <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 11.5 }}>
                <span title="جمع وزن رشته و سهم آن از کل">وزن <b>{fa(w, 2)}</b> <small className="sub">({sumW ? pct(w / sumW, 1) : '—'})</small></span>
                <span title="سهم از مبلغ کل مهندسی (ریال)" className="dt-hide">{sumW > 0 && total > 0 ? <b>{money((w / sumW) * total)}</b> : <small className="sub">—</small>}</span>
                <span title={`پیشرفت وزنی ${pct(prog, 0)}`} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span className="dt-bar"><i style={{ width: `${prog * 100}%` }} /></span><b>{pct(prog, 0)}</b></span>
                {closed ? <ChevronLeft size={15} /> : <ChevronDown size={15} />}
              </span>
            </div>
            {!closed && <>
              <div className="dt-r dt-top"><span>شناسه</span><span>عنوان</span><span className="dt-n">وزن</span><span className="dt-n dt-hide">هزینه (ریال)</span><span>وضعیت</span><span className="dt-hide">توپ دست</span></div>
              {rows.map((x) => {
                const c = courtOf(x.status), fc = m.docFc.get(x.id), isOpen = open === x.id, ui = ST_UI[x.status], SI = ui.icon
                return (
                  <Fragment key={x.id}>
                    <div className="dt-r" style={x.status === 'approved' ? { opacity: 0.75 } : undefined}>
                      <span className="dt-code" title={x.docNo} dir="ltr">{x.critical && <AlertTriangle size={11} color="#ef4444" style={{ marginInlineEnd: 3, verticalAlign: -1 }} />}{x.docNo}</span>
                      <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}><button type="button" className="dt-t" onClick={() => setOpen(isOpen ? '' : x.id)} aria-expanded={isOpen} title={x.title}>{x.title || x.docNo}</button>{fc?.overdue && <small className="ex-bad" style={{ whiteSpace: 'nowrap' }}>{fa(fc.overdueDays)}ر دیرکرد</small>}</span>
                      <span className="dt-n">{fa(x.weight, 2)}</span><span className="dt-n dt-hide">{money(cost(x))}</span>
                      <span className="dt-st" style={{ color: ui.color }}><SI size={13} />{ENG_STATUS_LABEL_FA[x.status].replace('تأیید با محدودیت اجرایی', 'با محدودیت').replace('تهیه‌شده/صادرشده', 'تهیه‌شده')}</span>
                      <span className="dt-hide" style={{ color: c === 'done' ? undefined : COURT_COLOR[c], fontWeight: 600 }}>{c === 'done' ? '—' : COURT_LABEL_FA[c].replace(' / طراح', '').replace(' نظارت', '')}</span>
                    </div>
                    {isOpen && <div className="dt-d"><Detail x={x} can={can} lens={lens} projectId={projectId} upd={upd} /></div>}
                  </Fragment>)
              })}
            </>}
          </div>)
      })}
      {!groups.length && <div className="im-card im-empty" style={{ padding: 20 }}>مدرکی با این فیلترها نیست.</div>}
    </div>
  )
}

function Detail({ x, can, lens, upd }: { x: EngDocRow; can: boolean; lens: EngLens; projectId: string; upd: (x: EngDocRow, p: Partial<EngDocRow>) => void }) {
  const [list, setList] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const load = () => void supabase.from('ex_doc_comments').select('id, author_name, author_role, body, created_at').eq('doc_id', x.id).order('created_at').then(({ data }) => setList((data ?? []) as Comment[]))
  useEffect(load, [x.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => { setErr(''); const { error } = await supabase.rpc('ex_doc_comment_add', { p_doc: x.id, p_body: text }); if (error) { setErr(error.code === '42501' ? 'فقط کارفرما، مشاور یا مدیر می‌تواند کامنت بگذارد.' : error.message); return } setText(''); load() }
  const facts: [string, string][] = [['Rev', x.rev], ['نوع مدرک', x.category], ['مرحله', x.phase], ['هدف صدور', x.targetIssue], ['پیمان', x.contract], ['مسئول تهیه', x.preparer], ['مسئول تأیید', x.approver]]
  return (
    <div style={{ display: 'grid', gap: 10, padding: '6px 4px' }}>
      <div style={{ display: 'flex', gap: '6px 18px', flexWrap: 'wrap', fontSize: 12 }}>{facts.filter(([, v]) => v).map(([k, v]) => <span key={k}><span className="sub">{k}: </span><b dir="auto">{v}</b></span>)}</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="ex-lab">وضعیت{can ? <select value={x.status} onChange={(e) => upd(x, { status: e.target.value as EngStatus })}>{STATUS_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : <b>{ENG_STATUS_LABEL_FA[x.status]}</b>}</label>
        <label className="ex-lab">تهیه — برنامه<b>{d(x.plannedPrepared)}</b></label>
        <label className="ex-lab">تهیه — واقعی{can ? <JalaliDateInput value={x.actualPrepared ?? ''} onChange={(v) => upd(x, { actualPrepared: v || null })} /> : <b>{d(x.actualPrepared)}</b>}</label>
        <label className="ex-lab">تأیید — برنامه<b>{d(x.plannedApproved)}</b></label>
        <label className="ex-lab">تأیید — واقعی{can ? <JalaliDateInput value={x.actualApproved ?? ''} onChange={(v) => upd(x, { actualApproved: v || null })} /> : <b>{d(x.actualApproved)}</b>}</label>
        {can && <label className="ex-lab">وزن<input type="number" min={0} step="0.5" defaultValue={x.weight} onBlur={(e) => Number(e.target.value) !== x.weight && upd(x, { weight: Number(e.target.value) || 0 })} style={{ width: 70 }} /></label>}
        {can && <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={x.critical} onChange={(e) => upd(x, { critical: e.target.checked })} /> بحرانی</label>}
      </div>
      {x.status === 'restricted' && (can ? <label className="ex-lab">محدودیت اجرایی<input defaultValue={x.restrictionNote} dir="auto" onBlur={(e) => e.target.value !== x.restrictionNote && upd(x, { restrictionNote: e.target.value })} /></label> : x.restrictionNote && <p className="im-helper" style={{ margin: 0 }}>محدودیت: {x.restrictionNote}</p>)}
      <label className="ex-lab">توضیح مدیریتی{can ? <input defaultValue={x.note} dir="auto" onBlur={(e) => e.target.value !== x.note && upd(x, { note: e.target.value })} /> : <span>{x.note || '—'}</span>}</label>
      <div style={{ display: 'grid', gap: 6 }}>
        <b style={{ fontSize: 12 }}><MessageSquare size={13} style={{ verticalAlign: -2 }} /> کامنت‌ها</b>
        {list.length === 0 && <span className="sub">کامنتی ثبت نشده است.</span>}
        {list.map((c) => <div key={c.id} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, background: c.author_role === 'employer' ? 'rgba(139,92,246,.12)' : 'rgba(14,165,233,.10)' }}><b>{c.author_name || '—'}</b> <span className="sub">({ROLE_FA[c.author_role] ?? c.author_role}) · {jalaliText(c.created_at.slice(0, 10))}</span><div dir="auto" style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div></div>)}
        {(lens === 'employer' || lens === 'consultant' || lens === 'manager') && (
          <div style={{ display: 'flex', gap: 6 }}><input dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={lens === 'employer' ? 'کامنت کارفرما (اختیاری)…' : 'کامنت…'} style={{ flex: 1 }} aria-label="کامنت" /><button className="im-btn im-btn-sm im-btn-primary" disabled={!text.trim()} onClick={() => void add()}>ثبت کامنت</button></div>
        )}
        {err && <span className="ex-bad" style={{ fontSize: 12 }}>{err}</span>}
      </div>
    </div>
  )
}
