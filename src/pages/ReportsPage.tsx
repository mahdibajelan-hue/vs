import { useMemo } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import type { Project } from '../types'
import { computeSCurve, computeWeldsBySize } from '../lib/progress'
import { SCurveChart } from '../components/Reports/SCurveChart'
import { WeldsBySizeChart } from '../components/Reports/WeldsBySizeChart'
import { LogsTable } from '../components/Reports/LogsTable'
import { MilestoneTimeline } from '../components/Reports/MilestoneTimeline'
import { ThreeWayComparisonChart } from '../components/Reports/ThreeWayComparisonChart'
import { exportProjectToExcel } from '../lib/export'

export function ReportsPage({ project }: { project: Project }) {
  const sCurve = useMemo(() => computeSCurve(project), [project])
  const weldsBySize = useMemo(() => computeWeldsBySize(project), [project])

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <MilestoneTimeline projectId={project.id} milestones={project.milestones} />

      <div className="flex items-center justify-between">
        <p className="text-sm text-secondary">تحلیل پیشرفت، جوشکاری و گزارش‌های تفکیکی پروژه {project.name}</p>
        <button
          onClick={() => exportProjectToExcel(project, `${project.name}-report.xlsx`)}
          className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
        >
          <FileSpreadsheet size={15} /> خروجی اکسل
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl p-4 h-72 flex flex-col">
          <p className="mb-2 text-sm font-bold">نمودار S-Curve — پیشرفت برنامه‌ای در برابر واقعی</p>
          <div className="flex-1 min-h-0">
            <SCurveChart data={sCurve} />
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-4 h-72 flex flex-col">
          <p className="mb-2 text-sm font-bold">تعداد سرجوش به تفکیک سایز لوله</p>
          <div className="flex-1 min-h-0">
            <WeldsBySizeChart data={weldsBySize} />
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 h-72 flex flex-col">
        <p className="mb-2 text-sm font-bold">مقایسه متراژ ثبت‌شده — پیمانکار، مشاور و کارفرما</p>
        <div className="flex-1 min-h-0">
          <ThreeWayComparisonChart project={project} />
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden" style={{ height: '480px' }}>
        <LogsTable project={project} />
      </div>
    </div>
  )
}
