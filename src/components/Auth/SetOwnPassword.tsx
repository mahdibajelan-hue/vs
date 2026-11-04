import { useState } from 'react'
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuthStore } from '../../store/useAuthStore'

/** true when the admin asked this account to choose its own password (initial password, invite or one-time sign-in link) */
export const mustSetPassword = (meta: Record<string, unknown> | undefined | null) => meta?.must_change_password === true

/**
 * The first sign-in of an account an admin made (or a one-time sign-in link): the person chooses a password of their own
 * before anything else. Clearing the flag in the user's metadata ends it; the session refreshes and the app carries on.
 */
export function SetOwnPassword() {
  const email = useAuthStore((s) => s.session?.user.email ?? '')
  const signOut = useAuthStore((s) => s.signOut)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const err = pw && pw.length < 8 ? 'رمز عبور باید حداقل ۸ کاراکتر باشد' : pw2 && pw !== pw2 ? 'تکرار رمز با رمز یکسان نیست' : ''

  const submit = async () => {
    if (pw.length < 8 || pw !== pw2) { setError(err || 'رمز عبور را وارد کنید'); return }
    setBusy(true); setError('')
    const { error: e } = await supabase.auth.updateUser({ password: pw, data: { must_change_password: false } })
    setBusy(false)
    if (e) setError(/same|different from the old/i.test(e.message) ? 'رمز تازه باید با رمز قبلی متفاوت باشد' : /weak|short/i.test(e.message) ? 'این رمز ساده است؛ رمز قوی‌تری انتخاب کنید' : 'ثبت رمز انجام نشد — دوباره تلاش کنید')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-white/10 p-3">
        <KeyRound size={18} className="mt-1 shrink-0 text-brand-400" aria-hidden />
        <p className="text-xs leading-6 text-secondary">برای حساب <b dir="ltr">{email}</b> یک رمز عبور شخصی انتخاب کنید. از این پس با همین ایمیل و رمز وارد سامانه می‌شوید و هیچ‌کس جز شما رمز را نمی‌داند.</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-secondary">رمز عبور تازه</span>
        <div className="relative">
          <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} className="input" dir="ltr" autoComplete="new-password" autoFocus placeholder="حداقل ۸ کاراکتر" style={{ paddingLeft: 40 }} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'پنهان کردن رمز' : 'نمایش رمز'} className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-muted">{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </div>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-secondary">تکرار رمز عبور</span>
        <input type={show ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} className="input" dir="ltr" autoComplete="new-password" onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
      </label>
      {(error || err) && <p className="text-xs text-red-400">{error || err}</p>}
      <button type="button" onClick={() => void submit()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-50 transition-colors">
        {busy && <Loader2 size={14} className="animate-spin" />} ثبت رمز و ادامه
      </button>
      <button type="button" onClick={() => void signOut()} className="w-full text-center text-xs text-muted underline-offset-4 hover:underline">خروج از حساب</button>
    </div>
  )
}
