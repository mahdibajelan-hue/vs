import { useEffect, useState } from 'react'
import { usePersonalityStore } from './store/usePersonalityStore'
import { useAuthStore } from '../../store/useAuthStore'
import { PersonalityDashboardPage } from './pages/PersonalityDashboardPage'
import { PersonalityResultsPage } from './pages/PersonalityResultsPage'
import { PersonalityQuestionBankPage } from './pages/PersonalityQuestionBankPage'
import { PersonalityReportsPage } from './pages/PersonalityReportsPage'
import { PersonalitySettingsPage } from './pages/PersonalitySettingsPage'

type View = { name: 'list' } | { name: 'results'; id: string } | { name: 'questionBank' } | { name: 'reports' } | { name: 'settings' }

/** Personality & Behavioral Assessment module — entry point, mirroring CompetencyApp's
 * {onExitToHub} signature so RootApp wires it in exactly like every other module. */
export function PersonalityApp({ onExitToHub }: { onExitToHub: () => void }) {
  const moduleAdmins = usePersonalityStore((s) => s.moduleAdmins)
  const fetchModuleAdmins = usePersonalityStore((s) => s.fetchModuleAdmins)
  const myProfile = useAuthStore((s) => s.profile)

  const [view, setView] = useState<View>({ name: 'list' })

  useEffect(() => {
    fetchModuleAdmins()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Module admins have the same standing as the system admin, but scoped to this module (see
  // personality_is_module_admin in schema.sql) — both can manage the question bank and settings.
  const isModuleAdmin = Boolean(myProfile?.isAdmin) || moduleAdmins.some((m) => m.userId === myProfile?.id)

  // Settings is only ever reachable via an admin-gated nav button, but the module-admin flag can
  // still change under a viewer already sitting on this view (e.g. someone else revokes their
  // admin grant) — this bounces them back to the dashboard the same instant instead of leaving a
  // stale admin-only page mounted.
  useEffect(() => {
    if (view.name === 'settings' && !isModuleAdmin) setView({ name: 'list' })
  }, [view.name, isModuleAdmin])

  if (view.name === 'results') {
    return <PersonalityResultsPage personalityAssessmentId={view.id} onBack={() => setView({ name: 'list' })} />
  }

  if (view.name === 'questionBank') {
    return (
      <PersonalityQuestionBankPage
        onExitToHub={onExitToHub}
        onNavDashboard={() => setView({ name: 'list' })}
        onNavSettings={isModuleAdmin ? () => setView({ name: 'settings' }) : undefined}
        isModuleAdmin={isModuleAdmin}
      />
    )
  }

  if (view.name === 'reports') {
    return (
      <PersonalityReportsPage
        onExitToHub={onExitToHub}
        onNavDashboard={() => setView({ name: 'list' })}
        onNavQuestionBank={() => setView({ name: 'questionBank' })}
        onNavSettings={isModuleAdmin ? () => setView({ name: 'settings' }) : undefined}
      />
    )
  }

  if (view.name === 'settings' && isModuleAdmin) {
    return <PersonalitySettingsPage onExitToHub={onExitToHub} onNavDashboard={() => setView({ name: 'list' })} onNavQuestionBank={() => setView({ name: 'questionBank' })} />
  }

  return (
    <PersonalityDashboardPage
      onExitToHub={onExitToHub}
      onOpenResults={(id) => setView({ name: 'results', id })}
      onOpenQuestionBank={() => setView({ name: 'questionBank' })}
      onOpenReports={() => setView({ name: 'reports' })}
      onOpenSettings={isModuleAdmin ? () => setView({ name: 'settings' }) : undefined}
    />
  )
}
