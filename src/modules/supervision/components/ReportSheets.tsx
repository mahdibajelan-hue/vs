import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { formatJalali } from '../../../lib/jalali'
import { STATUS_FA, STATUS_MARK, type GuestTotals, type MonthTotals, type PersonMonth, type VehicleMonth } from '../lib/svCalc'
import { fa, faNum, monthLabel, todayLocal, type MonthDay, type Ym } from '../lib/svMonth'
import type { SvAttendance, SvGuestMeal, SvPerson, SvSettings, SvSignature, SvVehicle } from '../types'
import { STEPS } from './SignoffPanel'
import { entryDay } from '../lib/svIntegrity'

/**
 * Printed monthly forms, attached to the payment statement (صورت‌وضعیت). Every printed page is a fixed A4 box with the
 * same header (project, form title, period, form number) and footer (signatures, «صفحهٔ ۱ از ۴», print date), laid out
 * here rather than left to the browser, so the header, footer and page count are on every page and nothing is cut.
 * Tables are split between pages by row and their column titles repeat on each page.
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
  gpsPct: number
  driver: (personId: string | null) => string
}
export type DocKind = 'att' | 'fac' | 'ts'
export type Orientation = 'landscape' | 'portrait'
export const ORIENTATION: Record<DocKind, Orientation> = { att: 'landscape', fac: 'portrait', ts: 'portrait' }

const WD = 'شیدسچپج'
const SIDE_FA = { supervision: 'دستگاه نظارت', employer: 'نمایندهٔ کارفرما' } as const
const SRC_FA = { manual: 'دستی', gps: 'گوشی', clock: 'کارت' } as const
const dash = (n: number) => (n ? fa(n) : '—')
const ymCode = (m: Ym) => `${m.jy}${String(m.jm).padStart(2, '0')}`

// ── page geometry (mm). Header and footer have fixed heights; the body gets the rest.
const PAGE = { landscape: { w: 297, h: 210 }, portrait: { w: 210, h: 297 } }
const PAD = 7, HEAD = 21, FOOT = 31, GAP = 3
const bodyHeight = (o: Orientation) => PAGE[o].h - 2 * PAD - HEAD - FOOT - 2 * GAP

// ── pagination: a flat list of blocks; table rows remember their table so a page reopens it with its head
interface Tbl { cls: string; head: ReactNode; headH: number; cols?: ReactNode }
type Item = { t: 'block'; node: ReactNode; h: number; keepNext?: boolean } | { t: 'row'; tbl: Tbl; node: ReactNode; h: number }

function paginate(items: Item[], cap: number): Item[][] {
  const pages: Item[][] = [[]]
  let used = 0, open: Tbl | null = null
  const cost = (it: Item, o: Tbl | null) => it.h + (it.t === 'row' && o !== it.tbl ? it.tbl.headH : 0)
  items.forEach((it, i) => {
    let need = cost(it, open)
    if (it.t === 'block' && it.keepNext && items[i + 1]) need += cost(items[i + 1], null)
    if (used + need > cap && pages[pages.length - 1].length) { pages.push([]); used = 0; open = null }
    pages[pages.length - 1].push(it)
    used += cost(it, open)
    open = it.t === 'row' ? it.tbl : null
  })
  return pages
}
function renderBody(items: Item[]) {
  const out: ReactNode[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.t === 'block') { out.push(<div key={i}>{it.node}</div>); continue }
    const rows: ReactNode[] = []
    const tbl = it.tbl
    while (i < items.length && items[i].t === 'row' && (items[i] as { tbl: Tbl }).tbl === tbl) { rows.push(<FragmentKey key={i}>{items[i].node}</FragmentKey>); i++ }
    i--
    out.push(<table key={`t${i}`} className={`sv-sh-table ${tbl.cls}`}>{tbl.cols}<thead>{tbl.head}</thead><tbody>{rows}</tbody></table>)
  }
  return out
}
const FragmentKey = ({ children }: { children: ReactNode }) => <>{children}</>

// ── one document = sections that each start on a new page (a timesheet has one section per person)
interface Section { title: string; subtitle?: string; items: Item[]; signers: Signer[] }
interface Signer { role: string; title: string; sig?: SvSignature }
export interface Doc { kind: DocKind; formNo: string; sections: Section[] }

function signers(d: SheetData, withPerson?: SvPerson): Signer[] {
  const s = STEPS.map((st) => ({ role: st.role, title: st.title, sig: d.signatures.filter((x) => x.step === st.step).at(-1) }))
  return withPerson ? [{ role: 'نفر', title: withPerson.fullName }, ...s] : s
}

function attendanceDoc(d: SheetData): Doc {
  const cap = d.days.length
  const tbl: Tbl = {
    cls: 'sv-sh-grid', headH: 9,
    cols: <colgroup><col style={{ width: '5mm' }} /><col style={{ width: '33mm' }} />{d.days.map((x) => <col key={x.iso} />)}{Array.from({ length: 9 }, (_, i) => <col key={i} style={{ width: '9.6mm' }} />)}</colgroup>,
    head: <>
      <tr><th rowSpan={2}>#</th><th rowSpan={2} className="nm">نام و سمت</th>{d.days.map((x) => <th key={x.iso} className={x.weekday === 6 ? 'fri' : ''}>{fa(x.jd)}</th>)}{['کارکرد', 'موظف', 'کسری', 'استراحت', 'استعلاجی', 'غیبت', 'ساعت کار', 'اضافه‌کار', 'ثبت دیرهنگام'].map((h) => <th key={h} rowSpan={2} className="sm">{h}</th>)}</tr>
      <tr>{d.days.map((x) => <th key={x.iso} className={`wd ${x.weekday === 6 ? 'fri' : ''}`}>{WD[x.weekday]}</th>)}</tr>
    </>,
  }
  const items: Item[] = d.pm.map(({ p, m, late }, i) => ({
    t: 'row', tbl, h: 7.6,
    node: <tr>
      <td>{fa(i + 1)}</td>
      <td className="nm"><b>{p.fullName}</b><small>{p.roleTitle || SIDE_FA[p.side]}</small></td>
      {d.days.map((x) => { const r = d.att[p.id + '|' + x.iso]; return <td key={x.iso} className={`mk ${r ? 's-' + r.status : ''} ${r?.source === 'gps' ? 'gps' : ''} ${x.weekday === 6 ? 'fri' : ''}`}>{r ? STATUS_MARK[r.status] : ''}</td> })}
      <td><b>{fa(m.worked)}</b></td><td>{fa(m.required)}</td><td>{dash(m.shortfall)}</td><td>{fa(m.rest)}</td><td>{dash(m.sick)}</td><td>{dash(m.absent)}</td><td>{faNum(m.hours)}</td><td><b>{faNum(m.overtime)}</b></td><td>{dash(late)}</td>
    </tr>,
  }))
  const sum = (f: (m: PersonMonth) => number) => d.pm.reduce((a, x) => a + f(x.m), 0)
  items.push({ t: 'row', tbl, h: 6.5, node: <tr className="tot"><td colSpan={2}>جمع ({fa(d.pm.length)} نفر)</td><td colSpan={cap} className="legend">ح حاضر · م مأموریت · ا استراحت · ع استعلاجی · غ غایب · خانهٔ خالی: ثبت‌نشده یا خارج از پروژه · خط زیر علامت: ثبت با گوشی</td><td>{fa(d.tot.worked)}</td><td>{fa(d.tot.required)}</td><td>{dash(d.tot.shortfall)}</td><td>{fa(sum((m) => m.rest))}</td><td>{dash(sum((m) => m.sick))}</td><td>{dash(sum((m) => m.absent))}</td><td>{faNum(d.tot.hours)}</td><td>{faNum(d.tot.overtime)}</td><td>{dash(d.pm.reduce((a, x) => a + x.late, 0))}</td></tr> })
  items.push({ t: 'block', h: 10, node: <p className="sv-sh-note">موظفی {fa(d.settings.dutyDays)} روز از ۳۰ روز (پنجشنبه و جمعه روز کاری)، روز کاری {faNum(d.settings.standardHours)} ساعت و مازاد آن اضافه‌کار؛ کارکرد = حاضر + مأموریت؛ استعلاجی کسری نیست. {fa(d.gpsPct)}٪ روزهای حضور را خود نفرات با گوشی در محدودهٔ کارگاه ثبت کرده‌اند؛ از ثبت‌های دستی {fa(d.timelyPct)}٪ در مهلت {fa(d.settings.entryGraceDays)} روزه وارد شده و «ثبت دیرهنگام» روزهایی است که پس از مهلت و با ذکر دلیل وارد شده‌اند.</p> })
  return { kind: 'att', formNo: `SV-A-${ymCode(d.month)}`, sections: [{ title: 'گزارش کارکرد ماهانهٔ دستگاه نظارت', items, signers: signers(d) }] }
}

function facilitiesDoc(d: SheetData): Doc {
  const items: Item[] = []
  const h2 = (text: string) => items.push({ t: 'block', h: 7, keepNext: true, node: <h2>{text}</h2> })
  const R = 5.6
  h2('۱. وعده‌های غذایی')
  const t1: Tbl = { cls: '', headH: 6, head: <tr><th>گروه</th><th>نفر</th><th>روز حضور</th><th>صبحانه</th><th>ناهار</th><th>شام</th><th>جمع وعده</th></tr> }
  for (const x of d.sides) items.push({ t: 'row', tbl: t1, h: R, node: <tr><td className="nm">{x.sd === 'supervision' ? 'دستگاه نظارت' : 'نمایندگان کارفرما'}</td><td>{fa(x.n)}</td><td>{fa(x.worked)}</td><td>{fa(x.b)}</td><td>{fa(x.l)}</td><td>{fa(x.d)}</td><td>{fa(x.b + x.l + x.d)}</td></tr> })
  items.push({ t: 'row', tbl: t1, h: R, node: <tr><td className="nm">مهمانان</td><td>{fa(d.gt.guests)}</td><td>—</td><td>{fa(d.gt.breakfast)}</td><td>{fa(d.gt.lunch)}</td><td>{fa(d.gt.dinner)}</td><td>{fa(d.gt.breakfast + d.gt.lunch + d.gt.dinner)}</td></tr> })
  const meals = d.tot.breakfast + d.tot.lunch + d.tot.dinner + d.gt.breakfast + d.gt.lunch + d.gt.dinner
  items.push({ t: 'row', tbl: t1, h: R, node: <tr className="tot"><td className="nm">جمع کل</td><td>{fa(d.pm.length + d.gt.guests)}</td><td>{fa(d.tot.worked)}</td><td>{fa(d.tot.breakfast + d.gt.breakfast)}</td><td>{fa(d.tot.lunch + d.gt.lunch)}</td><td>{fa(d.tot.dinner + d.gt.dinner)}</td><td>{fa(meals)}</td></tr> })

  h2('۲. وعده‌ها به تفکیک نفر')
  const t2: Tbl = { cls: '', headH: 6, head: <tr><th>#</th><th>نام</th><th>سمت</th><th>روز حضور</th><th>صبحانه</th><th>ناهار</th><th>شام</th></tr> }
  d.pm.forEach(({ p, m }, i) => items.push({ t: 'row', tbl: t2, h: R, node: <tr><td>{fa(i + 1)}</td><td className="nm">{p.fullName}</td><td className="nm">{p.roleTitle || SIDE_FA[p.side]}</td><td>{fa(m.present)}</td><td>{fa(m.breakfast)}</td><td>{fa(m.lunch)}</td><td>{fa(m.dinner)}</td></tr> }))

  let n = 3
  if (d.guests.length) {
    h2(`${fa(n++)}. مهمانان`)
    const t3: Tbl = { cls: '', headH: 6, head: <tr><th>تاریخ</th><th>مهمان / گروه</th><th>سازمان</th><th>میزبان</th><th>صبحانه</th><th>ناهار</th><th>شام</th></tr> }
    for (const g of d.guests) items.push({ t: 'row', tbl: t3, h: R, node: <tr><td>{fa(formatJalali(g.day))}</td><td className="nm">{g.guestName}</td><td className="nm">{g.organization || '—'}</td><td className="nm">{g.host || '—'}</td><td>{dash(g.breakfast)}</td><td>{dash(g.lunch)}</td><td>{dash(g.dinner)}</td></tr> })
  }
  h2(`${fa(n)}. خودروها`)
  const t4: Tbl = { cls: '', headH: 6, head: <tr><th>#</th><th>خودرو</th><th>پلاک</th><th>مالکیت</th><th>مدل / موتور / گیربکس</th><th>راننده / در اختیار</th><th>روز کارکرد</th><th>تعمیر</th><th>ساعت</th><th>کیلومتر</th></tr> }
  d.vm.forEach(({ v, m }, i) => items.push({
    t: 'row', tbl: t4, h: 6.2,
    node: <tr>
      <td>{fa(i + 1)}</td><td className="nm">{v.title}</td><td className="nm">{v.plate || '—'}</td><td>{v.ownership === 'company' ? 'شرکتی' : 'استیجاری'}</td>
      <td className="nm">{fa([v.modelYear, v.engineCc && `${v.engineCc}cc`, v.gearbox === 'automatic' ? 'اتوماتیک' : v.gearbox === 'manual' ? 'دستی' : ''].filter(Boolean).join(' / ') || '—')}</td>
      <td className="nm">{[v.driver, d.driver(v.personId)].filter(Boolean).join(' / ') || '—'}</td>
      <td><b>{fa(m.present)}</b></td><td>{dash(m.repair)}</td><td>{faNum(m.hours)}</td><td>{m.km ? faNum(m.km, 0) : '—'}</td>
    </tr>,
  }))
  const rented = d.vm.filter((x) => x.v.ownership !== 'company').reduce((a, x) => a + x.m.present, 0)
  items.push({ t: 'row', tbl: t4, h: R, node: <tr className="tot"><td colSpan={4} className="nm">جمع ({fa(d.vm.length)} خودرو)</td><td colSpan={2} className="nm">استیجاری {fa(rented)} روز · شرکتی {fa(d.tot.vehicleDays - rented)} روز</td><td><b>{fa(d.tot.vehicleDays)}</b></td><td>{dash(d.vm.reduce((a, x) => a + x.m.repair, 0))}</td><td>{faNum(d.tot.vehicleHours)}</td><td>{faNum(d.vm.reduce((a, x) => a + x.m.km, 0), 0)}</td></tr> })
  items.push({ t: 'block', h: 7, node: <p className="sv-sh-note">هر روز حضور = صبحانه، ناهار و شام. وعده‌های مهمانان طبق ثبت روزانه در سامانه. روز کارکرد خودرو با ساعت کار پیش‌فرض {faNum(d.settings.vehicleHours)} ساعت.</p> })
  return { kind: 'fac', formNo: `SV-F-${ymCode(d.month)}`, sections: [{ title: 'گزارش تسهیلات دستگاه نظارت (غذا و خودرو)', items, signers: signers(d) }] }
}

function timesheetDoc(d: SheetData, personIds: string[]): Doc {
  const sections: Section[] = d.pm.filter((x) => personIds.includes(x.p.id)).map(({ p, m, late }) => {
    const tbl: Tbl = {
      cls: 'sv-sh-ts', headH: 6.5,
      head: <tr><th>روز</th><th>تاریخ</th><th>وضعیت</th><th>ورود</th><th>خروج</th><th>ساعت کار</th><th>اضافه‌کار</th><th>ص</th><th>ن</th><th>ش</th><th>ثبت</th><th className="nm">توضیح</th></tr>,
    }
    const items: Item[] = [{
      t: 'block', h: 11,
      node: <div className="sv-sh-person">
        <div><small>نام و نام خانوادگی</small><b>{p.fullName}</b></div>
        <div><small>سمت</small><b>{p.roleTitle || '—'}</b></div>
        <div><small>طرف</small><b>{SIDE_FA[p.side]}</b></div>
        <div><small>کد ملی</small><b>{p.nationalId ? fa(p.nationalId) : '—'}</b></div>
        <div><small>ساعت کاری</small><b>{p.shiftStart && p.shiftEnd ? `${fa(p.shiftStart)} تا ${fa(p.shiftEnd)}` : `${fa(d.settings.standardHours)} ساعت`}</b></div>
        <div><small>نحوهٔ ثبت</small><b>{p.userId ? 'با گوشی' : 'توسط سرپرست'}</b></div>
      </div>,
    }]
    for (const x of d.days) {
      const r = d.att[p.id + '|' + x.iso]
      const out = (p.startDate && x.iso < p.startDate) || (p.endDate && x.iso > p.endDate)
      items.push({
        t: 'row', tbl, h: 5.45,
        node: <tr className={`${x.weekday === 6 ? 'fri' : ''} ${r ? 's-' + r.status : ''}`}>
          <td>{WD[x.weekday]}</td><td>{fa(formatJalali(x.iso).slice(5))}</td>
          <td>{r ? STATUS_FA[r.status] : out ? 'خارج از پروژه' : '—'}</td>
          <td>{r?.checkIn ? fa(r.checkIn) : ''}</td><td>{r?.checkOut ? fa(r.checkOut) : ''}</td>
          <td>{r && (r.status === 'present' || r.status === 'mission') ? faNum(r.hours) : ''}</td><td>{r?.overtime ? faNum(r.overtime) : ''}</td>
          <td>{r?.breakfast ? '✓' : ''}</td><td>{r?.lunch ? '✓' : ''}</td><td>{r?.dinner ? '✓' : ''}</td>
          <td>{r ? SRC_FA[r.source] : ''}</td>
          <td className="nm">{[r?.note, r?.lateReason && `ثبت با تأخیر: ${r.lateReason}`].filter(Boolean).join(' · ')}</td>
        </tr>,
      })
    }
    items.push({ t: 'row', tbl, h: 6, node: <tr className="tot"><td colSpan={3}>جمع</td><td colSpan={2}>{fa(m.worked)} روز کارکرد</td><td>{faNum(m.hours)}</td><td>{faNum(m.overtime)}</td><td>{fa(m.breakfast)}</td><td>{fa(m.lunch)}</td><td>{fa(m.dinner)}</td><td colSpan={2} /></tr> })
    items.push({
      t: 'block', h: 12,
      node: <div className="sv-sh-kpis">
        <span>موظف <b>{fa(m.required)}</b></span><span>کارکرد <b>{fa(m.worked)}</b></span><span>کسری <b>{dash(m.shortfall)}</b></span>
        <span>مأموریت <b>{dash(m.mission)}</b></span><span>استراحت <b>{fa(m.rest)}</b> از {fa(m.restAllowed)}</span><span>استعلاجی <b>{dash(m.sick)}</b></span><span>غیبت <b>{dash(m.absent)}</b></span>
        <span>اضافه‌کار <b>{faNum(m.overtime)}</b> از سقف {fa(m.overtimeCap)}</span><span>ثبت دیرهنگام <b>{dash(late)}</b></span>
      </div>,
    })
    return { title: 'کارکرد ماهانهٔ نفر (تایم‌شیت)', subtitle: p.fullName, items, signers: signers(d, p) }
  })
  return { kind: 'ts', formNo: `SV-T-${ymCode(d.month)}`, sections }
}

export function buildDoc(kind: DocKind, d: SheetData, personIds: string[] = []): Doc {
  return kind === 'att' ? attendanceDoc(d) : kind === 'fac' ? facilitiesDoc(d) : timesheetDoc(d, personIds)
}

/** All pages of a document, each a complete A4 page. */
export function PagedDoc({ doc, d }: { doc: Doc; d: SheetData }) {
  const o = ORIENTATION[doc.kind]
  const pages = doc.sections.flatMap((s) => paginate(s.items, bodyHeight(o)).map((items) => ({ s, items })))
  const first = d.days[0].iso, last = d.days[d.days.length - 1].iso
  const status = d.signatures.some((x) => x.step === 'approved') ? 'تأیید شده' : d.signatures.some((x) => x.step === 'prepared') ? 'تهیه شده' : 'پیش‌نویس'
  return (
    <>
      {pages.map(({ s, items }, i) => (
        <section key={i} className={`sv-pg ${o}`} dir="rtl">
          <header className="sv-pg-head">
            <div className="sv-pg-title">
              <div className="sv-sh-proj">{d.projectName}</div>
              <h1>{s.title}{s.subtitle && <span> — {s.subtitle}</span>}</h1>
            </div>
            <dl>
              <div><dt>دوره</dt><dd>{fa(monthLabel(d.month))}</dd></div>
              <div><dt>از تاریخ</dt><dd>{fa(formatJalali(first))}</dd></div>
              <div><dt>تا تاریخ</dt><dd>{fa(formatJalali(last))}</dd></div>
              <div><dt>شمارهٔ فرم</dt><dd>{doc.formNo}</dd></div>
              <div><dt>وضعیت</dt><dd>{status}</dd></div>
            </dl>
          </header>
          <div className="sv-pg-body">{renderBody(items)}</div>
          <footer className="sv-pg-foot">
            <div className="sv-pg-signs" style={{ gridTemplateColumns: `repeat(${s.signers.length}, 1fr)` }}>
              {s.signers.map((g) => (
                <div key={g.role} className="sv-pg-sign">
                  <div className="sv-sh-role">{g.role}: <span>{g.sig?.signerTitle || g.title}</span></div>
                  <div className="sv-sh-ink">{g.sig && <img src={g.sig.image} alt="" />}</div>
                  <div className="sv-sh-name">{g.sig ? <>{g.sig.signerName} — {fa(formatJalali(entryDay(g.sig.signedAt)))}</> : 'نام، تاریخ و امضا'}</div>
                </div>
              ))}
            </div>
            <div className="sv-pg-meta">
              <span>حضور و غیاب دستگاه نظارت — {d.projectName}</span>
              <b>صفحهٔ {fa(i + 1)} از {fa(pages.length)}</b>
              <span>تاریخ چاپ: {fa(formatJalali(todayLocal()))}</span>
            </div>
          </footer>
        </section>
      ))}
    </>
  )
}

/** On screen: the pages shrunk to the available width (the print uses them at full size). */
export function PagedPreview({ doc, d }: { doc: Doc; d: SheetData }) {
  const ref = useRef<HTMLDivElement>(null)
  const [z, setZ] = useState(1)
  const w = PAGE[ORIENTATION[doc.kind]].w * 3.7795
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => setZ(Math.min(1, (el.clientWidth - 4) / w))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [w])
  return <div ref={ref} className="sv-preview" style={{ ['--z' as string]: z }}><PagedDoc doc={doc} d={d} /></div>
}
