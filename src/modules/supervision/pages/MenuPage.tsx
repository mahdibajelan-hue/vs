import { useCallback, useEffect, useMemo, useState } from 'react'
import { Apple, Beef, BellRing, ChefHat, ChevronLeft, ChevronRight, Coffee, Fish, Flame, IceCreamCone, Moon, Save, Soup, Sparkles, X } from 'lucide-react'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { JALALI_MONTHS, formatJalali, isoToJalali, jalaliWeekday } from '../../../lib/jalali'
import { addDays, fa, faNum, todayLocal, weekdayFa } from '../lib/svMonth'
import { FACES, FACE_FA, LOW_COOK_AVG, LOW_COOK_MIN, LOW_DISH_AVG, LOW_DISH_MIN, MEALS, MEAL_FA, dishScores, faceFor, overall, planWeek, type Meal, type MenuItem } from '../lib/svMenu'
import { DAY_TARGET, dayLevel, energySplit, mealNutrition, sumNutri, type MealNutri, type Nutri } from '../lib/svNutrition'
import { loadCookTeam, loadMenus, saveCookTeam, saveMenus, type SvMenu, type SvRating } from '../lib/menuApi'
import { Flash } from '../components/common'

/** Saturday of the week that holds `iso` (an Iranian week runs Saturday → Friday). */
const weekStart = (iso: string) => { const j = isoToJalali(iso)!; return addDays(iso, -jalaliWeekday(j.jy, j.jm, j.jd)) }
const cellKey = (day: string, meal: Meal) => `${day}|${meal}`
type Draft = Record<string, MenuItem>

/** منوی غذا — the head of supervision plans the week (with dessert and seasonal fruit); supervisors rate each meal with a face. */
export function MenuPage() {
  const projectId = useSupervisionStore((s) => s.projectId)
  const canEdit = useSupervisionStore((s) => s.canHand)()
  const [start, setStart] = useState(() => weekStart(todayLocal()))
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start])
  const [menus, setMenus] = useState<SvMenu[]>([])
  const [ratings, setRatings] = useState<SvRating[]>([])
  // ratings of the last 30 days, for the satisfaction panel and to keep disliked dishes out of new plans
  const [recent, setRecent] = useState<{ menus: SvMenu[]; ratings: SvRating[] }>({ menus: [], ratings: [] })
  const [cook, setCook] = useState('')
  const [cookSaved, setCookSaved] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const today = todayLocal()

  const refresh = useCallback(async () => {
    if (!projectId) return
    // one request for the shown week and the last 30 days (they usually overlap), split here
    const from30 = addDays(today, -30)
    const lo = days[0] < from30 ? days[0] : from30, hi = days[6] > today ? days[6] : today
    const [all, c] = await Promise.all([loadMenus(projectId, lo, hi), loadCookTeam(projectId)])
    const pick = (a: string, b: string) => { const m = all.menus.filter((x) => x.day >= a && x.day <= b), ids = new Set(m.map((x) => x.id)); return { menus: m, ratings: all.ratings.filter((x) => ids.has(x.menuId)) } }
    const w = pick(days[0], days[6])
    setMenus(w.menus); setRatings(w.ratings); setRecent(pick(from30, today)); setCook(c); setCookSaved(c)
    if (all.error) setMsg({ ok: false, text: all.error })
  }, [projectId, days, today])
  useEffect(() => { setDraft(null); void refresh() }, [refresh])

  const byCell = useMemo(() => new Map(menus.map((m) => [cellKey(m.day, m.meal), m])), [menus])
  const scores = useMemo(() => dishScores(recent.menus, recent.ratings), [recent])
  const low = scores.filter((x) => x.low)
  const twoWeeks = useMemo(() => { const ids = new Set(recent.menus.filter((m) => m.day >= addDays(today, -14)).map((m) => m.id)); return overall(recent.ratings.filter((r) => ids.has(r.menuId))) }, [recent, today])
  const cellAvg = (id: string | undefined) => { const r = ratings.filter((x) => x.menuId === id); return r.length ? { avg: r.reduce((s, x) => s + x.score, 0) / r.length, n: r.length } : null }

  const startEdit = () => setDraft(Object.fromEntries(days.flatMap((day) => MEALS.map((meal) => { const m = byCell.get(cellKey(day, meal)); return [cellKey(day, meal), { day, meal, main: m?.main ?? '', side: m?.side ?? '', dessert: m?.dessert ?? '', fruit: m?.fruit ?? '' }] }))))
  const suggest = () => {
    const j = isoToJalali(days[3])!
    const plan = planWeek(days, { jm: j.jm, avoid: low.map((x) => x.dish), seed: `${projectId}|${start}|${Date.now() % 97}` })
    setDraft(Object.fromEntries(plan.map((x) => [cellKey(x.day, x.meal), x])))
    setMsg({ ok: true, text: `پیشنهاد هفته آماده شد${low.length ? `؛ ${fa(low.length)} غذای کم‌رضایت کنار گذاشته شد` : ''}. بازبینی و ذخیره کنید.` })
  }
  const save = async () => {
    if (!projectId || !draft) return
    setBusy(true)
    const r = await saveMenus(projectId, Object.values(draft).map((x) => ({ ...x, cookTeam: cook })))
    setBusy(false)
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? 'ذخیره نشد' })
    setDraft(null); setMsg({ ok: true, text: 'منوی هفته ذخیره شد و برای ناظران دیده می‌شود.' }); void refresh()
  }
  const set = (k: string, f: keyof MenuItem, v: string) => setDraft((d) => d && { ...d, [k]: { ...d[k], [f]: v } })

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="im-card sv-menu-bar">
        <div className="sv-daybar">
          <button className="sv-iconbtn" onClick={() => setStart(addDays(start, -7))} aria-label="هفتهٔ قبل"><ChevronRight size={17} /></button>
          <b style={{ minWidth: 190, textAlign: 'center' }}>{fa(formatJalali(days[0]))} تا {fa(formatJalali(days[6]))}</b>
          <button className="sv-iconbtn" onClick={() => setStart(addDays(start, 7))} aria-label="هفتهٔ بعد"><ChevronLeft size={17} /></button>
          {start !== weekStart(today) && <button className="im-ghostlink" onClick={() => setStart(weekStart(today))}>این هفته</button>}
        </div>
        <label className="sv-menu-cook">
          <ChefHat size={16} aria-hidden /><span>تیم آشپز</span>
          <input value={cook} disabled={!canEdit} placeholder="مثلاً پیمانکار تغذیهٔ کمپ" onChange={(e) => setCook(e.target.value)} />
          {canEdit && cook !== cookSaved && <button className="im-btn im-btn-ghost im-btn-sm" onClick={async () => { const r = await saveCookTeam(projectId!, cook); if (r.ok) setCookSaved(cook); setMsg(r.ok ? { ok: true, text: 'تیم آشپز ذخیره شد.' } : { ok: false, text: r.error ?? '' }) }}><Save size={13} /> ذخیره</button>}
        </label>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, marginInlineStart: 'auto', flexWrap: 'wrap' }}>
            {!draft ? <>
              <button className="im-btn im-btn-ghost im-btn-sm" onClick={startEdit}>ویرایش منو</button>
              <button className="im-btn im-btn-primary im-btn-sm" onClick={suggest}><Sparkles size={14} /> پیشنهاد هفته</button>
            </> : <>
              <button className="im-btn im-btn-ghost im-btn-sm" onClick={suggest}><Sparkles size={14} /> پیشنهاد دیگر</button>
              <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setDraft(null)}><X size={14} /> انصراف</button>
              <button className="im-btn im-btn-primary im-btn-sm" disabled={busy} onClick={save}><Save size={14} /> {busy ? 'در حال ذخیره…' : 'ذخیرهٔ منوی هفته'}</button>
            </>}
          </div>
        )}
      </div>
      <Flash msg={msg} />

      {(low.length > 0 || twoWeeks.low) && (
        <div className="sv-menu-alarm" role="alert">
          <BellRing size={18} aria-hidden />
          <div>
            <b>رضایت پایین از غذا — به سرپرست نظارت و مدیر پروژه هشدار داده شد</b>
            <ul>
              {low.map((x) => <li key={x.dish}>«{x.dish}»: {faceFor(x.avg)} میانگین {faNum(x.avg)} از ۵ در {fa(x.n)} نظر — این غذا را از منو بردارید یا دستور پخت را با آشپز بررسی کنید.</li>)}
              {twoWeeks.low && <li>رضایت کلی دو هفتهٔ اخیر {faceFor(twoWeeks.avg)} {faNum(twoWeeks.avg)} از ۵ ({fa(twoWeeks.n)} نظر){cookSaved && ` برای تیم آشپز «${cookSaved}»`} — تغییر منو یا تیم آشپز را بررسی کنید.</li>}
            </ul>
          </div>
        </div>
      )}

      <WeekStats days={days} cell={(day, meal) => draft?.[cellKey(day, meal)] ?? byCell.get(cellKey(day, meal))} />

      <div className="sv-cal" role="table" aria-label="منوی هفته">
        <div className="sv-cal-labels" role="row" aria-hidden>
          <span className="sv-cal-corner" />
          {MEALS.map((meal) => { const I = MEAL_ICON[meal]; return <span key={meal} className={`sv-cal-label ${meal}`}><I size={16} />{MEAL_FA[meal]}<small>{meal === 'lunch' ? '+ دسر' : meal === 'dinner' ? '+ میوه' : ''}</small></span> })}
          <span className="sv-cal-label total"><Flame size={16} />جمع روز</span>
        </div>
        {days.map((day) => {
          const j = isoToJalali(day)!
          const items = MEALS.map((meal) => draft?.[cellKey(day, meal)] ?? byCell.get(cellKey(day, meal)))
          const nut = items.map((x) => (x ? mealNutrition(x) : null))
          const total = sumNutri(nut.filter((x): x is NonNullable<typeof x> => !!x))
          const lvl = dayLevel(total.kcal)
          const split = energySplit(total)
          return (
            <div key={day} className={`sv-cal-day${day === today ? ' today' : ''}${day < today ? ' past' : ''}`} role="row">
              <div className="sv-cal-head" role="rowheader">
                <span className="wd">{weekdayFa(day)}</span>
                <b className="dn">{fa(j.jd)}</b>
                <span className="mn">{JALALI_MONTHS[j.jm - 1]}</span>
                {day === today && <span className="sv-cal-today">امروز</span>}
              </div>
              {MEALS.map((meal, mi) => {
                const k = cellKey(day, meal), m = byCell.get(k), d = draft?.[k], v = nut[mi]
                if (d) return (
                  <div key={meal} role="cell" className={`sv-cal-cell ${meal} edit`}>
                    <span className="sv-cal-mtag">{MEAL_FA[meal]}</span>
                    <input aria-label={`${MEAL_FA[meal]} ${weekdayFa(day)}`} placeholder={meal === 'breakfast' ? 'صبحانه' : 'غذای اصلی'} value={d.main} onChange={(e) => set(k, 'main', e.target.value)} />
                    {meal !== 'breakfast' && <input aria-label="همراه" placeholder="همراه" value={d.side} onChange={(e) => set(k, 'side', e.target.value)} />}
                    {meal === 'lunch' && <input aria-label="دسر" placeholder="دسر" value={d.dessert} onChange={(e) => set(k, 'dessert', e.target.value)} />}
                    {meal === 'dinner' && <input aria-label="میوه" placeholder="میوه" value={d.fruit} onChange={(e) => set(k, 'fruit', e.target.value)} />}
                    {v && v.kcal > 0 && <Kcal v={v} />}
                  </div>
                )
                const a = cellAvg(m?.id)
                const bad = a && a.n >= LOW_DISH_MIN && a.avg <= LOW_DISH_AVG
                return (
                  <div key={meal} role="cell" className={`sv-cal-cell ${meal}${bad ? ' bad' : ''}${m?.main ? '' : ' empty'}`}>
                    <span className="sv-cal-mtag">{MEAL_FA[meal]}</span>
                    {m?.main ? <>
                      <b className="dish">{m.main}</b>
                      {m.side && <span className="side">{m.side}</span>}
                      {(m.dessert || m.fruit) && (
                        <span className="extras">
                          {m.dessert && <span className="chip dessert"><IceCreamCone size={12} />{m.dessert}</span>}
                          {m.fruit && <span className="chip fruit"><Apple size={12} />{m.fruit}</span>}
                        </span>
                      )}
                      <span className="foot">
                        {v && <Kcal v={v} />}
                        {a && <span className="sv-menu-score" title={`${FACE_FA[Math.round(a.avg) - 1] ?? ''}، ${fa(a.n)} نظر`}>{faceFor(a.avg)} {faNum(a.avg)}<small>({fa(a.n)})</small></span>}
                      </span>
                    </> : <span className="sv-cal-none">—</span>}
                  </div>
                )
              })}
              <div className={`sv-cal-total ${total.kcal ? lvl : 'none'}`} role="cell">
                {total.kcal ? <>
                  <b>{fa(Math.round(total.kcal).toLocaleString('en'))}<small> کیلوکالری</small></b>
                  <span className="meter" aria-hidden><i style={{ width: `${Math.min(100, (total.kcal / DAY_TARGET.high) * 100)}%` }} /><em style={{ insetInlineStart: `${(DAY_TARGET.low / DAY_TARGET.high) * 100}%` }} /></span>
                  <span className="macro" title={`پروتئین ${fa(split.protein)}٪، کربوهیدرات ${fa(split.carbs)}٪، چربی ${fa(split.fat)}٪ انرژی`} aria-label={`پروتئین ${fa(Math.round(total.protein))} گرم، کربوهیدرات ${fa(Math.round(total.carbs))} گرم، چربی ${fa(Math.round(total.fat))} گرم`}>
                    <i className="p" style={{ flexGrow: split.protein }} /><i className="c" style={{ flexGrow: split.carbs }} /><i className="f" style={{ flexGrow: split.fat }} />
                  </span>
                  <small className="grams">پ {fa(Math.round(total.protein))}  ک {fa(Math.round(total.carbs))}  چ {fa(Math.round(total.fat))} گرم</small>
                </> : <span className="sv-cal-none">—</span>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="sv-note sv-cal-legend">
        <span><i className="p" /> پروتئین</span><span><i className="c" /> کربوهیدرات</span><span><i className="f" /> چربی</span>
        <span>ارزش غذایی تقریبی برای یک پرس معمول کمپ است (جداول ترکیبات غذایی ایرانی). انرژی مناسب روزانه برای کار در کارگاه حدود {fa(DAY_TARGET.low.toLocaleString('en'))} تا {fa(DAY_TARGET.high.toLocaleString('en'))} کیلوکالری؛ کمتر زرد و بیشتر نارنجی نشان داده می‌شود. غذای دستی که در فهرست نیست با «≈» برآورد می‌شود.</span>
      </p>
      {!menus.length && !draft && <p className="sv-note" style={{ margin: 0 }}>برای این هفته منویی ثبت نشده است.{canEdit ? ' «پیشنهاد هفته» یک برنامهٔ متنوع با دسر و میوهٔ فصل می‌چیند (ماهی حداقل یک بار، بدون غذای تکراری، شام‌های سبک، بدون غذاهای کم‌رضایت).' : ''}</p>}

      <div className="im-card">
        <h2 style={{ fontSize: 15, fontWeight: 900, margin: '0 0 4px' }}>رضایت ناظران در ۳۰ روز اخیر</h2>
        <p className="sv-note" style={{ margin: '0 0 10px' }}>هر ناظر در «ورود و خروج من» به هر وعده با یک شکلک نظر می‌دهد ({FACES.map((f, i) => `${f} ${FACE_FA[i]}`).join('، ')}). غذایی با میانگین {faNum(LOW_DISH_AVG)} یا کمتر از حداقل {fa(LOW_DISH_MIN)} نظر، و رضایت کلی {fa(LOW_COOK_AVG)} یا کمتر در دو هفته (حداقل {fa(LOW_COOK_MIN)} نظر)، برای سرپرست نظارت و مدیر پروژه هشدار می‌فرستد.</p>
        <div className="sv-menu-overall">
          <span className="sv-menu-big">{twoWeeks.n ? faceFor(twoWeeks.avg) : '—'}</span>
          <div><b>{twoWeeks.n ? `${faNum(twoWeeks.avg)} از ۵` : 'هنوز نظری نیست'}</b><small>رضایت کلی دو هفتهٔ اخیر{twoWeeks.n ? `، ${fa(twoWeeks.n)} نظر` : ''}{cookSaved ? `، تیم آشپز: ${cookSaved}` : ''}</small></div>
        </div>
        {scores.length > 0 && (
          <ul className="sv-menu-scores">
            {scores.map((x) => (
              <li key={x.dish} className={x.low ? 'bad' : ''}>
                <span className="f" aria-hidden>{faceFor(x.avg)}</span>
                <span className="n">{x.dish}</span>
                <span className="bar" aria-hidden><i style={{ width: `${(x.avg / 5) * 100}%` }} /></span>
                <span className="v">{faNum(x.avg)}<small> ({fa(x.n)})</small></span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const MEAL_ICON = { breakfast: Coffee, lunch: Soup, dinner: Moon } as const

/** energy of one meal; «≈» when the dish was typed by hand and estimated by kind, «+» when a part is unknown */
function Kcal({ v }: { v: MealNutri }) {
  return (
    <span className="sv-kcal" title={`پروتئین ${fa(v.protein)} گرم، کربوهیدرات ${fa(v.carbs)} گرم، چربی ${fa(v.fat)} گرم${v.estimated ? ' — برآورد' : ''}${v.complete ? '' : ' — بخشی از وعده در فهرست ارزش غذایی نیست'}`}>
      <Flame size={11} />{v.estimated ? '≈' : ''}{fa(Math.round(v.kcal).toLocaleString('en'))}{v.complete ? '' : '+'}<small>کالری</small>
    </span>
  )
}

/** the week at a glance: average energy, protein, fish and red-meat meals, fruit days */
function WeekStats({ days, cell }: { days: string[]; cell: (day: string, meal: Meal) => MenuItem | undefined }) {
  const planned = days.filter((d) => MEALS.some((m) => cell(d, m)?.main))
  if (!planned.length) return null
  const totals = planned.map((d) => sumNutri(MEALS.map((m) => cell(d, m)).filter((x): x is MenuItem => !!x).map(mealNutrition)))
  const avg = (f: (x: Nutri) => number) => totals.reduce((s, x) => s + f(x), 0) / totals.length
  const mains = days.flatMap((d) => (['lunch', 'dinner'] as Meal[]).map((m) => cell(d, m)?.main ?? '')).filter(Boolean)
  const kind = (re: RegExp) => mains.filter((x) => re.test(x)).length
  const fruitDays = days.filter((d) => cell(d, 'dinner')?.fruit).length
  const kcal = avg((x) => x.kcal)
  const stats = [
    { icon: Flame, label: 'میانگین انرژی روزانه', value: `${fa(Math.round(kcal).toLocaleString('en'))} کیلوکالری`, tone: dayLevel(kcal) },
    { icon: Beef, label: 'میانگین پروتئین روزانه', value: `${fa(Math.round(avg((x) => x.protein)))} گرم`, tone: 'ok' },
    { icon: Fish, label: 'وعدهٔ ماهی', value: `${fa(kind(/ماهی/))} بار در هفته`, tone: kind(/ماهی/) ? 'ok' : 'low' },
    { icon: Apple, label: 'میوه در شام', value: `${fa(fruitDays)} روز از ${fa(days.length)}`, tone: fruitDays >= 5 ? 'ok' : 'low' },
  ]
  return (
    <div className="sv-wstats">
      {stats.map((x) => <div key={x.label} className={`sv-wstat ${x.tone}`}><x.icon size={18} aria-hidden /><span><small>{x.label}</small><b>{x.value}</b></span></div>)}
    </div>
  )
}
