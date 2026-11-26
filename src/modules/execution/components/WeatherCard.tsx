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
export const SITE_OPTS: Opt[] = [
  { value: 'active', label: 'فعال', icon: Play, color: '#34d399' },
  { value: 'partial', label: 'محدود', icon: Pause, color: '#f59e0b' },
  { value: 'stopped', label: 'تعطیل', icon: OctagonX, color: '#fb7185' },
]
export const GROUND_OPTS: Opt[] = [
  { value: 'dry', label: 'خشک', icon: Mountain, color: '#d6a35c' },
  { value: 'mud', label: 'گل', icon: Footprints, color: '#a16207' },
  { value: 'wet', label: 'خیس', icon: Droplets, color: '#38bdf8' },
  { value: 'frozen', label: 'یخ‌زده', icon: Snowflake, color: '#7dd3fc' },
  { value: 'snow', label: 'برف‌گیر', icon: Layers, color: '#cbd5e1' },
]

function Pills({ opts, value, onPick, disabled, label, size = 18 }: { opts: Opt[]; value: string; onPick: (v: string) => void; disabled: boolean; label: string; size?: number }) {
  return (
    <div className="wx-pills" role="radiogroup" aria-label={label}>
      {opts.map((o) => { const I = o.icon, on = o.value === value; return (
        <button key={o.value} type="button" role="radio" aria-checked={on} disabled={disabled} className={`wx-pill${on ? ' on' : ''}`} style={{ ['--c' as string]: o.color }} onClick={() => onPick(on ? '' : o.value)} title={o.label}>
          <I size={size} strokeWidth={1.8} /><span>{o.label}</span>
        </button>
      ) })}
    </div>
  )
}

/** The day's weather in one box drawn as a living sky (rain falls, snow drifts, wind blows, the sun burns), with the
 *  temperature, humidity and useful hours inside it; the site and ground state in a second box. */
export function WeatherCard({ data, editable, onChange }: { data: Record<string, unknown>; editable: boolean; onChange: (k: string, v: unknown) => void }) {
  const num = (k: string) => Number(data[k]) || 0
  const w = WEATHER_OPTS.find((x) => x.value === String(data.weather ?? ''))
  const Big = w?.icon ?? CloudSun
  const site = SITE_OPTS.find((x) => x.value === String(data.siteStatus ?? '')), ground = GROUND_OPTS.find((x) => x.value === String(data.groundStatus ?? ''))
  const stat = (k: string, label: string, unit: string, I: LucideIcon, signed = false) => (
    <label className="wx-stat">
      <span className="wx-stat-cap"><I size={14} aria-hidden />{label}</span>
      <span className="wx-stat-in"><DecInput value={num(k)} onValue={(n) => editable && onChange(k, n)} label={label} signed={signed} /><em>{unit}</em></span>
    </label>
  )
  return (
    <div className="wx-card">
      <section className={`wx-sky wx-sky-${w?.value ?? 'none'}`}>
        <div className="wx-fx" aria-hidden><i className="wx-fx-a" /><i className="wx-fx-b" /><i className="wx-fx-c" /></div>
        <div className="wx-sky-now"><Big size={46} strokeWidth={1.5} aria-hidden /><div><small>وضعیت هوا</small><b>{w?.label ?? 'انتخاب کنید'}</b>{(data.tempMin != null || data.tempMax != null) && <span className="num">{num('tempMin').toLocaleString('fa-IR')}° تا {num('tempMax').toLocaleString('fa-IR')}°</span>}</div></div>
        <Pills opts={WEATHER_OPTS} value={String(data.weather ?? '')} onPick={(v) => onChange('weather', v)} disabled={!editable} label="وضعیت هوا" size={16} />
        <div className="wx-stats">
          {stat('tempMin', 'کمینهٔ دما', '°C', ThermometerSnowflake, true)}
          {stat('tempMax', 'بیشینهٔ دما', '°C', ThermometerSun, true)}
          {stat('humidity', 'رطوبت', '٪', Droplets)}
          {stat('usefulHours', 'کار مفید', 'ساعت', Clock)}
        </div>
      </section>
      <section className="wx-site">
        <div className={`wx-site-row wx-site-${site?.value ?? 'none'}`}>
          <span className="wx-site-badge" style={{ ['--c' as string]: site?.color ?? '#64748b' }}>{site ? <site.icon size={22} aria-hidden /> : <Play size={22} aria-hidden />}</span>
          <div><h4>وضعیت کارگاه</h4><b>{site?.label ?? 'انتخاب کنید'}</b></div>
        </div>
        <Pills opts={SITE_OPTS} value={String(data.siteStatus ?? '')} onPick={(v) => onChange('siteStatus', v)} disabled={!editable} label="وضعیت کارگاه" size={15} />
        <div className="wx-site-row">
          <span className="wx-site-badge" style={{ ['--c' as string]: ground?.color ?? '#64748b' }}>{ground ? <ground.icon size={22} aria-hidden /> : <Mountain size={22} aria-hidden />}</span>
          <div><h4>وضعیت زمین</h4><b>{ground?.label ?? 'انتخاب کنید'}</b></div>
        </div>
        <Pills opts={GROUND_OPTS} value={String(data.groundStatus ?? '')} onPick={(v) => onChange('groundStatus', v)} disabled={!editable} label="وضعیت زمین" size={15} />
      </section>
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
