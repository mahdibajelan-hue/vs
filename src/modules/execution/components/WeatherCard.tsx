import { Clock, Cloud, CloudRain, CloudSnow, CloudSun, Droplets, Footprints, Layers, Mountain, OctagonX, Pause, Play, Snowflake, Sun, ThermometerSnowflake, ThermometerSun, Wind, type LucideIcon } from 'lucide-react'
import { DecInput } from '../../material/components/control/DecInput'

interface Opt { value: string; label: string; icon: LucideIcon; color: string }
export const WEATHER_OPTS: Opt[] = [
  { value: 'sunny', label: 'آفتابی', icon: Sun, color: '#f59e0b' },
  { value: 'partly', label: 'نیمه‌ابری', icon: CloudSun, color: '#fbbf24' },
  { value: 'cloudy', label: 'ابری', icon: Cloud, color: '#94a3b8' },
  { value: 'rainy', label: 'بارانی', icon: CloudRain, color: '#38bdf8' },
  { value: 'snowy', label: 'برفی', icon: CloudSnow, color: '#7dd3fc' },
  { value: 'stormy', label: 'باد و خاک', icon: Wind, color: '#a78bfa' },
]
const SITE: Opt[] = [
  { value: 'active', label: 'فعال', icon: Play, color: '#34d399' },
  { value: 'partial', label: 'محدود', icon: Pause, color: '#f59e0b' },
  { value: 'stopped', label: 'تعطیل', icon: OctagonX, color: '#fb7185' },
]
const GROUND: Opt[] = [
  { value: 'dry', label: 'خشک', icon: Mountain, color: '#d6a35c' },
  { value: 'mud', label: 'گل', icon: Footprints, color: '#a16207' },
  { value: 'wet', label: 'خیس', icon: Droplets, color: '#38bdf8' },
  { value: 'frozen', label: 'یخ‌زده', icon: Snowflake, color: '#7dd3fc' },
  { value: 'snow', label: 'برف‌گیر', icon: Layers, color: '#cbd5e1' },
]

function Pills({ opts, value, onPick, disabled, label }: { opts: Opt[]; value: string; onPick: (v: string) => void; disabled: boolean; label: string }) {
  return (
    <div className="wx-pills" role="radiogroup" aria-label={label}>
      {opts.map((o) => { const I = o.icon, on = o.value === value; return (
        <button key={o.value} type="button" role="radio" aria-checked={on} disabled={disabled} className={`wx-pill${on ? ' on' : ''}`} style={{ ['--c' as string]: o.color }} onClick={() => onPick(on ? '' : o.value)} title={o.label}>
          <I size={20} strokeWidth={1.8} /><span>{o.label}</span>
        </button>
      ) })}
    </div>
  )
}

/** Weather and site conditions of the day as big icon buttons: one tap each, numbers only for temperature, humidity and useful hours. */
export function WeatherCard({ data, editable, onChange }: { data: Record<string, unknown>; editable: boolean; onChange: (k: string, v: unknown) => void }) {
  const num = (k: string) => Number(data[k]) || 0
  return (
    <div className="wx-card">
      <div className="wx-row">
        <span className="wx-cap">هوا</span>
        <Pills opts={WEATHER_OPTS} value={String(data.weather ?? '')} onPick={(v) => onChange('weather', v)} disabled={!editable} label="وضعیت هوا" />
      </div>
      <div className="wx-nums">
        <label className="wx-num" style={{ ['--c' as string]: '#f59e0b' }}><ThermometerSun size={18} /><span>بیشینه</span><DecInput value={num('tempMax')} onValue={(n) => editable && onChange('tempMax', n)} label="بیشینهٔ دما" /><em>°C</em></label>
        <label className="wx-num" style={{ ['--c' as string]: '#38bdf8' }}><ThermometerSnowflake size={18} /><span>کمینه</span><DecInput value={num('tempMin')} onValue={(n) => editable && onChange('tempMin', n)} label="کمینهٔ دما" /><em>°C</em></label>
        <label className="wx-num" style={{ ['--c' as string]: '#22d3ee' }}><Droplets size={18} /><span>رطوبت</span><DecInput value={num('humidity')} onValue={(n) => editable && onChange('humidity', n)} label="رطوبت" /><em>٪</em></label>
        <label className="wx-num" style={{ ['--c' as string]: '#a78bfa' }}><Clock size={18} /><span>ساعت کار مفید</span><DecInput value={num('usefulHours')} onValue={(n) => editable && onChange('usefulHours', n)} label="ساعت کار مفید" /><em>h</em></label>
      </div>
      <div className="wx-row">
        <span className="wx-cap">کارگاه</span>
        <Pills opts={SITE} value={String(data.siteStatus ?? '')} onPick={(v) => onChange('siteStatus', v)} disabled={!editable} label="وضعیت کارگاه" />
        <span className="wx-cap">زمین</span>
        <Pills opts={GROUND} value={String(data.groundStatus ?? '')} onPick={(v) => onChange('groundStatus', v)} disabled={!editable} label="وضعیت زمین" />
      </div>
    </div>
  )
}

/** Compact read-only line for headers and the print preview. */
export function WeatherBadge({ value }: { value: unknown }) {
  const o = WEATHER_OPTS.find((x) => x.value === String(value ?? ''))
  if (!o) return <span>—</span>
  const I = o.icon
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: o.color }}><I size={15} />{o.label}</span>
}
