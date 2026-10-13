import { useExecutionModel } from '../lib/useExecutionModel'
import { weightSums } from '../lib/progress'
import { chapterProgress, forecast } from '../lib/forecast'
import { jalaliText } from '../lib/periods'
import { useExecutionStore } from '../store/useExecutionStore'
import { Chip, DataTable, KpiCard, Section, type Col } from '../../finance/components/fn'
import { Tile } from '../../finance/components/charts'
import { Bar, Empty, fa, pct } from '../components/common'
import { ProgressCurve } from '../components/ProgressCurve'
import type { ProgressRow } from '../lib/progress'

/** Physical progress: approved cumulative ÷ base quantity per activity, weighted per weighting basis (each totals 100%); planned, actual and deviation. Financial value of the work is not mixed in. */
export function ProgressPage({ projectId }: { projectId: string }) {
  const m = useExecutionModel(projectId)
  const dev = m.planned.overall == null ? null : m.approved.overall - m.planned.overall
  const sums = weightSums(m.activities)
  const books = useExecutionStore((x) => x.books)
  const fc = forecast({ curve: m.curve, actual: m.approved.overall, planned: m.planned.overall, activities: m.activities, today: m.today })
  const chapters = chapterProgress(m.approved.rows)
  const cols: Col<ProgressRow>[] = [
    { key: 'i', label: 'ردیف', render: (r) => <span className="fn-code strong">{r.activity.itemNo}</span> },
    { key: 't', label: 'فعالیت', render: (r) => <><span className="strong">{r.activity.title}</span><span className="sub">{r.activity.weightGroup || 'کل پروژه'}</span></> },
    { key: 'w', label: 'وزن ٪', num: true, render: (r) => fa(r.base.weight, 2), sort: (r) => r.base.weight },
    { key: 'b', label: 'مبنا', num: true, render: (r) => `${fa(r.base.baseQty, 2)} ${r.activity.unit}` },
    { key: 'c', label: 'تجمعی تأییدشده', num: true, render: (r) => fa(r.cum, 2), sort: (r) => r.cum },
    { key: 'reg', label: 'ثبت‌شده (با در انتظار)', num: true, render: (r) => { const x = m.registered.rows.find((y) => y.activity.id === r.activity.id); return x ? fa(x.cum, 2) : '—' } },
    { key: 'p', label: 'پیشرفت', render: (r) => <><Bar value={r.pct} planned={null} /><span className="sub">{pct(r.pct, 0)}{r.over ? ' · بیش از مبنا' : ''}</span></>, sort: (r) => r.pct },
    { key: 'ct', label: 'سهم در پیشرفت گروه', num: true, render: (r) => pct(r.contribution, 2), sort: (r) => r.contribution },
    { key: 'v', label: 'نسخهٔ مبنا', render: (r) => (r.base.version ? <Chip>v{fa(r.base.version)}</Chip> : <Chip tone="warn">مقدار فعلی</Chip>) },
  ]
  if (!m.activities.length) return <Empty>ابتدا فعالیت‌های پروژه را در «فعالیت‌ها و فهرست‌بها» تعریف کنید.</Empty>
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="fn-kpis">
        <KpiCard i={0} label="پیشرفت واقعی (تأییدشده)" value={pct(m.approved.overall)} tone="good" sub={`ثبت‌شده با در انتظار: ${pct(m.registered.overall)}`} />
        <KpiCard i={1} label="پیشرفت برنامه‌ای" value={pct(m.planned.overall)} sub={m.planned.overall == null ? 'تاریخ برنامه برای فعالیت‌ها تعریف نشده' : `${fa(m.planned.withDates)} از ${fa(m.planned.total)} فعالیت دارای برنامه`} />
        <KpiCard i={2} label="انحراف" value={dev == null ? '—' : `${dev > 0 ? '+' : ''}${(dev * 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}٪`} tone={dev == null ? 'neutral' : dev < -0.05 ? 'bad' : dev < 0 ? 'warn' : 'good'} />
        <KpiCard i={3} label="وزن‌ها" value={m.approved.weightsOk ? 'مجموع هر مبنا ۱۰۰٪' : 'نیازمند اصلاح'} tone={m.approved.weightsOk ? 'good' : 'warn'} sub={sums.filter((s) => !s.ok).map((s) => `${s.group || 'کل'}: ${fa(s.sum, 1)}`).join('، ') || undefined} />
      </div>
      <div className="fn-kpis">
        <KpiCard i={0} label="شاخص عملکرد برنامه (SPI)" value={fc.spi == null ? '—' : (fc.spi).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} tone={fc.spi == null ? 'neutral' : fc.spi >= 0.95 ? 'good' : fc.spi >= 0.8 ? 'warn' : 'bad'} sub="پیشرفت واقعی ÷ برنامه‌ای (۱ = مطابق برنامه)" />
        <KpiCard i={1} label="سرعت اخیر پیشرفت" value={fc.ratePerDay == null ? '—' : `${(fc.ratePerDay * 700).toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪ در هفته`} sub="میانگین چهار هفتهٔ اخیر (تأییدشده)" />
        <KpiCard i={2} label="پیش‌بینی پایان با سرعت فعلی" value={fc.forecastFinish ? jalaliText(fc.forecastFinish) : '—'} sub={fc.plannedFinish ? `پایان برنامه‌ای: ${jalaliText(fc.plannedFinish)}` : 'تاریخ پایان برنامه‌ای تعریف نشده'} />
        <KpiCard i={3} label="تأخیر یا پیشی پایان" value={fc.slipDays == null ? '—' : `${fc.slipDays > 0 ? '+' : ''}${fa(fc.slipDays)} روز`} tone={fc.slipDays == null ? 'neutral' : fc.slipDays > 30 ? 'bad' : fc.slipDays > 0 ? 'warn' : 'good'} sub="پیش‌بینی منهای پایان برنامه‌ای" />
      </div>
      <Tile title="منحنی پیشرفت هفتگی" hint="برنامه (خطی بین تاریخ شروع و پایان هر فعالیت) در برابر کارکرد تأییدشده و ثبت‌شده"><ProgressCurve data={m.curve} /></Tile>
      {m.approved.groups.length > 1 && <Section title="پیشرفت به‌تفکیک مبنای وزن‌دهی" hint="هر مبنا جدا و با مجموع ۱۰۰٪ محاسبه می‌شود؛ مقدارهای ناهم‌جنس هرگز مستقیم جمع نمی‌شوند." flush><DataTable rows={m.approved.groups} rowKey={(g) => g.group} cols={[{ key: 'g', label: 'مبنا', render: (g) => g.group || 'کل پروژه' }, { key: 'w', label: 'مجموع وزن', num: true, render: (g) => fa(g.weightSum, 2) }, { key: 'o', label: '', render: (g) => <Chip tone={g.ok ? 'good' : 'bad'}>{g.ok ? '۱۰۰٪' : 'مجموع ۱۰۰ نیست'}</Chip> }, { key: 'p', label: 'پیشرفت', render: (g) => <><Bar value={g.pct} /><span className="sub">{pct(g.pct)}</span></> }]} /></Section>}
      {chapters.length > 1 && <Section title="پیشرفت به‌تفکیک فصل" hint="میانگین وزنی پیشرفت ردیف‌های هر فصل؛ فصل‌ها به ترتیب وزن" flush>
        <div className="fn-tbl-wrap" style={{ maxHeight: 'none' }}><table className="ex-lines"><thead><tr><th>فهرست‌بها</th><th>فصل</th><th className="num">وزن</th><th className="num">ردیف</th><th>پیشرفت</th></tr></thead>
          <tbody>{chapters.map((c) => <tr key={c.key}><td className="sub">{books.find((b) => b.id === c.bookId)?.title ?? '—'}</td><td>{c.title}</td><td className="num">{fa(c.weight, 2)}</td><td className="num">{fa(c.rows)}</td><td style={{ minWidth: 160 }}><Bar value={c.pct} planned={null} /><span className="sub">{pct(c.pct, 0)}</span></td></tr>)}</tbody></table></div>
      </Section>}
      <Section title="پیشرفت هر فعالیت" hint="کارکرد تجمعی تأییدشدهٔ دستگاه نظارت نسبت به مقدار مبنای مصوب" flush><DataTable cols={cols} rows={m.approved.rows} rowKey={(r) => r.activity.id} /></Section>
    </div>
  )
}
