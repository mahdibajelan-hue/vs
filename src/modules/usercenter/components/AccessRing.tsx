import { useAccessData, useUserAccess } from '../lib/useAccessModel'
import { moduleGrantCount } from '../lib/access'
import type { UcUser } from '../types'

/**
 * The module's signature: one ring, one segment per active module. A segment fills with the share of that module's ten
 * actions the user effectively holds; a closed module is drawn dashed in the restricted colour. Admins show full.
 */
export function AccessRing({ user, size = 132 }: { user: UcUser; size?: number }) {
  const { modules } = useAccessData()
  const { permCtx, blockedModules } = useUserAccess(user.id)
  const list = modules.filter((m) => m.isActive)
  const n = Math.max(list.length, 1)
  const cx = size / 2
  const r = size / 2 - 10
  const gap = 0.07
  const seg = (2 * Math.PI) / n
  const arc = (i: number, rr: number) => {
    const a0 = -Math.PI / 2 + i * seg + gap / 2
    const a1 = -Math.PI / 2 + (i + 1) * seg - gap / 2
    const x = (a: number) => cx + rr * Math.cos(a)
    const y = (a: number) => cx + rr * Math.sin(a)
    return `M ${x(a0)} ${y(a0)} A ${rr} ${rr} 0 0 1 ${x(a1)} ${y(a1)}`
  }
  const open = list.filter((m) => !blockedModules.has(m.key)).length
  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${open} ماژول از ${list.length} ماژول در دسترس است`}>
        {list.map((m, i) => {
          const blocked = blockedModules.has(m.key)
          const share = user.isAdmin ? 1 : moduleGrantCount(permCtx, m.key) / 10
          return (
            <g key={m.key}>
              <title>{`${m.labelFa} — ${blocked ? 'دسترسی بسته' : user.isAdmin ? 'دسترسی کامل' : `${Math.round(share * 10)} از ۱۰ مجوز`}`}</title>
              <path d={arc(i, r)} fill="none" stroke="var(--uc-line-2)" strokeWidth={9} strokeLinecap="round" opacity={0.55} />
              {blocked ? (
                <path d={arc(i, r)} fill="none" stroke="var(--uc-bad)" strokeWidth={4} strokeLinecap="round" strokeDasharray="2 5" />
              ) : share > 0 ? (
                <path className="uc-ring-seg" d={arc(i, r)} fill="none" stroke={user.isAdmin ? 'var(--uc-warn)' : 'var(--uc-accent)'} strokeWidth={9} strokeLinecap="round" opacity={0.3 + share * 0.7} />
              ) : null}
            </g>
          )
        })}
        <text x={cx} y={cx - 2} textAnchor="middle" fontSize={size * 0.24} fontWeight={700} fill="var(--uc-ink)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {open.toLocaleString('fa-IR')}
        </text>
        <text x={cx} y={cx + size * 0.12} textAnchor="middle" fontSize={size * 0.085} fill="var(--uc-muted)">
          از {list.length.toLocaleString('fa-IR')} ماژول
        </text>
      </svg>
    </figure>
  )
}
