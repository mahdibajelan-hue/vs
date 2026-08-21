import { useState } from 'react'
import { Modal } from '../common/Modal'
import { JalaliDateInput } from '../common/JalaliDateInput'
import { JOINT_TYPES, JOINT_TYPE_LABEL_FA, type Equipment3D, type Joint, type JointType } from '../../types'

interface JointFormModalProps {
  lineLabel: string
  /** Present when adding a brand-new joint (position was just picked on the model); absent when editing an existing one (position stays as already placed). */
  position?: { x: number; y: number; z: number }
  joint?: Joint
  equipment3d: Equipment3D[]
  onClose: () => void
  onSubmit: (data: {
    jointType: JointType
    jointNumber: string
    diameter: string
    thickness: string
    connectedEquipmentId: string | null
    notes: string
  }) => void
  onDelete?: () => void
}

export function JointFormModal({ lineLabel, position, joint, equipment3d, onClose, onSubmit, onDelete }: JointFormModalProps) {
  const [jointType, setJointType] = useState<JointType>(joint?.jointType ?? 'weld')
  const [jointNumber, setJointNumber] = useState(joint?.jointNumber ?? '')
  const [diameter, setDiameter] = useState(joint?.diameter ?? '')
  const [thickness, setThickness] = useState(joint?.thickness ?? '')
  const [connectedEquipmentId, setConnectedEquipmentId] = useState(joint?.connectedEquipmentId ?? '')
  const [notes, setNotes] = useState(joint?.notes ?? '')

  const isDirty =
    jointType !== (joint?.jointType ?? 'weld') ||
    jointNumber !== (joint?.jointNumber ?? '') ||
    diameter !== (joint?.diameter ?? '') ||
    thickness !== (joint?.thickness ?? '') ||
    connectedEquipmentId !== (joint?.connectedEquipmentId ?? '') ||
    notes !== (joint?.notes ?? '')

  const submit = () => {
    onSubmit({
      jointType,
      jointNumber: jointNumber.trim(),
      diameter: diameter.trim(),
      thickness: thickness.trim(),
      connectedEquipmentId: jointType === 'flange' && connectedEquipmentId ? connectedEquipmentId : null,
      notes: notes.trim(),
    })
  }

  return (
    <Modal
      title={joint ? 'ویرایش اتصال' : 'افزودن اتصال روی مدل'}
      subtitle={`خط ${lineLabel}${position ? ' — محل روی مدل ثبت شد' : ''}`}
      onClose={onClose}
      width="max-w-lg"
      isDirty={isDirty}
    >
      <div className="space-y-3">
        <div>
          <span className="mb-1.5 block text-xs font-bold text-secondary">نوع اتصال</span>
          <div className="flex gap-2">
            {JOINT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setJointType(t)}
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  jointType === t ? 'border-brand-400 bg-brand-500/15 text-brand-300' : 'border-white/10 text-secondary hover:bg-white/5'
                }`}
              >
                {JOINT_TYPE_LABEL_FA[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شماره اتصال</span>
            <input autoFocus value={jointNumber} onChange={(e) => setJointNumber(e.target.value)} className="input" placeholder="مثلاً W-101" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">قطر</span>
            <input value={diameter} onChange={(e) => setDiameter(e.target.value)} className="input" placeholder='مثلاً 6"' />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">ضخامت</span>
            <input value={thickness} onChange={(e) => setThickness(e.target.value)} className="input" placeholder="مثلاً Sch 40" />
          </label>
        </div>

        {jointType === 'flange' && (
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">اتصال به تجهیز (نازل)</span>
            <select value={connectedEquipmentId} onChange={(e) => setConnectedEquipmentId(e.target.value)} className="input">
              <option value="">— بدون اتصال به تجهیز —</option>
              {equipment3d.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.tag}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs text-secondary">یادداشت</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
        </label>

        {joint && (
          <div className="rounded-xl border border-white/10 px-3 py-2 text-[11px] text-muted">
            برای تغییر وضعیت تکمیل این اتصال، از دکمهٔ «تکمیل شد» در فهرست اتصالات استفاده کنید.
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          {onDelete ? (
            <button onClick={onDelete} className="rounded-lg px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
              حذف اتصال
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button onClick={submit} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
              {joint ? 'ذخیره' : 'افزودن'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function JointCompleteDateModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void
  onConfirm: (date: string) => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  return (
    <Modal title="تاریخ تکمیل اتصال" onClose={onClose} width="max-w-xs">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">تاریخ تکمیل</span>
          <JalaliDateInput value={date} onChange={setDate} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={() => onConfirm(date)}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
          >
            تایید تکمیل
          </button>
        </div>
      </div>
    </Modal>
  )
}
