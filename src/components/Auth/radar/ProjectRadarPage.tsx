import { useEffect, useMemo, useState } from 'react'
import { useModuleStore, type ModuleKey } from '../../../store/useModuleStore'
import { hasModuleAccess, useModuleAccessStore } from '../../../store/useModuleAccessStore'
import { useMasterDataStore } from '../../../modules/masterdata/store/useMasterDataStore'
import { useProjectContextStore } from '../../../store/useProjectContextStore'
import { useNotificationStore } from '../../../store/useNotificationStore'
import { RadarProjectPicker } from './RadarProjectPicker'
import { RadarSidebar } from './RadarSidebar'
import { MobileRadar } from './MobileRadar'
import { projectBadges, rememberProject, type ProjectNavItem } from './projectNav'
import { useInboxWork } from '../../../modules/inbox/store/useInboxWork'
import { recordVisit } from './projectVisits'
import './radarShell.css'
import { RadarCockpit } from './RadarCockpit'
import { blankRadarData, buildRadarData } from './radarLiveData'
import { DEFAULT_RADAR_DATA, buildMockRadarData, type RadarData } from './radarTypes'

export function ProjectRadarPage({ onBack }: { onBack: () => void }) {
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)

  const mdLoaded = useMasterDataStore((s) => s.loaded)
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const masterProjects = useMasterDataStore((s) => s.projects)
  const contextProjectId = useProjectContextStore((s) => s.projectId)
  // the whole context follows the chosen project, so modules that filter by portfolio/program agree with it
  const pickProject = (id: string | null) => {
    const p = id ? masterProjects.find((x) => x.id === id) : null
    if (p) { rememberProject(p.id); recordVisit(p.id) }
    useProjectContextStore.setState({ portfolioId: p?.portfolioId ?? null, programId: p?.programId ?? null, projectId: p?.id ?? null, phaseId: null })
  }
  const notifications = useNotificationStore((s) => s.items)
  const projectOf = useNotificationStore((s) => s.projectOf)
  const work = useInboxWork()
  const badgeFor = useMemo(() => projectBadges(notifications, projectOf, contextProjectId, work), [notifications, projectOf, contextProjectId, work])

  useEffect(() => {
    if (!mdLoaded) fetchMasterData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProject = useMemo(() => masterProjects.find((p) => p.id === contextProjectId) ?? null, [masterProjects, contextProjectId])

  // Shows the deterministic mock instantly (no loading flicker), then upgrades in place to live
  // Risk/Issue data once fetchProjectIntelligence resolves — a project with no confirmed module
  // mapping yet just keeps looking like the mock, same "unmapped" convention Reporting already uses.
  const [data, setData] = useState<RadarData>(DEFAULT_RADAR_DATA)
  const [reloadKey, setReloadKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  useEffect(() => {
    if (!selectedProject) {
      setData(DEFAULT_RADAR_DATA)
      return
    }
    const projectIdCode = selectedProject.projectIdCode || selectedProject.projectCode
    // nothing until the modules answer: an empty picture, never sample figures
    setData(blankRadarData(buildMockRadarData(selectedProject.id, selectedProject.officialName, projectIdCode)))
    setRefreshing(true)
    let cancelled = false
    buildRadarData(selectedProject.id, selectedProject.officialName, projectIdCode).then((live) => {
      if (!cancelled) setData(live)
    }).finally(() => { if (!cancelled) setRefreshing(false) })
    return () => {
      cancelled = true
    }
  }, [selectedProject, reloadKey])

  // Below the `lg` breakpoint the sidebar overlays the page instead of pushing it, and starts closed
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024)
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const onChange = (e: MediaQueryListEvent) => { setIsDesktop(e.matches); setSidebarOpen(e.matches) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  // phones get their own one-column radar (MobileRadar); the cockpit below is for wider screens
  const [isPhone, setIsPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const on = (e: MediaQueryListEvent) => setIsPhone(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const isVisible = (key: ModuleKey) => hasModuleAccess(accessibleModules, key)
  const handleNavClick = (item: ProjectNavItem) => {
    if (!isDesktop) setSidebarOpen(false)
    if (!item.module) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    useModuleStore.getState().enterModule(item.module, 'project')
  }

  if (!contextProjectId || (mdLoaded && !selectedProject)) {
    return <RadarProjectPicker onPick={pickProject} onBack={onBack} />
  }

  if (isPhone && selectedProject) {
    return (
      <MobileRadar project={selectedProject} data={data} canSee={isVisible} badgeFor={badgeFor} onItem={handleNavClick} onSwitch={() => pickProject(null)} onHome={onBack} />
    )
  }

  return (
    <div className="relative min-h-screen w-screen overflow-x-clip" style={{ background: 'var(--bg-app)' }}>
      <div className="relative z-10 transition-[margin] duration-300" style={{ marginRight: isDesktop && sidebarOpen ? '17rem' : 0 }}>
        <RadarCockpit
          data={data}
          projectName={selectedProject?.officialName ?? data.projectName}
          projectCode={selectedProject ? selectedProject.projectIdCode || selectedProject.projectCode : data.projectIdCode}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onBack={onBack}
          onOpen={(m) => useModuleStore.getState().enterModule(m, 'project')}
          onRefresh={() => setReloadKey((k) => k + 1)}
          refreshing={refreshing}
          canSee={isVisible}
        />
      </div>
      {selectedProject && (
        <RadarSidebar project={selectedProject} active="overview" canSee={isVisible} badgeFor={badgeFor} open={sidebarOpen} overlay={!isDesktop}
          onItem={handleNavClick} onSwitch={() => pickProject(null)} onHome={onBack} onClose={() => setSidebarOpen(false)} />
      )}
    </div>
  )
}
