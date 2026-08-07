import { useMemo, useState } from 'react'
import { ShieldCheck, Check, Wrench } from 'lucide-react'
import type { IsoLine, Project } from '../types'
import { ACTIVITY_KINDS } from '../types'
import { computeActivityStatus, ACTIVITY_STATUS_COLOR, withComputedActuals } from '../lib/schedule'
import { GanttChart } from '../components/Schedule/GanttChart'
import { ScheduleEditModal } from '../components/Schedule/ScheduleEditModal'
import { useCurrentRole } from '../store/useMembersStore'
import { useAuthStore } from '../store/useAuthStore'
import { useStore } from '../store/useStore'
import { canEdit, canAudit } from '../lib/permissions'
import { SYMBOL_CATEGORY_COLOR, SYMBOL_CATEGORY_LABEL, type SymbolCategory } from '../data/pipingSymbols'
import { formatJalali } from '../lib/jalali'

export function SchedulePage({ project }: { project: Project }) {
  const [editingLine, setEditingLine] = useState<IsoLine | null>(null)
  const role = useCurrentRole()
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const editable = canEdit(role, isAdmin)
  const canApproveOverall = canAudit(role) || isAdmin
  const approveScheduleAsOwner = useStore((s) => s.approveScheduleAsOwner)

  const computedSchedules = useMemo(() => withComputedActuals(project), [project])

  const equipmentByCategory = useMemo(() => {
    const byCategory = new Map<SymbolCategory, { label: string; lineLabel: string }[]>()
    for (const item of project.equipment) {
      const line = project.lines.find((l) => l.id === item.lineId)
      const entry = { label: item.label, lineLabel: line?.svgElementId ?? '—' }
      const list = byCategory.get(item.category) ?? []
      list.push(entry)
      byCategory.set(item.category, list)
    }
    return byCategory
  }, [project.equipment, project.lines])

  return (
    <div className="h-full overflow-y-auto p-4">
      {canApproveOverall && (
        <div className="mb-4 glass-panel rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={18} className={project.scheduleApprovedAt ? 'text-green-400' : 'text-muted'} />
            <div>
              <p className="text-sm font-bold">تایید نهایی کارفرما بر کلیت برنامه زمان‌بندی</p>
              <p className="text-[11px] text-muted">
                {project.scheduleApprovedAt
                  ? `تایید شده در ${formatJalali(project.scheduleApprovedAt.slice(0, 10))} — با هر ویرایش جدید در برنامه، این تاییدیه باطل می‌شود`
                  : 'مراحل قبلی: پیمانکار برنامه را وارد می‌کند، مشاور هر ردیف را تایید می‌کند. این دکمه فقط برای کارفرما (یا ادمین) است.'}
              </p>
            </div>
          </div>
          {project.scheduleApprovedAt ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-green-400/40 bg-green-500/10 px-3 py-1.5 text-xs text-green-300">
              <Check size={13} /> تایید شده
            </span>
          ) : (
            <button
              onClick={() => approveScheduleAsOwner(project.id)}
              className="shrink-0 flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
            >
              <ShieldCheck size={14} /> تایید کلیت برنامه
            </button>
          )}
        </div>
      )}

      <div className="flex gap-4" style={{ height: 'calc(100% - 0px)', minHeight: 420 }}>
        <div className="w-64 shrink-0 glass-panel rounded-2xl overflow-hidden flex flex-col">
          <p className="px-3 py-2.5 text-xs font-bold text-secondary border-b" style={{ borderColor: 'var(--border-soft)' }}>
            {editable ? 'انتخاب خط برای تنظیم برنامه' : 'خطوط پروژه'}
          </p>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {project.lines.length === 0 && <p className="text-center text-xs text-muted py-8">ابتدا خطوطی به پروژه اضافه کنید</p>}
            {project.lines.map((line) => {
              const lineSchedules = computedSchedules.filter((s) => s.lineId === line.id)
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
                  <p className="mt-0.5 text-[11px] text-muted">
                    {configured} / {ACTIVITY_KINDS.length} فعالیت تنظیم شده
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {project.equipment.length > 0 && (
          <div className="w-56 shrink-0 glass-panel rounded-2xl overflow-hidden flex flex-col">
            <p className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-secondary border-b" style={{ borderColor: 'var(--border-soft)' }}>
              <Wrench size={13} /> تجهیزات و شیرآلات
            </p>
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {[...equipmentByCategory.entries()].map(([category, items]) => (
                <div key={category}>
                  <p className="mb-1 px-1 text-[10px] font-bold" style={{ color: SYMBOL_CATEGORY_COLOR[category] }}>
                    {SYMBOL_CATEGORY_LABEL[category]} ({items.length})
                  </p>
                  <div className="space-y-0.5">
                    {items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] hover:bg-white/[0.03]">
                        <span className="truncate">{it.label}</span>
                        <span className="shrink-0 text-muted num">{it.lineLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 glass-panel rounded-2xl p-3 min-w-0">
          <GanttChart project={project} lines={project.lines} schedules={computedSchedules} />
        </div>
      </div>

      {editingLine && (
        <ScheduleEditModal
          projectId={project.id}
          line={editingLine}
          schedules={computedSchedules.filter((s) => s.lineId === editingLine.id)}
          onClose={() => setEditingLine(null)}
        />
      )}
    </div>
  )
}
