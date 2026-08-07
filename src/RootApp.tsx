import { useModuleStore } from './store/useModuleStore'
import { ModuleHub } from './components/Auth/ModuleHub'
import { AuthGate } from './components/Auth/AuthGate'
import App from './App'
import { RiskApp } from './modules/risk/RiskApp'

export function RootApp() {
  const activeModule = useModuleStore((s) => s.activeModule)
  const enterModule = useModuleStore((s) => s.enterModule)
  const exitToHub = useModuleStore((s) => s.exitToHub)

  if (!activeModule) return <ModuleHub onEnterModule={enterModule} />

  return (
    <AuthGate moduleKey={activeModule} onBackToHub={exitToHub}>
      {activeModule === 'pipepulse' ? <App /> : <RiskApp onExitToHub={exitToHub} />}
    </AuthGate>
  )
}
