import { useLandStore, useLandAnalysis } from '../store/useLandStore'
import { RouteMap } from '../components/RouteMap'
import { ChainageRibbon } from '../components/ChainageRibbon'
import { MapLegend, NoRoute } from '../components/shared'
import { Card, Segmented } from '../components/ui'

/** The Land Acquisition Layer on its own: switch what the colour means, click a block → parcel side panel. */
export function MapPage() {
  const data = useLandStore((s) => s.data)
  const mode = useLandStore((s) => s.colorMode)
  const setMode = useLandStore((s) => s.setColorMode)
  const selectedId = useLandStore((s) => s.selectedId)
  const select = useLandStore((s) => s.selectParcel)
  const { rows, lengths, today } = useLandAnalysis()
  if (!data?.route) return <NoRoute />
  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-4">
      <Card
        title="لایهٔ تحصیل اراضی"
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
        <RouteMap route={data.route} rows={rows} mode={mode} selectedId={selectedId} onSelect={select} activities={data.activities} today={today} height={560} />
        <div className="mt-4"><MapLegend mode={mode} counts={lengths} /></div>
        <div className="mt-4"><ChainageRibbon route={data.route} rows={rows} mode={mode} selectedId={selectedId} onSelect={select} activities={data.activities} today={today} /></div>
      </Card>
    </div>
  )
}
