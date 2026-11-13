import { lazy, Suspense, useMemo, type CSSProperties } from 'react'
import { Cpu, Gauge, Loader2, Users, Wand2 } from 'lucide-react'
import type { OutlookCtx } from '../../lib/useOutlook'
import { addDays, jalaliText, weekdayOf } from '../../lib/periods'
import { fa } from '../../components/common'
import { CountUp, OlCard, OlHead } from '../../components/outlook/olUi'

const ProductivityPage = lazy(() => import('../ProductivityPage').then((x) => ({ default: x.ProductivityPage })))

/** The views of this page: crew productivity from the daily reports, and the crew-log engine (rates, forecast, compensation scenarios). */
export const CREW_VIEWS = [
  { id: 'crew', label: 'از گزارش روزانه', icon: Users },
  { id: 'crew-rates', label: 'نرخ اکیپ‌ها (لاگ اکیپ)', icon: Gauge },
  { id: 'crew-forecast', label: 'پیش‌بینی با لاگ اکیپ', icon: Cpu },
  { id: 'crew-scen', label: 'سناریوهای جبرانی', icon: Wand2 },
] as const
const LOG_SUB: Record<string, string> = { 'crew-rates': 'rates', 'crew-forecast': 'forecast', 'crew-scen': 'scenarios' }

/**
 * بهره‌وری اکیپ‌ها — one place for crew productivity inside the finish forecast: each crew type's complete crews day by
 * day, each activity's output per complete crew, how often the crew actually produced on it, and the crews needed to
 * finish it by its planned end; then the crew-log engine for the detail it records (composition, useful and idle hours).
 */
export function OutlookCrews({ ctx, view, onView }: { ctx: OutlookCtx; view: string; onView: (v: string) => void }) {
  const { m, o, inputs, workDays } = ctx
  const wdBetween = (to: string) => { let c = 0; for (let d = addDays(m.today, 1); d <= to; d = addDays(d, 1)) if (workDays.includes(weekdayOf(d))) c++; return c }
  const wd28 = useMemo(() => { let c = 0; for (let k = 1; k <= 28; k++) if (workDays.includes(weekdayOf(addDays(m.today, k)))) c++; return c }, [m.today, workDays])
  const crews = useMemo(() => o.crews.filter((c) => c.activities > 0).map((c) => {
    const series = inputs.days.slice(-30).map((d) => ({ date: d.date, n: d.crews[c.crew] }))
    // activities with their own measured rate first, then the ones waiting their turn, heaviest first
    const rank = (a: (typeof o.activities)[number]) => (a.model ? 0 : a.reason === 'queued' ? 1 : 2)
    const acts = o.activities.filter((a) => a.activity.crew === c.crew && a.remaining > 0).sort((x, y) => rank(x) - rank(y) || y.activity.weight - x.activity.weight)
    return { c, series, acts }
  }).sort((x, y) => Number(!x.acts.some((a) => a.model)) - Number(!y.acts.some((a) => a.model))), [o, inputs.days])

  return (
    <div className="olx-grid">
      <div className="olx-seg olx-crew-seg" role="tablist" aria-label="نمای بهره‌وری اکیپ‌ها">
        {CREW_VIEWS.map((v) => { const I = v.icon; return <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => onView(v.id)}><I size={14} aria-hidden /> {v.label}</button> })}
      </div>

      {view !== 'crew' ? (
        <Suspense fallback={<div className="olx-card" style={{ placeItems: 'center' }}><Loader2 className="spin" size={18} /></div>}>
          <p className="olx-note"><Cpu size={15} aria-hidden /> این نماها از «اکیپ‌ها و بهره‌وری» داخل گزارش روزانه (لاگ اکیپ) تغذیه می‌شوند: ترکیب هر اکیپ، ساعت مفید و توقف، و مقدار خروجی. جزئی‌ترند، ولی فقط وقتی لاگ اکیپ ثبت شده باشد عدد دارند.</p>
          <ProductivityPage projectId={m.projectId} sub={LOG_SUB[view] ?? 'rates'} />
        </Suspense>
      ) : (
        <>
          <p className="olx-note"><Users size={15} aria-hidden /> از گزارش‌های روزانهٔ کارکرد: تعداد اکیپ کامل هر روز از جدول منابع شمرده می‌شود و کارکرد هر فعالیت بر اکیپ کامل سنجیده می‌شود. همین اعداد مبنای تاریخ اتمام در داشبورد است.</p>
          {crews.map(({ c, series, acts }, k) => {
            const max = Math.max(1, ...series.map((x) => x.n ?? 0))
            return (
              <OlCard key={c.crew} i={k}>
                <OlHead icon={Users} color="#f97316" title={c.crew} hint={`${fa(c.activities)} فعالیت${c.finish ? ` · پایان کارهای این اکیپ ${jalaliText(c.finish)}` : ''}`} />
                <div className="olp-top">
                  <div className="olp-kpi"><small>اکیپ کامل (دو هفتهٔ اخیر)</small><b>{c.recent == null ? '—' : <CountUp value={c.recent} digits={1} />}</b></div>
                  <div className="olp-spark" aria-label="تعداد اکیپ کامل در ۳۰ روز گزارش اخیر">
                    {series.map((x) => <i key={x.date} title={`${jalaliText(x.date)}: ${x.n == null ? 'ثبت نشده' : `${fa(x.n)} اکیپ`}`} className={x.n == null ? 'is-na' : x.n === 0 ? 'is-zero' : ''} style={{ '--h': `${x.n == null ? 8 : Math.max(8, (x.n / max) * 100)}%` } as CSSProperties} />)}
                    <span>۳۰ روز اخیر</span>
                  </div>
                </div>
                {acts.length ? (
                  <div className="olp-tbl-wrap"><table className="olp-tbl">
                    <thead><tr><th>فعالیت</th><th>هر اکیپ در روز صاف</th><th>روزهای با کارکرد</th><th>اثر اکیپ اضافه</th><th>کارکرد ۴ هفتهٔ آینده</th><th>اکیپ لازم برای موعد</th></tr></thead>
                    <tbody>{acts.map((a) => {
                      const md = a.model
                      const used = md ? md.positiveDays / Math.max(1, md.days) : null
                      // crews needed by the planned end at the rate the next four weeks are expected to give per crew
                      const perCrewReal = md && c.recent && wd28 ? a.next28 / wd28 / c.recent : null
                      const left = a.activity.plannedEnd ? wdBetween(a.activity.plannedEnd) : null
                      const need = perCrewReal && left && left > 0 ? Math.ceil(a.remaining / (perCrewReal * left)) : null
                      return (
                        <tr key={a.activity.id}>
                          <td><b>{a.activity.title}</b><small>باقیمانده {fa(a.remaining, 1)} {a.activity.unit}</small></td>
                          <td>{md?.perCrewRate != null ? `${fa(md.perCrewRate, 1)} ${a.activity.unit}` : <span className="olp-muted">{a.reason === 'queued' ? 'در نوبت اکیپ' : 'هنوز کارکرد ندارد'}</span>}</td>
                          <td>{used == null ? '—' : <span className="olp-use" style={{ '--w': `${used * 100}%` } as CSSProperties}><i />{fa(used * 100)}٪</span>}</td>
                          <td>{md ? <span title={md.gammaData > 0.5 ? 'برآوردشده از داده' : 'پیش‌فرض (تعداد اکیپ‌ها ثابت بوده)'}>{fa(md.gamma, 2)}{md.gammaData <= 0.15 ? ' *' : ''}</span> : '—'}</td>
                          <td>{md || (a.reason === 'queued' && a.next28 > 0) ? `${fa(a.next28, 1)} ${a.activity.unit}` : a.reason === 'queued' ? <span className="olp-muted">پس از کارهای جاری{a.start ? ` (از ${jalaliText(a.start)})` : ''}</span> : '—'}</td>
                          <td>{!a.activity.plannedEnd ? <span className="olp-muted">بدون موعد</span> : left != null && left <= 0 ? <span className="olp-bad">موعد گذشته</span> : need == null ? '—' : <span className={need > Math.round(c.recent ?? 0) ? 'olp-bad' : 'olp-ok'}>{fa(need)} اکیپ{need > Math.round(c.recent ?? 0) ? ` (+${fa(need - Math.round(c.recent ?? 0))})` : ''}</span>}</td>
                        </tr>
                      )
                    })}</tbody>
                  </table></div>
                ) : <p className="im-helper">کار باقیمانده‌ای برای این اکیپ نیست.</p>}
                <p className="olp-foot">«روزهای با کارکرد» = سهم روزهایی که اکیپ در کارگاه بوده و این فعالیت کارکرد ثبت‌شده داشته. «*» یعنی تعداد اکیپ‌ها در سابقه ثابت بوده و اثر اکیپ اضافه از پیش‌فرض (۱) آمده است.</p>
              </OlCard>
            )
          })}
          {!crews.length && <OlCard><p className="im-helper">هنوز هیچ فعالیتی به اکیپی وصل نیست؛ از «تعاریف و تنظیمات» شروع کنید.</p></OlCard>}
        </>
      )}
    </div>
  )
}
