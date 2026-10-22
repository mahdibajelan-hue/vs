import { useEffect, useState } from 'react'
import { History, Lock, LockOpen, PenLine, ShieldCheck, TriangleAlert } from 'lucide-react'
import { ModalPortal } from '../../../components/common/ModalPortal'
import { SignaturePad } from '../../../components/common/SignaturePad'
import { loadMySignature, saveMySignature } from '../../../lib/userSignature'
import { toJalali } from '../../../lib/jalali'
import { useAuthStore } from '../../../store/useAuthStore'
import { useSupervisionStore } from '../store/useSupervisionStore'
import { fa, faNum } from '../lib/svMonth'
import type { SvSignature, SvSignoffStatus, SvSignStep, SvSnapshot } from '../types'

export const STEPS: { step: SvSignStep; role: string; title: string; need: SvSignoffStatus }[] = [
  { step: 'prepared', role: 'تهیه‌کننده', title: 'سرپرست دستگاه نظارت', need: 'open' },
  { step: 'reviewed', role: 'بررسی‌کننده', title: 'نمایندهٔ کارفرما', need: 'prepared' },
  { step: 'approved', role: 'تأیید نهایی', title: 'مدیر پروژه', need: 'reviewed' },
]
const STATUS_FA: Record<SvSignoffStatus, string> = { open: 'در حال ثبت', prepared: 'تهیه و امضا شده', reviewed: 'بررسی و امضا شده', approved: 'تأیید نهایی شده' }
const SNAP_FA: Record<keyof SvSnapshot, string> = {
  people: 'نفرات', worked: 'نفر-روز کارکرد', required: 'روز موظف', shortfall: 'روز کسری', hours: 'ساعت کار', overtime: 'اضافه‌کار',
  breakfast: 'صبحانه', lunch: 'ناهار', dinner: 'شام', vehicleDays: 'روز-خودرو', vehicleHours: 'ساعت خودرو',
}

const when = (iso: string) => {
  const d = new Date(iso)
  const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate())
  return fa(`${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}، ساعت ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
}
/** Figures that differ between what was signed and what the report shows now. */
export function snapshotDiff(signed: Partial<SvSnapshot>, now: SvSnapshot) {
  return (Object.keys(SNAP_FA) as (keyof SvSnapshot)[]).filter((k) => signed[k] != null && Math.abs(Number(signed[k]) - now[k]) > 0.01).map((k) => ({ k, label: SNAP_FA[k], was: Number(signed[k]), now: now[k] }))
}

/**
 * تأیید و امضای ماهانه — three signatures under the report (prepared → reviewed → approved). The first signature locks the
 * month's attendance, vehicle days and guest meals; «بازگشت برای اصلاح» revokes every signature (with a reason) and unlocks it.
 */
export function SignoffPanel({ monthKey, from, to, snapshot, unmarked }: { monthKey: string; from: string; to: string; snapshot: SvSnapshot; unmarked: number }) {
  const loadSignatures = useSupervisionStore((s) => s.loadSignatures)
  const signoff = useSupervisionStore((s) => s.signoffs[monthKey])
  const all = useSupervisionStore((s) => s.signatures[monthKey])
  const reopen = useSupervisionStore((s) => s.reopen)
  const [signing, setSigning] = useState<SvSignStep | null>(null)
  const [reopening, setReopening] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { void loadSignatures(monthKey); setError(''); setReopening(false) }, [monthKey, loadSignatures])

  const status: SvSignoffStatus = signoff?.status ?? 'open'
  const active = (all ?? []).filter((x) => !x.revokedAt)
  const revoked = (all ?? []).filter((x) => x.revokedAt)
  const byStep = (st: SvSignStep) => active.filter((x) => x.step === st).at(-1)
  const next = STEPS.find((x) => x.need === status)
  const diff = active.length ? snapshotDiff(active[active.length - 1].snapshot, snapshot) : []

  const doReopen = async () => {
    setBusy(true); setError('')
    const r = await reopen(monthKey, reason)
    setBusy(false)
    if (!r.ok) { setError(r.error ?? ''); return }
    setReopening(false); setReason('')
  }

  return (
    <section className="sv-sign sv-print-keep" aria-label="تأیید و امضای ماهانه">
      <div className="sv-sign-head">
        <h3 className="sv-h3" style={{ margin: 0 }}><ShieldCheck size={16} /> تأیید و امضای گزارش</h3>
        <span className={`sv-sign-chip s-${status}`}>{status === 'open' ? <LockOpen size={13} /> : <Lock size={13} />}{STATUS_FA[status]}</span>
        {status !== 'open' && !reopening && <button className="im-btn im-btn-ghost im-btn-sm no-print" onClick={() => { setReopening(true); setError('') }}><LockOpen size={13} /> بازگشت برای اصلاح</button>}
      </div>
      {status !== 'open' && <p className="sv-note no-print" style={{ margin: 0 }}>روزهای این ماه قفل است: حضور، خودروها و وعده‌های مهمانان تا «بازگشت برای اصلاح» تغییر نمی‌کنند.</p>}
      {diff.length > 0 && (
        <div className="sv-sign-warn" role="alert"><TriangleAlert size={15} /><div><b>ارقام گزارش با آنچه امضا شده فرق دارد:</b> {diff.map((d) => `${d.label} ${faNum(d.was)} ← ${faNum(d.now)}`).join(' · ')}. پیش از امضای بعدی، گزارش را برای اصلاح برگردانید یا دوباره بررسی کنید.</div></div>
      )}
      {reopening && (
        <div className="im-card no-print" style={{ padding: 12, display: 'grid', gap: 8 }}>
          <div className="im-field" style={{ margin: 0 }}><label htmlFor="sv-reopen">دلیل بازگشت (همهٔ امضاهای این ماه باطل می‌شوند و در سابقه می‌مانند)</label>
          <textarea id="sv-reopen" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: ساعت ورود دو نفر در روز ۱۲ اشتباه ثبت شده است" /></div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="im-btn im-btn-ghost im-btn-sm" onClick={() => { setReopening(false); setReason('') }}>انصراف</button>
            <button className="im-btn im-btn-primary im-btn-sm" disabled={busy || reason.trim().length < 3} onClick={doReopen}>باطل کردن امضاها و باز کردن ماه</button>
          </div>
        </div>
      )}
      {error && <p className="im-helper" style={{ color: 'var(--im-coral)', fontWeight: 700, margin: 0 }} role="alert">{error}</p>}
      <div className="sv-sign-grid">
        {STEPS.map((x) => {
          const sig = byStep(x.step)
          return (
            <div key={x.step} className={`sv-sign-box ${sig ? 'done' : next?.step === x.step ? 'next' : ''}`}>
              <div className="sv-sign-role">{x.role}<small>{sig?.signerTitle || x.title}</small></div>
              {sig ? <SignedBody s={sig} /> : (
                <div className="sv-sign-empty">
                  {next?.step === x.step ? (
                    <button className="im-btn im-btn-primary im-btn-sm no-print" onClick={() => { setError(''); setSigning(x.step) }}><PenLine size={14} /> امضا</button>
                  ) : <span className="sv-note no-print">{status === 'open' || STEPS.findIndex((s) => s.step === x.step) > STEPS.findIndex((s) => s.need === status) ? 'در انتظار مرحلهٔ قبل' : ''}</span>}
                  <span className="sv-sign-line print-only">نام، تاریخ و امضا</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {revoked.length > 0 && (
        <details className="sv-sign-hist no-print">
          <summary><History size={13} /> سابقهٔ امضاهای باطل‌شده ({fa(revoked.length)})</summary>
          <ul>
            {revoked.map((r) => <li key={r.id}><b>{STEPS.find((s) => s.step === r.step)?.role}</b> — {r.signerName} · {when(r.signedAt)} · باطل در {when(r.revokedAt!)}{r.revokeReason && <> · دلیل: {r.revokeReason}</>}</li>)}
          </ul>
        </details>
      )}
      {signing && <SignModal step={signing} monthKey={monthKey} from={from} to={to} snapshot={snapshot} unmarked={unmarked} onClose={() => setSigning(null)} />}
    </section>
  )
}

function SignedBody({ s }: { s: SvSignature }) {
  return (
    <div className="sv-sign-body">
      <img src={s.image} alt={`امضای ${s.signerName}`} />
      <b>{s.signerName}</b>
      <span className="sv-note">{when(s.signedAt)}</span>
      {s.note && <p className="sv-sign-note">{s.note}</p>}
    </div>
  )
}

function SignModal({ step, monthKey, from, to, snapshot, unmarked, onClose }: { step: SvSignStep; monthKey: string; from: string; to: string; snapshot: SvSnapshot; unmarked: number; onClose: () => void }) {
  const sign = useSupervisionStore((s) => s.sign)
  const profile = useAuthStore((s) => s.profile)
  const meta = STEPS.find((x) => x.step === step)!
  const [saved, setSaved] = useState<string | null | undefined>(undefined)
  const [image, setImage] = useState<string | null>(null)
  const [keep, setKeep] = useState(true)
  const [title, setTitle] = useState(meta.title)
  const [note, setNote] = useState('')
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { void loadMySignature().then((x) => { setSaved(x); setImage(x) }) }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  const submit = async () => {
    if (!image) { setError('امضا را بکشید یا امضای ذخیره‌شده را انتخاب کنید.'); return }
    setBusy(true); setError('')
    if (keep && image !== saved) await saveMySignature(image).catch(() => undefined)
    const r = await sign({ month: monthKey, from, to, step, image, title, note, snapshot })
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'امضا ثبت نشد'); return }
    onClose()
  }

  return (
    <ModalPortal>
      <div className="sv-root" style={{ display: 'contents' }}>
        <div className="im-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
          <div className="im-modal" style={{ maxWidth: 520 }} role="dialog" aria-modal="true" aria-label={`امضای ${meta.role}`}>
            <div className="im-modal-head">
              <div className="im-modal-title">امضا به‌عنوان {meta.role}</div>
              <button className="im-modal-close" onClick={onClose} aria-label="بستن">✕</button>
            </div>
            <div style={{ display: 'grid', gap: 12, padding: '4px 2px' }}>
              <div className="sv-sign-sum">
                <span>{fa(snapshot.people)} نفر</span><span>کارکرد {fa(snapshot.worked)} / {fa(snapshot.required)}</span><span>اضافه‌کار {faNum(snapshot.overtime)} ساعت</span>
                <span>وعده‌ها {fa(snapshot.breakfast)} · {fa(snapshot.lunch)} · {fa(snapshot.dinner)}</span><span>{fa(snapshot.vehicleDays)} روز-خودرو</span>
              </div>
              {unmarked > 0 && step === 'prepared' && <p className="sv-sign-warn" style={{ margin: 0 }}><TriangleAlert size={15} /><span>{fa(unmarked)} روزِ گذشته هنوز ثبت نشده است. با امضا، ماه قفل می‌شود.</span></p>}
              <div>
                <div className="sv-sign-lbl">امضای {profile?.fullName || 'شما'}</div>
                {saved === undefined ? <p className="sv-note">در حال خواندن امضای ذخیره‌شده…</p> : (
                  <SignaturePad value={image} saveLabel="استفاده از این امضا" onSave={(png) => { setImage(png); setError('') }} />
                )}
                {saved !== undefined && image !== saved && image && (
                  <label className="sv-check"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> این امضا به‌عنوان امضای من در پروفایل ذخیره شود</label>
                )}
              </div>
              <div className="im-field" style={{ margin: 0 }}>
                <label htmlFor="sv-sign-title">سمت امضاکننده</label>
                <input id="sv-sign-title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="im-field" style={{ margin: 0 }}>
                <label htmlFor="sv-sign-note">یادداشت (اختیاری)</label>
                <textarea id="sv-sign-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: اضافه‌کار آقای … با هماهنگی کارفرما" />
              </div>
              <label className="sv-check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> ارقام این گزارش را بررسی کرده‌ام و درستی آن را تأیید می‌کنم.</label>
              {error && <p className="im-helper" style={{ color: 'var(--im-coral)', fontWeight: 700, margin: 0 }} role="alert">{error}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="im-btn im-btn-ghost" onClick={onClose}>انصراف</button>
                <button className="im-btn im-btn-primary" disabled={busy || !agree || !image} onClick={submit}><PenLine size={15} /> {busy ? 'در حال ثبت…' : 'امضا و ثبت'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
