import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Loader2, Settings, X } from 'lucide-react'
import { usePdtStore } from '../store/usePdtStore'
import { useAuthStore } from '../../../store/useAuthStore'
import type { TwinSettings } from '../repo'
import { RouteSetup } from './RouteSetup'

/** The line's physical spec (one source for the joint panel, the route bar and the joint count) and its route. */
export function SettingsDialog({ projectName, onClose }: { projectName: string; onClose: () => void }) {
  const st = usePdtStore()
  const email = useAuthStore((s) => s.profile?.email ?? '')
  const [f, setF] = useState<Record<keyof TwinSettings, string>>(() => Object.fromEntries(Object.entries(st.settings).map(([k, v]) => [k, String(v)])) as Record<keyof TwinSettings, string>)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  const num = (k: keyof TwinSettings) => Number(f[k])
  const bad = (['diameterIn', 'wallMm', 'designPressureBar', 'stockLengthM'] as const).filter((k) => !(num(k) > 0))
  const stockChanged = num('stockLengthM') !== st.settings.stockLengthM
  const save = async () => {
    setBusy(true)
    const ok = await st.saveSettings({ diameterIn: num('diameterIn'), wallMm: num('wallMm'), material: f.material.trim(), designPressureBar: num('designPressureBar'), fluid: f.fluid.trim(), stockLengthM: num('stockLengthM') }, email)
    setBusy(false)
    if (ok) onClose()
  }
  const field = (k: keyof TwinSettings, label: string, unit?: string, ltr = true) => (
    <label className="tw-field"><span>{label}{unit ? ` (${unit})` : ''}</span><input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} inputMode={unit ? 'decimal' : undefined} dir={ltr ? 'ltr' : undefined} aria-invalid={(bad as string[]).includes(k)} /></label>
  )
  return createPortal(
    <div className="tw-backdrop" onClick={onClose}>
      <div className="tw tw-dialog" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="tw-set-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <header><span className="tw-ph-ico"><Settings size={16} /></span><h3 id="tw-set-title">تنظیمات خط لوله</h3><button type="button" className="tw-x" onClick={onClose} aria-label="بستن"><X size={16} /></button></header>
        <div className="tw-body">
          <section className="tw-sec">
            <h4>مشخصات لوله</h4>
            <div className="tw-grid2">
              {field('diameterIn', 'قطر', 'اینچ')}
              {field('wallMm', 'ضخامت جدار', 'mm')}
              {field('material', 'جنس / گرید')}
              {field('designPressureBar', 'فشار طراحی', 'bar')}
              {field('fluid', 'سیال', undefined, false)}
              {field('stockLengthM', 'طول هر شاخه لوله', 'متر')}
            </div>
            {stockChanged && <p className="tw-gap">تغییر طول شاخه، شماره و محل همهٔ سرجوش‌ها را عوض می‌کند؛ اگر پیشرفت ثبت شده، فقط در صورت اشتباه بودن مقدار فعلی تغییر دهید.</p>}
            <button type="button" className="tw-cta" disabled={busy || bad.length > 0} onClick={save}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} ذخیرهٔ مشخصات</button>
          </section>
          <section className="tw-sec">
            <h4>مسیر</h4>
            <RouteSetup projectName={projectName} />
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
