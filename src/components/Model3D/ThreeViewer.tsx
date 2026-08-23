import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { Loader2 } from 'lucide-react'
import type { Equipment3D, Joint, Point3D, Spool } from '../../types'
import { buildMeshColorMap, DIM_COLOR, DIM_OPACITY, isMeshSelected, meshColor, SELECTED_MESH_COLOR } from '../../lib/model3dColoring'
import { splitMergedMeshes, type SplitStats } from '../../lib/model3dSplit'
import { cutMeshesAtJoints, type JointCutStats } from '../../lib/model3dJointCut'

export type ViewerMode = 'view' | 'placeJoint' | 'selectMeshes'

// Small on-pipe dot, not a floating label — a label big enough to read text always ended up
// dwarfing the pipe it marked. Full details now live in the click-to-open side panel instead.
// Sized in screen pixels (see resizeJointMarkers), not world units: the station is normally
// viewed zoomed all the way out to fit the whole model, where any fixed world-space size already
// dwarfs the actual pipes/welds at that distance — a constant on-screen pixel size stays exactly
// as small whether you're looking at the whole station or zoomed into one weld.
const JOINT_MARKER_PX = 12
const JOINT_MARKER_PX_SELECTED = 18
const JOINT_COLOR_DONE = '#2ecc71'
const JOINT_COLOR_PENDING = '#e74c3c'
const JOINT_MARKER_PREFIX = '__joint_marker_'
// A click that moves the pointer more than this (css px) between down and up is an orbit/pan drag,
// not a selection tap — without this guard, dragging the camera while in 'selectMeshes' mode kept
// toggling whatever mesh happened to be under the cursor at release, silently adding wrong items.
const CLICK_DRAG_THRESHOLD_PX = 6

type ColorableMaterial = THREE.Material & { color?: THREE.Color; opacity: number; transparent: boolean }

function forEachMaterial(child: THREE.Mesh, fn: (m: ColorableMaterial) => void) {
  const materials = Array.isArray(child.material) ? child.material : [child.material]
  materials.forEach((m) => fn(m as ColorableMaterial))
}

/** Clones every mesh's material once at load time so later recoloring only ever mutates our own clones. */
function prepareMaterialsForColoring(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const cloned = materials.map((m) => m.clone())
    child.material = Array.isArray(child.material) ? cloned : cloned[0]
  })
}

function applyMeshColoring(root: THREE.Object3D, colorMap: Map<string, string>, mode: ViewerMode, selectedMeshNames: string[]) {
  const selectedSet = new Set(selectedMeshNames)
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const isSelected = mode === 'selectMeshes' && isMeshSelected(selectedSet, child.name)
    const completeColor = meshColor(colorMap, child.name)
    forEachMaterial(child, (mat) => {
      if (!mat.color) return
      if (isSelected) {
        mat.color.set(SELECTED_MESH_COLOR)
        mat.opacity = 1
        mat.transparent = false
      } else if (completeColor) {
        mat.color.set(completeColor)
        mat.opacity = 1
        mat.transparent = false
      } else {
        mat.color.set(DIM_COLOR)
        mat.opacity = DIM_OPACITY
        mat.transparent = true
      }
    })
  })
}

function disposeGroupChildren(group: THREE.Group) {
  for (const child of group.children) {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((m) => m.dispose())
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose()
      child.material.dispose()
    }
  }
  group.clear()
}

/**
 * Draws a small dot marker on a canvas, used as a camera-facing sprite — no text, no ring geometry
 * to size against the pipe. It's just a "there's a joint here" indicator; clicking it is how you
 * see the actual weld number/status/etc. (see the side panel in Model3DPage), so the marker itself
 * only needs to be small and legible from any angle.
 */
function createJointMarkerSprite(joint: Joint, selected: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const color = joint.status === 'completed' ? JOINT_COLOR_DONE : JOINT_COLOR_PENDING
  const cx = 32
  const cy = 32

  ctx.beginPath()
  ctx.arc(cx, cy, 26, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.globalAlpha = 0.22
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.lineWidth = selected ? 7 : 4
  ctx.strokeStyle = selected ? '#ffffff' : color
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, 9, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 999
  // Real scale is set every frame in the animate loop (resizeJointMarkers) to keep a constant
  // pixel size regardless of zoom — this is just a harmless non-zero default before the first frame.
  sprite.scale.set(1, 1, 1)
  sprite.name = `${JOINT_MARKER_PREFIX}${joint.id}`
  return sprite
}

/** Rescales every marker sprite so it covers a constant number of screen pixels regardless of camera distance/zoom — otherwise a fixed world-space size looks tiny zoomed in and huge zoomed out (or vice versa). */
function resizeJointMarkers(group: THREE.Group, camera: THREE.PerspectiveCamera, viewportHeightPx: number, selectedJointId: string | null) {
  const worldPerPixel = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewportHeightPx
  for (const child of group.children) {
    if (!(child instanceof THREE.Sprite)) continue
    const distance = camera.position.distanceTo(child.position)
    const isSelected = selectedJointId !== null && child.name === `${JOINT_MARKER_PREFIX}${selectedJointId}`
    const targetPx = isSelected ? JOINT_MARKER_PX_SELECTED : JOINT_MARKER_PX
    const worldSize = worldPerPixel * distance * targetPx
    child.scale.set(worldSize, worldSize, 1)
  }
}

/** Small camera-facing dot markers at each placed joint's position — red while pending, green once completed, highlighted white ring when selected. */
function rebuildJointMarkers(group: THREE.Group, joints: Joint[], selectedJointId: string | null) {
  disposeGroupChildren(group)
  for (const joint of joints) {
    if (!joint.position) continue
    const sprite = createJointMarkerSprite(joint, joint.id === selectedJointId)
    sprite.position.set(joint.position.x, joint.position.y, joint.position.z)
    group.add(sprite)
  }
}

interface ThreeViewerProps {
  url: string
  joints?: Joint[]
  equipment3d?: Equipment3D[]
  spools?: Spool[]
  /** 'placeJoint' reports the clicked point on the model via onPointPicked; 'selectMeshes' toggles the clicked mesh's name in/out of selectedMeshNames. In 'view' mode, clicking a joint marker reports its id via onJointClick instead (and clicking empty space reports null, to close a detail panel). */
  mode?: ViewerMode
  selectedMeshNames?: string[]
  onPointPicked?: (point: Point3D) => void
  onMeshToggle?: (meshName: string) => void
  onJointClick?: (jointId: string | null) => void
  /** id of the joint whose detail panel is open — its marker is highlighted, and its live screen position is reported every frame via onJointScreenPosition so the caller can anchor a panel to it. */
  selectedJointId?: string | null
  onJointScreenPosition?: (pos: { x: number; y: number } | null) => void
  /** Reports how the loaded model was broken into selectable parts — surfaced in the UI so a model
   * whose solids stayed fused is visible rather than just feeling broken. */
  onSplitStats?: (stats: SplitStats) => void
  /** Reports how many spool spans the weld-based cut recovered from fused runs. */
  onJointCutStats?: (stats: JointCutStats) => void
}

/**
 * Loads an FBX model (typically exported from Navisworks Manage) and renders it with orbit/pan/
 * zoom controls. Progress coloring is entirely driven by the joint-centric model (see
 * src/lib/model3dColoring.ts) — nothing is auto-matched by object name: a spool's linked meshes
 * light up only once both its bounding joints are completed, equipment's linked meshes light up
 * once both its install milestones are set, and every joint gets a small camera-facing dot marker
 * at its clicked position — clicking a marker in 'view' mode reports its id via onJointClick so the
 * caller can show a detail panel (see Model3DPage), rather than cluttering the model with text.
 */
export function ThreeViewer({
  url,
  joints = [],
  equipment3d = [],
  spools = [],
  mode = 'view',
  selectedMeshNames = [],
  onPointPicked,
  onMeshToggle,
  onJointClick,
  selectedJointId = null,
  onJointScreenPosition,
  onSplitStats,
  onJointCutStats,
}: ThreeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modelReady, setModelReady] = useState(false)

  const objectRef = useRef<THREE.Object3D | null>(null)
  const markersGroupRef = useRef<THREE.Group | null>(null)

  // Kept fresh via this cheap effect so the click handler and animate loop (bound once per model
  // load) always see the latest mode/callbacks/selection without needing to re-bind — editing
  // props never triggers a reload.
  const liveRef = useRef({ mode, onPointPicked, onMeshToggle, onJointClick, selectedJointId, onJointScreenPosition, onSplitStats, onJointCutStats, joints })
  useEffect(() => {
    liveRef.current = { mode, onPointPicked, onMeshToggle, onJointClick, selectedJointId, onJointScreenPosition, onSplitStats, onJointCutStats, joints }
  }, [mode, onPointPicked, onMeshToggle, onJointClick, selectedJointId, onJointScreenPosition, onSplitStats, onJointCutStats, joints])

  /**
   * Which welds define the cut. The model is reloaded when this changes, because cutting is
   * destructive — re-deriving the parts from a fresh load is honest, where incremental surgery on
   * already-cut geometry would drift. Only placed joints matter; editing a joint's metadata does
   * not move a cut line and so must not trigger a reload.
   */
  const jointCutKey = joints
    .filter((j) => j.position)
    .map((j) => `${j.lineId}:${j.sequenceNumber}:${j.position!.x},${j.position!.y},${j.position!.z}`)
    .sort()
    .join('|')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    setLoading(true)
    setError('')
    setModelReady(false)
    objectRef.current = null

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x11151c)

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100000)
    camera.position.set(10, 10, 10)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1)
    dirLight.position.set(50, 80, 50)
    scene.add(dirLight)
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
    dirLight2.position.set(-50, -30, -50)
    scene.add(dirLight2)
    scene.add(new THREE.GridHelper(200, 40, 0x334155, 0x1e293b))

    const markersGroup = new THREE.Group()
    scene.add(markersGroup)
    markersGroupRef.current = markersGroup

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    // Panning moves the target by the exact on-screen drag distance instead of sliding along the
    // ground plane — with the ground plane a drag near the horizon barely moves anything while a
    // drag over it flies past the cursor, which is what "locks" panning felt like.
    controls.screenSpacePanning = true
    controls.panSpeed = 1.4
    controls.rotateSpeed = 0.9
    controls.zoomSpeed = 1.1
    // The model is always normalized to a ~20-unit bounding box (see the loader below), so a fixed
    // range is safe: it stops the camera dollying through the model (near-zero distance degenerates
    // the controls) or drifting out to a distance where scroll-to-zoom stops visibly doing anything.
    controls.minDistance = 1
    controls.maxDistance = 400
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }

    // Right-drag is the pan gesture, but without this the browser's own context menu opens on
    // release and eats the next click — which reads exactly like "panning doesn't work, it just
    // rotates." Shift+left-drag is added as a second, keyboard-only way to pan for anyone on a
    // trackpad or a monitor where a clean right-click-drag is awkward.
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    renderer.domElement.addEventListener('contextmenu', handleContextMenu)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    let frameId = 0
    let disposed = false
    const animate = () => {
      if (disposed) return
      controls.update()

      const { selectedJointId: liveSelectedJointId, onJointScreenPosition: liveOnJointScreenPosition } = liveRef.current
      if (markersGroupRef.current) resizeJointMarkers(markersGroupRef.current, camera, container.clientHeight, liveSelectedJointId)

      renderer.render(scene, camera)

      if (liveOnJointScreenPosition) {
        const marker = liveSelectedJointId
          ? markersGroupRef.current?.children.find((c) => c.name === `${JOINT_MARKER_PREFIX}${liveSelectedJointId}`)
          : undefined
        if (marker) {
          const projected = marker.position.clone().project(camera)
          liveOnJointScreenPosition({
            x: (projected.x * 0.5 + 0.5) * container.clientWidth,
            y: (-projected.y * 0.5 + 0.5) * container.clientHeight,
          })
        } else {
          liveOnJointScreenPosition(null)
        }
      }

      frameId = requestAnimationFrame(animate)
    }

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let pointerDownAt: { x: number; y: number } | null = null
    const handlePointerDown = (event: PointerEvent) => {
      pointerDownAt = { x: event.clientX, y: event.clientY }
    }
    const handlePointerUp = (event: PointerEvent) => {
      const downAt = pointerDownAt
      pointerDownAt = null
      if (!downAt) return
      // A drag (orbiting/panning the camera) should never register as a selection tap.
      if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > CLICK_DRAG_THRESHOLD_PX) return

      const { mode: liveMode, onPointPicked: livePicked, onMeshToggle: liveToggle, onJointClick: liveJointClick } = liveRef.current
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)

      if (liveMode === 'view') {
        const markers = markersGroupRef.current
        const markerHit = markers ? raycaster.intersectObjects(markers.children, false)[0] : undefined
        if (markerHit && markerHit.object.name.startsWith(JOINT_MARKER_PREFIX)) {
          liveJointClick?.(markerHit.object.name.slice(JOINT_MARKER_PREFIX.length))
        } else {
          liveJointClick?.(null)
        }
        return
      }

      const object = objectRef.current
      if (!object) return
      const hit = raycaster.intersectObject(object, true).find((h) => h.object instanceof THREE.Mesh)
      if (!hit) return
      if (liveMode === 'placeJoint') {
        livePicked?.({ x: hit.point.x, y: hit.point.y, z: hit.point.z })
      } else if (liveMode === 'selectMeshes') {
        liveToggle?.(hit.object.name)
      }
    }
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)

    const loader = new FBXLoader()
    loader.load(
      url,
      (object) => {
        if (disposed) return
        // Center and scale the model to fit a consistent view — Navisworks/CAD exports carry
        // arbitrary real-world coordinates and units, so without this the camera's default
        // distance would show either a speck or nothing at all. This same normalization runs
        // identically on every load of the same file, so joint positions captured via raycasting
        // stay put across reloads.
        const box = new THREE.Box3().setFromObject(object)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const scale = 20 / maxDim
        object.scale.setScalar(scale)
        object.position.sub(center.multiplyScalar(scale))

        // Split BEFORE cloning materials: CAD exporters merge a whole pipe run into one mesh, and
        // until it is broken into its individual solids a click can only ever select the entire
        // run. Each component then needs its own material clone to be coloured independently.
        const stats = splitMergedMeshes(object)

        // Second pass, for runs the first cannot touch: a pipe authored as one continuous welded
        // surface has no internal boundary to find, so it is divided at the welds the user has
        // already placed instead. Runs before materials are cloned, like the split above, so every
        // resulting part colours independently.
        scene.add(object)
        const jointStats = cutMeshesAtJoints(object, liveRef.current.joints)
        if (jointStats.partsCreated > 0) {
          stats.meshesAfter += jointStats.partsCreated - jointStats.meshesCut
          stats.meshNames = []
          object.traverse((child) => {
            if (child instanceof THREE.Mesh) stats.meshNames.push(child.name)
          })
        }
        liveRef.current.onSplitStats?.(stats)
        liveRef.current.onJointCutStats?.(jointStats)

        prepareMaterialsForColoring(object)
        objectRef.current = object

        const fitDistance = 24
        camera.position.set(fitDistance, fitDistance * 0.8, fitDistance)
        camera.lookAt(0, 0, 0)
        controls.target.set(0, 0, 0)
        controls.update()

        setLoading(false)
        setModelReady(true)
        animate()
      },
      undefined,
      () => {
        if (disposed) return
        setError('بارگذاری مدل سه‌بعدی ناموفق بود — فایل معتبر FBX نیست یا مشکل شبکه رخ داده است.')
        setLoading(false)
      },
    )

    const resizeObserver = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('contextmenu', handleContextMenu)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      controls.dispose()
      renderer.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose()
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
          materials.forEach((m) => m?.dispose())
        }
      })
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement)
      objectRef.current = null
      markersGroupRef.current = null
    }
    // equipment3d/spools/mode/selectedMeshNames/callbacks intentionally excluded: this effect
    // only (re)loads the model itself — see the coloring effect below for how progress edits get
    // reflected without a reload. jointCutKey IS a dependency because the weld cut is baked into
    // the geometry at load, so moving or adding a weld has to rebuild the parts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, jointCutKey])

  // Recolors meshes and rebuilds joint markers whenever the underlying progress data, the
  // interaction mode, or the in-progress mesh selection changes — independent of the (expensive)
  // model-load effect above, so editing joints/spools/equipment never triggers a reload.
  useEffect(() => {
    if (!modelReady || !objectRef.current || !markersGroupRef.current) return
    const colorMap = buildMeshColorMap(spools, equipment3d, joints)
    applyMeshColoring(objectRef.current, colorMap, mode, selectedMeshNames)
    rebuildJointMarkers(markersGroupRef.current, joints, selectedJointId)
  }, [modelReady, joints, equipment3d, spools, mode, selectedMeshNames, selectedJointId])

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden rounded-2xl ${mode !== 'view' ? 'cursor-crosshair' : ''}`}
      // Without this, a touchscreen hands one/two-finger drags to the browser's own page-zoom and
      // scroll before OrbitControls sees them, which is exactly what "only rotates, won't pan"
      // looks like on touch: rotation still works (it doesn't scroll the page), panning doesn't.
      style={{ touchAction: 'none' }}
    >
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 size={26} className="animate-spin text-brand-400" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6 text-center text-sm text-red-300">{error}</div>
      )}
      {modelReady && !error && (
        <div
          className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-2.5 py-1.5 text-[10px] leading-relaxed text-white/70 backdrop-blur-sm"
          dir="rtl"
        >
          چرخش: کلیک چپ و بکشید · جابه‌جایی خطی: کلیک راست (یا Shift+کلیک چپ) و بکشید · زوم: چرخ ماوس
        </div>
      )}
    </div>
  )
}
