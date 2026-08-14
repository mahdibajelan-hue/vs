import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { Loader2 } from 'lucide-react'
import { ACTIVITY_COLOR, type DailyLog, type IsoLine } from '../../types'
import { furthestCompletedActivity } from '../../lib/progress'
import { matchLineByObjectName } from '../../lib/model3dMatch'

const DIM_COLOR = 0x4b5563
const DIM_OPACITY = 0.22

/** Recolors every mesh in the loaded object: matched-and-worked-on parts get their furthest completed activity's color at full opacity, everything else (unmatched, or matched but not started) fades to a dim neutral gray. */
function applyProgressColoring(root: THREE.Object3D, lines: IsoLine[], logs: DailyLog[]): { matched: number; total: number } {
  let matched = 0
  let total = 0
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    total++
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const cloned = materials.map((m) => m.clone())
    child.material = Array.isArray(child.material) ? cloned : cloned[0]

    const line = matchLineByObjectName(child.name, lines)
    const activity = line ? furthestCompletedActivity(line.id, logs) : null
    if (line && activity) matched++

    for (const mat of cloned) {
      const colorable = mat as THREE.Material & { color?: THREE.Color; opacity: number; transparent: boolean }
      if (!colorable.color) continue
      if (activity) {
        colorable.color.set(ACTIVITY_COLOR[activity])
        colorable.opacity = 1
        colorable.transparent = false
      } else {
        colorable.color.set(DIM_COLOR)
        colorable.opacity = DIM_OPACITY
        colorable.transparent = true
      }
    }
  })
  return { matched, total }
}

/**
 * Loads an FBX model (typically exported from Navisworks Manage) and renders it with orbit/pan/
 * zoom controls. When `lines`/`logs` are given, every mesh is auto-linked to a PipePulse line by
 * name and colored by the furthest work stage reached on it (see applyProgressColoring) — parts
 * with no matched, started work stay dim.
 */
export function ThreeViewer({ url, lines = [], logs = [], onMatchStats }: { url: string; lines?: IsoLine[]; logs?: DailyLog[]; onMatchStats?: (stats: { matched: number; total: number }) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    setLoading(true)
    setError('')

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

    const loader = new FBXLoader()
    loader.load(
      url,
      (object) => {
        if (disposed) return
        // Center and scale the model to fit a consistent view — Navisworks/CAD exports carry
        // arbitrary real-world coordinates and units, so without this the camera's default
        // distance would show either a speck or nothing at all.
        const box = new THREE.Box3().setFromObject(object)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const scale = 20 / maxDim
        object.scale.setScalar(scale)
        object.position.sub(center.multiplyScalar(scale))

        if (lines.length > 0) {
          const stats = applyProgressColoring(object, lines, logs)
          onMatchStats?.(stats)
        }

        scene.add(object)

        const fitDistance = 24
        camera.position.set(fitDistance, fitDistance * 0.8, fitDistance)
        camera.lookAt(0, 0, 0)
        controls.target.set(0, 0, 0)
        controls.update()

        setLoading(false)
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
    }
    // lines/logs/onMatchStats intentionally excluded: re-coloring happens by re-running this whole
    // effect only when the model url changes, not on every progress edit elsewhere in the app —
    // reopen the tab (or re-select the project) to see freshly logged progress reflected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden rounded-2xl">
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
