import type { ReactElement } from 'react'
import type { ModuleKey } from '../../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../../store/useModuleAccessStore'
import { ProjectRadarCard } from './cards/ProjectRadarCard'
import { PortfolioManagementCard } from './cards/PortfolioManagementCard'
import { SmartAnalyticsCard } from './cards/SmartAnalyticsCard'
import { TechnicalCompetencyCard } from './cards/TechnicalCompetencyCard'
import { ProjectEstimationCard } from './cards/ProjectEstimationCard'
import { UserManagementCard } from './cards/UserManagementCard'

/** Every launchpad entry point. New modules (Procurement, Document Management, ...) are added
 * here as one more `{ key, moduleKey, Card }` entry — no other part of the page changes. Project
 * Radar has no moduleKey (it's not RBAC-gated the way the others are, it's always the entry
 * point) and renders in its own full-width hero row instead of the regular grid. */
const REGULAR_MODULES: { key: ModuleKey; Card: (props: { onSelect: () => void }) => ReactElement }[] = [
  { key: 'executive', Card: PortfolioManagementCard },
  { key: 'reporting', Card: SmartAnalyticsCard },
  { key: 'competency', Card: TechnicalCompetencyCard },
  { key: 'estimator', Card: ProjectEstimationCard },
  { key: 'admin', Card: UserManagementCard },
]

export function ModuleLaunchpad({ onSelect }: { onSelect: (key: 'radar' | ModuleKey) => void }) {
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)
  const visibleModules = REGULAR_MODULES.filter((m) => hasModuleAccess(accessibleModules, m.key))

  return (
    <main className="relative z-10 mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <p className="hub-fade-in mb-7 text-center text-sm text-secondary" style={{ animationDelay: '80ms' }}>
        یک ماژول را برای ورود انتخاب کنید
      </p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="hub-fade-in sm:col-span-2 lg:col-span-3" style={{ animationDelay: '120ms' }}>
          <ProjectRadarCard onSelect={() => onSelect('radar')} />
        </div>
        {visibleModules.map(({ key, Card }, i) => (
          <div key={key} className="hub-fade-in" style={{ animationDelay: `${180 + i * 70}ms` }}>
            <Card onSelect={() => onSelect(key)} />
          </div>
        ))}
      </div>
    </main>
  )
}
