import { AlertTriangle, X } from 'lucide-react'
import { useSystemStore } from '../../store/useSystemStore'

export function StorageErrorBanner() {
  const storageError = useSystemStore((s) => s.storageError)
  const setStorageError = useSystemStore((s) => s.setStorageError)

  if (!storageError) return null

  return (
    <div className="no-print flex items-start gap-2.5 border-b border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-200">
      <AlertTriangle size={15} className="shrink-0 mt-0.5" />
      <p className="flex-1 leading-6">{storageError}</p>
      <button onClick={() => setStorageError(null)} className="shrink-0 rounded p-1 text-red-300 hover:bg-red-500/20 transition-colors">
        <X size={14} />
      </button>
    </div>
  )
}
