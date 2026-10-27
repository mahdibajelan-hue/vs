import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { AlertTriangle, ChevronDown, FileDown, Loader2, Paperclip, Search } from 'lucide-react'
import { ShamsiDate } from '../../components/common/ShamsiField'
import { formatJalali } from '../../lib/jalali'
import { useAuthStore } from '../../store/useAuthStore'
import { usePssrStore } from './store/usePssrStore'
import type { SystemStatus } from './lib/pssrCore'
import { AREA_ORDER, CHECK_FA, KIND_FA, OFFICIAL_SOURCE, PRIORITY_COLOR, PRIORITY_FA, PUNCH_STATUS_FA, STARTUP_TYPES, SUMMARY_ITEMS, type CheckStatus, type PssrCheck, type PssrPunch, type PssrSystem, type Priority } from './types'

const fa = (n: number) => n.toLocaleString('fa-IR')
const jd = (d: string | null | undefined) => (d ? formatJalali(d.slice(0, 10)) : '—')
const ANSWERS: CheckStatus[] = ['ok', 'fail', 'na']
const TONE: Record<CheckStatus, string> = { pending: '#64748b', ok: '#10b981', fail: '#ef4444', na: '#0ea5e9' }

/** the form's header: startup type, PSSR team leader and review date — and, for a system still on the older sample list, the offer to load the official form */
export function FormHeader({ sys, official, locked }: { sys: PssrSystem; official: boolean; locked: boolean }) {
  const st = usePssrStore()
  const [h, setH] = useState({ startupType: sys.startupType, teamLead: sys.teamLead, reviewDate: sys.reviewDate ?? '' })
  const [busy, setBusy] = useState(false)
  useEffect(() => setH({ startupType: sys.startupType, teamLead: sys.teamLead, reviewDate: sys.reviewDate ?? '' }), [sys.startupType, sys.teamLead, sys.reviewDate])
  const dirty = h.startupType !== sys.startupType || h.teamLead !== sys.teamLead || (h.reviewDate || null) !== sys.reviewDate
  const hasOfficial = st.templates.some((t) => t.source === OFFICIAL_SOURCE && t.active)
  return (
    <div className="ps-stack">
      {!official && hasOfficial && (
        <div className="ps-hint is-warn" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <AlertTriangle size={14} aria-hidden /> این سیستم هنوز روی چک‌لیست نمونهٔ قبلی است. چک‌لیست رسمی PSSR خطوط لوله و تأسیسات وابسته (۲۰۸ بند با اولویت A/B/C) را بارگذاری کنید؛ بندهای پاسخ‌داده‌شدهٔ قبلی به‌عنوان سابقه می‌مانند.
          <button type="button" className="ps-btn is-primary" disabled={busy || locked} title={locked ? 'RFSU این سیستم صادر شده است' : undefined} onClick={async () => { setBusy(true); await st.loadOfficial(sys.id); setBusy(false) }}>{busy ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} بارگذاری چک‌لیست رسمی</button>
        </div>
      )}
      <div className="ps-grid">
        <label className="ps-field"><span>نوع راه‌اندازی</span><select value={h.startupType} onChange={(e) => setH({ ...h, startupType: e.target.value })}><option value="">—</option>{STARTUP_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="ps-field"><span>رهبر تیم PSSR</span><input value={h.teamLead} onChange={(e) => setH({ ...h, teamLead: e.target.value })} placeholder="نام و سمت" /></label>
        <div className="ps-field"><span>تاریخ بازدید PSSR</span><ShamsiDate clearable value={h.reviewDate} onChange={(v) => setH({ ...h, reviewDate: v })} label="تاریخ بازدید PSSR" /></div>
        <div className="ps-field" style={{ alignSelf: 'end' }}><button type="button" className="ps-btn" disabled={!dirty} onClick={() => st.saveHeader(sys.id, { startupType: h.startupType, teamLead: h.teamLead.trim(), reviewDate: h.reviewDate || null })}>ذخیرهٔ سربرگ</button></div>
      </div>
    </div>
  )
}

/**
 * The official checklist: grouped by area (اداری / محوطه / تأسیسات) and group, each item with its row number and priority,
 * answered on the form's three columns بلی / خیر / بدون کاربرد with a remark. A «خیر» opens a punch of the item's priority.
 */
export function OfficialChecklist({ systemId, advice }: { systemId: string; advice: (title: string) => string | null }) {
  const st = usePssrStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const list = useMemo(() => st.checks.filter((c) => c.systemId === systemId).sort((a, b) => (a.refNo ?? 999) - (b.refNo ?? 999) || a.seq - b.seq), [st.checks, systemId])
  const [q, setQ] = useState('')
  const [pri, setPri] = useState<Priority | ''>('')
  const [only, setOnly] = useState<'' | 'pending' | 'fail'>('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const shown = list.filter((c) => (!pri || c.priority === pri) && (!only || c.status === only) && (!q.trim() || c.title.includes(q.trim()) || String(c.refNo ?? '') === q.trim()))
  const areas = [...AREA_ORDER, ...new Set(list.map((c) => c.area).filter((a) => !AREA_ORDER.includes(a)))]
  const count = (l: PssrCheck[]) => ({ done: l.filter((c) => c.status !== 'pending').length, fail: l.filter((c) => c.status === 'fail').length, aOpen: l.filter((c) => c.priority === 'A' && (c.status === 'pending' || c.status === 'fail')).length })
  const all = count(list)
  return (
    <div className="ps-stack">
      <div className="ps-of-bar">
        <span className="ps-of-prog"><b>{fa(all.done)}</b> از {fa(list.length)} بند پاسخ داده شده · <span style={{ color: '#ef4444' }}>{fa(all.fail)} «خیر»</span> · <span style={{ color: PRIORITY_COLOR.A }}>{fa(all.aOpen)} بند A باز</span></span>
        <label className="ps-of-search"><Search size={13} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی متن یا شمارهٔ ردیف" /></label>
        <select value={pri} onChange={(e) => setPri(e.target.value as Priority | '')} aria-label="اولویت"><option value="">همهٔ اولویت‌ها</option>{(['A', 'B', 'C'] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_FA[p]}</option>)}</select>
        <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label="پاسخ"><option value="">همهٔ پاسخ‌ها</option><option value="pending">فقط پاسخ‌نداده</option><option value="fail">فقط «خیر»</option></select>
      </div>
      {areas.map((area) => {
        const inArea = shown.filter((c) => c.area === area); if (!inArea.length) return null
        const cats = [...new Set(inArea.map((c) => c.category))]
        return (
          <div key={area} className="ps-of-area">
            <h4>{area || 'سوابق چک‌لیست نمونهٔ قبلی'}</h4>
            {cats.map((cat) => {
              const items = inArea.filter((c) => c.category === cat), k = `${area}|${cat}`, n = count(list.filter((c) => c.area === area && c.category === cat))
              const isOpen = open[k] ?? (q.trim() !== '' || !!only || !!pri)
              return (
                <details key={k} className="ps-of-cat" open={isOpen} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; if (o !== isOpen) setOpen((x) => ({ ...x, [k]: o })) }}>
                  <summary><ChevronDown size={14} aria-hidden /><b>{cat}</b><span className="ps-of-meter"><i style={{ width: `${(n.done / Math.max(1, list.filter((c) => c.area === area && c.category === cat).length)) * 100}%` }} /></span><small>{fa(n.done)} / {fa(list.filter((c) => c.area === area && c.category === cat).length)}{n.fail ? ` · ${fa(n.fail)} خیر` : ''}{n.aOpen ? ` · ${fa(n.aOpen)} A باز` : ''}</small></summary>
                  {items.map((c) => <Item key={c.id} c={c} email={email} advice={advice(c.title)} punch={st.punches.find((p) => p.checkId === c.id)} />)}
                </details>
              )
            })}
          </div>
        )
      })}
      {!shown.length && <p className="ps-hint">بندی با این فیلتر نیست.</p>}
    </div>
  )
}

function Item({ c, email, advice, punch }: { c: PssrCheck; email: string; advice: string | null; punch?: PssrPunch }) {
  const st = usePssrStore()
  const [e, setE] = useState(c.evidence)
  const [busy, setBusy] = useState(false)
  useEffect(() => setE(c.evidence), [c.evidence])
  const save = async (s: CheckStatus, ev: string, file?: File) => {
    setBusy(true)
    const url = file ? await st.uploadScan(c.systemId, file) : undefined
    if (file && !url) { setBusy(false); return }
    await st.setCheck(c.id, s, ev, email, url)
    setBusy(false)
  }
  return (
    <div className={`ps-of-item is-${c.status}`}>
      <span className="ps-of-ref">{c.refNo != null ? fa(c.refNo) : '—'}</span>
      <span className="ps-of-pri" style={{ '--c': c.priority ? PRIORITY_COLOR[c.priority] : '#94a3b8' } as CSSProperties} title={c.priority ? PRIORITY_FA[c.priority] : c.mandatory ? 'بند الزامی چک‌لیست قبلی' : 'بند چک‌لیست قبلی'}>{c.priority || (c.mandatory ? '!' : '·')}</span>
      <div className="ps-of-text">
        <span>{c.title}</span>
        {advice && <small className={`ps-advice ${c.status === 'ok' ? 'is-strong' : ''}`}><AlertTriangle size={12} aria-hidden /> {advice}</small>}
        {punch && <small className="ps-meta">پانچ {punch.category}: {PUNCH_STATUS_FA[punch.status]}</small>}
        {(c.checkedBy || c.fileUrl) && <small className="ps-meta">{c.checkedBy ? `${c.checkedBy} · ${jd(c.checkedAt)}` : ''}{c.fileUrl && <> · <button type="button" className="ps-link" onClick={() => st.openScan(c.fileUrl!)}><Paperclip size={11} /> مدرک</button></>}</small>}
      </div>
      <div className="ps-of-ans" role="group" aria-label={`پاسخ بند ${c.refNo ?? ''}`}>
        {ANSWERS.map((k) => <button key={k} type="button" aria-pressed={c.status === k} disabled={busy} style={{ '--c': TONE[k] } as CSSProperties} onClick={() => save(c.status === k ? 'pending' : k, e)}>{CHECK_FA[k]}</button>)}
      </div>
      <input className="ps-of-note" value={e} onChange={(x) => setE(x.target.value)} onBlur={() => { if (e !== c.evidence) void save(c.status, e) }} placeholder="توضیحات" aria-label="توضیحات" />
      <label className="ps-of-file" title="پیوست مدرک / عکس">{busy ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}<input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={(x) => { const f = x.target.files?.[0]; x.target.value = ''; if (f) void save(c.status, e, f) }} /></label>
    </div>
  )
}

/** «جمع‌بندی»: the six confirmations the signatories make; all are needed before the RFSU chain opens */
export function SummaryBox({ sys, locked }: { sys: PssrSystem; locked: boolean }) {
  const st = usePssrStore()
  const done = SUMMARY_ITEMS.filter((x) => sys.summary[x.key]).length
  return (
    <div className="ps-of-summary">
      <b>جمع‌بندی ({fa(done)} از ۶): موارد زیر بررسی شده‌اند و امضاکنندگان تأیید می‌کنند تأسیسات / خطوط لولهٔ مورد بررسی برای راه‌اندازی آماده‌اند.</b>
      {SUMMARY_ITEMS.map((x, i) => (
        <label key={x.key} className="ps-checkbox"><input type="checkbox" disabled={locked} checked={!!sys.summary[x.key]} onChange={(e) => st.setSummary(sys.id, { ...sys.summary, [x.key]: e.target.checked })} /> {fa(i + 1)}- {x.label}</label>
      ))}
    </div>
  )
}

/** the official form on paper: header, recommendations (the punches), summary, signatories, then the checklist with its three answer columns */
export function printOfficialForm(sys: PssrSystem, status: SystemStatus, checks: PssrCheck[], punches: PssrPunch[], projectName: string) {
  const w = window.open('', '_blank', 'width=1000,height=1200')
  if (!w) return
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
  const mark = (c: PssrCheck, k: CheckStatus) => (c.status === k ? '✓' : '')
  const sorted = checks.slice().sort((a, b) => (a.refNo ?? 999) - (b.refNo ?? 999))
  const groups: string[] = []
  let last = ''
  for (const c of sorted) {
    const g = `${c.area} — ${c.category}`
    if (g !== last) { groups.push(`<tr class="g"><td colspan="7">${esc(g)}</td></tr>`); last = g }
    groups.push(`<tr><td>${c.refNo != null ? fa(c.refNo) : ''}</td><td class="t">${esc(c.title)}</td><td>${esc(c.priority || '')}</td><td>${mark(c, 'ok')}</td><td>${mark(c, 'fail')}</td><td>${mark(c, 'na')}</td><td class="t">${esc(c.evidence)}</td></tr>`)
  }
  const recs = punches.map((p, i) => `<tr><td>${fa(i + 1)}</td><td class="t">${esc(p.title)}</td><td>${esc(jd(p.closedAt ?? p.dueDate))}</td><td>${esc(PUNCH_STATUS_FA[p.status])} (${p.category})</td></tr>`).join('') || '<tr><td colspan="4">—</td></tr>'
  const signs = status.chain.flatMap((c) => c.persons.map((p) => `<tr><td>${fa(c.seq)}</td><td>${esc(c.manual && p.manualSigner ? `${p.manualSigner} — ${c.label}` : `${p.label} — ${c.label}`)}</td><td>${p.state === 'signed' ? esc(p.by ?? '✓') : ''}</td><td>${p.state === 'signed' ? esc(jd(c.manual ? p.manualSignedOn : p.at)) : ''}</td></tr>`)).join('')
  w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>PSSR ${esc(sys.code)}</title>
  <style>body{font-family:Vazirmatn,Tahoma,sans-serif;margin:24px;color:#0f172a;font-size:12px}h1{font-size:17px;text-align:center;margin:0 0 10px}
  table{width:100%;border-collapse:collapse;margin:8px 0 14px}td,th{border:1px solid #64748b;padding:5px 6px;text-align:center;vertical-align:top}th{background:#e2e8f0}td.t{text-align:right}
  tr.g td{background:#f1f5f9;font-weight:800;text-align:right}.h td{text-align:right}h3{font-size:13px;margin:12px 0 4px}@media print{tr{page-break-inside:avoid}}</style></head><body>
  <h1>فرم کامل چک‌لیست‌های PSSR برای خطوط لوله و تأسیسات وابسته</h1>
  <table class="h"><tr><td><b>نوع راه‌اندازی:</b> ${esc(sys.startupType || '—')}</td><td><b>عنوان پروژه:</b> ${esc(sys.code)} — ${esc(sys.name)} (${esc(KIND_FA[sys.kind])})</td><td><b>عنوان طرح:</b> ${esc(projectName)}</td></tr>
  <tr><td><b>تاریخ:</b> ${esc(jd(sys.reviewDate))}</td><td colspan="2"><b>رهبر تیم PSSR:</b> ${esc(sys.teamLead || '—')}</td></tr></table>
  <h3>پیشنهادات</h3><table><tr><th>شماره</th><th>شرح</th><th>تاریخ اتمام کار</th><th>نتیجه</th></tr>${recs}</table>
  <h3>جمع‌بندی: موارد زیر بررسی شده‌اند و امضاکنندگان تأیید می‌کنند تأسیسات / خطوط لولهٔ مورد بررسی برای راه‌اندازی آماده‌اند.</h3>
  <table>${SUMMARY_ITEMS.map((x, i) => `<tr><td style="width:30px">${sys.summary[x.key] ? '✓' : ''}</td><td class="t">${fa(i + 1)}- ${esc(x.label)}</td></tr>`).join('')}</table>
  <h3>امضاکنندگان</h3><table><tr><th>ردیف</th><th>نام و نام خانوادگی / سمت</th><th>امضا</th><th>تاریخ</th></tr>${signs}</table>
  <table><tr><th>ردیف</th><th>شرح</th><th>اولویت</th><th>بلی</th><th>خیر</th><th>بدون کاربرد</th><th>توضیحات</th></tr>${groups.join('')}</table>
  <script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}

