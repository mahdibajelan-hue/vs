import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '../common/Modal'
import type { IsoLine } from '../../types'
import { useStore } from '../../store/useStore'

interface LinesTableModalProps {
  projectId: string
  lines: IsoLine[]
  onClose: () => void
}

export function LinesTableModal({ projectId, lines, onClose }: LinesTableModalProps) {
  const updateLine = useStore((s) => s.updateLine)
  const deleteLine = useStore((s) => s.deleteLine)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  return (
    <Modal
      title="مدیریت مشخصات خطوط"
      subtitle="تمام مقادیر — از جمله متراژ و تعداد سرجوش تخمینی — قابل ویرایش هستند؛ روی هر فیلد کلیک کنید و مقدار را اصلاح کنید"
      onClose={onClose}
      width="max-w-5xl"
    >
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-secondary text-xs">
              <th className="p-2 text-right font-medium">شناسه خط (SVG)</th>
              <th className="p-2 text-right font-medium">سایز</th>
              <th className="p-2 text-right font-medium">اسپک</th>
              <th className="p-2 text-right font-medium">سرویس</th>
              <th className="p-2 text-right font-medium">پیمانکار</th>
              <th className="p-2 text-right font-medium">متراژ برنامه (m)</th>
              <th className="p-2 text-right font-medium">تعداد سرجوش</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {lines.map((line) => (
              <tr key={line.id} className="hover:bg-white/[0.03]">
                <td className="p-1.5 font-mono text-xs">
                  {line.svgElementId}
                  {line.svgElementIds.length > 1 && (
                    <span className="mr-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-secondary" title="این خط از چند قطعه SVG ادغام شده است">
                      {line.svgElementIds.length} قطعه
                    </span>
                  )}
                </td>
                <TextCell value={line.size} onChange={(v) => updateLine(projectId, line.id, { size: v })} placeholder='مثلا 6"' width="w-16" />
                <TextCell value={line.spec} onChange={(v) => updateLine(projectId, line.id, { spec: v })} placeholder="A1A" width="w-16" />
                <TextCell value={line.service} onChange={(v) => updateLine(projectId, line.id, { service: v })} placeholder="سرویس" width="w-28" />
                <TextCell value={line.contractor} onChange={(v) => updateLine(projectId, line.id, { contractor: v })} placeholder="پیمانکار" width="w-28" />
                <NumberCell value={line.plannedLength} onChange={(v) => updateLine(projectId, line.id, { plannedLength: v })} />
                <NumberCell value={line.totalWelds} onChange={(v) => updateLine(projectId, line.id, { totalWelds: v })} />
                <td className="p-1.5">
                  {confirmDeleteId === line.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteLine(projectId, line.id)} className="text-xs text-red-400 hover:underline">
                        تایید حذف
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-secondary hover:underline">
                        انصراف
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(line.id)} className="text-muted hover:text-red-400 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-xs text-muted">
                  هیچ خطی وارد نشده است. ابتدا یک فایل SVG آپلود کنید.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors">
          بستن
        </button>
      </div>
    </Modal>
  )
}

function TextCell({ value, onChange, placeholder, width }: { value: string; onChange: (v: string) => void; placeholder?: string; width: string }) {
  return (
    <td className="p-1.5">
      <input
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => onChange(e.target.value)}
        className={`${width} rounded-md bg-black/20 border border-white/10 px-2 py-1 text-xs outline-none focus:border-brand-400`}
      />
    </td>
  )
}

function NumberCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <td className="p-1.5">
      <input
        type="number"
        defaultValue={value}
        onBlur={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-20 rounded-md bg-black/20 border border-white/10 px-2 py-1 text-xs outline-none focus:border-brand-400 num"
      />
    </td>
  )
}
