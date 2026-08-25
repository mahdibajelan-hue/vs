import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Bell, KeyRound, Loader2, Search, Settings, UserCircle2 } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { SignOutButton } from '../SignOutButton'

function IconButton({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <button
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-white/5 hover:text-current"
    >
      <Icon size={16} />
    </button>
  )
}

type Status = 'idle' | 'submitting' | 'error'

/** Compact inline sign-in — no separate login screen. Submitting here is what unlocks the
 * module cards below (see ModuleLaunchpad's `locked = !isAuthed`); success needs no navigation
 * or transition, isAuthed just flips and the rest of the page reacts. */
function InlineLoginForm() {
  const signIn = useAuthStore((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  const submit = async () => {
    if (status === 'submitting') return
    setError('')
    if (!email.trim() || !password) {
      setError('ایمیل و رمز عبور را وارد کنید')
      setStatus('error')
      return
    }
    setStatus('submitting')
    const res = await signIn(email.trim(), password)
    if (!res.ok) {
      setError(res.error ?? 'ورود ناموفق بود')
      setStatus('error')
    }
    // On success isAuthed flips via the store and this form unmounts on its own.
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={status === 'submitting'}
          placeholder="ایمیل"
          dir="ltr"
          className="input h-9 w-32 !py-0 text-xs sm:w-40"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={status === 'submitting'}
          placeholder="رمز عبور"
          dir="ltr"
          className="input h-9 w-28 !py-0 text-xs"
        />
        <button
          onClick={submit}
          disabled={status === 'submitting'}
          title="ورود"
          aria-label="ورود"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white transition-colors hover:bg-brand-400 disabled:opacity-60"
        >
          {status === 'submitting' ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
        </button>
      </div>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  )
}

export function Header() {
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const currentUser = useAuthStore((s) => s.currentUser())
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <header
      className="launchpad-header hub-fade-in relative z-20 flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4 sm:px-10"
      style={{ borderColor: 'var(--border-soft)', animationDelay: '0ms' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
          style={{ borderColor: 'color-mix(in srgb, var(--radar-green) 40%, transparent)', background: 'color-mix(in srgb, var(--radar-green) 10%, transparent)' }}
        >
          <span className="rasta-wordmark text-base" style={{ fontWeight: 800 }}>
            R
          </span>
        </div>
        <div className="leading-tight">
          <p className="text-base font-extrabold tracking-wide sm:text-lg" dir="ltr">
            PROJECT CONTROL CENTER
          </p>
          <p className="eyebrow-en mt-0.5" dir="ltr">
            Enterprise Project Intelligence Platform
          </p>
        </div>
      </div>

      {!isAuthed ? (
        <InlineLoginForm />
      ) : (
        <div className="flex items-center gap-1 sm:gap-2">
          <span
            className="mr-1 hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-bold tracking-wide sm:flex"
            style={{ borderColor: 'color-mix(in srgb, var(--radar-green) 35%, transparent)', color: 'var(--radar-green)', background: 'color-mix(in srgb, var(--radar-green) 8%, transparent)' }}
            dir="ltr"
          >
            <span className="radar-live-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--radar-green)' }} />
            SYSTEM ONLINE
          </span>

          <IconButton icon={Search} label="جستجو" />
          <IconButton icon={Bell} label="اعلان‌ها" />
          <IconButton icon={Settings} label="تنظیمات" />

          <div className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg py-1 pr-1 pl-2 hover:bg-white/5 transition-colors"
            >
              {currentUser?.avatarUrl ? (
                <img src={currentUser.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white">
                  <UserCircle2 size={17} />
                </div>
              )}
            </button>

            {profileOpen && (
              <>
                <button className="fixed inset-0 z-30 cursor-default" aria-hidden="true" onClick={() => setProfileOpen(false)} />
                <div
                  className="hub-fade-in absolute left-0 top-full z-40 mt-2 w-56 rounded-xl border p-3 text-right"
                  style={{ borderColor: 'var(--border-soft)', background: 'var(--bg-panel-solid)', animationDuration: '0.18s' }}
                >
                  <p className="truncate text-sm font-bold">{currentUser?.fullName || 'کاربر'}</p>
                  <p className="truncate text-[11px] text-muted" dir="ltr">
                    {currentUser?.email}
                  </p>
                  <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border-soft)' }}>
                    <SignOutButton className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-400/25 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 transition-colors" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
