import { useEffect, useRef, useState } from 'react'
import { Box, Loader2, RefreshCcw, Trash2, Upload } from 'lucide-react'
import type { Project } from '../types'
import { ACTIVITY_KINDS, ACTIVITY_COLOR, ACTIVITY_LABEL_FA } from '../types'
import { useStore } from '../store/useStore'
import { useCurrentRole } from '../store/useMembersStore'
import { useAuthStore } from '../store/useAuthStore'
import { canEdit } from '../lib/permissions'
import { getProjectModel3dSignedUrl } from '../lib/model3dStorage'
import { ThreeViewer } from '../components/Model3D/ThreeViewer'

/**
 * 3D model viewer (spec: bring a Navisworks-exported model into PipePulse). Only FBX is
 * supported client-side — Navisworks Manage's other export options (NWD/NWF, DWFX/3D DWF, KML)
 * are either a closed Autodesk format with no in-browser parser, or not real 3D geometry formats.
 * FBX is on Navisworks's own export list and three.js has a built-in loader for it.
 */
export function Model3DPage({ project }: { project: Project }) {
  const setProjectModel3d = useStore((s) => s.setProjectModel3d)
  const clearProjectModel3d = useStore((s) => s.clearProjectModel3d)
  const role = useCurrentRole()
  const isAdmin = useAuthStore((s) => s.profile?.isAdmin ?? false)
  const editable = canEdit(role, isAdmin)

  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [matchStats, setMatchStats] = useState<{ matched: number; total: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        {editable && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

      {signedUrl && (
        <div className="glass-panel flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl px-4 py-2.5 text-[11px]">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#4b5563', opacity: 0.6 }} />
            شروع‌نشده / بدون تطبیق
          </span>
          {ACTIVITY_KINDS.map((activity) => (
            <span key={activity} className="flex items-center gap-1.5 text-secondary">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ACTIVITY_COLOR[activity] }} />
              {ACTIVITY_LABEL_FA[activity]}
            </span>
          ))}
          {matchStats && (
            <span className="mr-auto text-muted">
              {matchStats.matched.toLocaleString('fa-IR')} از {matchStats.total.toLocaleString('fa-IR')} جزء مدل به خطوط لوله تطبیق داده شد
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
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
          <ThreeViewer url={signedUrl} lines={project.lines} logs={project.logs} onMatchStats={setMatchStats} />
        )}
      </div>
    </div>
  )
}
