import { useEffect, useMemo, useState } from 'react'
import { Car, Coffee, CookingPot, Moon, Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { JalaliDateField } from '../../issues/components/JalaliDateField'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { guestTotals, mealsOf, vehicleMonth } from '../lib/svCalc'
import { fa, faNum, monthDays, recordedUpTo, todayLocal, weekdayFa, type Ym } from '../lib/svMonth'
import type { SvGuestMeal } from '../types'
import { Flash, MonthNav } from '../components/common'

type Draft = Omit<SvGuestMeal, 'id'> & { id?: string }
const blank = (day: string): Draft => ({ day, guestName: '', organization: '', host: '', breakfast: 0, lunch: 0, dinner: 0, note: '' })

/** تسهیلات — meals (from attendance for staff, typed in for guests) and rented-car days, per day and for the month. */
export function FacilitiesPage({ month, onMonth }: { month: Ym; onMonth: (m: Ym) => void }) {
  const people = useSupervisionStore((s) => s.people)
  const vehicles = useSupervisionStore((s) => s.vehicles)
  const att = useSupervisionStore((s) => s.att)
  const vdays = useSupervisionStore((s) => s.vdays)
  const guests = useSupervisionStore((s) => s.guests)
  const loadRange = useSupervisionStore((s) => s.loadRange)
  const saveGuest = useSupervisionStore((s) => s.saveGuest)
  const deleteGuest = useSupervisionStore((s) => s.deleteGuest)
  const days = useMemo(() => monthDays(month).map((d) => d.iso), [month])
  useEffect(() => { void loadRange(days[0], days[days.length - 1]) }, [days, loadRange])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const upTo = recordedUpTo(month)

  const inMonth = (d: string) => d >= days[0] && d <= days[days.length - 1]
  const monthGuests = guests.filter((g) => inMonth(g.day))
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  // staff meals per day, from attendance
  const perDay = useMemo(() => {
    const m = new Map<string, { b: number; l: number; d: number; people: number; gb: number; gl: number; gd: number; cars: number }>()
    for (const d of days) m.set(d, { b: 0, l: 0, d: 0, people: 0, gb: 0, gl: 0, gd: 0, cars: 0 })
    for (const r of Object.values(att)) {
      const x = m.get(r.day), p = byId.get(r.personId)
      if (!x || !p) continue
      const ml = mealsOf(p, r.status)
      if (r.status === 'present' || r.status === 'mission') x.people++
      x.b += +ml.breakfast; x.l += +ml.lunch; x.d += +ml.dinner
    }
    for (const g of monthGuests) { const x = m.get(g.day); if (x) { x.gb += g.breakfast; x.gl += g.lunch; x.gd += g.dinner } }
    for (const r of Object.values(vdays)) { const x = m.get(r.day); if (x && r.status === 'present') x.cars++ }
    return m
  }, [days, att, vdays, monthGuests, byId])
  const staff = [...perDay.values()].reduce((a, x) => ({ b: a.b + x.b, l: a.l + x.l, d: a.d + x.d }), { b: 0, l: 0, d: 0 })
  const gt = guestTotals(monthGuests)
  const vm = vehicles.map((v) => vehicleMonth(v, Object.values(vdays), days, upTo))
  const carDays = vm.reduce((a, x) => a + x.present, 0), carHours = vm.reduce((a, x) => a + x.hours, 0)

  const submit = async () => {
    if (!draft) return
    if (!draft.guestName.trim()) return setMsg({ ok: false, text: 'نام مهمان یا گروه را بنویسید.' })
    if (draft.breakfast + draft.lunch + draft.dinner === 0) return setMsg({ ok: false, text: 'دست‌کم یک وعده وارد کنید.' })
    const r = await saveGuest(draft)
    setMsg(r.ok ? { ok: true, text: draft.id ? 'تغییرات ذخیره شد.' : 'وعده‌های مهمان ثبت شد.' } : { ok: false, text: r.error ?? '' })
    if (r.ok) setDraft(null)
  }
  const del = async (g: SvGuestMeal) => { if (!window.confirm(`وعده‌های «${g.guestName}» در ${fa(formatJalali(g.day))} حذف شود؟`)) return; const r = await deleteGuest(g.id); setMsg(r.ok ? { ok: true, text: 'حذف شد.' } : { ok: false, text: r.error ?? '' }) }
  const num = (v: string) => Math.max(0, Math.min(500, Math.round(Number(v.replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))) || 0)))

  const cards = [
    { icon: Coffee, c: 'var(--im-amber)', n: fa(staff.b + gt.breakfast), l: `صبحانه (مهمان ${fa(gt.breakfast)})` },
    { icon: CookingPot, c: 'var(--im-coral)', n: fa(staff.l + gt.lunch), l: `ناهار (مهمان ${fa(gt.lunch)})` },
    { icon: Moon, c: 'var(--im-violet)', n: fa(staff.d + gt.dinner), l: `شام (مهمان ${fa(gt.dinner)})` },
    { icon: UsersRound, c: 'var(--im-sky)', n: fa(gt.guests), l: 'مهمان در این ماه' },
    { icon: Car, c: 'var(--im-teal)', n: fa(carDays), l: `روز-خودرو (${faNum(carHours)} ساعت)` },
  ]
  // days already passed, plus any later day that already has guests booked
  const shown = days.filter((d) => (!!upTo && d <= upTo) || monthGuests.some((g) => g.day === d))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="im-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 12 }}>
        <MonthNav value={month} onChange={onMonth} />
        <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setDraft(blank(days.includes(todayLocal()) ? todayLocal() : days[0]))}><Plus size={15} /> وعدهٔ مهمان</button>
      </div>
      <div className="im-kpi-grid" style={{ marginBottom: 0 }}>
        {cards.map((k, i) => (
          <div key={k.l} className="im-stat-card" style={{ ['--c' as string]: k.c, ['--i' as string]: i }}>
            <span className="im-stat-ico"><k.icon size={16} /></span>
            <div><span className="im-num" style={{ fontSize: 22 }}>{k.n}</span></div>
            <div className="im-lbl">{k.l}</div>
          </div>
        ))}
      </div>
      <Flash msg={msg} />

      {draft && (
        <div className="im-card" style={{ display: 'grid', gap: 10 }}>
          <b>{draft.id ? 'ویرایش وعدهٔ مهمان' : 'ثبت وعدهٔ مهمان'}</b>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            <div className="im-field" style={{ margin: 0 }}><label>تاریخ</label><JalaliDateField value={draft.day} onChange={(d) => setDraft({ ...draft, day: d })} /></div>
            <div className="im-field" style={{ margin: 0 }}><label htmlFor="g-name">نام مهمان یا گروه *</label><input id="g-name" autoFocus value={draft.guestName} onChange={(e) => setDraft({ ...draft, guestName: e.target.value })} placeholder="مثلاً هیئت بازدید کارفرما" /></div>
            <div className="im-field" style={{ margin: 0 }}><label htmlFor="g-org">سازمان</label><input id="g-org" value={draft.organization} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} /></div>
            <div className="im-field" style={{ margin: 0 }}><label htmlFor="g-host">میزبان</label><input id="g-host" value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="چه کسی پذیرفته" /></div>
            {([['breakfast', 'صبحانه'], ['lunch', 'ناهار'], ['dinner', 'شام']] as const).map(([k, l]) => (
              <div key={k} className="im-field" style={{ margin: 0 }}><label htmlFor={`g-${k}`}>تعداد {l}</label><input id={`g-${k}`} inputMode="numeric" value={draft[k] || ''} placeholder="۰" onChange={(e) => setDraft({ ...draft, [k]: num(e.target.value) })} /></div>
            ))}
            <div className="im-field" style={{ margin: 0 }}><label htmlFor="g-note">یادداشت</label><input id="g-note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setDraft(null)}>انصراف</button><button className="im-btn im-btn-primary im-btn-sm" onClick={submit}>ذخیره</button></div>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 8px' }}>مهمانان این ماه</h2>
        {monthGuests.length === 0 ? <div className="im-card im-empty" style={{ padding: 24 }}>مهمانی ثبت نشده. برای مهمان‌های موقت پروژه (بازدید، جلسه، کارشناس) با «وعدهٔ مهمان» تعداد وعده‌ها را ثبت کنید.</div> : (
          <div className="im-table-wrap"><table className="im-table">
            <thead><tr><th>تاریخ</th><th>مهمان</th><th>سازمان / میزبان</th><th>صبحانه</th><th>ناهار</th><th>شام</th><th /></tr></thead>
            <tbody>{monthGuests.map((g) => (
              <tr key={g.id}>
                <td className="sv-num">{fa(formatJalali(g.day))}<div className="sv-sub">{weekdayFa(g.day)}</div></td>
                <td><b>{g.guestName}</b>{g.note && <div className="sv-sub">{g.note}</div>}</td>
                <td>{[g.organization, g.host && `میزبان: ${g.host}`].filter(Boolean).join(' · ') || '—'}</td>
                <td className="sv-num">{fa(g.breakfast)}</td><td className="sv-num">{fa(g.lunch)}</td><td className="sv-num">{fa(g.dinner)}</td>
                <td style={{ whiteSpace: 'nowrap' }}><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setDraft(g)} aria-label={`ویرایش ${g.guestName}`}><Pencil size={13} /></button> <button className="im-btn im-btn-danger im-btn-sm" onClick={() => del(g)} aria-label={`حذف ${g.guestName}`}><Trash2 size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 8px' }}>وعده‌ها و خودروها به تفکیک روز</h2>
        <div className="im-table-wrap"><table className="im-table">
          <thead><tr><th>روز</th><th>نفرات حاضر</th><th>صبحانه</th><th>ناهار</th><th>شام</th><th>خودرو در کار</th></tr></thead>
          <tbody>{shown.map((d) => { const x = perDay.get(d)!; const extra = (n: number) => n ? <span className="sv-sub"> (+{fa(n)} مهمان)</span> : null; return (
            <tr key={d}>
              <td className="sv-num">{fa(formatJalali(d))} <span className="sv-sub">{weekdayFa(d)}</span></td>
              <td className="sv-num">{fa(x.people)}</td>
              <td className="sv-num"><b>{fa(x.b + x.gb)}</b>{extra(x.gb)}</td>
              <td className="sv-num"><b>{fa(x.l + x.gl)}</b>{extra(x.gl)}</td>
              <td className="sv-num"><b>{fa(x.d + x.gd)}</b>{extra(x.gd)}</td>
              <td className="sv-num">{fa(x.cars)}</td>
            </tr>
          ) })}</tbody>
        </table></div>
        <p className="sv-note">وعده‌های ناظران و نمایندگان کارفرما خودکار از حضورشان حساب می‌شود: هر روز «حاضر» = وعده‌هایی که برای آن نفر در «نفرات و خودروها» تیک خورده است. مأموریت، استراحت، استعلاجی و غیبت وعده ندارند.</p>
      </section>
    </div>
  )
}
