import { useMemo } from 'react'
import { useMasterDataStore } from '../../../masterdata/store/useMasterDataStore'
import { useFinanceStore } from '../../store/useFinanceStore'
import { daysBetween } from '../../lib/financeControl'
import { useThresholds } from '../../lib/useThresholds'
import { fmtCurrency, fmtDate } from '../../components/FinanceKpiTile'
import type { FinPaymentCertificate } from '../../types'

const COLS: { key: string; label: string; statuses: string[]; sla?: 'submitted' | 'under_review' | 'certified'; since: (c: FinPaymentCertificate) => string | null }[] = [
  { key: 'submitted', label: 'ارائه‌شده', statuses: ['submitted'], sla: 'submitted', since: (c) => c.submittedDate },
  { key: 'review', label: 'در بررسی', statuses: ['under_review'], sla: 'under_review', since: (c) => c.submittedDate },
  { key: 'certified', label: 'تأییدشده، پرداخت‌نشده', statuses: ['certified'], sla: 'certified', since: (c) => c.approvedDate ?? c.certifiedDate },
  { key: 'partial', label: 'پرداخت جزئی', statuses: ['partially_paid'], since: (c) => c.certifiedDate },
  { key: 'paid', label: 'پرداخت‌شده', statuses: ['paid'], since: (c) => c.paidDate },
]

/** Where every payment certificate stands in the flow (submit → review → certified/deductions → partial/final payment), and how long it has been there against the SLA in force. */
export function PipelinePage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const contracts = useFinanceStore((s) => s.contracts).filter((c) => c.masterProjectId === masterProjectId)
  const certificates = useFinanceStore((s) => s.certificates)
  const { thresholds } = useThresholds()
  const today = new Date().toISOString().slice(0, 10)
  const ids = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts])
  const mine = certificates.filter((c) => ids.has(c.contractId))
  if (!project) return null
  return (
    <div className="space-y-4">
      <div className="fin-card p-4"><p className="fin-text-muted text-xs">گردش صورت‌وضعیت‌ها و زمان سپری‌شده در هر مرحله</p><h1 className="fin-text mt-1 text-lg font-extrabold">{project.officialName}</h1></div>
      <div className="grid gap-3 lg:grid-cols-5">
        {COLS.map((col) => {
          const list = mine.filter((c) => col.statuses.includes(c.status))
          return (
            <div key={col.key} className="fin-card space-y-2 p-3">
              <p className="flex items-center justify-between text-xs font-extrabold">{col.label}<span className="num fin-text-muted">{list.length.toLocaleString('fa-IR')}</span></p>
              {list.length === 0 && <p className="py-4 text-center text-[11px] fin-text-muted">—</p>}
              {list.slice(0, 30).map((c) => {
                const since = col.since(c)
                const days = since ? daysBetween(today, since) : null
                const limit = col.sla ? thresholds.stageSlaDays[col.sla] : null
                const late = days != null && limit != null && days > limit
                return (
                  <div key={c.id} className="rounded-lg border p-2 text-[11px]" style={{ borderColor: late ? '#b5573a88' : 'var(--fin-divider)' }}>
                    <p className="font-bold">{ids.get(c.contractId)?.contractNumber || ids.get(c.contractId)?.title} · ص‌و {c.certificateNumber}</p>
                    <p className="num fin-text-secondary">{fmtCurrency(c.certifiedAmount ?? c.grossAmount)}</p>
                    {c.deductions + c.retentionAmount + c.advanceRecoveryAmount > 0 && <p className="num fin-text-muted">کسورات و کسر پیش‌پرداخت/حسن انجام: {fmtCurrency(c.deductions + c.retentionAmount + c.advanceRecoveryAmount)}</p>}
                    {days != null && <p className="num" style={{ color: late ? '#b5573a' : 'var(--fin-text-muted)' }}>{days.toLocaleString('fa-IR')} روز{limit != null ? ` از ${limit.toLocaleString('fa-IR')}` : ''} · از {fmtDate(since)}</p>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
