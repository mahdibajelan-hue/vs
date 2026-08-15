import { useRef } from 'react'
import { CheckCircle2, Loader2, MapPin, Upload } from 'lucide-react'
import { usePdtStore } from '../store/usePdtStore'
import { importRouteFromKml } from '../lib/kmlImport'
import { formatChainage } from '../lib/chainage'
import type * as Cesium from 'cesium'

const KPI_PLACEHOLDERS = [
  'پیشرفت کلی',
  'کل جوینت‌ها',
  'جوش‌شده',
  'NDT پاس‌شده',
  'پوشش‌شده',
  'پایین‌آوری‌شده',
  'خاک‌ریزی‌شده',
  'NCR باز',
]

/**
 * Right-side panel: route import + a live Route Info readout (Phase 3-4 data — real, computed from
 * whatever route is loaded), then the spec's 8 project KPIs as placeholders. The KPI numbers need
 * the Joint model and Progress Engine (phases 6-9, not built yet in this batch) to mean anything —
 * showing zeros here would misleadingly imply "0% done" rather than "not tracked yet", so they're
 * left as "—" instead.
 */
export function KPIPanel({ viewerRef }: { viewerRef: React.RefObject<Cesium.Viewer | null> }) {
  const route = usePdtStore((s) => s.route)
  const importing = usePdtStore((s) => s.importing)
  const importError = usePdtStore((s) => s.importError)
  const setRoute = usePdtStore((s) => s.setRoute)
  const setImporting = usePdtStore((s) => s.setImporting)
  const setImportError = usePdtStore((s) => s.setImportError)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
          {KPI_PLACEHOLDERS.map((label) => (
            <div key={label} className="rounded-lg border border-white/10 p-2 text-center">
              <p className="num text-base font-bold text-muted">—</p>
              <p className="text-[9px] text-muted">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[9px] leading-4 text-muted">
          این شاخص‌ها پس از افزودن مدل جوینت‌ها و موتور محاسبه پیشرفت (مراحل بعدی) نمایش داده می‌شوند.
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
