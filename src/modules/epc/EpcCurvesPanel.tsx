import { useState } from 'react'
import { SCurveChart } from '../../components/charts/SCurveChart'
import { jalaliText } from '../execution/lib/periods'
import type { EpcLive } from './useEpcLive'
import type { DiscKey } from './epcCurves'
import { EPC_COLORS, EPC_LABELS } from './EpcGauges'

const fa = (v: number, d = 1) => v.toLocaleString('fa-IR', { maximumFractionDigits: d })
const jd = (x: string | null | undefined) => (x ? jalaliText(x) : '—')
/** ISO dates and Latin digits in the engine's explanations → Jalali dates and Persian digits */
const faText = (s: string) => s.replace(/\d{4}-\d{2}-\d{2}/g, (x) => jalaliText(x)).replace(/\d/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x])
const KEYS: DiscKey[] = ['total', 'eng', 'proc', 'cons']

const CSS = `.ecp{display:grid;gap:12px}.ecp-seg{display:flex;gap:6px;flex-wrap:wrap}
.ecp-seg button{display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:999px;border:1px solid var(--im-line,rgba(148,163,184,.3));background:transparent;color:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:transform .14s ease-out,background .14s,border-color .14s}
.ecp-seg button:active{transform:scale(.97)}.ecp-seg button i{width:9px;height:9px;border-radius:99px;background:var(--c)}
.ecp-seg button[aria-pressed=true]{border-color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c)}
.ecp-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.ecp-kpi>div{border:1px solid var(--im-line,rgba(148,163,184,.25));border-radius:12px;padding:8px 12px;display:grid;gap:2px}
.ecp-kpi small{font-size:11px;color:var(--im-muted,#94a3b8)}.ecp-kpi b{font-size:16px;font-variant-numeric:tabular-nums}
.ecp-why{font-size:12px;line-height:2;color:var(--im-muted,#94a3b8);margin:0}.ecp-why b{color:var(--im-text,inherit)}
.ecp details{border:1px dashed var(--im-line,rgba(148,163,184,.35));border-radius:12px;padding:8px 12px}.ecp summary{cursor:pointer;font-weight:800;font-size:12.5px}`

/** EPC S-curves: the total and each discipline, planned / actual / forecast, from the shared source. */
export function EpcCurvesPanel({ epc }: { epc: EpcLive }) {
  const avail = KEYS.filter((k) => epc.curves?.[k])
  const [k, setK] = useState<DiscKey>(avail[0] ?? 'total')
  const key = avail.includes(k) ? k : avail[0]
  if (!key || !epc.curves) return <p className="im-helper" style={{ margin: 0 }}>برای رسم منحنی S قرارداد EPC، تاریخ‌های برنامه‌ای در ماژول‌های مهندسی، تأمین کالا یا اجرا لازم است.</p>
  const curve = epc.curves[key]!
  const fc = epc.forecasts[key]
  const f = fc && !('reason' in fc) ? fc : null
  const now = key === 'total' ? epc.now.overall : epc.now[key]
  const color = EPC_COLORS[key]
  const rows = curve.map((c) => ({ date: c.date, planned: c.planned, actual: c.actual, forecast: null as number | null }))
  if (f) for (const p of f.points) { const i = rows.findIndex((r) => r.date === p.date); if (i >= 0) rows[i].forecast = p.value; else rows.push({ date: p.date, planned: null, actual: null, forecast: p.value }) }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  const varc = now && now.planned != null ? now.actual - now.planned : null
  return (
    <div className="ecp"><style>{CSS}</style>
      <div className="ecp-seg" role="group" aria-label="بخش قرارداد">
        {avail.map((x) => <button key={x} aria-pressed={key === x} style={{ ['--c' as string]: EPC_COLORS[x] }} onClick={() => setK(x)}><i />{EPC_LABELS[x]}</button>)}
      </div>
      <div className="ecp-kpi">
        <div><small>پیشرفت واقعی امروز</small><b style={{ color }}>{now ? `${fa(now.actual)}٪` : '—'}</b></div>
        <div><small>پیشرفت برنامه‌ای امروز</small><b>{now?.planned == null ? '—' : `${fa(now.planned)}٪`}</b></div>
        <div><small>انحراف</small><b style={{ color: varc == null ? undefined : varc >= 0 ? '#16a34a' : '#ef4444' }}>{varc == null ? '—' : `${varc >= 0 ? '+' : '−'}${fa(Math.abs(varc))} واحد`}</b></div>
        <div><small>{f?.spi != null ? 'SPI زمانی' : 'روش پیش‌بینی'}</small><b>{f?.spi != null ? fa(f.spi, 2) : key === 'eng' ? 'نرخ تولید مدارک' : key === 'total' ? 'ترکیب بخش‌ها' : '—'}</b></div>
        <div><small>پایان برنامه‌ای</small><b>{jd(f?.plannedEnd ?? null)}</b></div>
        <div><small>پایان پیش‌بینی</small><b style={{ color: f && (f.slipDays ?? 0) > 0 ? '#ef4444' : undefined }}>{f ? jd(f.endDate) : '—'}</b>{f?.slipDays != null && <small>{f.slipDays > 0 ? `${fa(f.slipDays, 0)} روز تأخیر` : f.slipDays < 0 ? `${fa(-f.slipDays, 0)} روز زودتر` : 'مطابق برنامه'}</small>}</div>
      </div>
      <SCurveChart h={320} rows={rows}
        series={[
          { key: 'planned', label: 'برنامه', color: '#6366f1', kind: 'planned' },
          { key: 'actual', label: `واقعی — ${EPC_LABELS[key]}`, color, kind: 'actual' },
          ...(f ? [{ key: 'forecast', label: 'پیش‌بینی با عملکرد گذشته', color: '#f59e0b', kind: 'forecast' as const }] : []),
        ]}
        markers={[
          { date: epc.today, label: 'امروز', color: '#f43f5e', strong: true },
          ...(f?.plannedEnd ? [{ date: f.plannedEnd, label: 'پایان برنامه', color: '#6366f1' }] : []),
          ...(f ? [{ date: f.endDate, label: 'پایان پیش‌بینی', color: '#f59e0b' }] : []),
        ]} />
      {fc && 'reason' in fc && <p className="im-helper" style={{ margin: 0 }}>پیش‌بینی: {fc.reason}</p>}
      {f && <p className="ecp-why"><b>مبنای پیش‌بینی:</b> {f.basis.map(faText).join(' ')}{f.assumed ? ' (بخشی از پیش‌بینی فرضی است؛ با ثبت پیشرفت واقعی دقیق می‌شود.)' : ''}</p>}
      <details>
        <summary>پیش‌بینی چگونه محاسبه می‌شود؟</summary>
        <p className="ecp-why">
          <b>تأمین کالا و اجرا — روش زمان‌بندی کسب‌شده (Earned Schedule):</b> ابتدا تاریخی پیدا می‌شود که طبق برنامه باید به پیشرفت واقعیِ امروز می‌رسیدیم (ES).
          سپس سرعت واقعی کار (SPI زمانی) از شروع برنامه‌ای همان بخش تا امروز اندازه‌گیری می‌شود: اگر از شروع، ۲۰۰ روز گذشته و به اندازهٔ ۱۰۰ روزِ برنامه کار انجام شده باشد، SPI زمانی ۰٫۵ است.
          باقی‌ماندهٔ برنامه با همین سرعت ادامه داده می‌شود و پایان پیش‌بینی برابر است با امروز + (پایان برنامه − ES) ÷ SPI زمانی. سرعت هشت هفتهٔ اخیر برای مقایسه نوشته می‌شود، اما چون به زمان ثبت گزارش‌ها حساس است، مبنای پیش‌بینی نیست.
          <br /><b>مهندسی:</b> همان پیش‌بینی ماژول پیشرفت مهندسی، بر پایهٔ نرخ ارسال مدارک در شش هفتهٔ اخیر و میانهٔ فاصلهٔ ارسال تا تأیید نهایی، تا هر دو ماژول یک تاریخ پایان نشان دهند.
          <br /><b>کل EPC:</b> پیش‌بینی سه بخش با همان وزن‌های پیشرفت ترکیب می‌شود و پایان کل با دیرترین بخش تعیین می‌شود.
        </p>
      </details>
    </div>
  )
}
