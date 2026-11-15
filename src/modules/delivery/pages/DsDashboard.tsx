import { AlertTriangle, CheckCircle2, CircleDashed, ShieldAlert } from 'lucide-react'
import { BEARER_FA, type MethodKey } from '../lib/bank'
import type { Result } from '../lib/engine'
import { decisionsNeeded } from '../lib/report'
import { ConfidenceGauge, CriteriaRadar, RiskMatrix, ScoreBars, SensitivityTornado } from '../components/DsCharts'
import { fa, nameOf } from '../lib/useLive'
import type { Answers } from '../lib/questions'

export function DsDashboard({ r, answers, frozen, onGo }: { r: Result; answers: Answers; frozen: boolean; onGo: (t: string, opt?: string) => void }) {
  const w = r.winner ? r.options.find((o) => o.key === r.winner)! : null
  const top3 = r.options.filter((o) => o.status !== 'excluded').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 3)
  const stable = r.scenarios.filter((s) => s.winner === r.winner).length
  const rec = r.recommendation
  const recPick = <K extends string>(xs: { key: K; fa: string; recommended: boolean }[]) => xs.filter((x) => x.recommended).map((x) => x.fa)
  return (
    <div className="ds-dash">
      <section className={`ds-hero ${rec?.definitive ? 'is-def' : 'is-ind'}`} aria-labelledby="ds-hero-h">
        <div className="ds-hero-main">
          <p className="ds-eyebrow">{rec?.definitive ? 'روش پیشنهادی' : 'جهت‌گیری تحلیل — پیشنهاد قطعی نیست'}{frozen && ' · نسخهٔ ثبت‌شده'}</p>
          <h2 id="ds-hero-h">{rec?.methodFa ?? 'اطلاعات کافی نیست'}</h2>
          {w?.components && <ul className="ds-comp">{w.components.map((c) => <li key={c}>{c}</li>)}</ul>}
          <p className="ds-hero-s">{rec?.statement}</p>
          <dl className="ds-hero-kv">
            <div><dt>امتیاز</dt><dd>{fa(w?.score, 1)}<small> / ۱۰۰</small></dd></div>
            <div><dt>فاصله با گزینهٔ دوم</dt><dd>{fa(r.gap, 1)}<small> امتیاز</small></dd></div>
            <div><dt>پایداری در سناریوها</dt><dd>{fa(stable)}<small> از {fa(r.scenarios.length)}</small></dd></div>
            <div><dt>گزینهٔ دوم</dt><dd className="is-txt">{nameOf(r, r.runnerUp)}</dd></div>
          </dl>
        </div>
        <div className="ds-hero-side">
          <ConfidenceGauge score={r.confidence.score} level={r.confidence.level} />
          {r.confidence.reasons.length > 0 && <ul className="ds-reasons">{r.confidence.reasons.map((x) => <li key={x}><AlertTriangle size={13} aria-hidden />{x}</li>)}</ul>}
        </div>
      </section>

      {(r.contradictions.length > 0 || r.gaps.some((g) => g.critical)) && (
        <section className="ds-alert" aria-label="هشدار داده‌ها">
          <ShieldAlert size={18} aria-hidden />
          <div>
            {r.contradictions.map((c) => <p key={c.fa}><b>{c.blocking ? 'تعارض اساسی' : 'تعارض'}:</b> {c.fa}</p>)}
            {r.gaps.some((g) => g.critical) && <p><b>اطلاعات کلیدی نامشخص ({fa(r.gaps.filter((g) => g.critical).length)}):</b> {r.gaps.filter((g) => g.critical).slice(0, 8).map((g) => g.fa).join('، ')}{r.gaps.filter((g) => g.critical).length > 8 ? ' …' : ''} <button type="button" className="ds-link" onClick={() => onGo('wizard')}>تکمیل اطلاعات</button></p>}
          </div>
        </section>
      )}

      <div className="ds-strat">
        {[['قیمت‌گذاری و قرارداد', recPick(r.pricing)], ['تأمین و مناقصه', recPick(r.procurement)], ['اجرا و ساخت', recPick(r.execution)]].map(([t, xs]) => (
          <article key={t as string} className="ds-card ds-strat-c"><h3>{t}</h3>{(xs as string[]).length ? <ul>{(xs as string[]).map((x) => <li key={x}>{x}</li>)}</ul> : <p className="ds-muted">—</p>}</article>
        ))}
      </div>

      <div className="ds-grid2">
        <article className="ds-card">
          <header><h3>مقایسهٔ روش‌ها</h3><p>امتیاز وزنی از ۱۰۰؛ هر قطعه سهم یک معیار است. برای جزئیات روی هر روش بزنید.</p></header>
          <ScoreBars options={r.options} winner={r.winner} onPick={(k) => onGo('options', k)} />
        </article>
        <article className="ds-card">
          <header><h3>نیم‌رخ معیارها</h3><p>سه گزینهٔ برتر، پس از اعمال قواعد زمینه‌ای (۱ تا ۵).</p></header>
          <CriteriaRadar options={top3} />
        </article>
        <article className="ds-card">
          <header><h3>ماتریس ریسک</h3><p>خانواده‌های ریسک طرح؛ عدد گوشه، ریسک‌های باز ماژول مدیریت ریسک است.</p></header>
          <RiskMatrix risks={r.risks} register={r.registerRisks} bearerOf={w ? (x) => (x.bearer[w.key as MethodKey] ? BEARER_FA[x.bearer[w.key as MethodKey]!] : '—') : undefined} />
        </article>
        <article className="ds-card">
          <header><h3>تحلیل حساسیت وزن‌ها</h3><p>چند برابر شدن (یا کاهش) وزن هر معیار، گزینهٔ برتر را عوض می‌کند؟</p></header>
          <SensitivityTornado rows={r.sensitivity} name={(k) => nameOf(r, k)} />
        </article>
      </div>

      <div className="ds-grid3">
        <article className="ds-card ds-sw is-good"><h3><CheckCircle2 size={15} aria-hidden />نقاط قوت</h3><ul>{(w?.strengths ?? []).map((x) => <li key={x}>{x}</li>)}</ul></article>
        <article className="ds-card ds-sw is-bad"><h3><AlertTriangle size={15} aria-hidden />نقاط ضعف و احتیاط</h3><ul>{[...(w?.weaknesses ?? []), ...(w?.constraints.filter((c) => c.kind !== 'exclude').map((c) => c.why) ?? [])].map((x) => <li key={x}>{x}</li>)}</ul></article>
        <article className="ds-card ds-sw"><h3><CircleDashed size={15} aria-hidden />تصمیمات موردنیاز مدیریت</h3><ul>{decisionsNeeded(r, answers).map((x) => <li key={x}>{x}</li>)}</ul><button type="button" className="ds-link" onClick={() => onGo('decision')}>رفتن به تصمیم و تصویب</button></article>
      </div>
    </div>
  )
}
