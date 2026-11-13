import { Fragment, lazy, Suspense, useEffect } from 'react'
import { useMasterDataStore } from './modules/masterdata/store/useMasterDataStore'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useAppThemeSync } from './components/common/useAppTheme'
import { PROJECT_SCOPED_MODULES, useModuleStore } from './store/useModuleStore'
import { PortfolioReturn } from './modules/executive/PortfolioReturn'
import { useAuthStore } from './store/useAuthStore'
import { hasModuleAccess, useModuleAccessStore } from './store/useModuleAccessStore'
import { ModuleHub } from './components/Auth/ModuleHub'
import { Shell, AdminOnlyBlock } from './components/Auth/AuthGate'
import { SetOwnPassword, mustSetPassword } from './components/Auth/SetOwnPassword'
import { ProfileForm } from './components/Auth/ProfileForm'
import { createSupabaseRepo as createLandRepo } from './modules/landacq/repo/supabaseRepo'

// Every module is its own chunk: the hub opens without parsing them all, and each is warmed in the background once the hub is idle.
const moduleLoaders = {
  RiskApp: () => import('./modules/risk/RiskApp').then((m) => ({ default: m.RiskApp })),
  ChangeApp: () => import('./modules/changeManagement/ChangeApp').then((m) => ({ default: m.ChangeApp })),
  IssuesApp: () => import('./modules/issues/IssuesApp').then((m) => ({ default: m.IssuesApp })),
  ReportingApp: () => import('./modules/reporting/ReportingApp').then((m) => ({ default: m.ReportingApp })),
  ExecutiveApp: () => import('./modules/executive/ExecutiveApp').then((m) => ({ default: m.ExecutiveApp })),
  FinanceApp: () => import('./modules/finance/FinanceApp').then((m) => ({ default: m.FinanceApp })),
  MaterialApp: () => import('./modules/material/MaterialApp').then((m) => ({ default: m.MaterialApp })),
  ExecutionApp: () => import('./modules/execution/ExecutionApp').then((m) => ({ default: m.ExecutionApp })),
  EngineeringApp: () => import('./modules/engineering/EngineeringApp').then((m) => ({ default: m.EngineeringApp })),
  SchedulingApp: () => import('./modules/scheduling/SchedulingApp').then((m) => ({ default: m.SchedulingApp })),
  CompetencyApp: () => import('./modules/competency/CompetencyApp').then((m) => ({ default: m.CompetencyApp })),
  EstimatorApp: () => import('./modules/estimator/EstimatorApp').then((m) => ({ default: m.EstimatorApp })),
  LifecycleApp: () => import('./modules/lifecycle/LifecycleApp').then((m) => ({ default: m.LifecycleApp })),
  MissionsApp: () => import('./modules/missions/MissionsApp').then((m) => ({ default: m.MissionsApp })),
  LandAcqApp: () => import('./modules/landacq/LandAcqApp').then((m) => ({ default: m.LandAcqApp })),
  StageGateApp: () => import('./modules/stagegate/StageGateApp').then((m) => ({ default: m.StageGateApp })),
  PssrApp: () => import('./modules/pssr/PssrApp').then((m) => ({ default: m.PssrApp })),
  TestingApp: () => import('./modules/testing/TestingApp').then((m) => ({ default: m.TestingApp })),
  WeldQcApp: () => import('./modules/weldqc/WeldQcApp').then((m) => ({ default: m.WeldQcApp })),
  StationPipingApp: () => import('./modules/stationpiping/StationPipingApp').then((m) => ({ default: m.StationPipingApp })),
  StatementsApp: () => import('./modules/statements/StatementsApp').then((m) => ({ default: m.StatementsApp })),
  ProjectDashboardApp: () => import('./modules/projectMetrics/ProjectDashboardApp').then((m) => ({ default: m.ProjectDashboardApp })),
  HealthCenterApp: () => import('./modules/healthcenter/HealthCenterApp').then((m) => ({ default: m.HealthCenterApp })),
  StakeholdersApp: () => import('./modules/stakeholders/StakeholdersApp').then((m) => ({ default: m.StakeholdersApp })),
  SupervisionApp: () => import('./modules/supervision/SupervisionApp').then((m) => ({ default: m.SupervisionApp })),
  AdminApp: () => import('./pages/AdminApp').then((m) => ({ default: m.AdminApp })),
  App: () => import('./App').then((m) => ({ default: m.default })),
}
const App = lazy(moduleLoaders.App)
// signed-in overlays: the inbox pulls in several module stores, so neither belongs in the sign-in page's download
const InboxOverlayLazy = lazy(() => import('./modules/inbox/components/InboxOverlay').then((m) => ({ default: m.InboxOverlay })))
const GlobalSearchLazy = lazy(() => import('./components/search/GlobalSearch').then((m) => ({ default: m.GlobalSearch })))
const InboxOverlay = () => <Suspense fallback={null}><InboxOverlayLazy /></Suspense>
const GlobalSearch = () => <Suspense fallback={null}><GlobalSearchLazy /></Suspense>
// public token pages and the project workspace stay out of the first download: the sign-in screen needs none of them
const ProjectWorkspace = lazy(() => import('./components/Auth/radar/ProjectWorkspace').then((m) => ({ default: m.ProjectWorkspace })))
const CandidateSelfServicePage = lazy(() => import('./modules/competency/pages/CandidateSelfServicePage').then((m) => ({ default: m.CandidateSelfServicePage })))
const PublicResultsPage = lazy(() => import('./modules/competency/pages/PublicResultsPage').then((m) => ({ default: m.PublicResultsPage })))
const PersonalityCandidatePage = lazy(() => import('./modules/personality/pages/PersonalityCandidatePage').then((m) => ({ default: m.PersonalityCandidatePage })))
const McqCandidatePage = lazy(() => import('./modules/competency/pages/McqCandidatePage').then((m) => ({ default: m.McqCandidatePage })))
const pageWait = <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}><Loader2 size={26} className="animate-spin text-brand-400" /></div>
const RiskApp = lazy(moduleLoaders.RiskApp)
const ChangeApp = lazy(moduleLoaders.ChangeApp)
const IssuesApp = lazy(moduleLoaders.IssuesApp)
const ReportingApp = lazy(moduleLoaders.ReportingApp)
const ExecutiveApp = lazy(moduleLoaders.ExecutiveApp)
const FinanceApp = lazy(moduleLoaders.FinanceApp)
const MaterialApp = lazy(moduleLoaders.MaterialApp)
const ExecutionApp = lazy(moduleLoaders.ExecutionApp)
const EngineeringApp = lazy(moduleLoaders.EngineeringApp)
const SchedulingApp = lazy(moduleLoaders.SchedulingApp)
const CompetencyApp = lazy(moduleLoaders.CompetencyApp)
const EstimatorApp = lazy(moduleLoaders.EstimatorApp)
const LifecycleApp = lazy(moduleLoaders.LifecycleApp)
const MissionsApp = lazy(moduleLoaders.MissionsApp)
const LandAcqApp = lazy(moduleLoaders.LandAcqApp)
const StageGateApp = lazy(moduleLoaders.StageGateApp)
const ProjectDashboardApp = lazy(moduleLoaders.ProjectDashboardApp)
const HealthCenterApp = lazy(moduleLoaders.HealthCenterApp)
const StakeholdersApp = lazy(moduleLoaders.StakeholdersApp)
const PssrApp = lazy(moduleLoaders.PssrApp)
const TestingApp = lazy(moduleLoaders.TestingApp)
const StationPipingApp = lazy(moduleLoaders.StationPipingApp)
const WeldQcApp = lazy(moduleLoaders.WeldQcApp)
const StatementsApp = lazy(moduleLoaders.StatementsApp)
const SupervisionApp = lazy(moduleLoaders.SupervisionApp)
const AdminApp = lazy(moduleLoaders.AdminApp)
/** warm the module chunks one by one while the hub is idle, so a click finds its code already downloaded */
function warmModules() {
  const names = Object.keys(moduleLoaders) as (keyof typeof moduleLoaders)[]
  let i = 0
  const next = () => { if (i >= names.length) return; void moduleLoaders[names[i++]]().catch(() => undefined).finally(() => setTimeout(next, 150)) }
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback
  if (idle) idle(next); else setTimeout(next, 1500)
}

// One repo per page load, so LandAcqApp's init effect keeps a stable dependency.
const landRepo = createLandRepo()

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
  useAppThemeSync()
  const authLoading = useAuthStore((s) => s.authLoading)
  const isAuthed = useAuthStore((s) => s.isAuthed)
  const profileLoading = useAuthStore((s) => s.profileLoading)
  const profile = useAuthStore((s) => s.profile)
  const session = useAuthStore((s) => s.session)
  const activeModule = useModuleStore((s) => s.activeModule)
  const moduleResetKey = useModuleStore((s) => s.moduleResetKey)
  const enterModule = useModuleStore((s) => s.enterModule)
  const exitToHub = useModuleStore((s) => s.exitToHub)
  const backToRadar = useModuleStore((s) => s.backToRadar)
  const accessibleModules = useModuleAccessStore((s) => s.accessibleModules)
  const workspace = useModuleStore((s) => s.workspace)

  // right after sign-in: load the shared project list (most modules wait for it) and warm the module code in the background
  const fetchMasterData = useMasterDataStore((s) => s.fetchAll)
  const masterLoaded = useMasterDataStore((s) => s.loaded)
  useEffect(() => {
    if (!isAuthed) return
    if (!masterLoaded) void fetchMasterData()
    warmModules()
  }, [isAuthed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Candidate self-service link (?candidate=<token>) — a public, unauthenticated page reached
  // straight from an emailed link. Checked after the hooks above (Rules of Hooks) but before any
  // auth-gated rendering below, since it must never require a FARIN login.
  const candidateToken = new URLSearchParams(window.location.search).get('candidate')
  if (candidateToken) return <Suspense fallback={pageWait}><CandidateSelfServicePage token={candidateToken} /></Suspense>

  // Public "view results online" link (?results=<token>) — same idea, but for sharing a read-only
  // results report with anyone holding the link, never requiring a FARIN login either.
  const resultsToken = new URLSearchParams(window.location.search).get('results')
  if (resultsToken) return <Suspense fallback={pageWait}><PublicResultsPage token={resultsToken} /></Suspense>

  // The personality module's own candidate-taking link (?p_candidate=<token>) — same reasoning as
  // the competency links above, kept as a separate query param so the two modules' tokens never
  // collide. The personality module no longer has a standalone top-level presence (its dashboard/
  // results/question-bank/settings/reports pages are now reached through the Competency module —
  // see CompetencyApp.tsx and AssessmentWizardPage's panel/personality stages), but this one
  // route survives: an unauthenticated candidate must still be able to answer via their link. The
  // old public "view results online" link (?p_results=<token>, PersonalityPublicResultsPage) is no
  // longer routed — staff now view personality results inline in the competency wizard instead.
  const personalityCandidateToken = new URLSearchParams(window.location.search).get('p_candidate')
  if (personalityCandidateToken) return <Suspense fallback={pageWait}><PersonalityCandidatePage token={personalityCandidateToken} /></Suspense>

  // The competency module's online technical MCQ test link (?mcq=<token>, schema.sql Section 56) —
  // the second ONLINE part of the candidate's plan next to the personality link above, on its own
  // query param so the three candidate tokens never collide.
  const mcqCandidateToken = new URLSearchParams(window.location.search).get('mcq')
  if (mcqCandidateToken) return <Suspense fallback={pageWait}><McqCandidatePage token={mcqCandidateToken} /></Suspense>

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

  // an account an admin made with an initial password / invite / one-time link: the person sets a password of their own first
  if (mustSetPassword(session?.user.user_metadata)) {
    return (
      <Shell title="تعیین رمز عبور" subtitle="پیش از ورود به سامانه، رمز عبور شخصی خود را انتخاب کنید">
        <SetOwnPassword />
      </Shell>
    )
  }

  if (profile && !profile.profileCompleted) {
    return (
      <Shell title="تکمیل مشخصات" subtitle="قبل از ادامه، لطفاً مشخصات خود را تکمیل کنید">
        <ProfileForm mode="forced" />
      </Shell>
    )
  }

  if (!activeModule) return <><ModuleHub onEnterModule={enterModule} /><InboxOverlay /><GlobalSearch /></>

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

  const moduleView = activeModule === 'pipepulse' ? (
    <App />
  ) : activeModule === 'risk' ? (
    <RiskApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'change' ? (
    <ChangeApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'issues' ? (
    <IssuesApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'reporting' ? (
    <ReportingApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'executive' ? (
    <ExecutiveApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'finance' ? (
    <FinanceApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'material' ? (
    <MaterialApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'engineering' ? (
    <EngineeringApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'scheduling' ? (
    <SchedulingApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'execution' ? (
    <ExecutionApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'competency' ? (
    <CompetencyApp onExitToHub={exitToHub} />
  ) : activeModule === 'estimator' ? (
    <EstimatorApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'missions' ? (
    <MissionsApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'landacq' ? (
    <LandAcqApp repo={landRepo} onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'taskissue' ? (
    <IssuesApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'supervision' ? (
    <SupervisionApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'statements' ? (
    <StatementsApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'testing' ? (
    <TestingApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'weldqc' ? (
    <WeldQcApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'stationpiping' ? (
    <StationPipingApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'pssr' ? (
    <PssrApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'projectdashboard' ? (
    <ProjectDashboardApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'healthcenter' ? (
    <HealthCenterApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'stakeholders' ? (
    <StakeholdersApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'stagegate' ? (
    <StageGateApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'lifecycle' ? (
    <LifecycleApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  ) : activeModule === 'pipelinedigitaltwin' ? (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
          <Loader2 size={26} className="animate-spin text-brand-400" />
        </div>
      }
    >
      <PipelineDigitalTwinApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
    </Suspense>
  ) : (
    <AdminApp onExitToHub={exitToHub} onBackToRadar={backToRadar} />
  )

  // «صفحهٔ اول ماژول» bumps moduleResetKey, which remounts the active module at its first page.
  return (
    <>
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}><Loader2 size={26} className="animate-spin text-brand-400" /></div>}>
        {workspace === 'project' && PROJECT_SCOPED_MODULES.has(activeModule)
          ? <ProjectWorkspace><Fragment key={`${activeModule}-${moduleResetKey}`}>{moduleView}</Fragment></ProjectWorkspace>
          : <Fragment key={`${activeModule}-${moduleResetKey}`}>{moduleView}</Fragment>}
      </Suspense>
      {workspace === 'portfolio' && PROJECT_SCOPED_MODULES.has(activeModule) && <PortfolioReturn />}
      <InboxOverlay />
      <GlobalSearch />
    </>
  )
}
