import type { ReactElement } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import type { ModuleKey } from '../../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../../store/useModuleAccessStore'
import { ProjectRadarCard } from './cards/ProjectRadarCard'
import { PortfolioManagementCard } from './cards/PortfolioManagementCard'
import { SmartAnalyticsCard } from './cards/SmartAnalyticsCard'
import { TechnicalCompetencyCard } from './cards/TechnicalCompetencyCard'
import { ProjectEstimationCard } from './cards/ProjectEstimationCard'
import { UserManagementCard } from './cards/UserManagementCard'
import { MissionDebriefCard } from './cards/MissionDebriefCard'
import { LandAcquisitionCard } from './cards/LandAcquisitionCard'
import { StageGateCard } from './cards/StageGateCard'
import { TaskIssueCard } from './cards/TaskIssueCard'

type CardComponent = (props: { onSelect: () => void; locked?: boolean }) => ReactElement

/** Every launchpad entry point. Project Radar has no RBAC gate (it's always the entry point, not
 * one of the `hasModuleAccess`-checked ones), so it's kept out of the filtered list and placed
 * explicitly in the grid's `radar` area (see `.launchpad-module-grid` in index.css) — the other
 * five fill areas a/b/c/d/e around it in this order. New modules are added here as one more
 * `{ key, Card, area }` entry (pick any still-open area). The Personality & Behavioral Assessment
 * module used to have its own card/area-f here; it's now reached through the Competency module's
 * own candidate wizard instead (see AssessmentWizardPage's panel/personality stages) rather
 * than as an independently-navigable top-level module. */
const REGULAR_MODULES: { key: ModuleKey; Card: CardComponent }[] = [
  { key: 'executive', Card: PortfolioManagementCard },
  { key: 'reporting', Card: SmartAnalyticsCard },
  { key: 'competency', Card: TechnicalCompetencyCard },
  { key: 'estimator', Card: ProjectEstimationCard },
  { key: 'missions', Card: MissionDebriefCard },
  { key: 'landacq', Card: LandAcquisitionCard },
  { key: 'stagegate', Card: StageGateCard },
  { key: 'taskissue', Card: TaskIssueCard },
  // User management is deliberately always the LAST tile.
  { key: 'admin', Card: UserManagementCard },
]
/** Grid areas are handed out by position among the modules the user can see, so there are never holes and the last module stays last. */
const AREAS = ['area-a', 'area-b', 'area-c', 'area-d', 'area-e', 'area-f', 'area-g', 'area-h', 'area-i']

/** `embedded`: rendered inside another column (the signed-out hero, under the login card) — no
 * page-level width/padding and no hint line, just the icon grid. */
export function ModuleLaunchpad({ onSelect, embedded }: { onSelect: (key: 'radar' | ModuleKey) => void; embedded?: boolean }) {
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)
  const visibleModules = REGULAR_MODULES.filter((m) => hasModuleAccess(accessibleModules, m.key))
  const locked = !isAuthed

  return (
    <main className={embedded ? 'relative z-10 mx-auto w-full max-w-sm' : 'relative z-10 mx-auto w-full max-w-4xl py-2'}>
      {!embedded && (
        <p className="lp-hint hub-fade-in mb-3 text-center text-xs font-medium text-secondary" style={{ animationDelay: '80ms' }}>
          {locked ? 'برای ورود به ماژول‌ها ابتدا وارد حساب کاربری خود شوید' : 'یک ماژول را برای ورود انتخاب کنید'}
        </p>
      )}

      <div className={locked || embedded ? 'launchpad-module-grid' : 'launchpad-bento'}>
        <div className="hub-fade-in area-radar" style={{ animationDelay: '140ms' }}>
          <ProjectRadarCard onSelect={() => onSelect('radar')} locked={locked} />
        </div>
        {visibleModules.map(({ key, Card }, i) => (
          <div key={key} className={`hub-fade-in ${AREAS[i]}`} style={{ animationDelay: `${200 + i * 50}ms` }}>
            <Card onSelect={() => onSelect(key)} locked={locked} />
          </div>
        ))}
      </div>
    </main>
  )
}
