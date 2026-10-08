import { useState } from 'react'
import { Layers, Ruler, SquareDashed } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { RouteMap } from '../components/RouteMap'
import { ChainageRibbon } from '../components/ChainageRibbon'
import { MapLegend, NoRoute } from '../components/shared'
import { Card, Segmented } from '../components/ui'
import { BASEMAPS, type Basemap } from '../lib/tiles'
import { CROSSING, CROSSING_TYPES, STATION, STATION_TYPES } from '../lib/facilities'
import { LayerMenu } from '../components/LayerMenu'

const KEY = 'la-basemap'
const readBasemap = (): Basemap => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'osm' || v === 'carto' || v === 'esri' ? v : 'none'
  } catch {
    return 'none'
  }
}

/** The Land Acquisition Layer on its own: switch what the colour means, optionally put satellite / street tiles under the route, measure roughly, see cadastral plots. */
export function MapPage() {
  const data = useLandStore((s) => s.data)
  const mode = useLandStore((s) => s.colorMode)
  const setMode = useLandStore((s) => s.setColorMode)
  const selectedId = useLandStore((s) => s.selectedId)
  const select = useLandStore((s) => s.selectParcel)
  const selectCrossing = useLandStore((s) => s.selectCrossing)
  const { rows, stations, crossings, lengths, today } = useLandAnalysis()
  const [stTypes, setStTypes] = useState<Set<string>>(() => new Set(STATION_TYPES))
  const [crTypes, setCrTypes] = useState<Set<string>>(() => new Set(CROSSING_TYPES))
  const [plotSrc, setPlotSrc] = useState<Set<string>>(() => new Set(['route', 'station']))
  const [basemap, setBasemap] = useState<Basemap>(readBasemap)
  const [tool, setTool] = useState<'none' | 'length' | 'area'>('none')
  if (!data?.route) return <NoRoute />
  const live = data.route.geometry.length >= 2
  const plotsOf = (l: typeof rows) => l.reduce((n, r) => n + r.parcel.plots.length, 0)
  const plotCount = plotsOf(rows) + plotsOf(stations)
  const plotRows = [...(plotSrc.has('route') ? rows : []), ...(plotSrc.has('station') ? stations : [])]
  const pick = (b: Basemap) => {
    setBasemap(b)
    try { localStorage.setItem(KEY, b) } catch { /* not remembered */ }
  }
  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <Card
        title="لایهٔ تملک و آزادسازی اراضی"
        hint="رنگ هر بخش از مسیر، وضعیت زمین همان بخش است"
        action={
          <Segmented
            label="معنای رنگ‌ها"
            value={mode}
            onChange={setMode}
            options={[{ value: 'status', label: 'وضعیت' }, { value: 'criticality', label: 'Criticality' }, { value: 'ownership', label: 'مالکیت' }, { value: 'stage', label: 'پیشرفت مراحل' }]}
          />
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-[12px] font-semibold"><Layers size={15} aria-hidden /> نقشهٔ پس‌زمینه
            <select className="la-select" style={{ width: 'auto' }} value={basemap} disabled={!live} onChange={(e) => pick(e.target.value as Basemap)}>
              <option value="none">بدون پس‌زمینه (سبک‌ترین)</option>
              {(Object.keys(BASEMAPS) as Exclude<Basemap, 'none'>[]).map((k) => <option key={k} value={k}>{BASEMAPS[k].label}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-1.5" role="group" aria-label="ابزار اندازه‌گیری">
            <button className="la-btn la-btn-sm" aria-pressed={tool === 'length'} disabled={!live} onClick={() => setTool(tool === 'length' ? 'none' : 'length')} style={tool === 'length' ? { borderColor: 'var(--la-accent)', background: 'var(--la-accent-soft)' } : undefined}><Ruler size={14} /> طول</button>
            <button className="la-btn la-btn-sm" aria-pressed={tool === 'area'} disabled={!live} onClick={() => setTool(tool === 'area' ? 'none' : 'area')} style={tool === 'area' ? { borderColor: 'var(--la-accent)', background: 'var(--la-accent-soft)' } : undefined}><SquareDashed size={14} /> مساحت و محیط</button>
          </div>
          {!live && <span className="la-eyebrow">برای پس‌زمینه و اندازه‌گیری، مختصات مسیر (KML) را در «تنظیمات» وارد کنید.</span>}
        </div>
        <div className="mb-3 flex flex-wrap items-start gap-2" role="group" aria-label="لایه‌های نقشه">
          <LayerMenu
            title="زمین‌های کاداستر با نام مالک"
            total={plotCount}
            items={[{ key: 'route', label: 'مسیر پروژه', count: plotsOf(rows) }, { key: 'station', label: 'ایستگاه‌ها', count: plotsOf(stations) }]}
            selected={plotSrc}
            onChange={setPlotSrc}
          />
          <LayerMenu
            title="ایستگاه‌ها"
            total={stations.length}
            items={STATION_TYPES.map((t) => ({ key: t, label: <><span className="rounded px-1 text-[9.5px] font-bold text-white" style={{ background: STATION[t].color }}>{STATION[t].short}</span> {STATION[t].label}</>, count: stations.filter((r) => r.parcel.stationType === t).length }))}
            selected={stTypes}
            onChange={setStTypes}
          />
          <LayerMenu
            title="عبور عرضی از تأسیسات"
            total={crossings.length}
            items={CROSSING_TYPES.map((t) => ({ key: t, label: <><span style={{ width: 9, height: 9, background: CROSSING[t].color, transform: 'rotate(45deg)', display: 'inline-block' }} /> {CROSSING[t].label}</>, count: crossings.filter((x) => x.c.crossingType === t).length }))}
            selected={crTypes}
            onChange={setCrTypes}
          />
        </div>
        <RouteMap route={data.route} rows={rows} mode={mode} selectedId={selectedId} onSelect={select} activities={data.activities} today={today} height={560} basemap={basemap} tool={tool} showPlots={plotRows.length > 0} plotRows={plotRows} stations={stations.filter((r) => r.parcel.stationType && stTypes.has(r.parcel.stationType))} crossings={crossings.filter((x) => crTypes.has(x.c.crossingType))} onSelectCrossing={(id) => { selectCrossing(id); useLandStore.getState().setTab('crossings') }} />
        <div className="mt-4"><MapLegend mode={mode} counts={lengths} /></div>
        <div className="mt-4"><ChainageRibbon route={data.route} rows={rows} mode={mode} selectedId={selectedId} onSelect={select} activities={data.activities} today={today} /></div>
      </Card>
    </div>
  )
}
