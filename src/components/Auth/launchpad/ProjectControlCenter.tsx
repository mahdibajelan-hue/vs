import { Component, lazy, Suspense, type ReactNode } from 'react'
import { useModuleStore, type ModuleKey } from '../../../store/useModuleStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { ProjectRadarPage } from '../radar/ProjectRadarPage'
import { Header } from './Header'
import { ModuleLaunchpad } from './ModuleLaunchpad'
import { AboutCard } from './AboutCard'
import { Footer } from './Footer'
import { LoginCard } from './LoginCard'
import { FARIN_NAME_FA, FARIN_TAGLINE_FA } from '../../common/Logo'

// three.js + react-three-fiber is a large dependency — split out so the launchpad (and the login
// card on it) render instantly and the 3D scene streams in behind them.
const LunarGravityCard = lazy(() => import('@/components/ui/lunar-gravity-card'))

// A decorative hero must never be able to take the login card down with it (e.g. its lazy chunk
// failing to load on a flaky connection).
class HeroErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
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
      <div className="flex flex-1 flex-col gap-8 py-6">
        <section className="hub-fade-in px-4 sm:px-8" style={{ animationDelay: '60ms' }}>
          <HeroErrorBoundary>
          <Suspense fallback={<div className="mx-auto h-[560px] max-w-6xl rounded-[2.5rem] border border-white/[0.06] bg-black md:h-[460px]" />}>
          <LunarGravityCard
            className="mx-auto min-h-0 max-w-6xl border-white/[0.06] md:h-[460px]"
            sceneClassName="h-[300px] md:h-full"
            autoRevealDelayMs={1200}
            title={
              <span className="flex flex-col gap-2">
                <span className="bg-gradient-to-b from-white via-zinc-300 to-zinc-600 bg-clip-text text-transparent drop-shadow-md">FARIN</span>
                <span dir="rtl" className="self-start text-[3.25rem] leading-none text-[#c9a227] md:text-[4rem]">
                  {FARIN_NAME_FA}
                </span>
              </span>
            }
            description={
              <p dir="rtl" className="text-right md:w-max">
                {FARIN_TAGLINE_FA}
              </p>
            }
          />
          </Suspense>
          </HeroErrorBoundary>
        </section>

        {!isAuthed && (
          <section className="mx-auto grid w-full max-w-5xl grid-cols-1 items-start gap-6 px-6 sm:px-10 md:grid-cols-2">
            <LoginCard />
            <AboutCard />
          </section>
        )}

        <ModuleLaunchpad onSelect={handleSelect} />
      </div>
      <Footer />
    </div>
  )
}
