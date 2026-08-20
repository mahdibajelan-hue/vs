import { useEffect, useState } from 'react'
import { Award, Home, Loader2 } from 'lucide-react'
import { useCompetencyStore } from './store/useCompetencyStore'
import { StorageErrorBanner } from '../../components/Layout/StorageErrorBanner'
import { SignOutButton } from '../../components/Auth/SignOutButton'
import { AssessmentsListPage } from './pages/AssessmentsListPage'
import { AssessmentWizardPage } from './pages/AssessmentWizardPage'
import { ProfileForm } from './components/ProfileForm'

export const COMPETENCY_ACCENT = '#a855f7'

type View = { name: 'list' } | { name: 'new' } | { name: 'assessment'; id: string }

/**
 * Competency Assessment — structured interview/scoring tool for evaluating gas transmission
 * pipeline construction project manager candidates across 7 fixed competency domains
 * (see lib/competencyModel.ts), producing a radar-chart report per candidate.
 */
export function CompetencyApp({ onExitToHub }: { onExitToHub: () => void }) {
  const loading = useCompetencyStore((s) => s.loading)
  const fetchAll = useCompetencyStore((s) => s.fetchAll)
  const createAssessment = useCompetencyStore((s) => s.createAssessment)

  const [view, setView] = useState<View>({ name: 'list' })

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: COMPETENCY_ACCENT }} />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2 glass-panel !rounded-none border-t-0 border-x-0 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: `${COMPETENCY_ACCENT}55`, background: `${COMPETENCY_ACCENT}1a` }}>
            <Award size={18} style={{ color: COMPETENCY_ACCENT }} />
          </div>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-extrabold">ارزیابی شایستگی</p>
            <p className="text-[10px] text-muted" dir="ltr">
              Competency Assessment
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button onClick={onExitToHub} className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1.5 text-xs text-secondary hover:bg-white/5 sm:px-3">
            <Home size={13} /> <span className="hidden sm:inline">بازگشت به ماژول‌ها</span>
          </button>
          <SignOutButton className="flex items-center gap-1.5 rounded-full border border-red-400/25 px-2 py-1.5 text-xs text-red-300 hover:bg-red-500/10 sm:px-3" />
        </div>
      </header>

      <StorageErrorBanner />

      <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-16 sm:p-4 lg:pb-4">
        {view.name === 'list' && <AssessmentsListPage onOpen={(id) => setView({ name: 'assessment', id })} onNew={() => setView({ name: 'new' })} />}

        {view.name === 'new' && (
          <div className="mx-auto max-w-3xl">
            <ProfileForm
              submitLabel="ثبت مشخصات و شروع مصاحبه"
              onSubmit={async (profile) => {
                const id = await createAssessment(profile)
                if (id) setView({ name: 'assessment', id })
              }}
            />
          </div>
        )}

        {view.name === 'assessment' && <AssessmentWizardPage assessmentId={view.id} onDone={() => setView({ name: 'list' })} />}
      </div>
    </div>
  )
}
