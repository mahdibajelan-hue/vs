import { ChevronLeft, ChevronRight, ExternalLink, Lock, Users } from 'lucide-react'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { useDeepLinkStore } from '../../../store/useDeepLinkStore'
import { useModuleStore } from '../../../store/useModuleStore'
import type { ReactNode } from 'react'
import { fa, monthLabel, sameYm, shiftYm, thisMonth, type Ym } from '../lib/svMonth'

/** «‹ مهر ۱۴۰۵ ›» with a jump back to the running month. */
export function MonthNav({ value, onChange }: { value: Ym; onChange: (m: Ym) => void }) {
  return (
    <div className="sv-daybar">
      <button className="sv-iconbtn" onClick={() => onChange(shiftYm(value, -1))} aria-label="ماه قبل"><ChevronRight size={17} /></button>
      <b style={{ minWidth: 112, textAlign: 'center', fontSize: 15 }}>{monthLabel(value)}</b>
      <button className="sv-iconbtn" onClick={() => onChange(shiftYm(value, 1))} aria-label="ماه بعد"><ChevronLeft size={17} /></button>
      {!sameYm(value, thisMonth()) && <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => onChange(thisMonth())}>ماه جاری</button>}
    </div>
  )
}

/** Segmented choice whose selected button takes the option's colour (sv-c-<key>). */
export function StatusSeg<T extends string>({ value, options, labels, onChange, disabled, label }: { value: T | null; options: T[]; labels: Record<T, string>; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="sv-status" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled} className={`sv-c-${o} ${value === o ? 'on' : ''}`} onClick={() => onChange(o)}>{labels[o]}</button>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="im-card im-empty">{children}</div>
}

export function Flash({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return <p role="status" className="im-helper" style={{ margin: '8px 0 0', color: msg.ok ? 'var(--im-mint)' : 'var(--im-coral)', fontWeight: 700 }}>{msg.text}</p>
}

/** Months in [from, to] whose report is signed (their days are read-only). */
export function useLockedIn(from: string, to: string) {
  return useSupervisionStore((s) => Object.values(s.signoffs).filter((x) => x.status !== 'open' && x.from <= to && x.to >= from).map((x) => x.month).sort().map((k) => fa(monthLabel({ jy: +k.slice(0, 4), jm: +k.slice(5, 7) }))).join('، '))
}

export function LockNote({ months, onReport }: { months: string; onReport?: () => void }) {
  if (!months) return null
  return (
    <div className="sv-lock" role="status">
      <Lock size={15} />
      <span>گزارش {months} امضا شده و روزهایش قفل است؛ برای اصلاح باید در «گزارش ماه» آن را «بازگشت برای اصلاح» کنید.</span>
      {onReport && <button className="im-ghostlink" onClick={onReport}>رفتن به گزارش</button>}
    </div>
  )
}

/**
 * Supervisors are defined once, in master data (داده‌های پایه → پروژه → ساختار و تیم → نظارت کارگاهی), and copied here by
 * the database. This opens that page for the current project; master data is open to platform admins only.
 */
export function TeamLink({ compact = false }: { compact?: boolean }) {
  const projectId = useSupervisionStore((s) => s.projectId)
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const go = () => {
    if (!projectId) return
    useDeepLinkStore.getState().request({ module: 'admin', recordId: projectId })
    useModuleStore.getState().enterModule('admin')
  }
  return (
    <div className={compact ? 'sv-teamlink compact' : 'im-card sv-teamlink'}>
      <Users size={18} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>ناظران در داده‌های پایه تعریف می‌شوند</b>
        <p className="sv-note" style={{ margin: '2px 0 0' }}>نام، سمت، ساعت کاری، سقف اضافه‌کار، کد ملی، کارت ساعت، حساب کاربری و سرپرست نظارت هر نفر در «مدیریت کاربران ← داده‌های پایه ← پروژه ← ساختار و تیم ← نظارت کارگاهی» ثبت می‌شود و خودکار به این‌جا می‌آید.{!isAdmin && ' این صفحه فقط برای مدیر سامانه باز است؛ تغییرات را از او بخواهید.'}</p>
      </div>
      {isAdmin && <button className="im-btn im-btn-primary im-btn-sm" onClick={go} disabled={!projectId}><ExternalLink size={14} /> تغییر ناظران در داده‌های پایه</button>}
    </div>
  )
}
