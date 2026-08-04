import { useCallback, useMemo, useState } from 'react'
import { Upload, Table2, Download, Wrench, PlusSquare, Unlink, XCircle, Sparkles } from 'lucide-react'
import type { Project } from '../types'
import { computeAllProgress } from '../lib/progress'
import { IsoViewport } from '../components/IsoViewer/IsoViewport'
import { LineListPanel } from '../components/IsoViewer/LineListPanel'
import { UploadSvgModal } from '../components/IsoViewer/UploadSvgModal'
import { LinesTableModal } from '../components/IsoViewer/LinesTableModal'
import { DailyLogForm } from '../components/IsoViewer/DailyLogForm'
import { LineMetaModal } from '../components/common/LineMetaModal'
import { Legend } from '../components/common/Legend'
import { useStore } from '../store/useStore'
import { useAuthStore } from '../store/useAuthStore'
import { canEdit } from '../lib/permissions'
import { makeId } from '../lib/id'
import { exportColoredSvg } from '../lib/export'
import { parseSvgCandidates, isLikelyLineId } from '../lib/svg'
import { pickGroupLabel, extractSegmentEndpoints, computeMergeGroups, defaultMergeTolerance } from '../lib/lineMerge'

export function ViewerPage({ project }: { project: Project }) {
  const setProjectSvg = useStore((s) => s.setProjectSvg)
  const mergeFragmentsIntoNewLine = useStore((s) => s.mergeFragmentsIntoNewLine)
  const addFragmentsToLine = useStore((s) => s.addFragmentsToLine)
  const removeFragmentsFromLines = useStore((s) => s.removeFragmentsFromLines)
  const role = useAuthStore((s) => s.currentUser()?.role)
  const editable = canEdit(role)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showLinesTable, setShowLinesTable] = useState(false)
  const [logLineId, setLogLineId] = useState<string | null>(null)

  const [fixMode, setFixMode] = useState(false)
  const [selectedFragments, setSelectedFragments] = useState<Set<string>>(new Set())
  const [showCreateLine, setShowCreateLine] = useState(false)
  const [addToLineId, setAddToLineId] = useState('')
  const [svgRoot, setSvgRoot] = useState<SVGSVGElement | null>(null)

  const progressMap = useMemo(() => computeAllProgress(project), [project])
  const selectedLine = project.lines.find((l) => l.id === selectedLineId) ?? null
  const selectedProgress = selectedLineId ? progressMap.get(selectedLineId) : null

  const candidateIds = useMemo(() => {
    if (!project.svgRaw) return []
    try {
      return parseSvgCandidates(project.svgRaw).map((c) => c.elementId)
    } catch {
      return []
    }
  }, [project.svgRaw])

  const handleSvgReady = useCallback((root: SVGSVGElement | null) => setSvgRoot(root), [])

  const handleConfirmUpload = (svgRaw: string, fileName: string, groups: string[][]) => {
    const now = new Date().toISOString()
    const newLines = groups.map((group) => ({
      id: makeId('line'),
      svgElementId: pickGroupLabel(group, isLikelyLineId),
      svgElementIds: group,
      size: '',
      spec: '',
      service: '',
      contractor: '',
      plannedLength: 10,
      totalWelds: 1,
      status: 'not_started' as const,
      createdAt: now,
    }))
    setProjectSvg(project.id, svgRaw, fileName, newLines)
    setShowUpload(false)
    setShowLinesTable(true)
  }

  const toggleFixMode = () => {
    setFixMode((f) => !f)
    setSelectedFragments(new Set())
  }

  const toggleFragment = (elementId: string) => {
    setSelectedFragments((prev) => {
      const next = new Set(prev)
      if (next.has(elementId)) next.delete(elementId)
      else next.add(elementId)
      return next
    })
  }

  const confirmCreateLine = (svgElementId: string, size: string) => {
    mergeFragmentsIntoNewLine(project.id, { svgElementIds: [...selectedFragments], svgElementId, size })
    setSelectedFragments(new Set())
    setShowCreateLine(false)
  }

  const handleAddToLine = () => {
    if (!addToLineId || selectedFragments.size === 0) return
    addFragmentsToLine(project.id, addToLineId, [...selectedFragments])
    setSelectedFragments(new Set())
  }

  const handleUnmap = () => {
    if (selectedFragments.size === 0) return
    removeFragmentsFromLines(project.id, [...selectedFragments])
    setSelectedFragments(new Set())
  }

  const selectConnectedChain = () => {
    if (!svgRoot || selectedFragments.size === 0 || candidateIds.length === 0) return
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

  if (!project.svgRaw) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="glass-panel max-w-md rounded-2xl p-8 text-center">
          <p className="mb-1 text-lg font-bold">هنوز نقشه‌ای آپلود نشده</p>
          <p className="mb-5 text-sm text-secondary">
            {editable
              ? 'فایل SVG نقشه ایزومتریک این پروژه را بارگذاری کنید تا خطوط لوله به‌صورت خودکار استخراج شوند.'
              : 'هنوز نقشه‌ای برای این پروژه بارگذاری نشده است.'}
          </p>
          {editable && (
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
            >
              <Upload size={16} /> آپلود فایل SVG
            </button>
          )}
        </div>
        {showUpload && <UploadSvgModal onClose={() => setShowUpload(false)} onConfirm={handleConfirmUpload} />}
      </div>
    )
  }

  return (
    <div className="flex h-full gap-4 p-4">
      <div className="w-80 shrink-0 glass-panel rounded-2xl overflow-hidden">
        <LineListPanel
          lines={project.lines}
          progressMap={progressMap}
          selectedLineId={selectedLineId}
          onSelectLine={setSelectedLineId}
          onLogLine={setLogLineId}
          editable={editable && !fixMode}
        />
      </div>

      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between glass-panel rounded-2xl px-4 py-2.5">
          <Legend />
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportColoredSvg(project, `${project.name}-iso-colored.svg`)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
            >
              <Download size={14} /> خروجی SVG رنگی
            </button>
            {editable && (
              <button
                onClick={() => setShowLinesTable(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
              >
                <Table2 size={14} /> مدیریت خطوط
              </button>
            )}
            {editable && (
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
              >
                <Upload size={14} /> آپلود مجدد
              </button>
            )}
            {editable && (
              <button
                onClick={toggleFixMode}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                  fixMode ? 'bg-brand-500 text-white' : 'text-secondary hover:bg-white/5'
                }`}
              >
                <Wrench size={14} /> اصلاح نقشه
              </button>
            )}
          </div>
        </div>

        {fixMode && (
          <div className="glass-panel rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
            <p className="text-xs text-secondary leading-6">
              روی یک یا چند تکه شکسته‌شده کلیک کنید، سپس «انتخاب قطعات هم‌خط» را بزنید تا بقیه تکه‌های همان مسیر
              به‌صورت خودکار انتخاب شوند — دیگر لازم نیست تک‌تک کلیک کنید. در پایان آن‌ها را زیر یک شناسه ادغام کنید یا
              از خط فعلی جدا کنید.
            </p>
            <span className="rounded-full bg-brand-500/15 px-2.5 py-1 text-xs text-brand-300 shrink-0">
              {selectedFragments.size} قطعه انتخاب شده
            </span>
            <div className="flex flex-wrap items-center gap-2 mr-auto">
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
              <button onClick={toggleFixMode} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors">
                <XCircle size={13} /> پایان اصلاح
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 glass-panel rounded-2xl p-2 min-h-0">
          <IsoViewport
            svgRaw={project.svgRaw}
            lines={project.lines}
            progressMap={progressMap}
            selectedLineId={selectedLineId}
            onSelectLine={setSelectedLineId}
            fixMode={fixMode}
            selectedFragmentIds={selectedFragments}
            onToggleFragment={toggleFragment}
            onSvgReady={handleSvgReady}
          />
        </div>

        {!fixMode && selectedLine && selectedProgress && (
          <div className="glass-panel rounded-2xl px-4 py-3 flex items-center gap-6 text-sm">
            <div>
              <p className="text-xs text-muted">خط انتخاب‌شده</p>
              <p className="font-bold">{selectedLine.svgElementId}</p>
            </div>
            <div>
              <p className="text-xs text-muted">پیشرفت</p>
              <p className="font-bold num">{selectedProgress.percent}%</p>
            </div>
            <div>
              <p className="text-xs text-muted">متراژ</p>
              <p className="font-bold num">
                {selectedProgress.lengthDone} / {selectedLine.plannedLength} m
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">سرجوش</p>
              <p className="font-bold num">
                {selectedProgress.weldsDone} / {selectedLine.totalWelds}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">تعداد قطعه SVG</p>
              <p className="font-bold num">{selectedLine.svgElementIds.length}</p>
            </div>
            {editable && (
              <button
                onClick={() => setLogLineId(selectedLine.id)}
                className="mr-auto rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
              >
                ثبت کارکرد روزانه
              </button>
            )}
          </div>
        )}
      </div>

      {showUpload && <UploadSvgModal onClose={() => setShowUpload(false)} onConfirm={handleConfirmUpload} />}
      {showLinesTable && (
        <LinesTableModal projectId={project.id} lines={project.lines} onClose={() => setShowLinesTable(false)} />
      )}
      {logLineId && (
        <DailyLogForm projectId={project.id} lines={project.lines} initialLineId={logLineId} onClose={() => setLogLineId(null)} />
      )}
      {showCreateLine && (
        <LineMetaModal
          onClose={() => setShowCreateLine(false)}
          onConfirm={confirmCreateLine}
          title="ساخت خط جدید از قطعات انتخاب‌شده"
          subtitle={`${selectedFragments.size} قطعه به این خط جدید متصل می‌شود`}
          confirmLabel="ساخت خط"
        />
      )}
    </div>
  )
}
