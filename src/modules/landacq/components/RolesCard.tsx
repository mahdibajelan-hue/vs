import { useEffect } from 'react'
import { Users } from 'lucide-react'
import type { LandRole } from '../types'
import { useLandStore } from '../store/useLandStore'
import { ROLE_HINT, ROLE_LABEL } from '../lib/approval'
import { faNum } from '../lib/fa'
import { Card } from './ui'

const NONE: never[] = []
const ROLES = Object.keys(ROLE_LABEL) as LandRole[]

/** Who plays which part in this project: the contractor enters, the consultant approves, employer legal attests, the project manager signs off. */
export function RolesCard() {
  const rolesRaw = useLandStore((s) => s.data?.roles)
  const roles = rolesRaw ?? NONE
  const myRole = useLandStore((s) => s.data?.myRole ?? null)
  const people = useLandStore((s) => s.people)
  const loadPeople = useLandStore((s) => s.loadPeople)
  const setRole = useLandStore((s) => s.setRole)
  useEffect(() => { void loadPeople() }, [loadPeople])
  const canAssign = people.length > 0
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'کاربر'
  return (
    <Card title="نقش‌های پروژه و زنجیرهٔ تأیید" hint="ورود اطلاعات با پیمانکار، بررسی و تأیید با مشاور، صحه‌گذاری با حقوقی کارفرما، تأیید نهایی با مدیر پروژه (مجری طرح هم می‌تواند تأیید نهایی کند)">
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {ROLES.map((r, i) => {
          const holders = roles.filter((x) => x.role === r)
          return (
            <li key={r} className="la-card-flat flex items-start gap-3 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: 'var(--la-accent-soft)', color: 'var(--la-accent)' }}>{r === 'executive' ? '★' : faNum(i + 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px] font-bold">{ROLE_LABEL[r]}{myRole === r && <span className="la-eyebrow font-normal"> · شما</span>}</p>
                <p className="la-eyebrow m-0 leading-6">{ROLE_HINT[r]}</p>
                {holders.length > 0 && <p className="m-0 mt-1 text-[12px]">{holders.map((h) => nameOf(h.userId)).join('، ')}</p>}
              </div>
            </li>
          )
        })}
      </ol>
      {canAssign ? (
        <div className="mt-4">
          <p className="la-title m-0 flex items-center gap-2"><Users size={15} /> تعیین نقش کاربران در این پروژه</p>
          <ul className="m-0 mt-2 flex max-h-72 list-none flex-col gap-1.5 overflow-y-auto p-0">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[12.5px]">{p.name}{p.position && <span className="la-eyebrow"> · {p.position}</span>}</span>
                <select className="la-select" style={{ width: 190 }} value={roles.find((x) => x.userId === p.id)?.role ?? ''} onChange={(e) => void setRole(p.id, (e.target.value || null) as LandRole | null)} aria-label={`نقش ${p.name}`}>
                  <option value="">بدون نقش</option>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <p className="la-hint">کاربر بدون نقش مثل قبل با مجوز ماژول کار می‌کند؛ با نقش پیمانکار فقط تا پیش از ارسال برای بررسی می‌تواند اطلاعات را ویرایش کند.</p>
        </div>
      ) : (
        <p className="la-hint">تعیین نقش کاربران را مدیر سامانه یا کاربر دارای مجوز «تنظیمات» انجام می‌دهد.</p>
      )}
    </Card>
  )
}
