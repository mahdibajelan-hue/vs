import { Home, LayoutDashboard } from 'lucide-react'
import { useModuleStore } from '../../store/useModuleStore'
import { UserChip } from './UserChip'
import { ThemeSwitch } from './ThemeSwitch'
import { ToolbarButton } from './ToolbarButton'
import { InboxButton } from '../../modules/inbox/components/InboxButton'
import { SearchButton } from '../search/GlobalSearch'
import { TOOLBAR_ACCENTS, ToolbarGuide } from './ToolbarGuide'

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
    <div className={`tb-bar relative flex shrink-0 items-center gap-1 ${className}`} role="toolbar" aria-label="میانبرهای سامانه">
      <UserChip />
      <InboxButton />
      <SearchButton />
      <ThemeSwitch />
      <ToolbarButton label="صفحهٔ اول این ماژول" caption="صفحهٔ اول" accent={TOOLBAR_ACCENTS.module} onClick={goModuleHome}>
        <LayoutDashboard size={16} />
      </ToolbarButton>
      <ToolbarButton label="خانه — صفحهٔ اصلی سامانه و همهٔ ماژول‌ها" caption="خانه" accent={TOOLBAR_ACCENTS.home} onClick={onExitToHub}>
        <Home size={16} />
      </ToolbarButton>
      <ToolbarGuide />
    </div>
  )
}
