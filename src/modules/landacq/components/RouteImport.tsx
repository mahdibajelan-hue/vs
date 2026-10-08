import { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, FileUp, MapPinned } from 'lucide-react'
import type { LonLat } from '../lib/geometry'
import type { KmlRoute } from '../lib/kml'
import { parseIpTable, readRouteFile, tableFromSheet, tableFromText } from '../lib/routeImport'
import { pathLength } from '../lib/measure'
import { faNum } from '../lib/fa'
import { Field } from './ui'

/**
 * Route coordinates in, three ways: a KML / KMZ file, an Excel / CSV list of IP points (lon/lat or UTM), or pasted lines.
 * Shows what was understood (count, length, skipped rows) before anything is saved.
 */
export function RouteImport({ onApply }: { onApply: (points: LonLat[], source: 'kml' | 'manual', lengthKm: number, setTotal: boolean, startKm: number | null) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<unknown[][] | null>(null)
  const [kml, setKml] = useState<KmlRoute | null>(null)
  const [useStart, setUseStart] = useState(true)
  const [text, setText] = useState('')
  const [zone, setZone] = useState(39)
  const [north, setNorth] = useState(true)
  const [setTotal, setSetTotal] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const table = rows ?? (text.trim() ? tableFromText(text) : null)
  const parsed = useMemo(() => (table ? parseIpTable(table, { zone, north }) : null), [table, zone, north])
  const kmlPoints = kml?.points ?? null
  const points = kmlPoints ?? parsed?.points ?? []
  const lengthKm = points.length > 1 ? pathLength(points) / 1000 : 0
  const source: 'kml' | 'manual' = kmlPoints ? 'kml' : 'manual'

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    setMsg(null)
    setKml(null); setRows(null)
    try {
      const n = f.name.toLowerCase()
      if (/\.(xlsx|xls|csv|ods)$/.test(n)) setRows(await tableFromSheet(f))
      else {
        const r = await readRouteFile(f)
        if (r.points.length < 2) throw new Error('در این فایل مسیری (LineString) پیدا نشد.')
        setKml(r)
        setSetTotal(true)
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'خواندن فایل انجام نشد')
    }
    setBusy(false)
  }

  return (
    <div className="la-card-flat flex flex-col gap-3 p-4">
      <p className="la-title m-0 flex items-center gap-2"><MapPinned size={15} /> مختصات مسیر (نقشه واقعی)</p>
      <p className="la-eyebrow m-0 leading-6">فایل KML یا KMZ، یا لیست نقاط IP مسیر را از اکسل / CSV بدهید؛ مختصات می‌تواند جغرافیایی (Lon, Lat) یا UTM (Easting, Northing با زون) باشد. می‌توانید خطوط را هم همین‌جا بچسبانید.</p>
      <div className="flex flex-wrap gap-2">
        <input ref={file} type="file" hidden accept=".kml,.kmz,.xml,.xlsx,.xls,.csv,.ods" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
        <button className="la-btn" disabled={busy} onClick={() => file.current?.click()}><FileUp size={14} /> انتخاب فایل KML / KMZ</button>
        <button className="la-btn" disabled={busy} onClick={() => file.current?.click()}><FileSpreadsheet size={14} /> انتخاب فایل Excel / CSV</button>
      </div>
      <Field label="یا بچسبانید: هر خط یک نقطهٔ IP (اولین ستون‌های عددی خوانده می‌شود)">
        <textarea className="la-input la-textarea la-km" style={{ minHeight: 90 }} placeholder={'Easting Northing\n535100 3949500\n537900 3951200'} value={text} onChange={(e) => { setText(e.target.value); setRows(null); setKml(null) }} />
      </Field>
      {parsed?.format === 'utm' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="زون UTM" hint={parsed.zone && parsed.zone !== zone ? `زون ستون فایل: ${faNum(parsed.zone)}` : 'اگر ستون زون ندارید این مقدار برای همه اعمال می‌شود'}><input className="la-input la-num" type="number" min={1} max={60} value={zone} onChange={(e) => setZone(Number(e.target.value))} /></Field>
          <Field label="نیم‌کره"><select className="la-select" value={north ? 'N' : 'S'} onChange={(e) => setNorth(e.target.value === 'N')}><option value="N">شمالی</option><option value="S">جنوبی</option></select></Field>
        </div>
      )}
      {msg && <p className="m-0 text-[12px]" style={{ color: 'var(--la-bad)' }}>{msg}</p>}
      {(kmlPoints || parsed) && (
        <div className="rounded-xl p-3 text-[12.5px] leading-7" style={{ background: 'var(--la-surface)', border: '1px solid var(--la-line)' }}>
          {points.length >= 2 ? (
            <>
              <b>{faNum(points.length)} نقطه</b> خوانده شد{parsed && !kmlPoints ? (parsed.format === 'utm' ? ' (UTM)' : ' (جغرافیایی)') : ''} · طول تقریبی مسیر <b>{faNum(+lengthKm.toFixed(2))} کیلومتر</b>
              {parsed && parsed.skipped > 0 && <span style={{ color: '#f59e0b' }}> · {faNum(parsed.skipped)} ردیف نامعتبر نادیده گرفته شد</span>}
              {kml && (
                <span className="block leading-7" style={{ color: 'var(--la-ink-2)' }}>
                  فقط خطوط (LineString) مسیر خوانده می‌شود؛ نقطه‌ها و چندضلعی‌ها نادیده‌اند.
                  {kml.ignoredLines > 0 && <b style={{ color: '#f59e0b' }}> {faNum(kml.ignoredLines)} خط جداافتاده (غیرمتصل به مسیر) کنار گذاشته شد.</b>}
                  {kml.posts >= 2 ? <b style={{ color: '#22c55e' }}> کیلومترشمار فایل شناسایی شد: KM {faNum(kml.startKm ?? 0)} تا {faNum(kml.endKm ?? 0)} (از {faNum(kml.posts)} پست کیلومتری).</b> : ' پست کیلومتری (مثل «KM 12+500») در فایل نیست؛ کیلومتر شروع ۰ فرض می‌شود.'}
                  {kml.postMismatchM != null && Math.abs(kml.postMismatchM) > 500 && <b style={{ color: '#ef4444' }}> کیلومترشمار فایل با طول خط {faNum(Math.round(Math.abs(kml.postMismatchM)))} متر اختلاف دارد؛ فایل را بررسی کنید.</b>}
                </span>
              )}
              {kml?.startKm != null && <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={useStart} onChange={(e) => setUseStart(e.target.checked)} /> کیلومتر شروع مسیر را برابر KM {faNum(kml.startKm)} بگذار</label>}
              <label className="mt-1 flex cursor-pointer items-center gap-2"><input type="checkbox" checked={setTotal} onChange={(e) => setSetTotal(e.target.checked)} /> طول کل مسیر را برابر طول این مسیر قرار بده</label>
              <button className="la-btn la-btn-primary mt-2" onClick={() => { onApply(points, source, lengthKm, setTotal, kml?.startKm != null && useStart ? kml.startKm : null); setRows(null); setKml(null); setText('') }}>اعمال مسیر</button>
            </>
          ) : (
            <span style={{ color: 'var(--la-ink-2)' }}>حداقل دو نقطهٔ معتبر لازم است. {parsed?.format === 'none' ? 'ستون عددی پیدا نشد.' : ''}</span>
          )}
        </div>
      )}
    </div>
  )
}
