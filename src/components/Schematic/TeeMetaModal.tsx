import { useState } from 'react'
import { Modal } from '../common/Modal'

interface TeeMetaModalProps {
  onClose: () => void
  onConfirm: (mainSize: string, branchSize: string) => void
}

export function TeeMetaModal({ onClose, onConfirm }: TeeMetaModalProps) {
  const [mainSize, setMainSize] = useState('')
  const [branchSize, setBranchSize] = useState('')

  return (
    <Modal title="مشخصات سه‌راهی" subtitle="سایز خط اصلی و سایز خروجی/انشعاب را وارد کنید" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">سایز خط اصلی</span>
            <input autoFocus value={mainSize} onChange={(e) => setMainSize(e.target.value)} className="input" placeholder='مثلاً 6"' />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">سایز خروجی/انشعاب</span>
            <input value={branchSize} onChange={(e) => setBranchSize(e.target.value)} className="input" placeholder='مثلاً 4"' />
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            رد کردن
          </button>
          <button
            onClick={() => onConfirm(mainSize.trim(), branchSize.trim())}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
          >
            تایید
          </button>
        </div>
      </div>
    </Modal>
  )
}
