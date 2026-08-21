import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { formatJalali } from '../../../lib/jalali'
import { ResponsiveTable, type ResponsiveTableColumn } from '../../../components/common/ResponsiveTable'
import type { RmProjectMember } from '../store/useRiskMembersStore'
import { RM_CATEGORY_LABEL_FA, RM_RISK_STATUS_COLOR, RM_RISK_STATUS_LABEL_FA } from '../types'
import { RISK_LEVEL_COLOR, RISK_LEVEL_LABEL_FA, isActionOverdue } from '../lib/riskScore'
import type { TopRiskRow } from '../lib/riskAnalytics'
import type { RmRiskAction } from '../types'

interface Row {
  rank: number
  risk: TopRiskRow['risk']
  score: number
  level: TopRiskRow['level']
  trend: TopRiskRow['trend']
  nextActionDueDate: TopRiskRow['nextActionDueDate']
  overdue: boolean
  ownerName: string
}

export function TopRisksTable({ rows, members, actions, onSelect }: { rows: TopRiskRow[]; members: RmProjectMember[]; actions: RmRiskAction[]; onSelect: (riskId: string) => void }) {
  const ownerName = (id: string | null) => (id ? members.find((m) => m.userId === id)?.fullName || members.find((m) => m.userId === id)?.email || '—' : '—')

  const tableRows: Row[] = rows.map(({ risk, score, level, trend, nextActionDueDate }, i) => ({
    rank: i + 1,
    risk,
    score,
    level,
    trend,
    nextActionDueDate,
    overdue: nextActionDueDate ? actions.some((a) => a.riskId === risk.id && a.dueDate === nextActionDueDate && isActionOverdue(a)) : false,
    ownerName: ownerName(risk.ownerId),
  }))

  const columns: ResponsiveTableColumn<Row>[] = [
    { key: 'rank', label: '#', render: (r) => <span className="num text-xs text-muted">{r.rank}</span> },
    {
      key: 'title',
      label: 'ریسک',
      primary: true,
      className: 'max-w-[14rem]',
      render: (r) => (
        <div>
          <p className="truncate text-xs font-medium">{r.risk.title}</p>
          <p className="num text-[10px] text-muted">{r.risk.code}</p>
        </div>
      ),
    },
    { key: 'owner', label: 'مالک', render: (r) => <span className="text-xs text-secondary">{r.ownerName}</span> },
    { key: 'category', label: 'دسته', render: (r) => <span className="text-xs text-secondary">{RM_CATEGORY_LABEL_FA[r.risk.category]}</span> },
    {
      key: 'score',
      label: 'امتیاز',
      primary: true,
      render: (r) => (
        <span className="num font-bold" style={{ color: RISK_LEVEL_COLOR[r.level] }}>
          {r.score}
          <span className="mr-1 text-[9px] font-normal opacity-80">{RISK_LEVEL_LABEL_FA[r.level]}</span>
        </span>
      ),
    },
    {
      key: 'trend',
      label: 'روند',
      render: (r) =>
        r.trend === 'improving' ? (
          <TrendingDown size={14} className="text-green-400" />
        ) : r.trend === 'worsening' ? (
          <TrendingUp size={14} className="text-red-400" />
        ) : (
          <Minus size={14} className="text-muted" />
        ),
    },
    {
      key: 'nextAction',
      label: 'اقدام بعدی',
      render: (r) => <span className={`num text-xs ${r.overdue ? 'font-bold text-red-400' : 'text-secondary'}`}>{r.nextActionDueDate ? formatJalali(r.nextActionDueDate) : '—'}</span>,
    },
    {
      key: 'status',
      label: 'وضعیت',
      render: (r) => (
        <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${RM_RISK_STATUS_COLOR[r.risk.status]}22`, color: RM_RISK_STATUS_COLOR[r.risk.status] }}>
          {RM_RISK_STATUS_LABEL_FA[r.risk.status]}
        </span>
      ),
    },
  ]

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <p className="px-4 py-2.5 text-sm font-bold border-b" style={{ borderColor: 'var(--border-soft)' }}>
        ۱۰ ریسک برتر
      </p>
      <ResponsiveTable columns={columns} rows={tableRows} rowKey={(r) => r.risk.id} onRowClick={(r) => onSelect(r.risk.id)} emptyText="ریسک فعالی ثبت نشده است" />
    </div>
  )
}
