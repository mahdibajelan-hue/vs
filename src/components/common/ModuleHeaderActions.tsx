import { Home, LayoutDashboard, LogOut, Radar, UserCog } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useModuleStore } from '../../store/useModuleStore'
import { ProfileModal } from '../Auth/ProfileModal'
import { UserChip } from './UserChip'
import { ThemeSwitch } from './ThemeSwitch'
import { NotificationBell } from './NotificationBell'
import { ToolbarButton } from './ToolbarButton'

interface ModuleHeaderActionsProps {
  onExitToHub: () => void
  /** Omit for a module (e.g. Competency) that has no "Project Radar" concept to return to. */
  onBackToRadar?: () => void
  className?: string
}

/**
 * THE shortcut bar of the whole system. Same buttons, same order, same look in every module:
 *   [photo + name]  [alerts]  [light/dark]  [module first page]  [home / launchpad]  [dashboard]  [my settings]  [sign out]
 * Alerts = system messages and things waiting for the user's action. «صفحهٔ اول ماژول» restarts the current module at its first page.
 */
export function ModuleHeaderActions({ onExitToHub, onBackToRadar, className = '' }: ModuleHeaderActionsProps) {
  const goModuleHome = useModuleStore((s) => s.goModuleHome)
  const signOut = useAuthStore((s) => s.signOut)
  const [profile, setProfile] = useState(false)
  return (
    <div className={`flex shrink-0 items-center gap-1.5 ${className}`} role="toolbar" aria-label="میانبرهای سامانه">
      <UserChip />
      <NotificationBell />
      <ThemeSwitch />
      <ToolbarButton label="صفحهٔ اول این ماژول" onClick={goModuleHome}>
        <LayoutDashboard size={16} />
      </ToolbarButton>
      <ToolbarButton label="خانه (صفحهٔ اول سامانه)" onClick={onExitToHub}>
        <Home size={16} />
      </ToolbarButton>
      {onBackToRadar && (
        <ToolbarButton label="داشبورد پروژه‌ها (رادار)" onClick={onBackToRadar}>
          <Radar size={16} />
        </ToolbarButton>
      )}
      <ToolbarButton label="تنظیمات کاربری من" onClick={() => setProfile(true)}>
        <UserCog size={16} />
      </ToolbarButton>
      <ToolbarButton label="خروج از حساب" tone="danger" onClick={() => signOut()}>
        <LogOut size={16} />
      </ToolbarButton>
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
    </div>
  )
}
