import { useEffect, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useCompetencyStore } from './store/useCompetencyStore'
import { useAuthStore } from '../../store/useAuthStore'
import { CompetencyDashboardPage } from './pages/CompetencyDashboardPage'
import { AssessmentWizardPage } from './pages/AssessmentWizardPage'
import { QuestionBankPage } from './pages/QuestionBankPage'
import { CompetencyReportsPage } from './pages/CompetencyReportsPage'
import { CompetencySettingsPage } from './pages/CompetencySettingsPage'
import { ProfileForm } from './components/ProfileForm'
import type { CompetencySection } from './components/CompetencySidebarShell'

export const COMPETENCY_ACCENT = '#a855f7'

type View =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'assessment'; id: string }
  | { name: 'questionBank' }
  | { name: 'reports' }
  | { name: 'settings' }

/**
 * Competency Assessment — structured interview/scoring tool for evaluating EPC pipeline-project
 * job candidates, with multi-interviewer panel scoring, candidate self-service profile intake, and
 * a radar-chart report per candidate. Navigation across the module is a single right-hand sidebar
 * (see CompetencySidebarShell) rather than a page-specific header — every stage of an assessment
 * and the cross-role dashboard share the same six destinations.
 */
export function CompetencyApp({ onExitToHub }: { onExitToHub: () => void }) {
  const loading = useCompetencyStore((s) => s.loading)
  const fetchAll = useCompetencyStore((s) => s.fetchAll)
  const createAssessment = useCompetencyStore((s) => s.createAssessment)
  const moduleAdmins = useCompetencyStore((s) => s.moduleAdmins)
  const fetchModuleAdmins = useCompetencyStore((s) => s.fetchModuleAdmins)
  const myProfile = useAuthStore((s) => s.profile)

  const [view, setView] = useState<View>({ name: 'list' })

  useEffect(() => {
    fetchAll()
    fetchModuleAdmins()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Module admins have the same standing as the system admin, but scoped to this module (see
  // comp_is_module_admin in schema.sql) — both can manage the question bank and module settings.
  const isModuleAdmin = Boolean(myProfile?.isAdmin) || moduleAdmins.some((m) => m.userId === myProfile?.id)

  // The three module-wide sidebar destinations beyond "داشبورد" — shared by every page that builds
  // its own nav map (dashboard, the assessment wizard, results), so all of them light up identically.
  const moduleNav: Partial<Record<CompetencySection, () => void>> = {
    reports: () => setView({ name: 'reports' }),
    ...(isModuleAdmin
      ? {
          questionBank: () => setView({ name: 'questionBank' }),
          settings: () => setView({ name: 'settings' }),
        }
      : {}),
  }

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: COMPETENCY_ACCENT }} />
      </div>
    )
  }

  if (view.name === 'list') {
    return (
      <CompetencyDashboardPage
        onOpen={(id) => setView({ name: 'assessment', id })}
        onNew={() => setView({ name: 'new' })}
        onExitToHub={onExitToHub}
        nav={{ dashboard: () => setView({ name: 'list' }), ...moduleNav }}
      />
    )
  }

  if (view.name === 'assessment') {
    return (
      <AssessmentWizardPage
        assessmentId={view.id}
        onDone={() => setView({ name: 'list' })}
        onExitToHub={onExitToHub}
        onNew={() => setView({ name: 'new' })}
        moduleNav={moduleNav}
      />
    )
  }

  if (view.name === 'questionBank') {
    return <QuestionBankPage onExitToHub={onExitToHub} nav={{ dashboard: () => setView({ name: 'list' }), ...moduleNav }} />
  }

  if (view.name === 'reports') {
    return <CompetencyReportsPage onExitToHub={onExitToHub} nav={{ dashboard: () => setView({ name: 'list' }), ...moduleNav }} />
  }

  if (view.name === 'settings') {
    return <CompetencySettingsPage onExitToHub={onExitToHub} nav={{ dashboard: () => setView({ name: 'list' }), ...moduleNav }} />
  }

  // 'new' (profile intake) sits outside the six-section sidebar — it's a one-off flow reached from
  // the dashboard, not a candidate stage of an assessment that already exists.
  return (
    <div className="comp-shell flex h-screen w-screen flex-col overflow-y-auto p-4 sm:p-6" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <button onClick={() => setView({ name: 'list' })} className="mb-4 flex w-fit items-center gap-1.5 text-xs text-secondary hover:text-primary">
        <ArrowRight size={14} /> بازگشت به داشبورد
      </button>
      <div className="mx-auto w-full max-w-3xl">
        <ProfileForm
          submitLabel="ثبت مشخصات و شروع مصاحبه"
          onSubmit={async (profile) => {
            const id = await createAssessment(profile)
            if (id) setView({ name: 'assessment', id })
          }}
        />
      </div>
    </div>
  )
}
