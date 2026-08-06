import { useCallback, useState } from 'react'
import { PlusSquare, Sparkles, Unlink, X } from 'lucide-react'
import type { Project } from '../../types'
import type { LineProgress } from '../../lib/progress'
import { IsoViewport } from './IsoViewport'
import { LineMetaModal, type LineMetaExtra } from '../common/LineMetaModal'
import { useStore } from '../../store/useStore'
import { parseSvgCandidates } from '../../lib/svg'
import { extractSegmentEndpoints, computeMergeGroups, defaultMergeTolerance } from '../../lib/lineMerge'

const EMPTY_PROGRESS = new Map<string, LineProgress>()

/**
 * Full-screen version of Map Fix Mode — same fragment select/merge/unmap workflow as before,
 * but as its own overlay with a large canvas instead of squeezed next to the line list sidebar,
 * reusing IsoViewport's existing pan/zoom.
 */
export function MapFixWorkspace({ project, onClose }: { project: Project; onClose: () => void }) {
  const svgRaw = project.svgRaw
  const mergeFragmentsIntoNewLine = useStore((s) => s.mergeFragmentsIntoNewLine)
  const addFragmentsToLine = useStore((s) => s.addFragmentsToLine)
  const removeFragmentsFromLines = useStore((s) => s.removeFragmentsFromLines)

  const [selectedFragments, setSelectedFragments] = useState<Set<string>>(new Set())
  const [addToLineId, setAddToLineId] = useState('')
  const [showCreateLine, setShowCreateLine] = useState(false)
  const [svgRoot, setSvgRoot] = useState<SVGSVGElement | null>(null)

  const handleSvgReady = useCallback((root: SVGSVGElement | null) => setSvgRoot(root), [])

  const toggleFragment = useCallback((elementId: string) => {
    setSelectedFragments((prev) => {
      const next = new Set(prev)
      if (next.has(elementId)) next.delete(elementId)
      else next.add(elementId)
      return next
    })
  }, [])

  const handleMarqueeSelect = useCallback((elementIds: string[]) => {
    setSelectedFragments((prev) => {
      const next = new Set(prev)
      for (const id of elementIds) next.add(id)
      return next
    })
  }, [])

  const confirmCreateLine = async (svgElementId: string, size: string, extra?: LineMetaExtra) => {
    await mergeFragmentsIntoNewLine(project.id, {
      svgElementIds: [...selectedFragments],
      svgElementId,
      size,
      plannedLength: extra?.plannedLength,
      totalWelds: extra?.totalWelds,
    })
    setSelectedFragments(new Set())
    setShowCreateLine(false)
  }

  const handleAddToLine = async () => {
    if (!addToLineId || selectedFragments.size === 0) return
    await addFragmentsToLine(project.id, addToLineId, [...selectedFragments])
    setSelectedFragments(new Set())
  }

  const handleUnmap = async () => {
    if (selectedFragments.size === 0) return
    await removeFragmentsFromLines(project.id, [...selectedFragments])
    setSelectedFragments(new Set())
  }

  const selectConnectedChain = () => {
    if (!svgRoot || selectedFragments.size === 0 || !svgRaw) return
    const candidateIds = parseSvgCandidates(svgRaw).map((c) => c.elementId)
    if (candidateIds.length === 0) return
    const endpoints = extractSegmentEndpoints(svgRoot, candidateIds)
    const tolerance = defaultMergeTolerance(svgRoot)
    const groups = computeMergeGroups(candidateIds, endpoints, tolerance)
    const next = new Set(selectedFragments)
    for (const seedId of selectedFragments) {
      const group = groups.find((g) => g.includes(seedId))
      if (group) for (const id of group) next.add(id)
    }
    setSelectedFragments(next)
  }

  if (!svgRaw) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-app)' }}>
      <header className="no-print glass-panel !rounded-none border-t-0 border-x-0 px-6 py-3.5 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-bold">اصلاح نقشه — {project.name}</h1>
            <p className="mt-0.5 text-xs text-secondary leading-6">
              روی نقشه کلیک کنید یا با درگ یک کادر دور چند قطعه بکشید تا انتخاب شوند. برای تکه‌های متصل‌به‌هم یکی را
              انتخاب و «انتخاب قطعات هم‌خط» را بزنید.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-xs text-brand-300">{selectedFragments.size} قطعه انتخاب شده</span>
            <button onClick={onClose} className="rounded-lg p-2 text-secondary hover:bg-white/10 hover:text-current transition-colors" title="بستن">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={addToLineId} onChange={(e) => setAddToLineId(e.target.value)} className="input !w-auto text-xs">
            <option value="">افزودن به خط...</option>
            {project.lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.svgElementId}
              </option>
            ))}
          </select>
          <button
            onClick={handleAddToLine}
            disabled={!addToLineId || selectedFragments.size === 0}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            <PlusSquare size={13} /> افزودن
          </button>
          <button
            onClick={selectConnectedChain}
            disabled={selectedFragments.size === 0 || !svgRoot}
            title="از قطعات انتخاب‌شده، بقیه قطعات هم‌خط (متصل به هم) را هم به‌صورت خودکار انتخاب می‌کند"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 disabled:opacity-30 transition-colors"
          >
            <Sparkles size={13} /> انتخاب قطعات هم‌خط
          </button>
          <button
            onClick={() => setShowCreateLine(true)}
            disabled={selectedFragments.size === 0}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-400 disabled:opacity-30 transition-colors"
          >
            <PlusSquare size={13} /> ساخت خط جدید از انتخاب
          </button>
          <button
            onClick={handleUnmap}
            disabled={selectedFragments.size === 0}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-30 transition-colors"
          >
            <Unlink size={13} /> جدا کردن از خط فعلی
          </button>
        </div>
      </header>

      <div className="flex-1 p-4 min-h-0">
        <div className="h-full glass-panel rounded-2xl p-2">
          <IsoViewport
            svgRaw={svgRaw}
            lines={project.lines}
            progressMap={EMPTY_PROGRESS}
            selectedLineId={null}
            onSelectLine={() => {}}
            fixMode
            selectedFragmentIds={selectedFragments}
            onToggleFragment={toggleFragment}
            onSvgReady={handleSvgReady}
            onMarqueeSelect={handleMarqueeSelect}
          />
        </div>
      </div>

      {showCreateLine && (
        <LineMetaModal
          onClose={() => setShowCreateLine(false)}
          onConfirm={confirmCreateLine}
          title="ساخت خط جدید از قطعات انتخاب‌شده"
          subtitle={`${selectedFragments.size} قطعه به این خط جدید متصل می‌شود`}
          confirmLabel="ساخت خط"
          collectLengthWelds
          selectionHint={`${selectedFragments.size} قطعه انتخاب شده — طول و تعداد سرجوش را مطابق نقشه وارد کنید`}
        />
      )}
    </div>
  )
}
