import { useState } from 'react'
import type { ModuleKey } from '../../../store/useModuleStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { ProjectRadarPage } from '../radar/ProjectRadarPage'
import { Header } from './Header'
import { ModuleLaunchpad } from './ModuleLaunchpad'
import { AboutCard } from './AboutCard'
import { Footer } from './Footer'

/**
 * The Launchpad: the very first screen, sign-in included — a Command Center for entering the
 * platform's six top-level modules, not a project dashboard, and it shows no project data of its
 * own. Renders unconditionally whether or not the visitor is signed in; Header carries the inline
 * login form and ModuleLaunchpad locks its cards until isAuthed flips (both read the auth store
 * directly rather than taking it as a prop, since neither needs anything else from this level).
 * Project Radar is the one entry point that isn't RBAC-gated like the rest (see
 * ModuleLaunchpad's REGULAR_MODULES list); picking it opens ProjectRadarPage in its place.
 */
export function ProjectControlCenter({ onEnterModule }: { onEnterModule: (key: ModuleKey) => void }) {
  const [radarOpen, setRadarOpen] = useState(false)
  const isAuthed = useAuthStore((s) => s.isAuthed)

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
    <div className="launchpad-shell relative flex min-h-screen w-screen flex-col overflow-x-clip" style={{ background: 'var(--bg-app)' }}>
      <div className="launchpad-texture" aria-hidden="true" />
      <Header />
      <div className="flex flex-1 flex-col justify-center gap-8 py-6">
        <ModuleLaunchpad onSelect={handleSelect} />
        {!isAuthed && (
          <div className="px-6 sm:px-10">
            <AboutCard />
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}
