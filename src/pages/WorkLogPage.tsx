import type { Project } from '../types'
import { LogsTable } from '../components/Reports/LogsTable'
import { DeletedLogsPanel } from '../components/Reports/DeletedLogsPanel'
import { ThreeWayComparisonChart } from '../components/Reports/ThreeWayComparisonChart'

export function WorkLogPage({ project }: { project: Project }) {
  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <p className="text-sm text-secondary">
        کارکرد روزانه ثبت‌شده توسط پیمانکار، به همراه مقدار تایید‌شده توسط مشاور و — در صورت ممیزی — اصلاح‌شده توسط کارفرما.
      </p>

      <div className="glass-panel rounded-2xl p-4 h-72 flex flex-col">
        <p className="mb-2 text-sm font-bold">مقایسه متراژ ثبت‌شده — پیمانکار، مشاور و کارفرما</p>
        <div className="flex-1 min-h-0">
          <ThreeWayComparisonChart project={project} />
        </div>
      </div>

      <DeletedLogsPanel project={project} />

      <div className="glass-panel rounded-2xl overflow-hidden" style={{ height: '520px' }}>
        <LogsTable project={project} />
      </div>
    </div>
  )
}
