import { Home, LayoutDashboard } from 'lucide-react'
import { useModuleStore } from '../../store/useModuleStore'
import { UserChip } from './UserChip'
import { ThemeSwitch } from './ThemeSwitch'
import { ToolbarButton } from './ToolbarButton'
import { InboxButton } from '../../modules/inbox/components/InboxButton'
import { SearchButton } from '../search/GlobalSearch'

interface ModuleHeaderActionsProps {
  onExitToHub: () => void
  /** Kept for call-site compatibility; the radar shortcut is no longer part of the bar. */
  onBackToRadar?: () => void
  className?: string
}

/**
 * THE shortcut bar of the whole system. Same buttons, same order, same look in every module:
 *   [photo + name ▾ (my profile · sign out)]  [my inbox — work + alerts]  [search]  [light/dark]  [module first page]  [home / launchpad]
 * My inbox = everything waiting for the user, plus the system alerts (the former bell). «صفحهٔ اول ماژول» restarts the current module at its first page.
 */
export function ModuleHeaderActions({ onExitToHub, className = '' }: ModuleHeaderActionsProps) {
  const goModuleHome = useModuleStore((s) => s.goModuleHome)
  return (
    <div className={`flex shrink-0 items-center gap-1.5 ${className}`} role="toolbar" aria-label="میانبرهای سامانه">
      <UserChip />
      <InboxButton />
      <SearchButton />
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
