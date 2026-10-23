import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, UserCheck } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { useSupervisionStore, attKey, LOCKED_MSG, FUTURE_MSG, HEAD_MSG } from '../store/useSupervisionStore'
import { STATUS_FA, STATUS_MARK, STATUS_ORDER, VSTATUS_FA, VSTATUS_MARK, VSTATUS_ORDER, activeDays, dayDefaults, dayHours, isWorking, mealsOf, personMonth, vehicleMonth } from '../lib/svCalc'
import { fa, faNum, monthDays, recordedUpTo, todayLocal, weekdayFa, type Ym } from '../lib/svMonth'
import type { SvAttendance, SvPerson, SvSettings, SvStatus, SvVehicle, SvVehicleStatus } from '../types'
import { Empty, Flash, LockNote, MonthNav, StatusSeg, useLockedIn } from '../components/common'
import { CellPopover } from '../components/CellEditor'
import { LateReason, EntryHistory, DayPunches } from '../components/EntryGuard'
import { TimeField } from '../components/TimeField'

type Open = { kind: 'person' | 'vehicle' | 'day'; id: string; day: string; el: HTMLElement } | null
const WD = 'شیدسچپج'

/**
 * حضور و غیاب — the month grid is where everything is entered: tap an empty day to mark it present (with the person's shift),
 * tap any day to change its status and type the check-in / check-out below it; hours and overtime follow from the times.
 */
export function MonthPage({ month, onMonth, onGoRoster, onGoReport }: { month: Ym; onMonth: (m: Ym) => void; onGoRoster: () => void; onGoReport?: () => void }) {
  const [view, setView] = useState<'people' | 'vehicles'>('people')
  const people = useSupervisionStore((s) => s.people)
  const vehicles = useSupervisionStore((s) => s.vehicles)
  const att = useSupervisionStore((s) => s.att)
  const vdays = useSupervisionStore((s) => s.vdays)
  const settings = useSupervisionStore((s) => s.settings)
  const loadRange = useSupervisionStore((s) => s.loadRange)
  const setDay = useSupervisionStore((s) => s.setDay)
  const setVehicleDay = useSupervisionStore((s) => s.setVehicleDay)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [open, setOpen] = useState<Open>(null)

  const days = useMemo(() => monthDays(month), [month])
  const isoDays = useMemo(() => days.map((d) => d.iso), [days])
  useEffect(() => { void loadRange(days[0].iso, days[days.length - 1].iso); setOpen(null) }, [days, loadRange])
  const upTo = recordedUpTo(month), today = todayLocal()
  const byPerson = useGrouped(att)
  const vrows = useMemo(() => Object.values(vdays), [vdays])
  const ppl = people.filter((p) => activeDays(isoDays, p.startDate, p.endDate).length > 0 && (p.active || byPerson.has(p.id)))
  const cars = vehicles.filter((v) => activeDays(isoDays, v.startDate, v.endDate).length > 0 && (v.active || vrows.some((r) => r.vehicleId === v.id)))
  const locked = useLockedIn(days[0].iso, days[days.length - 1].iso)
  const isLocked = useSupervisionStore((s) => s.isLocked)
  const hand = useSupervisionStore((s) => s.canHand())
  const heads = people.filter((p) => p.isHead && p.active).map((p) => p.fullName)
  const needsReason = useSupervisionStore((s) => s.needsReason)
  const isFuture = useSupervisionStore((s) => s.isFuture)
  // reasons typed for overdue days in this sitting (one per day), sent with every write of that day
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const setReason = (day: string, r: string) => setReasons((x) => ({ ...x, [day]: r }))
  const fail = (r: { ok: boolean; error?: string }) => { if (!r.ok) setMsg({ ok: false, text: r.error ?? 'ذخیره نشد' }); return r.ok }

  const markPresent = (p: SvPerson, day: string) => setDay(p.id, day, { status: 'present', note: '', lateReason: reasons[day], ...dayDefaults(p, 'present', settings) })
  const markCar = (v: SvVehicle, day: string) => setVehicleDay(v.id, day, { status: 'present', hours: settings.vehicleHours, km: null, note: '', lateReason: reasons[day] })
  // stable, so a tap re-renders only the rows whose selection changed (a 60 × 31 grid stays smooth)
  const tapPerson = useCallback((p: SvPerson, day: string, el: HTMLElement) => {
    setMsg(null)
    if (isLocked(day)) { setMsg({ ok: false, text: LOCKED_MSG }); return }
    // people check in with their phone; a tap opens the day (the head of supervision can correct it there)
    setOpen({ kind: 'person', id: p.id, day, el })
  }, [isLocked])
  const tapCar = async (v: SvVehicle, day: string, el: HTMLElement) => {
    setMsg(null)
    if (isLocked(day)) { setMsg({ ok: false, text: LOCKED_MSG }); return }
    if (isFuture(day)) { setMsg({ ok: false, text: FUTURE_MSG }); return }
    if (!vdays[attKey(v.id, day)] && !needsReason(day) && !fail(await markCar(v, day))) return
    setOpen({ kind: 'vehicle', id: v.id, day, el })
  }
  const markDay = async (day: string) => {
    const todo = view === 'people' ? ppl.filter((p) => !p.userId && !att[attKey(p.id, day)] && activeDays([day], p.startDate, p.endDate).length) : []
    const vtodo = view === 'vehicles' ? cars.filter((v) => !vdays[attKey(v.id, day)] && activeDays([day], v.startDate, v.endDate).length) : []
    const rs = await Promise.all([...todo.map((p) => markPresent(p, day)), ...vtodo.map((v) => markCar(v, day))])
    const bad = rs.find((r) => !r.ok)
    setMsg(bad ? { ok: false, text: bad.error ?? 'ذخیره نشد' } : { ok: true, text: `${fa(formatJalali(day))}: ${fa(todo.length + vtodo.length)} ${view === 'people' ? 'نفر' : 'خودرو'} حاضر زده شد.` })
    setOpen(null)
  }

  if (!people.length && !vehicles.length) return <Empty>هنوز نفر یا خودرویی ثبت نشده است. <button className="im-ghostlink" onClick={onGoRoster}>افزودن ناظران و خودروها</button></Empty>
  const list = view === 'people' ? ppl : cars
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="im-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 12 }}>
        <MonthNav value={month} onChange={onMonth} />
        <div className="im-seg" role="tablist" aria-label="نوع">
          <button role="tab" aria-selected={view === 'people'} className={view === 'people' ? 'on' : ''} onClick={() => { setView('people'); setOpen(null) }}>نفرات ({fa(ppl.length)})</button>
          <button role="tab" aria-selected={view === 'vehicles'} className={view === 'vehicles' ? 'on' : ''} onClick={() => { setView('vehicles'); setOpen(null) }}>خودروها ({fa(cars.length)})</button>
        </div>
        <div className="sv-legend">
          {view === 'people' ? STATUS_ORDER.map((s) => <span key={s} className={`sv-c-${s}`}><i className="sv-dot" />{STATUS_MARK[s]} = {STATUS_FA[s]}</span>) : VSTATUS_ORDER.map((s) => <span key={s} className={`sv-c-${s}`}><i className="sv-dot" />{VSTATUS_MARK[s]} = {VSTATUS_FA[s]}</span>)}
          {view === 'people' && <span><i className="sv-dot" style={{ ['--c' as string]: 'var(--im-amber)', width: 6, height: 6 }} />اضافه‌کار</span>}
          <span><i className="sv-dot empty" style={{ boxShadow: 'inset 0 0 0 1.5px var(--im-coral)' }} />ثبت‌نشده</span>
        </div>
      </div>
      <LockNote months={locked} onReport={onGoReport} />
      {view === 'people' && (
        <div className="sv-head-only" role="note">
          {hand
            ? <>نفرات خودشان با گوشی ورود و خروج می‌زنند؛ روزی که تردد نداشته باشد شب همان روز خودکار «غایب» می‌شود (خانهٔ قرمز توخالی). شما به‌عنوان سرپرست نظارت می‌توانید با زدن روی هر خانه آن را به استراحت، مرخصی، استعلاجی یا مأموریت تبدیل کنید.</>
            : <>ثبت و اصلاح دستی فقط با سرپرست نظارت{heads.length ? ` (${heads.join('، ')})` : ''} است. نفرات خودشان با گوشی ورود و خروج می‌زنند و روز بدون تردد خودکار «غایب» می‌شود. با زدن روی هر خانه جزئیات و سابقهٔ آن را می‌بینید.</>}
        </div>
      )}
      <Flash msg={msg} />
      {list.length === 0 ? <Empty>{view === 'people' ? 'نفری برای این ماه نیست.' : 'خودرویی برای این ماه نیست.'}</Empty> : (
        <div className={`sv-grid-wrap ${locked ? 'is-locked' : ''}`}>
          <table className="sv-grid">
            <thead>
              <tr>
                <th className="nm">{view === 'people' ? 'نام' : 'خودرو'}</th>
                {days.map((d) => (
                  <th key={d.iso} className={`${d.weekday === 6 ? 'fri' : ''} ${d.iso === today ? 'today' : ''}`}>
                    <button className="sv-dayhead" onClick={(e) => view === 'people' && !hand ? setMsg({ ok: false, text: HEAD_MSG }) : isLocked(d.iso) ? setMsg({ ok: false, text: LOCKED_MSG }) : isFuture(d.iso) ? setMsg({ ok: false, text: FUTURE_MSG }) : setOpen({ kind: 'day', id: '', day: d.iso, el: e.currentTarget })} aria-label={`روز ${fa(d.jd)}: حاضر زدن همه`}>{fa(d.jd)}<span>{WD[d.weekday]}</span></button>
                  </th>
                ))}
                {view === 'people' ? <><th className="sum">کارکرد / موظف</th><th className="sum">استراحت</th><th className="sum">استعلاجی</th><th className="sum">غیبت</th><th className="sum">ساعت</th><th className="sum">اضافه‌کار / سقف</th></> : <><th className="sum">روز کارکرد</th><th className="sum">تعمیر</th><th className="sum">ساعت</th></>}
              </tr>
            </thead>
            <tbody>
              {view === 'people' ? ppl.map((p) => (
                <PersonRow key={p.id} p={p} days={days} isoDays={isoDays} upTo={upTo} settings={settings} rows={byPerson.get(p.id) ?? NONE} sel={open?.kind === 'person' && open.id === p.id ? open.day : null} onTap={tapPerson} />
              )) : cars.map((v) => {
                const m = vehicleMonth(v, vrows, isoDays, upTo)
                const on = new Set(activeDays(isoDays, v.startDate, v.endDate))
                return (
                  <tr key={v.id}>
                    <td className="nm">{v.title}<div className="sv-sub">{v.plate}</div></td>
                    {days.map((d) => {
                      const r = vdays[attKey(v.id, d.iso)]
                      const sel = open?.kind === 'vehicle' && open.id === v.id && open.day === d.iso
                      return <td key={d.iso}><button className={`sv-cell ${r ? `sv-c-${r.status}` : 'empty'} ${!r && d.iso <= upTo ? 'due' : ''} ${on.has(d.iso) ? '' : 'off'} ${sel ? 'sel' : ''}`} onClick={(e) => tapCar(v, d.iso, e.currentTarget)} aria-label={`${v.title} ${fa(d.jd)}: ${r ? VSTATUS_FA[r.status] : 'ثبت‌نشده'}`} aria-expanded={sel}>{r ? VSTATUS_MARK[r.status] : ''}</button></td>
                    })}
                    <td className="sum"><b>{fa(m.present)}</b></td>
                    <td className="sum">{m.repair ? fa(m.repair) : '—'}</td>
                    <td className="sum">{faNum(m.hours)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="sv-note">روی هر خانه بزنید: خانهٔ خالی «حاضر» می‌شود (با ساعت کاری همان نفر) و زیرش می‌توانید وضعیت را عوض کنید یا ساعت ورود و خروج را بنویسید. ۸ ساعت اول موظفی و بیشتر از آن اضافه‌کار حساب می‌شود. هر روز حاضر صبحانه، ناهار و شام حساب می‌شود. با زدن عدد روز در سرستون، نفراتِ بدون حساب گوشی که آن روز ثبت‌نشده‌اند حاضر زده می‌شوند. ثبت هر روز تا {fa(settings.entryGraceDays)} روز بعد آزاد است؛ پس از آن نوشتن دلیل لازم است و زمان واقعی ثبت، نویسنده و دلیل در سابقهٔ همان خانه و در گزارش ماه دیده می‌شود. خانه‌های خط‌چین با تأخیر ثبت شده‌اند و خانه‌های با نقطهٔ سبز را خود نفر با گوشی در محدودهٔ کارگاه ثبت کرده است.</p>

      {open?.kind === 'person' && (() => { const p = people.find((x) => x.id === open.id); return p ? <PersonDay key={open.id + open.day} p={p} day={open.day} anchor={open.el} onClose={() => setOpen(null)} onError={fail} reason={reasons[open.day] ?? ''} onReason={(r) => setReason(open.day, r)} /> : null })()}
      {open?.kind === 'vehicle' && (() => { const v = vehicles.find((x) => x.id === open.id); return v ? <VehicleDayEditor key={open.id + open.day} v={v} day={open.day} anchor={open.el} onClose={() => setOpen(null)} onError={fail} reason={reasons[open.day] ?? ''} onReason={(r) => setReason(open.day, r)} /> : null })()}
      {open?.kind === 'day' && (
        <CellPopover anchor={open.el} title={<b>{weekdayFa(open.day)} {fa(formatJalali(open.day))}</b>} onClose={() => setOpen(null)}>
          {needsReason(open.day) && <LateReason value={reasons[open.day] ?? ''} onChange={(r) => setReason(open.day, r)} />}
          <button className="im-btn im-btn-primary im-btn-sm" style={{ width: '100%' }} disabled={needsReason(open.day) && (reasons[open.day] ?? '').trim().length < 5} onClick={() => markDay(open.day)}><UserCheck size={14} /> {view === 'people' ? 'حاضر زدن نفرات بدون گوشیِ ثبت‌نشده' : 'حاضر زدن همهٔ خودروهای ثبت‌نشده'}</button>
        </CellPopover>
      )}
    </div>
  )
}

type Guard = { reason: string; onReason: (r: string) => void }
const NONE: SvAttendance[] = []

/**
 * Attendance grouped by person. A person whose rows did not change keeps the same array, so their memoized row is
 * not re-rendered when someone else's day is saved.
 */
function useGrouped(att: Record<string, SvAttendance>) {
  const prev = useRef(new Map<string, SvAttendance[]>())
  return useMemo(() => {
    const next = new Map<string, SvAttendance[]>()
    for (const r of Object.values(att)) { const l = next.get(r.personId); if (l) l.push(r); else next.set(r.personId, [r]) }
    for (const [k, l] of next) {
      const old = prev.current.get(k)
      if (old && old.length === l.length && old.every((x) => att[attKey(x.personId, x.day)] === x)) next.set(k, old)
    }
    prev.current = next
    return next
  }, [att])
}

const PersonRow = memo(function PersonRow({ p, days, isoDays, upTo, settings, rows, sel, onTap }: { p: SvPerson; days: ReturnType<typeof monthDays>; isoDays: string[]; upTo: string; settings: SvSettings; rows: SvAttendance[]; sel: string | null; onTap: (p: SvPerson, day: string, el: HTMLElement) => void }) {
  const m = personMonth(p, rows, isoDays, settings, upTo)
  const on = new Set(activeDays(isoDays, p.startDate, p.endDate))
  const byDay = new Map(rows.map((r) => [r.day, r]))
  return (
    <tr>
      <td className="nm">{p.fullName}<div className="sv-sub">{p.roleTitle}{p.shiftStart && p.shiftEnd && ` · از ${fa(p.shiftStart)} تا ${fa(p.shiftEnd)}`}</div></td>
      {days.map((d) => {
        const r = byDay.get(d.iso)
        const isSel = sel === d.iso
        return <td key={d.iso}><button className={`sv-cell ${r ? `sv-c-${r.status}` : 'empty'} ${!r && d.iso <= upTo ? 'due' : ''} ${on.has(d.iso) ? '' : 'off'} ${r && r.overtime > 0 ? 'has-ot' : ''} ${r?.lateReason ? 'was-late' : ''} ${r?.source === 'gps' ? 'gps' : ''} ${r?.source === 'auto' ? 'auto' : ''} ${isSel ? 'sel' : ''}`} onClick={(e) => onTap(p, d.iso, e.currentTarget)} aria-label={`${p.fullName} ${fa(d.jd)}: ${r ? STATUS_FA[r.status] : 'ثبت‌نشده'}`} aria-expanded={isSel} title={[r && isWorking(r.status) ? `${r.checkIn ? `${r.checkIn}–${r.checkOut ?? '…'} · ` : ''}${r.hours} ساعت${r.overtime ? ` (اضافه‌کار ${r.overtime})` : ''}` : '', r?.lateReason ? `ثبت با تأخیر: ${r.lateReason}` : '', r?.source === 'gps' ? 'ثبت با گوشی در محدودهٔ کارگاه' : '', r?.source === 'auto' ? 'غیبت خودکار: ورود و خروج ثبت نشد' : ''].filter(Boolean).join(' — ') || undefined}>{r ? STATUS_MARK[r.status] : ''}</button></td>
      })}
      <td className="sum"><b className={m.shortfall ? 'sv-bad' : ''}>{fa(m.worked)}</b> / {fa(m.required)}</td>
      <td className="sum"><span className={m.restOver ? 'sv-warn' : ''}>{fa(m.rest)}</span> / {fa(m.restAllowed)}</td>
      <td className="sum">{m.sick ? fa(m.sick) : '—'}</td>
      <td className="sum"><span className={m.absent ? 'sv-bad' : ''}>{m.absent ? fa(m.absent) : '—'}</span></td>
      <td className="sum">{faNum(m.hours)}</td>
      <td className="sum"><b className={m.overtimeOver ? 'sv-bad' : ''}>{faNum(m.overtime)}</b> / {fa(m.overtimeCap)}</td>
    </tr>
  )
})

function PersonDay({ p, day, anchor, onClose, onError, reason, onReason }: { p: SvPerson; day: string; anchor: HTMLElement; onClose: () => void; onError: (r: { ok: boolean; error?: string }) => boolean } & Guard) {
  const settings = useSupervisionStore((s) => s.settings)
  const row = useSupervisionStore((s) => s.att[attKey(p.id, day)])
  const setDay = useSupervisionStore((s) => s.setDay)
  const clearDay = useSupervisionStore((s) => s.clearDay)
  const late = useSupervisionStore((s) => s.needsReason(day))
  const future = useSupervisionStore((s) => s.isFuture(day))
  const hand = useSupervisionStore((s) => s.canHand())
  const blocked = !hand || (late && reason.trim().length < 5)
  const pick = async (st: SvStatus) => {
    if (row?.status === st) return
    const keep = row && isWorking(row.status) && st === 'present' && row.checkIn ? { checkIn: row.checkIn, checkOut: row.checkOut, ...dayHours(row.checkIn, row.checkOut, settings), ...mealsOf(p, st) } : dayDefaults(p, st, settings)
    onError(await setDay(p.id, day, { status: st, note: row?.note ?? '', lateReason: reason, ...keep }))
  }
  // every change of a time is saved at once (no blur juggling): hours and overtime follow from the pair
  const setTimes = async (ci: string | null, co: string | null) => {
    if (!row || (ci === row.checkIn && co === row.checkOut)) return
    onError(await setDay(p.id, day, { status: row.status, note: row.note, lateReason: reason, checkIn: ci, checkOut: co, ...dayHours(ci, co, settings), ...mealsOf(p, row.status) }))
  }
  const shift = p.shiftStart && p.shiftEnd ? { in: p.shiftStart, out: p.shiftEnd } : null
  const clear = async () => { if (onError(await clearDay(p.id, day))) onClose() }
  const meals = row ? mealsOf(p, row.status) : null
  const mealText = meals ? [meals.breakfast && 'صبحانه', meals.lunch && 'ناهار', meals.dinner && 'شام'].filter(Boolean).join('، ') : ''
  const working = !!row && isWorking(row.status)
  return (
    <CellPopover anchor={anchor} title={<><b>{p.fullName}</b><div className="sv-sub">{weekdayFa(day)} {fa(formatJalali(day))}{row?.source === 'clock' && ' · از کارت ساعت'}</div></>} onClose={onClose}>
      {row?.source === 'auto' && <p className="sv-note" style={{ margin: 0, color: 'var(--sv-absent)' }}>غیبت خودکار: در این روز ورود و خروج با گوشی ثبت نشد.{hand ? ' در صورت استراحت، مرخصی، استعلاجی یا مأموریت، وضعیت را عوض کنید.' : ''}</p>}
      {!hand && <p className="sv-note" style={{ margin: 0 }}>فقط سرپرست نظارت می‌تواند این روز را تغییر دهد.</p>}
      {hand && late && <LateReason value={reason} onChange={onReason} />}
      {future && <p className="sv-note" style={{ margin: 0 }}>روز آینده: فقط استراحت، مرخصی یا مأموریت را می‌توان از پیش ثبت کرد.</p>}
      <StatusSeg label="وضعیت" value={row?.status ?? null} options={future ? STATUS_ORDER.filter((x) => x === 'rest' || x === 'mission' || x === 'leave') : STATUS_ORDER} labels={STATUS_FA} onChange={pick} disabled={blocked} />
      {working && row.status === 'present' && !blocked && (
        <>
          <div className="sv-pop-times">
            <div className="sv-tf"><span>ورود</span><TimeField label="ساعت ورود" value={row.checkIn ?? ''} onChange={(v) => setTimes(v || null, row.checkOut)} /></div>
            <div className="sv-tf"><span>خروج</span><TimeField label="ساعت خروج" value={row.checkOut ?? ''} onChange={(v) => setTimes(row.checkIn, v || null)} /></div>
          </div>
          <div className="sv-chips">
            {shift && (shift.in !== row.checkIn || shift.out !== row.checkOut) && <button type="button" className="im-chip" onClick={() => setTimes(shift.in, shift.out)}>ساعت کاری: {fa(shift.in)} تا {fa(shift.out)}</button>}
            {(row.checkIn || row.checkOut) && <button type="button" className="im-chip" onClick={() => setTimes(null, null)}>بدون ساعت ({fa(settings.standardHours)} ساعت)</button>}
          </div>
        </>
      )}
      {row && (
        <p className="sv-pop-sum">
          {working ? <>کارکرد <b>{faNum(row.hours)}</b> ساعت{row.overtime > 0 ? <> · اضافه‌کار <b className="sv-warn">{faNum(row.overtime)}</b></> : ' · بدون اضافه‌کار'}</> : STATUS_FA[row.status]}
          {mealText && <> · وعده: {mealText}</>}
        </p>
      )}
      <DayPunches personId={p.id} day={day} />
      {row && <EntryHistory kind="person" subjectId={p.id} day={day} row={row} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button className="im-btn im-btn-ghost im-btn-sm" onClick={clear} disabled={!row || !hand}><Eraser size={13} /> پاک کردن روز</button>
        <button className="im-btn im-btn-primary im-btn-sm" onClick={onClose}>{hand ? 'تأیید' : 'بستن'}</button>
      </div>
    </CellPopover>
  )
}

function VehicleDayEditor({ v, day, anchor, onClose, onError, reason, onReason }: { v: SvVehicle; day: string; anchor: HTMLElement; onClose: () => void; onError: (r: { ok: boolean; error?: string }) => boolean } & Guard) {
  const settings = useSupervisionStore((s) => s.settings)
  const row = useSupervisionStore((s) => s.vdays[attKey(v.id, day)])
  const setVehicleDay = useSupervisionStore((s) => s.setVehicleDay)
  const clearVehicleDay = useSupervisionStore((s) => s.clearVehicleDay)
  const late = useSupervisionStore((s) => s.needsReason(day))
  const blocked = late && reason.trim().length < 5
  const [d, setD] = useState({ hours: String(row?.hours ?? settings.vehicleHours), km: row?.km == null ? '' : String(row.km) })
  const latest = useRef(d)
  latest.current = d
  const num = (x: string) => Number(x.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))))
  const pick = async (st: SvVehicleStatus) => {
    if (row?.status === st) return
    onError(await setVehicleDay(v.id, day, { status: st, hours: st === 'present' ? settings.vehicleHours : 0, km: st === 'present' ? row?.km ?? null : null, note: row?.note ?? '', lateReason: reason }))
    setD({ hours: String(st === 'present' ? settings.vehicleHours : 0), km: '' })
  }
  const save = async () => {
    if (!row || row.status !== 'present') return
    const hours = Math.max(0, Math.min(24, num(latest.current.hours) || 0)), km = latest.current.km.trim() === '' ? null : Math.max(0, num(latest.current.km) || 0)
    if (row.hours === hours && row.km === km) return
    onError(await setVehicleDay(v.id, day, { status: row.status, hours, km, note: row.note, lateReason: reason }))
  }
  const clear = async () => { if (onError(await clearVehicleDay(v.id, day))) onClose() }
  return (
    <CellPopover anchor={anchor} title={<><b>{v.title}</b><div className="sv-sub">{weekdayFa(day)} {fa(formatJalali(day))}</div></>} onClose={onClose}>
      {late && <LateReason value={reason} onChange={onReason} />}
      <StatusSeg label="وضعیت خودرو" value={row?.status ?? null} options={VSTATUS_ORDER} labels={VSTATUS_FA} onChange={pick} disabled={blocked} />
      {row?.status === 'present' && !blocked && (
        <div className="sv-pop-times">
          <label>ساعت کار<input inputMode="decimal" value={d.hours} onChange={(e) => setD({ ...d, hours: e.target.value })} onBlur={save} aria-label="ساعت کار خودرو" /></label>
          <label>کیلومتر<input inputMode="decimal" value={d.km} onChange={(e) => setD({ ...d, km: e.target.value })} onBlur={save} aria-label="کیلومتر" /></label>
        </div>
      )}
      {row && <EntryHistory kind="vehicle" subjectId={v.id} day={day} row={row} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button className="im-btn im-btn-ghost im-btn-sm" onClick={clear} disabled={!row}><Eraser size={13} /> پاک کردن روز</button>
        <button className="im-btn im-btn-primary im-btn-sm" onClick={async () => { if (!blocked) await save(); onClose() }}>تأیید</button>
      </div>
    </CellPopover>
  )
}
