import { useEffect, useMemo, useState } from 'react'
import { Car, Coffee, CookingPot, Download, Moon, Pencil, Plus, Printer, Trash2, UsersRound } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { JalaliDateField } from '../../issues/components/JalaliDateField'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { guestTotals, mealsOf } from '../lib/svCalc'
import { addDays, fa, faNum, monthDays, monthLabel, monthOf, todayLocal, weekdayFa, type Ym } from '../lib/svMonth'
import type { SvGuestMeal } from '../types'
import { Flash, LockNote, MonthNav, useLockedIn } from '../components/common'
import { LateReason } from '../components/EntryGuard'

type Draft = Omit<SvGuestMeal, 'id'> & { id?: string }
const blank = (day: string): Draft => ({ day, guestName: '', organization: '', host: '', breakfast: 0, lunch: 0, dinner: 0, note: '' })
const OWN_FA = { rented: 'استیجاری', company: 'شرکتی' } as const
const SIDE_FA = { supervision: 'دستگاه نظارت', employer: 'نمایندگان کارفرما' } as const
const MAX_DAYS = 400

/**
 * تسهیلات — meals (all three on every present day for staff, typed-in counts for guests) and car days, for a month or for any
 * start–end range, totalled. Printable and exportable.
 */
export function FacilitiesPage({ month, onMonth, onGoReport }: { month: Ym; onMonth: (m: Ym) => void; onGoReport?: () => void }) {
  const people = useSupervisionStore((s) => s.people)
  const vehicles = useSupervisionStore((s) => s.vehicles)
  const att = useSupervisionStore((s) => s.att)
  const vdays = useSupervisionStore((s) => s.vdays)
  const guests = useSupervisionStore((s) => s.guests)
  const loadRange = useSupervisionStore((s) => s.loadRange)
  const rangeLoading = useSupervisionStore((s) => s.rangeLoading)
  const saveGuest = useSupervisionStore((s) => s.saveGuest)
  const deleteGuest = useSupervisionStore((s) => s.deleteGuest)
  const monthRange = (m: Ym) => { const d = monthDays(m); return { from: d[0].iso, to: d[d.length - 1].iso } }
  const [range, setRange] = useState(() => monthRange(month))
  const [pending, setPending] = useState(range)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showDays, setShowDays] = useState(false)
  useEffect(() => { void loadRange(range.from, range.to) }, [range, loadRange])
  const locked = useLockedIn(range.from, range.to)
  const isLocked = useSupervisionStore((s) => s.isLocked)
  const needsReason = useSupervisionStore((s) => s.needsReason)

  const days = useMemo(() => { const out: string[] = []; for (let d = range.from; d <= range.to && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d); return out }, [range])
  const isMonth = range.from === monthRange(monthOf(range.from)).from && range.to === monthRange(monthOf(range.from)).to
  const title = isMonth ? monthLabel(monthOf(range.from)) : `${fa(formatJalali(range.from))} تا ${fa(formatJalali(range.to))}`
  const upTo = (() => { const t = todayLocal(); return t < range.to ? t : range.to })()
  const inRange = (d: string) => d >= range.from && d <= range.to
  const rows = useMemo(() => Object.values(att).filter((r) => inRange(r.day)), [att, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const vrows = useMemo(() => Object.values(vdays).filter((r) => inRange(r.day)), [vdays, range]) // eslint-disable-line react-hooks/exhaustive-deps
  const grows = useMemo(() => guests.filter((g) => inRange(g.day)), [guests, range]) // eslint-disable-line react-hooks/exhaustive-deps

  // per person: present days = three meals each; mission counted as attendance without meals
  const perPerson = people.map((p) => {
    const mine = rows.filter((r) => r.personId === p.id)
    const present = mine.filter((r) => r.status === 'present').length, mission = mine.filter((r) => r.status === 'mission').length
    return { p, present, mission, meals: mealsOf(p, 'present').breakfast ? present : 0 }
  }).filter((x) => x.present + x.mission > 0)
  const groups = (['supervision', 'employer'] as const).map((sd) => { const xs = perPerson.filter((x) => x.p.side === sd); return { sd, people: xs.length, days: xs.reduce((a, x) => a + x.present + x.mission, 0), meals: xs.reduce((a, x) => a + x.meals, 0) } }).filter((g) => g.people)
  const staffMeals = perPerson.reduce((a, x) => a + x.meals, 0)
  const gt = guestTotals(grows)
  const perCar = vehicles.map((v) => { const mine = vrows.filter((r) => r.vehicleId === v.id && r.status === 'present'); return { v, days: mine.length, hours: mine.reduce((a, r) => a + r.hours, 0), km: mine.reduce((a, r) => a + (r.km ?? 0), 0) } }).filter((x) => x.days > 0)
  const carBy = (['rented', 'company'] as const).map((o) => { const xs = perCar.filter((x) => x.v.ownership === o); return { o, cars: xs.length, days: xs.reduce((a, x) => a + x.days, 0), hours: xs.reduce((a, x) => a + x.hours, 0), km: xs.reduce((a, x) => a + x.km, 0) } }).filter((x) => x.cars)
  const perDay = useMemo(() => days.map((d) => {
    const ds = rows.filter((r) => r.day === d)
    const present = ds.filter((r) => r.status === 'present').length
    const g = grows.filter((x) => x.day === d)
    return { d, present, staff: present, gb: g.reduce((a, x) => a + x.breakfast, 0), gl: g.reduce((a, x) => a + x.lunch, 0), gd: g.reduce((a, x) => a + x.dinner, 0), cars: vrows.filter((r) => r.day === d && r.status === 'present').length }
  }), [days, rows, grows, vrows])

  const apply = () => {
    if (!pending.from || !pending.to) return setMsg({ ok: false, text: 'تاریخ شروع و پایان را انتخاب کنید.' })
    if (pending.to < pending.from) return setMsg({ ok: false, text: 'تاریخ پایان قبل از شروع است.' })
    setMsg(null); setRange(pending)
  }
  const pickMonth = (m: Ym) => { onMonth(m); const r = monthRange(m); setRange(r); setPending(r) }

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

  const csv = () => {
    const q = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`
    const L = (...xs: (string | number)[]) => xs.map(q).join(',')
    const lines = [
      L('گزارش تسهیلات', title),
      '', L('گروه', 'نفر', 'روز حضور', 'صبحانه', 'ناهار', 'شام', 'جمع وعده'),
      ...groups.map((g) => L(SIDE_FA[g.sd], g.people, g.days, g.meals, g.meals, g.meals, g.meals * 3)),
      L('مهمانان', gt.guests, '', gt.breakfast, gt.lunch, gt.dinner, gt.breakfast + gt.lunch + gt.dinner),
      L('جمع کل', perPerson.length + gt.guests, groups.reduce((a, g) => a + g.days, 0), staffMeals + gt.breakfast, staffMeals + gt.lunch, staffMeals + gt.dinner, staffMeals * 3 + gt.breakfast + gt.lunch + gt.dinner),
      '', L('نام', 'گروه', 'روز حاضر', 'روز مأموریت', 'صبحانه', 'ناهار', 'شام'),
      ...perPerson.map((x) => L(x.p.fullName, SIDE_FA[x.p.side], x.present, x.mission, x.meals, x.meals, x.meals)),
      '', L('مهمان', 'تاریخ', 'سازمان', 'میزبان', 'صبحانه', 'ناهار', 'شام'),
      ...grows.map((g) => L(g.guestName, formatJalali(g.day), g.organization, g.host, g.breakfast, g.lunch, g.dinner)),
      '', L('خودرو', 'پلاک', 'مالکیت', 'روز کارکرد', 'ساعت', 'کیلومتر'),
      ...perCar.map((x) => L(x.v.title, x.v.plate, OWN_FA[x.v.ownership], x.days, x.hours, x.km)),
      ...carBy.map((x) => L(`جمع ${OWN_FA[x.o]}`, '', '', x.days, x.hours, x.km)),
    ]
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `facilities-${range.from}-to-${range.to}.csv` })
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const cards = [
    { icon: Coffee, c: 'var(--im-amber)', n: fa(staffMeals + gt.breakfast), l: `صبحانه (مهمان ${fa(gt.breakfast)})` },
    { icon: CookingPot, c: 'var(--im-coral)', n: fa(staffMeals + gt.lunch), l: `ناهار (مهمان ${fa(gt.lunch)})` },
    { icon: Moon, c: 'var(--im-violet)', n: fa(staffMeals + gt.dinner), l: `شام (مهمان ${fa(gt.dinner)})` },
    { icon: UsersRound, c: 'var(--im-sky)', n: fa(groups.reduce((a, g) => a + g.days, 0)), l: `نفر-روز حضور (${fa(gt.guests)} مهمان)` },
    { icon: Car, c: 'var(--im-teal)', n: fa(perCar.reduce((a, x) => a + x.days, 0)), l: `روز-خودرو (${faNum(perCar.reduce((a, x) => a + x.hours, 0))} ساعت)` },
  ]

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="im-card no-print" style={{ display: 'grid', gap: 10, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <MonthNav value={isMonth ? monthOf(range.from) : month} onChange={pickMonth} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="im-btn im-btn-ghost im-btn-sm" onClick={csv}><Download size={14} /> خروجی اکسل (CSV)</button>
            <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => window.print()}><Printer size={14} /> چاپ</button>
            <button className="im-btn im-btn-primary im-btn-sm" onClick={() => setDraft(blank(inRange(todayLocal()) ? todayLocal() : range.from))}><Plus size={15} /> وعدهٔ مهمان</button>
          </div>
        </div>
        <div className="sv-range" role="group" aria-label="بازهٔ دلخواه">
          <span className="sv-sub" style={{ fontSize: 12.5, fontWeight: 700 }}>بازهٔ دلخواه:</span>
          <label>از<JalaliDateField value={pending.from} onChange={(d) => setPending({ ...pending, from: d })} /></label>
          <label>تا<JalaliDateField value={pending.to} onChange={(d) => setPending({ ...pending, to: d })} /></label>
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={apply} disabled={pending.from === range.from && pending.to === range.to}>نمایش گزارش</button>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>گزارش تسهیلات — {title}</h2>
        <p className="sv-note" style={{ margin: '2px 0 0' }}>{fa(days.length)} روز{rangeLoading ? ' · در حال بارگذاری…' : ''}{upTo < range.to ? ` · ثبت‌شده تا ${fa(formatJalali(upTo))}` : ''}. ناظر یا نمایندهٔ حاضر صبحانه، ناهار و شام می‌گیرد؛ وعدهٔ مهمانان دستی ثبت می‌شود.</p>
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
      <LockNote months={locked} onReport={onGoReport} />
      <Flash msg={msg} />

      {draft && (
        <div className="im-card no-print" style={{ display: 'grid', gap: 10 }}>
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
          {needsReason(draft.day) && <LateReason value={draft.lateReason ?? ''} onChange={(r) => setDraft({ ...draft, lateReason: r })} />}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setDraft(null)}>انصراف</button><button className="im-btn im-btn-primary im-btn-sm" onClick={submit}>ذخیره</button></div>
        </div>
      )}

      <section className="sv-print-keep">
        <h3 className="sv-h3">جمع وعده‌ها و حضور</h3>
        <div className="im-table-wrap"><table className="im-table">
          <thead><tr><th>گروه</th><th>نفر</th><th>روز حضور</th><th>صبحانه</th><th>ناهار</th><th>شام</th><th>جمع وعده‌ها</th></tr></thead>
          <tbody>
            {groups.map((g) => <tr key={g.sd}><td><b>{SIDE_FA[g.sd]}</b></td><td className="sv-num">{fa(g.people)}</td><td className="sv-num">{fa(g.days)}</td><td className="sv-num">{fa(g.meals)}</td><td className="sv-num">{fa(g.meals)}</td><td className="sv-num">{fa(g.meals)}</td><td className="sv-num">{fa(g.meals * 3)}</td></tr>)}
            <tr><td><b>مهمانان</b></td><td className="sv-num">{fa(gt.guests)}</td><td className="sv-num">—</td><td className="sv-num">{fa(gt.breakfast)}</td><td className="sv-num">{fa(gt.lunch)}</td><td className="sv-num">{fa(gt.dinner)}</td><td className="sv-num">{fa(gt.breakfast + gt.lunch + gt.dinner)}</td></tr>
            <tr style={{ background: 'var(--im-panel-2)' }}><td><b>جمع کل</b></td><td className="sv-num"><b>{fa(perPerson.length + gt.guests)}</b></td><td className="sv-num"><b>{fa(groups.reduce((a, g) => a + g.days, 0))}</b></td><td className="sv-num"><b>{fa(staffMeals + gt.breakfast)}</b></td><td className="sv-num"><b>{fa(staffMeals + gt.lunch)}</b></td><td className="sv-num"><b>{fa(staffMeals + gt.dinner)}</b></td><td className="sv-num"><b>{fa(staffMeals * 3 + gt.breakfast + gt.lunch + gt.dinner)}</b></td></tr>
          </tbody>
        </table></div>
      </section>

      <section className="sv-print-keep">
        <h3 className="sv-h3">خودروها</h3>
        {perCar.length === 0 ? <p className="sv-note">در این بازه خودرویی کار نکرده است.</p> : (
          <div className="im-table-wrap"><table className="im-table">
            <thead><tr><th>خودرو</th><th>پلاک</th><th>مالکیت</th><th>روز کارکرد</th><th>ساعت کار</th><th>کیلومتر</th></tr></thead>
            <tbody>
              {perCar.map((x) => <tr key={x.v.id}><td><b>{x.v.title}</b><div className="sv-sub">{[x.v.modelYear && `مدل ${fa(x.v.modelYear)}`, x.v.engineCc && `${fa(x.v.engineCc)} سی‌سی`, x.v.gearbox && (x.v.gearbox === 'manual' ? 'دستی' : 'اتوماتیک')].filter(Boolean).join(' · ')}</div></td><td>{x.v.plate || '—'}</td><td>{OWN_FA[x.v.ownership]}</td><td className="sv-num"><b>{fa(x.days)}</b></td><td className="sv-num">{faNum(x.hours)}</td><td className="sv-num">{x.km ? faNum(x.km, 0) : '—'}</td></tr>)}
              {carBy.map((x) => <tr key={x.o} style={{ background: 'var(--im-panel-2)' }}><td colSpan={3}><b>جمع خودروهای {OWN_FA[x.o]} ({fa(x.cars)})</b></td><td className="sv-num"><b>{fa(x.days)}</b></td><td className="sv-num"><b>{faNum(x.hours)}</b></td><td className="sv-num"><b>{x.km ? faNum(x.km, 0) : '—'}</b></td></tr>)}
            </tbody>
          </table></div>
        )}
      </section>

      <section>
        <h3 className="sv-h3">نفرات</h3>
        {perPerson.length === 0 ? <p className="sv-note">در این بازه حضوری ثبت نشده است.</p> : (
          <div className="im-table-wrap"><table className="im-table">
            <thead><tr><th>نام</th><th>گروه</th><th>روز حاضر</th><th>روز مأموریت</th><th>صبحانه · ناهار · شام</th></tr></thead>
            <tbody>{perPerson.map((x) => <tr key={x.p.id}><td><b>{x.p.fullName}</b><div className="sv-sub">{x.p.roleTitle}</div></td><td>{SIDE_FA[x.p.side]}</td><td className="sv-num">{fa(x.present)}</td><td className="sv-num">{x.mission ? fa(x.mission) : '—'}</td><td className="sv-num">{fa(x.meals)} · {fa(x.meals)} · {fa(x.meals)}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section>
        <h3 className="sv-h3">مهمانان</h3>
        {grows.length === 0 ? <div className="im-card im-empty no-print" style={{ padding: 24 }}>مهمانی در این بازه ثبت نشده. برای مهمان‌های موقت پروژه (بازدید، جلسه، کارشناس) با «وعدهٔ مهمان» تعداد وعده‌ها را ثبت کنید.</div> : (
          <div className="im-table-wrap"><table className="im-table">
            <thead><tr><th>تاریخ</th><th>مهمان</th><th>سازمان / میزبان</th><th>صبحانه</th><th>ناهار</th><th>شام</th><th className="no-print" /></tr></thead>
            <tbody>{grows.map((g) => (
              <tr key={g.id}>
                <td className="sv-num">{fa(formatJalali(g.day))}<div className="sv-sub">{weekdayFa(g.day)}</div></td>
                <td><b>{g.guestName}</b>{g.note && <div className="sv-sub">{g.note}</div>}</td>
                <td>{[g.organization, g.host && `میزبان: ${g.host}`].filter(Boolean).join(' · ') || '—'}</td>
                <td className="sv-num">{fa(g.breakfast)}</td><td className="sv-num">{fa(g.lunch)}</td><td className="sv-num">{fa(g.dinner)}</td>
                <td className="no-print" style={{ whiteSpace: 'nowrap' }}>{isLocked(g.day) ? <span className="sv-note" title="ماه امضا شده است">قفل</span> : <><button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setDraft(g)} aria-label={`ویرایش ${g.guestName}`}><Pencil size={13} /></button> <button className="im-btn im-btn-danger im-btn-sm" onClick={() => del(g)} aria-label={`حذف ${g.guestName}`}><Trash2 size={13} /></button></>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="no-print">
        <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => setShowDays((x) => !x)} aria-expanded={showDays}>{showDays ? 'بستن' : 'نمایش'} وعده‌ها و خودروها به تفکیک روز</button>
        {showDays && (
          <div className="im-table-wrap" style={{ marginTop: 8 }}><table className="im-table">
            <thead><tr><th>روز</th><th>نفرات حاضر</th><th>صبحانه</th><th>ناهار</th><th>شام</th><th>خودرو در کار</th></tr></thead>
            <tbody>{perDay.filter((x) => x.d <= upTo || x.gb + x.gl + x.gd > 0).map((x) => { const extra = (n: number) => n ? <span className="sv-sub"> (+{fa(n)} مهمان)</span> : null; return (
              <tr key={x.d}>
                <td className="sv-num">{fa(formatJalali(x.d))} <span className="sv-sub">{weekdayFa(x.d)}</span></td>
                <td className="sv-num">{fa(x.present)}</td>
                <td className="sv-num"><b>{fa(x.staff + x.gb)}</b>{extra(x.gb)}</td>
                <td className="sv-num"><b>{fa(x.staff + x.gl)}</b>{extra(x.gl)}</td>
                <td className="sv-num"><b>{fa(x.staff + x.gd)}</b>{extra(x.gd)}</td>
                <td className="sv-num">{fa(x.cars)}</td>
              </tr>
            ) })}</tbody>
          </table></div>
        )}
      </section>
    </div>
  )
}
