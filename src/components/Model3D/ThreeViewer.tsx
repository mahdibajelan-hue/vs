import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { Loader2 } from 'lucide-react'

/** Loads an FBX model (typically exported from Navisworks Manage) from a URL and renders it with orbit/pan/zoom controls. */
export function ThreeViewer({ url }: { url: string }) {
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
