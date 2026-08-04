import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '../common/Modal'
import type { Milestone } from '../../types'
import { useStore } from '../../store/useStore'
import { makeId } from '../../lib/id'
import { MILESTONE_COLOR_PALETTE } from '../../lib/milestones'

export function MilestoneEditModal({
  projectId,
  milestones,
  onClose,
}: {
  projectId: string
  milestones: Milestone[]
  onClose: () => void
}) {
  const setMilestones = useStore((s) => s.setMilestones)
  const [rows, setRows] = useState<Milestone[]>(milestones)

  const updateRow = (id: string, patch: Partial<Milestone>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addRow = () => {
    const color = MILESTONE_COLOR_PALETTE[rows.length % MILESTONE_COLOR_PALETTE.length]
    setRows((rs) => [...rs, { id: makeId('mile'), label: '', percentComplete: 0, color }])
  }

  const removeRow = (id: string) => {
    setRows((rs) => rs.filter((r) => r.id !== id))
  }

  const save = () => {
    setMilestones(
      projectId,
      rows.filter((r) => r.label.trim()),
    )
    onClose()
  }

  return (
    <Modal title="ویرایش مراحل کلی پروژه" subtitle="چند مرحله کلیدی و درصد پیشرفت هرکدام را مشخص کنید (پیشنهاد: حداکثر ۵ تا ۶ مرحله)" onClose={onClose} width="max-w-2xl">
      <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pl-1">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2.5 rounded-xl border border-white/10 p-2.5">
            <button
              onClick={() => {
                const idx = MILESTONE_COLOR_PALETTE.indexOf(row.color)
                const next = MILESTONE_COLOR_PALETTE[(idx + 1) % MILESTONE_COLOR_PALETTE.length]
                updateRow(row.id, { color: next })
              }}
              className="h-8 w-8 shrink-0 rounded-full border-2 border-white/20"
              style={{ background: row.color }}
              title="تغییر رنگ"
            />
            <input
              value={row.label}
              onChange={(e) => updateRow(row.id, { label: e.target.value })}
              className="input flex-1"
              placeholder="مثلاً اتمام طراحی"
            />
            <input
              type="range"
              min={0}
              max={100}
              value={row.percentComplete}
              onChange={(e) => updateRow(row.id, { percentComplete: parseInt(e.target.value, 10) })}
              className="w-28 accent-brand-500"
            />
            <span className="w-10 shrink-0 text-xs num text-secondary text-left">{row.percentComplete}%</span>
            <button onClick={() => removeRow(row.id)} className="shrink-0 text-muted hover:text-red-400 transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-center text-xs text-muted py-6">مرحله‌ای وجود ندارد</p>}
      </div>

      <button
        onClick={addRow}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-2 text-sm text-secondary hover:bg-white/5 transition-colors"
      >
        <Plus size={15} /> افزودن مرحله
      </button>

      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
          انصراف
        </button>
        <button onClick={save} className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
          ذخیره
        </button>
      </div>
    </Modal>
  )
}
