import { useState } from 'react'
import { PersonalityDashboardPage } from './pages/PersonalityDashboardPage'
import { PersonalityResultsPage } from './pages/PersonalityResultsPage'

type View = { name: 'list' } | { name: 'results'; id: string }

/** Personality & Behavioral Assessment module — entry point, mirroring CompetencyApp's
 * {onExitToHub} signature so RootApp wires it in exactly like every other module. */
export function PersonalityApp({ onExitToHub }: { onExitToHub: () => void }) {
  const [view, setView] = useState<View>({ name: 'list' })

  if (view.name === 'results') {
    return <PersonalityResultsPage personalityAssessmentId={view.id} onBack={() => setView({ name: 'list' })} />
  }

  return <PersonalityDashboardPage onExitToHub={onExitToHub} onOpenResults={(id) => setView({ name: 'results', id })} />
}
