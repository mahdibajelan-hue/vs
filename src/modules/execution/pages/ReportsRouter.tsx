import { PeriodReportsPage } from './PeriodReportsPage'
import { StatementPage } from './StatementPage'
import { DelaysPage } from './DelaysPage'

/** «گزارش‌های دوره‌ای»: week / month / cumulative reports, the work-done statement and the delay & claim register. */
export function ReportsRouter({ projectId, sub }: { projectId: string; sub: string }) {
  if (sub === 'statement') return <StatementPage projectId={projectId} />
  if (sub === 'delays') return <DelaysPage projectId={projectId} />
  return <PeriodReportsPage projectId={projectId} sub={sub} />
}
