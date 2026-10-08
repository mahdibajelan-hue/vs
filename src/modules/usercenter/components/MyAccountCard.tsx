import { useEffect, useState } from 'react'
import { KeyRound, Loader2, PenLine } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { SignaturePad } from '../../../components/common/SignaturePad'
import { loadMySignature, saveMySignature } from '../../../lib/userSignature'
import { Field, Section, useToast } from './ui'

/** Only on the signed-in user's own profile: change my password and define my sample signature (printed under my mission reports). */
export function MyAccountCard() {
  const updatePassword = useAuthStore((s) => s.updatePassword)
  const notify = useToast()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busyPw, setBusyPw] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busySig, setBusySig] = useState(false)

  useEffect(() => {
    loadMySignature().then((s) => { setSignature(s); setLoaded(true) })
  }, [])

  const pwError = pw && pw.length < 6 ? 'رمز عبور باید حداقل ۶ کاراکتر باشد' : pw2 && pw !== pw2 ? 'رمز عبور و تکرار آن یکسان نیستند' : ''
  const submitPw = async () => {
    setBusyPw(true)
    const res = await updatePassword(pw)
    setBusyPw(false)
    if (!res.ok) return notify(res.error ?? 'تغییر رمز انجام نشد', 'bad')
    setPw(''); setPw2('')
    notify('رمز عبور تغییر کرد')
  }
  const saveSig = async (png: string) => {
    setBusySig(true)
    try { await saveMySignature(png); setSignature(png); notify('امضای نمونه ذخیره شد') } catch (e) { notify(e instanceof Error ? e.message : 'ثبت امضا انجام نشد', 'bad') }
    setBusySig(false)
  }

  return (
    <>
      <Section title="تغییر رمز عبور من" hint="رمز جدید از همین لحظه برای ورود شما معتبر است">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="رمز عبور جدید"><input className="uc-input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} dir="ltr" /></Field>
          <Field label="تکرار رمز عبور" error={pwError}><input className="uc-input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} dir="ltr" /></Field>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="uc-btn uc-btn-primary" disabled={busyPw || pw.length < 6 || pw !== pw2} onClick={submitPw}><KeyRound size={14} /> {busyPw ? 'در حال ذخیره…' : 'تغییر رمز عبور'}</button>
        </div>
      </Section>
      <Section title="امضای نمونه من" hint="پای گزارش‌های مأموریتی که ارسال می‌کنید درج می‌شود؛ فقط خودتان آن را می‌بینید و تغییر می‌دهید">
        {loaded ? <SignaturePad value={signature} onSave={saveSig} saving={busySig} /> : <Loader2 size={16} className="animate-spin" style={{ color: 'var(--uc-muted)' }} />}
        {!signature && loaded && <p className="uc-eyebrow mt-2 flex items-center gap-1.5"><PenLine size={12} /> بدون امضای ثبت‌شده، ارسال گزارش مأموریت ممکن نیست.</p>}
      </Section>
    </>
  )
}
