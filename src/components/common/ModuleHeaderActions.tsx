import { useState } from 'react'
import { BookOpenText, Home, LayoutDashboard, Radar } from 'lucide-react'
import { PROJECT_SCOPED_MODULES, useModuleStore } from '../../store/useModuleStore'
import { useProjectContextStore } from '../../store/useProjectContextStore'
import { UserChip } from './UserChip'
import { ThemeSwitch } from './ThemeSwitch'
import { ToolbarButton } from './ToolbarButton'
import { InboxButton } from '../../modules/inbox/components/InboxButton'
import { SearchButton } from '../search/GlobalSearch'
import { TOOLBAR_ACCENTS, ToolbarGuide } from './ToolbarGuide'
import { ModuleGuideDrawer } from './ModuleGuideDrawer'
import type { GuideKey } from '../../guides/moduleGuides'

/** modules whose guide lives in the shared registry (the rest pass `onGuide` to open their own) */
const REGISTRY: ReadonlySet<string> = new Set<GuideKey>(['pipepulse', 'engineering', 'finance', 'lifecycle', 'supervision', 'missions', 'competency', 'admin', 'projectdashboard', 'landacq', 'estimator', 'material', 'radar'])

interface ModuleHeaderActionsProps {
  onExitToHub: () => void
  /** Kept for call-site compatibility; the radar shortcut reads the stores itself. */
  onBackToRadar?: () => void
  className?: string
  /** outside any module (e.g. the radar's project list) there is no «first page of this module» */
  hideModuleHome?: boolean
  /** a module whose guide lives inside it (a page or a dialog) opens it from here; otherwise the shared guide of the module opens */
  onGuide?: () => void
  guideActive?: boolean
  /** which shared guide to open when the bar is shown outside a module (e.g. the radar) */
  guideKey?: GuideKey
}

/**
 * THE shortcut bar of the whole system. Same buttons, same order, same look in every module:
 *   [photo + name ▾ (my profile · sign out)]  [my inbox — work + alerts]  [search]  [light/dark]  [module first page]  [radar — only inside a project]  [home / launchpad]  ‖  [module guide]
 * The guide stands apart at the far (left) end of the row in its own filled style, so it is found at a glance.
 * My inbox = everything waiting for the user, plus the system alerts (the former bell). «صفحهٔ اول ماژول» restarts the current module at its first page.
 */
export function ModuleHeaderActions({ onExitToHub, className = '', hideModuleHome, onGuide, guideActive, guideKey }: ModuleHeaderActionsProps) {
  const goModuleHome = useModuleStore((s) => s.goModuleHome)
  // inside a project module with a project chosen (from the radar): one tap back to that project's radar
  const inProject = useModuleStore((s) => !!s.activeModule && PROJECT_SCOPED_MODULES.has(s.activeModule))
  const hasProject = useProjectContextStore((s) => !!s.projectId)
  const activeModule = useModuleStore((s) => s.activeModule)
  const sharedKey = (guideKey ?? (activeModule && REGISTRY.has(activeModule) ? activeModule : null)) as GuideKey | null
  const [shared, setShared] = useState(false)
  const openGuide = onGuide ?? (sharedKey ? () => setShared((v) => !v) : null)
  return (
    <div className={`tb-bar relative flex shrink-0 items-center gap-1 ${className}`} role="toolbar" aria-label="میانبرهای سامانه">
      <UserChip />
      <InboxButton />
      <SearchButton />
      <ThemeSwitch />
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
      {openGuide && (
        <button type="button" className={`tb-guide-btn${guideActive || shared ? ' is-on' : ''}`} onClick={openGuide} aria-pressed={!!(guideActive || shared)} aria-label="راهنمای این ماژول" title="راهنمای این ماژول">
          <BookOpenText size={16} aria-hidden />
          <span>راهنما</span>
        </button>
      )}
      {shared && sharedKey && <ModuleGuideDrawer guideKey={sharedKey} onClose={() => setShared(false)} />}
    </div>
  )
}
