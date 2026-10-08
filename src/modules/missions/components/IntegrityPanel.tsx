import { Lock, ShieldAlert, ShieldCheck } from 'lucide-react'
import { shamsi, faNum } from '../lib/fa'
import { Pill } from './ui'
import type { Finding, FindingAudit } from '../types'

const OP_LABEL: Record<FindingAudit['op'], string> = { insert: 'افزوده شد', update: 'تغییر کرد', delete: 'حذف شد' }

const str = (o: Record<string, unknown> | null, k: string) => (o && o[k] != null ? String(o[k]) : '')

/**
 * Transparency for the people who approve a report: what was changed after submission, and what the visitor
 * marked confidential. Everything here is already limited by the database (never shown to the visited project's
 * own manager), so the panel simply renders what it is given.
 */
export function IntegrityPanel({ audit, findings, compact = false }: { audit: FindingAudit[]; findings: Finding[]; compact?: boolean }) {
  const confidential = findings.filter((f) => f.confidential && f.approval !== 'rejected')
  const suspicious = audit.filter((a) => a.suspicious)
  const log = audit.filter((a) => a.op !== 'insert' || a.suspicious)
  const clean = suspicious.length === 0 && confidential.length === 0
  return (
    <section className="ms-card p-5" aria-label="شفافیت و استقلال گزارش" style={{ borderColor: suspicious.length ? 'color-mix(in srgb, var(--ms-bad) 55%, transparent)' : undefined }}>
      <div className="flex items-center gap-2">
        {suspicious.length ? <ShieldAlert size={18} style={{ color: 'var(--ms-bad)' }} aria-hidden /> : <ShieldCheck size={18} style={{ color: 'var(--ms-good)' }} aria-hidden />}
        <h3 className="text-[14px] font-extrabold">شفافیت و استقلال گزارش</h3>
        <Pill tone={suspicious.length ? 'bad' : clean ? 'good' : 'warn'}>{suspicious.length ? `${faNum(suspicious.length)} تغییر مشکوک` : clean ? 'مورد مشکوکی نیست' : 'بررسی شود'}</Pill>
      </div>
      <p className="ms-muted mt-1 text-[11.5px] leading-6">فقط برای مجری طرح و مدیریت ارشد. مدیر پروژهٔ بازدیدشده این بخش را نمی‌بیند و در تأیید یا تغییر گزارش خودش نقشی ندارد.</p>

      {suspicious.length > 0 && (
        <p className="mt-3 rounded-xl px-3 py-2 text-[12px] font-bold leading-6" style={{ background: 'color-mix(in srgb, var(--ms-bad) 12%, transparent)' }}>
          پس از ارسال گزارش، {faNum(suspicious.length)} مورد حذف یا کم‌اهمیت‌تر شده است. پیش از تأیید، دلیل را از بازدیدکننده بپرسید.
        </p>
      )}

      {confidential.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-extrabold"><Lock size={13} aria-hidden /> موارد محرمانهٔ بازدیدکننده ({faNum(confidential.length)})</p>
          <ul className="flex flex-col gap-1.5">
            {confidential.map((f) => (
              <li key={f.id} className="ms-card-flat p-2.5 text-[12px] leading-6">
                <b>{f.title}</b>
                {f.description && f.description !== f.title && !compact && <span className="ms-ink2 block whitespace-pre-line">{f.description}</span>}
              </li>
            ))}
          </ul>
          <p className="ms-muted mt-1 text-[11px]">این موارد در متن گزارش نمی‌آید.</p>
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-extrabold">سابقه تغییرات یافته‌ها</p>
          <ol className="flex flex-col gap-1.5">
            {log.slice(0, compact ? 5 : 40).map((a) => {
              const t = str(a.before, 'title') || str(a.after, 'title')
              return (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] leading-6" style={a.suspicious ? { color: 'var(--ms-bad)' } : undefined}>
                  <b>{OP_LABEL[a.op]}</b>
                  {a.reason && <span>({a.reason})</span>}
                  <span className="min-w-0 flex-1">«{t}»</span>
                  <span className="ms-muted">{a.actorName} · {shamsi(a.at)}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}
