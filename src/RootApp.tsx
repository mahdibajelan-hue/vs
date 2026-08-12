import { Loader2 } from 'lucide-react'
import { useModuleStore } from './store/useModuleStore'
import { useAuthStore } from './store/useAuthStore'
import { ModuleHub } from './components/Auth/ModuleHub'
import { LoginScreen, Shell, AdminOnlyBlock } from './components/Auth/AuthGate'
import { ProfileForm } from './components/Auth/ProfileForm'
import App from './App'
import { RiskApp } from './modules/risk/RiskApp'
import { IssuesApp } from './modules/issues/IssuesApp'
import { AdminApp } from './pages/AdminApp'
import { ReportingApp } from './modules/reporting/ReportingApp'
import { ExecutiveApp } from './modules/executive/ExecutiveApp'
import { FinanceApp } from './modules/finance/FinanceApp'
import { MaterialApp } from './modules/material/MaterialApp'

/**
 * Top-level flow: authenticate once (single shared account across every module), THEN show the
 * module hub — not the other way around. Previously each module wrapped itself in its own
 * AuthGate, so the hub appeared before login and only prompted for credentials once a module was
 * picked; since it's really one global Supabase session, that just meant an extra detour.
 */
export function RootApp() {
  const authLoading = useAuthStore((s) => s.authLoading)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const profileLoading = useAuthStore((s) => s.profileLoading)
  const profile = useAuthStore((s) => s.profile)
  const activeModule = useModuleStore((s) => s.activeModule)
  const enterModule = useModuleStore((s) => s.enterModule)
  const exitToHub = useModuleStore((s) => s.exitToHub)

  if (authLoading || (isAuthed && profileLoading)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 size={26} className="animate-spin text-brand-400" />
      </div>
    )
  }

  if (!isAuthed) return <LoginScreen />

  if (profile && !profile.profileCompleted) {
    return (
      <Shell title="تکمیل مشخصات" subtitle="قبل از ادامه، لطفاً مشخصات خود را تکمیل کنید">
        <ProfileForm mode="forced" />
      </Shell>
    )
  }

  if (!activeModule) return <ModuleHub onEnterModule={enterModule} />

  // مدیریت کاربران هر سه ماژول را کنترل می‌کند، پس فقط ادمین سامانه اجازه ورود دارد.
  if (activeModule === 'admin' && profile && !profile.isAdmin) {
    return <AdminOnlyBlock onBack={exitToHub} />
  }

  return activeModule === 'pipepulse' ? (
    <App />
  ) : activeModule === 'risk' ? (
    <RiskApp onExitToHub={exitToHub} />
  ) : activeModule === 'issues' ? (
    <IssuesApp onExitToHub={exitToHub} />
  ) : activeModule === 'reporting' ? (
    <ReportingApp onExitToHub={exitToHub} />
  ) : activeModule === 'executive' ? (
    <ExecutiveApp onExitToHub={exitToHub} />
  ) : activeModule === 'finance' ? (
    <FinanceApp onExitToHub={exitToHub} />
  ) : activeModule === 'material' ? (
    <MaterialApp onExitToHub={exitToHub} />
  ) : (
    <AdminApp onExitToHub={exitToHub} />
  )
}
