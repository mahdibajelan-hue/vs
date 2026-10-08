import { useEffect, useRef, useState } from 'react'
import { LogOut, UserCircle2, UserCog } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { ProfileModal } from '../Auth/ProfileModal'

/**
 * The signed-in user as every page shows them: just a photo and a name. Opening it offers exactly two things:
 * edit my details (photo, name, password, sample signature) and sign out.
 */
export function UserChip({ className = '' }: { className?: string }) {
  const user = useAuthStore((s) => s.currentUser())
  const signOut = useAuthStore((s) => s.signOut)
  const [menu, setMenu] = useState(false)
  const [profile, setProfile] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const off = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', off)
    return () => {
      document.removeEventListener('pointerdown', off)
      document.removeEventListener('keydown', off)
    }
  }, [menu])
  if (!user) return null
  const name = user.fullName || 'کاربر'
  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setMenu((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menu}
          title={name}
          className={`flex min-w-0 items-center gap-2 rounded-full border py-1 pr-1 pl-2.5 transition-colors hover:bg-white/5 ${className}`}
          style={{ borderColor: 'var(--border-soft)' }}
        >
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full bg-white object-cover" />
          ) : (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white">
              <UserCircle2 size={16} />
            </span>
          )}
          <span className="hidden max-w-[9rem] truncate text-xs font-bold sm:block">{name}</span>
        </button>
        {menu && (
          <div className="tb-pop" style={{ width: 230 }} role="menu" dir="rtl">
            <div className="flex items-center gap-2.5 border-b px-3.5 py-3" style={{ borderColor: 'var(--border-soft)' }}>
              {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-10 w-10 rounded-full bg-white object-cover" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white"><UserCircle2 size={20} /></span>}
              <div className="min-w-0">
                <p className="m-0 truncate text-[13px] font-bold">{name}</p>
                <p className="m-0 truncate text-[10.5px]" dir="ltr" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{user.email}</p>
              </div>
            </div>
            <div className="p-1.5">
              <button role="menuitem" className="tb-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-[12.5px] font-medium" onClick={() => { setMenu(false); setProfile(true) }}>
                <UserCog size={15} aria-hidden /> مشخصات و پروفایل من
              </button>
              <button role="menuitem" className="tb-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-right text-[12.5px] font-medium" style={{ color: '#f87171' }} onClick={() => signOut()}>
                <LogOut size={15} aria-hidden /> خروج از حساب
              </button>
            </div>
          </div>
        )}
      </div>
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
    </>
  )
}
