import { useEffect, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useCompetencyStore } from './store/useCompetencyStore'
import { usePersonalityStore } from '../personality/store/usePersonalityStore'
import { useAuthStore } from '../../store/useAuthStore'
import { CompetencyDashboardPage } from './pages/CompetencyDashboardPage'
import { AssessmentWizardPage } from './pages/AssessmentWizardPage'
import { QuestionBankPage } from './pages/QuestionBankPage'
import { CompetencyReportsPage } from './pages/CompetencyReportsPage'
import { CompetencySettingsPage } from './pages/CompetencySettingsPage'
import { PersonalityReportsPage } from '../personality/pages/PersonalityReportsPage'
import { PersonalitySettingsPage } from '../personality/pages/PersonalitySettingsPage'
import { ProfileForm } from './components/ProfileForm'
import type { CompetencySection } from './components/CompetencySidebarShell'

export const COMPETENCY_ACCENT = '#a855f7'

type View =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'assessment'; id: string }
  // Hosts both the technical and the personality question banks as tabs on one page (see
  // QuestionBankPage.tsx) — `tab` lets a cross-link (e.g. from the personality settings/reports
  // pages) land directly on the personality tab instead of always defaulting to the technical one.
  | { name: 'questionBank'; tab?: 'technical' | 'personality' }
  | { name: 'reports' }
  | { name: 'settings' }
  // The personality module's own admin pages (reports/settings), reachable from this module's
  // sidebar/question bank now that the standalone Personality module has been merged in — see the
  // Exam Design Panel note in schema.sql Section 44. These pages already cross-navigate between
  // each other and the merged question bank via their own onNav* props.
  | { name: 'personalityReports' }
  | { name: 'personalitySettings' }

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
  // Fetched once here, app-wide, so every page under this tree (dashboard, wizard stages, question
  // bank, reports, settings) can read the job-role catalog straight from the store instead of each
  // needing its own fetch — replaces the old always-available JOB_ROLE_LABEL_FA/JOB_ROLES constants.
  const fetchJobRoleConfigs = useCompetencyStore((s) => s.fetchJobRoleConfigs)
  const myProfile = useAuthStore((s) => s.profile)

  // The personality module no longer has its own top-level entry point — its module-admin standing
  // is still its own (personality_is_module_admin), separate from the competency one above, so its
  // three admin pages below keep gating themselves against it rather than comp's isModuleAdmin.
  const personalityModuleAdmins = usePersonalityStore((s) => s.moduleAdmins)
  const fetchPersonalityModuleAdmins = usePersonalityStore((s) => s.fetchModuleAdmins)

  const [view, setView] = useState<View>({ name: 'list' })

  useEffect(() => {
    fetchAll()
    fetchModuleAdmins()
    fetchPersonalityModuleAdmins()
    fetchJobRoleConfigs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Module admins have the same standing as the system admin, but scoped to this module (see
  // comp_is_module_admin in schema.sql) — both can manage the question bank and module settings.
  const isModuleAdmin = Boolean(myProfile?.isAdmin) || moduleAdmins.some((m) => m.userId === myProfile?.id)
  const isPersonalityModuleAdmin = Boolean(myProfile?.isAdmin) || personalityModuleAdmins.some((m) => m.userId === myProfile?.id)

  // Settings is only ever reachable via an admin-gated nav button, but the module-admin flag can
  // still change under a viewer already sitting on this view (e.g. someone else revokes their
  // admin grant) — bounce them back to the dashboard the same instant, mirroring the old
  // PersonalityApp's own guard.
  useEffect(() => {
    if (view.name === 'personalitySettings' && !isPersonalityModuleAdmin) setView({ name: 'list' })
  }, [view.name, isPersonalityModuleAdmin])

  // The module-wide sidebar destinations beyond "داشبورد" — shared by every page that builds its
  // own nav map (dashboard, the assessment wizard, results), so all of them light up identically.
  // Question Bank is reachable by everyone now (spec section 12's Question Proposal Workflow — a
  // non-admin can propose a question there, just not edit the bank directly) and now hosts the
  // personality bank as its second tab too; Settings stays admin-only. personalityReports follows
  // the same everyone-can-open pattern as its competency counterpart — the personality page behind
  // it does its own admin-vs-proposer gating via isPersonalityModuleAdmin.
  const moduleNav: Partial<Record<CompetencySection, () => void>> = {
    reports: () => setView({ name: 'reports' }),
    questionBank: () => setView({ name: 'questionBank' }),
    personalityReports: () => setView({ name: 'personalityReports' }),
    ...(isModuleAdmin ? { settings: () => setView({ name: 'settings' }) } : {}),
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
    return (
      <QuestionBankPage
        onExitToHub={onExitToHub}
        nav={{ dashboard: () => setView({ name: 'list' }), ...moduleNav }}
        isModuleAdmin={isModuleAdmin}
        isPersonalityModuleAdmin={isPersonalityModuleAdmin}
        onNavPersonalitySettings={isPersonalityModuleAdmin ? () => setView({ name: 'personalitySettings' }) : undefined}
        initialTab={view.tab}
      />
    )
  }

  if (view.name === 'reports') {
    return <CompetencyReportsPage onExitToHub={onExitToHub} nav={{ dashboard: () => setView({ name: 'list' }), ...moduleNav }} />
  }

  if (view.name === 'settings') {
    return <CompetencySettingsPage onExitToHub={onExitToHub} nav={{ dashboard: () => setView({ name: 'list' }), ...moduleNav }} />
  }

  if (view.name === 'personalityReports') {
    return (
      <PersonalityReportsPage
        onExitToHub={onExitToHub}
        onNavDashboard={() => setView({ name: 'list' })}
        onNavQuestionBank={() => setView({ name: 'questionBank', tab: 'personality' })}
        onNavSettings={isPersonalityModuleAdmin ? () => setView({ name: 'personalitySettings' }) : undefined}
      />
    )
  }

  if (view.name === 'personalitySettings' && isPersonalityModuleAdmin) {
    return (
      <PersonalitySettingsPage
        onExitToHub={onExitToHub}
        onNavDashboard={() => setView({ name: 'list' })}
        onNavQuestionBank={() => setView({ name: 'questionBank', tab: 'personality' })}
      />
    )
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
