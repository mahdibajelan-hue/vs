import { useEffect, useMemo, useState } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Archive, FlaskConical, Lock, Plus, RotateCcw, Save, Sparkles, Wallet } from 'lucide-react'
import type { MasterProject } from '../../masterdata/types'
import { isoToJalali, JALALI_MONTHS, todayJalali } from '../../../lib/jalali'
import type { PfProjectView } from '../lib/portfolioCore'
import { ACTION_FA, autoFit, buildProfile, evaluate, fundingOrder, monthIndex, SOURCE_FA, yearOf, type ScAction, type ScChoice, type ScProject } from '../lib/scenarioCore'
import { usePortfolioStore } from '../store/usePortfolioStore'
import { usePortfolioPlanningStore, type PfScenario } from '../store/usePortfolioPlanningStore'
import { Empty, faNum, fmtMoney, Kpi, Panel } from '../components/pfUi'

const BN = 1e9
const monthOfIso = (iso: string | null) => { const j = iso ? isoToJalali(iso) : null; return j ? monthIndex(j.jy, j.jm) : null }
const monthLabel = (m: number) => `${JALALI_MONTHS[m % 12]} ${faNum(yearOf(m)).replace(/٬/g, '')}`
const yearLabel = (jy: number) => faNum(jy).replace(/٬/g, '')

interface Draft { id?: string; name: string; note: string; caps: Record<number, number>; choices: Record<string, ScChoice>; terminationPct: number }
const blank = (): Draft => ({ name: '', note: '', caps: {}, choices: {}, terminationPct: 0 })

/**
 * What-if on the portfolio's remaining spend: defer or stop projects and see each Jalali year against its budget
 * ceiling. Assumptions are named on the page — every profile says whether it follows a cash plan or is spread evenly.
 */
export function ScenarioTab({ views, projects, currency }: { views: PfProjectView[]; projects: MasterProject[]; currency: string }) {
  const canGovern = usePortfolioStore((s) => s.canGovern)
  const pl = usePortfolioPlanningStore()
  useEffect(() => { if (!usePortfolioPlanningStore.getState().scenariosLoaded) void usePortfolioPlanningStore.getState().loadScenarios() }, [])

  const now = useMemo(() => { const t = todayJalali(); return monthIndex(t.jy, t.jm) }, [])
  const sc: ScProject[] = useMemo(() => views.map((v) => {
    const mp = projects.find((p) => p.id === v.input.id)
    const finish = monthOfIso(mp?.forecastFinishDate ?? mp?.revisedCompletionDate ?? mp?.plannedFinishDate ?? null)
    return buildProfile({
      id: v.input.id, name: v.input.name, rank: v.rank, priority: v.priority, mandatory: !!v.input.score?.mandatory,
      costAtCompletion: v.eac ?? v.bac, progressPct: v.input.snapshot ? v.input.snapshot.actual : null,
      now, cashPlan: pl.cashPlans.get(v.input.id), finishMonth: finish,
    })
  }), [views, projects, pl.cashPlans, now])

  const [draft, setDraft] = useState<Draft>(blank)
  const [unfunded, setUnfunded] = useState<string[]>([])
  const [savedFlash, setSavedFlash] = useState(false)
  const scenario = { caps: draft.caps, choices: draft.choices, terminationPct: draft.terminationPct }
  const res = useMemo(() => evaluate(sc, scenario), [sc, draft]) // eslint-disable-line react-hooks/exhaustive-deps
  const base = useMemo(() => evaluate(sc, { caps: draft.caps, choices: {}, terminationPct: 0 }), [sc, draft.caps])

  // the years worth showing: from this year to the last year any project still spends in, at most 8
  const thisYear = yearOf(now)
  const lastYear = Math.min(thisYear + 7, Math.max(thisYear + 2, ...res.years.map((y) => y.jy), ...base.years.map((y) => y.jy)))
  const years = Array.from({ length: lastYear - thisYear + 1 }, (_, i) => thisYear + i)
  const chart = years.map((jy) => ({
    jy: yearLabel(jy),
    scenario: (res.years.find((y) => y.jy === jy)?.demand ?? 0) / BN,
    base: (base.years.find((y) => y.jy === jy)?.demand ?? 0) / BN,
    cap: draft.caps[jy] ? draft.caps[jy] / BN : null,
    over: res.overCapYears.includes(jy),
  }))

  const ordered = fundingOrder(sc)
  const sources = sc.reduce((m, p) => m.set(p.source, (m.get(p.source) ?? 0) + 1), new Map<string, number>())
  const unknownProgress = sc.filter((p) => !p.progressKnown && p.remaining > 0).length

  const setChoice = (id: string, c: ScChoice) => setDraft((d) => ({ ...d, choices: { ...d.choices, [id]: c } }))
  const load = (s: PfScenario | null) => { setUnfunded([]); setDraft(s ? { id: s.id, name: s.name, note: s.note, caps: s.caps, choices: s.choices, terminationPct: s.terminationPct } : blank()) }
  const fit = () => { const r = autoFit(sc, scenario); setUnfunded(r.unfunded); setDraft((d) => ({ ...d, choices: r.choices })) }
  const save = async () => {
    const s = await pl.saveScenario({ ...draft, name: draft.name.trim() || `سناریو ${new Date().toLocaleDateString('fa-IR')}` })
    if (s) { setDraft((d) => ({ ...d, id: s.id, name: s.name })); setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800) }
  }

  if (!sc.length) return <Empty>پروژه‌ای در این محدوده نیست.</Empty>

  return (
    <div className="pf-stack">
      <Panel title="سناریوی سبد" icon={<FlaskConical size={15} />}
        hint="پروژه‌ها را به تعویق بیندازید یا متوقف کنید و هزینهٔ باقی‌ماندهٔ هر سال را با سقف بودجهٔ همان سال بسنجید. تا وقتی ذخیره نکنید چیزی ثبت نمی‌شود و هیچ تصمیمی روی پروژه اعمال نمی‌شود."
        right={
          <div className="pf-sc-actions">
            <select aria-label="سناریوهای ذخیره‌شده" value={draft.id ?? ''} onChange={(e) => load(pl.scenarios.find((s) => s.id === e.target.value) ?? null)}>
              <option value="">سناریوی جدید (ذخیره‌نشده)</option>
              {pl.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {draft.id && <button type="button" className="pf-btn" onClick={() => load(null)}><Plus size={14} /> جدید</button>}
          </div>
        }>
        <div className="pf-sc-head">
          <label className="pf-field"><span>نام سناریو</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="مثلاً سقف ۱۴۰۵ با تعویق طرح‌های جدید" /></label>
          <label className="pf-field pf-field-sm"><span>هزینهٔ خاتمه (٪ از باقی‌مانده)</span><input type="number" min={0} max={100} value={draft.terminationPct} onChange={(e) => setDraft({ ...draft, terminationPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></label>
        </div>
        <div className="pf-caps" role="group" aria-label="سقف بودجهٔ سالانه">
          <span className="pf-caps-title"><Wallet size={13} /> سقف بودجهٔ سالانه (میلیارد {currency})</span>
          {years.map((jy) => (
            <label key={jy} className={res.overCapYears.includes(jy) ? 'is-over' : ''}>
              <small>{yearLabel(jy)}</small>
              <input type="number" min={0} inputMode="decimal" placeholder="بدون سقف" value={draft.caps[jy] ? Math.round(draft.caps[jy] / BN) : ''}
                onChange={(e) => { const v = Number(e.target.value); setDraft((d) => { const caps = { ...d.caps }; if (v > 0) caps[jy] = v * BN; else delete caps[jy]; return { ...d, caps } }) }} />
              <small className="pf-muted">نیاز پایه: {faNum((base.years.find((y) => y.jy === jy)?.demand ?? 0) / BN)}</small>
            </label>
          ))}
        </div>
        <div className="pf-sc-buttons">
          <button type="button" className="pf-btn is-primary" onClick={fit} disabled={!Object.keys(draft.caps).length} title={Object.keys(draft.caps).length ? '' : 'ابتدا دست‌کم برای یک سال سقف بگذارید'}><Sparkles size={14} /> برازش خودکار با سقف</button>
          <button type="button" className="pf-btn" onClick={() => { setUnfunded([]); setDraft((d) => ({ ...d, choices: {} })) }}><RotateCcw size={14} /> همه طبق برنامه</button>
          {canGovern ? <>
            <button type="button" className="pf-btn" onClick={() => void save()}><Save size={14} /> {savedFlash ? 'ذخیره شد' : draft.id ? 'ذخیرهٔ تغییرات' : 'ذخیرهٔ سناریو'}</button>
            {draft.id && <button type="button" className="pf-btn" onClick={async () => { if (draft.id && await pl.archiveScenario(draft.id)) load(null) }}><Archive size={14} /> بایگانی</button>}
          </> : <span className="pf-muted"><Lock size={12} /> ذخیره فقط در اختیار مدیر سبد</span>}
        </div>
        <p className="pf-note">برازش خودکار پروژه‌ها را به ترتیب اولویت (اول پروژه‌های الزامی) تأمین می‌کند و هر پروژه را که در سقف نمی‌گنجد، در گام‌های سه‌ماهه تا ۳۶ ماه به تعویق می‌اندازد. هیچ پروژه‌ای را خودکار متوقف نمی‌کند؛ توقف تصمیم شماست.</p>
        {unfunded.length > 0 && <p className="pf-note pf-bad">حتی با ۳۶ ماه تعویق در سقف نمی‌گنجند: {unfunded.map((id) => sc.find((p) => p.id === id)?.name).join('، ')}. سقف را بازنگری کنید یا دربارهٔ توقف تصمیم بگیرید.</p>}
      </Panel>

      <div className="pf-kpis">
        <Kpi label="هزینهٔ باقی‌ماندهٔ سبد" value={fmtMoney(res.totalSpend, '')} sub={`پایه: ${fmtMoney(res.baseSpend, '')} ${currency}`} tone="#0ea5e9" />
        <Kpi label="آزادشده در این سناریو" value={fmtMoney(res.released, '')} sub="با توقف پروژه‌ها، منهای هزینهٔ خاتمه" tone={res.released > 0 ? '#22c55e' : '#64748b'} />
        <Kpi label="سال‌های بیش از سقف" value={faNum(res.overCapYears.length)} sub={res.overCapYears.length ? res.overCapYears.map(yearLabel).join('، ') : Object.keys(draft.caps).length ? 'همهٔ سال‌ها در سقف' : 'سقفی تعیین نشده'} tone={res.overCapYears.length ? '#ef4444' : '#22c55e'} />
        <Kpi label="ارزش حفظ‌شده" value={res.valueKept == null ? '—' : `${faNum(res.valueKept * 100)}٪`} sub="سهم «اولویت × هزینهٔ باقی‌مانده» پروژه‌های ادامه‌دار" tone="#a78bfa" />
        <Kpi label="تعویق / توقف" value={`${faNum(res.deferred.length)} / ${faNum(res.terminated.length)}`} sub="پروژه" tone="#f97316" />
      </div>

      <Panel title="نیاز نقدی سالانه در برابر سقف" icon={<Wallet size={15} />} hint={`میلیارد ${currency}. ستون = این سناریو (قرمز = بیش از سقف)، خط‌چین = برنامهٔ پایه، خط پله‌ای = سقف.`}>
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chart} margin={{ top: 10, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="jy" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={56} tickFormatter={(v) => faNum(Number(v))} />
              <Tooltip isAnimationActive={false} contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', borderRadius: 10, fontSize: 12, direction: 'rtl' }}
                formatter={(v, n) => [`${faNum(Number(v))} میلیارد`, n === 'scenario' ? 'این سناریو' : n === 'base' ? 'برنامهٔ پایه' : 'سقف']} />
              <Legend formatter={(n) => (n === 'scenario' ? 'این سناریو' : n === 'base' ? 'برنامهٔ پایه' : 'سقف')} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="scenario" radius={[6, 6, 0, 0]} maxBarSize={46}>
                {chart.map((d) => <Cell key={d.jy} fill={d.over ? '#ef4444' : '#6366f1'} />)}
              </Bar>
              <Line dataKey="base" stroke="var(--text-muted)" strokeDasharray="5 4" dot={false} strokeWidth={2} />
              <Line dataKey="cap" type="stepAfter" stroke="#f5b31b" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="pf-note">
          مبنای پروفیل هزینه: {[...sources.entries()].map(([k, n]) => `${SOURCE_FA[k as keyof typeof SOURCE_FA]} ${faNum(n)}`).join(' · ')}.
          {unknownProgress > 0 && ` برای ${faNum(unknownProgress)} پروژه پیشرفت در دسترس نبود و کل بودجه باقی‌مانده فرض شد.`}
          {' '}هزینهٔ باقی‌مانده = (EAC، وگرنه بودجه) × (۱ − پیشرفت واقعی).
        </p>
      </Panel>

      <Panel title="پروژه‌ها در این سناریو" icon={<FlaskConical size={15} />} hint="به ترتیب تأمین: الزامی‌ها، سپس رتبهٔ اولویت. مبالغ سالانه به میلیارد.">
        <div className="pf-table-wrap">
          <table className="pf-table pf-sc-table">
            <thead><tr><th>رتبه</th><th>پروژه</th><th>باقی‌مانده</th><th>مبنای پروفیل</th><th>اقدام</th>{years.map((jy) => <th key={jy} className={res.overCapYears.includes(jy) ? 'pf-bad' : ''}>{yearLabel(jy)}</th>)}</tr></thead>
            <tbody>
              {ordered.map((p) => {
                const c = draft.choices[p.id] ?? { action: 'base' as ScAction, deferMonths: 0 }
                const endM = p.profile.length ? p.startMonth + p.profile.length - 1 + (c.action === 'defer' ? c.deferMonths : 0) : null
                return (
                  <tr key={p.id} className={c.action === 'terminate' ? 'is-stopped' : ''}>
                    <td>{p.mandatory ? <span className="pf-tag">الزامی</span> : p.rank ? <span className="pf-rank">{faNum(p.rank)}</span> : <span className="pf-muted">—</span>}</td>
                    <td><b>{p.name}</b>{endM != null && c.action !== 'terminate' && <small className="pf-muted block">پایان هزینه: {monthLabel(endM)}</small>}</td>
                    <td className="pf-nowrap">{fmtMoney(p.remaining, '')}</td>
                    <td><small className={p.source === 'cash_plan' ? 'pf-good' : 'pf-muted'}>{SOURCE_FA[p.source]}</small></td>
                    <td>
                      <div className="pf-sc-choice">
                        <select aria-label={`اقدام برای ${p.name}`} value={c.action} disabled={p.remaining <= 0} onChange={(e) => setChoice(p.id, { action: e.target.value as ScAction, deferMonths: e.target.value === 'defer' ? Math.max(3, c.deferMonths) : 0 })}>
                          {(Object.keys(ACTION_FA) as ScAction[]).map((a) => <option key={a} value={a}>{ACTION_FA[a]}</option>)}
                        </select>
                        {c.action === 'defer' && <label className="pf-defer"><input type="number" min={1} max={60} value={c.deferMonths} onChange={(e) => setChoice(p.id, { action: 'defer', deferMonths: Math.min(60, Math.max(1, Number(e.target.value) || 1)) })} aria-label="ماه تعویق" /> ماه</label>}
                      </div>
                    </td>
                    {years.map((jy) => { const v = res.years.find((y) => y.jy === jy)?.byProject.get(p.id) ?? 0; return <td key={jy} className="pf-nowrap pf-num">{v ? faNum(v / BN) : <span className="pf-muted">·</span>}</td> })}
                  </tr>
                )
              })}
            </tbody>
            <tfoot><tr><td colSpan={5}><b>جمع سال</b></td>{years.map((jy) => { const y = res.years.find((x) => x.jy === jy); return <td key={jy} className={`pf-num ${res.overCapYears.includes(jy) ? 'pf-bad' : ''}`}><b>{faNum((y?.demand ?? 0) / BN)}</b>{y?.cap ? <small className="pf-muted block">سقف {faNum(y.cap / BN)}</small> : null}</td> })}</tr></tfoot>
          </table>
        </div>
      </Panel>
    </div>
  )
}
