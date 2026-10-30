import { useMemo } from 'react'
import { AlertOctagon, FileWarning, ShieldAlert, ShieldQuestion } from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { RiskHeatMap } from '../../risk/components/RiskHeatMap'
import type { RmRisk, RmRiskAssessment } from '../../risk/types'
import type { ProjectDashboardSummary } from '../../reporting/lib/portfolioDashboard'
import { DependencyWidget, RiskExposureTrendWidget } from '../components/PortfolioWidgets'
import type { PfProjectView } from '../lib/portfolioCore'
import { Empty, faNum, HealthChip, Kpi, Panel } from '../components/pfUi'
import { Donut } from '../components/viz'
import { useDrill } from '../components/DrillSheet'

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
  const { drill, open } = useDrill()
  const pid = (l: PfProjectView[]) => l.map((v) => v.input.id)
  const hot = views.filter((v) => v.input.riskLevel === 'critical' || v.input.riskLevel === 'high')

  return (
    <div className="pf-stack">
      <div className="pf-kpis">
        <Kpi icon={<FileWarning size={14} />} label="ریسک در محدوده" value={risks.length} sub="از ثبت‌نامهٔ ریسک پروژه‌ها" tone="#f97316" />
        <Kpi icon={<AlertOctagon size={14} />} label="پروژه با ریسک بحرانی" value={byLevel[0].list.length} sub="بالاترین ریسک فعال: بحرانی" tone="#ef4444" onClick={byLevel[0].list.length ? () => drill('پروژه‌های دارای ریسک بحرانی', pid(byLevel[0].list)) : undefined} />
        <Kpi icon={<ShieldAlert size={14} />} label="بحرانی یا بالا" value={hot.length} sub={`از ${faNum(views.length)} پروژه`} tone="#f59e0b" onClick={hot.length ? () => drill('پروژه‌های با ریسک بحرانی یا بالا', pid(hot)) : undefined} />
        <Kpi icon={<ShieldQuestion size={14} />} label="بدون ریسک ثبت‌شده" value={noRegister.length} sub="نبود ریسک به معنی کم‌ریسک بودن نیست" tone="#64748b" onClick={noRegister.length ? () => drill('پروژه‌های بدون ریسک ثبت‌شده', pid(noRegister)) : undefined} />
      </div>
      <div className="pf-grid-2">
        <RiskHeatMap risks={risks} assessments={assessments} activeCell={null} onCellClick={() => {}} />
        <Panel title="پروژه‌ها بر اساس بالاترین ریسک فعال" icon={<ShieldAlert size={15} />} hint="سطح هر ریسک از ارزیابی جاری آن در ماژول مدیریت ریسک.">
          <Donut size={150} sub="پروژه" onPick={(l) => { if (l) { const g = byLevel.find((x) => x.l === l); if (g) drill(`بالاترین ریسک: ${LEVEL_FA[l].label}`, pid(g.list)) } }}
            parts={[...byLevel.map(({ l, list }) => ({ key: l, label: LEVEL_FA[l].label, value: list.length, color: LEVEL_FA[l].color })), { key: 'none', label: 'بدون ریسک ثبت‌شده', value: noRegister.length, color: '#64748b' }]} />
          <div className="pf-risk-cols">
            {byLevel.map(({ l, list }) => (
              <div key={l}>
                <p className="pf-risk-h" style={{ color: LEVEL_FA[l].color }}>{LEVEL_FA[l].label} <span className="pf-muted">({faNum(list.length)})</span></p>
                <ul>{list.map((v) => <li key={v.input.id}><button type="button" className="vz-link truncate" onClick={() => open(v.input.id)}>{v.input.name}</button><HealthChip health={v.health} /></li>)}</ul>
              </div>
            ))}
          </div>
          {noRegister.length > 0 && <p className="pf-note">{faNum(noRegister.length)} پروژه هیچ ریسک فعالی ثبت نکرده‌اند ({noRegister.map((v) => v.input.name).slice(0, 4).join('، ')}{noRegister.length > 4 ? '، …' : ''}) — نبود ریسک ثبت‌شده به معنی کم‌ریسک بودن نیست.</p>}
        </Panel>
      </div>
      <div className="pf-grid-2">
        <RiskExposureTrendWidget risks={risks} assessments={assessments} />
        {scopedSummaries.length ? <DependencyWidget dependencies={dependencies} summaries={scopedSummaries} allProjects={projects} onDrillProject={open} /> : <Empty>پروژه‌ای نیست.</Empty>}
      </div>
    </div>
  )
}
