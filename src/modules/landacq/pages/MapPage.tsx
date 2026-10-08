import { useState } from 'react'
import { Layers, Ruler, SquareDashed } from 'lucide-react'
import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { RouteMap } from '../components/RouteMap'
import { ChainageRibbon } from '../components/ChainageRibbon'
import { MapLegend, NoRoute } from '../components/shared'
import { Card, Segmented } from '../components/ui'
import { BASEMAPS, type Basemap } from '../lib/tiles'

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
  const { rows, lengths, today } = useLandAnalysis()
  const [basemap, setBasemap] = useState<Basemap>(readBasemap)
  const [tool, setTool] = useState<'none' | 'length' | 'area'>('none')
  const [plots, setPlots] = useState(true)
  if (!data?.route) return <NoRoute />
  const live = data.route.geometry.length >= 2
  const plotCount = rows.reduce((n, r) => n + r.parcel.plots.length, 0)
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
          <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={plots} onChange={(e) => setPlots(e.target.checked)} /> زمین‌های کاداستر با نام مالک ({plotCount.toLocaleString('fa-IR')})</label>
          {!live && <span className="la-eyebrow">برای پس‌زمینه و اندازه‌گیری، مختصات مسیر (KML) را در «تنظیمات» وارد کنید.</span>}
        </div>
        <RouteMap route={data.route} rows={rows} mode={mode} selectedId={selectedId} onSelect={select} activities={data.activities} today={today} height={560} basemap={basemap} tool={tool} showPlots={plots} />
        <div className="mt-4"><MapLegend mode={mode} counts={lengths} /></div>
        <div className="mt-4"><ChainageRibbon route={data.route} rows={rows} mode={mode} selectedId={selectedId} onSelect={select} activities={data.activities} today={today} /></div>
      </Card>
    </div>
  )
}
