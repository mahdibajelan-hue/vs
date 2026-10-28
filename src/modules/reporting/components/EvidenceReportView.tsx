import type { CSSProperties, ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import type { Confidence, Direction, EvidenceReport, Evidence, Materiality } from '../lib/evidenceReport'
import './evidence.css'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })
const jd = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? formatJalali(d.slice(0, 10)) : d ?? '')

const MAT: Record<Materiality, { label: string; c: string }> = {
  material: { label: 'مهم', c: '#ef4444' },
  watch: { label: 'زیر نظر', c: '#f59e0b' },
  ok: { label: 'در محدودهٔ مجاز', c: '#22c55e' },
}
const CONF: Record<Confidence, { label: string; c: string }> = {
  high: { label: 'اطمینان بالا', c: '#22c55e' },
  medium: { label: 'اطمینان متوسط', c: '#f59e0b' },
  low: { label: 'اطمینان پایین', c: '#ef4444' },
}
const DIR: Record<Direction, { label: string; c: string }> = {
  improving: { label: 'بهبود', c: '#22c55e' },
  worsening: { label: 'بدتر شدن', c: '#ef4444' },
  flat: { label: 'ثابت', c: '#94a3b8' },
  insufficient: { label: 'دادهٔ ناکافی', c: '#64748b' },
}
const EFFECT: Record<string, { label: string; c: string }> = {
  effective: { label: 'مؤثر', c: '#22c55e' },
  not_effective: { label: 'بی‌اثر', c: '#ef4444' },
  too_early: { label: 'زود برای قضاوت', c: '#94a3b8' },
  unmeasurable: { label: 'قابل سنجش نیست', c: '#f59e0b' },
}

function Tag({ c, children }: { c: string; children: ReactNode }) {
  return <span className="ev-tag" style={{ '--c': c } as CSSProperties}>{children}</span>
}

function Sources({ list }: { list: Evidence[] }) {
  if (!list.length) return null
  return (
    <ul className="ev-src" aria-label="شواهد">
      {list.slice(0, 6).map((e, i) => (
        <li key={i}><b>{e.source}</b>{e.ref && <> · {e.ref}</>}{e.value && <> · {e.value}</>}{e.asOf && <span className="ev-date"> · {jd(e.asOf)}</span>}</li>
      ))}
      {list.length > 6 && <li className="ev-muted">و {fa(list.length - 6)} شاهد دیگر</li>}
    </ul>
  )
}

function Q({ n, title, hint, children, empty }: { n: number; title: string; hint?: string; children?: ReactNode | false; empty?: string }) {
  return (
    <section className="ev-q">
      <header><span className="ev-n">{fa(n)}</span><div><h3>{title}</h3>{hint && <p>{hint}</p>}</div></header>
      {children || <p className="ev-empty">{empty}</p>}
    </section>
  )
}

function Spark({ points, worse }: { points: { date: string; value: number }[]; worse: boolean }) {
  if (points.length < 2) return null
  const xs = points.map((_, i) => i), ys = points.map((p) => p.value)
  const min = Math.min(...ys), max = Math.max(...ys), w = 120, h = 32
  const px = (i: number) => (i / (xs.length - 1)) * w, py = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6)
  return (
    <svg className="ev-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <polyline fill="none" stroke={worse ? '#ef4444' : '#22c55e'} strokeWidth="2" strokeLinejoin="round" points={points.map((p, i) => `${px(i)},${py(p.value)}`).join(' ')} />
    </svg>
  )
}

/** One evidence report — the live page and an issued snapshot render through this same component. */
export function EvidenceReportView({ report: r }: { report: EvidenceReport }) {
  const material = r.findings.filter((f) => f.materiality === 'material')
  const rest = r.findings.filter((f) => f.materiality !== 'material')
  return (
    <div className="ev" dir="rtl">
      <div className="ev-head">
        <div>
          <p className="ev-kicker">گزارش مدیریتی مبتنی بر شواهد · {jd(r.asOf)}</p>
          <h2>{r.project}</h2>
        </div>
        <Tag c={CONF[r.confidence].c}>{CONF[r.confidence].label}</Tag>
      </div>

      <div className="ev-headline" role="note">
        <b>در یک نگاه</b>
        <ul>{r.headline.map((h, i) => <li key={i}>{h}</li>)}</ul>
      </div>

      <Q n={1} title="چه اتفاقی افتاده است؟" empty="هیچ منبع داده‌ای برای این پروژه در دسترس نیست.">
        {r.statusLines.length > 0 && (
          <dl className="ev-status">
            {r.statusLines.map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd><small>{s.evidence.source}{s.evidence.asOf ? ` · ${jd(s.evidence.asOf)}` : ''}</small></div>)}
          </dl>
        )}
        {r.changes && (
          <div className="ev-changes">
            <p className="ev-sub">نسبت به گزارش {r.previousRef}</p>
            <ul>{r.changes.map((c) => (
              <li key={c.key} className={`is-${c.direction}`}>
                {c.direction === 'better' ? <ArrowUpRight size={13} /> : c.direction === 'worse' ? <ArrowDownRight size={13} /> : <Minus size={13} />}
                {c.label}: {c.previous} ← {c.current}
              </li>
            ))}</ul>
          </div>
        )}
        {!r.changes && r.statusLines.length > 0 && <p className="ev-note">گزارش صادرشدهٔ قبلی‌ای نیست؛ «چه چیزی تغییر کرده» از گزارش دوم به بعد نشان داده می‌شود.</p>}
      </Q>

      <Q n={2} title="چه چیزی با برنامه یا مبنا فرق دارد — و کدام مهم است؟" hint={`مهم: عقب‌ماندگی ≥ ${fa(r.thresholds.gapMaterial)} واحد درصد یا SPI/CPI < ${fa(r.thresholds.idxMaterial, 2)}؛ زیر نظر: ≥ ${fa(r.thresholds.gapWatch)} واحد درصد یا < ${fa(r.thresholds.idxWatch, 2)}`}
        empty="انحرافی سنجیده نشد.">
        {r.findings.length > 0 && (
          <ol className="ev-findings">
            {[...material, ...rest].map((f) => (
              <li key={f.id} className={`is-${f.materiality}`}>
                <div className="ev-frow"><b>{f.title}</b><Tag c={MAT[f.materiality].c}>{MAT[f.materiality].label}</Tag></div>
                <p>{f.statement}</p>
                <Sources list={f.evidence} />
              </li>
            ))}
          </ol>
        )}
      </Q>

      <Q n={3} title="چه شواهدی دربارهٔ علت‌ها هست؟" hint="شواهد مرتبط با انحراف‌ها؛ «مستقیم» یعنی رابطهٔ علّی روشن است، «مرتبط» یعنی هم‌زمانی ثبت‌شده، نه اثبات علت."
        empty="برای انحراف‌های زمانی و هزینه‌ای شاهدی در داده‌های سامانه ثبت نشده است.">
        {r.causes.length > 0 && (
          <ul className="ev-list">
            {r.causes.map((c, i) => (
              <li key={i}><Tag c={c.strength === 'direct' ? '#ef4444' : '#94a3b8'}>{c.strength === 'direct' ? 'مستقیم' : 'مرتبط'}</Tag> {c.text}<Sources list={c.evidence} /></li>
            ))}
          </ul>
        )}
      </Q>

      <Q n={4} title="چه روندی در حال شکل‌گیری است؟" hint={`روند فقط با دست‌کم ${fa(r.thresholds.trendMinPoints)} نقطهٔ تاریخ‌دار گفته می‌شود.`} empty="دادهٔ تاریخ‌دار برای روند نیست.">
        {r.trends.length > 0 && (
          <ul className="ev-trends">
            {r.trends.map((t) => (
              <li key={t.id}>
                <div className="ev-frow"><b>{t.label}</b><Tag c={DIR[t.direction].c}>{DIR[t.direction].label}</Tag></div>
                <Spark points={t.points} worse={t.direction === 'worsening'} />
                <p>{t.statement}</p>
              </li>
            ))}
          </ul>
        )}
      </Q>

      <Q n={5} title="اگر وضعیت ادامه پیدا کند؟" hint="هر پیش‌بینی روش و فرضش را می‌گوید؛ پیش‌بینی جایگزین برنامه نیست." empty="دادهٔ کافی برای پیش‌بینی نیست (دست‌کم سه ماه منحنی پیشرفت یا EVM کامل لازم است).">
        {r.projections.length > 0 && (
          <ul className="ev-list">
            {r.projections.map((p) => (
              <li key={p.id}>
                <div className="ev-frow"><b>{p.label}: {/^\d{4}-\d{2}-\d{2}/.test(p.value) ? `${jd(p.value)}${p.value.slice(10)}` : p.value}</b><Tag c={CONF[p.confidence].c}>{CONF[p.confidence].label}</Tag></div>
                <p className="ev-muted">روش: {p.method} · فرض: {p.assumption}</p>
                <Sources list={p.evidence} />
              </li>
            ))}
          </ul>
        )}
      </Q>

      <Q n={6} title="چه باید کرد؟" hint="فقط اقدام‌هایی که از یک یافته با شاهد می‌آیند و رکورد مشخصی را نام می‌برند." empty="یافته‌ای که اقدام مشخصی بخواهد نیست.">
        {r.recommendations.length > 0 && (
          <ol className="ev-recs">
            {r.recommendations.map((x) => (
              <li key={x.id}><Tag c={x.urgency === 'now' ? '#ef4444' : '#f59e0b'}>{x.urgency === 'now' ? 'فوری' : 'به‌زودی'}</Tag> {x.text}{x.owner && <span className="ev-muted"> — مسئول: {x.owner}</span>}</li>
            ))}
          </ol>
        )}
      </Q>

      <Q n={7} title="چه تصمیمی، از چه کسی؟" empty="تصمیمی در انتظار نیست.">
        {r.decisions.length > 0 && (
          <ul className="ev-list">
            {r.decisions.map((d) => (
              <li key={d.id}>
                <div className="ev-frow"><b>{d.title}</b><Tag c={d.level === 'portfolio' ? '#a78bfa' : d.level === 'gate' ? '#0ea5e9' : '#94a3b8'}>{d.level === 'portfolio' ? 'سطح سبد' : d.level === 'gate' ? 'کمیتهٔ گیت' : 'پروژه'}</Tag>{d.overdue && <Tag c="#ef4444">موعد گذشته</Tag>}</div>
                <p className="ev-muted">{d.owner ? `مرجع: ${d.owner}` : 'مرجع تصمیم ثبت نشده'}{d.dueBy ? ` · موعد ${jd(d.dueBy)}` : ''}</p>
                <Sources list={d.evidence} />
              </li>
            ))}
          </ul>
        )}
      </Q>

      <Q n={8} title="آیا اقدام‌های قبلی مؤثر بوده‌اند؟" hint="اثر فقط از سنجشی پس از اقدام داوری می‌شود: ارزیابی دوبارهٔ ریسک یا بسته شدن مسئلهٔ مرتبط." empty="اقدام تکمیل‌شده‌ای که به ریسک یا مسئله‌ای وصل باشد ثبت نشده است.">
        {r.effects.length > 0 && (
          <ul className="ev-list">
            {r.effects.map((e) => (
              <li key={e.id}><div className="ev-frow"><b>{e.title}</b><Tag c={EFFECT[e.verdict].c}>{EFFECT[e.verdict].label}</Tag></div><p className="ev-muted">برای: {e.target} — {e.statement}</p></li>
            ))}
          </ul>
        )}
      </Q>

      <Q n={9} title="این گزارش چقدر قابل اتکاست؟" hint={`منبعی که بیش از ${fa(r.thresholds.staleDays)} روز ثبت تازه نداشته باشد کهنه شمرده می‌شود.`}>
        <table className="ev-quality">
          <thead><tr><th>منبع</th><th>آخرین ثبت</th><th>وضعیت</th></tr></thead>
          <tbody>{r.quality.map((q) => (
            <tr key={q.source} className={!q.available || (q.staleDays ?? 0) > r.thresholds.staleDays ? 'is-bad' : ''}><td>{q.source}</td><td>{q.lastUpdate ? jd(q.lastUpdate) : '—'}</td><td>{q.note}</td></tr>
          ))}</tbody>
        </table>
      </Q>
    </div>
  )
}
