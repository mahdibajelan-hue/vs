import { useEffect, useMemo, useState } from 'react'
import { useSupervisionStore, attKey } from '../store/useSupervisionStore'
import { STATUS_FA, STATUS_MARK, STATUS_ORDER, VSTATUS_FA, VSTATUS_MARK, VSTATUS_ORDER, activeDays, dayDefaults, nextStatus, nextVehicleStatus, personMonth, vehicleMonth } from '../lib/svCalc'
import { fa, faNum, monthDays, recordedUpTo, todayLocal, type Ym } from '../lib/svMonth'
import { Empty, Flash, MonthNav } from '../components/common'

/** جدول ماه — everyone × every day of the Jalali month; a tap cycles the day (حاضر → مأموریت → استراحت → غایب → خالی). */
export function MonthPage({ month, onMonth }: { month: Ym; onMonth: (m: Ym) => void }) {
  const [view, setView] = useState<'people' | 'vehicles'>('people')
  const people = useSupervisionStore((s) => s.people)
  const vehicles = useSupervisionStore((s) => s.vehicles)
  const att = useSupervisionStore((s) => s.att)
  const vdays = useSupervisionStore((s) => s.vdays)
  const settings = useSupervisionStore((s) => s.settings)
  const loadRange = useSupervisionStore((s) => s.loadRange)
  const setDay = useSupervisionStore((s) => s.setDay)
  const clearDay = useSupervisionStore((s) => s.clearDay)
  const setVehicleDay = useSupervisionStore((s) => s.setVehicleDay)
  const clearVehicleDay = useSupervisionStore((s) => s.clearVehicleDay)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const days = useMemo(() => monthDays(month), [month])
  const isoDays = useMemo(() => days.map((d) => d.iso), [days])
  useEffect(() => { void loadRange(days[0].iso, days[days.length - 1].iso) }, [days, loadRange])
  const upTo = recordedUpTo(month), today = todayLocal()
  const rows = useMemo(() => Object.values(att), [att])
  const vrows = useMemo(() => Object.values(vdays), [vdays])
  const ppl = people.filter((p) => p.active || activeDays(isoDays, p.startDate, p.endDate).length && rows.some((r) => r.personId === p.id))
  const cars = vehicles.filter((v) => v.active || vrows.some((r) => r.vehicleId === v.id))
  const fail = (r: { ok: boolean; error?: string }) => { if (!r.ok) setMsg({ ok: false, text: r.error ?? 'ذخیره نشد' }) }

  const cyclePerson = async (pid: string, day: string) => {
    const p = people.find((x) => x.id === pid)!, cur = att[attKey(pid, day)]
    const nx = nextStatus(cur?.status ?? null)
    if (!nx) return fail(await clearDay(pid, day))
    fail(await setDay(pid, day, { status: nx, checkIn: null, checkOut: null, note: cur?.note ?? '', ...dayDefaults(p, nx, settings), ...(cur && nx === 'mission' && cur.status === 'present' ? { hours: cur.hours, overtime: cur.overtime } : {}) }))
  }
  const cycleVehicle = async (vid: string, day: string) => {
    const cur = vdays[attKey(vid, day)], nx = nextVehicleStatus(cur?.status ?? null)
    if (!nx) return fail(await clearVehicleDay(vid, day))
    fail(await setVehicleDay(vid, day, { status: nx, hours: nx === 'present' ? settings.vehicleHours : 0, km: cur?.km ?? null, note: cur?.note ?? '' }))
  }

  const head = (
    <tr>
      <th className="nm">{view === 'people' ? 'نام' : 'خودرو'}</th>
      {days.map((d) => <th key={d.iso} className={`${d.weekday === 6 ? 'fri' : ''} ${d.iso === today ? 'today' : ''}`} title={d.iso === today ? 'امروز' : undefined}>{fa(d.jd)}<div style={{ fontSize: 9, fontWeight: 600 }}>{'شیدسچپج'[d.weekday]}</div></th>)}
      {view === 'people' ? <><th className="sum">کارکرد / موظف</th><th className="sum">استراحت</th><th className="sum">غیبت</th><th className="sum">اضافه‌کار / سقف</th></> : <><th className="sum">روز کارکرد</th><th className="sum">تعمیر</th><th className="sum">ساعت</th></>}
    </tr>
  )

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="im-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 12 }}>
        <MonthNav value={month} onChange={onMonth} />
        <div className="im-seg" role="tablist" aria-label="نوع">
          <button role="tab" aria-selected={view === 'people'} className={view === 'people' ? 'on' : ''} onClick={() => setView('people')}>نفرات ({fa(ppl.length)})</button>
          <button role="tab" aria-selected={view === 'vehicles'} className={view === 'vehicles' ? 'on' : ''} onClick={() => setView('vehicles')}>خودروها ({fa(cars.length)})</button>
        </div>
        <div className="sv-legend">
          {view === 'people' ? STATUS_ORDER.map((s) => <span key={s} className={`sv-c-${s}`}><i className="sv-dot" />{STATUS_MARK[s]} = {STATUS_FA[s]}</span>) : VSTATUS_ORDER.map((s) => <span key={s} className={`sv-c-${s}`}><i className="sv-dot" />{VSTATUS_MARK[s]} = {VSTATUS_FA[s]}</span>)}
          <span><i className="sv-dot empty" style={{ boxShadow: 'inset 0 0 0 1.5px var(--im-coral)' }} />روزِ گذشتهٔ ثبت‌نشده</span>
          {view === 'people' && <span><i className="sv-dot" style={{ ['--c' as string]: 'var(--im-amber)', width: 6, height: 6 }} />اضافه‌کار دارد</span>}
        </div>
      </div>
      <Flash msg={msg} />
      {(view === 'people' ? ppl.length : cars.length) === 0 ? <Empty>{view === 'people' ? 'نفری برای این ماه نیست.' : 'خودرویی برای این ماه نیست.'}</Empty> : (
        <div className="sv-grid-wrap">
          <table className="sv-grid">
            <thead>{head}</thead>
            <tbody>
              {view === 'people' ? ppl.map((p) => {
                const m = personMonth(p, rows, isoDays, settings, upTo)
                const on = new Set(activeDays(isoDays, p.startDate, p.endDate))
                return (
                  <tr key={p.id}>
                    <td className="nm">{p.fullName}<div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--im-muted-2)' }}>{p.roleTitle}</div></td>
                    {days.map((d) => {
                      const r = att[attKey(p.id, d.iso)]
                      return <td key={d.iso}><button className={`sv-cell ${r ? `sv-c-${r.status}` : 'empty'} ${!r && d.iso <= upTo ? 'due' : ''} ${on.has(d.iso) ? '' : 'off'} ${r && r.overtime > 0 ? 'has-ot' : ''}`} onClick={() => cyclePerson(p.id, d.iso)} aria-label={`${p.fullName} ${fa(d.jd)}: ${r ? STATUS_FA[r.status] : 'ثبت‌نشده'}`} title={r && r.overtime ? `اضافه‌کار ${faNum(r.overtime)} ساعت` : undefined}>{r ? STATUS_MARK[r.status] : ''}</button></td>
                    })}
                    <td className="sum"><b className={m.shortfall ? 'sv-bad' : ''}>{fa(m.worked)}</b> / {fa(m.required)}</td>
                    <td className="sum"><span className={m.restOver ? 'sv-warn' : ''}>{fa(m.rest)}</span> / {fa(m.restAllowed)}</td>
                    <td className="sum"><span className={m.absent ? 'sv-bad' : ''}>{fa(m.absent)}</span></td>
                    <td className="sum"><b className={m.overtimeOver ? 'sv-bad' : ''}>{faNum(m.overtime)}</b> / {fa(m.overtimeCap)}</td>
                  </tr>
                )
              }) : cars.map((v) => {
                const m = vehicleMonth(v, vrows, isoDays, upTo)
                const on = new Set(activeDays(isoDays, v.startDate, v.endDate))
                return (
                  <tr key={v.id}>
                    <td className="nm">{v.title}<div style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--im-muted-2)' }}>{v.plate}</div></td>
                    {days.map((d) => {
                      const r = vdays[attKey(v.id, d.iso)]
                      return <td key={d.iso}><button className={`sv-cell ${r ? `sv-c-${r.status}` : 'empty'} ${!r && d.iso <= upTo ? 'due' : ''} ${on.has(d.iso) ? '' : 'off'}`} onClick={() => cycleVehicle(v.id, d.iso)} aria-label={`${v.title} ${fa(d.jd)}: ${r ? VSTATUS_FA[r.status] : 'ثبت‌نشده'}`}>{r ? VSTATUS_MARK[r.status] : ''}</button></td>
                    })}
                    <td className="sum"><b>{fa(m.present)}</b></td>
                    <td className="sum">{fa(m.repair)}</td>
                    <td className="sum">{faNum(m.hours)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="sv-note">هر خانه را بزنید تا وضعیت آن روز عوض شود؛ ساعت ورود و خروج، اضافه‌کار و وعده‌ها را در «حضور روزانه» دقیق کنید. روزهای کاری پنجشنبه و جمعه هم حساب می‌شوند.</p>
    </div>
  )
}
