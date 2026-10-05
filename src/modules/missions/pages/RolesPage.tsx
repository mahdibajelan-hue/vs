import { useEffect } from 'react'
import { ClipboardCheck, Plane, UserRound } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import { Avatar, Card, SectionHead } from '../components/ui'
import type { MissionRole } from '../repo/types'

const ROLE_INFO: { role: MissionRole; label: string; icon: typeof Plane; text: string }[] = [
  { role: 'executive', label: 'مجری طرح', icon: ClipboardCheck, text: 'درخواست مأموریت را تأیید اولیه می‌کند و پس از بازگشت، گزارش بازدید را تأیید یا برای اصلاح برمی‌گرداند. Issue/Risk پیشنهادی را هم او به سامانه‌های اصلی منتقل می‌کند.' },
  { role: 'admin_affairs', label: 'امور اداری', icon: Plane, text: 'پس از تأیید مجری طرح، بلیط هواپیما را رزرو و مشخصات آن را ثبت می‌کند. پس از تأیید گزارش توسط مجری طرح، کلیم مأموریت را تأیید می‌کند.' },
]

/** System-admin page: who is the project executive and who is Administrative Affairs. Everyone else is an employee. */
export function RolesPage() {
  const people = useMissionStore((s) => s.people)
  const roles = useMissionStore((s) => s.roles)
  const user = useMissionStore((s) => s.user)
  const loadRoles = useMissionStore((s) => s.loadRoles)
  const toggleRole = useMissionStore((s) => s.toggleRole)

  useEffect(() => {
    loadRoles()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const has = (userId: string, role: MissionRole) => roles.some((r) => r.userId === userId && r.role === role)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <p className="ms-eyebrow mb-1">نقش‌ها</p>
        <h1 className="text-[22px] font-black leading-9">نقش‌های گردش کار مأموریت</h1>
        <p className="ms-ink2 text-[12.5px] leading-7">سه نقش وجود دارد. هر کاربری که نقش دیگری نداشته باشد «کارمند» است و می‌تواند مأموریت درخواست دهد و گزارش بازدید ثبت کند.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="ms-card-flat p-3.5"><p className="flex items-center gap-2 text-[12.5px] font-extrabold"><UserRound size={15} aria-hidden /> کارمند</p><p className="ms-ink2 mt-1 text-[12px] leading-7">درخواست مأموریت می‌دهد؛ پس از بازگشت، گزارش بازدید را با گفت‌وگو ثبت می‌کند.</p></div>
        {ROLE_INFO.map((r) => (
          <div key={r.role} className="ms-card-flat p-3.5"><p className="flex items-center gap-2 text-[12.5px] font-extrabold" style={{ color: 'var(--ms-accent)' }}><r.icon size={15} aria-hidden /> {r.label}</p><p className="ms-ink2 mt-1 text-[12px] leading-7">{r.text}</p></div>
        ))}
      </div>

      <Card className="p-4">
        <SectionHead eyebrow="کاربران" title="تعیین نقش" sub="مدیر سامانه همیشه همه نقش‌ها را دارد." />
        <ul className="flex flex-col gap-2">
          {people.map((p) => (
            <li key={p.id} className="ms-card-flat flex flex-wrap items-center gap-3 p-3">
              <Avatar name={p.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold">{p.name}{p.id === user?.id ? ' (شما)' : ''}</span>
                <span className="ms-muted block truncate text-[11px]">{p.position || '—'}</span>
              </span>
              <span className="flex gap-1.5" role="group" aria-label={`نقش‌های ${p.name}`}>
                {ROLE_INFO.map((r) => (
                  <button key={r.role} className={`ms-chip ${has(p.id, r.role) ? 'is-on' : ''}`} aria-pressed={has(p.id, r.role)} onClick={() => toggleRole(p.id, r.role, !has(p.id, r.role))}>
                    <r.icon size={12} aria-hidden /> {r.label}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
