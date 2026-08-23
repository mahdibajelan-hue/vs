import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Boxes, Check, Loader2, Map, MapPin, MousePointerClick, Pencil, Plus, RefreshCcw, Trash2, Upload, X } from 'lucide-react'
import type { Equipment3D, Joint, Point3D, Project, Spool } from '../types'
import { JOINT_TYPE_LABEL_FA } from '../types'
import { useStore } from '../store/useStore'
import { useCurrentRole } from '../store/useMembersStore'
import { useAuthStore } from '../store/useAuthStore'
import { canEdit } from '../lib/permissions'
import { getProjectModel3dSignedUrl } from '../lib/model3dStorage'
import { formatJalali } from '../lib/jalali'
import { EQUIPMENT_COMPLETE_COLOR, SPOOL_COMPLETE_COLOR } from '../lib/model3dColoring'
import type { SplitStats } from '../lib/model3dSplit'
import { ThreeViewer, type ViewerMode } from '../components/Model3D/ThreeViewer'
import { WeldMap2D } from '../components/Model3D/WeldMap2D'
import { JointInfoCard } from '../components/Model3D/JointInfoCard'
import { JointFormModal, JointCompleteDateModal } from '../components/Model3D/JointFormModal'
import { Equipment3DFormModal } from '../components/Model3D/Equipment3DFormModal'
import { JalaliDateInput } from '../components/common/JalaliDateInput'

type SidePanelTab = 'lines' | 'equipment'
type PageView = '3d' | 'map'

type MeshSelectionTarget =
  | { kind: 'spool'; lineId: string; startJointId: string; endJointId: string; spoolId?: string }
  | { kind: 'equipment'; equipmentId: string }

/**
 * 3D model viewer (spec: bring a Navisworks-exported model into PipePulse) with a joint-centric
 * progress-tracking layer on top. Only FBX is supported client-side — Navisworks Manage's other
 * export options (NWD/NWF, DWFX/3D DWF, KML) are either a closed Autodesk format with no in-browser
 * parser, or not real 3D geometry formats. Progress is tracked manually (no auto name-matching):
 * the user places joints (weld/flange) by clicking their approximate location on the model, and
 * once two consecutive joints exist their spool can be linked to one or more 3D mesh objects — the
 * spool colors only once both bounding joints are completed. Equipment is a separate, non-linear
 * entity with its own mesh group and foundation/erection milestones.
 */
export function Model3DPage({ project }: { project: Project }) {
  const setProjectModel3d = useStore((s) => s.setProjectModel3d)
  const clearProjectModel3d = useStore((s) => s.clearProjectModel3d)
  const addJoint = useStore((s) => s.addJoint)
  const updateJoint = useStore((s) => s.updateJoint)
  const deleteJoint = useStore((s) => s.deleteJoint)
  const addEquipment3D = useStore((s) => s.addEquipment3D)
  const updateEquipment3D = useStore((s) => s.updateEquipment3D)
  const deleteEquipment3D = useStore((s) => s.deleteEquipment3D)
  const upsertSpool = useStore((s) => s.upsertSpool)
  const deleteSpool = useStore((s) => s.deleteSpool)

  const role = useCurrentRole()
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const editable = canEdit(role, isAdmin)

  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<SidePanelTab>('lines')
  const [selectedLineId, setSelectedLineId] = useState('')
  const [pageView, setPageView] = useState<PageView>('3d')

  const [viewerMode, setViewerMode] = useState<ViewerMode>('view')
  const [pendingJointPosition, setPendingJointPosition] = useState<Point3D | null>(null)
  const [editingJoint, setEditingJoint] = useState<Joint | null>(null)
  const [completingJointId, setCompletingJointId] = useState<string | null>(null)
  const [editingEquipment, setEditingEquipment] = useState<Equipment3D | 'new' | null>(null)
  const [meshSelectionTarget, setMeshSelectionTarget] = useState<MeshSelectionTarget | null>(null)
  const [selectedMeshNames, setSelectedMeshNames] = useState<string[]>([])
  const [splitStats, setSplitStats] = useState<SplitStats | null>(null)
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null)
  const jointPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedLineId && project.lines.length > 0) setSelectedLineId(project.lines[0].id)
  }, [project.lines, selectedLineId])

  useEffect(() => {
    let cancelled = false
    if (!project.model3dPath) {
      setSignedUrl(null)
      return
    }
    setResolving(true)
    getProjectModel3dSignedUrl(project.model3dPath).then((url) => {
      if (!cancelled) {
        setSignedUrl(url)
        setResolving(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [project.model3dPath])

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.fbx')) {
      setError('فقط فایل FBX پشتیبانی می‌شود — از نویس‌ورکس با گزینه Export → FBX خروجی بگیرید.')
      return
    }
    setError('')
    setUploading(true)
    const ok = await setProjectModel3d(project.id, file)
    setUploading(false)
    if (!ok) setError('بارگذاری فایل ناموفق بود.')
  }

  const resetInteraction = () => {
    setViewerMode('view')
    setPendingJointPosition(null)
    setMeshSelectionTarget(null)
    setSelectedMeshNames([])
  }

  const startPlaceJoint = () => {
    if (!selectedLineId) return
    setPageView('3d')
    setViewerMode('placeJoint')
  }

  const handlePointPicked = (point: Point3D) => {
    setPendingJointPosition(point)
    setViewerMode('view')
  }

  const handleMeshToggle = (meshName: string) => {
    if (meshName.startsWith('__joint_marker_')) return
    setSelectedMeshNames((names) => (names.includes(meshName) ? names.filter((n) => n !== meshName) : [...names, meshName]))
  }

  // Position updates arrive every animation frame while a joint's detail panel is open (the camera
  // keeps orbiting/damping) — mutating the DOM node directly here avoids a React re-render per frame.
  const handleJointScreenPosition = useCallback((pos: { x: number; y: number } | null) => {
    const el = jointPanelRef.current
    if (!el) return
    if (!pos) {
      el.style.visibility = 'hidden'
      return
    }
    el.style.visibility = 'visible'
    el.style.left = `${pos.x}px`
    el.style.top = `${pos.y}px`
  }, [])

  const startSpoolLink = (lineId: string, startJointId: string, endJointId: string, existing?: Spool | null) => {
    setPageView('3d')
    setMeshSelectionTarget({ kind: 'spool', lineId, startJointId, endJointId, spoolId: existing?.id })
    setSelectedMeshNames(existing?.meshObjectNames ?? [])
    setViewerMode('selectMeshes')
  }

  const startEquipmentLink = (equipment: Equipment3D) => {
    setPageView('3d')
    setMeshSelectionTarget({ kind: 'equipment', equipmentId: equipment.id })
    setSelectedMeshNames(equipment.meshObjectNames)
    setViewerMode('selectMeshes')
  }

  const confirmMeshSelection = async () => {
    if (!meshSelectionTarget) return
    if (meshSelectionTarget.kind === 'spool') {
      const { lineId, startJointId, endJointId, spoolId } = meshSelectionTarget
      await upsertSpool(project.id, { lineId, startJointId, endJointId, meshObjectNames: selectedMeshNames }, spoolId)
    } else {
      await updateEquipment3D(project.id, meshSelectionTarget.equipmentId, { meshObjectNames: selectedMeshNames })
    }
    resetInteraction()
  }

  const lineJoints = project.joints.filter((j) => j.lineId === selectedLineId).sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  const selectedLine = project.lines.find((l) => l.id === selectedLineId)
  const selectedJoint = selectedJointId ? (project.joints.find((j) => j.id === selectedJointId) ?? null) : null

  const spoolFor = (startJointId: string, endJointId: string) =>
    project.spools.find((sp) => sp.startJointId === startJointId && sp.endJointId === endJointId)

  const jointStats = {
    total: project.joints.length,
    completed: project.joints.filter((j) => j.status === 'completed').length,
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
        <div className="flex items-center gap-2.5">
          <Box size={18} className="text-brand-400" />
          <div>
            <p className="text-sm font-bold">مدل سه‌بعدی پروژه</p>
            <p className="text-xs text-muted">{project.model3dFileName || 'مدلی بارگذاری نشده است'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {project.model3dPath && (
            <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1">
              <button
                onClick={() => setPageView('3d')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  pageView === '3d' ? 'bg-brand-500 text-white' : 'text-secondary hover:bg-white/5'
                }`}
              >
                <Box size={13} /> نمای سه‌بعدی
              </button>
              <button
                onClick={() => setPageView('map')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  pageView === 'map' ? 'bg-brand-500 text-white' : 'text-secondary hover:bg-white/5'
                }`}
              >
                <Map size={13} /> نقشهٔ جوش
              </button>
            </div>
          )}
          {editable && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-400 disabled:opacity-50 transition-colors"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : project.model3dPath ? <RefreshCcw size={14} /> : <Upload size={14} />}
                {uploading ? 'در حال بارگذاری...' : project.model3dPath ? 'جایگزینی مدل (FBX)' : 'بارگذاری مدل (FBX)'}
              </button>
              {project.model3dPath && (
                <button
                  onClick={() => clearProjectModel3d(project.id)}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-secondary hover:bg-white/5 transition-colors"
                >
                  <Trash2 size={13} /> حذف
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".fbx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                  e.target.value = ''
                }}
              />
            </>
          )}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      {signedUrl && (
        <div className="glass-panel flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl px-4 py-2.5 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#4b5563', opacity: 0.6 }} />
            شروع‌نشده
          </span>
          <span className="flex items-center gap-1.5 text-secondary">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SPOOL_COMPLETE_COLOR }} />
            اسپول تکمیل‌شده
          </span>
          <span className="flex items-center gap-1.5 text-secondary">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: EQUIPMENT_COMPLETE_COLOR }} />
            تجهیز تکمیل‌شده
          </span>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[20rem_1fr]">
        {signedUrl && (
          <div className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl">
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setTab('lines')}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === 'lines' ? 'border-b-2 border-brand-400 text-brand-300' : 'text-secondary hover:bg-white/5'}`}
              >
                خطوط و اتصالات
              </button>
              <button
                onClick={() => setTab('equipment')}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors ${tab === 'equipment' ? 'border-b-2 border-brand-400 text-brand-300' : 'text-secondary hover:bg-white/5'}`}
              >
                تجهیزات
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {tab === 'lines' ? (
                <div className="space-y-3">
                  <select value={selectedLineId} onChange={(e) => setSelectedLineId(e.target.value)} className="input text-xs">
                    {project.lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.svgElementId} {l.size ? `— ${l.size}` : ''}
                      </option>
                    ))}
                  </select>

                  {editable && selectedLineId && (
                    <button
                      onClick={startPlaceJoint}
                      disabled={viewerMode !== 'view'}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand-400/40 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-300 hover:bg-brand-500/20 disabled:opacity-40 transition-colors"
                    >
                      <MapPin size={13} /> افزودن اتصال روی مدل
                    </button>
                  )}

                  {viewerMode === 'placeJoint' && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-500/10 px-3 py-2 text-[11px] text-brand-300">
                      <span>روی مدل کلیک کنید تا محل اتصال ثبت شود</span>
                      <button onClick={resetInteraction} className="shrink-0 rounded-lg p-1 hover:bg-white/10">
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {lineJoints.length === 0 && <p className="py-4 text-center text-[11px] text-muted">هنوز اتصالی برای این خط ثبت نشده است</p>}
                    {lineJoints.map((joint, idx) => {
                      const next = lineJoints[idx + 1]
                      const spool = next ? spoolFor(joint.id, next.id) : null
                      return (
                        <div key={joint.id}>
                          <JointRow
                            joint={joint}
                            editable={editable}
                            onEdit={() => setEditingJoint(joint)}
                            onDelete={() => deleteJoint(project.id, joint.id)}
                            onToggleStatus={() => {
                              if (joint.status === 'completed') {
                                updateJoint(project.id, joint.id, { status: 'not_started', completedDate: null })
                              } else {
                                setCompletingJointId(joint.id)
                              }
                            }}
                          />
                          {next && (
                            <div className="my-1 flex items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-[10px] text-muted">
                              <span>اسپول بین {joint.jointNumber || `#${joint.sequenceNumber}`} و {next.jointNumber || `#${next.sequenceNumber}`}</span>
                              {editable && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    onClick={() => startSpoolLink(selectedLineId, joint.id, next.id, spool)}
                                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-brand-300 hover:bg-brand-500/10"
                                  >
                                    <MousePointerClick size={11} />
                                    {spool ? `پیوند شده (${spool.meshObjectNames.length})` : 'پیوند به مدل'}
                                  </button>
                                  {spool && (
                                    <button
                                      onClick={() => deleteSpool(project.id, spool.id)}
                                      className="rounded-md p-1 text-red-400 hover:bg-red-500/10"
                                      title="لغو پیوند اسپول"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {editable && (
                    <button
                      onClick={() => setEditingEquipment('new')}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand-400/40 bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-300 hover:bg-brand-500/20 transition-colors"
                    >
                      <Plus size={13} /> افزودن تجهیز
                    </button>
                  )}
                  {project.equipment3d.length === 0 && <p className="py-4 text-center text-[11px] text-muted">هنوز تجهیزی ثبت نشده است</p>}
                  {project.equipment3d.map((eq) => (
                    <Equipment3DCard
                      key={eq.id}
                      equipment={eq}
                      editable={editable}
                      onEdit={() => setEditingEquipment(eq)}
                      onDelete={() => deleteEquipment3D(project.id, eq.id)}
                      onSelectMeshes={() => startEquipmentLink(eq)}
                      onSetFoundationDate={(v) => updateEquipment3D(project.id, eq.id, { foundationReadyDate: v || null })}
                      onSetErectedDate={(v) => updateEquipment3D(project.id, eq.id, { erectedDate: v || null })}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-white/10 p-3">
              <p className="mb-2 text-[10px] font-bold text-secondary">آمار جوشکاری</p>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-lg border border-white/10 p-1.5 text-center">
                  <p className="num text-sm font-bold">{jointStats.total.toLocaleString('fa-IR')}</p>
                  <p className="text-[9px] text-muted">کل اتصالات</p>
                </div>
                <div className="rounded-lg border border-white/10 p-1.5 text-center">
                  <p className="num text-sm font-bold text-green-400">{jointStats.completed.toLocaleString('fa-IR')}</p>
                  <p className="text-[9px] text-muted">تکمیل‌شده</p>
                </div>
                <div className="rounded-lg border border-white/10 p-1.5 text-center">
                  <p className="num text-sm font-bold text-red-400">{(jointStats.total - jointStats.completed).toLocaleString('fa-IR')}</p>
                  <p className="text-[9px] text-muted">باقیمانده</p>
                </div>
              </div>
              <p className="mt-2 text-[9px] leading-4 text-muted">
                آمار رادیوگرافی (NDT) در مرحلهٔ بعدی — پس از افزودن مراحل جداگانهٔ جوش/تست به هر اتصال — اضافه می‌شود.
              </p>
            </div>
          </div>
        )}

        <div className="relative min-h-0">
          {!project.model3dPath ? (
            <div className="glass-panel flex h-full flex-col items-center justify-center gap-3 rounded-2xl p-10 text-center">
              <Box size={36} className="text-muted" />
              <p className="text-sm font-medium">هنوز مدل سه‌بعدی برای این پروژه بارگذاری نشده است</p>
              <p className="max-w-md text-xs leading-6 text-muted">
                از نویس‌ورکس منیج، مدل فدرال (Federated Model) را با گزینه Export → FBX خروجی بگیرید و همان فایل را اینجا بارگذاری کنید. سایر
                فرمت‌های نویس‌ورکس (NWD/NWF، DWFX/3D DWF، KML) در این نمایشگر پشتیبانی نمی‌شوند.
              </p>
            </div>
          ) : resolving || !signedUrl ? (
            <div className="glass-panel flex h-full items-center justify-center rounded-2xl">
              <Loader2 size={24} className="animate-spin text-brand-400" />
            </div>
          ) : (
            <>
              <div className={pageView === '3d' ? 'relative h-full' : 'hidden'}>
                <ThreeViewer
                url={signedUrl}
                joints={project.joints}
                equipment3d={project.equipment3d}
                spools={project.spools}
                mode={viewerMode}
                selectedMeshNames={selectedMeshNames}
                onPointPicked={handlePointPicked}
                onMeshToggle={handleMeshToggle}
                onJointClick={setSelectedJointId}
                selectedJointId={selectedJointId}
                onJointScreenPosition={handleJointScreenPosition}
                onSplitStats={setSplitStats}
              />

              {selectedJoint && (
                <div ref={jointPanelRef} className="absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+12px)]" style={{ left: 0, top: 0, visibility: 'hidden' }}>
                  <JointInfoCard
                    joint={selectedJoint}
                    lineLabel={project.lines.find((l) => l.id === selectedJoint.lineId)?.svgElementId ?? ''}
                    equipment3d={project.equipment3d}
                    editable={editable}
                    onEdit={() => {
                      setEditingJoint(selectedJoint)
                      setSelectedJointId(null)
                    }}
                    onClose={() => setSelectedJointId(null)}
                  />
                </div>
              )}

              {viewerMode === 'selectMeshes' && (
                <div className="absolute inset-x-3 bottom-3 flex max-h-[55%] flex-col gap-2 rounded-xl bg-black/75 p-3 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-xs text-white">
                      {selectedMeshNames.length.toLocaleString('fa-IR')} جزء انتخاب شد — روی اجزای مدل کلیک کنید تا انتخاب/لغو شود
                      {/* Whether a click can land on a single pipe depends entirely on how the
                          exporter merged the file, so the outcome is stated instead of leaving a
                          fused model looking like a broken app. */}
                      {splitStats && (
                        <span className="mt-0.5 block text-[10px] text-white/60">
                          {splitStats.meshesSplit > 0
                            ? `مدل تفکیک شد: ${splitStats.meshesBefore.toLocaleString('fa-IR')} جزء → ${splitStats.meshesAfter.toLocaleString('fa-IR')} جزء قابل انتخاب`
                            : `${splitStats.meshesBefore.toLocaleString('fa-IR')} جزء — اجزای این فایل در خروجی به هم جوش خورده‌اند و بیش از این قابل تفکیک نیستند`}
                        </span>
                      )}
                    </span>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={resetInteraction} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/10">
                        انصراف
                      </button>
                      <button
                        onClick={confirmMeshSelection}
                        className="flex items-center gap-1 rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-400"
                      >
                        <Check size={13} /> تایید
                      </button>
                    </div>
                  </div>
                  {selectedMeshNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 overflow-y-auto border-t border-white/10 pt-2">
                      {selectedMeshNames.map((name) => (
                        <span key={name} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white">
                          {name}
                          <button
                            onClick={() => handleMeshToggle(name)}
                            className="rounded-full p-0.5 text-white/70 hover:bg-white/20 hover:text-white"
                            title="حذف از انتخاب"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              </div>

              {pageView === 'map' && (
                <div className="flex h-full flex-col gap-3">
                  <div className="min-h-0 flex-1">
                    <WeldMap2D
                      joints={lineJoints}
                      lineLabel={selectedLine?.svgElementId ?? ''}
                      equipment3d={project.equipment3d}
                      selectedJointId={selectedJointId}
                      onSelectJoint={setSelectedJointId}
                      onEditJoint={(joint) => {
                        setEditingJoint(joint)
                        setSelectedJointId(null)
                      }}
                      editable={editable}
                    />
                  </div>
                  <div className="glass-panel flex shrink-0 flex-wrap items-center gap-4 rounded-2xl p-3">
                    <NestedWeldDonut total={jointStats.total} completed={jointStats.completed} />
                    <div className="grid flex-1 grid-cols-3 gap-2">
                      <StatTile label="کل اتصالات" value={jointStats.total} color="#38bdf8" />
                      <StatTile label="جوشکاری‌شده" value={jointStats.completed} color="#2ecc71" />
                      <StatTile label="باقیمانده" value={jointStats.total - jointStats.completed} color="#e74c3c" />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {pendingJointPosition && selectedLine && (
        <JointFormModal
          lineLabel={selectedLine.svgElementId}
          position={pendingJointPosition}
          equipment3d={project.equipment3d}
          onClose={() => setPendingJointPosition(null)}
          onSubmit={async (data) => {
            await addJoint(project.id, {
              lineId: selectedLineId,
              jointType: data.jointType,
              jointNumber: data.jointNumber,
              diameter: data.diameter,
              thickness: data.thickness,
              connectedEquipmentId: data.connectedEquipmentId,
              status: 'not_started',
              completedDate: null,
              notes: data.notes,
              position: pendingJointPosition,
            })
            setPendingJointPosition(null)
          }}
        />
      )}

      {editingJoint && (
        <JointFormModal
          lineLabel={project.lines.find((l) => l.id === editingJoint.lineId)?.svgElementId ?? ''}
          joint={editingJoint}
          equipment3d={project.equipment3d}
          onClose={() => setEditingJoint(null)}
          onSubmit={async (data) => {
            await updateJoint(project.id, editingJoint.id, data)
            setEditingJoint(null)
          }}
          onDelete={async () => {
            await deleteJoint(project.id, editingJoint.id)
            setEditingJoint(null)
          }}
        />
      )}

      {completingJointId && (
        <JointCompleteDateModal
          onClose={() => setCompletingJointId(null)}
          onConfirm={async (date) => {
            await updateJoint(project.id, completingJointId, { status: 'completed', completedDate: date })
            setCompletingJointId(null)
          }}
        />
      )}

      {editingEquipment && (
        <Equipment3DFormModal
          equipment={editingEquipment === 'new' ? undefined : editingEquipment}
          onClose={() => setEditingEquipment(null)}
          onSubmit={async (data) => {
            if (editingEquipment === 'new') {
              await addEquipment3D(project.id, {
                tag: data.tag,
                description: data.description,
                foundationReadyDate: null,
                erectedDate: null,
                meshObjectNames: [],
                notes: data.notes,
              })
            } else {
              await updateEquipment3D(project.id, editingEquipment.id, data)
            }
            setEditingEquipment(null)
          }}
          onDelete={
            editingEquipment !== 'new'
              ? async () => {
                  await deleteEquipment3D(project.id, editingEquipment.id)
                  setEditingEquipment(null)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

/**
 * Concentric-ring donut: innermost ring is the total joint count (a full reference circle), the
 * next ring out is welded (completed) vs not. Two more rings — radiography done, and pass/defective/
 * repeat-film breakdown — are part of the intended design but need new fields on Joint (an NDT/RT
 * stage separate from weld status) that don't exist yet, so they're left off rather than showing
 * fabricated numbers.
 */
function NestedWeldDonut({ total, completed }: { total: number; completed: number }) {
  const size = 88
  const cx = size / 2
  const cy = size / 2
  const strokeWidth = 9
  const gap = 3
  const totalRadius = 15
  const weldedRadius = totalRadius + strokeWidth + gap
  const weldedPercent = total > 0 ? (completed / total) * 100 : 0

  const ring = (radius: number, percent: number, color: string, track: string) => {
    const circumference = 2 * Math.PI * radius
    const filled = (percent / 100) * circumference
    return (
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke={track} strokeWidth={strokeWidth} />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
        />
      </g>
    )
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      {ring(totalRadius, 100, '#38bdf8', 'rgba(56,189,248,0.18)')}
      {ring(weldedRadius, weldedPercent, '#2ecc71', 'rgba(231,76,60,0.3)')}
    </svg>
  )
}

function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-white/10 p-2 text-center">
      <p className="num text-lg font-bold" style={{ color }}>
        {value.toLocaleString('fa-IR')}
      </p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  )
}

function JointRow({
  joint,
  editable,
  onEdit,
  onDelete,
  onToggleStatus,
}: {
  joint: Joint
  editable: boolean
  onEdit: () => void
  onDelete: () => void
  onToggleStatus: () => void
}) {
  const complete = joint.status === 'completed'
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 px-2.5 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: complete ? '#2ecc71' : '#e74c3c' }}
        />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">
            {JOINT_TYPE_LABEL_FA[joint.jointType]} {joint.jointNumber || `#${joint.sequenceNumber}`}
          </p>
          <p className="truncate text-[10px] text-muted">
            {[joint.diameter, joint.thickness].filter(Boolean).join(' — ') || '—'}
            {complete && joint.completedDate ? ` · ${formatJalali(joint.completedDate)}` : ''}
          </p>
        </div>
      </div>
      {editable && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onToggleStatus}
            className={`rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${
              complete ? 'bg-green-500/15 text-green-300 hover:bg-green-500/25' : 'bg-white/5 text-secondary hover:bg-white/10'
            }`}
          >
            {complete ? 'تکمیل شده' : 'تکمیل شد'}
          </button>
          <button onClick={onEdit} className="rounded-lg p-1.5 text-secondary hover:bg-white/10">
            <Pencil size={12} />
          </button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10">
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  )
}

function Equipment3DCard({
  equipment,
  editable,
  onEdit,
  onDelete,
  onSelectMeshes,
  onSetFoundationDate,
  onSetErectedDate,
}: {
  equipment: Equipment3D
  editable: boolean
  onEdit: () => void
  onDelete: () => void
  onSelectMeshes: () => void
  onSetFoundationDate: (v: string) => void
  onSetErectedDate: (v: string) => void
}) {
  const complete = !!equipment.foundationReadyDate && !!equipment.erectedDate
  return (
    <div className="space-y-2 rounded-xl border border-white/10 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-bold">{equipment.tag}</p>
          {equipment.description && <p className="truncate text-[10px] text-muted">{equipment.description}</p>}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: complete ? 'rgba(46,204,113,0.15)' : 'rgba(255,255,255,0.06)', color: complete ? '#2ecc71' : 'var(--text-secondary)' }}
        >
          {complete ? 'تکمیل شده' : 'در حال اجرا'}
        </span>
      </div>

      {editable ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] text-muted">فونداسیون آماده</span>
            <JalaliDateInput value={equipment.foundationReadyDate ?? ''} onChange={onSetFoundationDate} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] text-muted">استقرار انجام شد</span>
            <JalaliDateInput value={equipment.erectedDate ?? ''} onChange={onSetErectedDate} />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted">
          <span>فونداسیون: {equipment.foundationReadyDate ? formatJalali(equipment.foundationReadyDate) : '—'}</span>
          <span>استقرار: {equipment.erectedDate ? formatJalali(equipment.erectedDate) : '—'}</span>
        </div>
      )}

      {editable && (
        <div className="flex items-center justify-between gap-1.5 pt-1">
          <button
            onClick={onSelectMeshes}
            className="flex items-center gap-1 rounded-lg bg-brand-500/10 px-2 py-1 text-[10px] font-medium text-brand-300 hover:bg-brand-500/20"
          >
            <Boxes size={11} /> اجزای مدل ({equipment.meshObjectNames.length.toLocaleString('fa-IR')})
          </button>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="rounded-lg p-1.5 text-secondary hover:bg-white/10">
              <Pencil size={12} />
            </button>
            <button onClick={onDelete} className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
