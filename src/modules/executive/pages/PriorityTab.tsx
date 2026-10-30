import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { BarChart3, Gauge as GaugeIcon, Layers, Lock, PieChart, Save, ShieldCheck, SlidersHorizontal, Star } from 'lucide-react'
import { usePortfolioStore } from '../store/usePortfolioStore'
import { CRITERION_FA, DECISION_FA, normaliseWeights, type PfCriterion, type PfProjectView, type PfWeights } from '../lib/portfolioCore'
import { Empty, faNum, fmtMoney, HealthChip, Kpi, Panel } from '../components/pfUi'
import { Columns, Donut } from '../components/viz'
import { useDrill } from '../components/DrillSheet'

export const CRITERION_COLOR: Record<PfCriterion, string> = { strategic: '#a78bfa', value: '#0ea5e9', benefit: '#22c55e', risk: '#f97316', performance: '#eab308' }
const CRITERIA = Object.keys(CRITERION_FA) as PfCriterion[]

/** Transparent ranking: the weights, each project's contribution per criterion, and the two scores a portfolio owner records. */
export function PriorityTab({ views, currency }: { views: PfProjectView[]; currency: string }) {
  const st = usePortfolioStore()
  const [draft, setDraft] = useState<PfWeights>(st.weights)
  const [saved, setSaved] = useState(false)
  useEffect(() => setDraft(st.weights), [st.weights])
  const pct = normaliseWeights(draft)
  const dirty = CRITERIA.some((k) => draft[k] !== st.weights[k])

  const ranked = useMemo(() => views.filter((v) => !v.input.score?.mandatory).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)), [views])
  const mandatory = views.filter((v) => v.input.score?.mandatory)
  const unscoredList = views.filter((v) => !v.input.score || (v.input.score.strategic == null && v.input.score.benefit == null))
  const unscored = unscoredList.length
  const drill = useDrill((s) => s.drill)
  const ids = (l: PfProjectView[]) => l.map((v) => v.input.id)
  const scored = ranked.filter((v) => v.priority != null)
  const avgCov = views.length ? views.reduce((n, v) => n + v.coverage, 0) / views.length : 0
  const BUCKETS = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 101]] as const
  const BUCKET_COLOR = ['#f43f5e', '#f97316', '#f59e0b', '#14b8a6', '#22c55e']
  const inBucket = (b: readonly [number, number]) => scored.filter((v) => (v.priority as number) >= b[0] && (v.priority as number) < b[1])
  const bucketLabel = (b: readonly [number, number]) => `${faNum(b[0])}–${faNum(Math.min(100, b[1]))}`

  return (
    <div className="pf-stack">
      <div className="pf-kpis">
        <Kpi icon={<Layers size={14} />} label="پروژهٔ رتبه‌بندی‌شده" value={scored.length} sub={`از ${faNum(ranked.length)} پروژهٔ غیرالزامی`} onClick={() => drill('پروژه‌ها به ترتیب رتبهٔ اولویت', ids(scored))} />
        <Kpi icon={<Star size={14} />} label="میانگین امتیاز" value={scored.length ? Math.round(scored.reduce((n, v) => n + (v.priority as number), 0) / scored.length) : '—'} sub="از ۱۰۰" tone="#22c55e" />
        <Kpi icon={<GaugeIcon size={14} />} label="پوشش دادهٔ معیارها" value={`${faNum(Math.round(avgCov * 100))}٪`} sub="میانگین سهم وزن‌های دارای داده" tone={avgCov < 0.6 ? '#f59e0b' : '#0ea5e9'} />
        <Kpi icon={<Star size={14} />} label="بدون امتیاز راهبردی و منافع" value={unscored} sub="امتیاز را در جدول زیر ثبت کنید" tone={unscored ? '#f97316' : '#22c55e'} onClick={unscored ? () => drill('بدون امتیاز راهبردی و منافع', ids(unscoredList)) : undefined} />
        <Kpi icon={<ShieldCheck size={14} />} label="الزامی" value={mandatory.length} sub="خارج از رقابت اولویت" tone="#a78bfa" onClick={mandatory.length ? () => drill('پروژه‌های الزامی', ids(mandatory)) : undefined} />
      </div>

      <div className="pf-grid-2">
        <Panel title="ترکیب وزن‌ها" icon={<PieChart size={15} />} hint="با جابه‌جا کردن لغزنده‌های پایین، این نمودار و رتبه‌ها هم‌زمان تغییر می‌کنند.">
          <Donut parts={CRITERIA.map((k) => ({ key: k, label: CRITERION_FA[k].label, value: pct[k], color: CRITERION_COLOR[k] }))} center={`${faNum(CRITERIA.length)}`} sub="معیار" format={(n) => `${faNum(n)}٪`} />
        </Panel>
        <Panel title="توزیع امتیاز اولویت" icon={<BarChart3 size={15} />} hint="تعداد پروژه در هر بازهٔ امتیاز؛ روی هر ستون بزنید.">
          <Columns height={180} onPick={(k) => { const b = BUCKETS[+k]; drill(`امتیاز اولویت ${bucketLabel(b)}`, ids(inBucket(b))) }}
            items={BUCKETS.map((b, i) => ({ key: String(i), label: bucketLabel(b), value: inBucket(b).length, color: BUCKET_COLOR[i] }))} />
        </Panel>
      </div>
      <Panel title="وزن معیارهای اولویت" icon={<SlidersHorizontal size={15} />}
        hint="وزن‌ها نسبی‌اند و به درصد تبدیل می‌شوند. معیاری که برای پروژه‌ای داده ندارد از امتیاز آن پروژه کنار گذاشته می‌شود و بقیهٔ وزن‌ها دوباره نرمال می‌شوند؛ عدد پیش‌فرض ساختگی به کار نمی‌رود."
        right={st.canGovern ? <button type="button" className="pf-btn is-primary" disabled={!dirty} onClick={async () => { if (await st.saveWeights(draft)) { setSaved(true); setTimeout(() => setSaved(false), 1800) } }}><Save size={14} /> {saved ? 'ذخیره شد' : 'ذخیرهٔ وزن‌ها'}</button> : <span className="pf-muted"><Lock size={12} /> فقط حاکم سبد</span>}>
        <div className="pf-weights">
          {CRITERIA.map((k) => (
            <label key={k} className="pf-weight" style={{ '--c': CRITERION_COLOR[k] } as CSSProperties}>
              <span className="pf-weight-name"><i />{CRITERION_FA[k].label}<small>{CRITERION_FA[k].hint}</small></span>
              <input type="range" min={0} max={50} step={1} value={draft[k]} disabled={!st.canGovern} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} aria-label={`وزن ${CRITERION_FA[k].label}`} />
              <b>{faNum(pct[k])}٪</b>
            </label>
          ))}
        </div>
        <div className="pf-wstack" aria-hidden>{CRITERIA.map((k) => <i key={k} style={{ flexGrow: pct[k] || 0.0001, background: CRITERION_COLOR[k] }} />)}</div>
      </Panel>

      {unscored > 0 && <p className="pf-note"><Star size={12} /> {faNum(unscored)} پروژه هنوز امتیاز «سهم راهبردی» و «منافع» ندارند؛ اولویت آن‌ها فقط با معیارهای دارای داده محاسبه شده و ستون «پوشش» این را نشان می‌دهد.</p>}

      <Panel title="رتبهٔ اولویت پروژه‌ها" icon={<Star size={15} />} hint="نوار هر پروژه سهم هر معیار در امتیاز را نشان می‌دهد؛ رنگ‌ها مطابق وزن‌های بالا.">
        {!ranked.length ? <Empty>پروژه‌ای در این محدوده نیست.</Empty> : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead><tr><th>رتبه</th><th>پروژه</th><th>امتیاز و سهم معیارها</th><th>پوشش</th><th>سهم راهبردی</th><th>منافع</th><th>بودجه</th><th>سلامت</th><th>تصمیم</th></tr></thead>
              <tbody>
                {ranked.map((v) => <ScoreRow key={v.input.id} v={v} currency={currency} canScore={st.canScore} />)}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="پروژه‌های الزامی" icon={<ShieldCheck size={15} />} hint="تعهدات قانونی، قراردادی یا ایمنی که با بقیه برای اولویت رقابت نمی‌کنند. پرچم «الزامی» را در ستون امتیاز هر پروژه بزنید.">
        {!mandatory.length ? <Empty>پروژهٔ الزامی علامت نخورده است.</Empty> : (
          <div className="pf-table-wrap">
            <table className="pf-table">
              <thead><tr><th>پروژه</th><th>یادداشت</th><th>بودجه</th><th>سلامت</th><th /></tr></thead>
              <tbody>{mandatory.map((v) => (
                <tr key={v.input.id}><td><b>{v.input.name}</b></td><td className="pf-muted">{v.input.score?.note || '—'}</td><td>{fmtMoney(v.bac, '')}</td><td><HealthChip health={v.health} /></td>
                  <td>{st.canScore && <button type="button" className="pf-btn" onClick={() => void st.saveScore(v.input.id, { strategic: v.input.score?.strategic ?? null, benefit: v.input.score?.benefit ?? null, mandatory: false, note: v.input.score?.note ?? '' })}>برداشتن پرچم</button>}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

function ScoreRow({ v, currency, canScore }: { v: PfProjectView; currency: string; canScore: boolean }) {
  const saveScore = usePortfolioStore((s) => s.saveScore)
  const names = usePortfolioStore((s) => s.names)
  const sc = v.input.score
  const set = (patch: Partial<{ strategic: number | null; benefit: number | null; mandatory: boolean }>) =>
    void saveScore(v.input.id, { strategic: sc?.strategic ?? null, benefit: sc?.benefit ?? null, mandatory: sc?.mandatory ?? false, note: sc?.note ?? '', ...patch })
  const stars = (key: 'strategic' | 'benefit') => (
    <div className="pf-stars" role="radiogroup" aria-label={CRITERION_FA[key].label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={sc?.[key] === n} disabled={!canScore} className={(sc?.[key] ?? 0) >= n ? 'is-on' : ''}
          onClick={() => set({ [key]: sc?.[key] === n ? null : n })} title={`${faNum(n)} از ۵`}>{faNum(n)}</button>
      ))}
    </div>
  )
  return (
    <tr>
      <td>{v.rank ? <span className="pf-rank">{faNum(v.rank)}</span> : <span className="pf-muted">—</span>}</td>
      <td>
        <button type="button" className="vz-link" onClick={() => useDrill.getState().open(v.input.id)}>{v.input.name}</button>
        {sc?.updatedAt && <small className="pf-muted block">امتیاز: {names.get(sc.updatedBy ?? '') ?? '—'}</small>}
        {canScore && <button type="button" className="pf-link block" onClick={() => set({ mandatory: true })}>علامت «الزامی»</button>}
      </td>
      <td>
        {v.priority == null ? <span className="pf-muted">بدون داده</span> : (
          <div className="pf-contrib">
            <b>{faNum(v.priority)}</b>
            <span className="pf-contrib-bar" title={v.contributions.map((c) => `${CRITERION_FA[c.criterion].label}: ${c.value == null ? 'بدون داده' : faNum(c.points, 1)}`).join('\n')}>
              {v.contributions.filter((c) => c.points > 0).map((c) => <i key={c.criterion} style={{ width: `${c.points}%`, background: CRITERION_COLOR[c.criterion] }} />)}
            </span>
          </div>
        )}
      </td>
      <td><span className={v.coverage < 0.6 ? 'pf-warn' : ''}>{faNum(Math.round(v.coverage * 100))}٪</span></td>
      <td>{stars('strategic')}</td>
      <td>{stars('benefit')}</td>
      <td className="pf-nowrap">{fmtMoney(v.bac, '')}<small className="pf-muted block">{currency}</small></td>
      <td><HealthChip health={v.health} /></td>
      <td>{v.lastDecision ? <span className="pf-dec" style={{ '--c': DECISION_FA[v.lastDecision.decision].color } as CSSProperties}>{DECISION_FA[v.lastDecision.decision].label}</span> : <span className="pf-muted">—</span>}</td>
    </tr>
  )
}
