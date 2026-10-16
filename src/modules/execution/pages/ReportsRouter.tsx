import { PeriodReportsPage } from './PeriodReportsPage'
import { StatementPage } from './StatementPage'
import { DelaysPage } from './DelaysPage'
import { LedgerPage } from './LedgerPage'
import { ContractStatementPage } from './ContractStatementPage'
import { ArchivePage } from './ArchivePage'
import { MgmtReportPage } from './MgmtReportPage'
import { PersonnelReport } from './PersonnelReport'
import { MrsReport } from './MrsReport'

/** «گزارش‌های دوره‌ای»: week / month / cumulative reports, the work-done statement and the delay & claim register. */
export function ReportsRouter({ projectId, sub }: { projectId: string; sub: string }) {
  if (sub === 'statement') return <StatementPage projectId={projectId} />
  if (sub === 'mgmt-week' || sub === 'mgmt-month') return <MgmtReportPage projectId={projectId} sub={sub} />
  if (sub === 'contract') return <ContractStatementPage projectId={projectId} />
  if (sub === 'personnel') return <PersonnelReport projectId={projectId} />
  if (sub === 'mrs') return <MrsReport projectId={projectId} />
  if (sub === 'archive') return <ArchivePage projectId={projectId} />
  if (sub === 'ledger') return <LedgerPage projectId={projectId} />
  if (sub === 'delays') return <DelaysPage projectId={projectId} />
  return <PeriodReportsPage projectId={projectId} sub={sub} />
}
