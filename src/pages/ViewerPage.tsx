import { useMemo, useState } from 'react'
import { Upload, Table2, Download } from 'lucide-react'
import type { Project } from '../types'
import { computeAllProgress } from '../lib/progress'
import { IsoViewport } from '../components/IsoViewer/IsoViewport'
import { LineListPanel } from '../components/IsoViewer/LineListPanel'
import { UploadSvgModal } from '../components/IsoViewer/UploadSvgModal'
import { LinesTableModal } from '../components/IsoViewer/LinesTableModal'
import { DailyLogForm } from '../components/IsoViewer/DailyLogForm'
import { Legend } from '../components/common/Legend'
import { useStore } from '../store/useStore'
import { makeId } from '../lib/id'
import { exportColoredSvg } from '../lib/export'

export function ViewerPage({ project }: { project: Project }) {
  const setProjectSvg = useStore((s) => s.setProjectSvg)
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showLinesTable, setShowLinesTable] = useState(false)
  const [logLineId, setLogLineId] = useState<string | null>(null)

  const progressMap = useMemo(() => computeAllProgress(project), [project])
  const selectedLine = project.lines.find((l) => l.id === selectedLineId) ?? null
  const selectedProgress = selectedLineId ? progressMap.get(selectedLineId) : null

  const handleConfirmUpload = (svgRaw: string, fileName: string, selectedIds: string[]) => {
    const now = new Date().toISOString()
    const newLines = selectedIds.map((svgElementId) => ({
      id: makeId('line'),
      svgElementId,
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

  if (!project.svgRaw) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="glass-panel max-w-md rounded-2xl p-8 text-center">
          <p className="mb-1 text-lg font-bold">هنوز نقشه‌ای آپلود نشده</p>
          <p className="mb-5 text-sm text-secondary">
            فایل SVG نقشه ایزومتریک این پروژه را بارگذاری کنید تا خطوط لوله به‌صورت خودکار استخراج شوند.
          </p>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
          >
            <Upload size={16} /> آپلود فایل SVG
          </button>
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
            <button
              onClick={() => setShowLinesTable(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
            >
              <Table2 size={14} /> مدیریت خطوط
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
            >
              <Upload size={14} /> آپلود مجدد
            </button>
          </div>
        </div>

        <div className="flex-1 glass-panel rounded-2xl p-2 min-h-0">
          <IsoViewport
            svgRaw={project.svgRaw}
            lines={project.lines}
            progressMap={progressMap}
            selectedLineId={selectedLineId}
            onSelectLine={setSelectedLineId}
          />
        </div>

        {selectedLine && selectedProgress && (
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
            <button
              onClick={() => setLogLineId(selectedLine.id)}
              className="mr-auto rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-400 transition-colors"
            >
              ثبت کارکرد روزانه
            </button>
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
    </div>
  )
}
