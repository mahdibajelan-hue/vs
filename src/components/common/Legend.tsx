import { STATUS_COLOR, STATUS_LABEL_FA, type LineStatus } from '../../types'

const ORDER: LineStatus[] = ['completed', 'in_progress', 'testing', 'not_started']

export function Legend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {ORDER.map((status) => (
        <div key={status} className="flex items-center gap-1.5 text-xs">
          <span className="h-2.5 w-4 rounded-full" style={{ background: STATUS_COLOR[status] }} />
          <span className="text-secondary">{STATUS_LABEL_FA[status]}</span>
        </div>
      ))}
    </div>
  )
}
