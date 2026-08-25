import type { ReactElement } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import type { ModuleKey } from '../../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../../store/useModuleAccessStore'
import { LoginCard } from './LoginCard'
import { ProjectRadarCard } from './cards/ProjectRadarCard'
import { PortfolioManagementCard } from './cards/PortfolioManagementCard'
import { SmartAnalyticsCard } from './cards/SmartAnalyticsCard'
import { TechnicalCompetencyCard } from './cards/TechnicalCompetencyCard'
import { ProjectEstimationCard } from './cards/ProjectEstimationCard'
import { UserManagementCard } from './cards/UserManagementCard'

type CardComponent = (props: { onSelect: () => void; locked?: boolean }) => ReactElement

/** Every launchpad entry point. Project Radar has no RBAC gate (it's always the entry point, not
 * one of the `hasModuleAccess`-checked ones), so it's kept out of the filtered list and placed
 * explicitly in the grid's `radar` area (see `.launchpad-module-grid` in index.css) — the other
 * five fill areas a/b/c/d/e around it in this order. New modules are added here as one more
 * `{ key, Card, area }` entry (pick any still-open area). */
const REGULAR_MODULES: { key: ModuleKey; Card: CardComponent; area: string }[] = [
  { key: 'executive', Card: PortfolioManagementCard, area: 'area-a' },
  { key: 'reporting', Card: SmartAnalyticsCard, area: 'area-b' },
  { key: 'competency', Card: TechnicalCompetencyCard, area: 'area-c' },
  { key: 'estimator', Card: ProjectEstimationCard, area: 'area-d' },
  { key: 'admin', Card: UserManagementCard, area: 'area-e' },
]

export function ModuleLaunchpad({ onSelect }: { onSelect: (key: 'radar' | ModuleKey) => void }) {
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)
  const visibleModules = REGULAR_MODULES.filter((m) => hasModuleAccess(accessibleModules, m.key))
  const locked = !isAuthed

  return (
    <main className="relative z-10 mx-auto max-w-4xl px-6 py-8 sm:px-10">
      <p className="hub-fade-in mb-5 text-center text-xs text-secondary" style={{ animationDelay: '80ms' }}>
        {locked ? 'برای ورود به ماژول‌ها ابتدا وارد حساب کاربری خود شوید' : 'یک ماژول را برای ورود انتخاب کنید'}
      </p>

      {locked && <LoginCard />}

      <div className="launchpad-module-grid">
        <div className="hub-fade-in area-radar" style={{ animationDelay: '140ms' }}>
          <ProjectRadarCard onSelect={() => onSelect('radar')} locked={locked} />
        </div>
        {visibleModules.map(({ key, Card, area }, i) => (
          <div key={key} className={`hub-fade-in ${area}`} style={{ animationDelay: `${200 + i * 50}ms` }}>
            <Card onSelect={() => onSelect(key)} locked={locked} />
          </div>
        ))}
      </div>
    </main>
  )
}
