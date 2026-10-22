import { useEffect, useMemo } from 'react'
import { CalendarCheck, Car, Clock3, Download, Printer, Soup, TimerReset, TriangleAlert } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { activeDays, guestTotals, monthTotals, personMonth, vehicleMonth, type PersonMonth } from '../lib/svCalc'
import { fa, faNum, monthDays, monthLabel, recordedUpTo, type Ym } from '../lib/svMonth'
import { Empty, MonthNav } from '../components/common'

const SIDE_FA = { supervision: 'نظارت', employer: 'کارفرما' } as const

/** گزارش ماه — what payroll needs: days worked against the 23 owed, hours, overtime used and left, meals; and each car's working days. */
export function ReportPage({ month, onMonth, projectName }: { month: Ym; onMonth: (m: Ym) => void; projectName: string }) {
  const people = useSupervisionStore((s) => s.people)
  const vehicles = useSupervisionStore((s) => s.vehicles)
  const att = useSupervisionStore((s) => s.att)
  const vdays = useSupervisionStore((s) => s.vdays)
  const settings = useSupervisionStore((s) => s.settings)
  const loadRange = useSupervisionStore((s) => s.loadRange)
  const guests = useSupervisionStore((s) => s.guests)
  const days = useMemo(() => monthDays(month).map((d) => d.iso), [month])
  useEffect(() => { void loadRange(days[0], days[days.length - 1]) }, [days, loadRange])
  const upTo = recordedUpTo(month)

  const rows = useMemo(() => Object.values(att).filter((r) => r.day >= days[0] && r.day <= days[days.length - 1]), [att, days])
  const vrows = useMemo(() => Object.values(vdays).filter((r) => r.day >= days[0] && r.day <= days[days.length - 1]), [vdays, days])
  const ppl = people.filter((p) => activeDays(days, p.startDate, p.endDate).length && (p.active || rows.some((r) => r.personId === p.id)))
  const cars = vehicles.filter((v) => activeDays(days, v.startDate, v.endDate).length && (v.active || vrows.some((r) => r.vehicleId === v.id)))
  const pm = ppl.map((p) => ({ p, m: personMonth(p, rows, days, settings, upTo) }))
  const vm = cars.map((v) => ({ v, m: vehicleMonth(v, vrows, days, upTo) }))
  const tot = monthTotals(pm.map((x) => x.m), vm.map((x) => x.m))
  const gt = guestTotals(guests.filter((g) => g.day >= days[0] && g.day <= days[days.length - 1]))
  const sides = (['supervision', 'employer'] as const).map((sd) => { const xs = pm.filter((x) => x.p.side === sd).map((x) => x.m); return { sd, n: xs.length, worked: xs.reduce((a, m) => a + m.worked, 0), b: xs.reduce((a, m) => a + m.breakfast, 0), l: xs.reduce((a, m) => a + m.lunch, 0), d: xs.reduce((a, m) => a + m.dinner, 0) } }).filter((x) => x.n)
  const driver = (id: string | null) => people.find((p) => p.id === id)?.fullName ?? ''

  const csv = () => {
    const q = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`
    const lines = [
      ['نام', 'سمت', 'طرف', 'روز در پروژه', 'موظف', 'کارکرد', 'حاضر', 'مأموریت', 'استراحت', 'استعلاجی', 'غیبت', 'ثبت‌نشده', 'کسری', 'ساعت کار', 'اضافه‌کار', 'سقف اضافه‌کار', 'مانده اضافه‌کار', 'صبحانه', 'ناهار', 'شام'].map(q).join(','),
      ...pm.map(({ p, m }) => [p.fullName, p.roleTitle, SIDE_FA[p.side], m.onProject, m.required, m.worked, m.present, m.mission, m.rest, m.sick, m.absent, m.unmarked, m.shortfall, m.hours, m.overtime, m.overtimeCap, m.overtimeLeft, m.breakfast, m.lunch, m.dinner].map(q).join(',')),
      '',
      ['خودرو', 'پلاک', 'مالکیت', 'سال ساخت', 'حجم موتور', 'گیربکس', 'راننده', 'در اختیار', 'روز در پروژه', 'روز کارکرد', 'تعمیر', 'نبود', 'ثبت‌نشده', 'ساعت کار', 'کیلومتر'].map(q).join(','),
      ...vm.map(({ v, m }) => [v.title, v.plate, v.ownership === 'company' ? 'شرکتی' : 'استیجاری', v.modelYear ?? '', v.engineCc ?? '', v.gearbox === 'automatic' ? 'اتوماتیک' : v.gearbox === 'manual' ? 'دستی' : '', v.driver, driver(v.personId), m.onProject, m.present, m.repair, m.absent, m.unmarked, m.hours, m.km].map(q).join(',')),
      '',
      ['جمع تسهیلات', 'روز حضور', 'صبحانه', 'ناهار', 'شام', 'روز-خودرو', 'ساعت خودرو'].map(q).join(','),
      ...sides.map((x) => [x.sd === 'supervision' ? 'دستگاه نظارت' : 'نمایندگان کارفرما', x.worked, x.b, x.l, x.d, '', ''].map(q).join(',')),
      ['مهمانان', '', gt.breakfast, gt.lunch, gt.dinner, '', ''].map(q).join(','),
      ['جمع کل', tot.worked, tot.breakfast + gt.breakfast, tot.lunch + gt.lunch, tot.dinner + gt.dinner, tot.vehicleDays, tot.vehicleHours].map(q).join(','),
    ]
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `supervision-attendance-${month.jy}-${String(month.jm).padStart(2, '0')}.csv` })
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const kpis = [
    { icon: CalendarCheck, c: 'var(--sv-present)', n: `${fa(tot.worked)} / ${fa(tot.required)}`, l: 'نفر-روز کارکرد / موظف' },
    { icon: TriangleAlert, c: tot.shortfall ? 'var(--im-coral)' : 'var(--im-mint)', n: fa(tot.shortfall), l: 'روز کسری حضور', warn: tot.shortfall > 0 },
    { icon: Clock3, c: 'var(--im-sky)', n: faNum(tot.hours), l: 'ساعت کار' },
    { icon: TimerReset, c: 'var(--im-violet)', n: `${faNum(tot.overtime)}`, l: `ساعت اضافه‌کار (مانده ${faNum(tot.overtimeLeft)})` },
    { icon: Soup, c: 'var(--im-amber)', n: `${fa(tot.breakfast + gt.breakfast)} · ${fa(tot.lunch + gt.lunch)} · ${fa(tot.dinner + gt.dinner)}`, l: 'صبحانه · ناهار · شام (با مهمانان)' },
    { icon: Car, c: 'var(--im-teal)', n: fa(tot.vehicleDays), l: `روز-خودرو (${faNum(tot.vehicleHours)} ساعت)` },
  ]

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="im-card no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: 12 }}>
        <MonthNav value={month} onChange={onMonth} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={csv} disabled={!pm.length && !vm.length}><Download size={14} /> خروجی اکسل (CSV)</button>
          <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => window.print()}><Printer size={14} /> چاپ</button>
        </div>
      </div>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>گزارش حضور دستگاه نظارت — {monthLabel(month)}</h2>
        <p className="sv-note" style={{ margin: '2px 0 0' }}>{projectName} · موظفی {fa(settings.dutyDays)} روز در ماه · روز کاری {faNum(settings.standardHours)} ساعت · اضافه‌کار ماهانه {fa(settings.overtimeMin)} تا {fa(settings.overtimeMax)} ساعت{upTo && upTo < days[days.length - 1] ? ` · ثبت‌شده تا ${fa(formatJalali(upTo))}` : ''}</p>
        {tot.unmarked > 0 && <p className="im-helper" style={{ margin: '6px 0 0', color: 'var(--im-amber)', fontWeight: 700 }}>{fa(tot.unmarked)} روزِ گذشته برای نفرات یا خودروها ثبت نشده؛ گزارش تا ثبت آن‌ها کامل نیست.</p>}
      </div>
      <div className="im-kpi-grid" style={{ marginBottom: 0 }}>
        {kpis.map((k, i) => (
          <div key={k.l} className={`im-stat-card ${k.warn ? 'warn' : ''}`} style={{ ['--c' as string]: k.c, ['--i' as string]: i }}>
            <span className="im-stat-ico"><k.icon size={16} /></span>
            <div><span className="im-num" style={{ fontSize: 21 }}>{k.n}</span></div>
            <div className="im-lbl">{k.l}</div>
          </div>
        ))}
      </div>

      {pm.length === 0 ? <Empty>برای این ماه نفری ثبت نشده است.</Empty> : (
        <div className="im-table-wrap">
          <table className="im-table">
            <thead><tr><th>نام</th><th>کارکرد / موظف</th><th>کسری</th><th>استراحت</th><th>استعلاجی</th><th>غیبت</th><th>ساعت کار</th><th style={{ minWidth: 170 }}>اضافه‌کار (استفاده / سقف)</th><th>مانده</th><th>صبحانه</th><th>ناهار</th><th>شام</th></tr></thead>
            <tbody>
              {pm.map(({ p, m }) => (
                <tr key={p.id}>
                  <td><b>{p.fullName}</b><div className="sv-note" style={{ fontSize: 11 }}>{p.roleTitle || SIDE_FA[p.side]}{m.unmarked > 0 && <span className="sv-warn"> · {fa(m.unmarked)} روز ثبت‌نشده</span>}{m.onProject < days.length && ` · ${fa(m.onProject)} روز در پروژه`}</div></td>
                  <td className="sv-num"><b>{fa(m.worked)}</b> / {fa(m.required)}{m.mission > 0 && <div className="sv-note" style={{ fontSize: 11 }}>{fa(m.mission)} روز مأموریت</div>}</td>
                  <td className={`sv-num ${m.shortfall ? 'sv-bad' : 'sv-ok'}`}>{m.shortfall ? fa(m.shortfall) : '—'}</td>
                  <td className="sv-num"><span className={m.restOver ? 'sv-warn' : ''}>{fa(m.rest)}</span> / {fa(m.restAllowed)}</td>
                  <td className="sv-num">{m.sick ? fa(m.sick) : '—'}</td>
                  <td className={`sv-num ${m.absent ? 'sv-bad' : ''}`}>{m.absent ? fa(m.absent) : '—'}</td>
                  <td className="sv-num">{faNum(m.hours)}</td>
                  <td><OvertimeBar m={m} floor={settings.overtimeMin} /></td>
                  <td className={`sv-num ${m.overtimeOver ? 'sv-bad' : ''}`}>{m.overtimeOver ? `${faNum(m.overtimeOver)} بیش از سقف` : faNum(m.overtimeLeft)}</td>
                  <td className="sv-num">{fa(m.breakfast)}</td><td className="sv-num">{fa(m.lunch)}</td><td className="sv-num">{fa(m.dinner)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vm.length > 0 && (
        <div className="im-table-wrap">
          <table className="im-table">
            <thead><tr><th>خودرو</th><th>پلاک</th><th>مالکیت</th><th>راننده / در اختیار</th><th>روز کارکرد</th><th>تعمیر</th><th>نبود</th><th>ساعت کار</th><th>کیلومتر</th></tr></thead>
            <tbody>
              {vm.map(({ v, m }) => (
                <tr key={v.id}>
                  <td><b>{v.title}</b>{v.lessor && <div className="sv-note" style={{ fontSize: 11 }}>موجر: {v.lessor}</div>}{m.unmarked > 0 && <div className="sv-warn" style={{ fontSize: 11 }}>{fa(m.unmarked)} روز ثبت‌نشده</div>}</td>
                  <td>{v.plate || '—'}</td>
                  <td>{v.ownership === 'company' ? 'شرکتی' : 'استیجاری'}</td>
                  <td>{[v.driver, driver(v.personId)].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="sv-num"><b>{fa(m.present)}</b> / {fa(m.onProject)}</td>
                  <td className="sv-num">{m.repair ? fa(m.repair) : '—'}</td>
                  <td className="sv-num">{m.absent ? fa(m.absent) : '—'}</td>
                  <td className="sv-num">{faNum(m.hours)}</td>
                  <td className="sv-num">{m.km ? faNum(m.km, 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="sv-print-keep">
        <h3 style={{ fontSize: 15, fontWeight: 900, margin: '4px 0 8px' }}>جمع حضور و تسهیلات — {monthLabel(month)}</h3>
        <div className="im-table-wrap"><table className="im-table">
          <thead><tr><th>گروه</th><th>نفر</th><th>روز حضور (کارکرد)</th><th>صبحانه</th><th>ناهار</th><th>شام</th><th>جمع وعده‌ها</th></tr></thead>
          <tbody>
            {sides.map((x) => <tr key={x.sd}><td><b>{x.sd === 'supervision' ? 'دستگاه نظارت' : 'نمایندگان کارفرما'}</b></td><td className="sv-num">{fa(x.n)}</td><td className="sv-num">{fa(x.worked)}</td><td className="sv-num">{fa(x.b)}</td><td className="sv-num">{fa(x.l)}</td><td className="sv-num">{fa(x.d)}</td><td className="sv-num">{fa(x.b + x.l + x.d)}</td></tr>)}
            <tr><td><b>مهمانان</b></td><td className="sv-num">{fa(gt.guests)}</td><td className="sv-num">—</td><td className="sv-num">{fa(gt.breakfast)}</td><td className="sv-num">{fa(gt.lunch)}</td><td className="sv-num">{fa(gt.dinner)}</td><td className="sv-num">{fa(gt.breakfast + gt.lunch + gt.dinner)}</td></tr>
            <tr style={{ background: 'var(--im-panel-2)' }}><td><b>جمع کل</b></td><td className="sv-num"><b>{fa(pm.length + gt.guests)}</b></td><td className="sv-num"><b>{fa(tot.worked)}</b></td><td className="sv-num"><b>{fa(tot.breakfast + gt.breakfast)}</b></td><td className="sv-num"><b>{fa(tot.lunch + gt.lunch)}</b></td><td className="sv-num"><b>{fa(tot.dinner + gt.dinner)}</b></td><td className="sv-num"><b>{fa(tot.breakfast + tot.lunch + tot.dinner + gt.breakfast + gt.lunch + gt.dinner)}</b></td></tr>
          </tbody>
        </table></div>
        <div className="im-table-wrap" style={{ marginTop: 10 }}><table className="im-table">
          <thead><tr><th>خودروها</th><th>تعداد</th><th>روز کارکرد</th><th>ساعت کار</th><th>کیلومتر</th></tr></thead>
          <tbody><tr><td><b>جمع</b></td><td className="sv-num">{fa(vm.length)}</td><td className="sv-num"><b>{fa(tot.vehicleDays)}</b></td><td className="sv-num">{faNum(tot.vehicleHours)}</td><td className="sv-num">{faNum(vm.reduce((a, x) => a + x.m.km, 0), 0)}</td></tr></tbody>
        </table></div>
      </section>
      <p className="sv-note">کارکرد = حاضر + مأموریت. استعلاجی کسری حساب نمی‌شود. وعده‌ها از روی روزهای حضور حساب شده‌اند (هر روز حاضر = صبحانه، ناهار و شام) و وعده‌های مهمانان از بخش «تسهیلات» آمده است. موظفی برای کسی که بخشی از ماه در پروژه بوده به نسبت ۲۳ روز از ۳۰ روز حساب می‌شود. سقف اضافه‌کار هر نفر در «نفرات و خودروها» قابل تغییر است؛ خط کوچک روی نوار، کف ماهانه ({fa(settings.overtimeMin)} ساعت) را نشان می‌دهد.</p>
    </div>
  )
}

function OvertimeBar({ m, floor }: { m: PersonMonth; floor: number }) {
  const cap = Math.max(1, m.overtimeCap)
  const c = m.overtimeOver ? 'var(--im-coral)' : m.belowFloor ? 'var(--im-amber)' : 'var(--sv-present)'
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <span className="sv-num" style={{ fontSize: 12.5 }}><b>{faNum(m.overtime)}</b> / {fa(m.overtimeCap)}</span>
      <div className="sv-bar" style={{ ['--c' as string]: c }} title={`کف ${floor} ساعت`}>
        <i style={{ width: `${Math.min(100, (m.overtime / cap) * 100)}%` }} />
        {floor < cap && <em style={{ insetInlineStart: `${(floor / cap) * 100}%` }} />}
      </div>
    </div>
  )
}
