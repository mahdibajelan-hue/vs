import { useEffect, type ReactElement } from 'react'
import { useAuthStore } from '../../../store/useAuthStore'
import type { ModuleKey } from '../../../store/useModuleStore'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { hasModuleAccess, useModuleAccessStore } from '../../../store/useModuleAccessStore'
import { ProjectRadarCard } from './cards/ProjectRadarCard'
import { PortfolioManagementCard } from './cards/PortfolioManagementCard'
import { SmartAnalyticsCard } from './cards/SmartAnalyticsCard'
import { TechnicalCompetencyCard } from './cards/TechnicalCompetencyCard'
import { ProjectEstimationCard } from './cards/ProjectEstimationCard'
import { UserManagementCard } from './cards/UserManagementCard'
import { MissionDebriefCard } from './cards/MissionDebriefCard'
import { SupervisionAttendanceCard } from './cards/SupervisionAttendanceCard'
import { InboxHubCard } from '../../../modules/inbox/components/InboxHubCard'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { useMasterDataStore } from '../../../modules/masterdata/store/useMasterDataStore'
import { MyProjectsPanel } from './MyProjectsPanel'
import { PROJECT_MODULES } from '../radar/projectNav'

type CardComponent = (props: { onSelect: () => void; locked?: boolean; badge?: number }) => ReactElement

/**
 * The home page holds only organization-wide tools. Everything that belongs to one project (schedule, finance,
 * risk, issues, material, execution, land, …) is reached through Project Radar, after the project is chosen —
 * see `PROJECT_NAV` in radar/projectNav.ts. Project Radar itself is not RBAC-gated and always comes first.
 */
const REGULAR_MODULES: { key: ModuleKey; Card: CardComponent }[] = [
  { key: 'executive', Card: PortfolioManagementCard },
  { key: 'reporting', Card: SmartAnalyticsCard },
  { key: 'estimator', Card: ProjectEstimationCard },
  { key: 'missions', Card: MissionDebriefCard },
  { key: 'supervision', Card: SupervisionAttendanceCard },
  { key: 'competency', Card: TechnicalCompetencyCard },
  // User management is deliberately always the LAST tile.
  { key: 'admin', Card: UserManagementCard },
]
/** Signed-out preview grid: areas handed out by position, so there are never holes. */
const AREAS = ['area-a', 'area-b', 'area-c', 'area-d', 'area-e', 'area-f', 'area-g', 'area-h']

/** `embedded`: rendered inside another column (the signed-out hero, under the login card) — no
 * page-level width/padding and no hint line, just the icon grid. */
export function ModuleLaunchpad({ onSelect, embedded }: { onSelect: (key: 'radar' | ModuleKey) => void; embedded?: boolean }) {
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)
  const visibleModules = REGULAR_MODULES.filter((m) => hasModuleAccess(accessibleModules, m.key))
  const locked = !isAuthed
  // The bell's items, counted per module so every tile shows its own share of the bell's total.
  const notifications = useNotificationStore((s) => s.items)
  const countFor = (key: ModuleKey) => notifications.filter((n) => n.module === key).length
  const projectCount = notifications.filter((n) => PROJECT_MODULES.has(n.module)).length
  const mdLoaded = useMasterDataStore((s) => s.loaded)
  useEffect(() => {
    if (isAuthed && !mdLoaded) useMasterDataStore.getState().fetchAll()
  }, [isAuthed, mdLoaded])

  /** null = open the radar on its project picker */
  const openRadar = (projectId: string | null) => {
    const p = projectId ? useMasterDataStore.getState().projects.find((x) => x.id === projectId) : null
    useProjectContextStore.setState({ portfolioId: p?.portfolioId ?? null, programId: p?.programId ?? null, projectId: p?.id ?? null, phaseId: null })
    onSelect('radar')
  }

  if (locked || embedded) {
    return (
      <main className={embedded ? 'relative z-10 mx-auto w-full max-w-sm' : 'relative z-10 mx-auto w-full max-w-4xl py-2'}>
        {!embedded && <p className="lp-hint hub-fade-in mb-3 text-center text-xs font-medium text-secondary">برای ورود به ماژول‌ها ابتدا وارد حساب کاربری خود شوید</p>}
        <div className="launchpad-module-grid">
          <div className="hub-fade-in area-radar" style={{ animationDelay: '140ms' }}>
            <ProjectRadarCard onSelect={() => openRadar(null)} locked={locked} />
          </div>
          {visibleModules.map(({ key, Card }, i) => (
            <div key={key} className={`hub-fade-in ${AREAS[i]}`} style={{ animationDelay: `${200 + i * 50}ms` }}>
              <Card onSelect={() => onSelect(key)} locked={locked} badge={countFor(key)} />
            </div>
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-4xl py-2">
      <div className="hub-fade-in mb-3" style={{ animationDelay: '100ms' }}>
        <InboxHubCard locked={locked} />
      </div>

      <div className="lp-home-top">
        <div className="hub-fade-in" style={{ animationDelay: '140ms' }}>
          <ProjectRadarCard onSelect={() => openRadar(null)} badge={projectCount} />
        </div>
        <div className="hub-fade-in" style={{ animationDelay: '180ms' }}>
          <MyProjectsPanel onOpen={openRadar} />
        </div>
      </div>

      {visibleModules.length > 0 && (
        <>
          <h2 className="lp-section-title hub-fade-in" style={{ animationDelay: '220ms' }}>
            ابزارهای سازمانی <span>— مستقل از پروژه، برای کل سازمان</span>
          </h2>
          <div className="lp-org-grid">
            {visibleModules.map(({ key, Card }, i) => (
              <div key={key} className={`hub-fade-in ${key === 'executive' ? 'is-wide' : ''}`} style={{ animationDelay: `${240 + i * 40}ms` }}>
                <Card onSelect={() => onSelect(key)} badge={countFor(key)} />
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
