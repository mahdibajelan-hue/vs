import { useMemo, useRef } from 'react'
import { AlertTriangle, ArrowDownToLine, CheckCircle2, Flame, Gauge, Layers, Loader2, MapPin, PaintBucket, ScanLine, Upload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Joint } from '../types'
import { usePdtStore } from '../store/usePdtStore'
import { importRouteFromKml } from '../lib/kmlImport'
import { formatChainage } from '../lib/chainage'
import { computeProjectProgress, deriveFinalStatus } from '../lib/progressEngine'
import { jointStageStateAsOf } from '../lib/jointHistory'
import { DEFAULT_STOCK_LENGTH_M } from '../lib/jointGeneration'
import type * as Cesium from 'cesium'

const WEEK_MS = 7 * 24 * 3600 * 1000

/**
 * Right-side panel: route import + a live Route Info readout, then the spec's project KPIs —
 * computed for real from `joints` (Phase 9's progress engine) now that joints exist. `joints` is
 * the caller's possibly-scrubbed set (see DashboardPage), so the headline numbers stay in sync with
 * whatever moment the Timeline is showing. The small "vs last week" badges always compare the
 * *live* project state to itself 7 days ago (via each joint's own history log), independent of
 * scrubbing, so they describe genuine real-world trend rather than a scrub-relative one.
 */
export function KPIPanel({ viewerRef, joints }: { viewerRef: React.RefObject<Cesium.Viewer | null>; joints: Joint[] }) {
  const route = usePdtStore((s) => s.route)
  const liveJoints = usePdtStore((s) => s.joints)
  const importing = usePdtStore((s) => s.importing)
  const importError = usePdtStore((s) => s.importError)
  const setRoute = usePdtStore((s) => s.setRoute)
  const setImporting = usePdtStore((s) => s.setImporting)
  const setImportError = usePdtStore((s) => s.setImportError)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const progress = computeProjectProgress(joints)

  const weekAgoProgress = useMemo(() => {
    const weekAgoIso = new Date(Date.now() - WEEK_MS).toISOString()
    const reconstructed = liveJoints.map((j) => {
      const stage = jointStageStateAsOf(j, weekAgoIso)
      return { ...j, ...stage, finalStatus: deriveFinalStatus(stage) }
    })
    return computeProjectProgress(reconstructed)
  }, [liveJoints])

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

  const total = Math.max(1, progress.totalJoints)
  const cards: { label: string; value: string; icon: LucideIcon; accent: string; percent: number; delta?: { text: string; good: boolean } }[] = [
    {
      label: 'پیشرفت کلی',
      value: `٪${progress.overallProgressPercent.toLocaleString('fa-IR')}`,
      icon: Gauge,
      accent: '#38bdf8',
      percent: progress.overallProgressPercent,
      delta: deltaBadge(progress.overallProgressPercent - weekAgoProgress.overallProgressPercent, '٪', true),
    },
    { label: 'کل جوینت‌ها', value: progress.totalJoints.toLocaleString('fa-IR'), icon: Layers, accent: '#a78bfa', percent: 100 },
    { label: 'جوش‌شده', value: progress.weldedCount.toLocaleString('fa-IR'), icon: Flame, accent: '#f59e0b', percent: (progress.weldedCount / total) * 100 },
    { label: 'NDT پاس‌شده', value: progress.ndtPassedCount.toLocaleString('fa-IR'), icon: ScanLine, accent: '#2dd4bf', percent: (progress.ndtPassedCount / total) * 100 },
    { label: 'پوشش‌شده', value: progress.coatedCount.toLocaleString('fa-IR'), icon: PaintBucket, accent: '#eab308', percent: (progress.coatedCount / total) * 100 },
    { label: 'پایین‌آوری‌شده', value: progress.loweredCount.toLocaleString('fa-IR'), icon: ArrowDownToLine, accent: '#818cf8', percent: (progress.loweredCount / total) * 100 },
    { label: 'خاک‌ریزی‌شده', value: progress.backfilledCount.toLocaleString('fa-IR'), icon: Layers, accent: '#2ecc71', percent: (progress.backfilledCount / total) * 100 },
    {
      label: 'NCR باز',
      value: progress.ncrOpenCount.toLocaleString('fa-IR'),
      icon: AlertTriangle,
      accent: '#e74c3c',
      percent: (progress.ncrOpenCount / total) * 100,
      delta: deltaBadge(progress.ncrOpenCount - weekAgoProgress.ncrOpenCount, '', false),
    },
  ]

  return (
    <div className="glass-panel flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl p-3.5">
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

      <details className="rounded-xl border border-white/10 px-2.5 py-2 text-[11px]">
        <summary className="flex cursor-pointer items-center gap-1.5 font-bold text-secondary">
          <MapPin size={12} /> اطلاعات مسیر
          {route.source !== 'demo' && <CheckCircle2 size={12} className="text-green-400" />}
        </summary>
        <div className="mt-2 space-y-1.5">
          <Row label="منبع" value={route.source === 'demo' ? 'داده نمونه' : `${route.fileName} (${route.source.toUpperCase()})`} />
          <Row label="طول مسیر" value={`${(route.lengthMeters / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 2 })} km`} num />
          <Row label="شروع" value="KP 0+000" num />
          <Row label="پایان" value={formatChainage(route.lengthMeters)} num />
          <Row label="داده ارتفاع" value={route.hasElevationData ? 'موجود' : 'ناموجود'} />
        </div>
      </details>

      <div className="space-y-1.5">
        <p className="px-0.5 text-[11px] font-bold text-secondary">شاخص‌های پروژه</p>
        {cards.map((c) => (
          <KpiCard key={c.label} {...c} />
        ))}
        <p className="px-0.5 pt-1 text-[9px] leading-4 text-muted">
          محاسبه‌شده از وضعیت واقعی {progress.totalJoints.toLocaleString('fa-IR')} سرجوش تولیدشده روی مسیر (هر {DEFAULT_STOCK_LENGTH_M.toLocaleString('fa-IR')} متر یک سرجوش).
        </p>
      </div>
    </div>
  )
}

function deltaBadge(diff: number, suffix: string, upIsGood: boolean): { text: string; good: boolean } | undefined {
  if (diff === 0) return undefined
  const up = diff > 0
  return { text: `${up ? '▲' : '▼'} ${Math.abs(diff).toLocaleString('fa-IR')}${suffix}`, good: up === upIsGood }
}

function KpiCard({ label, value, icon: Icon, accent, percent, delta }: { label: string; value: string; icon: LucideIcon; accent: string; percent: number; delta?: { text: string; good: boolean } }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 p-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${accent}22` }}>
        <Icon size={15} style={{ color: accent }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <p className="text-[9px] text-muted">{label}</p>
          {delta && (
            <span className="num text-[9px] font-bold" style={{ color: delta.good ? '#2ecc71' : '#e74c3c' }}>
              {delta.text}
            </span>
          )}
        </div>
        <p className="num text-base font-bold leading-tight">{value}</p>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, percent))}%`, background: accent }} />
        </div>
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
