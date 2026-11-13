import { useMemo, useState, type CSSProperties } from 'react'
import { CalendarCheck2, Clock3, Construction, Minus, Plus, Shovel, Tractor, TrendingDown, TrendingUp, Truck } from 'lucide-react'
import type { OutlookCtx } from '../../lib/useOutlook'
import { ROLE_COLOR, ROLE_FA, civilForecast, fleetBalance, isHaulActivity, machinesFor, ratePerType, roleOf, type CivilDay, type CivilForecast, type FleetBalance } from '../../lib/engine/civil'
import { jalaliText } from '../../lib/periods'
import { JALALI_MONTHS } from '../../../../lib/jalali'
import { fa } from '../../components/common'
import { CountUp, OlCard, OlHead } from '../../components/outlook/olUi'

/**
 * کارکرد ماشین‌آلات سیویل — route making, trenching and backfill measured per machine-hour: the project's own history,
 * the last two weeks and the best estimate, and from it the finish with the fleet on site (or a what-if fleet) and the
 * machines needed to finish by the planned end. Formulas in lib/engine/civil.ts.
 */
export function OutlookCivil({ ctx, onGo }: { ctx: OutlookCtx; onGo: (sub: string) => void }) {
  const { m, inputs, machines, civilSections, workDays } = ctx
  const bySection = useMemo(() => civilSections.map((sec) => {
    const days: CivilDay[] = inputs.days.map((d) => ({ date: d.date, machines: machines.get(d.date)?.get(sec) ?? {}, out: d.out }))
    const acts = inputs.activities.filter((a) => a.crew === sec)
    return { sec, days, acts }
  }), [civilSections, inputs, machines])

  if (!civilSections.length) return (
    <OlCard><OlHead icon={Tractor} color="#a16207" title="ماشین‌آلات سیویل" hint="در گزارش‌های این پروژه بخشی با ماشین‌آلات سیویل (مسیرسازی، حفاری، خاکریزی) پیدا نشد." action={<button type="button" className="olx-btn" onClick={() => onGo('setup')}>انتخاب بخش‌ها در تنظیمات</button>} /></OlCard>
  )
  return (
    <div className="olx-grid">
      <p className="olx-note"><Clock3 size={15} aria-hidden /> بهره‌وری بر حسب «کارکرد در هر ساعت ماشین» است: مقدار تأییدشده ÷ مجموع (ماشین فعال × ساعت کار). مسیرسازی با بولدوزر، پیکور، بیل مکانیکی و لودر انجام می‌شود و ساعت آن‌ها شمرده می‌شود؛ کامیون فقط در کار حمل خاک مازاد (همراه لودر) حساب می‌شود. برآورد برای روزهای کاری عادی است؛ اثر هوا و فصل در داشبورد اتمام لحاظ شده است.</p>
      {bySection.map(({ sec, days, acts }, k) => {
        const list = acts.map((a) => ({ a, f: civilForecast({ days, activity: { id: a.id, title: a.title, unit: a.unit, remaining: Math.max(0, a.baseQty - a.doneQty), plannedEnd: a.plannedEnd }, today: m.today, workDays, include: machinesFor(a.title) }) }))
        const fb = fleetBalance(days, m.settings.crewComposition?.[sec] ?? null)
        const active = list.filter((x) => x.f.rate.estimate != null)
        const idle = list.filter((x) => x.f.rate.estimate == null && x.a.baseQty - x.a.doneQty > 0)
        return (
          <OlCard key={sec} i={k}>
            <OlHead icon={k % 2 ? Shovel : Tractor} color="#a16207" title={sec} hint={`${fa(acts.length)} فعالیت به این بخش وصل است${active.length ? ` · ${fa(active.length)} با کارکرد ثبت‌شده` : ''}`} action={!acts.length ? <button type="button" className="olx-btn" onClick={() => onGo('setup')}>وصل کردن فعالیت‌ها</button> : undefined} />
            {fb.lines.length > 0 && <FleetPanel fb={fb} onSetup={() => onGo('setup')} />}
            {active.length ? <div className="olc-list">{active.map(({ a, f }) => <CivilCard key={a.id} f={f} today={m.today} haul={isHaulActivity(a.title)} perType={ratePerType(days, a.id)} remake={(machines) => civilForecast({ days, activity: f.activity, today: m.today, workDays, include: machinesFor(a.title), fleetOverride: { machines } })} />)}</div>
              : <p className="im-helper">{acts.length ? 'هیچ‌کدام از فعالیت‌های این بخش هنوز کارکرد تأییدشده‌ای همراه با ساعت ماشین ندارد.' : 'فعالیتی به این بخش وصل نیست.'}</p>}
            {idle.length > 0 && <p className="olc-idle">بدون کارکرد تا امروز: {idle.map((x) => x.a.title).slice(0, 6).join('، ')}{idle.length > 6 ? ` و ${fa(idle.length - 6)} فعالیت دیگر` : ''}</p>}
          </OlCard>
        )
      })}
    </div>
  )
}

/** Fleet balance of a section: complete crews, the bottleneck machine, surplus and what one more crew needs; trucks apart. */
function FleetPanel({ fb, onSetup }: { fb: FleetBalance; onSetup: () => void }) {
  const bott = fb.bottleneck
  const need = fb.lines.filter((x) => x.forNextCrew > 0)
  return (
    <div className="olc-fleetbal">
      <div className="olc-fb-h">
        <span className="olc-fb-crews"><Construction size={16} aria-hidden /><b>{fa(fb.crews)}</b> اکیپ کامل</span>
        <span className="olc-fb-txt">{fb.defined ? 'بر پایهٔ ترکیب اکیپ تعریف‌شده' : 'ترکیب پیش‌فرض مسیرسازی: از هر ماشین خاکی یک دستگاه (کامیون فقط برای حمل خاک مازاد)'}{bott && <> · گلوگاه: <b>{bott}</b></>}</span>
        <button type="button" className="olx-link" onClick={onSetup}>{fb.defined ? 'ویرایش ترکیب' : 'تعریف ترکیب اکیپ'}</button>
      </div>
      <div className="olc-fb-grid">
        {fb.lines.map((x) => (
          <div key={x.name} className={`olc-fb-m${x.name === bott ? ' is-bott' : ''}${x.optional ? ' is-opt' : ''}`} style={{ '--c': ROLE_COLOR[x.role] } as CSSProperties}>
            {ROLE_FA[x.role] !== x.name && <span className="olc-fb-role">{ROLE_FA[x.role]}</span>}
            <b>{x.name}</b>
            <span className="olc-fb-n"><em>{fa(x.active, 1)}</em> فعال{x.perCrew > 0 && !x.optional ? ` · ${fa(x.perCrew)} در هر اکیپ` : ''}</span>
            <small>{x.optional ? (x.role === 'truck' ? 'فقط وقتی خاک مازاد حمل می‌شود؛ گلوگاه اکیپ نیست' : 'جزو ترکیب اکیپ نیست') : x.surplus >= 0.5 ? `${fa(x.surplus, 1)} مازاد بر اکیپ‌های کامل` : x.name === bott ? 'تعیین‌کنندهٔ تعداد اکیپ' : 'کاملاً در اکیپ‌ها'}</small>
          </div>
        ))}
      </div>
      {need.length > 0 && <p className="olc-fb-next">برای یک اکیپ کامل دیگر: {need.map((x) => `${fa(x.forNextCrew)} ${x.name}`).join(' + ')}</p>}
    </div>
  )
}

function CivilCard({ f: f0, today, remake, haul, perType }: { f: CivilForecast; today: string; remake: (machines: number) => CivilForecast; haul: boolean; perType: Record<string, number> }) {
  const [fleet, setFleet] = useState<number | null>(null)
  const machinesNow = Math.round(f0.fleet.machines * 10) / 10
  const n = fleet ?? machinesNow
  // a what-if fleet: same mix, same hours a day, same rate per machine-hour
  const f = useMemo(() => (fleet == null ? f0 : remake(fleet)), [f0, fleet, remake])
  const r = f0.rate, max = Math.max(r.history ?? 0, r.recent ?? 0, r.high ?? 0, 1e-9)
  const unit = f0.activity.unit
  const vs = f0.recentVsHistoryPct
  const bars: { k: string; label: string; v: number | null; tone: string }[] = [
    { k: 'h', label: 'سابقهٔ کل پروژه', v: r.history, tone: '#94a3b8' },
    { k: 'r', label: 'دو هفتهٔ اخیر', v: r.recent, tone: '#0ea5e9' },
    { k: 'e', label: 'برآورد مبنای پیش‌بینی', v: r.estimate, tone: '#f59e0b' },
  ]
  return (
    <article className="olc-card">
      <header className="olc-h"><b>{haul && <span className="olc-haul"><Truck size={13} aria-hidden /> حمل</span>}{f0.activity.title}</b><small>باقیمانده {fa(f0.activity.remaining, 1)} {unit} · {fa(r.days)} روز کار ماشین · {fa(r.machineHours)} ساعت‌ماشین</small></header>
      <div className="olc-body">
        <div className="olc-rate">
          <span className="olc-big"><CountUp value={r.estimate ?? 0} digits={1} /><small>{unit} در هر ساعت ماشین</small></span>
          {r.low != null && r.high != null && <span className="olc-band">بازهٔ ۸۰٪: {fa(r.low, 1)} تا {fa(r.high, 1)}</span>}
          <div className="olc-bars">
            {bars.map((b) => (
              <div key={b.k} className="olc-bar" style={{ '--c': b.tone, '--w': `${b.v == null ? 0 : (b.v / max) * 100}%` } as CSSProperties}>
                <span>{b.label}</span><i /><b>{b.v == null ? '—' : fa(b.v, 1)}</b>
              </div>
            ))}
          </div>
          {vs != null && <span className={`olc-trend ${vs >= 0 ? 'is-up' : 'is-down'}`}>{vs >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />} دو هفتهٔ اخیر {fa(Math.abs(vs))}٪ {vs >= 0 ? 'سریع‌تر' : 'کندتر'} از سابقهٔ پروژه{r.trendPerWeek != null && r.trendR2 != null && r.trendR2 > 0.2 ? ` · روند ${r.trendPerWeek >= 0 ? '+' : '−'}${fa(Math.abs(r.trendPerWeek), 2)} در هفته` : ''}</span>}
        </div>

        <div className="olc-fleet">
          <h4><Truck size={15} aria-hidden /> ماشین‌آلات این کار</h4>
          <table className="olc-tbl"><thead><tr><th>ماشین</th><th>فعال</th><th>ساعت</th><th>{unit} در ساعتِ همین ماشین</th><th>سهم ساعت‌ماشین</th></tr></thead>
            <tbody>{f0.machines.map((x) => <tr key={x.name}><td><span className="olc-dot" style={{ background: ROLE_COLOR[roleOf(x.name)] }} />{x.name}</td><td>{fa(x.avgActive, 1)}</td><td>{fa(x.avgHours, 1)}</td><td>{perType[x.name] == null ? '—' : fa(perType[x.name], 1)}</td><td><span className="olc-share" style={{ '--w': `${x.share * 100}%` } as CSSProperties}><i />{fa(x.share * 100)}٪</span></td></tr>)}</tbody></table>
          <p className="olc-hint">{haul ? 'کار حمل: فقط کامیون‌ها و لودر شمرده می‌شوند.' : 'کامیون‌ها در این کار شمرده نمی‌شوند (فقط برای حمل خاک مازاد).'}</p>
          {f0.months.length > 1 && (
            <div className="olc-months" aria-label="کارکرد در هر ساعت ماشین، ماه به ماه">
              {(() => { const mx = Math.max(...f0.months.map((x) => x.rate ?? 0), 1e-9); return f0.months.slice(-6).map((x) => <span key={x.key} style={{ '--h': `${((x.rate ?? 0) / mx) * 100}%` } as CSSProperties}><b>{x.rate == null ? '—' : fa(x.rate, 1)}</b><i /><small>{JALALI_MONTHS[x.jm - 1]}</small></span>) })()}
            </div>
          )}
        </div>

        <div className="olc-out">
          <h4><CalendarCheck2 size={15} aria-hidden /> تخمین</h4>
          <div className="olc-step" role="group" aria-label="تعداد ماشین در سناریو">
            <span>ماشین فعال</span>
            <button type="button" onClick={() => setFleet(Math.max(0.5, Math.round((n - 1) * 2) / 2))} aria-label="یک ماشین کمتر" disabled={n <= 1}><Minus size={14} /></button>
            <b>{fa(n, 1)}</b>
            <button type="button" onClick={() => setFleet(Math.round((n + 1) * 2) / 2)} aria-label="یک ماشین بیشتر"><Plus size={14} /></button>
            {fleet != null && <button type="button" className="olx-link" onClick={() => setFleet(null)}>فعلی</button>}
          </div>
          <dl>
            <div><dt>کارکرد روزانه</dt><dd>{f.perDay == null ? '—' : `${fa(f.perDay, 1)} ${unit}`}<small>{fa(n, 1)} ماشین × {fa(f0.fleet.hoursPerDay, 1)} ساعت</small></dd></div>
            <div><dt>روز کاری تا پایان</dt><dd>{f.workDaysLeft == null ? '—' : fa(f.workDaysLeft)}{fleet != null && f0.workDaysLeft != null && f.workDaysLeft != null && <small>{f.workDaysLeft < f0.workDaysLeft ? `${fa(f0.workDaysLeft - f.workDaysLeft)} روز کاری زودتر از ناوگان فعلی` : f.workDaysLeft > f0.workDaysLeft ? `${fa(f.workDaysLeft - f0.workDaysLeft)} روز کاری دیرتر از ناوگان فعلی` : 'همان ناوگان فعلی'}</small>}</dd></div>
            <div><dt>پایان این کار</dt><dd>{f.finish ? jalaliText(f.finish) : '—'}{f.finishEarly && f.finishLate && f.finish !== today && <small>بازه {jalaliText(f.finishEarly)} تا {jalaliText(f.finishLate)}</small>}</dd></div>
            {f0.activity.plannedEnd && <div><dt>برای پایان تا موعد ({jalaliText(f0.activity.plannedEnd)})</dt><dd className={f0.machinesNeeded != null && f0.machinesNeeded > machinesNow ? 'is-bad' : 'is-ok'}>{f0.machinesNeeded == null ? 'موعد گذشته است' : f0.machinesNeeded <= machinesNow ? `ناوگان فعلی کافی است (کمینه ${fa(f0.machinesNeeded)} ماشین)` : `${fa(f0.machinesNeeded)} ماشین لازم است (${fa(f0.machinesNeeded - machinesNow, 1)} بیشتر از ناوگان فعلی)`}<small>با همان کارکرد در هر ساعت و {fa(f0.fleet.hoursPerDay, 1)} ساعت در روز</small></dd></div>}
          </dl>
        </div>
      </div>
    </article>
  )
}
