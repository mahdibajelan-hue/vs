import { useState } from 'react'
import { Wand2, Check, Gauge } from 'lucide-react'
import { Modal } from '../common/Modal'
import { JalaliDateInput } from '../common/JalaliDateInput'
import { ACTIVITY_KINDS, ACTIVITY_LABEL_FA, type ActivityKind, type ActivitySchedule, type IsoLine } from '../../types'
import { useStore } from '../../store/useStore'
import { useCurrentRole } from '../../store/useMembersStore'
import { computeActivityStatus, ACTIVITY_STATUS_COLOR, ACTIVITY_STATUS_LABEL_FA, addDaysIso, todayIso } from '../../lib/schedule'
import { formatJalali } from '../../lib/jalali'
import { estimateWeldingDurationDays } from '../../lib/weldEstimate'

interface FormRow {
  plannedStart: string
  plannedEnd: string
}

function emptyRow(): FormRow {
  return { plannedStart: '', plannedEnd: '' }
}

interface ScheduleEditModalProps {
  projectId: string
  line: IsoLine
  /** Already includes computed actuals for the welding activity — see withComputedActuals. */
  schedules: ActivitySchedule[]
  onClose: () => void
}

export function ScheduleEditModal({ projectId, line, schedules, onClose }: ScheduleEditModalProps) {
  const upsertSchedule = useStore((s) => s.upsertSchedule)
  const approveScheduleRowAsConsultant = useStore((s) => s.approveScheduleRowAsConsultant)
  const role = useCurrentRole()
  const isContractor = role === 'contractor'
  const isConsultant = role === 'consultant'

  const [rows, setRows] = useState<Record<ActivityKind, FormRow>>(() => {
    const initial = {} as Record<ActivityKind, FormRow>
    for (const kind of ACTIVITY_KINDS) {
      const existing = schedules.find((s) => s.activity === kind)
      initial[kind] = existing ? { plannedStart: existing.plannedStart, plannedEnd: existing.plannedEnd } : emptyRow()
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
      upsertSchedule(projectId, line.id, kind, { plannedStart: row.plannedStart, plannedEnd: row.plannedEnd })
    }
    onClose()
  }

  return (
    <Modal
      title="برنامه زمان‌بندی خط"
      subtitle={`${line.svgElementId} — تاریخ‌ها بر اساس تقویم شمسی${isContractor ? '' : ' — فقط نمایش'}`}
      onClose={onClose}
      width="max-w-2xl"
    >
      <div className="space-y-4">
        {ACTIVITY_KINDS.map((kind) => {
          const row = rows[kind]
          const existing = schedules.find((s) => s.activity === kind)
          const previewSchedule: ActivitySchedule = existing
            ? { ...existing, plannedStart: row.plannedStart, plannedEnd: row.plannedEnd }
            : {
                id: '',
                lineId: line.id,
                activity: kind,
                plannedStart: row.plannedStart,
                plannedEnd: row.plannedEnd,
                actualStart: null,
                actualEnd: null,
                percentComplete: 0,
              }
          const status = computeActivityStatus(previewSchedule)
          const canApproveRow = isConsultant && !!row.plannedStart && !!row.plannedEnd && !existing?.consultantApprovedAt
          return (
            <div key={kind} className="rounded-xl border border-white/10 p-3">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{ACTIVITY_LABEL_FA[kind]}</p>
                <div className="flex items-center gap-1.5">
                  {existing?.consultantApprovedAt ? (
                    <span className="flex items-center gap-1 rounded-full border border-green-400/40 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-300">
                      <Check size={10} /> تایید مشاور
                    </span>
                  ) : (
                    row.plannedStart &&
                    row.plannedEnd && (
                      <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] text-muted">در انتظار تایید مشاور</span>
                    )
                  )}
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px]"
                    style={{ background: `${ACTIVITY_STATUS_COLOR[status]}22`, color: 'var(--text-primary)', border: `1px solid ${ACTIVITY_STATUS_COLOR[status]}66` }}
                  >
                    {ACTIVITY_STATUS_LABEL_FA[status]}
                  </span>
                </div>
              </div>

              {kind === 'welding' && line.totalWelds > 0 && (
                <div className="mb-2.5 flex items-center gap-1.5 rounded-lg border border-dashed border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-secondary">
                  <Gauge size={12} className="shrink-0 text-brand-400" />
                  کارکرد واقعی (از کارکرد روزانه): {previewSchedule.percentComplete}%
                  {previewSchedule.actualStart && ` — از ${formatJalali(previewSchedule.actualStart)}`}
                  {previewSchedule.actualEnd && ` تا ${formatJalali(previewSchedule.actualEnd)}`}
                </div>
              )}

              {isContractor && kind === 'welding' && line.totalWelds > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const start = row.plannedStart || todayIso()
                    const days = estimateWeldingDurationDays(line.totalWelds, line.fittingWeldCount)
                    updateRow(kind, { plannedStart: start, plannedEnd: addDaysIso(start, days) })
                  }}
                  className="mb-2.5 flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-brand-400/30 bg-brand-500/5 px-2.5 py-1.5 text-[11px] text-brand-300 hover:bg-brand-500/10 transition-colors"
                  title="پایان برنامه را بر اساس این پیشنهاد پر می‌کند"
                >
                  <span className="flex items-center gap-1.5">
                    <Wand2 size={12} />
                    پیشنهاد مدت: {estimateWeldingDurationDays(line.totalWelds, line.fittingWeldCount)} روز — {line.fittingWeldCount} سرجوش اتصالات/شیرها زمان‌برتر از لوله محاسبه شده
                  </span>
                  <span className="shrink-0 underline">اعمال</span>
                </button>
              )}

              {isContractor ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-secondary">شروع برنامه</span>
                    <JalaliDateInput value={row.plannedStart} onChange={(v) => updateRow(kind, { plannedStart: v })} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-secondary">پایان برنامه</span>
                    <JalaliDateInput value={row.plannedEnd} onChange={(v) => updateRow(kind, { plannedEnd: v })} />
                  </label>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <span className="mb-1 block text-[11px] text-secondary">شروع برنامه</span>
                    <p className="num">{row.plannedStart ? formatJalali(row.plannedStart) : '—'}</p>
                  </div>
                  <div>
                    <span className="mb-1 block text-[11px] text-secondary">پایان برنامه</span>
                    <p className="num">{row.plannedEnd ? formatJalali(row.plannedEnd) : '—'}</p>
                  </div>
                </div>
              )}

              {canApproveRow && (
                <button
                  onClick={() => approveScheduleRowAsConsultant(projectId, line.id, kind)}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-green-400/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-300 hover:bg-green-500/15 transition-colors"
                >
                  <Check size={13} /> تایید این ردیف به‌عنوان مشاور
                </button>
              )}
            </div>
          )
        })}

        {isContractor && (
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button onClick={submit} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
              ذخیره برنامه
            </button>
          </div>
        )}
        {!isContractor && (
          <div className="flex justify-end pt-1">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
              بستن
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
