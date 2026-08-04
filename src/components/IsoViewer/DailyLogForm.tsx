import { useState } from 'react'
import { Modal } from '../common/Modal'
import { JalaliDateInput } from '../common/JalaliDateInput'
import type { DailyLog, IsoLine } from '../../types'
import { useStore } from '../../store/useStore'

interface DailyLogFormProps {
  projectId: string
  lines: IsoLine[]
  initialLineId: string | null
  editingLog?: DailyLog | null
  onClose: () => void
}

const WELD_PASS_OPTIONS: { value: DailyLog['weldPass']; label: string }[] = [
  { value: 'root', label: 'پاس ریشه (Root)' },
  { value: 'hot', label: 'پاس داغ (Hot)' },
  { value: 'fill', label: 'پاس پر کننده (Fill)' },
  { value: 'cap', label: 'پاس نهایی (Cap)' },
  { value: 'ndt', label: 'تست غیرمخرب (NDT)' },
  { value: 'hydrotest', label: 'تست هیدرواستاتیک' },
]

export function DailyLogForm({ projectId, lines, initialLineId, editingLog, onClose }: DailyLogFormProps) {
  const addLog = useStore((s) => s.addLog)
  const updateLog = useStore((s) => s.updateLog)

  const [lineId, setLineId] = useState(editingLog?.lineId ?? initialLineId ?? lines[0]?.id ?? '')
  const [date, setDate] = useState(editingLog?.date ?? new Date().toISOString().slice(0, 10))
  const [lengthDone, setLengthDone] = useState(editingLog?.lengthDone ?? 0)
  const [weldCount, setWeldCount] = useState(editingLog?.weldCount ?? 0)
  const [weldPass, setWeldPass] = useState<DailyLog['weldPass']>(editingLog?.weldPass ?? 'root')
  const [contractor, setContractor] = useState(
    editingLog?.contractor ?? lines.find((l) => l.id === (initialLineId ?? lines[0]?.id))?.contractor ?? '',
  )
  const [notes, setNotes] = useState(editingLog?.notes ?? '')
  const [delayReason, setDelayReason] = useState(editingLog?.delayReason ?? '')

  const selectedLine = lines.find((l) => l.id === lineId)

  const submit = () => {
    if (!lineId) return
    if (editingLog) {
      updateLog(projectId, editingLog.id, { lineId, date, lengthDone, weldCount, weldPass, contractor, notes, delayReason })
    } else {
      addLog(projectId, {
        lineId,
        date,
        lengthDone,
        weldCount,
        weldPass,
        contractor,
        notes,
        delayReason,
        approvalStatus: 'pending',
        reviewedBy: null,
        reviewNote: '',
      })
    }
    onClose()
  }

  return (
    <Modal
      title={editingLog ? 'ویرایش کارکرد روزانه' : 'ثبت کارکرد روزانه'}
      subtitle={selectedLine ? `خط: ${selectedLine.svgElementId}` : undefined}
      onClose={onClose}
    >
      <div className="space-y-3">
        <Field label="خط لوله">
          <select
            value={lineId}
            onChange={(e) => {
              setLineId(e.target.value)
              const l = lines.find((x) => x.id === e.target.value)
              if (l) setContractor(l.contractor)
            }}
            className="input"
          >
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.svgElementId} — {l.size} {l.service}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="تاریخ (شمسی)">
            <JalaliDateInput value={date} onChange={setDate} />
          </Field>
          <Field label="پیمانکار">
            <input value={contractor} onChange={(e) => setContractor(e.target.value)} className="input" placeholder="نام پیمانکار" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="متراژ کارشده (متر)">
            <input
              type="number"
              min={0}
              step={0.5}
              value={lengthDone}
              onChange={(e) => setLengthDone(parseFloat(e.target.value) || 0)}
              className="input num"
            />
          </Field>
          <Field label="تعداد سرجوش">
            <input
              type="number"
              min={0}
              value={weldCount}
              onChange={(e) => setWeldCount(parseInt(e.target.value, 10) || 0)}
              className="input num"
            />
          </Field>
        </div>

        <Field label="وضعیت پاس جوشکاری / تست">
          <select value={weldPass} onChange={(e) => setWeldPass(e.target.value as DailyLog['weldPass'])} className="input">
            {WELD_PASS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="توضیحات فنی">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" placeholder="توضیحات کارکرد امروز..." />
        </Field>

        <Field label="علت تاخیر (در صورت وجود)">
          <input
            value={delayReason}
            onChange={(e) => setDelayReason(e.target.value)}
            className="input"
            placeholder="مثلاً: عدم تامین شیرآلات"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={!lineId}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            {editingLog ? 'ذخیره تغییرات' : 'ثبت کارکرد'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-secondary">{label}</span>
      {children}
    </label>
  )
}
