import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { Loader2 } from 'lucide-react'
import type { Equipment3D, Joint, Point3D, Spool } from '../../types'
import { buildMeshColorMap, DIM_COLOR, DIM_OPACITY, SELECTED_MESH_COLOR } from '../../lib/model3dColoring'

export type ViewerMode = 'view' | 'placeJoint' | 'selectMeshes'

const JOINT_SPRITE_WIDTH = 1.4
const JOINT_COLOR_DONE = '#2ecc71'
const JOINT_COLOR_PENDING = '#e74c3c'
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
    const isSelected = mode === 'selectMeshes' && selectedSet.has(child.name)
    const completeColor = colorMap.get(child.name)
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
 * Draws a small weld-tag icon (weld symbol + joint number) on a canvas, used as a camera-facing
 * sprite. A 3D ring/sphere sitting on the pipe either occluded the spool underneath or had to guess
 * a size that never quite matched the real pipe — a flat always-readable tag sidesteps both: its
 * size is picked for legibility, not for "looking like" the pipe, and depthTest is off so it never
 * gets swallowed by surrounding geometry.
 */
function createJointSprite(joint: Joint): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 110
  const ctx = canvas.getContext('2d')!
  const color = joint.status === 'completed' ? JOINT_COLOR_DONE : JOINT_COLOR_PENDING

  const r = 20
  ctx.fillStyle = 'rgba(15, 18, 24, 0.88)'
  ctx.beginPath()
  ctx.roundRect(3, 3, canvas.width - 6, canvas.height - 6, r)
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = color
  ctx.stroke()

  // Simple weld-bead symbol (zigzag) on the left.
  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(22, 55)
  ctx.lineTo(38, 30)
  ctx.lineTo(54, 80)
  ctx.lineTo(70, 30)
  ctx.lineTo(86, 55)
  ctx.stroke()

  const label = joint.jointNumber || `#${joint.sequenceNumber}`
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 46px Vazirmatn, Arial, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, 108, 55, canvas.width - 118)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true })
  const sprite = new THREE.Sprite(material)
  sprite.renderOrder = 999
  const aspect = canvas.width / canvas.height
  sprite.scale.set(JOINT_SPRITE_WIDTH, JOINT_SPRITE_WIDTH / aspect, 1)
  sprite.name = `__joint_marker_${joint.id}`
  return sprite
}

/** Camera-facing weld-tag sprites at each placed joint's position — red while pending, green once completed. */
function rebuildJointMarkers(group: THREE.Group, joints: Joint[]) {
  disposeGroupChildren(group)
  for (const joint of joints) {
    if (!joint.position) continue
    const sprite = createJointSprite(joint)
    sprite.position.set(joint.position.x, joint.position.y, joint.position.z)
    group.add(sprite)
  }
}

interface ThreeViewerProps {
  url: string
  joints?: Joint[]
  equipment3d?: Equipment3D[]
  spools?: Spool[]
  /** 'placeJoint' reports the clicked point on the model via onPointPicked; 'selectMeshes' toggles the clicked mesh's name in/out of selectedMeshNames. */
  mode?: ViewerMode
  selectedMeshNames?: string[]
  onPointPicked?: (point: Point3D) => void
  onMeshToggle?: (meshName: string) => void
}

/**
 * Loads an FBX model (typically exported from Navisworks Manage) and renders it with orbit/pan/
 * zoom controls. Progress coloring is entirely driven by the joint-centric model (see
 * src/lib/model3dColoring.ts) — nothing is auto-matched by object name: a spool's linked meshes
 * light up only once both its bounding joints are completed, equipment's linked meshes light up
 * once both its install milestones are set, and every joint gets a small camera-facing weld-tag
 * label (symbol + joint number) at its clicked position.
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
}: ThreeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modelReady, setModelReady] = useState(false)

  const objectRef = useRef<THREE.Object3D | null>(null)
  const markersGroupRef = useRef<THREE.Group | null>(null)

  // Kept fresh via this cheap effect so the click handler (bound once per model load) always sees
  // the latest mode/callbacks without needing to re-bind — editing props never triggers a reload.
  const liveRef = useRef({ mode, onPointPicked, onMeshToggle })
  useEffect(() => {
    liveRef.current = { mode, onPointPicked, onMeshToggle }
  }, [mode, onPointPicked, onMeshToggle])

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

    let frameId = 0
    let disposed = false
    const animate = () => {
      if (disposed) return
      controls.update()
      renderer.render(scene, camera)
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

      const { mode: liveMode, onPointPicked: livePicked, onMeshToggle: liveToggle } = liveRef.current
      if (liveMode === 'view') return
      const object = objectRef.current
      if (!object) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
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

        prepareMaterialsForColoring(object)
        scene.add(object)
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
    // joints/equipment3d/spools/mode/selectedMeshNames/callbacks intentionally excluded: this
    // effect only (re)loads the model itself on url change — see the coloring effect below for
    // how progress edits get reflected without a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Recolors meshes and rebuilds joint markers whenever the underlying progress data, the
  // interaction mode, or the in-progress mesh selection changes — independent of the (expensive)
  // model-load effect above, so editing joints/spools/equipment never triggers a reload.
  useEffect(() => {
    if (!modelReady || !objectRef.current || !markersGroupRef.current) return
    const colorMap = buildMeshColorMap(spools, equipment3d, joints)
    applyMeshColoring(objectRef.current, colorMap, mode, selectedMeshNames)
    rebuildJointMarkers(markersGroupRef.current, joints)
  }, [modelReady, joints, equipment3d, spools, mode, selectedMeshNames])

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden rounded-2xl ${mode !== 'view' ? 'cursor-crosshair' : ''}`}>
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Loader2 size={26} className="animate-spin text-brand-400" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-6 text-center text-sm text-red-300">{error}</div>
      )}
    </div>
  )
}
