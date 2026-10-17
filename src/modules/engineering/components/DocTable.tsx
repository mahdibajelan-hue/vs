import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { supabase } from '../../../lib/supabaseClient'
import { jalaliText } from '../../execution/lib/periods'
import type { EpcModel } from '../../execution/lib/useEpcModel'
import { ENG_STATUS_LABEL_FA, type EngDocRow, type EngStatus } from '../../execution/epcTypes'
import { Chip } from '../../finance/components/fn'
import { Bar, fa, pct } from '../../execution/components/common'
import { COURT_COLOR, COURT_LABEL_FA, courtOf, type EngLens } from '../lib/roles'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const TONE: Partial<Record<EngStatus, 'good' | 'warn' | 'bad'>> = { approved: 'good', restricted: 'warn' }
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
    <div className="im-card" style={{ padding: 0 }}><div className="fn-tbl-wrap" style={{ maxHeight: 620 }}>
      <table className="ex-lines"><thead><tr><th>شناسه</th><th>عنوان</th><th className="num">وزن</th><th className="num">هزینه (ریال)</th><th>وضعیت</th><th>توپ دست</th></tr></thead>
        <tbody>{groups.map(([disc, rows]) => {
          const w = rows.filter(live).reduce((a, x) => a + x.weight, 0), done = rows.filter((x) => x.status === 'approved').reduce((a, x) => a + x.weight, 0)
          const closed = shut.has(disc)
          return (
            <Fragment key={disc}>
              <tr onClick={() => toggle(disc)} style={{ cursor: 'pointer', background: 'rgba(14,165,233,.10)' }}>
                <td colSpan={2}><b>{closed ? <ChevronLeft size={14} style={{ verticalAlign: -2 }} /> : <ChevronDown size={14} style={{ verticalAlign: -2 }} />} {disc}</b> <small className="sub">{fa(rows.length)} مدرک</small></td>
                <td className="num"><b>{fa(w, 2)}</b><small className="sub" style={{ display: 'block' }}>{sumW ? pct(w / sumW, 1) : '—'} کل</small></td>
                <td className="num"><b>{money(sumW > 0 && total > 0 ? (w / sumW) * total : null)}</b></td>
                <td colSpan={2} style={{ minWidth: 150 }}><Bar value={w ? done / w : 0} /><small className="sub">پیشرفت وزنی {pct(w ? done / w : 0, 0)}</small></td>
              </tr>
              {!closed && rows.map((x) => {
                const c = courtOf(x.status), fc = m.docFc.get(x.id), isOpen = open === x.id
                return (
                  <Fragment key={x.id}>
                    <tr className={x.status === 'approved' ? 'locked' : undefined}>
                      <td className="fn-code">{x.docNo}{x.critical && <Chip tone="bad">بحرانی</Chip>}</td>
                      <td style={{ minWidth: 220, whiteSpace: 'normal' }}><button type="button" onClick={() => setOpen(isOpen ? '' : x.id)} aria-expanded={isOpen} style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline dotted' }}>{x.title || x.docNo}</button>{fc?.overdue && <small className="ex-bad" style={{ display: 'block' }}>{fa(fc.overdueDays)} روز دیرکرد</small>}</td>
                      <td className="num">{fa(x.weight, 2)}</td><td className="num">{money(cost(x))}</td>
                      <td>{TONE[x.status] ? <Chip tone={TONE[x.status]!}>{ENG_STATUS_LABEL_FA[x.status]}</Chip> : <span className="sub">{ENG_STATUS_LABEL_FA[x.status]}</span>}</td>
                      <td>{c === 'done' ? <span className="sub">—</span> : <span style={{ color: COURT_COLOR[c], fontWeight: 700 }}>{COURT_LABEL_FA[c]}</span>}</td>
                    </tr>
                    {isOpen && <tr><td colSpan={6} style={{ background: 'rgba(148,163,184,.08)', whiteSpace: 'normal' }}><Detail x={x} can={can} lens={lens} projectId={projectId} upd={upd} /></td></tr>}
                  </Fragment>)
              })}
            </Fragment>)
        })}
          {!groups.length && <tr><td colSpan={6} className="sub">مدرکی با این فیلترها نیست.</td></tr>}</tbody></table></div></div>
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
        <b style={{ fontSize: 12 }}>کامنت‌ها</b>
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
