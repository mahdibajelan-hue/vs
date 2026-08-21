import { useState } from 'react'
import { Modal } from '../common/Modal'
import type { Point3D } from '../../lib/isoGeometry'

interface CoordinateLineModalProps {
  onClose: () => void
  onConfirm: (data: { svgElementId: string; size: string; start: Point3D; end: Point3D }) => void
}

export function CoordinateLineModal({ onClose, onConfirm }: CoordinateLineModalProps) {
  const [svgElementId, setSvgElementId] = useState('')
  const [size, setSize] = useState('')
  const [sx, setSx] = useState('0')
  const [sy, setSy] = useState('0')
  const [sz, setSz] = useState('0')
  const [ex, setEx] = useState('0')
  const [ey, setEy] = useState('0')
  const [ez, setEz] = useState('0')

  const num = (v: string) => parseFloat(v) || 0

  const submit = () => {
    if (!svgElementId.trim()) return
    onConfirm({
      svgElementId: svgElementId.trim(),
      size: size.trim(),
      start: { x: num(sx), y: num(sy), z: num(sz) },
      end: { x: num(ex), y: num(ey), z: num(ez) },
    })
  }

  return (
    <Modal
      title="افزودن خط با مختصات"
      subtitle="نقاط شروع و پایان خط را بر حسب متر وارد کنید — طول واقعی خط خودکار محاسبه می‌شود"
      onClose={onClose}
      width="max-w-lg"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">شناسه خط *</span>
            <input
              autoFocus
              value={svgElementId}
              onChange={(e) => setSvgElementId(e.target.value)}
              className="input"
              placeholder="L-1010-6-A1A"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">سایز</span>
            <input value={size} onChange={(e) => setSize(e.target.value)} className="input" placeholder='مثلاً 6"' />
          </label>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-bold text-secondary">نقطه شروع (متر)</p>
          <div className="grid grid-cols-3 gap-2">
            <CoordField label="X" value={sx} onChange={setSx} />
            <CoordField label="Y" value={sy} onChange={setSy} />
            <CoordField label="Z (ارتفاع)" value={sz} onChange={setSz} />
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold text-secondary">نقطه پایان (متر)</p>
          <div className="grid grid-cols-3 gap-2">
            <CoordField label="X" value={ex} onChange={setEx} />
            <CoordField label="Y" value={ey} onChange={setEy} />
            <CoordField label="Z (ارتفاع)" value={ez} onChange={setEz} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={submit}
            disabled={!svgElementId.trim()}
            className="rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
          >
            افزودن خط
          </button>
        </div>
      </div>
    </Modal>
  )
}

function CoordField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] text-muted">{label}</span>
      <input type="number" step="0.1" value={value} onChange={(e) => onChange(e.target.value)} className="input num" />
    </label>
  )
}
