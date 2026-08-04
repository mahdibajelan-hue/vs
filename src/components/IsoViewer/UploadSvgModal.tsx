import { useCallback, useMemo, useState } from 'react'
import { UploadCloud, CheckSquare, Square } from 'lucide-react'
import { Modal } from '../common/Modal'
import { parseSvgCandidates, isLikelyLineId, type SvgCandidate } from '../../lib/svg'

interface UploadSvgModalProps {
  onClose: () => void
  onConfirm: (svgRaw: string, fileName: string, selectedIds: string[]) => void
}

export function UploadSvgModal({ onClose, onConfirm }: UploadSvgModalProps) {
  const [svgRaw, setSvgRaw] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [candidates, setCandidates] = useState<SvgCandidate[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback((file: File) => {
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      try {
        const found = parseSvgCandidates(text)
        setSvgRaw(text)
        setFileName(file.name)
        setCandidates(found)
        setSelected(new Set(found.filter((c) => isLikelyLineId(c.elementId)).map((c) => c.elementId)))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'خطا در پردازش فایل')
      }
    }
    reader.readAsText(file)
  }, [])

  const filtered = useMemo(
    () => candidates.filter((c) => c.elementId.toLowerCase().includes(query.toLowerCase())),
    [candidates, query],
  )

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Modal title="آپلود نقشه ایزومتریک (SVG)" subtitle="فایل SVG را بارگذاری کرده و خطوط لوله را تایید کنید" onClose={onClose} width="max-w-2xl">
      {!svgRaw && (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/15 py-14 hover:border-brand-400/60 hover:bg-white/5 transition-colors">
          <UploadCloud size={36} className="text-brand-400" />
          <span className="text-sm text-secondary">فایل SVG را انتخاب یا رها کنید</span>
          <input
            type="file"
            accept=".svg,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
        </label>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {svgRaw && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
            <span className="truncate">{fileName}</span>
            <span className="text-xs text-secondary shrink-0">{candidates.length} المان یافت شد</span>
          </div>

          <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30 h-48" dangerouslySetInnerHTML={{ __html: svgRaw }} />

          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو در شناسه‌های استخراج شده..."
              className="flex-1 rounded-lg bg-black/20 border border-white/10 px-3 py-1.5 text-sm outline-none focus:border-brand-400"
            />
            <span className="text-xs text-secondary shrink-0">{selected.size} انتخاب شده</span>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
            {filtered.map((c) => (
              <button
                key={c.elementId}
                onClick={() => toggle(c.elementId)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-right hover:bg-white/5 transition-colors"
              >
                {selected.has(c.elementId) ? (
                  <CheckSquare size={16} className="text-brand-400 shrink-0" />
                ) : (
                  <Square size={16} className="text-muted shrink-0" />
                )}
                <span className="truncate flex-1">{c.elementId}</span>
                <span className="text-xs text-muted shrink-0">{c.tagName}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted">موردی یافت نشد</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => {
                setSvgRaw(null)
                setCandidates([])
                setSelected(new Set())
              }}
              className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5"
            >
              انتخاب فایل دیگر
            </button>
            <button
              disabled={selected.size === 0}
              onClick={() => onConfirm(svgRaw, fileName, [...selected])}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              تایید و وارد کردن {selected.size} خط
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
