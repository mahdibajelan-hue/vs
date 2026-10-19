import { useEffect, useMemo, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Plus, Trash2 } from 'lucide-react'
import { jalaliText } from '../../execution/lib/periods'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { PB, Tile, axisProps, gridProps } from '../../finance/components/charts'
import { fa } from '../../execution/components/common'
import { resourceHistogram, type Resource } from '../lib/resources'
import { useResourceStore } from '../store/useResourceStore'
import { useSchedulingStore } from '../store/useSchedulingStore'
import type { LiveModel } from '../store/useScheduleModel'
import { Hint } from '../components/Hint'

const EMPTY = { name: '', kind: 'labor' as Resource['kind'], unit: 'نفر', maxUnits: 0, ratePerDay: 0, execMatch: '' }

/** Resource loading: define labour / equipment, assign them to activities, see the weekly histogram against the limit and against the real use in the daily reports. */
export function SchResources({ projectId, m }: { projectId: string; m: LiveModel }) {
  const rs = useResourceStore()
  const can = useSchedulingStore((s) => s.canEdit)
  useEffect(() => { if (rs.projectId !== projectId) void rs.load(projectId) }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [form, setForm] = useState(EMPTY)
  const [selId, setSelId] = useState('')
  const [q, setQ] = useState('')
  const [actUid, setActUid] = useState('')
  const [units, setUnits] = useState(1)
  const acts = useMemo(() => m.cur!.activities.filter((a) => a.type === 'task'), [m.cur])
  const sum = useMemo(() => resourceHistogram({ resources: rs.resources, assignments: rs.assignments, activities: m.cur!.activities, forecast: m.forecast, calendar: m.calendar, usage: m.sources.execUsage }), [rs.resources, rs.assignments, m.cur, m.forecast, m.calendar, m.sources.execUsage])
  const sel = rs.resources.find((r) => r.id === selId) ?? rs.resources[0]
  const s = sel ? sum.get(sel.id) : undefined
  const mine = rs.assignments.filter((a) => a.resourceId === sel?.id)
  const byUid = new Map(m.cur!.activities.map((a) => [a.uid, a]))
  const list = useMemo(() => { const n = q.trim().toLowerCase(); return acts.filter((a) => !n || `${a.code} ${a.name}`.toLowerCase().includes(n)).slice(0, 60) }, [acts, q])
  const totalCost = [...sum.values()].reduce((x, y) => x + y.cost, 0)
  const overs = rs.resources.filter((r) => (sum.get(r.id)?.overWeeks ?? 0) > 0)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="منابع تعریف‌شده" value={fa(rs.resources.length)} sub={`${fa(rs.assignments.length)} تخصیص`} />
        <KpiCard i={1} label={<span>منبع بیش‌ازحد بارگذاری‌شده <Hint id="res-over" /></span>} value={fa(overs.length)} tone={overs.length ? 'bad' : 'good'} sub={overs.length ? overs.map((r) => r.name).slice(0, 2).join('، ') : 'بدون اضافه‌بار'} />
        <KpiCard i={2} label="هزینهٔ برنامه‌ای منابع (ریال)" value={fa(Math.round(totalCost))} sub="روز‌ـ‌واحد × نرخ روزانه" />
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(260px, 360px) 1fr', alignItems: 'start' }}>
        <Section title={<span>منابع <Hint id="res-define" /></span>} flush>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            {rs.resources.length === 0 && <p className="im-helper" style={{ padding: 12, margin: 0 }}>هنوز منبعی تعریف نشده است.</p>}
            {rs.resources.map((r) => { const x = sum.get(r.id); return (
              <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid rgba(148,163,184,.18)', background: r.id === sel?.id ? 'rgba(14,165,164,.08)' : undefined }}>
                <button type="button" onClick={() => setSelId(r.id)} style={{ all: 'unset', cursor: 'pointer', flex: 1 }}><b>{r.name}</b> <span className="sub">{r.kind === 'labor' ? 'نیروی انسانی' : 'ماشین‌آلات'} · سقف {r.maxUnits ? fa(r.maxUnits) : '—'} {r.unit}</span></button>
                {x && x.overWeeks > 0 && <Chip tone="bad">{fa(x.overWeeks)} هفته اضافه‌بار</Chip>}
                {can && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف منبع" onClick={() => { if (window.confirm(`منبع «${r.name}» و تخصیص‌هایش حذف شود؟`)) void rs.removeResource(r.id) }}><Trash2 size={12} /></button>}
              </div>) })}
          </div>
          {can && (
            <div style={{ padding: 10, display: 'grid', gap: 6, borderTop: '1px solid rgba(148,163,184,.25)' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <label className="ex-lab" style={{ flex: '2 1 120px' }}>نام<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="auto" /></label>
                <label className="ex-lab">نوع<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Resource['kind'], unit: e.target.value === 'labor' ? 'نفر' : 'دستگاه' })}><option value="labor">نیروی انسانی</option><option value="equipment">ماشین‌آلات</option></select></label>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <label className="ex-lab" style={{ flex: '1 1 70px' }}>سقف (0 = بدون سقف)<input type="number" min={0} value={form.maxUnits} onChange={(e) => setForm({ ...form, maxUnits: Number(e.target.value) })} /></label>
                <label className="ex-lab" style={{ flex: '1 1 90px' }}>نرخ روزانه (ریال)<input type="number" min={0} value={form.ratePerDay} onChange={(e) => setForm({ ...form, ratePerDay: Number(e.target.value) })} /></label>
              </div>
              <label className="ex-lab">نام ردیف در گزارش روزانه (برای مقایسهٔ واقعی)<input value={form.execMatch} onChange={(e) => setForm({ ...form, execMatch: e.target.value })} dir="auto" placeholder="مثلاً جوشکار" /></label>
              <button className="im-btn im-btn-primary im-btn-sm" disabled={!form.name.trim()} onClick={() => void rs.saveResource(form).then((ok) => ok && setForm(EMPTY))}><Plus size={13} /> افزودن منبع</button>
            </div>
          )}
        </Section>

        <div style={{ display: 'grid', gap: 12 }}>
          {!sel ? <div className="im-card im-empty" style={{ padding: 24 }}>یک منبع تعریف کنید و آن را به فعالیت‌ها تخصیص دهید تا هیستوگرام بار نمایش داده شود.</div> : (
            <>
              <Tile title={<span>هیستوگرام هفتگی — {sel.name} <Hint id="res-histogram" /></span>} hint={`میانگین و اوج برنامه‌ای در روزهای کاری هر هفته${sel.execMatch ? '؛ خط: میانگین واقعی از گزارش روزانه' : ''}`}>
                {!s || s.weeks.length === 0 ? <p className="im-helper" style={{ margin: 0 }}>برای این منبع هنوز فعالیتی تخصیص داده نشده است.</p> : (
                  <div style={{ height: 260 }} dir="ltr"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={s.weeks.map((w) => ({ x: jalaliText(w.week), avg: Math.round(w.avg * 10) / 10, peak: w.peak, actual: w.actual == null ? null : Math.round(w.actual * 10) / 10 }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} /><XAxis dataKey="x" {...axisProps} interval="preserveStartEnd" /><YAxis {...axisProps} width={36} />
                    <Tooltip formatter={(v, n) => [fa(Number(v), 1), n === 'avg' ? 'میانگین برنامه‌ای' : n === 'peak' ? 'اوج برنامه‌ای' : 'واقعی']} />
                    {sel.maxUnits > 0 && <ReferenceLine y={sel.maxUnits} stroke={PB.coral} strokeDasharray="5 4" label={{ value: 'سقف', fontSize: 10, fill: PB.coral }} />}
                    <Bar dataKey="avg" fill={PB.blue} isAnimationActive={false} />
                    <Line type="monotone" dataKey="peak" stroke={PB.yellow} dot={false} strokeWidth={1.5} isAnimationActive={false} />
                    <Line type="monotone" dataKey="actual" stroke={PB.teal} strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
                  </ComposedChart></ResponsiveContainer></div>
                )}
                {s && <p className="im-helper" style={{ margin: '6px 0 0' }}>اوج {fa(s.peak, 1)} {sel.unit} · {fa(s.unitDays, 0)} {sel.unit}-روز · هزینهٔ برنامه‌ای {fa(Math.round(s.cost))} ریال · {fa(s.assignedActivities)} فعالیت</p>}
              </Tile>
              <Section title="تخصیص به فعالیت‌ها" flush>
                {mine.length > 0 && <table className="ex-lines"><tbody>{mine.map((a) => { const act = byUid.get(a.activityUid); const f = act ? m.forecast.byId.get(act.id) : undefined; return (
                  <tr key={a.id}><td><b className="fn-code">{act?.code ?? '—'}</b> {act?.name ?? 'فعالیت (حذف‌شده)'}</td><td className="sub">{f?.start ? jalaliText(f.start) : '—'} تا {f?.finish ? jalaliText(f.finish) : '—'}</td><td className="num">{fa(a.unitsPerDay, 1)} {sel.unit}/روز</td><td>{can && <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف تخصیص" onClick={() => void rs.removeAssignment(a.id)}><Trash2 size={12} /></button>}</td></tr>) })}</tbody></table>}
                {can && (
                  <div style={{ padding: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label className="ex-lab" style={{ flex: '1 1 140px' }}>جست‌وجو<input value={q} onChange={(e) => setQ(e.target.value)} dir="auto" /></label>
                    <label className="ex-lab" style={{ flex: '2 1 240px' }}>فعالیت<select value={actUid} onChange={(e) => setActUid(e.target.value)}><option value="">— انتخاب —</option>{list.map((a) => <option key={a.uid} value={a.uid}>{a.code} — {a.name.slice(0, 60)}</option>)}</select></label>
                    <label className="ex-lab" style={{ width: 90 }}>{sel.unit} در روز<input type="number" min={0} step="0.5" value={units} onChange={(e) => setUnits(Number(e.target.value))} /></label>
                    <button className="im-btn im-btn-primary" disabled={!actUid || units <= 0} onClick={() => void rs.saveAssignment({ activityUid: actUid, resourceId: sel.id, unitsPerDay: units }).then((ok) => ok && setActUid(''))}><Plus size={14} /> تخصیص</button>
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
