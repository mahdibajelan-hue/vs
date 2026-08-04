import { useState } from 'react'
import { Modal } from '../common/Modal'

interface LineMetaModalProps {
  onClose: () => void
  onConfirm: (svgElementId: string, size: string) => void
}

export function LineMetaModal({ onClose, onConfirm }: LineMetaModalProps) {
  const [svgElementId, setSvgElementId] = useState('')
  const [size, setSize] = useState('')

  const submit = () => {
    if (!svgElementId.trim()) return
    onConfirm(svgElementId.trim(), size.trim())
  }

  return (
    <Modal title="مشخصات خط لوله" subtitle="شناسه خط را وارد کنید تا در پروژه قابل پیگیری باشد" onClose={onClose}>
      <div className="space-y-3">
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
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={!svgElementId.trim()}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            تایید و افزودن خط
          </button>
        </div>
      </div>
    </Modal>
  )
}
