import { useState } from 'react'
import { Modal } from '../common/Modal'
import { JalaliDateInput } from '../common/JalaliDateInput'
import { ACTIVITY_KINDS, ACTIVITY_LABEL_FA, type ActivityKind, type ActivitySchedule, type IsoLine } from '../../types'
import { useStore } from '../../store/useStore'
import { computeActivityStatus, ACTIVITY_STATUS_COLOR, ACTIVITY_STATUS_LABEL_FA } from '../../lib/schedule'

interface FormRow {
  plannedStart: string
  plannedEnd: string
  actualStart: string
  actualEnd: string
  percentComplete: number
}

function emptyRow(): FormRow {
  return { plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '', percentComplete: 0 }
}

interface ScheduleEditModalProps {
  projectId: string
  line: IsoLine
  schedules: ActivitySchedule[]
  onClose: () => void
}

export function ScheduleEditModal({ projectId, line, schedules, onClose }: ScheduleEditModalProps) {
  const upsertSchedule = useStore((s) => s.upsertSchedule)

  const [rows, setRows] = useState<Record<ActivityKind, FormRow>>(() => {
    const initial = {} as Record<ActivityKind, FormRow>
    for (const kind of ACTIVITY_KINDS) {
      const existing = schedules.find((s) => s.activity === kind)
      initial[kind] = existing
        ? {
            plannedStart: existing.plannedStart,
            plannedEnd: existing.plannedEnd,
            actualStart: existing.actualStart ?? '',
            actualEnd: existing.actualEnd ?? '',
            percentComplete: existing.percentComplete,
          }
        : emptyRow()
    }
    return initial
  })

  const updateRow = (kind: ActivityKind, patch: Partial<FormRow>) => {
    setRows((r) => ({ ...r, [kind]: { ...r[kind], ...patch } }))
  }

  const submit = () => {
    for (const kind of ACTIVITY_KINDS) {
      const row = rows[kind]
      if (!row.plannedStart && !row.plannedEnd) continue
      upsertSchedule(projectId, line.id, kind, {
        plannedStart: row.plannedStart,
        plannedEnd: row.plannedEnd,
        actualStart: row.actualStart || null,
        actualEnd: row.actualEnd || null,
        percentComplete: Math.max(0, Math.min(100, row.percentComplete)),
      })
    }
    onClose()
  }

  return (
    <Modal title="برنامه زمان‌بندی خط" subtitle={`${line.svgElementId} — تاریخ‌ها بر اساس تقویم شمسی`} onClose={onClose} width="max-w-2xl">
      <div className="space-y-4">
        {ACTIVITY_KINDS.map((kind) => {
          const row = rows[kind]
          const previewSchedule: ActivitySchedule = {
            id: '',
            lineId: line.id,
            activity: kind,
            plannedStart: row.plannedStart,
            plannedEnd: row.plannedEnd,
            actualStart: row.actualStart || null,
            actualEnd: row.actualEnd || null,
            percentComplete: row.percentComplete,
          }
          const status = computeActivityStatus(previewSchedule)
          return (
            <div key={kind} className="rounded-xl border border-white/10 p-3">
              <div className="mb-2.5 flex items-center justify-between">
                <p className="text-sm font-bold">{ACTIVITY_LABEL_FA[kind]}</p>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: `${ACTIVITY_STATUS_COLOR[status]}22`, color: 'var(--text-primary)', border: `1px solid ${ACTIVITY_STATUS_COLOR[status]}66` }}
                >
                  {ACTIVITY_STATUS_LABEL_FA[status]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-secondary">شروع برنامه</span>
                  <JalaliDateInput value={row.plannedStart} onChange={(v) => updateRow(kind, { plannedStart: v })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-secondary">پایان برنامه</span>
                  <JalaliDateInput value={row.plannedEnd} onChange={(v) => updateRow(kind, { plannedEnd: v })} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-secondary">شروع واقعی</span>
                  <JalaliDateInput value={row.actualStart} onChange={(v) => updateRow(kind, { actualStart: v })} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-secondary">پایان واقعی</span>
                  <JalaliDateInput value={row.actualEnd} onChange={(v) => updateRow(kind, { actualEnd: v })} />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-[11px] text-secondary">
                  <span>درصد پیشرفت واقعی</span>
                  <span className="num">{row.percentComplete}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={row.percentComplete}
                  onChange={(e) => updateRow(kind, { percentComplete: parseInt(e.target.value, 10) })}
                  className="w-full accent-brand-500"
                />
              </label>
            </div>
          )
        })}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button onClick={submit} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
            ذخیره برنامه
          </button>
        </div>
      </div>
    </Modal>
  )
}
