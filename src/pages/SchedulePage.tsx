import { useMemo, useState } from 'react'
import { CalendarClock, Gauge, TrendingDown, Flag, AlarmClockOff } from 'lucide-react'
import type { IsoLine, Project } from '../types'
import { computeProjectSchedule, computeActivityStatus, ACTIVITY_STATUS_COLOR } from '../lib/schedule'
import { formatJalali } from '../lib/jalali'
import { KpiCard } from '../components/Dashboard/KpiCard'
import { GanttChart } from '../components/Schedule/GanttChart'
import { ScheduleEditModal } from '../components/Schedule/ScheduleEditModal'

export function SchedulePage({ project }: { project: Project }) {
  const [editingLine, setEditingLine] = useState<IsoLine | null>(null)
  const summary = useMemo(() => computeProjectSchedule(project), [project])

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="grid grid-cols-5 gap-3">
        <KpiCard label="پیشرفت برنامه‌ای (تا امروز)" value={`${summary.overallPlannedPercent}%`} icon={CalendarClock} accent="#f1c40f" />
        <KpiCard label="پیشرفت واقعی" value={`${summary.overallActualPercent}%`} icon={Gauge} accent="#3498db" />
        <KpiCard
          label="نسبت تحقق برنامه"
          value={summary.achievementRatio === null ? '—' : `${summary.achievementRatio}%`}
          icon={TrendingDown}
          accent={summary.achievementRatio !== null && summary.achievementRatio < 90 ? '#e74c3c' : '#2ecc71'}
        />
        <KpiCard label="تاخیر کل پروژه" value={summary.totalDelayDays > 0 ? `${summary.totalDelayDays} روز` : 'بدون تاخیر'} icon={AlarmClockOff} accent={summary.totalDelayDays > 0 ? '#e74c3c' : '#2ecc71'} />
        <KpiCard
          label="پیش‌بینی پایان پروژه"
          value={summary.forecastEnd ? formatJalali(summary.forecastEnd) : '—'}
          sub={summary.plannedProjectEnd ? `برنامه: ${formatJalali(summary.plannedProjectEnd)}` : undefined}
          icon={Flag}
          accent="#a78bfa"
        />
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100% - 108px)' }}>
        <div className="w-72 shrink-0 glass-panel rounded-2xl overflow-hidden flex flex-col">
          <p className="px-3 py-2.5 text-xs font-bold text-secondary border-b" style={{ borderColor: 'var(--border-soft)' }}>
            انتخاب خط برای تنظیم برنامه
          </p>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {project.lines.length === 0 && <p className="text-center text-xs text-muted py-8">ابتدا خطوطی به پروژه اضافه کنید</p>}
            {project.lines.map((line) => {
              const lineSchedules = project.schedules.filter((s) => s.lineId === line.id)
              const worstDelay = lineSchedules.some((s) => computeActivityStatus(s) === 'delayed')
              const configured = lineSchedules.filter((s) => s.plannedStart && s.plannedEnd).length
              return (
                <button
                  key={line.id}
                  onClick={() => setEditingLine(line)}
                  className="w-full rounded-xl p-2.5 text-right bg-white/[0.02] hover:bg-white/[0.06] transition-colors border border-transparent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{line.svgElementId}</span>
                    {worstDelay && (
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: ACTIVITY_STATUS_COLOR.delayed }} />
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{configured} / 3 فعالیت تنظیم شده</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 glass-panel rounded-2xl p-3 min-w-0">
          <GanttChart project={project} lines={project.lines} schedules={project.schedules} />
        </div>
      </div>

      {editingLine && (
        <ScheduleEditModal
          projectId={project.id}
          line={editingLine}
          schedules={project.schedules.filter((s) => s.lineId === editingLine.id)}
          onClose={() => setEditingLine(null)}
        />
      )}
    </div>
  )
}
