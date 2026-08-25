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

/** Every launchpad entry point, in display order. New modules (Procurement, Document
 * Management, ...) are added here as one more `{ key, Card }` entry — no other part of the page
 * changes. Project Radar has no RBAC gate (it's always the entry point, not one of the
 * `hasModuleAccess`-checked ones) so it's kept out of the filtered list below, and it renders as
 * its own bigger, centered hero card rather than a grid tile. */
const REGULAR_MODULES: { key: ModuleKey; Card: CardComponent }[] = [
  { key: 'executive', Card: PortfolioManagementCard },
  { key: 'reporting', Card: SmartAnalyticsCard },
  { key: 'competency', Card: TechnicalCompetencyCard },
  { key: 'estimator', Card: ProjectEstimationCard },
  { key: 'admin', Card: UserManagementCard },
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

      <div className="hub-fade-in mx-auto mb-6 max-w-md" style={{ animationDelay: '140ms' }}>
        <ProjectRadarCard onSelect={() => onSelect('radar')} locked={locked} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visibleModules.map(({ key, Card }, i) => (
          <div key={key} className="hub-fade-in" style={{ animationDelay: `${200 + i * 50}ms` }}>
            <Card onSelect={() => onSelect(key)} locked={locked} />
          </div>
        ))}
      </div>
    </main>
  )
}
