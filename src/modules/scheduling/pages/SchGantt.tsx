import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, Search } from 'lucide-react'
import { addDays, daysBetween, jalaliText, monthOf } from '../../execution/lib/periods'
import { Chip, Section } from '../../finance/components/fn'
import { fa } from '../../execution/components/common'
import { LINK_LABEL_FA, type SchActivity } from '../lib/types'
import type { LiveModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'
import type { SchTab } from '../SchedulingApp'

const ROW = 28, HEAD = 40, LEFT = 330
const d = (x: string | null) => (x ? jalaliText(x) : '—')
const COLORS = { critical: '#ef4444', normal: '#3b82f6', complete: '#22c55e', near: '#f59e0b' }
type Line = { kind: 'group'; key: string; label: string; count: number; start: string | null; finish: string | null } | { kind: 'act'; a: SchActivity }

/** Gantt: baseline (thin grey) under the forecast / planned bar, critical work in red, progress fill, data-date line, optional relation lines, WBS groups, filters and a detail panel. Only the visible rows are drawn. */
export function SchGantt({ m, go }: { projectId: string; m: LiveModel; go: (t: SchTab) => void }) {
  const acts = m.cur!.activities
  const [q, setQ] = useState('')
  const [onlyCrit, setOnlyCrit] = useState(false), [onlyBlocked, setOnlyBlocked] = useState(false), [onlyOpen, setOnlyOpen] = useState(false)
  const [rel, setRel] = useState(false)
  const [useForecast, setUseForecast] = useState(true)
  const [px, setPx] = useState(4)
  const [shut, setShut] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<string>('')
  const [scrollTop, setScrollTop] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const baseByUid = useMemo(() => new Map((m.base?.activities ?? []).map((a) => [a.uid, a])), [m.base])
  const actualByCode = useMemo(() => new Map(m.progress.rows.map((r) => [r.code, r])), [m.progress.rows])
  const groupOf = (a: SchActivity) => (a.wbsPath ? a.wbsPath.split(' / ')[1] ?? a.wbsPath.split(' / ')[0] : a.wbsCode.split(/[.\-/]/)[0]) || 'بدون WBS'
  const groups = useMemo(() => [...new Set(acts.map(groupOf))], [acts]) // eslint-disable-line react-hooks/exhaustive-deps
  const [wbs, setWbs] = useState('')
  const dates = (a: SchActivity) => {
    const f = m.forecast.byId.get(a.id)
    return useForecast && f?.start && f.finish ? { s: f.start, f: f.finish } : { s: a.plannedStart ?? a.actualStart, f: a.plannedFinish ?? a.actualFinish }
  }
  const lines: Line[] = useMemo(() => {
    const n = q.trim().toLowerCase()
    const keep = acts.filter((a) => {
      if (wbs && groupOf(a) !== wbs) return false
      if (n && !`${a.code} ${a.name}`.toLowerCase().includes(n)) return false
      const r = m.forecast.byId.get(a.id)
      if (onlyCrit && !r?.critical) return false
      if (onlyOpen && r?.status === 'complete') return false
      if (onlyBlocked && m.integration.get(a.uid)?.readiness !== 'blocked') return false
      return true
    })
    const byG = new Map<string, SchActivity[]>()
    for (const a of keep) { const g = groupOf(a); byG.set(g, [...(byG.get(g) ?? []), a]) }
    const out: Line[] = []
    for (const [g, list] of byG) {
      const ds = list.map((a) => dates(a)).filter((x) => x.s && x.f)
      out.push({ kind: 'group', key: g, label: g, count: list.length, start: ds.map((x) => x.s!).sort()[0] ?? null, finish: ds.map((x) => x.f!).sort().pop() ?? null })
      if (!shut.has(g)) for (const a of list) out.push({ kind: 'act', a })
    }
    return out
  }, [acts, q, wbs, onlyCrit, onlyBlocked, onlyOpen, shut, useForecast, m.forecast, m.integration]) // eslint-disable-line react-hooks/exhaustive-deps

  const range = useMemo(() => {
    const ds: string[] = []
    for (const a of acts) { const x = dates(a); if (x.s) ds.push(x.s); if (x.f) ds.push(x.f); const b = baseByUid.get(a.uid); if (b?.plannedStart) ds.push(b.plannedStart); if (b?.plannedFinish) ds.push(b.plannedFinish) }
    ds.push(m.dataDate)
    const s = ds.sort()
    return { min: addDays(s[0], -7), max: addDays(s[s.length - 1], 14) }
  }, [acts, baseByUid, useForecast, m.forecast, m.dataDate]) // eslint-disable-line react-hooks/exhaustive-deps
  const days = daysBetween(range.min, range.max) + 1
  const W = Math.max(600, days * px)
  const x = (iso: string) => daysBetween(range.min, iso) * px
  const months = useMemo(() => { const out: { label: string; x: number; w: number }[] = []; let c = range.min, g = 0; while (c <= range.max && g++ < 400) { const mo = monthOf(c); const to = mo.to < range.max ? mo.to : range.max; out.push({ label: mo.label, x: Math.max(0, daysBetween(range.min, c < mo.from ? mo.from : c)) * px, w: (daysBetween(c, to) + 1) * px }); c = addDays(mo.to, 1) } return out }, [range, px])
  const H = lines.length * ROW
  const first = Math.max(0, Math.floor(scrollTop / ROW) - 6), last = Math.min(lines.length, Math.ceil((scrollTop + 620) / ROW) + 6)
  const rowOf = useMemo(() => { const mp = new Map<string, number>(); lines.forEach((l, i) => { if (l.kind === 'act') mp.set(l.a.id, i) }); return mp }, [lines])
  const selA = acts.find((a) => a.id === sel)
  const toggle = (g: string) => setShut((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n })

  const bar = (a: SchActivity, i: number) => {
    const { s, f } = dates(a); if (!s || !f) return null
    const r = m.forecast.byId.get(a.id)
    const color = r?.status === 'complete' ? COLORS.complete : r?.critical ? COLORS.critical : r?.nearCritical ? COLORS.near : COLORS.normal
    const y = i * ROW
    const b = baseByUid.get(a.uid)
    const prog = actualByCode.get(a.code)?.actual ?? (r?.status === 'complete' ? 100 : null)
    const x1 = x(s), x2 = x(f) + px
    return (
      <g key={a.id} onClick={() => setSel(a.id)} style={{ cursor: 'pointer' }}>
        <rect x={0} y={y} width={W} height={ROW} fill={a.id === sel ? 'rgba(14,165,233,.14)' : 'transparent'} />
        {b?.plannedStart && b.plannedFinish && <rect x={x(b.plannedStart)} y={y + 19} width={Math.max(2, x(b.plannedFinish) + px - x(b.plannedStart))} height={4} rx={2} fill="#94a3b8" opacity={0.8}><title>خط مبنا: {d(b.plannedStart)} تا {d(b.plannedFinish)}</title></rect>}
        {a.type === 'milestone' ? <path d={`M${x1 + px / 2} ${y + 5} l7 7 l-7 7 l-7 -7 z`} fill={color}><title>{a.code} — {d(s)}</title></path> : (
          <>
            <rect x={x1} y={y + 5} width={Math.max(3, x2 - x1)} height={13} rx={3} fill={color} opacity={0.35}><title>{a.code} {a.name}: {d(s)} تا {d(f)}</title></rect>
            {prog != null && prog > 0 && <rect x={x1} y={y + 5} width={Math.max(2, ((x2 - x1) * Math.min(100, prog)) / 100)} height={13} rx={3} fill={color} />}
          </>
        )}
      </g>
    )
  }
  const relLines = useMemo(() => {
    if (!rel) return []
    const out: { k: string; d: string }[] = []
    for (const r of m.cur!.relations) {
      const pi = rowOf.get(r.predId), si = rowOf.get(r.succId); if (pi == null || si == null) continue
      if (Math.max(pi, si) < first || Math.min(pi, si) > last) continue
      const p = acts.find((a) => a.id === r.predId), s = acts.find((a) => a.id === r.succId); if (!p || !s) continue
      const pd = dates(p), sd = dates(s); if (!pd.s || !pd.f || !sd.s || !sd.f) continue
      const px1 = r.type === 'SS' || r.type === 'SF' ? x(pd.s) : x(pd.f) + px, sx = r.type === 'FF' || r.type === 'SF' ? x(sd.f) + px : x(sd.s)
      const y1 = pi * ROW + 12, y2 = si * ROW + 12, mid = Math.max(px1 + 6, 0)
      out.push({ k: r.id, d: `M${px1} ${y1} H${mid} V${y2} H${sx}` })
      if (out.length > 700) break
    }
    return out
  }, [rel, m.cur, rowOf, first, last, px, range, useForecast]) // eslint-disable-line react-hooks/exhaustive-deps

  const ig = selA ? m.integration.get(selA.uid) : undefined
  const rs = selA ? m.forecast.byId.get(selA.id) : undefined
  const base = selA ? baseByUid.get(selA.uid) : undefined
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="im-card" style={{ padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Search size={14} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی کد یا نام…" dir="auto" aria-label="جست‌وجو" style={{ width: 170, minWidth: 0 }} /></label>
        <select style={{ width: "auto" }} value={wbs} onChange={(e) => setWbs(e.target.value)} aria-label="WBS"><option value="">همهٔ بخش‌ها (WBS)</option>{groups.map((g) => <option key={g}>{g}</option>)}</select>
        <label className="fn-chk"><input type="checkbox" checked={onlyCrit} onChange={(e) => setOnlyCrit(e.target.checked)} /> فقط بحرانی <Hint id="float-cp" /></label>
        <label className="fn-chk"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> فقط ناتمام</label>
        <label className="fn-chk"><input type="checkbox" checked={onlyBlocked} onChange={(e) => setOnlyBlocked(e.target.checked)} /> دارای مانع پیش‌نیاز</label>
        <label className="fn-chk"><input type="checkbox" checked={rel} onChange={(e) => setRel(e.target.checked)} /> نمایش روابط <Hint id="relations" /></label>
        <select style={{ width: "auto" }} value={useForecast ? 'f' : 'p'} onChange={(e) => setUseForecast(e.target.value === 'f')} aria-label="نوع تاریخ"><option value="f">میله: پیش‌بینی (منطق شبکه)</option><option value="p">میله: تاریخ‌های فایل</option></select>
        <select style={{ width: "auto" }} value={px} onChange={(e) => setPx(Number(e.target.value))} aria-label="مقیاس"><option value={1.5}>مقیاس: سال</option><option value={4}>ماه</option><option value={10}>هفته</option><option value={24}>روز</option></select>
        <span className="im-helper" style={{ margin: 0, marginInlineStart: 'auto' }}>{fa(lines.filter((l) => l.kind === 'act').length)} فعالیت · داده: {m.currentV!.label}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11.5, flexWrap: 'wrap' }}>
        {[['بحرانی', COLORS.critical], ['نزدیک به بحرانی', COLORS.near], ['عادی', COLORS.normal], ['تمام‌شده', COLORS.complete], ['خط مبنا', '#94a3b8']].map(([l, c]) => <span key={l}><i style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: c, marginInlineEnd: 4 }} />{l}</span>)}
        <span style={{ color: '#0ea5a4' }}>┆ تاریخ وضعیت</span><span style={{ color: '#f97316' }}>┆ امروز</span>
      </div>
      {lines.length === 0 ? <div className="im-card im-empty" style={{ padding: 24 }}>فعالیتی با این فیلتر نیست.</div> : (
        <div ref={box} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} dir="ltr" className="im-card" style={{ padding: 0, height: 620, overflow: 'auto', position: 'relative' }}>
          <div style={{ display: 'flex', width: LEFT + W, minHeight: H + HEAD }}>
            <div style={{ width: LEFT, flex: 'none', position: 'sticky', left: 0, zIndex: 3, background: 'var(--bg-panel-solid, #fff)', borderInlineEnd: '1px solid var(--im-line, #e2e8f0)' }}>
              <div style={{ height: HEAD, position: 'sticky', top: 0, zIndex: 4, background: 'var(--bg-panel-solid, #fff)', borderBottom: '1px solid var(--im-line, #e2e8f0)', display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 11, fontWeight: 700 }} dir="rtl">فعالیت</div>
              <div style={{ position: 'relative', height: H }} dir="rtl">
                {lines.slice(first, last).map((l, k) => { const i = first + k; return l.kind === 'group' ? (
                  <div key={`g${l.key}`} onClick={() => toggle(l.key)} role="button" aria-expanded={!shut.has(l.key)} style={{ position: 'absolute', top: i * ROW, height: ROW, width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', fontWeight: 700, fontSize: 12, background: 'rgba(14,165,233,.08)', cursor: 'pointer', boxSizing: 'border-box' }}>
                    {shut.has(l.key) ? <ChevronLeft size={13} /> : <ChevronDown size={13} />}{l.label}<small className="sub">({fa(l.count)})</small></div>
                ) : (
                  <div key={l.a.id} onClick={() => setSel(l.a.id)} style={{ position: 'absolute', top: i * ROW, height: ROW, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', fontSize: 12, cursor: 'pointer', boxSizing: 'border-box', background: l.a.id === sel ? 'rgba(14,165,233,.14)' : undefined, borderBottom: '1px solid rgba(148,163,184,.12)' }}>
                    <b className="fn-code" style={{ minWidth: 58 }}>{l.a.code}</b><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={l.a.name}>{l.a.name}</span>
                    {m.integration.get(l.a.uid)?.readiness === 'blocked' && <span title="مانع پیش‌نیاز" style={{ color: '#dc2626' }}>●</span>}</div>
                ) })}
              </div>
            </div>
            <svg width={W} height={H + HEAD} style={{ flex: 'none', display: 'block' }} role="img" aria-label="نمودار گانت">
              <g>{months.map((mo, i) => <g key={i}><rect x={mo.x} y={0} width={mo.w} height={HEAD} fill={i % 2 ? 'rgba(148,163,184,.08)' : 'transparent'} /><text x={mo.x + 4} y={25} fontSize={11} fill="currentColor">{mo.w > 40 ? mo.label : ''}</text></g>)}</g>
              <g transform={`translate(0 ${HEAD})`}>
                {months.map((mo, i) => <line key={i} x1={mo.x} x2={mo.x} y1={0} y2={H} stroke="rgba(148,163,184,.25)" />)}
                {lines.slice(first, last).map((l, k) => { const i = first + k; if (l.kind === 'group') { if (!l.start || !l.finish) return null; return <rect key={`gb${l.key}`} x={x(l.start)} y={i * ROW + 9} width={Math.max(3, x(l.finish) + px - x(l.start))} height={6} rx={2} fill="#475569" opacity={0.7} /> } return bar(l.a, i) })}
                {rel && relLines.map((r) => <path key={r.k} d={r.d} fill="none" stroke="#64748b" strokeWidth={1} opacity={0.6} />)}
                <line x1={x(m.dataDate)} x2={x(m.dataDate)} y1={-HEAD} y2={H} stroke="#0ea5a4" strokeDasharray="4 3" strokeWidth={1.5} />
                {m.today >= range.min && m.today <= range.max && <line x1={x(m.today)} x2={x(m.today)} y1={-HEAD} y2={H} stroke="#f97316" strokeDasharray="2 4" strokeWidth={1.2} />}
              </g>
            </svg>
          </div>
        </div>
      )}
      {selA && (
        <Section title={<span><b className="fn-code">{selA.code}</b> {selA.name}</span>} hint={selA.wbsPath || selA.wbsCode} action={<button className="im-btn im-btn-sm" onClick={() => go('links')}>اتصال‌ها</button>}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', fontSize: 12.5 }}>
            <div><b>تاریخ‌های فایل</b><br />{d(selA.plannedStart)} تا {d(selA.plannedFinish)} · مدت {fa(selA.origDuration, 1)} روز کاری</div>
            <div><b>خط مبنا</b><br />{base ? `${d(base.plannedStart)} تا ${d(base.plannedFinish)}` : 'در خط مبنا نیست'}</div>
            <div><b>پیش‌بینی</b><br />{d(rs?.start ?? null)} تا {d(rs?.finish ?? null)}{rs?.critical && <> <Chip tone="bad">بحرانی</Chip></>}</div>
            <div><b>شناوری</b><br />کل {rs?.totalFloat == null ? '—' : fa(rs.totalFloat, 1)} · آزاد {rs?.freeFloat == null ? '—' : fa(rs.freeFloat, 1)} روز کاری</div>
            <div><b>واقعی</b><br />{d(selA.actualStart)} تا {d(selA.actualFinish)}{selA.pctComplete != null && ` · ${fa(selA.pctComplete, 0)}٪ (فایل)`}</div>
            <div><b>اجرا (قطعی/گزارش‌شده)</b><br />{ig?.execApproved == null ? '—' : `${fa(ig.execApproved, 0)}٪`} / {ig?.execReported == null ? '—' : `${fa(ig.execReported, 0)}٪`}{ig && ig.execRejectedQty > 0 && <span className="ex-bad"> · ردشده {fa(ig.execRejectedQty)}</span>}</div>
          </div>
          {ig && ig.blockers.length > 0 && <ul style={{ margin: '8px 0 0', paddingInlineStart: 18, listStyle: 'disc', fontSize: 12.5 }}>{ig.blockers.map((b, i) => <li key={i} style={{ color: b.severity === 'high' ? '#dc2626' : undefined }}>{b.text}</li>)}</ul>}
          <p className="im-helper" style={{ margin: '6px 0 0' }}>اتصال‌ها: {m.links.filter((l) => l.activityUid === selA.uid).map((l) => LINK_LABEL_FA[l.targetType]).join('، ') || 'ندارد'} · منبع داده: نسخهٔ «{m.currentV!.label}»، آخرین به‌روزرسانی {new Date(m.currentV!.createdAt).toLocaleDateString('fa-IR')}</p>
        </Section>
      )}
    </div>
  )
}
