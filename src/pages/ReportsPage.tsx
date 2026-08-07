import { useMemo } from 'react'
import { FileSpreadsheet, CalendarClock, Gauge, TrendingDown, AlarmClockOff } from 'lucide-react'
import type { Project } from '../types'
import { computeWeldsBySize } from '../lib/progress'
import { computeProjectSchedule, computeScheduleSCurve } from '../lib/schedule'
import { SCurveChart } from '../components/Reports/SCurveChart'
import { WeldsBySizeChart } from '../components/Reports/WeldsBySizeChart'
import { MilestoneTimeline } from '../components/Reports/MilestoneTimeline'
import { KpiCard } from '../components/Dashboard/KpiCard'
import { CountdownWidget } from '../components/Schedule/CountdownWidget'
import { exportProjectToExcel } from '../lib/export'

export function ReportsPage({ project }: { project: Project }) {
  const weldsBySize = useMemo(() => computeWeldsBySize(project), [project])
  const summary = useMemo(() => computeProjectSchedule(project), [project])
  const scheduleSCurve = useMemo(() => computeScheduleSCurve(project), [project])

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-[280px_repeat(4,1fr)]">
        <div className="col-span-2 md:col-span-1">
          <CountdownWidget summary={summary} />
        </div>
        <KpiCard label="پیشرفت برنامه‌ای (تا امروز)" value={`${summary.overallPlannedPercent}%`} icon={CalendarClock} accent="#f1c40f" />
        <KpiCard label="پیشرفت واقعی" value={`${summary.overallActualPercent}%`} icon={Gauge} accent="#3498db" />
        <KpiCard
          label="نسبت تحقق برنامه"
          value={summary.achievementRatio === null ? '—' : `${summary.achievementRatio}%`}
          icon={TrendingDown}
          accent={summary.achievementRatio !== null && summary.achievementRatio < 90 ? '#e74c3c' : '#2ecc71'}
        />
        <KpiCard
          label="تاخیر کل پروژه"
          value={summary.totalDelayDays > 0 ? `${summary.totalDelayDays} روز` : 'بدون تاخیر'}
          icon={AlarmClockOff}
          accent={summary.totalDelayDays > 0 ? '#e74c3c' : '#2ecc71'}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl p-4 h-72 flex flex-col">
          <p className="mb-2 text-sm font-bold">S-Curve برنامه زمان‌بندی — پیشرفت فعالیت‌های زمان‌بندی‌شده (جوشکاری/NDT/پوشش)</p>
          <div className="flex-1 min-h-0">
            <SCurveChart data={scheduleSCurve} />
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-4 h-72 flex flex-col">
          <p className="mb-2 text-sm font-bold">تعداد سرجوش به تفکیک سایز لوله</p>
          <div className="flex-1 min-h-0">
            <WeldsBySizeChart data={weldsBySize} />
          </div>
        </div>
      </div>
    </div>
  )
}
