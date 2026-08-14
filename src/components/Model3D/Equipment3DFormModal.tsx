import { useState } from 'react'
import { Modal } from '../common/Modal'
import type { Equipment3D } from '../../types'

interface Equipment3DFormModalProps {
  equipment?: Equipment3D
  onClose: () => void
  onSubmit: (data: { tag: string; description: string; notes: string }) => void
  onDelete?: () => void
}

export function Equipment3DFormModal({ equipment, onClose, onSubmit, onDelete }: Equipment3DFormModalProps) {
  const [tag, setTag] = useState(equipment?.tag ?? '')
  const [description, setDescription] = useState(equipment?.description ?? '')
  const [notes, setNotes] = useState(equipment?.notes ?? '')

  const isDirty = tag !== (equipment?.tag ?? '') || description !== (equipment?.description ?? '') || notes !== (equipment?.notes ?? '')

  const submit = () => {
    if (!tag.trim()) return
    onSubmit({ tag: tag.trim(), description: description.trim(), notes: notes.trim() })
  }

  return (
    <Modal title={equipment ? 'ویرایش تجهیز' : 'افزودن تجهیز'} onClose={onClose} width="max-w-md" isDirty={isDirty}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شناسه (Tag) *</span>
          <input autoFocus value={tag} onChange={(e) => setTag(e.target.value)} className="input" placeholder="مثلاً PR-101" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">شرح تجهیز</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="مثلاً گیرنده توپک" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">یادداشت</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="input resize-none" />
        </label>

        <div className="flex items-center justify-between gap-2 pt-1">
          {onDelete ? (
            <button onClick={onDelete} className="rounded-lg px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors">
              حذف تجهیز
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button
              onClick={submit}
              disabled={!tag.trim()}
              className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
            >
              {equipment ? 'ذخیره' : 'افزودن'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
