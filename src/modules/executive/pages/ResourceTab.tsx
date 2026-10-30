import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { HardHat, Truck, Users } from 'lucide-react'
import { formatJalali, isoToJalali, JALALI_MONTHS } from '../../../lib/jalali'
import type { PfProjectView } from '../lib/portfolioCore'
import { byProject, byResource, flagsOf, monthlyTrend, RES_FLAG_FA } from '../lib/resourceCore'
import { usePortfolioPlanningStore } from '../store/usePortfolioPlanningStore'
import { Empty, faNum, Kpi, Panel } from '../components/pfUi'
import { BarList, Gauge, Seg } from '../components/viz'
import { useDrill } from '../components/DrillSheet'

const UTIL_BANDS = [{ to: 70, color: '#ef4444' }, { to: 85, color: '#f5b31b' }, { to: 100, color: '#22c55e' }]
const pct = (x: number | null) => (x == null ? '—' : `${faNum(x * 100)}٪`)
const ymLabel = (ym: string) => { const j = isoToJalali(`${ym}-15`); return j ? `${JALALI_MONTHS[j.jm - 1]} ${String(j.jy).slice(2)}` : ym }

function Util({ value }: { value: number | null }) {
  if (value == null) return <span className="pf-muted">—</span>
  const tone = value >= 0.85 ? '#22c55e' : value >= 0.7 ? '#f5b31b' : '#ef4444'
  return <span className="pf-util" title={pct(value)}><span className="pf-util-track"><i style={{ width: `${Math.min(100, value * 100)}%`, background: tone }} /></span><b>{pct(value)}</b></span>
}

/**
 * Real capacity: who and what is on site across the portfolio, from the approved daily reports of the execution
 * module (latest month per project), against the scheduling module's resource limits where they exist.
 */
export function ResourceTab({ views }: { views: PfProjectView[] }) {
  const pl = usePortfolioPlanningStore()
  const [rankBy, setRankBy] = useState<'man' | 'equip'>('man')
  const { drill, open } = useDrill()
  useEffect(() => { if (!usePortfolioPlanningStore.getState().resourcesLoaded) void usePortfolioPlanningStore.getState().loadResources() }, [])

  const ids = useMemo(() => new Set(views.map((v) => v.input.id)), [views])
  const name = useMemo(() => new Map(views.map((v) => [v.input.id, v.input.name])), [views])
  const usage = useMemo(() => pl.usage.filter((r) => ids.has(r.projectId)), [pl.usage, ids])
  const plans = useMemo(() => pl.plans.filter((r) => ids.has(r.projectId)), [pl.plans, ids])
  const lines = useMemo(() => byResource(usage, plans), [usage, plans])
  const projects = useMemo(() => byProject(usage), [usage])
  const trend = useMemo(() => monthlyTrend(usage).map((t) => ({ ...t, label: ymLabel(t.ym) })), [usage])

  if (!pl.resourcesLoaded) return <div className="pf-skel-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="pf-skel" />)}</div>

  const man = lines.filter((l) => l.kind === 'man'), equip = lines.filter((l) => l.kind === 'equip')
  const sum = (ls: typeof lines, k: 'deployed' | 'working' | 'idle' | 'unavailable') => ls.reduce((a, l) => a + l[k], 0)
  const manD = sum(man, 'deployed'), manW = sum(man, 'working'), eqD = sum(equip, 'deployed'), eqW = sum(equip, 'working'), eqIdle = sum(equip, 'idle'), eqUn = sum(equip, 'unavailable')
  const flagged = lines.filter((l) => flagsOf(l).length)
  const silent = views.filter((v) => !projects.some((p) => p.projectId === v.input.id))

  return (
    <div className="pf-stack">
      <div className="pf-kpis">
        <Kpi icon={<Users size={14} />} label="نیروی انسانی در کارگاه" value={Math.round(manD)} sub={`فعال ${pct(manD ? manW / manD : null)} — میانگین روزانهٔ آخرین ماه`} tone="#0ea5e9" spark={trend.map((t) => t.man)} />
        <Kpi icon={<Truck size={14} />} label="ماشین‌آلات در کارگاه" value={Math.round(eqD)} sub={`بهره‌وری ${pct(eqD ? eqW / eqD : null)}`} tone="#a78bfa" spark={trend.map((t) => t.equip)} />
        <Kpi icon={<Truck size={14} />} label="ماشین آماده ولی بیکار" value={faNum(eqIdle, 1)} sub={`خارج از کار (تعمیر/توقف): ${faNum(eqUn, 1)}`} tone={eqD && eqIdle / eqD > 0.15 ? '#ef4444' : '#f5b31b'} />
        <Kpi icon={<HardHat size={14} />} label="پوشش گزارش منابع" value={`${faNum(projects.length)} از ${faNum(views.length)}`} sub="پروژه‌هایی که گزارش روزانهٔ تأییدشده با منابع دارند" tone={projects.length < views.length ? '#f97316' : '#22c55e'} onClick={silent.length ? () => drill('بدون گزارش منابع در شش ماه گذشته', silent.map((v) => v.input.id)) : undefined} />
      </div>

      {!usage.length ? (
        <Panel title="ظرفیت منابع" icon={<HardHat size={15} />}>
          <Empty>در شش ماه گذشته هیچ گزارش روزانهٔ تأییدشده‌ای با نفرات و ماشین‌آلات برای پروژه‌های این محدوده ثبت نشده است. ظرفیت از گزارش‌های روزانهٔ ماژول اجرا خوانده می‌شود، نه از فرض.</Empty>
        </Panel>
      ) : <>
        <div className="pf-grid-2">
          <Panel title="بهره‌وری منابع سبد" icon={<HardHat size={15} />} hint="سهم نفرات و ماشین‌آلات فعال از کل منابع در کارگاه؛ هدف ۸۵٪.">
            <div className="vz-gauges">
              <Gauge label="نفرات فعال" value={manD ? (manW / manD) * 100 : null} bands={UTIL_BANDS} target={85} display={pct(manD ? manW / manD : null)} size={150} />
              <Gauge label="بهره‌وری ماشین‌آلات" value={eqD ? (eqW / eqD) * 100 : null} bands={UTIL_BANDS} target={85} display={pct(eqD ? eqW / eqD : null)} size={150} />
              <Gauge label="پوشش گزارش" value={views.length ? (projects.length / views.length) * 100 : null} bands={UTIL_BANDS} target={85} display={`${faNum(views.length ? Math.round((projects.length / views.length) * 100) : 0)}٪`} sub={`${faNum(projects.length)} از ${faNum(views.length)} پروژه`} size={150}
                onClick={silent.length ? () => drill('بدون گزارش منابع در شش ماه گذشته', silent.map((v) => v.input.id)) : undefined} />
            </div>
          </Panel>
          <Panel title="پروژه‌ها بر حسب منابع" icon={<Users size={15} />} hint="آخرین ماه گزارش‌شده؛ رنگ میله بهره‌وری را نشان می‌دهد. روی هر پروژه بزنید."
            right={<Seg label="منبع" value={rankBy} onChange={setRankBy} options={[{ key: 'man', label: 'نفرات' }, { key: 'equip', label: 'ماشین‌آلات' }]} />}>
            <BarList onPick={open} items={[...projects].sort((a, b) => (rankBy === 'man' ? b.manDeployed - a.manDeployed : b.equipDeployed - a.equipDeployed)).slice(0, 8).map((p) => {
              const u = rankBy === 'man' ? p.manUtil : p.equipUtil
              return { key: p.projectId, label: name.get(p.projectId) ?? '—', value: rankBy === 'man' ? p.manDeployed : p.equipDeployed, display: faNum(rankBy === 'man' ? p.manDeployed : p.equipDeployed, 1),
                color: u == null ? '#64748b' : u >= 0.85 ? '#22c55e' : u >= 0.7 ? '#f5b31b' : '#ef4444', note: `بهره‌وری ${pct(u)}` }
            })} />
          </Panel>
        </div>

        <Panel title="روند نفرات و ماشین‌آلات سبد" icon={<Users size={15} />} hint="مجموع میانگین روزانهٔ هر ماه روی همهٔ پروژه‌ها؛ فقط گزارش‌های تأییدشده.">
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={36} />
                <Tooltip isAnimationActive={false} contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 10, fontSize: 12, direction: 'rtl' }}
                  formatter={(v, n) => [faNum(Number(v), 1), n === 'man' ? 'نفرات' : n === 'manWorking' ? 'نفرات فعال' : n === 'equip' ? 'ماشین‌آلات' : 'ماشین فعال']} />
                <Legend formatter={(n) => (n === 'man' ? 'نفرات' : n === 'manWorking' ? 'نفرات فعال' : n === 'equip' ? 'ماشین‌آلات' : 'ماشین فعال')} wrapperStyle={{ fontSize: 11 }} />
                <Area dataKey="man" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.12} strokeWidth={2} />
                <Area dataKey="manWorking" stroke="#0ea5e9" fill="none" strokeDasharray="4 3" />
                <Area dataKey="equip" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.12} strokeWidth={2} />
                <Area dataKey="equipWorking" stroke="#a78bfa" fill="none" strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {flagged.length > 0 && (
          <Panel title="منابعی که توجه می‌خواهند" icon={<HardHat size={15} />}>
            <ul className="pf-res-flags">
              {flagged.map((l) => (
                <li key={`${l.kind}|${l.name}`}>
                  <b>{l.kind === 'man' ? <Users size={13} /> : <Truck size={13} />} {l.name}</b>
                  <span>{flagsOf(l).map((f) => <span key={f} className={`pf-reason is-res-${f}`}>{RES_FLAG_FA[f]}</span>)}</span>
                  <small className="pf-muted">در کارگاه {faNum(l.deployed, 1)} · فعال {faNum(l.working, 1)} · بیکار {faNum(l.idle, 1)} · خارج از کار {faNum(l.unavailable, 1)}{l.planned != null ? ` · برنامه ${faNum(l.planned)}` : ''}</small>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <div className="pf-grid-2">
          <ResTable title="نیروی انسانی بر حسب تخصص" icon={<Users size={15} />} lines={man} name={name} />
          <ResTable title="ماشین‌آلات بر حسب نوع" icon={<Truck size={15} />} lines={equip} name={name} />
        </div>

        <Panel title="منابع هر پروژه" icon={<HardHat size={15} />} hint="آخرین ماهی که برای هر پروژه گزارش تأییدشده دارد.">
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead><tr><th>پروژه</th><th>نفرات</th><th>نفرات فعال</th><th>ماشین‌آلات</th><th>بهره‌وری ماشین</th><th>بیکار / خارج از کار</th><th>آخرین گزارش</th></tr></thead>
              <tbody>{projects.map((p) => (
                <tr key={p.projectId}>
                  <td><button type="button" className="vz-link" onClick={() => open(p.projectId)}>{name.get(p.projectId) ?? '—'}</button><small className="pf-muted block">{faNum(p.days)} روز گزارش در ماه</small></td>
                  <td className="pf-num">{faNum(p.manDeployed, 1)}</td>
                  <td><Util value={p.manUtil} /></td>
                  <td className="pf-num">{faNum(p.equipDeployed, 1)}</td>
                  <td><Util value={p.equipUtil} /></td>
                  <td className="pf-num">{faNum(p.equipIdle, 1)} / {faNum(p.equipUnavailable, 1)}</td>
                  <td className="pf-nowrap">{p.lastDate ? formatJalali(p.lastDate) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {silent.length > 0 && <p className="pf-note">بدون گزارش منابع در شش ماه گذشته: {silent.map((v) => v.input.name).join('، ')}. اگر در مرحلهٔ اجرا هستند، ظرفیتشان دیده نمی‌شود.</p>}
        </Panel>
      </>}

      <p className="pf-foot">
        {plans.length ? `مقایسه با برنامه از سقف منابع ماژول زمان‌بندی (${faNum(plans.length)} ردیف) انجام شده است.` : 'برای پروژه‌های این محدوده در ماژول زمان‌بندی سقف منابع تعریف نشده است؛ ستون «برنامه» تا تعریف آن خالی می‌ماند و کمبود فرضی نشان داده نمی‌شود.'}
      </p>
    </div>
  )
}

function ResTable({ title, icon, lines, name }: { title: string; icon: ReactNode; lines: ReturnType<typeof byResource>; name: Map<string, string> }) {
  return (
    <Panel title={title} icon={icon}>
      {!lines.length ? <Empty>داده‌ای ثبت نشده است.</Empty> : (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead><tr><th>منبع</th><th>در کارگاه</th><th>بهره‌وری</th><th>برنامه</th><th>پروژه‌ها</th></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.name}>
                <td><b>{l.name}</b></td>
                <td className="pf-num">{faNum(l.deployed, 1)}</td>
                <td><Util value={l.utilisation} /></td>
                <td className={`pf-num ${l.gap != null && l.gap < 0 ? 'pf-bad' : ''}`}>{l.planned == null ? '—' : `${faNum(l.planned)}${l.gap != null && l.gap !== 0 ? ` (${l.gap > 0 ? '+' : '−'}${faNum(Math.abs(l.gap), 1)})` : ''}`}</td>
                <td title={l.projects.map((p) => name.get(p.projectId) ?? '').join('\n')}>{faNum(l.projects.length)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
