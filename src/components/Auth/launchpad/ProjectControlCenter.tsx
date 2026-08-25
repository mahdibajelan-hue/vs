import { useState } from 'react'
import type { ModuleKey } from '../../../store/useModuleStore'
import { ProjectRadarPage } from '../radar/ProjectRadarPage'
import { Header } from './Header'
import { ModuleLaunchpad } from './ModuleLaunchpad'
import { Footer } from './Footer'

/**
 * The Launchpad: the first screen after sign-in. A Command Center for entering the platform's
 * six top-level modules — not a project dashboard, and it shows no project data of its own.
 * Project Radar is the one entry point that isn't RBAC-gated like the rest (see
 * ModuleLaunchpad's REGULAR_MODULES list); picking it opens ProjectRadarPage in its place.
 */
export function ProjectControlCenter({ onEnterModule }: { onEnterModule: (key: ModuleKey) => void }) {
  const [radarOpen, setRadarOpen] = useState(false)

  if (radarOpen) {
    return <ProjectRadarPage onBack={() => setRadarOpen(false)} onEnterModule={onEnterModule} />
  }

  const handleSelect = (key: 'radar' | ModuleKey) => {
    if (key === 'radar') {
      setRadarOpen(true)
      return
    }
    onEnterModule(key)
  }

  return (
    <div className="launchpad-shell relative min-h-screen w-screen overflow-x-clip" style={{ background: 'var(--bg-app)' }}>
      <div className="launchpad-texture" aria-hidden="true" />
      <Header />
      <ModuleLaunchpad onSelect={handleSelect} />
      <Footer />
    </div>
  )
}
