import { useEffect, useMemo, useRef, useState } from 'react'
import { Car, ChevronLeft, ChevronRight, Coffee, CookingPot, Moon, UserCheck, Fingerprint } from 'lucide-react'
import { JalaliDateField } from '../../issues/components/JalaliDateField'
import { useSupervisionStore, attKey } from '../store/useSupervisionStore'
import { STATUS_FA, STATUS_ORDER, VSTATUS_FA, VSTATUS_ORDER, dayDefaults, hoursBetween, isWorking, splitHours, activeDays } from '../lib/svCalc'
import { addDays, fa, monthDays, monthOf, todayLocal, weekdayFa } from '../lib/svMonth'
import type { SvAttendance, SvPerson, SvStatus, SvVehicle, SvVehicleDay, SvVehicleStatus } from '../types'
import { Empty, Flash, StatusSeg } from '../components/common'

const SIDE_FA = { supervision: 'دستگاه نظارت', employer: 'نمایندهٔ کارفرما' } as const

/** حضور روزانه — the page used every day: one row per person, one tap for the status, times / overtime / meals inline. */
export function DayPage({ onGoRoster }: { onGoRoster: () => void }) {
  const [day, setDay] = useState(todayLocal())
  const people = useSupervisionStore((s) => s.people)
  const vehicles = useSupervisionStore((s) => s.vehicles)
  const att = useSupervisionStore((s) => s.att)
  const vdays = useSupervisionStore((s) => s.vdays)
  const settings = useSupervisionStore((s) => s.settings)
  const loadRange = useSupervisionStore((s) => s.loadRange)
  const setDayRow = useSupervisionStore((s) => s.setDay)
  const setVehicleDay = useSupervisionStore((s) => s.setVehicleDay)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { const d = monthDays(monthOf(day)); void loadRange(d[0].iso, d[d.length - 1].iso) }, [day, loadRange])

  const onDuty = (from: string | null, to: string | null, active: boolean) => active && activeDays([day], from, to).length > 0
  const list = useMemo(() => people.filter((p) => onDuty(p.startDate, p.endDate, p.active)), [people, day]) // eslint-disable-line react-hooks/exhaustive-deps
  const cars = useMemo(() => vehicles.filter((v) => onDuty(v.startDate, v.endDate, v.active)), [vehicles, day]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c: Record<SvStatus | 'none', number> = { present: 0, mission: 0, rest: 0, absent: 0, none: 0 }
    for (const p of list) c[att[attKey(p.id, day)]?.status ?? 'none']++
    return c
  }, [list, att, day])
  const carsIn = cars.filter((v) => vdays[attKey(v.id, day)]?.status === 'present').length
  const future = day > todayLocal()

  const report = (r: { ok: boolean; error?: string }) => { if (!r.ok) setMsg({ ok: false, text: r.error ?? 'ذخیره نشد' }) }
  const markAll = async () => {
    setBusy(true); setMsg(null)
    const todo = list.filter((p) => !att[attKey(p.id, day)])
    const vtodo = cars.filter((v) => !vdays[attKey(v.id, day)])
    const rs = await Promise.all([
      ...todo.map((p) => setDayRow(p.id, day, { status: 'present', checkIn: null, checkOut: null, note: '', ...dayDefaults(p, 'present', settings) })),
      ...vtodo.map((v) => setVehicleDay(v.id, day, { status: 'present', hours: settings.vehicleHours, km: null, note: '' })),
    ])
    const bad = rs.find((r) => !r.ok)
    setMsg(bad ? { ok: false, text: bad.error ?? 'ذخیره نشد' } : { ok: true, text: `${fa(todo.length)} نفر و ${fa(vtodo.length)} خودرو حاضر زده شد.` })
    setBusy(false)
  }

  if (!people.length && !vehicles.length) return <Empty>هنوز نفر یا خودرویی ثبت نشده است. <button className="im-ghostlink" onClick={onGoRoster}>افزودن ناظران و خودروها</button></Empty>
  const total = list.length || 1
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="im-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div className="sv-daybar">
            <button className="sv-iconbtn" onClick={() => setDay(addDays(day, -1))} aria-label="روز قبل"><ChevronRight size={17} /></button>
            <JalaliDateField value={day} onChange={setDay} />
            <button className="sv-iconbtn" onClick={() => setDay(addDays(day, 1))} aria-label="روز بعد"><ChevronLeft size={17} /></button>
            <span className="sv-wd">{weekdayFa(day)}</span>
          </div>
          <button className="im-btn im-btn-primary" disabled={busy || future || (counts.none === 0 && cars.every((v) => vdays[attKey(v.id, day)]))} onClick={markAll}>
            <UserCheck size={16} /> حاضر زدن ثبت‌نشده‌ها
          </button>
        </div>
        <div className="sv-mix" aria-hidden>
          {STATUS_ORDER.map((s) => <span key={s} className={`sv-c-${s}`} style={{ width: `${(counts[s] / total) * 100}%` }} />)}
        </div>
        <div className="sv-legend">
          {STATUS_ORDER.map((s) => <span key={s} className={`sv-c-${s}`}><i className="sv-dot" />{STATUS_FA[s]} <b>{fa(counts[s])}</b></span>)}
          <span><i className="sv-dot empty" />ثبت‌نشده <b>{fa(counts.none)}</b></span>
          {cars.length > 0 && <span><Car size={13} style={{ display: 'inline', verticalAlign: -2, marginInlineEnd: 4 }} />خودرو در کار <b>{fa(carsIn)} از {fa(cars.length)}</b></span>}
        </div>
        {future && <p className="im-helper" style={{ margin: '8px 0 0', color: 'var(--im-amber)' }}>این روز هنوز نرسیده؛ فقط استراحت یا مأموریتِ از پیش معلوم را ثبت کنید.</p>}
        <Flash msg={msg} />
      </div>

      {list.length > 0 && (
        <section>
          <h2 className="im-section-title" style={{ fontSize: 15, fontWeight: 800, margin: '0 0 8px' }}>ناظران و نمایندگان ({fa(list.length)})</h2>
          <div className="sv-list">{list.map((p) => <PersonRow key={p.id} p={p} day={day} row={att[attKey(p.id, day)]} onError={report} />)}</div>
        </section>
      )}
      {cars.length > 0 && (
        <section>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 8px' }}>خودروهای استیجاری ({fa(cars.length)})</h2>
          <div className="sv-list">{cars.map((v) => <VehicleRow key={v.id} v={v} day={day} row={vdays[attKey(v.id, day)]} driverOf={people} onError={report} />)}</div>
        </section>
      )}
    </div>
  )
}

function PersonRow({ p, day, row, onError }: { p: SvPerson; day: string; row: SvAttendance | undefined; onError: (r: { ok: boolean; error?: string }) => void }) {
  const settings = useSupervisionStore((s) => s.settings)
  const setDay = useSupervisionStore((s) => s.setDay)
  const clearDay = useSupervisionStore((s) => s.clearDay)
  const fromRow = () => ({ checkIn: row?.checkIn ?? '', checkOut: row?.checkOut ?? '', hours: String(row?.hours ?? ''), overtime: String(row?.overtime ?? '') })
  const [draft, setDraft] = useState(fromRow)
  // Follow saved values, except the box the user is typing in (saving the check-in must not wipe a half-typed check-out).
  const editing = useRef<keyof ReturnType<typeof fromRow> | null>(null)
  useEffect(() => { const r = fromRow(); setDraft((d) => (editing.current ? { ...r, [editing.current]: d[editing.current] } : r)) }, [row?.checkIn, row?.checkOut, row?.hours, row?.overtime]) // eslint-disable-line react-hooks/exhaustive-deps
  const focusProps = (k: keyof ReturnType<typeof fromRow>, onDone: () => void) => ({ onFocus: () => { editing.current = k }, onBlur: () => { editing.current = null; onDone() } })

  const base = (): Omit<SvAttendance, 'personId' | 'day' | 'source'> => row
    ? { status: row.status, checkIn: row.checkIn, checkOut: row.checkOut, hours: row.hours, overtime: row.overtime, breakfast: row.breakfast, lunch: row.lunch, dinner: row.dinner, note: row.note }
    : { status: 'present', checkIn: null, checkOut: null, note: '', ...dayDefaults(p, 'present', settings) }
  const save = async (patch: Partial<SvAttendance>) => onError(await setDay(p.id, day, { ...base(), ...patch }))
  const pick = async (st: SvStatus) => {
    if (row?.status === st) { onError(await clearDay(p.id, day)); return }   // tapping the selected status again clears the day
    const keepTimes = isWorking(st) && row && isWorking(row.status)
    await save({ status: st, ...dayDefaults(p, st, settings), ...(keepTimes ? { hours: row.hours, overtime: row.overtime, checkIn: row.checkIn, checkOut: row.checkOut } : { checkIn: null, checkOut: null }) })
  }
  const latest = useRef(draft)
  latest.current = draft
  const saveTimes = async () => {
    const ci = latest.current.checkIn || null, co = latest.current.checkOut || null
    if (ci === (row?.checkIn ?? null) && co === (row?.checkOut ?? null)) return
    const h = hoursBetween(ci, co)
    await save(h === null ? { checkIn: ci, checkOut: co } : { checkIn: ci, checkOut: co, ...splitHours(h, settings.standardHours) })
  }
  const saveNum = async (k: 'hours' | 'overtime') => {
    const v = Math.max(0, Math.min(24, Number(latest.current[k].replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))) || 0)))
    if (row && row[k] === v) return
    await save({ [k]: v })
  }
  const working = !!row && isWorking(row.status)
  return (
    <div className={`sv-row ${row ? `sv-c-${row.status}` : ''}`}>
      <div className="sv-who">
        <b>{p.fullName}</b>
        <small>{p.roleTitle || SIDE_FA[p.side]}{row?.source === 'clock' && <> · <span className="sv-tag"><Fingerprint size={10} style={{ display: 'inline', verticalAlign: -1 }} /> کارت ساعت</span></>}</small>
      </div>
      <StatusSeg label={`وضعیت ${p.fullName}`} value={row?.status ?? null} options={STATUS_ORDER} labels={STATUS_FA} onChange={pick} />
      <div className="sv-fields">
        <label>ورود<input type="time" value={draft.checkIn} disabled={!working} onChange={(e) => setDraft({ ...draft, checkIn: e.target.value })} {...focusProps('checkIn', saveTimes)} aria-label={`ساعت ورود ${p.fullName}`} /></label>
        <label>خروج<input type="time" value={draft.checkOut} disabled={!working} onChange={(e) => setDraft({ ...draft, checkOut: e.target.value })} {...focusProps('checkOut', saveTimes)} aria-label={`ساعت خروج ${p.fullName}`} /></label>
        <label>ساعت<input inputMode="decimal" value={working ? draft.hours : ''} disabled={!working} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} {...focusProps('hours', () => saveNum('hours'))} aria-label={`ساعت کار ${p.fullName}`} /></label>
        <label>اضافه‌کار<input inputMode="decimal" value={working ? draft.overtime : ''} disabled={!working} onChange={(e) => setDraft({ ...draft, overtime: e.target.value })} {...focusProps('overtime', () => saveNum('overtime'))} aria-label={`اضافه‌کار ${p.fullName}`} /></label>
        <span className="sv-meals">
          {([['breakfast', 'صبحانه', Coffee], ['lunch', 'ناهار', CookingPot], ['dinner', 'شام', Moon]] as const).map(([k, l, Icon]) => (
            <button key={k} type="button" className={`sv-meal ${row?.[k] ? 'on' : ''}`} disabled={!row || row.status === 'rest' || row.status === 'absent'} aria-pressed={!!row?.[k]} aria-label={`${l} ${p.fullName}`} title={l} onClick={() => save({ [k]: !row?.[k] })}><Icon size={15} /></button>
          ))}
        </span>
      </div>
    </div>
  )
}

function VehicleRow({ v, day, row, driverOf, onError }: { v: SvVehicle; day: string; row: SvVehicleDay | undefined; driverOf: SvPerson[]; onError: (r: { ok: boolean; error?: string }) => void }) {
  const settings = useSupervisionStore((s) => s.settings)
  const setVehicleDay = useSupervisionStore((s) => s.setVehicleDay)
  const clearVehicleDay = useSupervisionStore((s) => s.clearVehicleDay)
  const [draft, setDraft] = useState({ hours: String(row?.hours ?? ''), km: row?.km == null ? '' : String(row.km) })
  useEffect(() => { setDraft({ hours: String(row?.hours ?? ''), km: row?.km == null ? '' : String(row.km) }) }, [row?.hours, row?.km])
  const base = () => row ? { status: row.status, hours: row.hours, km: row.km, note: row.note } : { status: 'present' as SvVehicleStatus, hours: settings.vehicleHours, km: null, note: '' }
  const pick = async (st: SvVehicleStatus) => {
    if (row?.status === st) { onError(await clearVehicleDay(v.id, day)); return }
    onError(await setVehicleDay(v.id, day, { ...base(), status: st, hours: st === 'present' ? (row?.status === 'present' ? row.hours : settings.vehicleHours) : 0 }))
  }
  const num = (x: string) => Number(x.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))))
  const save = async () => {
    const hours = Math.max(0, Math.min(24, num(draft.hours) || 0)), km = draft.km.trim() === '' ? null : Math.max(0, num(draft.km) || 0)
    if (row && row.hours === hours && row.km === km) return
    onError(await setVehicleDay(v.id, day, { ...base(), hours, km }))
  }
  const on = row?.status === 'present'
  const who = driverOf.find((p) => p.id === v.personId)?.fullName
  return (
    <div className={`sv-row ${row ? `sv-c-${row.status}` : ''}`}>
      <div className="sv-who"><b>{v.title}{v.plate && <span style={{ fontWeight: 600, color: 'var(--im-muted-2)' }}> · {v.plate}</span>}</b><small>{[v.driver && `راننده: ${v.driver}`, who && `در اختیار ${who}`].filter(Boolean).join(' · ') || 'خودروی استیجاری'}</small></div>
      <StatusSeg label={`وضعیت ${v.title}`} value={row?.status ?? null} options={VSTATUS_ORDER} labels={VSTATUS_FA} onChange={pick} />
      <div className="sv-fields">
        <label>ساعت کار<input inputMode="decimal" value={on ? draft.hours : ''} disabled={!on} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} onBlur={save} aria-label={`ساعت کار ${v.title}`} /></label>
        <label>کیلومتر<input inputMode="decimal" value={on ? draft.km : ''} disabled={!on} onChange={(e) => setDraft({ ...draft, km: e.target.value })} onBlur={save} aria-label={`کیلومتر ${v.title}`} /></label>
      </div>
    </div>
  )
}
