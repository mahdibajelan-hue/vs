import { CircleHelp, Home, LayoutDashboard, Radar } from 'lucide-react'
import { PROJECT_SCOPED_MODULES, useModuleStore } from '../../store/useModuleStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { UserChip } from './UserChip'
import { ThemeSwitch } from './ThemeSwitch'
import { ToolbarButton } from './ToolbarButton'
import { InboxButton } from '../../modules/inbox/components/InboxButton'
import { SearchButton } from '../search/GlobalSearch'
import { TOOLBAR_ACCENTS, ToolbarGuide } from './ToolbarGuide'

interface ModuleHeaderActionsProps {
  onExitToHub: () => void
  /** Kept for call-site compatibility; the radar shortcut reads the stores itself. */
  onBackToRadar?: () => void
  className?: string
  /** outside any module (e.g. the radar's project list) there is no «first page of this module» */
  hideModuleHome?: boolean
  /** a module with its own guide shows it as a shortcut beside «first page» */
  onGuide?: () => void
  guideActive?: boolean
}

/**
 * THE shortcut bar of the whole system. Same buttons, same order, same look in every module:
 *   [photo + name ▾ (my profile · sign out)]  [my inbox — work + alerts]  [search]  [light/dark]  [module guide, when it has one]  [module first page]  [radar — only inside a project]  [home / launchpad]
 * My inbox = everything waiting for the user, plus the system alerts (the former bell). «صفحهٔ اول ماژول» restarts the current module at its first page.
 */
export function ModuleHeaderActions({ onExitToHub, className = '', hideModuleHome, onGuide, guideActive }: ModuleHeaderActionsProps) {
  const goModuleHome = useModuleStore((s) => s.goModuleHome)
  // inside a project module with a project chosen (from the radar): one tap back to that project's radar
  const inProject = useModuleStore((s) => !!s.activeModule && PROJECT_SCOPED_MODULES.has(s.activeModule))
  const hasProject = useProjectContextStore((s) => !!s.projectId)
  return (
    <div className={`tb-bar relative flex shrink-0 items-center gap-1 ${className}`} role="toolbar" aria-label="میانبرهای سامانه">
      <UserChip />
      <InboxButton />
      <SearchButton />
      <ThemeSwitch />
      {onGuide && (
        <ToolbarButton label="راهنمای این ماژول" caption="راهنما" accent={TOOLBAR_ACCENTS.guide} onClick={onGuide} aria-pressed={!!guideActive} className={guideActive ? "is-on" : ""}>
          <CircleHelp size={16} />
        </ToolbarButton>
      )}
      {!hideModuleHome && (
        <ToolbarButton label="صفحهٔ اول این ماژول" caption="صفحهٔ اول" accent={TOOLBAR_ACCENTS.module} onClick={goModuleHome}>
          <LayoutDashboard size={16} />
        </ToolbarButton>
      )}
      {inProject && hasProject && (
        <ToolbarButton label="بازگشت به رادار همین پروژه" caption="رادار" accent={TOOLBAR_ACCENTS.radar} onClick={() => useModuleStore.getState().backToRadar()}>
          <Radar size={16} />
        </ToolbarButton>
      )}
      <ToolbarButton label="خانه — صفحهٔ اصلی سامانه و همهٔ ماژول‌ها" caption="خانه" accent={TOOLBAR_ACCENTS.home} onClick={onExitToHub}>
        <Home size={16} />
      </ToolbarButton>
      <ToolbarGuide />
    </div>
  )
}
