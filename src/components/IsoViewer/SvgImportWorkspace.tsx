import { useCallback, useMemo, useState } from 'react'
import { UploadCloud, CheckSquare, Square, Wand2, X } from 'lucide-react'
import type { IsoLine } from '../../types'
import type { LineProgress } from '../../lib/progress'
import { IsoViewport } from './IsoViewport'
import { parseSvgCandidates, isLikelyLineId, type SvgCandidate } from '../../lib/svg'
import { extractSegmentEndpoints, computeMergeGroups, defaultMergeTolerance, pickGroupLabel } from '../../lib/lineMerge'

interface SvgImportWorkspaceProps {
  onClose: () => void
  onConfirm: (svgRaw: string, fileName: string, groups: string[][]) => void
}

const EMPTY_PROGRESS = new Map<string, LineProgress>()

/**
 * Full-screen SVG review workspace — replaces the old cramped upload-modal preview.
 * Reuses IsoViewport (pan/zoom already built there) by rendering each auto-merged
 * group as a fake "line": green if it will be imported, red if excluded. Clicking a
 * fragment on the canvas toggles that group's inclusion; the side list mirrors it.
 */
export function SvgImportWorkspace({ onClose, onConfirm }: SvgImportWorkspaceProps) {
  const [svgRaw, setSvgRaw] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [candidates, setCandidates] = useState<SvgCandidate[]>([])
  const [groups, setGroups] = useState<string[][]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [tolerance, setTolerance] = useState<number | null>(null)
  const [svgRoot, setSvgRoot] = useState<SVGSVGElement | null>(null)
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
    (root: SVGSVGElement | null, tol?: number) => {
      if (!root || candidates.length === 0) return
      const effectiveTol = tol ?? defaultMergeTolerance(root)
      const ids = candidates.map((c) => c.elementId)
      const endpoints = extractSegmentEndpoints(root, ids)
      const newGroups = computeMergeGroups(ids, endpoints, effectiveTol)
      setGroups(newGroups)
      setTolerance(effectiveTol)
      setSelected(new Set(newGroups.map((g, i) => (g.some((id) => isLikelyLineId(id)) ? i : -1)).filter((i) => i >= 0)))
    },
    [candidates],
  )

  const handleSvgReady = useCallback(
    (root: SVGSVGElement | null) => {
      setSvgRoot(root)
      if (root && candidates.length > 0) recompute(root)
    },
    [candidates, recompute],
  )

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

  // Fake "lines" so IsoViewport colors every candidate green (included) or red (excluded)
  // and clicking a fragment on the canvas reports back the group index via onSelectLine.
  const previewLines = useMemo<IsoLine[]>(() => {
    const now = new Date().toISOString()
    return groups.map((group, index) => ({
      id: String(index),
      svgElementId: pickGroupLabel(group, isLikelyLineId),
      svgElementIds: group,
      size: '',
      spec: '',
      service: '',
      contractor: '',
      plannedLength: 0,
      totalWelds: 0,
      status: selected.has(index) ? 'completed' : 'not_started',
      createdAt: now,
    }))
  }, [groups, selected])

  const selectedMemberCount = [...selected].reduce((sum, i) => sum + (groups[i]?.length ?? 0), 0)
  const mergedCount = groups.filter((g) => g.length > 1).length

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print flex items-center justify-between glass-panel !rounded-none border-t-0 border-x-0 px-6 py-3.5 shrink-0">
        <div>
          <h1 className="text-base font-bold">آپلود و بازبینی نقشه ایزومتریک (SVG)</h1>
          <p className="mt-0.5 text-xs text-secondary">
            {svgRaw
              ? `${fileName} — ${candidates.length} المان یافت شد${groups.length > 0 ? ` — ادغام‌شده به ${groups.length} خط` : ''}`
              : 'فایل SVG را بارگذاری کنید — قطعات به‌هم‌متصل به‌صورت خودکار در یک خط ادغام می‌شوند'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {svgRaw && (
            <button
              onClick={() => onConfirm(svgRaw, fileName, [...selected].map((i) => groups[i]))}
              disabled={selected.size === 0}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              تایید و وارد کردن {selected.size} خط ({selectedMemberCount} قطعه)
            </button>
          )}
          <button onClick={onClose} className="rounded-lg p-2 text-secondary hover:bg-white/10 hover:text-current transition-colors" title="بستن">
            <X size={18} />
          </button>
        </div>
      </header>

      {!svgRaw ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <label className="flex w-full max-w-lg cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-white/15 py-16 hover:border-brand-400/60 hover:bg-white/5 transition-colors">
            <UploadCloud size={40} className="text-brand-400" />
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
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      ) : (
        <div className="flex flex-1 gap-4 p-4 min-h-0">
          <div className="w-96 shrink-0 glass-panel rounded-2xl overflow-hidden flex flex-col">
            {mergedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-brand-200 border-b" style={{ borderColor: 'var(--border-soft)' }}>
                <Wand2 size={14} className="shrink-0" />
                {mergedCount} خط به‌طور خودکار از قطعات متصل‌به‌هم ساخته شد
              </div>
            )}
            <div className="flex items-center gap-2 p-3 border-b" style={{ borderColor: 'var(--border-soft)' }}>
              <span className="text-xs text-secondary shrink-0">دقت اتصال</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={tolerance !== null ? Math.round(tolerance * 100) / 100 : ''}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (!Number.isNaN(v) && v > 0) recompute(svgRoot, v)
                }}
                className="w-16 rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-xs outline-none focus:border-brand-400 num"
              />
              <button
                onClick={() => recompute(svgRoot)}
                className="flex-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
              >
                بازمحاسبه خودکار
              </button>
            </div>
            <p className="px-3 pt-2 text-[11px] text-muted leading-5">
              روی نقشه کلیک کنید تا یک خط سبز (وارد می‌شود) یا قرمز (نادیده گرفته می‌شود) شود — یا از این لیست انتخاب کنید.
            </p>
            <div className="flex items-center gap-2 p-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجو در خطوط استخراج‌شده..."
                className="flex-1 rounded-lg bg-black/20 border border-white/10 px-3 py-1.5 text-sm outline-none focus:border-brand-400"
              />
              <span className="text-xs text-secondary shrink-0">{selected.size}</span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {filtered.map(({ index, group, label }) => (
                <button
                  key={index}
                  onClick={() => toggle(index)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-right hover:bg-white/5 transition-colors"
                >
                  {selected.has(index) ? (
                    <CheckSquare size={16} className="text-green-400 shrink-0" />
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
          </div>

          <div className="flex-1 glass-panel rounded-2xl p-2 min-h-0">
            <IsoViewport
              svgRaw={svgRaw}
              lines={previewLines}
              progressMap={EMPTY_PROGRESS}
              selectedLineId={null}
              onSelectLine={(lineId) => toggle(parseInt(lineId, 10))}
              onSvgReady={handleSvgReady}
            />
          </div>
        </div>
      )}
    </div>
  )
}
