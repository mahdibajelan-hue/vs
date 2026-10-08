import { useState } from 'react'
import { ArrowUpRight, CalendarClock, Flag, ShieldAlert, TriangleAlert } from 'lucide-react'
import type { Analysis } from '../../lib/kpis'
import type { TransferTarget } from '../../types'
import { useLandStore } from '../../store/useLandStore'
import { describeEvent } from '../../lib/events'
import { fmtDate } from '../../lib/fa'
import { openRecord } from '../../integration/records'
import { problemsOf, SEVERITY_LABEL } from '../../lib/problems'
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
  const today = useLandStore((s) => s.today)
  const report = problemsOf(a, today)
  const [edited, setEdited] = useState<Record<string, string>>({})
  const draftOf = (t: TransferTarget) => (t === 'issue' ? report.issue : t === 'risk' ? report.risk : null)
  const paramsOf = (t: TransferTarget) => {
    const d = draftOf(t)
    return d ? { ...d.params, description: edited[t] ?? d.description } : undefined
  }
  const events = (data?.events ?? []).filter((e) => e.parcelId === p.id).slice(0, 30)

  return (
    <div className="flex flex-col gap-4 p-5">
      {report.reasons.length > 0 && (
        <section className="rounded-xl p-4" style={{ border: `1px solid color-mix(in srgb, ${report.issue?.severity === 'critical' ? '#ef4444' : '#f59e0b'} 45%, transparent)`, background: `color-mix(in srgb, ${report.issue?.severity === 'critical' ? '#ef4444' : '#f59e0b'} 7%, var(--la-surface))` }}>
          <p className="m-0 flex items-center gap-2 text-[13px] font-bold"><TriangleAlert size={16} style={{ color: report.issue?.severity === 'critical' ? '#ef4444' : '#f59e0b' }} /> مشکلات شناسایی‌شده{report.issue && <Badge color={report.issue.severity === 'critical' ? '#ef4444' : '#f59e0b'}>اهمیت {SEVERITY_LABEL[report.issue.severity]}</Badge>}</p>
          <ol className="m-0 mt-2 list-decimal ps-5 text-[12px] leading-7">
            {report.reasons.map((r) => <li key={r.key} style={{ color: r.level === 'bad' ? 'var(--la-ink)' : 'var(--la-ink-2)' }}>{r.text}</li>)}
          </ol>
          <p className="la-eyebrow m-0 mt-2 leading-6">{report.issue ? 'متن آمادهٔ مسئله و ریسک پایین ساخته شده است؛ می‌توانید قبل از ثبت ویرایشش کنید.' : 'هنوز به حد ثبت مسئله نرسیده؛ پایش شود.'}</p>
        </section>
      )}
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
                  <>
                    {draftOf(c.target) && (
                      <details className="mt-2">
                        <summary className="la-eyebrow cursor-pointer">پیش‌نمایش و ویرایش متن آماده ({SEVERITY_LABEL[draftOf(c.target)!.severity]})</summary>
                        <textarea className="la-input la-textarea mt-1.5" style={{ minHeight: 150, fontSize: 12 }} value={edited[c.target] ?? draftOf(c.target)!.description} onChange={(e) => setEdited({ ...edited, [c.target]: e.target.value })} />
                      </details>
                    )}
                    <button className="la-btn la-btn-sm mt-2.5" disabled={busy !== null} onClick={async () => { setBusy(c.target); await transfer(p.id, c.target, paramsOf(c.target)); setBusy(null) }}>
                      {busy === c.target ? 'در حال ثبت…' : c.cta}
                    </button>
                  </>
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
