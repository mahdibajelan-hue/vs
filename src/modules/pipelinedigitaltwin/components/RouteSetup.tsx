import { useRef, useState } from 'react'
import { FileUp, Loader2, Route as RouteIcon, Sparkles } from 'lucide-react'
import { usePdtStore } from '../store/usePdtStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { readRouteFile } from '../../landacq/lib/routeImport'

const fa = (n: number, d = 0) => n.toLocaleString('fa-IR', { maximumFractionDigits: d })

/**
 * Where the route comes from. A KML/KMZ is read with the land module's own parser (main line, side lines ignored, km posts)
 * and saved as the project's shared route, so the land map and the twin draw the same line. A sample route is the twin's
 * own, clearly labelled, and never overwrites the shared one.
 */
export function RouteSetup({ projectName, compact }: { projectName: string; compact?: boolean }) {
  const st = usePdtStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const input = useRef<HTMLInputElement>(null)
  const [note, setNote] = useState<string | null>(null)
  const onFile = async (file: File) => {
    st.setImporting(true); st.setImportError(''); setNote(null)
    try {
      const r = await readRouteFile(file)
      if (r.points.length < 2) throw new Error('هیچ مسیر خطی در این فایل پیدا نشد.')
      await st.saveRoute(r.points.map((p) => ({ lon: p[0], lat: p[1], elevation: p.length > 2 ? p[2]! : null })), file.name, 'kml', email, projectName)
      setNote(`${fa(r.lengthKm, 2)} کیلومتر خوانده شد${r.ignoredLines ? ` (${fa(r.ignoredLines)} خط فرعی نادیده گرفته شد)` : ''}.`)
    } catch (e) { st.setImportError((e as Error).message || 'فایل قابل خواندن نبود — یک KML/KMZ معتبر انتخاب کنید.') }
    st.setImporting(false)
  }
  return (
    <div className="tw-form">
      <div className="tw-choices">
        <button type="button" className="tw-choice" onClick={() => input.current?.click()} disabled={st.importing}>
          <span className="tw-ph-ico">{st.importing ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}</span>
          <b>وارد کردن مسیر واقعی (KML / KMZ)</b>
          <small>همان مسیری که در ماژول تحصیل اراضی هم استفاده می‌شود؛ با ثبت آن، نقشهٔ آن ماژول هم روی مسیر واقعی رسم می‌شود.</small>
        </button>
        {!compact && (
          <button type="button" className="tw-choice" onClick={() => st.createSampleRoute(email, projectName)} disabled={st.importing}>
            <span className="tw-ph-ico"><Sparkles size={18} /></span>
            <b>ساخت مسیر نمونه (فرضی)</b>
            <small>برای آشنایی و آزمایش: یک مسیر فرضی به طول {fa(st.plannedKm ?? 100)} کیلومتر فقط در همین ماژول ساخته می‌شود. بعداً با مسیر واقعی جایگزین می‌شود.</small>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept=".kml,.kmz" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f) }} />
      {st.importError && <p className="tw-err">{st.importError}</p>}
      {note && <p className="tw-hint">{note}</p>}
      {st.routeOrigin && <p className="tw-hint"><RouteIcon size={12} className="inline" /> مسیر فعلی: {st.routeOrigin === 'land' ? 'مسیر مشترک پروژه (ماژول تحصیل اراضی)' : st.route.fileName ?? 'مسیر خود این ماژول'} · {fa(st.route.lengthMeters / 1000, 2)} کیلومتر</p>}
    </div>
  )
}
