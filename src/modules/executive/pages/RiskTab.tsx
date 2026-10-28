import { useMemo } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { RiskHeatMap } from '../../risk/components/RiskHeatMap'
import type { RmRisk, RmRiskAssessment } from '../../risk/types'
import type { ProjectDashboardSummary } from '../../reporting/lib/portfolioDashboard'
import { DependencyWidget, RiskExposureTrendWidget } from '../../reporting/pages/PortfolioDashboardPage'
import type { PfProjectView } from '../lib/portfolioCore'
import { Empty, faNum, HealthChip, Panel } from '../components/pfUi'

const LEVEL_FA: Record<string, { label: string; color: string }> = {
  critical: { label: 'بحرانی', color: '#ef4444' }, high: { label: 'بالا', color: '#f97316' }, medium: { label: 'متوسط', color: '#f5b31b' }, low: { label: 'کم', color: '#22c55e' },
}

/** Where the portfolio's risk sits: the heat map of every active risk, the exposure trend, projects by their highest risk, and cascading-delay dependencies. */
export function RiskTab({ views, risks, assessments, summaries }: { views: PfProjectView[]; risks: RmRisk[]; assessments: RmRiskAssessment[]; summaries: ProjectDashboardSummary[] }) {
  const projects = useMasterDataStore((s) => s.projects)
  const dependencies = useMasterDataStore((s) => s.dependencies)
  const ids = useMemo(() => new Set(views.map((v) => v.input.id)), [views])
  const scopedSummaries = useMemo(() => summaries.filter((s) => ids.has(s.masterProjectId)), [summaries, ids])
  const byLevel = (['critical', 'high', 'medium', 'low'] as const).map((l) => ({ l, list: views.filter((v) => v.input.riskLevel === l) }))
  const noRegister = views.filter((v) => !v.input.riskLevel)

  return (
    <div className="pf-stack">
      <div className="pf-grid-2">
        <RiskHeatMap risks={risks} assessments={assessments} activeCell={null} onCellClick={() => {}} />
        <Panel title="پروژه‌ها بر اساس بالاترین ریسک فعال" icon={<ShieldAlert size={15} />} hint="سطح هر ریسک از ارزیابی جاری آن در ماژول مدیریت ریسک.">
          <div className="pf-risk-cols">
            {byLevel.map(({ l, list }) => (
              <div key={l}>
                <p className="pf-risk-h" style={{ color: LEVEL_FA[l].color }}>{LEVEL_FA[l].label} <span className="pf-muted">({faNum(list.length)})</span></p>
                <ul>{list.map((v) => <li key={v.input.id}><span className="truncate">{v.input.name}</span><HealthChip health={v.health} /></li>)}</ul>
              </div>
            ))}
          </div>
          {noRegister.length > 0 && <p className="pf-note">{faNum(noRegister.length)} پروژه هیچ ریسک فعالی ثبت نکرده‌اند ({noRegister.map((v) => v.input.name).slice(0, 4).join('، ')}{noRegister.length > 4 ? '، …' : ''}) — نبود ریسک ثبت‌شده به معنی کم‌ریسک بودن نیست.</p>}
        </Panel>
      </div>
      <div className="pf-grid-2">
        <RiskExposureTrendWidget risks={risks} assessments={assessments} />
        {scopedSummaries.length ? <DependencyWidget dependencies={dependencies} summaries={scopedSummaries} allProjects={projects} onDrillProject={() => {}} /> : <Empty>پروژه‌ای نیست.</Empty>}
      </div>
    </div>
  )
}
