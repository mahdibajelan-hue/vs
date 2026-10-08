import { useEffect, useMemo, useState } from 'react'
import { Ban, Clock, UserCheck, FolderKanban, Globe2, KeyRound, LayoutGrid, Pencil, Power, ShieldCheck, UserCog, UserPlus, type LucideIcon } from 'lucide-react'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData } from '../lib/useAccessModel'
import { describeAudit, type AuditLookups, type AuditView } from '../lib/audit'
import { dayLabel, displayName, faNum, fmtDateTime, fmtTime } from '../lib/format'
import type { AuditEntry, UcUser } from '../types'
import { useAccessStore } from '../../masterdata/store/useAccessStore'
import { Badge, EmptyState, Segmented } from '../components/ui'

const ICON: Record<AuditView['icon'], LucideIcon> = { user: UserPlus, edit: Pencil, power: Power, shield: ShieldCheck, role: UserCog, module: LayoutGrid, scope: Globe2, permission: Ban, project: FolderKanban, key: KeyRound }
const TONE_VAR: Record<AuditView['tone'], string> = { ok: 'var(--uc-ok)', warn: 'var(--uc-warn)', bad: 'var(--uc-bad)', info: 'var(--uc-inherit)', direct: 'var(--uc-direct)', accent: 'var(--uc-accent)', neutral: 'var(--uc-muted)' }

type Group = 'all' | 'info' | 'access'
const GROUP_OF = (e: AuditEntry): Group => (['account', 'profile', 'status', 'admin'].includes(e.category) ? 'info' : 'access')

export function useAuditLookups(): AuditLookups {
  const { modules, roles, permissions, portfolios, programs, masterProjects, products } = useAccessData()
  const projectRoles = useAccessStore((s) => s.projectRoles)
  const users = useUserCenterStore((s) => s.users)
  return useMemo(
    () => ({
      userName: (id) => { const u = users.find((x) => x.id === id); return id === null ? 'سیستم' : u ? displayName(u) : 'کاربر حذف‌شده' },
      projectName: (product, id) => products.find((p) => p.product === product && p.id === id)?.name ?? 'پروژهٔ نامشخص',
      masterProjectName: (id) => { const p = masterProjects.find((x) => x.id === id); return p ? p.shortName || p.officialName : 'پروژهٔ نامشخص' },
      roleName: (id) => roles.find((r) => r.id === id)?.name ?? 'نقش حذف‌شده',
      moduleLabel: (key) => modules.find((m) => m.key === key)?.labelFa ?? key,
      permission: (id) => { const p = permissions.find((x) => x.id === id); return p ? { moduleKey: p.moduleKey, action: p.action } : null },
      portfolioName: (id) => portfolios.find((p) => p.id === id)?.name ?? '—',
      programName: (id) => programs.find((p) => p.id === id)?.name ?? '—',
      projectRoleName: (id) => projectRoles.find((r) => r.id === id)?.name ?? '—',
    }),
    [users, modules, roles, permissions, portfolios, programs, masterProjects, products, projectRoles],
  )
}

export function ActivityTab({ user }: { user: UcUser }) {
  const entries = useUserCenterStore((s) => s.audit[user.id])
  const loadAudit = useUserCenterStore((s) => s.loadAudit)
  const L = useAuditLookups()
  const [group, setGroup] = useState<Group>('all')
  useEffect(() => { loadAudit(user.id) }, [loadAudit, user.id])

  const shown = useMemo(() => (entries ?? []).filter((e) => group === 'all' || GROUP_OF(e) === group), [entries, group])
  const days = useMemo(() => {
    const map = new Map<string, AuditEntry[]>()
    for (const e of shown) { const k = dayLabel(e.at); map.set(k, [...(map.get(k) ?? []), e]) }
    return [...map.entries()]
  }, [shown])

  return (
    <section className="uc-card">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h3 className="uc-section-title">تاریخچهٔ تغییرات</h3>
          <p className="uc-eyebrow mt-0.5">چه کسی، چه زمانی، چه چیزی را در اطلاعات یا دسترسی‌های این کاربر تغییر داده است.</p>
        </div>
        <Segmented<Group> label="نوع تغییر" value={group} onChange={setGroup} options={[{ value: 'all', label: 'همه' }, { value: 'info', label: 'اطلاعات و حساب' }, { value: 'access', label: 'دسترسی‌ها' }]} />
      </header>
      <div className="px-5 pb-5">
        {!entries ? (
          <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <div key={i} className="uc-skeleton h-14" />)}</div>
        ) : shown.length === 0 ? (
          <EmptyState icon={<Clock size={20} />} title="هنوز تغییری ثبت نشده" text="از این پس هر تغییر در اطلاعات یا دسترسی‌های کاربر اینجا ثبت می‌شود." />
        ) : (
          days.map(([day, list]) => (
            <div key={day} className="mb-2">
              <p className="uc-eyebrow mb-3 mt-1 font-semibold">{day}</p>
              <ol className="uc-tl">
                {list.map((e) => {
                  const v = describeAudit(e, L)
                  const Icon = v.icon === 'permission' && v.tone !== 'bad' ? UserCheck : ICON[v.icon]
                  return (
                    <li key={e.id}>
                      <span className="uc-tl-dot" style={{ '--c': TONE_VAR[v.tone] } as React.CSSProperties}><Icon size={14} /></span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-[13px] font-semibold leading-7">{v.title}</p>
                        {v.lines.map((l, i) => <p key={i} className="uc-eyebrow leading-6">{l}</p>)}
                        <p className="uc-eyebrow mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5" title={fmtDateTime(e.at)}>
                          <span>توسط <b style={{ color: 'var(--uc-ink-2)' }}>{L.userName(e.actorId)}</b></span>
                          <span aria-hidden>·</span>
                          <span className="uc-num">{fmtTime(e.at)}</span>
                          {e.actorId === null && <Badge>خودکار</Badge>}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))
        )}
        {entries && entries.length > 0 && <p className="uc-eyebrow mt-2">{faNum(entries.length)} رویداد ثبت شده است.</p>}
      </div>
    </section>
  )
}
