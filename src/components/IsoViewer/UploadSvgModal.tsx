import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UploadCloud, CheckSquare, Square, Wand2 } from 'lucide-react'
import { Modal } from '../common/Modal'
import { parseSvgCandidates, isLikelyLineId, type SvgCandidate } from '../../lib/svg'
import { extractSegmentEndpoints, computeMergeGroups, defaultMergeTolerance, pickGroupLabel } from '../../lib/lineMerge'

interface UploadSvgModalProps {
  onClose: () => void
  onConfirm: (svgRaw: string, fileName: string, groups: string[][]) => void
}

export function UploadSvgModal({ onClose, onConfirm }: UploadSvgModalProps) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [svgRaw, setSvgRaw] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [candidates, setCandidates] = useState<SvgCandidate[]>([])
  const [groups, setGroups] = useState<string[][]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [tolerance, setTolerance] = useState<number | null>(null)
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
        setGroups([])
        setSelected(new Set())
        setTolerance(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'خطا در پردازش فایل')
      }
    }
    reader.readAsText(file)
  }, [])

  const recompute = useCallback(
    (tol?: number) => {
      const svgEl = previewRef.current?.querySelector('svg')
      if (!svgEl || candidates.length === 0) return
      const effectiveTol = tol ?? defaultMergeTolerance(svgEl)
      const ids = candidates.map((c) => c.elementId)
      const endpoints = extractSegmentEndpoints(svgEl, ids)
      const newGroups = computeMergeGroups(ids, endpoints, effectiveTol)
      setGroups(newGroups)
      setTolerance(effectiveTol)
      setSelected(
        new Set(
          newGroups
            .map((g, i) => (g.some((id) => isLikelyLineId(id)) ? i : -1))
            .filter((i) => i >= 0),
        ),
      )
    },
    [candidates],
  )

  // Run the merge once the SVG preview has actually rendered into the DOM
  useEffect(() => {
    if (!svgRaw || candidates.length === 0) return
    recompute()
  }, [svgRaw, candidates, recompute])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return groups
      .map((g, index) => ({ index, group: g, label: pickGroupLabel(g, isLikelyLineId) }))
      .filter(({ group, label }) => !q || label.toLowerCase().includes(q) || group.some((id) => id.toLowerCase().includes(q)))
  }, [groups, query])

  const toggle = (index: number) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const selectedMemberCount = [...selected].reduce((sum, i) => sum + (groups[i]?.length ?? 0), 0)
  const mergedCount = groups.filter((g) => g.length > 1).length

  return (
    <Modal title="آپلود نقشه ایزومتریک (SVG)" subtitle="فایل SVG را بارگذاری کنید — قطعات به‌هم‌متصل به‌صورت خودکار در یک خط ادغام می‌شوند" onClose={onClose} width="max-w-2xl">
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
            <span className="text-xs text-secondary shrink-0">
              {candidates.length} المان یافت شد
              {groups.length > 0 && ` — ادغام‌شده به ${groups.length} خط`}
            </span>
          </div>

          <div ref={previewRef} className="rounded-xl overflow-hidden border border-white/10 bg-black/30 h-48" dangerouslySetInnerHTML={{ __html: svgRaw }} />

          {mergedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-brand-500/10 border border-brand-400/30 px-3 py-2 text-xs text-brand-200">
              <Wand2 size={14} className="shrink-0" />
              {mergedCount} خط به‌طور خودکار از قطعات متصل‌به‌هم ساخته شد (به‌جای وارد کردن هر قطعه جدا)
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary shrink-0">دقت اتصال</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={tolerance !== null ? Math.round(tolerance * 100) / 100 : ''}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!Number.isNaN(v) && v > 0) recompute(v)
              }}
              className="w-20 rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-brand-400 num"
            />
            <button
              onClick={() => recompute()}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
            >
              بازمحاسبه خودکار
            </button>
            <span className="text-[11px] text-muted">اگر خطوطی که باید جدا باشند ادغام شدند، این عدد را کم کنید</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجو در خطوط استخراج‌شده..."
              className="flex-1 rounded-lg bg-black/20 border border-white/10 px-3 py-1.5 text-sm outline-none focus:border-brand-400"
            />
            <span className="text-xs text-secondary shrink-0">{selected.size} خط انتخاب شده</span>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
            {filtered.map(({ index, group, label }) => (
              <button
                key={index}
                onClick={() => toggle(index)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-right hover:bg-white/5 transition-colors"
              >
                {selected.has(index) ? (
                  <CheckSquare size={16} className="text-brand-400 shrink-0" />
                ) : (
                  <Square size={16} className="text-muted shrink-0" />
                )}
                <span className="truncate flex-1">{label}</span>
                {group.length > 1 && (
                  <span className="text-[11px] rounded-full bg-brand-500/15 text-brand-300 px-2 py-0.5 shrink-0">{group.length} قطعه</span>
                )}
              </button>
            ))}
            {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted">موردی یافت نشد</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => {
                setSvgRaw(null)
                setCandidates([])
                setGroups([])
                setSelected(new Set())
              }}
              className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5"
            >
              انتخاب فایل دیگر
            </button>
            <button
              disabled={selected.size === 0}
              onClick={() => onConfirm(svgRaw, fileName, [...selected].map((i) => groups[i]))}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              تایید و وارد کردن {selected.size} خط ({selectedMemberCount} قطعه)
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
