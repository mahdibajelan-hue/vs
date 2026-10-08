import { AlarmClock, CheckCircle2, Gavel, Scale, ShieldAlert } from 'lucide-react'
import { JalaliDateInput } from '../../platform'
import type { LegalData } from '../../types'
import type { Analysis } from '../../lib/kpis'
import type { ClockSeverity, LegalClock } from '../../lib/legal'
import { useLandStore } from '../../store/useLandStore'
import { faNum, fmtDate } from '../../lib/fa'
import { Badge } from '../ui'

const SEV_COLOR: Record<ClockSeverity, string> = { critical: '#ef4444', high: '#f59e0b', low: '#38bdf8', ok: '#22c55e' }
const STATUS_TEXT = { overdue: 'مهلت گذشته', due_soon: 'نزدیک مهلت', running: 'در جریان', done: 'انجام شد' } as const

/** Event dates the user records; each one starts or closes a legal clock of the 1358 law. */
const FIELDS: { key: keyof LegalData; label: string; article: string }[] = [
  { key: 'inquiryDate', label: 'تاریخ استعلام وضع ثبتی از اداره ثبت', article: 'ماده ۲' },
  { key: 'registryReplyDate', label: 'تاریخ پاسخ اداره ثبت', article: 'ماده ۲' },
  { key: 'agreementDate', label: 'تاریخ توافق بر بهای عادله', article: 'ماده ۳' },
  { key: 'settledDate', label: 'تاریخ خرید و پرداخت (یا اعلام کتبی انصراف)', article: 'ماده ۳' },
  { key: 'ownerNoticeDate', label: 'تاریخ ابلاغ به مالک برای معرفی کارشناس', article: 'ماده ۴' },
  { key: 'expertNamedDate', label: 'تاریخ معرفی کارشناس مالک', article: 'ماده ۴' },
  { key: 'courtAppointRequestDate', label: 'تاریخ درخواست تعیین کارشناس از دادگاه', article: 'ماده ۴' },
  { key: 'courtAppointedDate', label: 'تاریخ تعیین کارشناس توسط دادگاه', article: 'ماده ۴' },
  { key: 'expertAssignedDate', label: 'تاریخ ارجاع به هیئت کارشناسی', article: 'ماده ۵' },
  { key: 'expertOpinionDate', label: 'تاریخ اعلام نظر هیئت کارشناسی', article: 'ماده ۵' },
  { key: 'notice1Date', label: 'تاریخ اعلام اول به مالک', article: 'ماده ۸' },
  { key: 'notice2Date', label: 'تاریخ اعلام دوم به مالک', article: 'ماده ۸' },
  { key: 'depositDate', label: 'تاریخ تودیع بها در صندوق ثبت', article: 'ماده ۸' },
  { key: 'evictedDate', label: 'تاریخ تخلیه و خلع ید', article: 'ماده ۸' },
  { key: 'annulmentStayOrderDate', label: 'تاریخ دستور توقف اجرای حکم (پس از ابطال سند)', article: 'ماده ۱، تبصرهٔ الحاقی' },
  { key: 'annulmentPaidDate', label: 'تاریخ پرداخت یا تودیع قیمت روز', article: 'ماده ۱، تبصرهٔ الحاقی' },
]
const STAY_FIELDS: { key: keyof LegalData; label: string }[] = [
  { key: 'stayFiledDate', label: 'تاریخ درخواست مالک از دادگاه برای توقف عملیات' },
  { key: 'stayOrderDate', label: 'تاریخ صدور دستور توقف عملیات اجرایی' },
  { key: 'stayLiftedDate', label: 'تاریخ رفع توقیف (پس از پرداخت یا تودیع)' },
]

/** The legal alarms of this parcel plus the dates that drive them. */
export function LegalTab({ a }: { a: Analysis }) {
  const p = a.parcel
  const update = useLandStore((s) => s.updateParcel)
  const art9 = p.acquisitionRoute === 'art9'
  const set = (key: keyof LegalData, iso: string | null) => update(p.id, { legal: { ...p.legal, [key]: iso } })
  const open = a.clocks.filter((c) => c.status !== 'done')
  const done = a.clocks.filter((c) => c.status === 'done')

  return (
    <div className="flex flex-col gap-4 p-5">
      <p className="la-eyebrow m-0 leading-7">
        مواعد قانونی بر اساس «لایحه قانونی نحوه خرید و تملک اراضی و املاک برای اجرای برنامه‌های عمومی، عمرانی و نظامی دولت» (۱۳۵۸). هر مهلت از تاریخ رویداد آغازین حساب می‌شود؛ «ماه» به‌صورت ماه شمسی است.
      </p>

      {open.length === 0 && done.length === 0 && (
        <div className="la-card-flat flex items-start gap-3 p-4">
          <Scale size={18} style={{ color: 'var(--la-muted)', flexShrink: 0, marginTop: 2 }} />
          <p className="m-0 text-[12.5px] leading-7" style={{ color: 'var(--la-ink-2)' }}>
            {art9 ? 'مهلت‌ها با ثبت تاریخ تصرف در مرحلهٔ «تصرف فوری» شروع می‌شود.' : 'هنوز مهلت قانونی فعالی شروع نشده است. تاریخ رویدادها را در پایین ثبت کنید.'}
          </p>
        </div>
      )}

      {open.map((c) => <ClockCard key={c.key} c={c} />)}
      {done.length > 0 && (
        <details className="la-card-flat p-3">
          <summary className="cursor-pointer text-[12.5px] font-bold">{faNum(done.length)} مهلت انجام‌شده</summary>
          <div className="mt-3 flex flex-col gap-2">{done.map((c) => <ClockCard key={c.key} c={c} />)}</div>
        </details>
      )}

      <section className="la-card-flat p-4">
        <p className="la-title m-0 flex items-center gap-2"><Gavel size={15} /> {art9 ? 'درخواست و دستور توقف عملیات (تبصرهٔ ماده ۹)' : 'تاریخ رویدادهای قانونی'}</p>
        {art9 && <p className="la-eyebrow mt-1 leading-6">تصرف، صورت‌جلسه و پرداخت از مراحل جریان کار خوانده می‌شود؛ فقط درخواست و دستور توقف را اینجا ثبت کنید.</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(art9 ? STAY_FIELDS.map((f) => ({ ...f, article: 'ماده ۹، تبصره' })) : FIELDS).map((f) => (
            <div key={f.key}>
              <span className="la-label">{f.label} <span style={{ color: 'var(--la-muted)', fontWeight: 400 }}>({f.article})</span></span>
              <div className="flex gap-1.5">
                <div className="min-w-0 flex-1"><JalaliDateInput value={(p.legal?.[f.key] as string | null | undefined) ?? ''} onChange={(iso) => set(f.key, iso)} /></div>
                {p.legal?.[f.key] && <button className="la-btn la-btn-icon la-btn-sm" aria-label="پاک کردن" onClick={() => set(f.key, null)}>×</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function ClockCard({ c }: { c: LegalClock }) {
  const color = SEV_COLOR[c.severity]
  const Icon = c.status === 'done' ? CheckCircle2 : c.severity === 'critical' ? ShieldAlert : AlarmClock
  return (
    <article className="rounded-xl p-3.5" style={{ border: `1px solid color-mix(in srgb, ${color} ${c.status === 'running' ? 28 : 50}%, transparent)`, background: `color-mix(in srgb, ${color} ${c.status === 'overdue' ? 10 : 6}%, var(--la-surface))` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon size={18} style={{ color, flexShrink: 0, marginTop: 2 }} aria-hidden />
          <div className="min-w-0">
            <p className="m-0 text-[13px] font-bold">{c.title}</p>
            <p className="la-eyebrow m-0">{c.article}</p>
          </div>
        </div>
        <Badge color={color}>{STATUS_TEXT[c.status]}</Badge>
      </div>
      <p className="m-0 mt-2 text-[12px] leading-7" style={{ color: 'var(--la-ink-2)' }}>{c.rule}</p>
      {c.status !== 'done' && c.key !== 'art9_stay' && c.key !== 'art9_stay_filed' && c.key !== 'art9_compliance' && (
        <p className="m-0 mt-1.5 text-[12px]">
          مهلت تا <b>{fmtDate(c.due)}</b>
          {' · '}
          <b style={{ color }}>{c.daysLeft < 0 ? `${faNum(-c.daysLeft)} روز گذشته` : c.daysLeft === 0 ? 'امروز آخرین روز است' : `${faNum(c.daysLeft)} روز مانده`}</b>
        </p>
      )}
      {c.status === 'done' && <p className="la-eyebrow m-0 mt-1">آغاز: {fmtDate(c.start)} · مهلت: {fmtDate(c.due)}</p>}
      {c.status !== 'done' && <p className="m-0 mt-1.5 text-[11.5px] leading-6" style={{ color }}>{c.consequence}</p>}
    </article>
  )
}
