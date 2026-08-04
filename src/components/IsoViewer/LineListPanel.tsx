import { useMemo, useState } from 'react'
import { Search, PlusCircle } from 'lucide-react'
import type { IsoLine, LineStatus } from '../../types'
import { STATUS_LABEL_FA } from '../../types'
import type { LineProgress } from '../../lib/progress'
import { StatusDot } from '../common/StatusBadge'

interface LineListPanelProps {
  lines: IsoLine[]
  progressMap: Map<string, LineProgress>
  selectedLineId: string | null
  onSelectLine: (lineId: string) => void
  onLogLine: (lineId: string) => void
  editable?: boolean
}

export function LineListPanel({ lines, progressMap, selectedLineId, onSelectLine, onLogLine, editable = true }: LineListPanelProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<LineStatus | 'all'>('all')

  const filtered = useMemo(() => {
    return lines.filter((l) => {
      const p = progressMap.get(l.id)
      const status = p?.status ?? l.status
      if (statusFilter !== 'all' && status !== statusFilter) return false
      if (!query.trim()) return true
      const q = query.trim().toLowerCase()
      return (
        l.svgElementId.toLowerCase().includes(q) ||
        l.service.toLowerCase().includes(q) ||
        l.contractor.toLowerCase().includes(q) ||
        l.size.toLowerCase().includes(q)
      )
    })
  }, [lines, progressMap, query, statusFilter])

  return (
    <div className="flex h-full flex-col">
      <div className="p-3 space-y-2 border-b" style={{ borderColor: 'var(--border-soft)' }}>
        <div className="relative">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی خط، سایز، پیمانکار..."
            className="w-full rounded-lg bg-black/20 border border-white/10 pr-9 pl-3 py-2 text-sm outline-none focus:border-brand-400 transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LineStatus | 'all')}
          className="w-full rounded-lg bg-black/20 border border-white/10 px-3 py-1.5 text-xs outline-none focus:border-brand-400"
        >
          <option value="all">همه وضعیت‌ها</option>
          {(Object.keys(STATUS_LABEL_FA) as LineStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL_FA[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filtered.length === 0 && (
          <p className="text-center text-xs text-muted py-8">خطی یافت نشد</p>
        )}
        {filtered.map((line) => {
          const p = progressMap.get(line.id)
          const percent = p?.percent ?? 0
          const status = p?.status ?? line.status
          const isSelected = selectedLineId === line.id
          return (
            <div
              key={line.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectLine(line.id)}
              onDoubleClick={() => editable && onLogLine(line.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectLine(line.id)
              }}
              className={`w-full cursor-pointer rounded-xl p-2.5 text-right transition-colors border ${
                isSelected
                  ? 'bg-brand-500/15 border-brand-400/40'
                  : 'bg-white/[0.02] border-transparent hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <StatusDot status={status} />
                  <span className="text-sm font-medium truncate">{line.svgElementId}</span>
                </div>
                {editable && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onLogLine(line.id)
                    }}
                    className="shrink-0 text-brand-400 hover:text-brand-300"
                    title="ثبت کارکرد روزانه"
                  >
                    <PlusCircle size={16} />
                  </button>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-secondary">
                <span>{line.size}</span>
                <span className="text-muted">·</span>
                <span className="truncate">{line.service}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-brand-400 to-brand-500"
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted num">
                <span>{p?.lengthDone ?? 0}m / {line.plannedLength}m</span>
                <span>{percent}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
