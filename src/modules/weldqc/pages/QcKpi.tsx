import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Activity, BarChart3, Clock3, Coins, Gauge, Save, Settings2, Target } from 'lucide-react'
import { useWqStore } from '../store/useWqStore'
import { useEpcStore } from '../../execution/store/useEpcStore'
import * as repo from '../repo'
import { codeOf, fa, monthKey, monthLabel, useQc } from '../lib/useQc'
import { repairAnalysis } from '../lib/analytics'
import { CODE_FA, type Code } from '../lib/api1104'
import { PASS_FA, type Pass } from '../lib/rules'
import { CAPA_DEFAULT, loopKpis, pareto, type CapaCfg } from '../lib/capa'
import { useCapa } from '../lib/useCapa'

type Tone = 'good' | 'warn' | 'bad' | 'plain'
interface Kpi { label: string; value: string; target: string; tone: Tone; sub: string }
const TONE: Record<Tone, string> = { good: '#22c55e', warn: '#f59e0b', bad: '#ef4444', plain: '#64748b' }
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null }
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a.length <= 10 ? `${a}T00:00:00Z` : a)) / 864e5
/** lower is better: good within the limit, warning up to 1.5×, bad beyond */
const low = (v: number | null, limit: number): Tone => (v == null ? 'plain' : v <= limit ? 'good' : v <= limit * 1.5 ? 'warn' : 'bad')
const high = (v: number | null, limit: number): Tone => (v == null ? 'plain' : v >= limit ? 'good' : v >= limit * 0.9 ? 'warn' : 'bad')
const SECTOR = [['بالای لوله (۱۰:۳۰ تا ۱:۳۰)', (h: number) => h >= 10.5 || h < 1.5], ['کنارهٔ راست (۱:۳۰ تا ۴:۳۰)', (h: number) => h >= 1.5 && h < 4.5], ['زیر لوله (۴:۳۰ تا ۷:۳۰)', (h: number) => h >= 4.5 && h < 7.5], ['کنارهٔ چپ (۷:۳۰ تا ۱۰:۳۰)', (h: number) => h >= 7.5 && h < 10.5]] as const
const CFG_FIELDS: [keyof CapaCfg, string, string][] = [
  ['repairLimit', 'حد نرخ تعمیر پروژه', '٪'], ['window', 'پنجرهٔ سنجش نرخ تعمیر', 'سرجوش آخر'], ['minN', 'حداقل نمونه برای هشدار', 'سرجوش'],
  ['welderMax', 'تعمیر مجاز جوشکار (کمتر از)', 'مورد'], ['welderWindow', 'در چند سرجوش آخر جوشکار', 'سرجوش'], ['codeShare', 'سهم یک نوع عیب', '٪'], ['codeMin', 'حداقل تکرار یک نوع عیب', 'مورد'], ['days', 'بازهٔ بررسی تکرار', 'روز'],
  ['ncrRepeat', 'NCR هم‌نوع در بازه', 'مورد'], ['coatLimit', 'حد مردودی پوشش سرجوش', '٪'], ['retakeLimit', 'حد برگشت فیلم', '٪'], ['verifyDays', 'فاصلهٔ سنجش اثربخشی', 'روز'], ['verifyMinN', 'حداقل نتیجهٔ تازه برای قضاوت', 'نتیجه'],
  ['costRepair', 'هزینهٔ هر تعمیر جوش', 'ریال'], ['costCutout', 'هزینهٔ هر برش', 'ریال'], ['costRetake', 'هزینهٔ هر فیلم برگشتی', 'ریال'],
]

/**
 * شاخص‌های کیفیت — the few figures that move a pipeline project's quality, each against its target, and where the
 * rejected indications come from (type, pass, position on the pipe, month). The thresholds here are the same ones that
 * open a mandatory CAPA case.
 */
export function QcKpi() {
  const st = useWqStore(), q = useQc(), { input, today } = useCapa()
  const epc = useEpcStore()
  useEffect(() => { if (!epc.loaded) void epc.fetchAll() }, [epc.loaded, epc])
  const cfg = st.capaCfg
  const [draft, setDraft] = useState<CapaCfg | null>(null)

  const m = useMemo(() => {
    const ra = repairAnalysis({ evals: q.qEvals, defects: q.qDefects, repairs: st.repairs.map((r) => ({ weldId: r.weldId, round: r.round, performedBy: r.performedBy, method: r.method, at: r.createdAt })), forced: st.evaluations.filter((e) => e.forcedCutout).length, monthOf: monthKey })
    const firsts = [...input.firsts].sort((a, b) => a.at.localeCompare(b.at))
    const win = firsts.slice(-cfg.window), prev = firsts.slice(-2 * cfg.window, -cfg.window)
    const rate = (xs: typeof firsts) => (xs.length ? (xs.filter((r) => r.repaired).length / xs.length) * 100 : null)
    const rtLag = median(firsts.map((f) => { const w = q.byId.get(f.weldId)?.weld.weldDate; return w ? days(w, f.at) : NaN }).filter((x) => Number.isFinite(x) && x >= 0))
    const backlog = q.rows.filter((r) => !r.lastEval && r.weld.weldDate && days(r.weld.weldDate, `${today}T00:00:00Z`) > 3 && r.state !== 'cut_out').length
    const rej = st.defects.filter((d) => !d.removed && d.verdict && d.verdict !== 'accept')
    const films = input.films, coat = input.coat
    const ncr = epc.ncrs.filter((n) => n.projectId === st.projectId && n.status !== 'void'), ncrOpen = ncr.filter((n) => n.status !== 'closed')
    const ncrClose = median(ncr.filter((n) => n.closedAt).map((n) => days(n.createdAt, n.closedAt as string)))
    const loop = loopKpis(st.capa, today)
    const copq = st.repairs.length * cfg.costRepair + input.cutouts.length * cfg.costCutout + films.filter((f) => f.bad).length * cfg.costRetake
    return { ra, firsts, cur: rate(win), prev: rate(prev), winN: win.length, rtLag, backlog, rej, films, coat, ncr, ncrOpen, ncrClose, loop, copq }
  }, [q, st.repairs, st.evaluations, st.defects, st.capa, st.projectId, input, cfg, epc.ncrs, today])

  const pct = (v: number | null, d = 1) => (v == null ? '—' : `${fa(v, d)}٪`)
  const filmBad = m.films.length ? (m.films.filter((f) => f.bad).length / m.films.length) * 100 : null
  const coatBad = m.coat.length ? (m.coat.filter((c) => c.bad).length / m.coat.length) * 100 : null
  const trend = m.cur != null && m.prev != null ? (m.cur < m.prev - 0.5 ? ' · رو به بهبود' : m.cur > m.prev + 0.5 ? ' · رو به افت' : ' · ثابت') : ''
  const groups: { title: string; icon: typeof Gauge; items: Kpi[] }[] = [
    { title: 'جوش و رادیوگرافی', icon: Gauge, items: [
      { label: 'قبولی در اولین رادیوگرافی (FPY)', value: pct(m.ra.evaluated ? 100 - m.ra.firstRepairPct : null), target: `هدف ≥ ${fa(100 - cfg.repairLimit)}٪`, tone: high(m.ra.evaluated ? 100 - m.ra.firstRepairPct : null, 100 - cfg.repairLimit), sub: `${fa(m.ra.evaluated)} سرجوش ارزیابی‌شده` },
      { label: `نرخ تعمیر در ${fa(m.winN)} سرجوش آخر`, value: pct(m.cur), target: `حد ${fa(cfg.repairLimit)}٪`, tone: low(m.cur, cfg.repairLimit), sub: `${m.prev != null ? `پنجرهٔ قبل ${pct(m.prev)}` : 'پنجرهٔ قبلی برای مقایسه نیست'}${trend}` },
      { label: 'عیب ردشده در هر ۱۰۰ سرجوش', value: m.ra.evaluated ? fa((m.rej.length / m.ra.evaluated) * 100, 1) : '—', target: 'هرچه کمتر', tone: 'plain', sub: `${fa(m.rej.length)} نشانهٔ ردشده` },
      { label: 'نرخ برش', value: pct(m.ra.evaluated ? (m.ra.cutOuts / m.ra.evaluated) * 100 : null, 2), target: 'هدف صفر', tone: m.ra.evaluated ? (m.ra.cutOuts ? 'bad' : 'good') : 'plain', sub: `${fa(m.ra.cutOuts)} برش` },
      { label: 'موفقیت تعمیر در رادیوگرافی بعد', value: m.ra.succeeded + m.ra.failed ? pct(m.ra.successPct, 0) : '—', target: 'هدف ≥ ۹۰٪', tone: m.ra.succeeded + m.ra.failed ? high(m.ra.successPct, 90) : 'plain', sub: `${fa(m.ra.succeeded)} موفق · ${fa(m.ra.failed)} ناموفق` },
    ] },
    { title: 'سرعت چرخهٔ کنترل', icon: Clock3, items: [
      { label: 'فاصلهٔ جوش تا اولین ارزیابی رادیوگرافی', value: m.rtLag == null ? '—' : `${fa(m.rtLag, 1)} روز`, target: 'هدف ≤ ۲ روز', tone: low(m.rtLag, 2), sub: 'میانه — عیب دیر کشف‌شده در سرجوش‌های بعدی تکرار می‌شود' },
      { label: 'سرجوش بیش از ۳ روز بدون ارزیابی', value: fa(m.backlog), target: 'هدف صفر', tone: m.backlog === 0 ? 'good' : m.backlog <= 5 ? 'warn' : 'bad', sub: 'انباشت رادیوگرافی' },
      { label: 'انتظار سرجوش برای تعمیر', value: m.ra.medianDaysToRepair == null ? '—' : `${fa(m.ra.medianDaysToRepair, 1)} روز`, target: 'هدف ≤ ۳ روز', tone: low(m.ra.medianDaysToRepair, 3), sub: 'میانهٔ ارزیابی تا ثبت تعمیر' },
      { label: 'برگشت فیلم (ریتیک / ریشوت)', value: pct(filmBad), target: `حد ${fa(cfg.retakeLimit)}٪`, tone: low(filmBad, cfg.retakeLimit), sub: `${fa(m.films.length)} فیلم بررسی‌شده` },
    ] },
    { title: 'پوشش و عدم انطباق', icon: Activity, items: [
      { label: 'مردودی بازرسی پوشش سرجوش', value: pct(coatBad), target: `حد ${fa(cfg.coatLimit)}٪`, tone: low(coatBad, cfg.coatLimit), sub: `${fa(m.coat.length)} بازرسی` },
      { label: 'NCR باز', value: fa(m.ncrOpen.length), target: 'بدون مهلت‌گذشته', tone: m.ncrOpen.some((n) => n.dueDate && n.dueDate < today) ? 'bad' : m.ncrOpen.length ? 'warn' : 'good', sub: `${fa(m.ncrOpen.filter((n) => n.dueDate && n.dueDate < today).length)} مهلت‌گذشته · ${fa(m.ncr.length)} کل` },
      { label: 'زمان بستن NCR', value: m.ncrClose == null ? '—' : `${fa(m.ncrClose, 0)} روز`, target: 'هدف ≤ ۱۴ روز', tone: low(m.ncrClose, 14), sub: 'میانهٔ صدور تا بستن' },
    ] },
    { title: 'حلقهٔ بهبود (CAPA)', icon: Target, items: [
      { label: 'توافق در مهلت جلسه', value: pct(m.loop.onTimePct, 0), target: 'هدف ۱۰۰٪', tone: high(m.loop.onTimePct, 100), sub: `${fa(m.loop.overdueMeeting)} جلسهٔ عقب‌افتاده` },
      { label: 'اثربخشی در اولین دور', value: pct(m.loop.effectivePct, 0), target: 'هدف ≥ ۸۰٪', tone: high(m.loop.effectivePct, 80), sub: `${fa(m.loop.closed)} پروندهٔ بسته از ${fa(m.loop.total)}` },
      { label: 'زمان بستن پرونده', value: m.loop.medianDays == null ? '—' : `${fa(m.loop.medianDays, 0)} روز`, target: 'هدف ≤ ۴۵ روز', tone: low(m.loop.medianDays, 45), sub: 'میانهٔ باز شدن تا تأیید اثربخشی' },
      ...(m.copq > 0 ? [{ label: 'هزینهٔ کیفیت نامطلوب (COPQ)', value: fa(m.copq), target: 'ریال', tone: 'plain' as Tone, sub: `${fa(st.repairs.length)} تعمیر · ${fa(input.cutouts.length)} برش · ${fa(m.films.filter((f) => f.bad).length)} فیلم برگشتی` }] : []),
    ] },
  ]

  const codes = pareto(m.rej.map((d) => codeOf(d)).filter(Boolean) as Code[])
  const vital = codes.filter((_, i) => i === 0 || codes[i - 1].cum < 80)
  const passes = pareto(m.rej.map((d) => d.pass).filter(Boolean) as Pass[])
  const clocked = m.rej.filter((d) => d.clock != null)
  const sectors = SECTOR.map(([label, test]) => ({ label, count: clocked.filter((d) => test((d.clock as number) % 12)).length }))
  const maxSector = Math.max(1, ...sectors.map((s) => s.count))
  const can = st.caps.configure

  return (
    <div className="cp kp">
      {groups.map((g, gi) => (
        <section key={g.title} className="wq-card wq-rise" style={{ '--i': gi } as CSSProperties}>
          <header className="wq-card-head"><g.icon size={16} aria-hidden /><h3>{g.title}</h3></header>
          <div className="kp-grid">{g.items.map((k) => (
            <div key={k.label} className="kp-item" style={{ '--c': TONE[k.tone] } as CSSProperties}>
              <span>{k.label}</span><b>{k.value}</b><em>{k.target}</em><small>{k.sub}</small>
            </div>
          ))}</div>
        </section>
      ))}

      <div className="wq-grid2">
        <section className="wq-card"><header className="wq-card-head"><BarChart3 size={16} aria-hidden /><h3>پارتو عیوب ردشده</h3></header>
          {codes.length ? <>
            <ul className="kp-pareto">{codes.map((c) => (
              <li key={c.key} className={vital.includes(c) ? 'is-vital' : ''}><span><b dir="ltr">{c.key}</b> {CODE_FA[c.key] ?? ''}</span><i style={{ '--w': `${(c.count / codes[0].count) * 100}%` } as CSSProperties} /><b>{fa(c.count)}</b><em>{fa(c.cum, 0)}٪</em></li>
            ))}</ul>
            <p className="ps-meta">{fa(vital.length)} نوع عیب {fa(vital[vital.length - 1].cum, 0)}٪ ردی‌ها را می‌سازد؛ تمرکز اقدام اصلاحی روی همین‌هاست (ستون آخر سهم تجمعی است).</p>
          </> : <p className="ps-hint">هنوز عیب ردشده‌ای ثبت نشده است.</p>}
        </section>
        <section className="wq-card"><header className="wq-card-head"><Target size={16} aria-hidden /><h3>عیوب کجا رخ می‌دهند؟</h3></header>
          {m.rej.length ? <>
            <b className="kp-sub">بر اساس پاس</b>
            {passes.length ? <ul className="wq-bars">{passes.map((p) => <li key={p.key}><span>{PASS_FA[p.key] ?? p.key}</span><i style={{ '--w': `${p.share}%`, '--c': '#f97316' } as CSSProperties} /><b>{fa(p.count)} · {fa(p.share, 0)}٪</b></li>)}</ul> : <p className="ps-meta">پاس عیوب ثبت نشده است.</p>}
            <b className="kp-sub">بر اساس موقعیت روی محیط لوله</b>
            {clocked.length ? <ul className="wq-bars">{sectors.map((s) => <li key={s.label}><span>{s.label}</span><i style={{ '--w': `${(s.count / maxSector) * 100}%`, '--c': '#0ea5e9' } as CSSProperties} /><b>{fa(s.count)} · {fa((s.count / clocked.length) * 100, 0)}٪</b></li>)}</ul> : <p className="ps-meta">ساعت عیوب ثبت نشده است.</p>}
          </> : <p className="ps-hint">—</p>}
        </section>
      </div>

      {m.ra.months.length > 0 && (
        <section className="wq-card"><header className="wq-card-head"><Activity size={16} aria-hidden /><h3>روند ماهانهٔ نرخ تعمیر در برابر حد پروژه ({fa(cfg.repairLimit)}٪)</h3></header>
          <div className="wq-cols">{m.ra.months.map((x) => <div key={x.key} className="wq-col" title={`${fa(x.repaired)} از ${fa(x.evaluated)}`}><b>{fa(x.rate, 0)}٪</b><i style={{ '--h': `${Math.max(4, Math.min(100, x.rate * 3))}%`, '--c': TONE[low(x.rate, cfg.repairLimit)] } as CSSProperties} /><span>{monthLabel(x.key)}</span></div>)}</div>
        </section>
      )}

      <section className="wq-card"><header className="wq-card-head"><Settings2 size={16} aria-hidden /><h3>حدهایی که پروندهٔ الزامی باز می‌کنند</h3>{can && !draft && <button type="button" className="ps-btn wq-head-link" onClick={() => setDraft(cfg)}>ویرایش حدها</button>}</header>
        <p className="ps-meta">با عبور هر شاخص از حد خود، پروندهٔ اقدام اصلاحی و پیشگیرانه باز می‌شود و جلسهٔ ریشه‌یابی الزامی است. ترک، برش، تعمیر دوم، مردودی هیدروتست و NCR با شدت زیاد همیشه پرونده می‌شوند.</p>
        {draft ? (
          <form className="wq-form" onSubmit={(e) => { e.preventDefault(); void st.run('حدهای کنترل کیفیت ذخیره شد', () => repo.saveCriteria(st.projectId!, { ...((st.criteria as object | null) ?? {}), capa: draft })).then((ok) => { if (ok) setDraft(null) }) }}>
            {CFG_FIELDS.map(([k, label, unit]) => <label key={k}><span>{label} ({unit})</span><input inputMode="decimal" dir="ltr" value={String(draft[k])} onChange={(e) => setDraft({ ...draft, [k]: Math.max(0, Number(e.target.value) || 0) })} /></label>)}
            <label className="kp-check"><input type="checkbox" checked={draft.auto} onChange={(e) => setDraft({ ...draft, auto: e.target.checked })} /><span>پروندهٔ الزامی به‌صورت خودکار باز شود</span></label>
            <div className="is-wide wq-form-actions"><button type="submit" className="ps-btn is-primary"><Save size={14} aria-hidden /> ذخیره برای همهٔ کاربران پروژه</button><button type="button" className="ps-btn is-ghost" onClick={() => setDraft(CAPA_DEFAULT)}>پیش‌فرض</button><button type="button" className="ps-btn is-ghost" onClick={() => setDraft(null)}>انصراف</button></div>
          </form>
        ) : (
          <dl className="kp-cfg">{CFG_FIELDS.filter(([k]) => !k.startsWith('cost') || (cfg[k] as number) > 0).map(([k, label, unit]) => <div key={k}><dt>{label}</dt><dd>{fa(cfg[k] as number)} <small>{unit}</small></dd></div>)}<div><dt>بازشدن خودکار</dt><dd>{cfg.auto ? 'روشن' : 'خاموش'}</dd></div>{cfg.costRepair + cfg.costCutout + cfg.costRetake === 0 && <div><dt><Coins size={12} aria-hidden /> هزینهٔ کیفیت نامطلوب</dt><dd><small>با واردکردن هزینهٔ واحد محاسبه می‌شود</small></dd></div>}</dl>
        )}
      </section>
    </div>
  )
}
