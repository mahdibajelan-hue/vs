import { useState } from 'react'
import { Modal } from './Modal'

export interface LineMetaExtra {
  plannedLength: number
  totalWelds: number
}

interface LineMetaModalProps {
  onClose: () => void
  onConfirm: (svgElementId: string, size: string, extra?: LineMetaExtra) => void
  title?: string
  subtitle?: string
  confirmLabel?: string
  /** Shows planned length (m) and weld-count fields — used when creating a line from a manual/box selection. */
  collectLengthWelds?: boolean
  /** Shown next to the length/weld fields, e.g. "12 قطعه انتخاب شده". */
  selectionHint?: string
}

export function LineMetaModal({
  onClose,
  onConfirm,
  title = 'مشخصات خط لوله',
  subtitle = 'شناسه خط را وارد کنید تا در پروژه قابل پیگیری باشد',
  confirmLabel = 'تایید',
  collectLengthWelds = false,
  selectionHint,
}: LineMetaModalProps) {
  const [svgElementId, setSvgElementId] = useState('')
  const [size, setSize] = useState('')
  const [plannedLength, setPlannedLength] = useState(10)
  const [totalWelds, setTotalWelds] = useState(1)

  const submit = () => {
    if (!svgElementId.trim()) return
    onConfirm(svgElementId.trim(), size.trim(), collectLengthWelds ? { plannedLength, totalWelds } : undefined)
  }

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <div className="space-y-3">
        {selectionHint && <p className="text-xs text-brand-300 bg-brand-500/10 border border-brand-400/30 rounded-lg px-3 py-2">{selectionHint}</p>}
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شناسه خط (Line Number) *</span>
          <input
            autoFocus
            value={svgElementId}
            onChange={(e) => setSvgElementId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="input"
            placeholder='مثلاً L-1009-6-A1A'
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">سایز</span>
          <input value={size} onChange={(e) => setSize(e.target.value)} className="input" placeholder='مثلاً 6"' />
        </label>
        {collectLengthWelds && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-secondary">طول برنامه (متر)</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={plannedLength}
                onChange={(e) => setPlannedLength(parseFloat(e.target.value) || 0)}
                className="input num"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-secondary">تعداد سرجوش</span>
              <input
                type="number"
                min={0}
                value={totalWelds}
                onChange={(e) => setTotalWelds(parseInt(e.target.value, 10) || 0)}
                className="input num"
              />
            </label>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={!svgElementId.trim()}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
