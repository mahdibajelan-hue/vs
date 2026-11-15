import { useState } from 'react'
import { ArrowDown, ArrowUp, Ban, CircleAlert } from 'lucide-react'
import { BEARER_FA, CRITERIA, CRITERION, type MethodKey } from '../lib/bank'
import type { FitItem, OptionResult, Result } from '../lib/engine'
import { fa, nameOf } from '../lib/useLive'

const STATUS: Record<OptionResult['status'], string> = { ok: 'قابل بررسی', conditional: 'مشروط', excluded: 'حذف‌شده' }

function OptionDetail({ o, r }: { o: OptionResult; r: Result }) {
  return (
    <div className="ds-opt-d">
      <p className="ds-muted">{o.summary}</p>
      {o.components && <ul className="ds-comp">{o.components.map((c) => <li key={c}>{c}</li>)}</ul>}
      {o.constraints.length > 0 && (
        <ul className="ds-cons">{o.constraints.map((c) => <li key={c.rule + c.why} className={`is-${c.kind}`}>{c.kind === 'exclude' ? <Ban size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />}<span><b>{c.kind === 'exclude' ? 'محدودیت قطعی' : c.kind === 'conditional' ? 'مشروط' : 'احتیاط'}</b> {c.why}</span><code>{c.rule}</code></li>)}</ul>
      )}
      <div className="ds-opt-grid">
        <table className="ds-tbl">
          <caption>امتیاز معیارها (پایه ← پس از قواعد) و سهم در امتیاز کل</caption>
          <thead><tr><th scope="col">معیار</th><th scope="col">وزن</th><th scope="col">پایه</th><th scope="col">نهایی</th><th scope="col">سهم</th></tr></thead>
          <tbody>{CRITERIA.map((c) => { const d = o.profile[c.key] - o.base[c.key]; return (
            <tr key={c.key}><th scope="row">{c.fa}</th><td>{fa(r.weights[c.key], 1)}٪</td><td>{fa(o.base[c.key], 1)}</td><td className={d > 0 ? 'is-up' : d < 0 ? 'is-down' : ''}>{fa(o.profile[c.key], 1)}{d !== 0 && (d > 0 ? <ArrowUp size={11} aria-label="افزایش" /> : <ArrowDown size={11} aria-label="کاهش" />)}</td><td>{fa(o.contributions[c.key], 1)}</td></tr>
          ) })}</tbody>
        </table>
        <div className="ds-stack">
          {o.adjustments.length > 0 && <div><h4>قواعد اعمال‌شده (دلیل تغییر امتیازها)</h4><ul className="ds-adj">{o.adjustments.map((x, i) => <li key={i} className={x.delta > 0 ? 'is-up' : 'is-down'}><b>{x.delta > 0 ? '+' : '−'}{fa(Math.abs(x.delta), 1)}</b><span>{CRITERION[x.crit].fa}: {x.why}</span><code>{x.rule}</code></li>)}</ul></div>}
          {o.strengths.length > 0 && <div><h4>نقاط قوت</h4><ul>{o.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {o.weaknesses.length > 0 && <div><h4>نقاط ضعف</h4><ul>{o.weaknesses.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {o.reasonsAgainst.length > 0 && <div><h4>{o.status === 'excluded' ? 'دلیل حذف' : 'دلیل رتبهٔ پایین‌تر'}</h4><ul>{o.reasonsAgainst.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          <dl className="ds-kv">
            <div><dt>تناسب تخصیص ریسک</dt><dd>{fa(o.riskFit, 1)} از ۵</dd></div>
            <div><dt>سهم ریسک‌های بد تخصیص‌یافته</dt><dd>{fa(o.riskExposure)}٪</dd></div>
            <div><dt>مدت اجرای نسبی</dt><dd>{o.duration ? `${fa(o.duration[0])} تا ${fa(o.duration[1])} ماه` : '—'}</dd></div>
            <div><dt>هزینهٔ مورد انتظار</dt><dd>{o.cost ? `${fa(o.cost[0])} تا ${fa(o.cost[1])} میلیارد ریال` : '—'}</dd></div>
          </dl>
        </div>
      </div>
      {o.key !== 'hybrid' && (
        <table className="ds-tbl is-compact">
          <caption>تحمل‌کنندهٔ هر خانوادهٔ ریسک در این روش</caption>
          <thead><tr><th scope="col">ریسک</th><th scope="col">شدت</th><th scope="col">تحمل‌کننده</th></tr></thead>
          <tbody>{r.risks.map((x) => <tr key={x.key}><th scope="row">{x.fa}</th><td>{fa(x.severity)}</td><td>{x.bearer[o.key as MethodKey] ? BEARER_FA[x.bearer[o.key as MethodKey]!] : '—'}</td></tr>)}</tbody>
        </table>
      )}
    </div>
  )
}

function FitList<K extends string>({ title, xs }: { title: string; xs: FitItem<K>[] }) {
  return (
    <article className="ds-card">
      <h3>{title}</h3>
      <ul className="ds-fit">{xs.map((x) => (
        <li key={x.key} className={x.recommended ? 'is-rec' : ''}>
          <span className="ds-fit-h"><b>{x.fa}</b>{x.recommended && <em>پیشنهادی</em>}<span className="ds-fit-s">{fa(x.score)}٪</span></span>
          <span className="ds-fit-bar"><b style={{ width: `${x.score}%` }} /></span>
          {x.reasons.length > 0 && <small>{x.reasons.join(' ')}</small>}
          {x.caution && <small className="is-warn">احتیاط: {x.caution}</small>}
        </li>
      ))}</ul>
    </article>
  )
}

export function DsOptions({ r, focus }: { r: Result; focus: string | null }) {
  const [open, setOpen] = useState<string | null>(focus ?? r.winner)
  const order = [...r.options].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
  return (
    <div className="ds-stack">
      <section className="ds-card" aria-labelledby="ds-o-h">
        <header><h3 id="ds-o-h">بانک گزینه‌های روش تحویل</h3><p>هر گزینه با امتیاز، محدودیت‌ها و قواعدی که امتیازش را تغییر داده‌اند. امتیاز به‌تنهایی مبنای تصمیم نیست.</p></header>
        <ul className="ds-opts">{order.map((o) => (
          <li key={o.key} className={`is-${o.status} ${o.key === r.winner ? 'is-win' : ''}`}>
            <button type="button" aria-expanded={open === o.key} onClick={() => setOpen(open === o.key ? null : o.key)}>
              <span className="ds-opt-rank">{o.rank ? fa(o.rank) : '—'}</span>
              <span className="ds-opt-n"><b>{o.fa}</b><small>{o.en}</small></span>
              <span className={`ds-pill is-${o.status}`}>{STATUS[o.status]}</span>
              <span className="ds-opt-s">{o.status === 'excluded' ? '—' : fa(o.score, 1)}</span>
            </button>
            {open === o.key && <OptionDetail o={o} r={r} />}
          </li>
        ))}</ul>
      </section>
      <div className="ds-grid3">
        <FitList title="سازوکار قیمت‌گذاری و قرارداد" xs={r.pricing} />
        <FitList title="راهبرد تأمین و مناقصه" xs={r.procurement} />
        <FitList title="راهبرد اجرا و ساخت" xs={r.execution} />
      </div>
    </div>
  )
}

export function DsScenarios({ r }: { r: Result }) {
  const keys = r.options.filter((o) => o.status !== 'excluded').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 5).map((o) => o.key)
  return (
    <div className="ds-stack">
      <section className="ds-card" aria-labelledby="ds-sc-h">
        <header><h3 id="ds-sc-h">مقایسهٔ سناریوها</h3><p>همان پاسخ‌ها با فرض‌های متفاوت مدیریتی و محیطی؛ اگر برترین گزینه در اغلب سناریوها ثابت بماند، پیشنهاد استوار است.</p></header>
        <div className="ds-scroll"><table className="ds-tbl">
          <thead><tr><th scope="col">سناریو</th><th scope="col">گزینهٔ برتر</th>{keys.map((k) => <th key={k} scope="col">{nameOf(r, k)}</th>)}</tr></thead>
          <tbody>{r.scenarios.map((s) => (
            <tr key={s.key} className={s.winner === r.winner ? '' : 'is-flip'}><th scope="row">{s.fa}</th><td><b>{nameOf(r, s.winner)}</b></td>{keys.map((k) => { const x = s.ranking.find((y) => y.key === k); return <td key={k} className={s.winner === k ? 'is-top' : ''}>{x ? fa(x.score, 1) : '—'}</td> })}</tr>
          ))}</tbody>
        </table></div>
      </section>
      <section className="ds-card" aria-labelledby="ds-se-h">
        <header><h3 id="ds-se-h">حساسیت به وزن‌ها</h3><p>هر وزن به‌تنهایی از صفر تا سه برابر تغییر داده می‌شود؛ ستون آخر نخستین تغییری است که گزینهٔ برتر را عوض می‌کند.</p></header>
        <div className="ds-scroll"><table className="ds-tbl">
          <thead><tr><th scope="col">معیار</th><th scope="col">وزن فعلی</th><th scope="col">بیشترین جابه‌جایی امتیاز</th><th scope="col">نقطهٔ تغییر</th></tr></thead>
          <tbody>{r.sensitivity.map((s) => <tr key={s.crit} className={s.flipTo ? 'is-flip' : ''}><th scope="row">{s.fa}</th><td>{fa(r.weights[s.crit], 1)}٪</td><td>{fa(s.swing, 1)}</td><td>{s.flipTo ? `${s.flipUp ? `افزایش به ×${fa(s.flipUp, 2)}` : `کاهش به ×${fa(s.flipDown ?? 0, 2)}`} → ${nameOf(r, s.flipTo)}` : 'پایدار'}</td></tr>)}</tbody>
        </table></div>
      </section>
      <section className="ds-card" aria-labelledby="ds-iu-h">
        <header><h3 id="ds-iu-h">اثر پاسخ‌های نامشخص</h3></header>
        {r.inputUncertainty.unknownScales ? (
          <p>{fa(r.inputUncertainty.unknownScales)} پاسخ مقیاسی نامشخص است. اگر همه در بدترین حالت باشند «<b>{nameOf(r, r.inputUncertainty.pessimistic)}</b>» و در بهترین حالت «<b>{nameOf(r, r.inputUncertainty.optimistic)}</b>» برتر است؛ {r.inputUncertainty.stable ? 'نتیجه به این پاسخ‌ها حساس نیست.' : 'نتیجه به این پاسخ‌ها حساس است و پیش از تصمیم باید تکمیل شوند.'}</p>
        ) : <p>همهٔ پاسخ‌های مقیاسی مشخص است.</p>}
      </section>
    </div>
  )
}
