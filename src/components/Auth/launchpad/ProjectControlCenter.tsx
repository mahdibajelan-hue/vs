import type { ReactNode } from 'react'
import { useModuleStore, type ModuleKey } from '../../../store/useModuleStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { ProjectRadarPage } from '../radar/ProjectRadarPage'
import { LampContainer } from '@/components/ui/lamp'
import { Header } from './Header'
import { ModuleLaunchpad } from './ModuleLaunchpad'
import { AboutNote } from './AboutNote'
import { Footer } from './Footer'
import { LoginCard } from './LoginCard'
import { FARIN_NAME_FA, FARIN_TAGLINE_FA } from '../../common/Logo'

/** FARIN wordmark + Persian name + tagline — the hero title that sits under the lamp. `children`
 * (the signed-out About note) follows the tagline directly. */
function BrandTitle({ centered, children }: { centered?: boolean; children?: ReactNode }) {
  return (
    <div className={`hub-fade-in flex flex-col gap-2 ${centered ? 'items-center text-center' : 'items-center text-center md:items-end md:text-left'}`}>
      <span dir="ltr" className="bg-gradient-to-b from-white via-zinc-300 to-zinc-600 bg-clip-text text-6xl font-bold tracking-tight text-transparent drop-shadow-md md:text-7xl">
        FARIN
      </span>
      <span className="text-5xl font-extrabold leading-tight text-[#c9a227] md:text-6xl">{FARIN_NAME_FA}</span>
      <p className="mt-1 text-sm font-medium text-zinc-300 md:text-base">{FARIN_TAGLINE_FA}</p>
      {children}
    </div>
  )
}

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
  const radarOpen = useModuleStore((s) => s.radarOpen)
  const openRadar = useModuleStore((s) => s.openRadar)
  const closeRadar = useModuleStore((s) => s.closeRadar)
  const isAuthed = useAuthStore((s) => s.isAuthed)

  if (radarOpen) {
    return <ProjectRadarPage onBack={closeRadar} onEnterModule={onEnterModule} />
  }

  const handleSelect = (key: 'radar' | ModuleKey) => {
    if (key === 'radar') {
      openRadar()
      return
    }
    onEnterModule(key)
  }

  return (
    <div className="launchpad-shell relative flex min-h-screen w-screen flex-col overflow-x-clip bg-black p-2 sm:p-4">
      {/* The page frame: a hairline cyan→gold border (the lamp's light meeting the Farin mark's
          gold) with drafting-sheet corner ticks, wrapping header, hero and footer. */}
      <div className="launchpad-frame relative flex flex-1 flex-col overflow-hidden rounded-[1.5rem] sm:rounded-[2rem]">
        <span className="launchpad-frame-corner is-tr" aria-hidden="true" />
        <span className="launchpad-frame-corner is-tl" aria-hidden="true" />
        <span className="launchpad-frame-corner is-br" aria-hidden="true" />
        <span className="launchpad-frame-corner is-bl" aria-hidden="true" />
        <Header />
        <LampContainer className="flex-1 pb-10 [--lamp-bg:#000]">
          {isAuthed ? (
            <div className="flex w-full flex-col items-center gap-2">
              <BrandTitle centered />
              <ModuleLaunchpad onSelect={handleSelect} />
            </div>
          ) : (
            // Signed out, as in the reference layout: login + locked module icons on the right,
            // wordmark + tagline + the faint About note (with the signature) on the left. Stacks on
            // mobile, login first.
            <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-start gap-x-10 gap-y-8 md:grid-cols-2">
              <div className="flex flex-col items-center gap-2">
                <LoginCard />
                <ModuleLaunchpad onSelect={handleSelect} embedded />
              </div>
              <BrandTitle>
                <AboutNote />
              </BrandTitle>
            </div>
          )}
        </LampContainer>
        <Footer />
      </div>
    </div>
  )
}
