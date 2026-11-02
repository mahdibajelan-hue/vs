import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import '../../projectMetrics/healthGuide.css'

const STEPS: [string, string][] = [
  ['۱. ایستگاه‌ها', 'ایستگاه‌های شیر بین‌راهی، ارسال و دریافت توپک، PCS و CGS را تعریف کنید یا از دوقلوی دیجیتال (شیرها، تله‌های توپک و ایستگاه‌های ثبت‌شده روی مسیر) بیاورید. برای هر نوع ایستگاه یک محدودهٔ کار پیش‌فرض ساخته می‌شود که مقادیر آن باید با نقشه‌ها و BOQ پروژه اصلاح شود.'],
  ['۲. محدودهٔ کار و وزن‌ها', 'در صفحهٔ هر ایستگاه، آیتم‌های کار هر رشته (سیویل، سازه، مکانیکال، پایپینگ، برق، ابزار دقیق، رنگ و عایق، تست) با مقدار کل، واحد، وزن و تاریخ‌های برنامه‌ای ثبت می‌شوند. وزن هر رشته در پیشرفت ایستگاه در «نمای کلی» تنظیم می‌شود.'],
  ['۳. کارکرد روزانه', 'در «کارکرد روزانه»، تاریخ و ایستگاه را انتخاب و مقدار انجام‌شدهٔ همان روز را برای هر آیتم وارد کنید. پیشرفت هر آیتم = جمع کارکردها ÷ مقدار کل (حداکثر ۱۰۰٪).'],
  ['۴. خطوط و جوش‌ها', 'خطوط لوله (Line List) و جوش‌ها با قطر، نوع اتصال، جوشکار، تاریخ جوش و نتیجهٔ NDT ثبت می‌شوند؛ از اکسل هم وارد می‌شوند. چند جوش را می‌توان یک‌جا انتخاب و جوشکاری یا نتیجهٔ NDT آن‌ها را ثبت کرد. پیشرفت جوشکاری = اینچ‌قطر جوش‌های زده‌شده ÷ اینچ‌قطر کل؛ پیشرفت NDT = اینچ‌قطر قبول‌شده ÷ اینچ‌قطر نیازمند NDT.'],
  ['۵. نقشه‌ها و نقشهٔ جوش', 'نقشه‌های پایپینگ، ایزومتریک، P&ID و سیویل بارگذاری و با شماره، ویرایش و وضعیت نگه داشته می‌شوند. روی تصویر نقشهٔ جوش، هر جوش با انتخاب از فهرست و کلیک روی محل خود علامت می‌خورد و رنگ آن وضعیت جوش را نشان می‌دهد؛ از روی همان نقشه هم جوشکاری و NDT ثبت می‌شود.'],
  ['۶. داشبورد', 'پیشرفت هر ایستگاه در برابر برنامه، ماتریس ایستگاه × رشته، منحنی پیشرفت، جوش‌ها و NDT و عملکرد جوشکاران (نرخ تعمیر) نمایش داده می‌شود. پیشرفت کل، میانگین ایستگاه‌هایی است که محدودهٔ کار دارند.'],
]
export function SpGuide({ onClose }: { onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return createPortal(
    <div className="hg-backdrop" onClick={onClose}>
      <div className="hg-dialog" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="spg-title" onClick={(e) => e.stopPropagation()}>
        <header className="hg-head"><b id="spg-title">راهنمای ایستگاه‌ها</b><button type="button" className="hg-x" onClick={onClose} aria-label="بستن"><X size={16} /></button></header>
        <ol className="hg-rules" style={{ listStyle: 'none', paddingInlineStart: 0 }}>{STEPS.map(([t, d]) => <li key={t}><b>{t}:</b> {d}</li>)}</ol>
      </div>
    </div>,
    document.body,
  )
}
