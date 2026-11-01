import { useMemo, useState } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { detectFraud, FLAG_FA, SEVERITY_COLOR, SEVERITY_FA, type FraudFlag } from '../lib/svFraud'
import { fa } from '../lib/svMonth'

/**
 * ثبت‌های مشکوک — check-ins that look made for someone else, for the range on screen (the month being approved).
 * `compact`: one line with the counts and a button to open the list (attendance table); full: the whole list (report).
 */
export function SuspiciousPanel({ from, to, compact = false }: { from: string; to: string; compact?: boolean }) {
  const punches = useSupervisionStore((s) => s.punches)
  const devices = useSupervisionStore((s) => s.devices)
  const people = useSupervisionStore((s) => s.people)
  const [open, setOpen] = useState(!compact)
  const flags = useMemo(() => {
    const name = new Map(people.map((p) => [p.id, p.fullName]))
    return detectFraud(punches.filter((p) => p.day >= from && p.day <= to), devices, (id) => name.get(id) ?? 'نفر نامشخص')
  }, [punches, devices, people, from, to])
  const high = flags.filter((f) => f.severity === 'high').length
  const medium = flags.filter((f) => f.severity === 'medium').length
  const level = high ? 'bad' : medium ? 'warn' : 'ok'
  if (compact && !flags.length) return null
  const Icon = level === 'ok' ? ShieldCheck : ShieldAlert
  return (
    <section className={`sv-integ sv-fraud lv-${level} no-print`} aria-label="ثبت‌های مشکوک">
      <div className="sv-integ-head">
        <Icon size={17} />
        <b>ثبت‌های مشکوک</b>
        <span>{!flags.length ? 'نشانه‌ای از ثبت حضور به‌جای دیگران دیده نشد' : level === 'ok' ? `${fa(flags.length)} مورد کم‌اهمیت، برای آگاهی` : `${fa(flags.length)} مورد${high ? `، ${fa(high)} با اهمیت زیاد` : ''}${medium ? `، ${fa(medium)} با اهمیت متوسط` : ''}؛ پیش از تأیید بررسی شود`}</span>
        {compact && <button type="button" className="im-btn im-btn-ghost sv-fraud-toggle" onClick={() => setOpen((x) => !x)} aria-expanded={open}>{open ? 'بستن' : 'نمایش موارد'}</button>}
      </div>
      {open && flags.length > 0 && <ul className="sv-fraud-list">{flags.map((f) => <FlagRow key={f.key} f={f} />)}</ul>}
      {open && <p className="sv-note" style={{ margin: 0 }}>این فهرست از سابقهٔ ثبت‌های گوشی ساخته می‌شود: شناسهٔ مرورگر، نشانی اینترنتی، مختصات، زمان ثبت سرور و امضای گوشی تأییدشده. ثبت‌ها را مسدود نمی‌کند؛ نشانه‌ها را برای بررسی سرپرست نشان می‌دهد.</p>}
    </section>
  )
}

function FlagRow({ f }: { f: FraudFlag }) {
  return (
    <li style={{ ['--c' as string]: SEVERITY_COLOR[f.severity] }}>
      <span className="sv-fraud-sev">{SEVERITY_FA[f.severity]}</span>
      <span className="sv-fraud-body"><b>{FLAG_FA[f.kind]}</b><small>{fa(formatJalali(f.day))} · {f.detail}</small></span>
    </li>
  )
}
