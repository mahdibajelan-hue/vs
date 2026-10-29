import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, CircleSlash, HelpCircle, Loader2, Plus } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { jd, BASIS_FA, DEFINITIONS, DOMAIN_FA, WARNING_KIND_FA, compareProjects, deviations, earlyWarnings, rootCauses, suggestions, type Domain, type ProjectFacts, type Severity } from '../lib/analyticsCore'
import { useAnalyticsStore, type CauseVerdict } from '../store/useAnalyticsStore'
import { useReportingStore } from '../store/useReportingStore'
import { CONF_FA, FactsGate, Freshness, Panel, ScopeBar, Tag, confTone, fa, inScope, type Scope } from '../components/rpx'
import { DecisionCenterPage } from './DecisionCenterPage'

export type AnalysisSub = 'deviations' | 'causes' | 'warnings' | 'compare' | 'actions' | 'decisions'
const SUBS: { id: AnalysisSub; label: string }[] = [
  { id: 'deviations', label: 'تحلیل انحرافات' }, { id: 'causes', label: 'علل ریشه‌ای' }, { id: 'warnings', label: 'هشدارهای پیش‌نگر' },
  { id: 'compare', label: 'تحلیل بین‌پروژه‌ای' }, { id: 'actions', label: 'پیشنهاد اقدام اصلاحی' }, { id: 'decisions', label: 'مرکز تصمیم' },
]
const SEV_FA: Record<Severity, string> = { material: 'مهم', watch: 'زیر نظر', ok: 'در حد مجاز', none: 'داده ندارد' }
const sevTone = (s: Severity) => (s === 'material' ? 'bad' : s === 'watch' ? 'warn' : s === 'ok' ? 'good' : 'none') as 'bad' | 'warn' | 'good' | 'none'

export function AnalysisCenterPage({ sub, onSub, scope, onScope }: { sub: AnalysisSub; onSub: (s: AnalysisSub) => void; scope: Scope; onScope: (s: Scope) => void }) {
  return (
    <div className="rpx">
      <nav className="rpx-subnav no-print" role="tablist" aria-label="مرکز تحلیل">
        {SUBS.map((s) => <button key={s.id} role="tab" aria-selected={sub === s.id} onClick={() => onSub(s.id)}>{s.label}</button>)}
      </nav>
      <div className="rpx-bar no-print" style={{ justifyContent: 'space-between' }}><ScopeBar scope={scope} onChange={onScope} /><Freshness /></div>
      {sub === 'decisions' ? <Decisions scope={scope} /> : (
        <FactsGate>{(all) => {
          const list = all.filter((f) => inScope(f, scope))
          if (!list.length) return <p className="rpx-empty">پروژه‌ای در این محدوده در دسترس شما نیست.</p>
          return sub === 'deviations' ? <Deviations list={list} /> : sub === 'causes' ? <Causes list={list} /> : sub === 'warnings' ? <Warnings list={list} /> : sub === 'compare' ? <Compare list={list} /> : <Actions list={list} />
        }}</FactsGate>
      )}
    </div>
  )
}

/* ── deviations ────────────────────────────────────────────────────── */
function Deviations({ list }: { list: ProjectFacts[] }) {
  const [domain, setDomain] = useState<Domain | 'all'>('all')
  const [onlyMaterial, setOnlyMaterial] = useState(true)
  const all = useMemo(() => list.flatMap(deviations), [list])
  const rows = all.filter((d) => (domain === 'all' || d.domain === domain) && (!onlyMaterial || d.severity === 'material' || d.severity === 'watch'))
    .sort((a, b) => ({ material: 0, watch: 1, ok: 2, none: 3 })[a.severity] - ({ material: 0, watch: 1, ok: 2, none: 3 })[b.severity] || (a.variance ?? 0) - (b.variance ?? 0))
  const chart = (Object.keys(DOMAIN_FA) as Domain[]).map((d) => ({ name: DOMAIN_FA[d], material: all.filter((x) => x.domain === d && x.severity === 'material').length, watch: all.filter((x) => x.domain === d && x.severity === 'watch').length, none: all.filter((x) => x.domain === d && x.severity === 'none').length }))
  const multi = list.length > 1
  return (
    <>
      <Panel title="انحراف به تفکیک حوزه" sub={`${fa(list.length)} پروژه · تعداد شاخص‌های مهم و زیر نظر در هر حوزه`} help="هر حوزه با یک تعریف واحد سنجیده می‌شود (جدول زیر). «داده ندارد» یعنی منبع آن حوزه برای پروژه ثبت نشده، نه اینکه انحراف صفر باشد.">
        <div style={{ height: 220 }} dir="ltr">
          <ResponsiveContainer><BarChart data={chart} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={0} angle={-25} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
            <Tooltip isAnimationActive={false} contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', fontSize: 12, direction: 'rtl' }} formatter={(v, k) => [fa(Number(v ?? 0)), k === 'material' ? 'مهم' : k === 'watch' ? 'زیر نظر' : 'داده ندارد']} />
            <Bar dataKey="material" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
            <Bar dataKey="watch" stackId="a" fill="#f59e0b" />
            <Bar dataKey="none" stackId="a" fill="#94a3b855" radius={[4, 4, 0, 0]} />
          </BarChart></ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="جدول انحرافات" sub="مقدار، مرجع، اهمیت، روند، منبع و تعریف هر شاخص"
        actions={<label className="rpx-muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={onlyMaterial} onChange={(e) => setOnlyMaterial(e.target.checked)} /> فقط مهم و زیر نظر</label>}>
        <div className="rpx-bar" style={{ marginBottom: 8 }}>
          <button className="rpx-chip" aria-pressed={domain === 'all'} onClick={() => setDomain('all')}>همه</button>
          {(Object.keys(DOMAIN_FA) as Domain[]).map((d) => <button key={d} className="rpx-chip" aria-pressed={domain === d} onClick={() => setDomain(d)}>{DOMAIN_FA[d]}</button>)}
        </div>
        {!rows.length ? <p className="rpx-empty">موردی با این فیلتر نیست.</p> : (
          <div className="rpx-table-wrap"><table className="rpx-table"><thead><tr>{multi && <th>پروژه</th>}<th>حوزه</th><th>شاخص</th><th>مقدار</th><th>مرجع</th><th>اهمیت</th><th>روند</th><th>منبع</th></tr></thead><tbody>
            {rows.slice(0, 200).map((d) => (
              <tr key={`${d.projectId}-${d.key}`} className={`tone-${sevTone(d.severity)}`}>
                {multi && <td>{d.project}</td>}<td>{DOMAIN_FA[d.domain]}</td>
                <td>{d.metric} <HelpDef text={`${d.definition}${d.note ? ` — ${d.note}` : ''}`} /></td>
                <td><b>{d.actual}</b></td><td className="rpx-sec">{d.reference}</td>
                <td><Tag tone={sevTone(d.severity)}>{SEV_FA[d.severity]}</Tag></td>
                <td className="rpx-sec">{d.trend == null ? '—' : d.trend === 'worsening' ? 'رو به بدتر' : d.trend === 'improving' ? 'رو به بهبود' : d.trend === 'flat' ? 'ثابت' : 'دادهٔ کافی نیست'}</td>
                <td className="rpx-muted">{d.source}{d.asOf ? ` · ${jd(d.asOf)}` : ''}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Panel>
    </>
  )
}
function HelpDef({ text }: { text: string }) {
  const [o, setO] = useState(false)
  return <span className="rpx-help"><button type="button" className="rpx-help-btn" aria-label="تعریف شاخص" aria-expanded={o} onClick={() => setO(!o)} onBlur={() => setO(false)}>؟</button>{o && <span role="note" className="rpx-help-pop">{text}</span>}</span>
}

/* ── root causes ───────────────────────────────────────────────────── */
const VERDICT_FA: Record<CauseVerdict, string> = { confirmed: 'تأییدشده توسط کارشناس', rejected: 'ردشده', needs_data: 'نیازمند دادهٔ بیشتر' }
function Causes({ list }: { list: ProjectFacts[] }) {
  const reviews = useAnalyticsStore((s) => s.reviews)
  const review = useAnalyticsStore((s) => s.reviewCause)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<Record<string, string>>({})
  const byProject = list.map((f) => ({ f, cs: rootCauses(f) })).filter((x) => x.cs.length)
  const act = async (pid: string, key: string, text: string, v: CauseVerdict) => {
    setBusy(`${pid}|${key}`); setErr(null)
    const e = await review(pid, key, text, v, note[`${pid}|${key}`] ?? '')
    setBusy(null); if (e) setErr(e)
  }
  return (
    <>
      <Panel title="روش تحلیل علل" help="علت‌ها از کنار هم گذاشتن داده‌های چند ماژول به دست می‌آیند: گیت‌های چرخهٔ عمر، پیشرفت رشته‌ها و وزن‌هایشان، توقفات گزارش روزانه، مسائل باز، تغییرات تصویب‌شده و ارزیابی ریسک.">
        <div className="rpx-bar"><Tag tone="bad">{BASIS_FA.direct}</Tag><span className="rpx-muted">در خودِ رکورد آمده یا حساب شده: گیت مسدود، روزهای تصویب‌شدهٔ تغییر، سهم حسابی هر رشته در فاصله.</span></div>
        <div className="rpx-bar" style={{ marginTop: 4 }}><Tag tone="warn">{BASIS_FA.associated}</Tag><span className="rpx-muted">هم‌زمان با انحراف دیده شده (توقفات، مسائل معوق هم‌حوزه). همبستگی است، نه علت اثبات‌شده.</span></div>
        <div className="rpx-bar" style={{ marginTop: 4 }}><Tag tone="none">{BASIS_FA.hypothesis}</Tag><span className="rpx-muted">الگویی که ارزش بررسی دارد ولی شاهدش کم است.</span></div>
        {err && <p className="rpx-caveats" style={{ marginTop: 8 }}>{err}</p>}
      </Panel>
      {!byProject.length && <p className="rpx-empty">در این محدوده علتی با پشتوانهٔ داده پیدا نشد — یا انحراف مهمی نیست، یا داده‌های مرتبط ثبت نشده‌اند.</p>}
      {byProject.map(({ f, cs }) => (
        <Panel key={f.id} title={f.name} sub={`${fa(cs.length)} علت محتمل · ${CONF_FA[f.report.confidence]} دادهٔ پروژه`}>
          <div className="rpx-items">{cs.map((c) => {
            const k = `${f.id}|${c.key}`, r = reviews.get(k)
            return (
              <div key={c.key} className={`rpx-item t-${c.basis === 'direct' ? 'bad' : c.basis === 'associated' ? 'warn' : 'none'}`} style={{ borderInlineStartColor: 'var(--c)' }}>
                <div className="rpx-item-head"><b>{c.text}</b><Tag tone={c.basis === 'direct' ? 'bad' : c.basis === 'associated' ? 'warn' : 'none'}>{BASIS_FA[c.basis]}</Tag><Tag tone={confTone(c.confidence)}>{CONF_FA[c.confidence]}</Tag>{r && <Tag tone={r.verdict === 'confirmed' ? 'good' : r.verdict === 'rejected' ? 'none' : 'acc'}>{VERDICT_FA[r.verdict]}</Tag>}</div>
                <p>اثر: {c.effect} ({DOMAIN_FA[c.effectDomain]})</p>
                <ul>{c.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
                <p className="rpx-note">برای بررسی: {c.check}</p>
                {r?.note && <p className="rpx-note">یادداشت بازبین: {r.note}</p>}
                <div className="rpx-actions-row no-print">
                  <input className="rpx-input" style={{ flex: 1, minWidth: '10rem' }} placeholder="یادداشت بازبینی (اختیاری)" value={note[k] ?? ''} onChange={(e) => setNote({ ...note, [k]: e.target.value })} />
                  <button className="rpx-btn" disabled={busy === k} onClick={() => act(f.id, c.key, c.text, 'confirmed')}>{busy === k ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} تأیید علت</button>
                  <button className="rpx-btn" disabled={busy === k} onClick={() => act(f.id, c.key, c.text, 'needs_data')}><HelpCircle size={12} /> دادهٔ بیشتر</button>
                  <button className="rpx-btn" disabled={busy === k} onClick={() => act(f.id, c.key, c.text, 'rejected')}><CircleSlash size={12} /> رد</button>
                </div>
              </div>
            )
          })}</div>
        </Panel>
      ))}
    </>
  )
}

/* ── early warnings ────────────────────────────────────────────────── */
function Warnings({ list }: { list: ProjectFacts[] }) {
  const ws = useMemo(() => list.flatMap(earlyWarnings), [list])
  const group = (k: 'rule' | 'statistical') => ws.filter((w) => w.kind === k)
  const card = (w: (typeof ws)[number]) => (
    <div key={`${w.projectId}-${w.key}`} className={`rpx-item t-${w.severity === 'high' ? 'bad' : 'warn'}`} style={{ borderInlineStartColor: 'var(--c)' }}>
      <div className="rpx-item-head"><b>{list.length > 1 ? `${w.project}: ` : ''}{w.title}</b><Tag tone={w.severity === 'high' ? 'bad' : 'warn'}>{w.severity === 'high' ? 'اهمیت بالا' : 'اهمیت متوسط'}</Tag><Tag tone={confTone(w.confidence)}>{CONF_FA[w.confidence]}</Tag></div>
      <p>{w.reason}</p>
      <ul>{w.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
      <dl className="rpx-fields"><div><dt>تاریخ</dt><dd>{jd(w.date)}</dd></div><div><dt>اقدام پیشنهادی</dt><dd>{w.suggestion}</dd></div></dl>
    </div>
  )
  return (
    <div className="rpx-grid2">
      <Panel title={WARNING_KIND_FA.rule} sub={`${fa(group('rule').length)} هشدار · از عبور یک شاخص از آستانه`} help="هشدار قاعده‌محور وقتی صادر می‌شود که یک وضعیت ثبت‌شده از آستانهٔ مصوب بگذرد: تصمیم یا مسئلهٔ بحرانی معوق، عقب‌ماندگی رشته‌ای که رشتهٔ بعدی به آن وابسته است، انباشت مسائل، تکرار یک علت توقف، دادهٔ کهنه.">
        <div className="rpx-items">{group('rule').length ? group('rule').map(card) : <p className="rpx-empty">هشدار قاعده‌محوری نیست.</p>}</div>
      </Panel>
      <div style={{ display: 'grid', gap: '.85rem', alignContent: 'start' }}>
        <Panel title={WARNING_KIND_FA.statistical} sub={`${fa(group('statistical').length)} هشدار · از ادامهٔ روند ثبت‌شده`} help="برازش خطی کمترین مربعات روی نقاط ماهانهٔ ثبت‌شده. با کمتر از حداقل نقاط (تنظیمات) صادر نمی‌شود؛ با ۶ نقطه یا بیشتر اطمینان متوسط، کمتر از آن پایین. اطمینان بالا هرگز داده نمی‌شود.">
          <div className="rpx-items">{group('statistical').length ? group('statistical').map(card) : <p className="rpx-empty">روندی با دادهٔ کافی برای هشدار آماری نیست.</p>}</div>
        </Panel>
        <Panel title="پیش‌بینی هوش مصنوعی" sub="غیرفعال">
          <p className="rpx-note">پیش‌بینی مبتنی بر یادگیری ماشین فعال نیست: تاریخچهٔ پروژه‌های تکمیل‌شده برای آموزش و سنجش اعتبار چنین مدلی در سامانه وجود ندارد. تا آن زمان فقط هشدار قاعده‌محور و آماری با روش اعلام‌شده صادر می‌شود.</p>
        </Panel>
      </div>
    </div>
  )
}

/* ── cross-project ─────────────────────────────────────────────────── */
function Compare({ list }: { list: ProjectFacts[] }) {
  const { rows, patterns } = useMemo(() => compareProjects(list), [list])
  const groups = [...new Set(rows.map((r) => r.group))]
  const COLORS = ['#14b8a6', '#6366f1', '#f59e0b', '#ec4899', '#0ea5e9', '#84cc16']
  const chart = rows.filter((r) => r.gap != null).sort((a, b) => (a.gap as number) - (b.gap as number)).map((r) => ({ name: r.project.length > 22 ? `${r.project.slice(0, 22)}…` : r.project, gap: Number((r.gap as number).toFixed(1)), g: groups.indexOf(r.group) }))
  if (list.length < 2) return <p className="rpx-empty">مقایسه برای بیش از یک پروژه معنا دارد؛ محدودهٔ بزرگ‌تری انتخاب کنید.</p>
  return (
    <>
      <Panel title="فاصله از برنامه — رنگ هر میله مرحلهٔ پروژه" sub="منفی یعنی عقب از برنامه" help="رتبه‌بندی فقط درون پروژه‌های هم‌مرحله انجام می‌شود. پروژه‌ای در مرحلهٔ مهندسی با پروژه‌ای در اجرا یا راه‌اندازی قابل مقایسه نیست؛ دامنه و نوع قرارداد هم در جدول آمده تا تفاوت‌ها دیده شوند.">
        <div className="rpx-bar" style={{ marginBottom: 6 }}>{groups.map((g, i) => <Tag key={g}><i style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], display: 'inline-block' }} /> {g}</Tag>)}</div>
        <div style={{ height: Math.max(180, chart.length * 26) }} dir="ltr">
          <ResponsiveContainer><BarChart data={chart} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
            <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} orientation="right" />
            <Tooltip isAnimationActive={false} contentStyle={{ background: 'var(--bg-panel-solid)', border: '1px solid var(--border-soft)', fontSize: 12, direction: 'rtl' }} formatter={(v) => [`${fa(Number(v ?? 0), 1)} واحد درصد`, 'فاصله']} />
            <Bar dataKey="gap" radius={4}>{chart.map((c, i) => <Cell key={i} fill={COLORS[c.g % COLORS.length]} />)}</Bar>
          </BarChart></ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="جدول مقایسه با شاخص‌های هم‌تعریف" sub="رتبه درون گروه هم‌مرحله؛ «—» یعنی دادهٔ آن شاخص ثبت نشده">
        <div className="rpx-table-wrap"><table className="rpx-table"><thead><tr><th>پروژه</th><th>گروه</th><th>فاصله</th><th>SPI</th><th>CPI</th><th>مهندسی</th><th>تأمین</th><th>اجرا</th><th>ریسک بالا</th><th>مسائل معوق</th><th>نوع قرارداد</th><th>رتبه در گروه</th></tr></thead><tbody>
          {[...rows].sort((a, b) => a.group.localeCompare(b.group) || (a.rankInGroup ?? 99) - (b.rankInGroup ?? 99)).map((r) => {
            const n = (v: number | null | undefined, d = 1) => (v == null ? '—' : fa(v, d))
            return <tr key={r.projectId} className={r.material >= 3 ? 'tone-bad' : r.material ? 'tone-warn' : ''}><td>{r.project}</td><td className="rpx-sec">{r.group}</td><td>{n(r.gap)}</td><td>{n(r.spi, 2)}</td><td>{n(r.cpi, 2)}</td><td>{n(r.disc.engineering)}</td><td>{n(r.disc.procurement)}</td><td>{n(r.disc.construction)}</td><td>{n(r.criticalRisks, 0)}</td><td>{n(r.overdueIssues, 0)}</td><td className="rpx-muted">{r.contractType || '—'}</td><td>{r.rankInGroup == null ? '—' : `${fa(r.rankInGroup)} از ${fa(r.groupSize)}`}</td></tr>
          })}
        </tbody></table></div>
      </Panel>
      <Panel title="الگوهای تکرارشونده" sub="علت، دستهٔ مسئله، حوزه یا پیمانکار مشترک بین پروژه‌ها">
        {!patterns.length ? <p className="rpx-empty">الگوی مشترکی بین پروژه‌های این محدوده دیده نشد.</p> : (
          <div className="rpx-items">{patterns.map((p) => (
            <div key={p.key} className={`rpx-item ${p.escalate ? 't-bad' : 't-warn'}`} style={{ borderInlineStartColor: 'var(--c)' }}>
              <div className="rpx-item-head"><b>{p.text}</b><Tag tone={p.escalate ? 'bad' : 'warn'}>{p.escalate ? 'نیازمند تصمیم سطح بالاتر' : `${fa(p.projects.length)} پروژه`}</Tag><Tag tone="none">{BASIS_FA[p.basis]}</Tag></div>
              <p>{p.projects.join('، ')}</p><p className="rpx-note">{p.note}</p>
            </div>
          ))}</div>
        )}
      </Panel>
    </>
  )
}

/* ── corrective actions ────────────────────────────────────────────── */
function Actions({ list }: { list: ProjectFacts[] }) {
  const accepted = useAnalyticsStore((s) => s.accepted)
  const register = useAnalyticsStore((s) => s.registerSuggestion)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const ss = useMemo(() => list.flatMap(suggestions), [list])
  const PR = { critical: 'بحرانی', high: 'بالا', medium: 'متوسط' } as const
  return (
    <>
      <p className="rpx-caveats">این فهرست پیشنهاد سامانه است، نه تصمیم مصوب. هر پیشنهاد فقط با «ثبت به‌عنوان اقدام» و تأیید شما به اقدام مدیریتی تبدیل می‌شود و منشأ آن (قاعدهٔ صادرکننده) ثبت می‌گردد. هیچ وضعیت پروژه‌ای خودکار تغییر نمی‌کند.</p>
      {err && <p className="rpx-caveats">{err}</p>}
      {!ss.length ? <p className="rpx-empty">پیشنهادی نیست: انحراف یا هشداری که اقدام بخواهد دیده نشد.</p> : (
        <div className="rpx-items">{ss.map((s) => {
          const k = `${s.projectId}|${s.key}`, done = accepted.get(k)
          return (
            <div key={k} className={`rpx-item t-${s.priority === 'critical' ? 'bad' : s.priority === 'high' ? 'warn' : 'none'}`} style={{ borderInlineStartColor: 'var(--c)' }}>
              <div className="rpx-item-head"><b>{list.length > 1 ? `${s.project}: ` : ''}{s.action}</b><Tag tone={s.priority === 'critical' ? 'bad' : s.priority === 'high' ? 'warn' : 'none'}>اولویت {PR[s.priority]}</Tag><Tag tone={s.urgency === 'now' ? 'bad' : 'none'}>{s.urgency === 'now' ? 'فوری' : 'به‌زودی'}</Tag><Tag tone="violet">پیشنهاد {WARNING_KIND_FA[s.origin]}</Tag></div>
              <dl className="rpx-fields">
                <div><dt>مسئله یا انحراف</dt><dd>{s.problem}</dd></div>
                <div><dt>علت محتمل</dt><dd>{s.cause ? `${s.cause} (${s.causeBasis ? BASIS_FA[s.causeBasis] : ''})` : 'علت مشخصی ثبت نشده'}</dd></div>
                <div><dt>مسئول پیشنهادی</dt><dd>{s.owner ?? 'تعیین‌نشده (مدیر پروژه در داده پایه ثبت نشده)'}</dd></div>
                <div><dt>مهلت پیشنهادی</dt><dd>{jd(s.due)}</dd></div>
                <div><dt>پیامد عدم اقدام</dt><dd>{s.consequence}</dd></div>
                <div><dt>سنجهٔ اثربخشی</dt><dd>{s.kpi}</dd></div>
              </dl>
              {s.evidence.length > 0 && <ul>{s.evidence.slice(0, 4).map((e, i) => <li key={i}>{e}</li>)}</ul>}
              <div className="rpx-actions-row no-print">
                {done ? <Tag tone="good"><Check size={11} /> به‌عنوان اقدام ثبت شد</Tag> : s.existing ? <Tag tone="acc">اقدام باز موجود: {s.existing}</Tag> : confirm === k ? (
                  <>
                    <span className="rpx-muted">یک اقدام مدیریتی با همین عنوان، اولویت و مهلت در «{s.project}» ثبت شود؟</span>
                    <button className="rpx-btn is-primary" disabled={busy === k} onClick={async () => { setBusy(k); setErr(null); const e = await register({ projectId: s.projectId, key: s.key, origin: s.origin, title: s.action, priority: s.priority, due: s.due, payload: { problem: s.problem, cause: s.cause, kpi: s.kpi, consequence: s.consequence, owner: s.owner } }); setBusy(null); setConfirm(null); if (e) setErr(e) }}>{busy === k ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} بله، ثبت شود</button>
                    <button className="rpx-btn" onClick={() => setConfirm(null)}>انصراف</button>
                  </>
                ) : <button className="rpx-btn" onClick={() => setConfirm(k)}><Plus size={12} /> ثبت به‌عنوان اقدام</button>}
              </div>
            </div>
          )
        })}</div>
      )}
    </>
  )
}

/* ── decisions (the existing decision center, per project) ────────── */
function Decisions({ scope }: { scope: Scope }) {
  const projects = useMasterDataStore((s) => s.projects)
  const [pid, setPid] = useState<string>(scope.level === 'project' && scope.id ? scope.id : '')
  const id = scope.level === 'project' && scope.id ? scope.id : pid
  const fetchProjectData = useReportingStore((s) => s.fetchProjectData)
  useEffect(() => { if (id) void fetchProjectData(id) }, [id, fetchProjectData])
  return (
    <>
      {!(scope.level === 'project' && scope.id) && (
        <div className="rpx-bar"><span className="rpx-muted">مرکز تصمیم برای یک پروژه است:</span>
          <select className="rpx-select" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">پروژه را انتخاب کنید</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.officialName}</option>)}</select>
        </div>
      )}
      {id ? <DecisionCenterPage key={id} masterProjectId={id} /> : <p className="rpx-empty">یک پروژه انتخاب کنید.</p>}
      <p className="rpx-note">{DEFINITIONS.decisions.formula}</p>
    </>
  )
}
