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
function BrandName({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span dir="ltr" className="bg-gradient-to-b from-white via-zinc-300 to-zinc-600 bg-clip-text text-6xl font-bold tracking-tight text-transparent drop-shadow-md md:text-7xl">
        FARIN
      </span>
      <span className="text-5xl font-extrabold leading-tight text-[#c9a227] md:text-6xl">{FARIN_NAME_FA}</span>
    </div>
  )
}

/** `nameOnDesktopOnly`: on mobile the FARIN/فرین name is rendered above the login card instead
 * (see the signed-out layout), so here it only shows from md up. */
function BrandTitle({ centered, nameOnDesktopOnly, children }: { centered?: boolean; nameOnDesktopOnly?: boolean; children?: ReactNode }) {
  return (
    <div className={`hub-fade-in flex flex-col gap-2 ${centered ? 'items-center text-center' : 'items-center text-center md:items-end md:text-left'}`}>
      <BrandName className={`${centered ? 'items-center' : 'items-center md:items-end'} ${nameOnDesktopOnly ? 'hidden md:flex' : ''}`} />
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
    <div className="launchpad-shell relative flex min-h-screen w-screen flex-col overflow-x-clip bg-black">
      <Header />
      <LampContainer className="flex-1 pb-28 [--lamp-bg:#000]" lightClassName="opacity-25 md:opacity-50">
        {/* The black showcase box the lamp shines onto: hairline cyan→gold border, drafting-sheet
            corner ticks, and the lamp's light reflected on the "floor" beneath it. */}
        <div className="relative mx-auto w-full max-w-5xl">
          <div className="launchpad-frame relative rounded-[1.75rem] px-5 py-8 sm:rounded-[2.25rem] sm:px-10 sm:py-10">
            <span className="launchpad-frame-corner is-tr" aria-hidden="true" />
            <span className="launchpad-frame-corner is-tl" aria-hidden="true" />
            <span className="launchpad-frame-corner is-br" aria-hidden="true" />
            <span className="launchpad-frame-corner is-bl" aria-hidden="true" />
            {isAuthed ? (
              <div className="flex w-full flex-col items-center gap-2">
                <BrandTitle centered />
                <ModuleLaunchpad onSelect={handleSelect} />
              </div>
            ) : (
              // Signed out, as in the reference layout: login + locked module icons on the right,
              // wordmark + tagline + the faint About note (with the signature) on the left. On
              // mobile the name moves above the login card and the rest follows below.
              <div className="grid w-full grid-cols-1 items-start gap-x-10 gap-y-8 md:grid-cols-2">
                <div className="flex flex-col items-center gap-6">
                  <BrandName className="hub-fade-in items-center text-center md:hidden" />
                  <div className="flex w-full flex-col items-center gap-2">
                    <LoginCard />
                    <ModuleLaunchpad onSelect={handleSelect} embedded />
                  </div>
                </div>
                <BrandTitle nameOnDesktopOnly>
                  <AboutNote />
                </BrandTitle>
              </div>
            )}
          </div>
          <div className="launchpad-frame-reflection" aria-hidden="true" />
        </div>
      </LampContainer>
      <Footer />
    </div>
  )
}
