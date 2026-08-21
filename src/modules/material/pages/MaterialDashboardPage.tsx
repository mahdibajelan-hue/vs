import { useMemo } from 'react'
import {
  AlertTriangle,
  Boxes,
  Clock,
  Factory,
  Package,
  PackageCheck,
  Scale,
  ShoppingCart,
  Truck,
  Warehouse,
  Weight,
} from 'lucide-react'
import { useMasterDataStore } from '../../masterdata/store/useMasterDataStore'
import { useMaterialStore } from '../store/useMaterialStore'
import { computeMaterialStatus, computeProjectMaterialSummary } from '../lib/materialCalc'
import { MaterialKpiTile, fmtQty, fmtValue, fmtWeight } from '../components/MaterialKpiTile'
import { MATERIAL_ACCENT } from '../MaterialApp'
import { BreakdownDonut, RankedBarChart, type ChartDatum } from '../../masterdata/components/RollupCharts'
import {
  COMMODITY_TYPE_LABEL_FA,
  MANUFACTURING_STATUS_COLOR,
  MANUFACTURING_STATUS_LABEL_FA,
  PROCUREMENT_REQUEST_STATUS_COLOR,
  PROCUREMENT_REQUEST_STATUS_LABEL_FA,
  SHIPMENT_STATUS_COLOR,
  SHIPMENT_STATUS_LABEL_FA,
  type CommodityType,
  type ManufacturingStatus,
  type ProcurementRequestStatus,
  type ShipmentStatus,
} from '../types'

export function MaterialDashboardPage({ masterProjectId }: { masterProjectId: string }) {
  const project = useMasterDataStore((s) => s.projects.find((p) => p.id === masterProjectId))
  const materials = useMaterialStore((s) => s.materials).filter((m) => m.masterProjectId === masterProjectId)
  const poLines = useMaterialStore((s) => s.poLines)
  const purchaseOrders = useMaterialStore((s) => s.purchaseOrders)
  const manufacturing = useMaterialStore((s) => s.manufacturing)
  const releaseLines = useMaterialStore((s) => s.releaseLines)
  const shipmentLines = useMaterialStore((s) => s.shipmentLines)
  const warehouseLines = useMaterialStore((s) => s.warehouseLines)
  const allocations = useMaterialStore((s) => s.allocations)
  const requests = useMaterialStore((s) => s.procurementRequests).filter((r) => r.masterProjectId === masterProjectId)
  const shipments = useMaterialStore((s) => s.shipments).filter((sh) => sh.masterProjectId === masterProjectId)

  const materialIds = useMemo(() => new Set(materials.map((m) => m.id)), [materials])
  const myPoLines = useMemo(() => poLines.filter((l) => materialIds.has(l.materialId)), [poLines, materialIds])
  const myPoLineIds = useMemo(() => new Set(myPoLines.map((l) => l.id)), [myPoLines])
  const myManufacturing = useMemo(() => manufacturing.filter((m) => myPoLineIds.has(m.poLineId)), [manufacturing, myPoLineIds])

  const summary = useMemo(
    () => computeProjectMaterialSummary(materials, poLines, purchaseOrders, manufacturing, releaseLines, shipmentLines, warehouseLines, allocations),
    [materials, poLines, purchaseOrders, manufacturing, releaseLines, shipmentLines, warehouseLines, allocations],
  )

  const currency = materials[0]?.currency ?? 'ریال'

  const commodityData: ChartDatum[] = useMemo(() => {
    const counts = new Map<CommodityType, number>()
    for (const m of materials) counts.set(m.commodityType, (counts.get(m.commodityType) ?? 0) + 1)
    const palette: Record<CommodityType, string> = {
      pipe: '#38bdf8',
      fitting: '#a78bfa',
      valve: '#f59e0b',
      flange: '#2ecc71',
      gasket: '#64748b',
      bolt_nut: '#94a3b8',
      instrument: '#e879f9',
      equipment: '#e74c3c',
      support: '#64748b',
      other: '#475569',
    }
    return [...counts.entries()].map(([key, value]) => ({ key, label: COMMODITY_TYPE_LABEL_FA[key], value, color: palette[key] }))
  }, [materials])

  const procurementStatusData: ChartDatum[] = useMemo(() => {
    const counts = new Map<ProcurementRequestStatus, number>()
    for (const r of requests) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
    return [...counts.entries()].map(([key, value]) => ({ key, label: PROCUREMENT_REQUEST_STATUS_LABEL_FA[key], value, color: PROCUREMENT_REQUEST_STATUS_COLOR[key] }))
  }, [requests])

  const manufacturingStatusData: ChartDatum[] = useMemo(() => {
    const counts = new Map<ManufacturingStatus, number>()
    for (const m of myManufacturing) counts.set(m.status, (counts.get(m.status) ?? 0) + 1)
    return [...counts.entries()].map(([key, value]) => ({ key, label: MANUFACTURING_STATUS_LABEL_FA[key], value, color: MANUFACTURING_STATUS_COLOR[key] }))
  }, [myManufacturing])

  const shipmentStatusData: ChartDatum[] = useMemo(() => {
    const counts = new Map<ShipmentStatus, number>()
    for (const sh of shipments) counts.set(sh.status, (counts.get(sh.status) ?? 0) + 1)
    return [...counts.entries()].map(([key, value]) => ({ key, label: SHIPMENT_STATUS_LABEL_FA[key], value, color: SHIPMENT_STATUS_COLOR[key] }))
  }, [shipments])

  const shortageData: ChartDatum[] = useMemo(() => {
    return materials
      .map((m) => {
        const status = computeMaterialStatus(m, poLines, purchaseOrders, manufacturing, releaseLines, shipmentLines, warehouseLines, allocations)
        return { key: m.id, label: m.materialCode || m.lineNo || m.description, value: Math.round(status.shortageQuantity), color: m.isConstructionBlocking ? '#e74c3c' : '#f1c40f' }
      })
      .filter((d) => d.value > 0)
  }, [materials, poLines, purchaseOrders, manufacturing, releaseLines, shipmentLines, warehouseLines, allocations])

  const weightByAreaData: ChartDatum[] = useMemo(() => {
    const totals = new Map<string, number>()
    for (const m of materials) {
      const key = m.area || '(نامشخص)'
      totals.set(key, (totals.get(key) ?? 0) + m.totalWeightKg)
    }
    return [...totals.entries()].map(([key, value]) => ({ key, label: key, value: Math.round(value), color: MATERIAL_ACCENT }))
  }, [materials])

  if (!project) return <div className="flex h-40 items-center justify-center text-xs text-muted">پروژه یافت نشد</div>

  const funnelStages: { label: string; value: number; color: string }[] = [
    { label: 'نیاز MTO', value: summary.totalMtoWeightKg > 0 ? materials.reduce((s, m) => s + m.mtoQuantity, 0) : 0, color: '#64748b' },
    { label: 'سفارش‌شده', value: summary.totalOrdered, color: '#38bdf8' },
    { label: 'آماده ساخت', value: summary.totalManufacturedReady, color: '#a78bfa' },
    { label: 'ارسال‌شده', value: summary.totalShipped, color: '#f59e0b' },
    { label: 'رسیده به انبار', value: summary.totalReceived, color: '#2ecc71' },
    { label: 'تخصیص‌یافته', value: summary.totalAllocated, color: '#eab308' },
    { label: 'مصرف‌شده', value: summary.totalConsumed, color: '#22d3ee' },
  ]
  const funnelMax = Math.max(...funnelStages.map((s) => s.value), 1)

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4">
        <p className="text-xs text-muted">داشبورد تامین کالا</p>
        <h1 className="mt-1 text-lg font-extrabold">{project.officialName}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <MaterialKpiTile icon={Package} label="تعداد اقلام کالا" value={summary.materialCount} color={MATERIAL_ACCENT} />
        <MaterialKpiTile icon={Weight} label="وزن کل MTO" value={fmtWeight(summary.totalMtoWeightKg)} color="#38bdf8" />
        <MaterialKpiTile icon={Scale} label="ارزش کل MTO" value={fmtValue(summary.totalMtoValue, currency)} color="#a78bfa" />
        <MaterialKpiTile icon={ShoppingCart} label="پیشرفت تامین (سفارش/نیاز)" value={`${summary.procurementProgressPct}٪`} color="#f59e0b" status={summary.procurementProgressPct >= 80 ? 'good' : summary.procurementProgressPct >= 40 ? 'warn' : 'bad'} />
        <MaterialKpiTile icon={Factory} label="پیشرفت ساخت (آماده/سفارش)" value={`${summary.manufacturingProgressPct}٪`} color="#a78bfa" status={summary.manufacturingProgressPct >= 80 ? 'good' : summary.manufacturingProgressPct >= 40 ? 'warn' : 'bad'} />
        <MaterialKpiTile icon={Truck} label="پیشرفت ارسال" value={`${summary.shippedProgressPct}٪`} color="#f59e0b" status={summary.shippedProgressPct >= 80 ? 'good' : summary.shippedProgressPct >= 40 ? 'warn' : 'bad'} />
        <MaterialKpiTile icon={Warehouse} label="پیشرفت رسید انبار" value={`${summary.receivedProgressPct}٪`} color="#2ecc71" status={summary.receivedProgressPct >= 80 ? 'good' : summary.receivedProgressPct >= 40 ? 'warn' : 'bad'} />
        <MaterialKpiTile icon={PackageCheck} label="پیشرفت تخصیص" value={`${summary.allocatedProgressPct}٪`} color="#eab308" status={summary.allocatedProgressPct >= 80 ? 'good' : summary.allocatedProgressPct >= 40 ? 'warn' : 'bad'} />
        <MaterialKpiTile icon={Boxes} label="پیشرفت مصرف" value={`${summary.consumedProgressPct}٪`} color="#22d3ee" status={summary.consumedProgressPct >= 80 ? 'good' : summary.consumedProgressPct >= 40 ? 'warn' : 'bad'} />
        <MaterialKpiTile icon={AlertTriangle} label="اقلام دارای کسری" value={summary.shortMaterialCount} color={summary.shortMaterialCount > 0 ? '#e74c3c' : '#2ecc71'} status={summary.shortMaterialCount > 0 ? 'bad' : 'good'} />
        <MaterialKpiTile
          icon={AlertTriangle}
          label="اقلام مسدودکننده اجرا"
          value={summary.blockingMaterialCount}
          color={summary.blockingMaterialCount > 0 ? '#e74c3c' : '#2ecc71'}
          status={summary.blockingMaterialCount > 0 ? 'bad' : 'good'}
        />
        <MaterialKpiTile icon={Clock} label="اقلام Long-Lead باز" value={summary.longLeadOpenCount} color="#f59e0b" />
        <MaterialKpiTile icon={Clock} label="ساخت با تاخیر" value={summary.overdueManufacturingCount} color={summary.overdueManufacturingCount > 0 ? '#e74c3c' : '#2ecc71'} status={summary.overdueManufacturingCount > 0 ? 'bad' : 'good'} />
      </div>

      <div className="glass-panel rounded-2xl p-4">
        <p className="mb-3 text-[11px] font-bold">زنجیره وضعیت کالا — از MTO تا مصرف</p>
        <div className="space-y-2">
          {funnelStages.map((stage) => (
            <div key={stage.label} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-[10.5px] text-secondary">{stage.label}</span>
              <div className="h-5 flex-1 rounded-lg" style={{ background: 'rgba(148,163,184,0.12)' }}>
                <div className="h-5 rounded-lg" style={{ width: `${Math.max(2, (stage.value / funnelMax) * 100)}%`, background: stage.color }} />
              </div>
              <span className="num w-20 shrink-0 text-left text-[11px] font-bold">{fmtQty(stage.value)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BreakdownDonut title="ترکیب انواع کالا" data={commodityData} height={190} />
        <BreakdownDonut title="وضعیت درخواست‌های خرید" data={procurementStatusData} height={190} />
        <BreakdownDonut title="وضعیت ساخت" data={manufacturingStatusData} height={190} />
        <BreakdownDonut title="وضعیت محموله‌ها" data={shipmentStatusData} height={190} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <RankedBarChart title="بیشترین کسری کالا" icon={<AlertTriangle size={12} style={{ color: '#e74c3c' }} />} data={shortageData} formatValue={(n) => fmtQty(n)} />
        <RankedBarChart title="وزن کل کالا به تفکیک Area" icon={<Weight size={12} style={{ color: MATERIAL_ACCENT }} />} data={weightByAreaData} formatValue={(n) => fmtWeight(n)} />
      </div>
    </div>
  )
}
