import { lazy, Suspense } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useModuleStore } from './store/useModuleStore'
import { useAuthStore } from './store/useAuthStore'
import { hasModuleAccess, useModuleAccessStore } from './store/useModuleAccessStore'
import { ModuleHub } from './components/Auth/ModuleHub'
import { Shell, AdminOnlyBlock } from './components/Auth/AuthGate'
import { ProfileForm } from './components/Auth/ProfileForm'
import App from './App'
import { RiskApp } from './modules/risk/RiskApp'
import { IssuesApp } from './modules/issues/IssuesApp'
import { AdminApp } from './pages/AdminApp'
import { ReportingApp } from './modules/reporting/ReportingApp'
import { ExecutiveApp } from './modules/executive/ExecutiveApp'
import { FinanceApp } from './modules/finance/FinanceApp'
import { MaterialApp } from './modules/material/MaterialApp'
import { CompetencyApp } from './modules/competency/CompetencyApp'
import { EstimatorApp } from './modules/estimator/EstimatorApp'
import { LifecycleApp } from './modules/lifecycle/LifecycleApp'
import { CandidateSelfServicePage } from './modules/competency/pages/CandidateSelfServicePage'
import { PublicResultsPage } from './modules/competency/pages/PublicResultsPage'

// Cesium alone is several MB — lazy-loaded so no other module's bundle pays for it.
const PipelineDigitalTwinApp = lazy(() =>
  import('./modules/pipelinedigitaltwin/PipelineDigitalTwinApp').then((m) => ({ default: m.PipelineDigitalTwinApp })),
)

/**
 * Top-level flow: one shared account across every module, authenticated inline on the launchpad
 * itself — there's no separate login screen. ModuleHub renders unconditionally on both sides of
 * isAuthed; before sign-in its module cards are just locked previews, and entering credentials in
 * its header unlocks them in place.
 */
export function RootApp() {
  const authLoading = useAuthStore((s) => s.authLoading)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const profileLoading = useAuthStore((s) => s.profileLoading)
  const profile = useAuthStore((s) => s.profile)
  const activeModule = useModuleStore((s) => s.activeModule)
  const enterModule = useModuleStore((s) => s.enterModule)
  const exitToHub = useModuleStore((s) => s.exitToHub)
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)

  // Candidate self-service link (?candidate=<token>) — a public, unauthenticated page reached
  // straight from an emailed link. Checked after the hooks above (Rules of Hooks) but before any
  // auth-gated rendering below, since it must never require a RASTA login.
  const candidateToken = new URLSearchParams(window.location.search).get('candidate')
  if (candidateToken) return <CandidateSelfServicePage token={candidateToken} />

  // Public "view results online" link (?results=<token>) — same idea, but for sharing a read-only
  // results report with anyone holding the link, never requiring a RASTA login either.
  const resultsToken = new URLSearchParams(window.location.search).get('results')
  if (resultsToken) return <PublicResultsPage token={resultsToken} />

  if (authLoading || (isAuthed && profileLoading)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 size={26} className="animate-spin text-brand-400" />
      </div>
    )
  }

  // Sign-in is inline on the launchpad itself (Header's login form) rather than a separate
  // screen — ModuleHub renders the same page either way, just with module cards locked until
  // isAuthed flips.
  if (!isAuthed) return <ModuleHub onEnterModule={enterModule} />

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

  // Defense in depth: ModuleHub already hides modules the user can't access, but a stale tab or
  // an admin narrowing access mid-session shouldn't leave direct entry still open.
  if (activeModule && !hasModuleAccess(accessibleModules, activeModule)) {
    return (
      <Shell title="دسترسی به این محیط محدود شده" subtitle="دسترسی شما به این ماژول توسط مدیر سامانه غیرفعال شده است.">
        <button
          onClick={exitToHub}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-5 py-2.5 text-sm text-secondary hover:bg-white/5 transition-colors"
        >
          <ArrowRight size={15} /> بازگشت به ماژول‌ها
        </button>
      </Shell>
    )
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
  ) : activeModule === 'competency' ? (
    <CompetencyApp onExitToHub={exitToHub} />
  ) : activeModule === 'estimator' ? (
    <EstimatorApp onExitToHub={exitToHub} />
  ) : activeModule === 'lifecycle' ? (
    <LifecycleApp onExitToHub={exitToHub} />
  ) : activeModule === 'pipelinedigitaltwin' ? (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
          <Loader2 size={26} className="animate-spin text-brand-400" />
        </div>
      }
    >
      <PipelineDigitalTwinApp onExitToHub={exitToHub} />
    </Suspense>
  ) : (
    <AdminApp onExitToHub={exitToHub} />
  )
}
