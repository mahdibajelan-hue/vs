import { useEffect, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useCompetencyStore } from './store/useCompetencyStore'
import { useAuthStore } from '../../store/useAuthStore'
import { CompetencyDashboardPage } from './pages/CompetencyDashboardPage'
import { AssessmentWizardPage } from './pages/AssessmentWizardPage'
import { QuestionBankPage } from './pages/QuestionBankPage'
import { ProfileForm } from './components/ProfileForm'

export const COMPETENCY_ACCENT = '#a855f7'

type View = { name: 'list' } | { name: 'new' } | { name: 'assessment'; id: string } | { name: 'questionBank' }

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
  const myProfile = useAuthStore((s) => s.profile)

  const [view, setView] = useState<View>({ name: 'list' })

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        onOpenQuestionBank={myProfile?.isAdmin ? () => setView({ name: 'questionBank' }) : undefined}
        onExitToHub={onExitToHub}
        nav={{ dashboard: () => setView({ name: 'list' }) }}
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
      />
    )
  }

  // 'new' (profile intake) and 'questionBank' (admin question-bank management) sit outside the
  // six-section sidebar — they're one-off flows reached from the dashboard, not a candidate stage.
  return (
    <div className="comp-shell flex h-screen w-screen flex-col overflow-y-auto p-4 sm:p-6" style={{ background: 'var(--bg-app)', colorScheme: 'dark' }}>
      <button onClick={() => setView({ name: 'list' })} className="mb-4 flex w-fit items-center gap-1.5 text-xs text-secondary hover:text-primary">
        <ArrowRight size={14} /> بازگشت به داشبورد
      </button>
      {view.name === 'new' && (
        <div className="mx-auto w-full max-w-3xl">
          <ProfileForm
            submitLabel="ثبت مشخصات و شروع مصاحبه"
            onSubmit={async (profile) => {
              const id = await createAssessment(profile)
              if (id) setView({ name: 'assessment', id })
            }}
          />
        </div>
      )}
      {view.name === 'questionBank' && <QuestionBankPage onBack={() => setView({ name: 'list' })} />}
    </div>
  )
}
