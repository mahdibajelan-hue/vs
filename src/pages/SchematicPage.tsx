import { useEffect, useState } from 'react'
import { Save, Trash2, RotateCcw, RotateCw, Delete, CornerDownLeft, XCircle, Ruler, Pencil, HelpCircle, FlipHorizontal } from 'lucide-react'
import type { DraftLine, IsoLine, PlacedEquipmentItem, PlacedSymbol, Project } from '../types'
import type { Point } from '../lib/isoGeometry'
import {
  snapIsoPoint,
  snapToGrid,
  nearestPointOnPolylines,
  projectIso3D,
  distance3D,
  polylineLength,
  PIXELS_PER_METER,
} from '../lib/isoGeometry'
import { estimateWeldCount } from '../lib/weldEstimate'
import type { SymbolType } from '../data/pipingSymbols'
import { SYMBOL_DEFS } from '../data/pipingSymbols'
import { buildSchematicSvg } from '../lib/schematicExport'
import { makeId } from '../lib/id'
import { useStore } from '../store/useStore'
import { SymbolPalette, type EditorMode } from '../components/Schematic/SymbolPalette'
import { IsoCanvas, CANVAS_WIDTH, CANVAS_HEIGHT, type CanvasSelection } from '../components/Schematic/IsoCanvas'
import { LineMetaModal } from '../components/common/LineMetaModal'
import { TeeMetaModal } from '../components/Schematic/TeeMetaModal'
import { CoordinateLineModal } from '../components/Schematic/CoordinateLineModal'
import { SchematicGuideModal } from '../components/Schematic/SchematicGuideModal'
import { Modal } from '../components/common/Modal'

const ORIGIN: Point = { x: 450, y: 550 }
const GUIDE_SEEN_KEY = 'piping-iso-tracker-schematic-guide-seen'
const SNAP_THRESHOLD = 25

export function SchematicPage({ project, onSaved }: { project: Project; onSaved: () => void }) {
  const setProjectSvg = useStore((s) => s.setProjectSvg)
  const setEquipment = useStore((s) => s.setEquipment)

  const [mode, setMode] = useState<EditorMode>('draw')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [symbols, setSymbols] = useState<PlacedSymbol[]>([])
  const [draftPoints, setDraftPoints] = useState<Point[]>([])
  /** End of the most recently drawn line/placed symbol — a fresh line auto-continues from here instead of floating disconnected. */
  const [lastAnchor, setLastAnchor] = useState<Point | null>(null)
  const [hoverPreview, setHoverPreview] = useState<Point | null>(null)
  const [selection, setSelection] = useState<CanvasSelection | null>(null)
  const [showMetaModal, setShowMetaModal] = useState(false)
  const [showCoordinateModal, setShowCoordinateModal] = useState(false)
  const [pendingTeeId, setPendingTeeId] = useState<string | null>(null)
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showGuide, setShowGuide] = useState(() => !localStorage.getItem(GUIDE_SEEN_KEY))

  const closeGuide = () => {
    localStorage.setItem(GUIDE_SEEN_KEY, '1')
    setShowGuide(false)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') {
        setDraftPoints([])
        setSelection(null)
      } else if (e.key === 'Backspace' && draftPoints.length > 0) {
        setDraftPoints((pts) => pts.slice(0, -1))
      } else if (e.key === 'Delete' && selection) {
        deleteSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPoints, selection])

  const handleCanvasClick = (point: Point, target: { kind: 'background' | 'line' | 'symbol'; id?: string }) => {
    if (mode === 'select') {
      if (target.kind === 'line' && target.id) setSelection({ kind: 'line', id: target.id })
      else if (target.kind === 'symbol' && target.id) setSelection({ kind: 'symbol', id: target.id })
      else setSelection(null)
      return
    }

    if (mode === 'draw') {
      setDraftPoints((pts) => {
        if (pts.length === 0 && lastAnchor) {
          // Continue from wherever the last line/symbol left off, instead of starting a
          // disconnected floating segment — the click just aims the first bend from there.
          return [lastAnchor, snapIsoPoint(lastAnchor, point)]
        }
        const prev = pts[pts.length - 1]
        const snapped = prev ? snapIsoPoint(prev, point) : snapToGrid(point)
        return [...pts, snapped]
      })
      return
    }

    if (mode.startsWith('symbol:')) {
      const type = mode.slice('symbol:'.length) as SymbolType
      const near = nearestPointOnPolylines(point, lines, SNAP_THRESHOLD)
      const id = makeId('sym')
      const px = near ? near.point.x : point.x
      const py = near ? near.point.y : point.y
      const symbol: PlacedSymbol = {
        id,
        type,
        x: px,
        y: py,
        rotation: near ? near.angleDeg : 0,
        lineId: near?.lineId,
      }
      setSymbols((s) => [...s, symbol])
      setLastAnchor({ x: px, y: py })
      if (type === 'fitting-tee') setPendingTeeId(id)
    }
  }

  const finishLine = () => {
    if (draftPoints.length < 2) return
    setShowMetaModal(true)
  }

  const confirmLineMeta = (svgElementId: string, size: string) => {
    setLines((ls) => [...ls, { id: makeId('dline'), svgElementId, size, points: draftPoints }])
    setLastAnchor(draftPoints[draftPoints.length - 1] ?? null)
    setDraftPoints([])
    setShowMetaModal(false)
  }

  const confirmCoordinateLine = (data: { svgElementId: string; size: string; start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }) => {
    const startCanvas = projectIso3D(data.start, ORIGIN)
    const endCanvas = projectIso3D(data.end, ORIGIN)
    const realLengthMeters = distance3D(data.start, data.end)
    setLines((ls) => [
      ...ls,
      { id: makeId('dline'), svgElementId: data.svgElementId, size: data.size, points: [startCanvas, endCanvas], realLengthMeters },
    ])
    setLastAnchor(endCanvas)
    setShowCoordinateModal(false)
  }

  const confirmTeeMeta = (mainSize: string, branchSize: string) => {
    if (pendingTeeId) {
      setSymbols((ss) => ss.map((s) => (s.id === pendingTeeId ? { ...s, mainSize, branchSize } : s)))
    }
    setPendingTeeId(null)
  }

  const deleteSelection = () => {
    if (!selection) return
    if (selection.kind === 'line') setLines((ls) => ls.filter((l) => l.id !== selection.id))
    else setSymbols((ss) => ss.filter((s) => s.id !== selection.id))
    setSelection(null)
  }

  const rotateSelectedSymbol = (delta: number) => {
    if (selection?.kind !== 'symbol') return
    setSymbols((ss) => ss.map((s) => (s.id === selection.id ? { ...s, rotation: (s.rotation + delta + 360) % 360 } : s)))
  }

  const setSelectedSymbolRotation = (deg: number) => {
    if (selection?.kind !== 'symbol') return
    const normalized = ((deg % 360) + 360) % 360
    setSymbols((ss) => ss.map((s) => (s.id === selection.id ? { ...s, rotation: normalized } : s)))
  }

  const handleSymbolMove = (id: string, point: Point) => {
    const near = nearestPointOnPolylines(point, lines, SNAP_THRESHOLD * 2)
    setSymbols((ss) => ss.map((s) => (s.id === id ? { ...s, x: point.x, y: point.y, lineId: near?.lineId ?? s.lineId } : s)))
  }

  const doSave = async () => {
    if (saving) return
    setSaving(true)
    const svgRaw = buildSchematicSvg(lines, symbols, CANVAS_WIDTH, CANVAS_HEIGHT)
    const newIsoLines: IsoLine[] = lines.map((l) => {
      const lengthMeters = l.realLengthMeters ?? polylineLength(l.points) / PIXELS_PER_METER
      const fittingCount = symbols.filter((s) => s.lineId === l.id).length
      return {
        id: makeId('line'),
        svgElementId: l.svgElementId,
        svgElementIds: [l.svgElementId],
        size: l.size,
        spec: '',
        service: '',
        contractor: '',
        plannedLength: Math.round(lengthMeters * 10) / 10,
        totalWelds: estimateWeldCount(lengthMeters, fittingCount),
        fittingWeldCount: fittingCount * 2,
        status: 'not_started',
        createdAt: new Date().toISOString(),
      }
    })
    try {
      const insertedLines = await setProjectSvg(project.id, svgRaw, 'schematic-drawing.svg', newIsoLines)
      // setProjectSvg assigns fresh db ids — resolve each placed symbol's draft lineId back to a
      // real one via the shared svgElementId, the same remap App.tsx's demo loader uses.
      const realIdByElementId = new Map(insertedLines.map((l) => [l.svgElementId, l.id]))
      const now = new Date().toISOString()
      const newEquipment: PlacedEquipmentItem[] = symbols.map((s) => {
        const def = SYMBOL_DEFS[s.type]
        const draftLine = s.lineId ? lines.find((l) => l.id === s.lineId) : undefined
        const realLineId = draftLine ? (realIdByElementId.get(draftLine.svgElementId) ?? null) : null
        return { id: makeId('equip'), lineId: realLineId, type: s.type, category: def.category, label: def.shortLabel, createdAt: now }
      })
      await setEquipment(project.id, newEquipment)
      setShowOverwriteConfirm(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const handleSaveClick = () => {
    if (lines.length === 0) return
    if (project.svgRaw) setShowOverwriteConfirm(true)
    else doSave()
  }

  const selectedLine = selection?.kind === 'line' ? lines.find((l) => l.id === selection.id) : null
  const selectedSymbol = selection?.kind === 'symbol' ? symbols.find((s) => s.id === selection.id) : null

  return (
    <div className="flex h-full gap-4 p-4">
      <div className="w-72 shrink-0 glass-panel rounded-2xl overflow-hidden">
        <SymbolPalette mode={mode} onModeChange={setMode} />
      </div>

      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <div className="flex items-center justify-between glass-panel rounded-2xl px-4 py-2.5">
          <div className="flex items-center gap-4 text-xs text-secondary">
            <span>{lines.length} خط ترسیم‌شده</span>
            <span>{symbols.length} علامت</span>
            {mode === 'draw' && (
              <span className="text-brand-300">
                حالت ترسیم — روی نقشه کلیک کنید تا نقطه اضافه شود، سپس «پایان خط» را بزنید
                {lastAnchor && draftPoints.length === 0 && ' (خط جدید از انتهای خط قبلی ادامه می‌یابد)'}
              </span>
            )}
            {mode === 'select' && (
              <span className="text-brand-300">حالت انتخاب — روی خط/علامت کلیک کنید تا ویرایش شود، یا علامت را بکشید تا جابه‌جا شود</span>
            )}
            {mode.startsWith('symbol:') && (
              <span className="text-brand-300">
                حالت افزودن «{SYMBOL_DEFS[mode.slice('symbol:'.length) as SymbolType].label}» — روی نقطه‌ای از خط کلیک کنید
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuide(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
            >
              <HelpCircle size={13} /> راهنما
            </button>
            {mode === 'draw' && draftPoints.length === 0 && lastAnchor && (
              <button
                onClick={() => setLastAnchor(null)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
                title="خط بعدی به‌جای ادامه از خط قبلی، مستقل و از نقطه دلخواه شروع می‌شود"
              >
                <XCircle size={13} /> شروع خط مجزا
              </button>
            )}
            {mode === 'draw' && draftPoints.length > 0 && (
              <>
                <button
                  onClick={finishLine}
                  disabled={draftPoints.length < 2}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
                >
                  <CornerDownLeft size={13} /> پایان خط
                </button>
                <button
                  onClick={() => setDraftPoints([])}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
                >
                  <XCircle size={13} /> لغو
                </button>
              </>
            )}
            <button
              onClick={() => setShowCoordinateModal(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
            >
              <Ruler size={13} /> افزودن خط با مختصات
            </button>
            <button
              onClick={handleSaveClick}
              disabled={lines.length === 0 || saving}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-400 disabled:opacity-40 transition-colors"
            >
              <Save size={14} /> {saving ? 'در حال ذخیره...' : 'ذخیره در پروژه'}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <IsoCanvas
            lines={lines}
            symbols={symbols}
            draftPoints={draftPoints}
            selection={selection}
            onCanvasClick={handleCanvasClick}
            onHoverPoint={setHoverPreview}
            hoverPreview={hoverPreview}
            onSymbolMove={handleSymbolMove}
          />
        </div>

        {selectedLine && (
          <div className="glass-panel rounded-2xl px-4 py-3 flex items-center gap-6 text-sm">
            <div>
              <p className="text-xs text-muted">خط انتخاب‌شده</p>
              <p className="font-bold">
                {selectedLine.svgElementId} {selectedLine.size && `— ${selectedLine.size}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">طول تخمینی</p>
              <p className="font-bold num">
                {Math.round(
                  ((selectedLine.realLengthMeters ?? polylineLength(selectedLine.points) / PIXELS_PER_METER) * 10),
                ) / 10}{' '}
                m
              </p>
            </div>
            <button
              onClick={deleteSelection}
              className="mr-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} /> حذف خط
            </button>
          </div>
        )}

        {selectedSymbol && (
          <div className="glass-panel rounded-2xl px-4 py-3 flex items-center gap-4 text-sm">
            <div>
              <p className="text-xs text-muted">علامت انتخاب‌شده</p>
              <p className="font-bold">
                {SYMBOL_DEFS[selectedSymbol.type].label}
                {selectedSymbol.type === 'fitting-tee' && (selectedSymbol.mainSize || selectedSymbol.branchSize) && (
                  <span className="text-secondary font-normal">
                    {' '}
                    ({selectedSymbol.mainSize || '—'} × {selectedSymbol.branchSize || '—'})
                  </span>
                )}
              </p>
            </div>
            {selectedSymbol.type === 'fitting-tee' && (
              <button
                onClick={() => setPendingTeeId(selectedSymbol.id)}
                className="rounded-lg p-2 text-secondary hover:bg-white/5 transition-colors"
                title="ویرایش سایزها"
              >
                <Pencil size={15} />
              </button>
            )}
            <button onClick={() => rotateSelectedSymbol(-15)} className="rounded-lg p-2 text-secondary hover:bg-white/5 transition-colors" title="چرخش پادساعتگرد">
              <RotateCcw size={15} />
            </button>
            <button onClick={() => rotateSelectedSymbol(15)} className="rounded-lg p-2 text-secondary hover:bg-white/5 transition-colors" title="چرخش ساعتگرد">
              <RotateCw size={15} />
            </button>
            <button
              onClick={() => rotateSelectedSymbol(180)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-secondary hover:bg-white/5 transition-colors"
              title="معکوس کردن جهت (۱۸۰ درجه)"
            >
              <FlipHorizontal size={15} /> معکوس
            </button>
            <label className="flex items-center gap-1.5 text-xs text-secondary">
              زاویه
              <input
                type="number"
                value={Math.round(selectedSymbol.rotation)}
                onChange={(e) => setSelectedSymbolRotation(parseInt(e.target.value, 10) || 0)}
                className="w-16 rounded-md bg-black/20 border border-white/10 px-2 py-1 text-xs outline-none focus:border-brand-400 num"
              />
              °
            </label>
            <button
              onClick={deleteSelection}
              className="mr-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Delete size={14} /> حذف علامت
            </button>
          </div>
        )}
      </div>

      {showGuide && <SchematicGuideModal onClose={closeGuide} />}
      {showMetaModal && (
        <LineMetaModal onClose={() => setShowMetaModal(false)} onConfirm={confirmLineMeta} confirmLabel="تایید و افزودن خط" />
      )}
      {showCoordinateModal && <CoordinateLineModal onClose={() => setShowCoordinateModal(false)} onConfirm={confirmCoordinateLine} />}
      {pendingTeeId && <TeeMetaModal onClose={() => setPendingTeeId(null)} onConfirm={confirmTeeMeta} />}

      {showOverwriteConfirm && (
        <Modal title="جایگزینی نقشه پروژه" subtitle="این پروژه از قبل یک نقشه دارد" onClose={() => setShowOverwriteConfirm(false)}>
          <p className="text-sm text-secondary leading-7">
            با ذخیره این نقشه شماتیک، نقشه فعلی پروژه و لیست {project.lines.length} خط آن به‌طور کامل حذف می‌شود.{' '}
            {project.logs.length > 0 ? (
              <b className="text-red-400">
                این کار {project.logs.length} کارکرد روزانه‌ی ثبت‌شده روی این خطوط را برای همیشه از پایگاه داده حذف می‌کند — نه فقط از نمایش نقشه. این عملیات غیرقابل بازگشت است.
              </b>
            ) : (
              'این پروژه هنوز کارکرد روزانه‌ای ثبت‌نشده، بنابراین جایگزینی نقشه داده‌ای را حذف نمی‌کند.'
            )}{' '}
            طول و تعداد سرجوش هر خط جدید به‌صورت تخمینی محاسبه شده و در «مدیریت خطوط» قابل ویرایش است. ادامه می‌دهید؟
          </p>
          <div className="flex justify-end gap-2 pt-4">
            <button onClick={() => setShowOverwriteConfirm(false)} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
              انصراف
            </button>
            <button
              onClick={doSave}
              disabled={saving}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400 disabled:opacity-40 transition-colors"
            >
              {saving ? 'در حال ذخیره...' : 'جایگزین کن و ذخیره کن'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
