import { CalendarRange, Hammer } from 'lucide-react'
import type { Analysis } from '../../lib/kpis'
import { useLandStore } from '../../store/useLandStore'
import { fmtDate, fmtDuration, relDays, faNum } from '../../lib/fa'
import { diffDays, fmtKmRange } from '../../lib/dates'
import { constraintsOf } from '../../lib/schedule'
import { Badge, EmptyState } from '../ui'

/** Which construction activities will meet this land, when, and whether the land will be ready by then. */
export function ScheduleTab({ a }: { a: Analysis }) {
  const activities = useLandStore((s) => s.data?.activities ?? [])
  const today = useLandStore((s) => s.today)
  const p = a.parcel
  const ea = a.early
  const cons = constraintsOf(p, activities, today)

  if (ea.impacts.length === 0) {
    return (
      <div className="p-5">
        <div className="la-card-flat">
          <EmptyState icon={<CalendarRange size={20} />} title="هیچ فعالیتی از این قطعه عبور نمی‌کند" text="در برنامه زمان‌بندی فعالیت‌هایی مثل Clearing یا Welding را با بازهٔ کیلومتر و تاریخ تعریف کنید تا مهلت آزادسازی این زمین محاسبه شود." />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <section className="la-card-flat p-4">
        <p className="la-title m-0">مهلت آزادسازی</p>
        <dl className="m-0 mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
          <Item k="اولین نیاز اجرایی" v={fmtDate(ea.needBy)} sub={ea.daysToNeedBy != null ? relDays(ea.daysToNeedBy) : undefined} />
          <Item k="آخرین زمان شروع تحصیل" v={fmtDate(ea.startBy)} sub={ea.daysToStartBy != null ? relDays(ea.daysToStartBy) : undefined} bad={!a.released && ea.daysToStartBy != null && ea.daysToStartBy <= 0} />
          <Item k="زمان لازم تا آزادسازی" v={a.released ? 'آزاد شده' : fmtDuration(ea.remaining)} />
          <Item k="آزادسازی با روند فعلی" v={a.released ? '—' : fmtDate(ea.projectedRelease)} sub={ea.delayDays > 0 ? `${fmtDuration(ea.delayDays)} پس از نیاز برنامه` : undefined} bad={ea.delayDays > 0} />
        </dl>
      </section>

      <section className="la-card-flat p-4">
        <p className="la-title m-0 flex items-center gap-2"><Hammer size={15} /> فعالیت‌های عبوری</p>
        <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
          {ea.impacts.map((i) => {
            const c = cons.find((x) => x.activity.id === i.activity.id)
            const late = c && !a.released && c.slackDays <= 0
            return (
              <li key={i.activity.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="m-0 text-[13px] font-bold">{i.activity.name}</p>
                  <p className="la-eyebrow m-0 leading-6">{fmtDate(i.from)}{i.to !== i.from ? ` تا ${fmtDate(i.to)}` : ''}</p>
                  <p className="la-eyebrow la-km m-0">{fmtKmRange(i.activity.kmStart, i.activity.kmEnd)}</p>
                </div>
                {a.released ? <Badge color="#22c55e">آماده</Badge> : late ? <Badge color="#ef4444">{faNum(Math.abs(c!.slackDays))} روز کسری</Badge> : c ? <Badge color="#22c55e">{faNum(c.slackDays)} روز ذخیره</Badge> : <Badge>{faNum(diffDays(i.from, today))} روز دیگر</Badge>}
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function Item({ k, v, sub, bad }: { k: string; v: string; sub?: string; bad?: boolean }) {
  return (
    <div>
      <dt className="la-eyebrow">{k}</dt>
      <dd className="m-0 mt-0.5 font-bold" style={{ color: bad ? '#ef4444' : undefined }}>{v}</dd>
      {sub && <dd className="la-eyebrow m-0">{sub}</dd>}
    </div>
  )
}
