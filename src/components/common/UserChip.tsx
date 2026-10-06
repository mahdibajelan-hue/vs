import { useState } from 'react'
import { UserCircle2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { ProfileModal } from '../Auth/ProfileModal'

/**
 * The signed-in user's photo and name, shown at the top of every page. Clicking it opens the profile
 * (details, photo, password and the sample signature printed under mission reports).
 */
export function UserChip({ className = '' }: { className?: string }) {
  const user = useAuthStore((s) => s.currentUser())
  const [open, setOpen] = useState(false)
  if (!user) return null
  const name = user.fullName || 'کاربر'
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="پروفایل و امضای من"
        aria-label={`پروفایل ${name}`}
        className={`flex min-w-0 items-center gap-2 rounded-full border border-white/10 py-1 pr-1 pl-2.5 transition-colors hover:bg-white/5 ${className}`}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white">
            <UserCircle2 size={16} />
          </span>
        )}
        <span className="hidden max-w-[9rem] truncate text-xs font-bold sm:block">{name}</span>
      </button>
      {open && <ProfileModal onClose={() => setOpen(false)} />}
    </>
  )
}
