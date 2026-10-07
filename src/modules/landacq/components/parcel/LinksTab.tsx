import { useState } from 'react'
import { ArrowUpRight, CalendarClock, Flag, ShieldAlert } from 'lucide-react'
import type { Analysis } from '../../lib/kpis'
import type { TransferTarget } from '../../types'
import { useLandStore } from '../../store/useLandStore'
import { describeEvent } from '../../lib/events'
import { fmtDate } from '../../lib/fa'
import { openRecord } from '../../integration/records'
import { Badge } from '../ui'

const CARDS: { target: TransferTarget; title: string; text: string; icon: typeof Flag; cta: string }[] = [
  { target: 'risk', title: 'ریسک', text: 'ثبت این قطعه به‌عنوان ریسک بیرونی با امتیاز و توضیح آماده در ثبت ریسک پروژه.', icon: ShieldAlert, cta: 'ثبت در مدیریت ریسک' },
  { target: 'issue', title: 'مسئله', text: 'ثبت مسئلهٔ باز با منبع «تحصیل اراضی» برای پیگیری و مسئول‌گذاری.', icon: Flag, cta: 'ثبت در مدیریت مسائل' },
  { target: 'schedule', title: 'هشدار برنامه زمان‌بندی', text: 'ارسال هشدار زودهنگام به برنامه زمان‌بندی: این زمین فعالیت‌های اجرایی را به تأخیر می‌اندازد.', icon: CalendarClock, cta: 'ارسال هشدار زودهنگام' },
]

/** One-click hand-over to Risk, Issue and Schedule — each can be done once, and shows the live status of what it created. */
export function LinksTab({ a }: { a: Analysis }) {
  const p = a.parcel
  const transfer = useLandStore((s) => s.transfer)
  const data = useLandStore((s) => s.data)
  const [busy, setBusy] = useState<TransferTarget | null>(null)
  const linked = (t: TransferTarget) => data?.linked.find((l) => l.parcelId === p.id && l.target === t)
  const idOf = (t: TransferTarget) => (t === 'risk' ? p.riskId : t === 'issue' ? p.issueId : p.scheduleWarningId)
  const events = (data?.events ?? []).filter((e) => e.parcelId === p.id).slice(0, 30)

  return (
    <div className="flex flex-col gap-4 p-5">
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {CARDS.map((c) => {
          const id = idOf(c.target)
          const l = linked(c.target)
          return (
            <li key={c.target} className="la-card-flat flex items-start gap-3 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--la-surface-3)' }}><c.icon size={17} /></span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px] font-bold">{c.title}</p>
                <p className="la-eyebrow mt-0.5 leading-6">{c.text}</p>
                {id ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Badge color="#22c55e">منتقل شده</Badge>
                    {l && <Badge><span className="la-km">{l.linkedCode}</span> · {l.linkedStatus}</Badge>}
                    <button className="la-btn la-btn-sm" onClick={() => openRecord(c.target, id, p.masterProjectId)}>باز کردن <ArrowUpRight size={13} /></button>
                  </div>
                ) : (
                  <button className="la-btn la-btn-sm mt-2.5" disabled={busy !== null} onClick={async () => { setBusy(c.target); await transfer(p.id, c.target); setBusy(null) }}>
                    {busy === c.target ? 'در حال ثبت…' : c.cta}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <section className="la-card-flat p-4">
        <p className="la-title m-0">سابقهٔ تغییرات</p>
        {events.length === 0 ? <p className="la-eyebrow mt-2">هنوز رویدادی ثبت نشده است.</p> : (
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {events.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="leading-6" style={{ color: 'var(--la-ink-2)' }}>{describeEvent(e)}</span>
                <span className="la-eyebrow shrink-0">{fmtDate(e.at.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
