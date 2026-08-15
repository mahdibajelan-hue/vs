import { useRef } from 'react'
import { CheckCircle2, Loader2, MapPin, Upload } from 'lucide-react'
import type { Joint } from '../types'
import { usePdtStore } from '../store/usePdtStore'
import { importRouteFromKml } from '../lib/kmlImport'
import { formatChainage } from '../lib/chainage'
import { computeProjectProgress } from '../lib/progressEngine'
import { DEFAULT_STOCK_LENGTH_M } from '../lib/jointGeneration'
import type * as Cesium from 'cesium'

/**
 * Right-side panel: route import + a live Route Info readout, then the spec's project KPIs —
 * computed for real from `joints` (Phase 9's progress engine) now that joints exist. `joints` is
 * the caller's possibly-scrubbed set (see DashboardPage), so these numbers stay in sync with
 * whatever moment the Timeline is showing.
 */
export function KPIPanel({ viewerRef, joints }: { viewerRef: React.RefObject<Cesium.Viewer | null>; joints: Joint[] }) {
  const route = usePdtStore((s) => s.route)
  const importing = usePdtStore((s) => s.importing)
  const importError = usePdtStore((s) => s.importError)
  const setRoute = usePdtStore((s) => s.setRoute)
  const setImporting = usePdtStore((s) => s.setImporting)
  const setImportError = usePdtStore((s) => s.setImportError)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const progress = computeProjectProgress(joints)

  const handleFile = async (file: File) => {
    if (!viewerRef.current) return
    setImporting(true)
    const result = await importRouteFromKml(file, viewerRef.current)
    setImporting(false)
    if (result.error || !result.route) {
      setImportError(result.error ?? 'خطای نامشخص در پردازش فایل')
      return
    }
    setRoute(result.route)
  }

  const kpis: { label: string; value: string }[] = [
    { label: 'پیشرفت کلی', value: `٪${progress.overallProgressPercent.toLocaleString('fa-IR')}` },
    { label: 'کل جوینت‌ها', value: progress.totalJoints.toLocaleString('fa-IR') },
    { label: 'جوش‌شده', value: progress.weldedCount.toLocaleString('fa-IR') },
    { label: 'NDT پاس‌شده', value: progress.ndtPassedCount.toLocaleString('fa-IR') },
    { label: 'پوشش‌شده', value: progress.coatedCount.toLocaleString('fa-IR') },
    { label: 'پایین‌آوری‌شده', value: progress.loweredCount.toLocaleString('fa-IR') },
    { label: 'خاک‌ریزی‌شده', value: progress.backfilledCount.toLocaleString('fa-IR') },
    { label: 'NCR باز', value: progress.ncrOpenCount.toLocaleString('fa-IR') },
  ]

  return (
    <div className="glass-panel flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl p-4">
      <div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-xs font-medium text-white hover:bg-brand-400 disabled:opacity-50 transition-colors"
        >
          {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {importing ? 'در حال پردازش...' : 'وارد کردن مسیر (KMZ/KML)'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".kml,.kmz"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
        {importError && <p className="mt-2 text-[11px] text-red-300">{importError}</p>}
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-secondary">
          <MapPin size={12} /> اطلاعات مسیر
          {route.source !== 'demo' && <CheckCircle2 size={12} className="text-green-400" />}
        </p>
        <div className="space-y-1.5 rounded-xl border border-white/10 p-2.5 text-[11px]">
          <Row label="منبع" value={route.source === 'demo' ? 'داده نمونه' : `${route.fileName} (${route.source.toUpperCase()})`} />
          <Row label="طول مسیر" value={`${(route.lengthMeters / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} km`} num />
          <Row label="شروع" value="KP 0+000" num />
          <Row label="پایان" value={formatChainage(route.lengthMeters)} num />
          <Row label="تعداد مختصات" value={route.points.length.toLocaleString('fa-IR')} num />
          <Row label="داده ارتفاع" value={route.hasElevationData ? 'موجود' : 'ناموجود'} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold text-secondary">شاخص‌های پروژه</p>
        <div className="grid grid-cols-2 gap-1.5">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-white/10 p-2 text-center">
              <p className="num text-base font-bold">{k.value}</p>
              <p className="text-[9px] text-muted">{k.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[9px] leading-4 text-muted">
          محاسبه‌شده از وضعیت واقعی {progress.totalJoints.toLocaleString('fa-IR')} سرجوش تولیدشده روی مسیر (هر {DEFAULT_STOCK_LENGTH_M.toLocaleString('fa-IR')} متر یک سرجوش).
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, num }: { label: string; value: string; num?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={num ? 'num font-medium' : 'font-medium'}>{value}</span>
    </div>
  )
}
