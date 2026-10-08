import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, Ban, FolderKanban, KeyRound, LayoutGrid, MoreHorizontal, Pencil, Power, ScrollText, ShieldCheck, UserCog, UserRound } from 'lucide-react'
import { useAuthStore } from '../../../store/useAuthStore'
import { useUserCenterStore } from '../store/useUserCenterStore'
import { useAccessData, useUserAccess } from '../lib/useAccessModel'
import { ALL_ACTIONS, moduleGrantCount } from '../lib/access'
import { displayName, faNum, hueOf, relTime } from '../lib/format'
import { Avatar, Badge, EmptyState, Popover, StatusBadge, TypeBadge } from '../components/ui'
import { AccessRing } from '../components/AccessRing'
import { StatusDialog } from '../components/StatusDialog'
import { PasswordDialog } from '../components/PasswordDialog'
import { InfoTab } from '../tabs/InfoTab'
import { RolesTab } from '../tabs/RolesTab'
import { ProjectsTab } from '../tabs/ProjectsTab'
import { ModulesTab } from '../tabs/ModulesTab'
import { AccessTab } from '../tabs/AccessTab'
import { ActivityTab } from '../tabs/ActivityTab'
import type { AccountStatus } from '../types'

const COVERS = [
  'linear-gradient(120deg, #5b3df5, #9b4dff 55%, #ff5c9d)',
  'linear-gradient(120deg, #0ea5e9, #6a4cff 60%, #c84cf0)',
  'linear-gradient(120deg, #14b886, #2fa8ff 60%, #6a4cff)',
  'linear-gradient(120deg, #ff8a3d, #ff5c9d 55%, #c84cf0)',
  'linear-gradient(120deg, #ffb020, #ff6b81 60%, #9b4dff)',
  'linear-gradient(120deg, #22c6a8, #4f8cff 55%, #b44cf0)',
]

export type ProfileTab = 'info' | 'roles' | 'projects' | 'modules' | 'access' | 'activity'
const TABS: { id: ProfileTab; label: string; icon: typeof UserRound; color: string }[] = [
  { id: 'info', label: 'اطلاعات پایه', icon: UserRound, color: '#6a4cff' },
  { id: 'roles', label: 'نقش و نوع کاربر', icon: UserCog, color: '#c84cf0' },
  { id: 'projects', label: 'پروژه‌ها', icon: FolderKanban, color: '#2f9bff' },
  { id: 'modules', label: 'ماژول‌ها', icon: LayoutGrid, color: '#14b886' },
  { id: 'access', label: 'مدیریت دسترسی', icon: KeyRound, color: '#ff9d1a' },
  { id: 'activity', label: 'تاریخچه', icon: ScrollText, color: '#ff5a7a' },
]

export function UserProfilePage({ userId, tab, edit, onTab, onBack }: { userId: string; tab: ProfileTab; edit: boolean; onTab: (t: ProfileTab, edit?: boolean) => void; onBack: () => void }) {
  const user = useUserCenterStore((s) => s.users.find((u) => u.id === userId))
  const authInfoAvailable = useUserCenterStore((s) => s.authInfoAvailable)
  const loadAudit = useUserCenterStore((s) => s.loadAudit)
  const myId = useAuthStore((s) => s.profile?.id)
  const { modules } = useAccessData()
  const access = useUserAccess(userId)
  const [statusDialog, setStatusDialog] = useState<AccountStatus | null>(null)
  const [passwordDialog, setPasswordDialog] = useState(false)

  useEffect(() => { loadAudit(userId) }, [loadAudit, userId])

  const stats = useMemo(() => {
    const active = modules.filter((m) => m.isActive)
    const openModules = active.filter((m) => !access.blockedModules.has(m.key)).length
    const perms = active.reduce((n, m) => n + moduleGrantCount(access.permCtx, m.key), 0)
    return { openModules, totalModules: active.length, perms, permsMax: active.length * ALL_ACTIONS.length }
  }, [modules, access])

  if (!user) {
    return (
      <div className="uc-card mx-auto max-w-xl">
        <EmptyState icon={<UserRound size={20} />} title="کاربر پیدا نشد" text="ممکن است این حساب حذف شده باشد." action={<button className="uc-btn uc-btn-sm" onClick={onBack}>بازگشت به فهرست</button>} />
      </div>
    )
  }

  const flags: { tone: 'warn' | 'bad' | 'info'; text: string }[] = []
  if (!user.isAdmin && access.accessibleProjects === 0) flags.push({ tone: 'warn', text: 'به هیچ پروژه‌ای دسترسی ندارد' })
  if (authInfoAvailable && !user.lastSignInAt) flags.push({ tone: 'info', text: 'هنوز وارد سامانه نشده است' })
  if (!user.profileCompleted) flags.push({ tone: 'info', text: 'پروفایل را تکمیل نکرده است' })
  if (user.accountStatus !== 'active') flags.push({ tone: user.accountStatus === 'blocked' ? 'bad' : 'warn', text: user.statusReason ? `${user.accountStatus === 'blocked' ? 'مسدود' : 'غیرفعال'}: ${user.statusReason}` : user.accountStatus === 'blocked' ? 'حساب مسدود است' : 'حساب غیرفعال است' })

  const tabCount: Partial<Record<ProfileTab, number>> = { projects: access.accessibleProjects }

  return (
    <div className="uc-rise mx-auto flex w-full max-w-[1280px] flex-col gap-4">
      <button className="uc-btn uc-btn-ghost uc-btn-sm self-start" onClick={onBack}><ArrowRight size={14} /> همهٔ کاربران</button>

      {/* ------------------------------------------------------------------ 360 header */}
      <header className="uc-card overflow-hidden">
        <div className="uc-cover" style={{ '--g': COVERS[hueOf(user.id) % COVERS.length] } as CSSProperties} aria-hidden>
          <i style={{ width: 90, height: 90, insetInlineEnd: 40, top: -30 }} />
          <i style={{ width: 46, height: 46, insetInlineEnd: 190, top: 40, animationDelay: '-2s' }} />
          <i style={{ width: 66, height: 66, insetInlineStart: '38%', top: 26, animationDelay: '-4s' }} />
        </div>
        <div className="flex flex-wrap items-start gap-5 p-5 pt-0">
          <span className="uc-avatar-ring" style={{ marginTop: -38 }}><Avatar user={user} size={84} /></span>
          <div className="min-w-0 flex-1 pt-3" style={{ minWidth: 240 }}>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-[21px] font-bold leading-9">{displayName(user)}{user.id === myId && <span className="uc-eyebrow"> (شما)</span>}</h1>
              <StatusBadge status={user.accountStatus} />
              {user.isAdmin ? <Badge tone="warn"><ShieldCheck size={11} /> مدیر سیستم</Badge> : <TypeBadge type={user.userType} />}
            </div>
            <p className="mt-0.5 text-[13px]" style={{ color: 'var(--uc-ink-2)' }}>{[user.positionTitle, user.organization].filter(Boolean).join(' · ') || 'سمت و سازمان ثبت نشده'}</p>
            <p className="uc-eyebrow mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span dir="ltr">{user.email}</span>
              {user.phone && <span dir="ltr" className="uc-num">{user.phone}</span>}
              {authInfoAvailable && <span>آخرین ورود: {relTime(user.lastSignInAt)}</span>}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button className="uc-btn" onClick={() => onTab('info', true)}><Pencil size={14} /> ویرایش</button>
              <button className="uc-btn uc-btn-primary" onClick={() => onTab('access')}><KeyRound size={14} /> مدیریت دسترسی</button>
              <button className="uc-btn" onClick={() => setPasswordDialog(true)}><KeyRound size={14} style={{ opacity: 0.7 }} /> رمز عبور</button>
              {user.accountStatus === 'active' ? (
                <button className="uc-btn uc-btn-warn" onClick={() => setStatusDialog('disabled')}><Power size={14} /> غیرفعال‌سازی</button>
              ) : (
                <button className="uc-btn" style={{ color: 'var(--uc-ok)' }} onClick={() => setStatusDialog('active')}><Power size={14} /> فعال‌سازی</button>
              )}
              <Popover label="عملیات بیشتر" align="start" trigger={({ toggle }) => <button className="uc-btn uc-btn-icon" onClick={toggle} aria-label="عملیات بیشتر"><MoreHorizontal size={16} /></button>}>
                {(close) => (
                  <>
                    <button className="uc-pop-item" onClick={() => { close(); setStatusDialog(user.accountStatus === 'blocked' ? 'active' : 'blocked') }}><Ban size={14} style={{ color: 'var(--uc-bad)' }} /> {user.accountStatus === 'blocked' ? 'رفع مسدودیت' : 'مسدود کردن کاربر'}</button>
                    <button className="uc-pop-item" onClick={() => { close(); onTab('activity') }}><ScrollText size={14} /> مشاهدهٔ تاریخچه</button>
                  </>
                )}
              </Popover>
            </div>
          </div>

          <div className="flex items-center gap-5 pt-3 sm:ms-auto">
            <AccessRing user={user} size={124} />
            <dl className="m-0 grid gap-3">
              {[
                ['پروژه در دسترس', user.isAdmin ? 'همه' : faNum(access.accessibleProjects)],
                ['ماژول باز', `${faNum(stats.openModules)} از ${faNum(stats.totalModules)}`],
                ['مجوز مؤثر', `${faNum(stats.perms)} از ${faNum(stats.permsMax)}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="uc-eyebrow">{k}</dt>
                  <dd className="m-0 text-[15px] font-bold uc-num">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        {flags.length > 0 && (
          <div className="mx-5 mb-5 flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: 'var(--uc-line)' }}>
            {flags.map((f) => <Badge key={f.text} tone={f.tone}>{f.text}</Badge>)}
          </div>
        )}
      </header>

      {/* ------------------------------------------------------------------ tabs */}
      <div className="uc-tabs" role="tablist" aria-label="بخش‌های پروفایل">
        {TABS.map(({ id, label, icon: Icon, color }) => (
          <button key={id} role="tab" id={`uc-tab-${id}`} aria-selected={tab === id} aria-controls="uc-tabpanel" className="uc-tab" style={{ '--t': color } as CSSProperties} onClick={() => onTab(id)}>
            <span className="uc-tab-ico"><Icon size={14} /></span> {label}
            {tabCount[id] != null && <span className="uc-tab-count uc-num">{faNum(tabCount[id]!)}</span>}
          </button>
        ))}
      </div>

      <div id="uc-tabpanel" role="tabpanel" aria-labelledby={`uc-tab-${tab}`} key={tab} className="uc-rise">
        {tab === 'info' && <InfoTab user={user} editing={edit} setEditing={(v) => onTab('info', v)} onPassword={() => setPasswordDialog(true)} onStatus={() => setStatusDialog(user.accountStatus === 'active' ? 'disabled' : 'active')} />}
        {tab === 'roles' && <RolesTab user={user} />}
        {tab === 'projects' && <ProjectsTab user={user} />}
        {tab === 'modules' && <ModulesTab user={user} />}
        {tab === 'access' && <AccessTab user={user} />}
        {tab === 'activity' && <ActivityTab user={user} />}
      </div>

      {statusDialog && <StatusDialog user={user} initial={statusDialog} onClose={() => setStatusDialog(null)} />}
      {passwordDialog && <PasswordDialog user={user} onClose={() => setPasswordDialog(false)} />}
    </div>
  )
}
