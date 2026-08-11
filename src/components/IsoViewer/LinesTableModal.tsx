import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from '../common/Modal'
import type { DailyLog, IsoLine } from '../../types'
import { useStore } from '../../store/useStore'

interface LinesTableModalProps {
  projectId: string
  lines: IsoLine[]
  logs: DailyLog[]
  onClose: () => void
}

export function LinesTableModal({ projectId, lines, logs, onClose }: LinesTableModalProps) {
  const updateLine = useStore((s) => s.updateLine)
  const deleteLine = useStore((s) => s.deleteLine)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return lines
    return lines.filter((l) => l.svgElementId.toLowerCase().includes(q) || l.service.toLowerCase().includes(q) || l.spec.toLowerCase().includes(q))
  }, [lines, query])

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id))

  const logCountByLine = useMemo(() => {
    const map = new Map<string, number>()
    for (const log of logs) map.set(log.lineId, (map.get(log.lineId) ?? 0) + 1)
    return map
  }, [logs])

  const selectedLogCount = useMemo(
    () => [...selectedIds].reduce((sum, id) => sum + (logCountByLine.get(id) ?? 0), 0),
    [selectedIds, logCountByLine],
  )

  const toggleAll = () => {
    setSelectedIds((prev) => {
      if (allFilteredSelected) {
        const next = new Set(prev)
        for (const l of filtered) next.delete(l.id)
        return next
      }
      const next = new Set(prev)
      for (const l of filtered) next.add(l.id)
      return next
    })
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const bulkDelete = () => {
    for (const id of selectedIds) deleteLine(projectId, id)
    setSelectedIds(new Set())
    setConfirmBulkDelete(false)
  }

  return (
    <Modal
      title="مدیریت مشخصات خطوط"
      subtitle="تمام مقادیر — از جمله متراژ و تعداد سرجوش تخمینی — قابل ویرایش هستند؛ روی هر فیلد کلیک کنید و مقدار را اصلاح کنید"
      onClose={onClose}
      width="max-w-5xl"
    >
      <div className="mb-3 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجو در شناسه، سرویس یا اسپک..."
          className="flex-1 rounded-lg bg-black/20 border border-white/10 px-3 py-1.5 text-sm outline-none focus:border-brand-400"
        />
        {selectedIds.size > 0 &&
          (confirmBulkDelete ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-red-400">
                حذف {selectedIds.size} خط قطعی است؟
                {selectedLogCount > 0 && ` این کار ${selectedLogCount} کارکرد روزانه‌ی ثبت‌شده روی این خطوط را هم برای همیشه حذف می‌کند.`}
              </span>
              <button onClick={bulkDelete} className="text-xs text-red-400 hover:underline">
                تایید حذف
              </button>
              <button onClick={() => setConfirmBulkDelete(false)} className="text-xs text-secondary hover:underline">
                انصراف
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmBulkDelete(true)}
              className="flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/25 transition-colors shrink-0"
            >
              <Trash2 size={13} /> حذف {selectedIds.size} خط انتخاب‌شده
            </button>
          ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-secondary text-xs">
              <th className="p-2 text-center">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-brand-500" />
              </th>
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
            {filtered.map((line) => (
              <tr key={line.id} className={`hover:bg-white/[0.03] ${selectedIds.has(line.id) ? 'bg-brand-500/[0.06]' : ''}`}>
                <td className="p-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(line.id)}
                    onChange={() => toggleOne(line.id)}
                    className="h-3.5 w-3.5 accent-brand-500"
                  />
                </td>
                <td className="p-1.5 font-mono text-xs whitespace-nowrap">
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
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      {(logCountByLine.get(line.id) ?? 0) > 0 && (
                        <span className="text-[10px] text-red-400">{logCountByLine.get(line.id)} کارکرد حذف می‌شود</span>
                      )}
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-xs text-muted">
                  {lines.length === 0 ? 'هیچ خطی وارد نشده است. ابتدا یک فایل SVG آپلود کنید.' : 'موردی یافت نشد'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted">{lines.length} خط در مجموع</span>
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
