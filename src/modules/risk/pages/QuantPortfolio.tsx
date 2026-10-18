import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Dices, Loader2, Plus, Trash2 } from 'lucide-react'
import { JalaliDateInput } from '../../../components/common/JalaliDateInput'
import { jalaliText } from '../../execution/lib/periods'
import { Chip, KpiCard, Section } from '../../finance/components/fn'
import { PB, Tile, axisProps, gridProps } from '../../finance/components/charts'
import { fa } from '../../execution/components/common'
import { Hint } from '../../scheduling/components/Hint'
import { listDrivers, listSchedulingProjects, loadPortfolioSource, removeDriver, saveDriver, type PortfolioSource } from '../../scheduling/lib/portfolioLoader'
import { runPortfolio, type PortfolioDriver, type PortfolioResult } from '../../scheduling/lib/portfolio'

const d = (x: string | null) => (x ? jalaliText(x) : '—')
const money = (v: number | null) => (v == null ? '—' : fa(Math.round(v)))
const EMPTY = { title: '', probability: 0.3, dMin: 5, dLikely: 15, dMax: 40, cMin: 0, cLikely: 0, cMax: 0, projectIds: [] as string[] }

/** Portfolio-level quantitative analysis: the current schedules of the selected projects are simulated together; common drivers make them move together. */
export function QuantPortfolio({ names }: { names: Record<string, string> }) {
  const [available, setAvailable] = useState<string[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [sources, setSources] = useState<Map<string, PortfolioSource>>(new Map())
  const [drivers, setDrivers] = useState<PortfolioDriver[]>([])
  const [iterations, setIterations] = useState(2000), [seed, setSeed] = useState(12345)
  const [tFinish, setTFinish] = useState<string | null>(null), [tCost, setTCost] = useState<number | null>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const [res, setRes] = useState<PortfolioResult | null>(null)
  const [form, setForm] = useState(EMPTY)
  useEffect(() => { void listSchedulingProjects().then((ids) => { const ok = ids.filter((i) => names[i]); setAvailable(ok); setPicked(ok) }); void listDrivers().then(setDrivers) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const nameOf = (id: string) => names[id] ?? id
  const formOk = form.title.trim() && form.probability > 0 && form.probability <= 1 && form.dMin <= form.dLikely && form.dLikely <= form.dMax && form.cMin <= form.cLikely && form.cLikely <= form.cMax && form.projectIds.length >= 2
  const shown = useMemo(() => drivers.filter((x) => x.projectIds.some((p) => names[p])), [drivers, names])

  const run = async () => {
    setBusy(true); setErr('')
    try {
      const next = new Map(sources)
      for (const id of picked) if (!next.has(id)) { const s = await loadPortfolioSource(id); if (s) next.set(id, s) }
      setSources(next)
      const items = picked.filter((id) => next.has(id)).map((id) => ({ id, name: nameOf(id), input: next.get(id)!.input }))
      setRes(runPortfolio(items, shown, { iterations, seed, targets: { finish: tFinish, cost: tCost } }))
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  const addDriver = async () => {
    const e = await saveDriver({ title: form.title.trim(), probability: form.probability, days: { min: form.dMin, likely: form.dLikely, max: form.dMax }, cost: { min: form.cMin, likely: form.cLikely, max: form.cMax }, projectIds: form.projectIds, active: true })
    if (e) { setErr(e); return }
    setErr(''); setForm(EMPTY); setDrivers(await listDrivers())
  }

  if (available === null) return <div className="im-skeleton" style={{ height: 200 }} />
  if (!available.length) return <div className="im-card im-empty" style={{ padding: 24 }}>هنوز هیچ پروژه‌ای برنامهٔ تأییدشده ندارد؛ تحلیل سبد به برنامهٔ جاری هر پروژه نیاز دارد.</div>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="im-card" style={{ padding: '10px 14px', fontSize: 12.5 }}>
        <b>تحلیل سبد پروژه‌ها</b> <Hint id="pf-sim" /> — برنامهٔ جاری هر پروژه با ورودی‌های خودش شبیه‌سازی و در هر تکرار با هم ترکیب می‌شود: پایان سبد = دیرترین پایان، هزینه = مجموع هزینه‌ها. بدون «ریسک مشترک» پروژه‌ها مستقل فرض می‌شوند. آمادگی تأمین (اتصال‌ها) در این تحلیل اعمال نمی‌شود.
      </div>

      <Section title="پروژه‌های سبد" flush>
        <div style={{ padding: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {available.map((id) => <label key={id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" style={{ width: 'auto' }} checked={picked.includes(id)} onChange={(e) => setPicked(e.target.checked ? [...picked, id] : picked.filter((x) => x !== id))} />{nameOf(id)}</label>)}
        </div>
      </Section>

      <Section title={<span>ریسک‌های مشترک بین پروژه‌ها <Hint id="pf-driver" /></span>} hint="یک بار قرعه در هر تکرار؛ اگر رخ دهد، به همهٔ پروژه‌های فهرست‌شده اثر می‌گذارد" flush>
        {shown.length > 0 && <table className="ex-lines"><thead><tr><th>ریسک</th><th className="num">احتمال</th><th>تأخیر (روز تقویمی)</th><th>هزینه</th><th>پروژه‌ها</th><th /></tr></thead><tbody>
          {shown.map((x) => <tr key={x.id}><td>{x.title}{!x.active && <Chip tone="neutral">غیرفعال</Chip>}</td><td className="num">{fa(x.probability * 100, 0)}٪</td><td>{fa(x.days.min, 0)} / {fa(x.days.likely, 0)} / {fa(x.days.max, 0)}</td><td>{x.cost.max > 0 ? `${money(x.cost.min)} / ${money(x.cost.likely)} / ${money(x.cost.max)}` : '—'}</td><td className="sub" style={{ whiteSpace: 'normal' }}>{x.projectIds.map(nameOf).join('، ')}</td>
            <td style={{ whiteSpace: 'nowrap' }}><button className="im-btn im-btn-sm" onClick={async () => { const e = await saveDriver({ ...x, active: !x.active }); if (e) setErr(e); else setDrivers(await listDrivers()) }}>{x.active ? 'غیرفعال' : 'فعال'}</button> <button className="im-btn im-btn-sm im-btn-danger" aria-label="حذف" onClick={async () => { const e = await removeDriver(x.id); if (e) setErr(e); else setDrivers(await listDrivers()) }}><Trash2 size={12} /></button></td></tr>)}
        </tbody></table>}
        <div style={{ padding: 10, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="ex-lab" style={{ flex: '1 1 220px' }}>عنوان<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} dir="auto" /></label>
            <label className="ex-lab">احتمال (۰ تا ۱)<input type="number" min={0} max={1} step="0.05" value={form.probability} onChange={(e) => setForm({ ...form, probability: Number(e.target.value) })} style={{ width: 80 }} /></label>
            {(['dMin', 'dLikely', 'dMax'] as const).map((k, i) => <label key={k} className="ex-lab">تأخیر {['کمینه', 'محتمل', 'بیشینه'][i]}<input type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} style={{ width: 70 }} /></label>)}
            {(['cMin', 'cLikely', 'cMax'] as const).map((k, i) => <label key={k} className="ex-lab">هزینه {['کمینه', 'محتمل', 'بیشینه'][i]}<input type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} style={{ width: 110 }} /></label>)}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="im-helper" style={{ margin: 0 }}>پروژه‌های اثرپذیر (حداقل دو):</span>
            {available.map((id) => <label key={id} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" style={{ width: 'auto' }} checked={form.projectIds.includes(id)} onChange={(e) => setForm({ ...form, projectIds: e.target.checked ? [...form.projectIds, id] : form.projectIds.filter((x) => x !== id) })} />{nameOf(id)}</label>)}
            <button className="im-btn im-btn-primary im-btn-sm" disabled={!formOk} onClick={() => void addDriver()}><Plus size={13} /> ثبت ریسک مشترک</button>
          </div>
        </div>
      </Section>

      <Section title="اجرا و اهداف سبد">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="ex-lab">تعداد تکرار<select value={iterations} onChange={(e) => setIterations(Number(e.target.value))}>{[500, 1000, 2000, 5000].map((n) => <option key={n} value={n}>{fa(n)}</option>)}</select></label>
          <label className="ex-lab">دانهٔ تصادف <Hint id="mc-seed" /><input type="number" value={seed} onChange={(e) => setSeed(Math.round(Number(e.target.value)) || 1)} style={{ width: 100 }} /></label>
          <label className="ex-lab">تاریخ هدف پایان سبد<JalaliDateInput value={tFinish ?? ''} onChange={(v) => setTFinish(v || null)} /></label>
          <label className="ex-lab">بودجهٔ هدف سبد (ریال)<input type="number" min={0} value={tCost ?? ''} onChange={(e) => setTCost(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} style={{ width: 170 }} /></label>
          <button className="im-btn im-btn-primary" disabled={busy || picked.length === 0} onClick={() => void run()}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Dices size={14} />} {busy ? 'در حال بارگذاری و محاسبه…' : 'اجرای تحلیل سبد'}</button>
        </div>
        {err && <p className="ex-bad" style={{ margin: '8px 0 0' }}>{err}</p>}
      </Section>

      {res && (
        <>
          {res.warnings.length > 0 && <div className="im-card" style={{ padding: '8px 12px', fontSize: 12.5 }}>{res.warnings.slice(0, 5).map((w) => <div key={w}>⚠ {w}</div>)}</div>}
          {res.ok && (
            <>
              <div className="fn-kpis">
                <KpiCard i={0} label="پایان سبد — قطعی" value={d(res.finish.det)} sub="دیرترین پایان پروژه‌ها" />
                <KpiCard i={1} label="P50 پایان سبد" value={d(res.finish.p50)} />
                <KpiCard i={2} label="P80 پایان سبد" value={d(res.finish.p80)} tone="warn" />
                <KpiCard i={3} label="P90 پایان سبد" value={d(res.finish.p90)} tone="bad" />
              </div>
              {res.cost && (
                <div className="fn-kpis">
                  <KpiCard i={0} label="هزینهٔ باقی‌ماندهٔ پایهٔ سبد" value={money(res.cost.base)} />
                  <KpiCard i={1} label="هزینه P50" value={money(res.cost.p50)} />
                  <KpiCard i={2} label="هزینه P80" value={money(res.cost.p80)} tone="warn" sub={`ذخیره ${money(res.cost.p80 - res.cost.base)}`} />
                  <KpiCard i={3} label={<span>اثر تنوع‌بخشی <Hint id="pf-diversify" /></span>} value={money(res.diversification)} tone="good" sub="ذخیرهٔ P80 کمتر از جمع ذخیره‌های پروژه‌ها" />
                </div>
              )}
              {(res.pFinish != null || res.pCost != null) && (
                <div className="fn-kpis">
                  {res.pFinish != null && <KpiCard i={0} label="احتمال پایان تا تاریخ هدف" value={`${fa(res.pFinish * 100, 0)}٪`} tone={res.pFinish >= 0.8 ? 'good' : res.pFinish >= 0.5 ? 'warn' : 'bad'} />}
                  {res.pCost != null && <KpiCard i={1} label="احتمال در بودجهٔ هدف" value={`${fa(res.pCost * 100, 0)}٪`} tone={res.pCost >= 0.8 ? 'good' : res.pCost >= 0.5 ? 'warn' : 'bad'} />}
                  {res.pJoint != null && <KpiCard i={2} label="هر دو هم‌زمان" value={`${fa(res.pJoint * 100, 0)}٪`} tone={res.pJoint >= 0.8 ? 'good' : res.pJoint >= 0.5 ? 'warn' : 'bad'} />}
                </div>
              )}
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <Tile title="توزیع تاریخ پایان سبد" hint={`${fa(res.iterations)} اجرا`}>
                  <div style={{ height: 230 }} dir="ltr"><ResponsiveContainer width="100%" height="100%"><BarChart data={res.histogram.map((h) => ({ x: jalaliText(h.date), n: h.count }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} /><XAxis dataKey="x" {...axisProps} interval="preserveStartEnd" /><YAxis {...axisProps} width={34} />
                    <Tooltip formatter={(v) => [fa(Number(v)), 'تعداد اجرا']} /><Bar dataKey="n" fill={PB.teal} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart></ResponsiveContainer></div>
                </Tile>
                {res.scatter.length > 0 && (
                  <Tile title="هزینه–تاریخ پایان سبد" hint={`همبستگی ${fa(res.correlation, 2)}`}>
                    <div style={{ height: 230 }} dir="ltr"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis type="number" dataKey="x" domain={['dataMin', 'dataMax']} tickFormatter={(v) => jalaliText(new Date(Number(v) * 86400000).toISOString().slice(0, 10))} {...axisProps} />
                      <YAxis type="number" dataKey="y" tickFormatter={(v) => fa(Math.round(Number(v) / 1e9)) + 'م'} {...axisProps} width={50} />
                      <Tooltip formatter={(v, n) => [n === 'x' ? d(new Date(Number(v) * 86400000).toISOString().slice(0, 10)) : money(Number(v)), n === 'x' ? 'پایان' : 'هزینه']} />
                      <Scatter data={res.scatter.map((p) => ({ x: Date.parse(p.date) / 86400000, y: p.cost }))} fill={PB.violet} isAnimationActive={false} />
                    </ScatterChart></ResponsiveContainer></div>
                  </Tile>
                )}
              </div>
              <Section title="سهم هر پروژه" flush>
                <table className="ex-lines"><thead><tr><th>پروژه</th><th>پایان قطعی</th><th>P80 پایان</th><th className="num">هزینه P80</th><th className="num">تعیین‌کنندهٔ پایان سبد</th></tr></thead><tbody>
                  {res.projects.map((p) => <tr key={p.id}><td>{p.name}</td><td>{d(p.deterministicFinish)}</td><td>{d(p.finishP80)}</td><td className="num">{money(p.costP80)}</td><td className="num">{fa(p.drivesFinish * 100, 0)}٪</td></tr>)}
                  {res.driverHits.map((h) => <tr key={h.id}><td colSpan={4}>ریسک مشترک «{h.title}»</td><td className="num">وقوع در {fa(h.hitRate * 100, 0)}٪ اجراها</td></tr>)}
                </tbody></table>
              </Section>
            </>
          )}
        </>
      )}
    </div>
  )
}
