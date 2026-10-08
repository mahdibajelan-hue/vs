import { Home, LayoutDashboard } from 'lucide-react'
import { useModuleStore } from '../../store/useModuleStore'
import { UserChip } from './UserChip'
import { ThemeSwitch } from './ThemeSwitch'
import { NotificationBell } from './NotificationBell'
import { ToolbarButton } from './ToolbarButton'

interface ModuleHeaderActionsProps {
  onExitToHub: () => void
  /** Kept for call-site compatibility; the radar shortcut is no longer part of the bar. */
  onBackToRadar?: () => void
  className?: string
}

/**
 * THE shortcut bar of the whole system. Same buttons, same order, same look in every module:
 *   [photo + name ▾ (my profile · sign out)]  [alerts]  [light/dark]  [module first page]  [home / launchpad]
 * Alerts = system messages and things waiting for the user's action. «صفحهٔ اول ماژول» restarts the current module at its first page.
 */
export function ModuleHeaderActions({ onExitToHub, className = '' }: ModuleHeaderActionsProps) {
  const goModuleHome = useModuleStore((s) => s.goModuleHome)
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
    </div>
  )
}
