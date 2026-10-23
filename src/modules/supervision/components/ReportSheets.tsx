import type { ReactNode } from 'react'
import { formatJalali } from '../../../lib/jalali'
import { STATUS_MARK, type GuestTotals, type MonthTotals, type PersonMonth, type VehicleMonth } from '../lib/svCalc'
import { fa, faNum, monthLabel, todayLocal, type MonthDay, type Ym } from '../lib/svMonth'
import type { SvAttendance, SvGuestMeal, SvPerson, SvSettings, SvSignature, SvVehicle } from '../types'
import { STEPS } from './SignoffPanel'
import { entryDay } from '../lib/svIntegrity'

/**
 * The two monthly forms attached to the payment statement (صورت‌وضعیت): «کارکرد» (A4 landscape, one row per person,
 * one column per day) and «تسهیلات» (A4 portrait: meals and vehicles). Same header (project, form, period, date) and
 * the same two signatures at the foot. Plain black-on-white so they print and photocopy cleanly.
 */
export interface SheetData {
  projectName: string
  month: Ym
  days: MonthDay[]
  settings: SvSettings
  pm: { p: SvPerson; m: PersonMonth; late: number }[]
  vm: { v: SvVehicle; m: VehicleMonth }[]
  att: Record<string, SvAttendance>
  tot: MonthTotals
  gt: GuestTotals
  guests: SvGuestMeal[]
  sides: { sd: 'supervision' | 'employer'; n: number; worked: number; b: number; l: number; d: number }[]
  signatures: SvSignature[]
  timelyPct: number
  driver: (personId: string | null) => string
}

const WD = 'شیدسچپج'
const SIDE_FA = { supervision: 'دستگاه نظارت', employer: 'نمایندگان کارفرما' } as const
const dash = (n: number, f = fa) => (n ? f(n) : '—')

function Head({ d, title, form }: { d: SheetData; title: string; form: string }) {
  const first = d.days[0].iso, last = d.days[d.days.length - 1].iso
  return (
    <header className="sv-sh-head">
      <div>
        <div className="sv-sh-proj">{d.projectName}</div>
        <h1>{title}</h1>
      </div>
      <dl>
        <div><dt>دوره</dt><dd>{fa(monthLabel(d.month))}</dd></div>
        <div><dt>از تاریخ</dt><dd>{fa(formatJalali(first))}</dd></div>
        <div><dt>تا تاریخ</dt><dd>{fa(formatJalali(last))}</dd></div>
        <div><dt>تاریخ تهیه</dt><dd>{fa(formatJalali(todayLocal()))}</dd></div>
        <div><dt>شمارهٔ فرم</dt><dd>{fa(form)}</dd></div>
      </dl>
    </header>
  )
}

function Signs({ d }: { d: SheetData }) {
  return (
    <footer className="sv-sh-signs">
      {STEPS.map((st) => {
        const s = d.signatures.filter((x) => x.step === st.step).at(-1)
        return (
          <div key={st.step} className="sv-sh-sign">
            <div className="sv-sh-role">{st.role}: {s?.signerTitle || st.title}</div>
            <div className="sv-sh-ink">{s && <img src={s.image} alt="" />}</div>
            <div className="sv-sh-name">{s ? <>{s.signerName} — {fa(formatJalali(entryDay(s.signedAt)))}</> : 'نام، تاریخ و امضا'}</div>
          </div>
        )
      })}
    </footer>
  )
}

function Sheet({ orientation, children }: { orientation: 'landscape' | 'portrait'; children: ReactNode }) {
  return <article className={`sv-sheet ${orientation}`} dir="rtl">{children}</article>
}

/** فرم کارکرد ماهانه — A4 landscape. */
export function AttendanceSheet({ d }: { d: SheetData }) {
  const ym = `${d.month.jy}${String(d.month.jm).padStart(2, '0')}`
  return (
    <Sheet orientation="landscape">
      <Head d={d} title="گزارش کارکرد ماهانهٔ دستگاه نظارت" form={`SV-A-${ym}`} />
      <table className="sv-sh-table sv-sh-grid">
        <thead>
          <tr>
            <th rowSpan={2}>ردیف</th><th rowSpan={2} className="nm">نام و سمت</th>
            {d.days.map((x) => <th key={x.iso} className={x.weekday === 6 ? 'fri' : ''}>{fa(x.jd)}</th>)}
            {['کارکرد', 'موظف', 'کسری', 'استراحت', 'استعلاجی', 'غیبت', 'ساعت کار', 'اضافه‌کار', 'ثبت دیرهنگام'].map((h) => <th key={h} rowSpan={2} className="sm">{h}</th>)}
          </tr>
          <tr>{d.days.map((x) => <th key={x.iso} className={`wd ${x.weekday === 6 ? 'fri' : ''}`}>{WD[x.weekday]}</th>)}</tr>
        </thead>
        <tbody>
          {d.pm.map(({ p, m, late }, i) => (
            <tr key={p.id}>
              <td>{fa(i + 1)}</td>
              <td className="nm"><b>{p.fullName}</b><small>{p.roleTitle || SIDE_FA[p.side]}</small></td>
              {d.days.map((x) => { const r = d.att[p.id + '|' + x.iso]; return <td key={x.iso} className={`mk ${r ? 's-' + r.status : ''} ${x.weekday === 6 ? 'fri' : ''}`}>{r ? STATUS_MARK[r.status] : ''}</td> })}
              <td><b>{fa(m.worked)}</b></td><td>{fa(m.required)}</td><td>{dash(m.shortfall)}</td><td>{fa(m.rest)}</td><td>{dash(m.sick)}</td><td>{dash(m.absent)}</td>
              <td>{faNum(m.hours)}</td><td><b>{faNum(m.overtime)}</b></td><td>{dash(late)}</td>
            </tr>
          ))}
          <tr className="tot">
            <td colSpan={2}>جمع ({fa(d.pm.length)} نفر)</td>
            <td colSpan={d.days.length} className="legend">ح حاضر · م مأموریت · ا استراحت · ع استعلاجی · غ غایب · خالی = ثبت‌نشده یا خارج از پروژه</td>
            <td>{fa(d.tot.worked)}</td><td>{fa(d.tot.required)}</td><td>{dash(d.tot.shortfall)}</td>
            <td>{fa(d.pm.reduce((a, x) => a + x.m.rest, 0))}</td><td>{dash(d.pm.reduce((a, x) => a + x.m.sick, 0))}</td><td>{dash(d.pm.reduce((a, x) => a + x.m.absent, 0))}</td>
            <td>{faNum(d.tot.hours)}</td><td>{faNum(d.tot.overtime)}</td><td>{dash(d.pm.reduce((a, x) => a + x.late, 0))}</td>
          </tr>
        </tbody>
      </table>
      <p className="sv-sh-note">
        موظفی {fa(d.settings.dutyDays)} روز از ۳۰ روز (پنجشنبه و جمعه روز کاری)، روز کاری {faNum(d.settings.standardHours)} ساعت و مازاد آن اضافه‌کار؛ کارکرد = حاضر + مأموریت؛ استعلاجی کسری نیست.
        {' '}ثبت دستی در سامانه با زمان سرور: {fa(d.timelyPct)}٪ ردیف‌ها در مهلت {fa(d.settings.entryGraceDays)} روزه ثبت شده‌اند؛ «ثبت دیرهنگام» روزهایی است که پس از مهلت و با ذکر دلیل وارد شده‌اند.
      </p>
      <Signs d={d} />
    </Sheet>
  )
}

/** فرم تسهیلات (غذا و خودرو) — A4 portrait. */
export function FacilitiesSheet({ d }: { d: SheetData }) {
  const ym = `${d.month.jy}${String(d.month.jm).padStart(2, '0')}`
  const meals = d.tot.breakfast + d.tot.lunch + d.tot.dinner + d.gt.breakfast + d.gt.lunch + d.gt.dinner
  return (
    <Sheet orientation="portrait">
      <Head d={d} title="گزارش تسهیلات دستگاه نظارت (غذا و خودرو)" form={`SV-F-${ym}`} />
      <h2>۱. وعده‌های غذایی</h2>
      <table className="sv-sh-table">
        <thead><tr><th>گروه</th><th>نفر</th><th>روز حضور</th><th>صبحانه</th><th>ناهار</th><th>شام</th><th>جمع وعده</th></tr></thead>
        <tbody>
          {d.sides.map((x) => <tr key={x.sd}><td className="nm">{SIDE_FA[x.sd]}</td><td>{fa(x.n)}</td><td>{fa(x.worked)}</td><td>{fa(x.b)}</td><td>{fa(x.l)}</td><td>{fa(x.d)}</td><td>{fa(x.b + x.l + x.d)}</td></tr>)}
          <tr><td className="nm">مهمانان</td><td>{fa(d.gt.guests)}</td><td>—</td><td>{fa(d.gt.breakfast)}</td><td>{fa(d.gt.lunch)}</td><td>{fa(d.gt.dinner)}</td><td>{fa(d.gt.breakfast + d.gt.lunch + d.gt.dinner)}</td></tr>
          <tr className="tot"><td className="nm">جمع کل</td><td>{fa(d.pm.length + d.gt.guests)}</td><td>{fa(d.tot.worked)}</td><td>{fa(d.tot.breakfast + d.gt.breakfast)}</td><td>{fa(d.tot.lunch + d.gt.lunch)}</td><td>{fa(d.tot.dinner + d.gt.dinner)}</td><td>{fa(meals)}</td></tr>
        </tbody>
      </table>

      <h2>۲. وعده‌ها به تفکیک نفر</h2>
      <table className="sv-sh-table">
        <thead><tr><th>ردیف</th><th>نام</th><th>سمت</th><th>روز حضور</th><th>صبحانه</th><th>ناهار</th><th>شام</th></tr></thead>
        <tbody>{d.pm.map(({ p, m }, i) => <tr key={p.id}><td>{fa(i + 1)}</td><td className="nm">{p.fullName}</td><td className="nm">{p.roleTitle || SIDE_FA[p.side]}</td><td>{fa(m.present)}</td><td>{fa(m.breakfast)}</td><td>{fa(m.lunch)}</td><td>{fa(m.dinner)}</td></tr>)}</tbody>
      </table>

      {d.guests.length > 0 && <>
        <h2>۳. مهمانان</h2>
        <table className="sv-sh-table">
          <thead><tr><th>تاریخ</th><th>مهمان / گروه</th><th>سازمان</th><th>میزبان</th><th>صبحانه</th><th>ناهار</th><th>شام</th></tr></thead>
          <tbody>{d.guests.map((g) => <tr key={g.id}><td>{fa(formatJalali(g.day))}</td><td className="nm">{g.guestName}</td><td className="nm">{g.organization || '—'}</td><td className="nm">{g.host || '—'}</td><td>{dash(g.breakfast)}</td><td>{dash(g.lunch)}</td><td>{dash(g.dinner)}</td></tr>)}</tbody>
        </table>
      </>}

      <h2>{d.guests.length ? '۴' : '۳'}. خودروها</h2>
      <table className="sv-sh-table">
        <thead><tr><th>ردیف</th><th>خودرو</th><th>پلاک</th><th>مالکیت</th><th>مشخصات</th><th>راننده / در اختیار</th><th>روز کارکرد</th><th>تعمیر</th><th>ساعت کار</th><th>کیلومتر</th></tr></thead>
        <tbody>
          {d.vm.map(({ v, m }, i) => (
            <tr key={v.id}>
              <td>{fa(i + 1)}</td><td className="nm">{v.title}</td><td className="nm">{v.plate || '—'}</td><td>{v.ownership === 'company' ? 'شرکتی' : 'استیجاری'}</td>
              <td className="nm">{fa([v.modelYear && `مدل ${v.modelYear}`, v.engineCc && `${v.engineCc} سی‌سی`, v.gearbox === 'automatic' ? 'اتوماتیک' : v.gearbox === 'manual' ? 'دستی' : ''].filter(Boolean).join('، ') || '—')}</td>
              <td className="nm">{[v.driver, d.driver(v.personId)].filter(Boolean).join(' / ') || '—'}</td>
              <td><b>{fa(m.present)}</b></td><td>{dash(m.repair)}</td><td>{faNum(m.hours)}</td><td>{m.km ? faNum(m.km, 0) : '—'}</td>
            </tr>
          ))}
          <tr className="tot"><td colSpan={2} className="nm">جمع ({fa(d.vm.length)} خودرو)</td><td colSpan={4} className="nm">استیجاری {fa(d.vm.filter((x) => x.v.ownership !== 'company').reduce((a, x) => a + x.m.present, 0))} روز · شرکتی {fa(d.vm.filter((x) => x.v.ownership === 'company').reduce((a, x) => a + x.m.present, 0))} روز</td><td><b>{fa(d.tot.vehicleDays)}</b></td><td>{dash(d.vm.reduce((a, x) => a + x.m.repair, 0))}</td><td>{faNum(d.tot.vehicleHours)}</td><td>{faNum(d.vm.reduce((a, x) => a + x.m.km, 0), 0)}</td></tr>
        </tbody>
      </table>
      <p className="sv-sh-note">هر روز حضور = صبحانه، ناهار و شام. وعده‌های مهمانان طبق ثبت روزانه در سامانه. روز کارکرد خودرو با ساعت کار پیش‌فرض {faNum(d.settings.vehicleHours)} ساعت.</p>
      <Signs d={d} />
    </Sheet>
  )
}
