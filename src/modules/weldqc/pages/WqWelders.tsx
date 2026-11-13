import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeft, Award, CalendarCheck2, CircleCheckBig, Flame, Layers, Medal, Printer, Search, ShieldAlert, Sparkles, User } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useWqStore } from '../store/useWqStore'
import * as repo from '../repo'
import { codeOf, fa, faDate, monthKey, monthLabel, useQc, weldLabel, type WelderStat } from '../lib/useQc'
import { CODE_FA, CODE_TYPE, type Code } from '../lib/api1104'
import { DEFECT_COLOR, PASS_FA, VERDICT_FA } from '../lib/rules'
import { PASSES } from '../lib/crew'
import { welderTrends, sameJoint, type ICrewSeg } from '../lib/insights'
import { useModuleStore } from '../../../store/useModuleStore'
import { usePersonnelStore } from '../../competency/store/usePersonnelStore'
import { useRemembered } from '../../../lib/navMemory'
import { clearFocusWelder, peekFocusWelder } from '../lib/handoff'

/** the competency module's ID card carries «RASTA|WC|stamp|stamp»; the performance card shows the same code */
const cardPayload = (raw: string) => `RASTA|WC|${raw}|${raw}`
/** open this person's qualification file (WQT, card) in the competency module */
export function openQualification(welderId: string) { usePersonnelStore.setState({ focus: welderId }); useModuleStore.getState().enterModule('competency', undefined, 'personnel') }

const tone = (p: number | null) => (p == null ? '#64748b' : p > 10 ? '#ef4444' : p > 5 ? '#f59e0b' : '#22c55e')

function Gauge({ value, label, good, suffix = '٪', digits = 1 }: { value: number | null; label: string; good: 'high' | 'low'; suffix?: string; digits?: number }) {
  const r = 34, C = 2 * Math.PI * r, f = value == null ? 0 : Math.min(1, value / 100)
  const c = value == null ? '#64748b' : good === 'high' ? (value >= 95 ? '#22c55e' : value >= 85 ? '#f59e0b' : '#ef4444') : (value <= 3 ? '#22c55e' : value <= 8 ? '#f59e0b' : '#ef4444')
  return (
    <div className="wc-gauge" style={{ '--c': c } as CSSProperties}>
      <small>{label}</small>
      <div className="wc-gauge-ring" role="img" aria-label={`${label}: ${value == null ? 'بدون داده' : fa(value, digits) + suffix}`}>
        <svg viewBox="0 0 80 80" aria-hidden><circle cx="40" cy="40" r={r} className="wc-track" /><circle cx="40" cy="40" r={r} className="wc-fill" strokeDasharray={`${C * (good === 'low' ? Math.min(1, f * 5) : f)} ${C}`} transform="rotate(-90 40 40)" /></svg>
        <b>{value == null ? '—' : fa(value, digits)}<i>{value == null ? '' : suffix}</i></b>
      </div>
    </div>
  )
}

function Donut({ parts }: { parts: { label: string; n: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0), r = 40, C = 2 * Math.PI * r
  let off = 0
  return (
    <div className="wc-donut">
      <svg viewBox="0 0 100 100" role="img" aria-label="ترکیب ناپیوستگی‌های منسوب">{total ? parts.map((p) => { const f = p.n / total; const el = <circle key={p.label} cx="50" cy="50" r={r} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${C * f} ${C}`} strokeDashoffset={-C * off} transform="rotate(-90 50 50)" />; off += f; return el }) : <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border-soft)" strokeWidth="16" />}</svg>
      <ul>{parts.map((p) => <li key={p.label}><i style={{ background: p.color }} />{p.label}<b>{fa((p.n / Math.max(1, total)) * 100)}٪</b></li>)}{!total && <li>ناپیوستگی منسوبی ندارد</li>}</ul>
    </div>
  )
}

function Trend({ points }: { points: { label: string; rate: number; n: number }[] }) {
  if (!points.length) return <p className="ps-hint">هنوز سابقهٔ رادیوگرافی ندارد.</p>
  const W = 300, H = 120, max = Math.max(5, ...points.map((p) => p.rate)), x = (i: number) => 24 + (i * (W - 40)) / Math.max(1, points.length - 1), y = (v: number) => H - 22 - (v / max) * (H - 40)
  return (
    <svg className="wc-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="روند نرخ تعمیر ماهانه">
      {[0, max / 2, max].map((v) => <g key={v}><line x1="22" x2={W - 8} y1={y(v)} y2={y(v)} className="wc-gl" /><text x="18" y={y(v) + 3} className="wc-axis" textAnchor="end">{fa(v, 0)}</text></g>)}
      <polyline points={points.map((p, i) => `${x(i)},${y(p.rate)}`).join(' ')} className="wc-line" />
      {points.map((p, i) => <g key={p.label}><circle cx={x(i)} cy={y(p.rate)} r="4" className="wc-pt"><title>{`${p.label}: ${fa(p.rate, 1)}٪ از ${fa(p.n)} سرجوش`}</title></circle><text x={x(i)} y={H - 6} className="wc-axis" textAnchor="middle">{p.label}</text></g>)}
    </svg>
  )
}

/** کارت صلاحیت و عملکرد جوشکار — qualification from the register, performance from the radiographs of the welds he worked on */
function WelderCard({ s, onOpen }: { s: WelderStat; onOpen: (id: string) => void }) {
  const st = useWqStore(); const q = useQc()
  const w = st.welders.find((x) => x.key === s.key)
  const quals = w ? st.quals.filter((x) => x.welderId === w.id && x.status !== 'revoked') : []
  const today = new Date().toISOString().slice(0, 10)
  const valid = quals.filter((x) => (!x.expiryDate || x.expiryDate >= today) && (!x.issueDate || x.issueDate <= today))
  const main = valid[0] ?? quals[0]
  const [photo, setPhoto] = useState('')
  useEffect(() => { let off = false; setPhoto(''); if (w?.hasPhoto) void repo.welderPhoto(w.id).then((p) => { if (!off) setPhoto(p) }); return () => { off = true } }, [w?.id, w?.hasPhoto])
  const mine = st.defects.filter((d) => !d.removed && d.welders.includes(s.key))
  const byCode = new Map<string, number>(); for (const d of mine) { const c = codeOf(d) || 'other'; byCode.set(c, (byCode.get(c) ?? 0) + 1) }
  const parts = [...byCode].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ label: c === 'other' ? 'سایر' : CODE_FA[c as Code], n, color: c === 'other' ? '#64748b' : DEFECT_COLOR[CODE_TYPE[c as Code]] }))
  const months = useMemo(() => {
    const m = new Map<string, { n: number; rep: number }>(); for (const r of s.results) { const k = monthKey(r.at.slice(0, 10)); const x = m.get(k) ?? { n: 0, rep: 0 }; x.n++; if (r.repaired) x.rep++; m.set(k, x) }
    return [...m].sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([k, v]) => ({ label: monthLabel(k), rate: (v.rep / v.n) * 100, n: v.n }))
  }, [s.results])
  const byPass = new Map<string, number>(); for (const d of mine) if (d.pass) byPass.set(d.pass, (byPass.get(d.pass) ?? 0) + 1)
  const myRepairs = st.repairs.filter((r) => r.performedBy === s.key)
  const top = s.rank != null && s.of >= 5 && s.score >= 85 && s.rank <= Math.max(1, Math.ceil(s.of * 0.1))
  const valFrac = main?.issueDate && main.expiryDate ? Math.max(0, Math.min(1, (Date.parse(main.expiryDate) - Date.now()) / (Date.parse(main.expiryDate) - Date.parse(main.issueDate)))) : null
  const lastInspector = [...st.evaluations].reverse().find((e) => e.signedName && s.results.some((r) => r.weldId === e.weldId))?.signedName
  const warn = useMemo(() => {
    const t = welderTrends(s.results.map((r) => ({ key: s.key, ...r })), q.projectRate, q.nameOf)
    const segs: ICrewSeg[] = st.crew.filter((c) => !c.removed && c.quadrant > 0).map((c) => ({ weldId: c.weldId, welder: c.welderKey, pass: c.pass, quadrant: c.quadrant }))
    const pair = sameJoint(segs, st.defects.map((d) => ({ weldId: d.weldId, code: codeOf(d), type: d.type, clock: d.clock, pass: d.pass, quadrant: d.quadrant, welders: d.welders, round: d.round, verdict: d.verdict, removed: d.removed })), q.nameOf).filter((x) => x.welder === s.key)
    return [...t, ...pair]
  }, [s, st.crew, st.defects, q])
  return (
    <article className="wc wq-rise" aria-label={`کارت عملکرد ${q.nameOf(s.key)}`}>
      <aside className="wc-side">
        <div className="wc-photo">{photo ? <img src={photo} alt={`عکس ${q.nameOf(s.key)}`} /> : <User size={64} aria-hidden />}</div>
        {top ? <div className="wc-badge"><Medal size={38} aria-hidden /><b>جوشکار برتر</b><small>{fa(Math.max(1, Math.round((s.rank! / s.of) * 100)))}٪ بالای جوشکاران پروژه</small></div>
          : <div className="wc-badge is-plain"><Award size={34} aria-hidden /><b>امتیاز کیفیت</b><small>{s.score == null ? 'بدون داده' : `${fa(s.score)} از ۱۰۰`}</small></div>}
        <div className="wc-rank"><small>رتبه</small><b>{s.rank == null ? '—' : `#${fa(s.rank)}`}</b><small>{s.rank == null ? 'کمتر از ۳ سرجوش رادیوگرافی‌شده' : `از ${fa(s.of)} جوشکار`}</small></div>
      </aside>
      <div className="wc-main">
        <header className="wc-head">
          <div><h2>{w?.kind === 'coater' ? 'پوشش‌کار' : 'جوشکار'}</h2><p>کارت عملکرد حین اجرا{w ? <> · <button type="button" className="wc-qlink no-print" onClick={() => openQualification(w.id)}>پروندهٔ صلاحیت و کارت شناسایی <ArrowLeft size={12} aria-hidden /></button></> : null}</p></div>
          <span className={`wc-status ${w?.status === 'active' ? 'is-ok' : 'is-bad'}`}><CircleCheckBig size={16} aria-hidden /> {w ? (w.status === 'active' ? 'فعال' : w.status === 'suspended' ? 'تعلیق' : 'خروج') : 'خارج از فهرست'}</span>
          <div className="wc-qr"><QRCodeSVG value={cardPayload(w?.raw || s.key)} size={84} level="M" marginSize={0} /><small>اسکن برای اعتبارسنجی</small></div>
        </header>
        <dl className="wc-facts">
          <div><dt>نام</dt><dd>{q.nameOf(s.key) !== s.key ? q.nameOf(s.key) : '—'}</dd></div><div><dt>مهر</dt><dd className="ps-code">{s.key}</dd></div>
          <div><dt>شمارهٔ کارت</dt><dd>{w?.cardNo || '—'}</dd></div><div><dt>فرایند</dt><dd>{[...new Set(quals.map((x) => x.process).filter(Boolean))].join(' + ') || '—'}</dd></div>
          <div><dt>آخرین جوش</dt><dd>{faDate(s.lastWeld || null)}</dd></div><div><dt>آخرین بازرس</dt><dd>{lastInspector || '—'}</dd></div>
        </dl>
        <div className="wc-kpis">
          <Gauge value={s.fpy == null ? null : s.fpy * 100} label="قبولی در اولین رادیوگرافی" good="high" />
          <Gauge value={s.repairRate == null ? null : s.repairRate * 100} label="نرخ تعمیر" good="low" />
          <Gauge value={s.rejectRate == null ? null : s.rejectRate * 100} label="نرخ برش (ریجکت)" good="low" />
          <div className="wc-score" style={{ '--c': s.score == null ? '#64748b' : s.score >= 90 ? '#22c55e' : s.score >= 75 ? '#84cc16' : s.score >= 60 ? '#f59e0b' : '#ef4444' } as CSSProperties}><small>امتیاز کیفیت</small><div><b>{s.score == null ? '—' : fa(s.score)}</b><i>/۱۰۰</i></div></div>
          <div className="wc-count"><small>سرجوش کار شده</small><Flame size={28} aria-hidden /><b>{fa(s.welds)}</b><i>{fa(s.evaluated)} رادیوگرافی‌شده</i></div>
        </div>
        <div className="wc-qual">
          <div><dt>گروه مواد</dt><dd>{main?.materialGroup || '—'}</dd></div>
          <div><dt>محدودهٔ ضخامت</dt><dd>{main ? `${fa(main.thkMin, 1)} تا ${fa(main.thkMax, 1)} mm` : '—'}</dd></div>
          <div><dt>محدودهٔ قطر</dt><dd>{main ? `${fa(main.diaMin, 1)} تا ${fa(main.diaMax, 1)} in` : '—'}</dd></div>
          <div><dt>وضعیت‌ها</dt><dd>{[...new Set(quals.map((x) => x.position).filter(Boolean))].join(' / ') || '—'}</dd></div>
          <div><dt>تاریخ آزمون</dt><dd>{faDate(main?.issueDate)}</dd></div>
          <div><dt>اعتبار تا</dt><dd>{faDate(main?.expiryDate)}</dd></div>
          {valFrac != null && <div className="wc-valid"><i style={{ '--w': `${valFrac * 100}%`, '--c': valFrac > 0.25 ? '#22c55e' : valFrac > 0 ? '#f59e0b' : '#ef4444' } as CSSProperties} /><b>{fa(valFrac * 100)}٪ اعتبار باقی‌مانده</b></div>}
          {!quals.length && <p className="ps-hint is-warn">گواهی صلاحیتی (WQT) برای این جوشکار در ماژول «ارزیابی صلاحیت» ثبت نشده است؛ آزمون و کارت شناسایی از همان‌جا صادر می‌شود.</p>}
          {valid.length > 0 && <span className="wc-stamp" aria-label="جوشکار دارای صلاحیت">جوشکار<br />دارای صلاحیت</span>}
        </div>
      </div>
      <div className="wc-bottom">
        <section><h4>ترکیب ناپیوستگی‌های منسوب</h4><Donut parts={parts.slice(0, 6)} /></section>
        <section><h4>روند نرخ تعمیر (۶ ماه)</h4><Trend points={months} /></section>
        <section><h4><Layers size={14} aria-hidden /> به تفکیک پاس</h4><ul className="wq-bars">{PASSES.map((p) => { const n = byPass.get(p) ?? 0; return <li key={p}><span>{PASS_FA[p]}</span><i style={{ '--w': `${mine.length ? (n / mine.length) * 100 : 0}%`, '--c': '#8b5cf6' } as CSSProperties} /><b>{fa(n)}</b></li> })}</ul>
          {myRepairs.length > 0 && <p className="ps-meta">{fa(myRepairs.length)} تعمیر توسط این جوشکار انجام شده.</p>}</section>
      </div>
      {warn.length > 0 && <div className="wc-ai">{warn.map((x) => <p key={x.id} className={`is-${x.tone}`}><Sparkles size={15} aria-hidden /><span><b>{x.title}</b>{x.body}</span></p>)}</div>}
      {mine.length > 0 && <details className="wc-list"><summary>{fa(mine.length)} ناپیوستگی منسوب</summary><ul className="wq-list">{mine.map((d) => { const wd = st.welds.find((x) => x.id === d.weldId); const c = codeOf(d); return (
        <li key={d.id}><button type="button" onClick={() => onOpen(d.weldId)}><b>{wd ? weldLabel(wd) : '—'}</b><span className="wq-dtype" style={{ '--c': DEFECT_COLOR[c ? CODE_TYPE[c] : d.type] } as CSSProperties}>{c ? CODE_FA[c] : d.type}</span><span className="ps-meta">{fa(d.lengthMm, 1)} mm · {d.pass ? PASS_FA[d.pass] : '—'}{d.clock != null ? ` · ساعت ${fa(d.clock, 1)}` : ''} · {d.round ? `RS${fa(d.round)}` : 'RT'}{d.verdict ? ` · ${VERDICT_FA[d.verdict]}` : ''}</span><ArrowLeft size={14} aria-hidden /></button></li>
      ) })}</ul></details>}
    </article>
  )
}

/** جوشکاران — ranked by quality score; each opens the performance card */
export function WqWelders({ onOpen }: { onOpen: (id: string) => void }) {
  const st = useWqStore(); const q = useQc()
  const [sel, setSel] = useRemembered<string | null>('welderCard', null, (v) => v === null || typeof v === 'string'), [text, setText] = useState('') // survives the reload of the project's records
  // a welder another module asked for: open the card once this project's records hold them
  useEffect(() => { const k = peekFocusWelder(); if (k && q.welderStats.has(k)) setSel(k) }, [q.welderStats]) // kept until the user moves on: the records may reload and remount this page
  const list = useMemo(() => [...q.welderStats.values()].filter((s) => !s.applicator).filter((s) => !text || `${s.key} ${q.nameOf(s.key)}`.includes(text)).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.welds - a.welds), [q, text])
  const cur = sel ? q.welderStats.get(sel) ?? null : null
  if (cur) return (
    <div className="wq-welders">
      <div className="wq-toolbar no-print"><button type="button" className="ps-btn is-ghost" onClick={() => { clearFocusWelder(); setSel(null) }}>همهٔ جوشکاران</button><button type="button" className="ps-btn" onClick={() => window.print()}><Printer size={14} aria-hidden /> چاپ کارت</button></div>
      <WelderCard s={cur} onOpen={onOpen} />
    </div>
  )
  return (
    <div className="wq-welders">
      <div className="wq-toolbar">
        <label className="wq-search"><Search size={15} aria-hidden /><input value={text} onChange={(e) => setText(e.target.value)} placeholder="جستجوی مهر یا نام جوشکار" aria-label="جستجوی جوشکار" /></label>
        <p className="ps-meta">نرخ تعمیر پروژه: <b>{fa(q.projectRate * 100, 1)}٪</b> · امتیاز کیفیت = قبولی در اولین رادیوگرافی (هموارشده) − ۲×درصد برش − ۰٫۵×نقص‌های حاد در هر ۱۰۰ سرجوش</p>
      </div>
      {!list.length ? <p className="ps-hint">هنوز جوشکاری با مهر ثبت‌شده در گزارش جوشکاری نیست.</p> : (
        <ul className="wc-grid">{list.map((s, k) => (
          <li key={s.key} style={{ '--i': Math.min(k, 12) } as CSSProperties} className="wq-rise">
            <button type="button" onClick={() => setSel(s.key)} aria-label={`کارت عملکرد ${q.nameOf(s.key)}`}>
              <span className="wc-mini-rank">{s.rank == null ? '—' : `#${fa(s.rank)}`}</span>
              <span className="wc-mini-id"><b>{q.nameOf(s.key) !== s.key ? q.nameOf(s.key) : 'جوشکار'}</b><small className="ps-code">{s.key}</small></span>
              <span className="wc-mini-k"><small>امتیاز</small><b style={{ color: s.score == null ? undefined : s.score >= 90 ? '#16a34a' : s.score >= 75 ? '#65a30d' : s.score >= 60 ? '#d97706' : '#dc2626' }}>{fa(s.score)}</b></span>
              <span className="wc-mini-k"><small>قبولی اول</small><b>{s.fpy == null ? '—' : `${fa(s.fpy * 100, 1)}٪`}</b></span>
              <span className="wc-mini-k"><small>نرخ تعمیر</small><b style={{ color: tone(s.repairRate == null ? null : s.repairRate * 100) }}>{s.repairRate == null ? '—' : `${fa(s.repairRate * 100, 1)}٪`}</b></span>
              <span className="wc-mini-k"><small>سرجوش</small><b>{fa(s.welds)}</b></span>
              {st.welders.find((w) => w.key === s.key)?.status === 'suspended' ? <ShieldAlert size={16} className="wc-warn" aria-label="تعلیق" /> : <CalendarCheck2 size={16} aria-hidden className="wc-ok" />}
            </button>
          </li>
        ))}</ul>
      )}
    </div>
  )
}
