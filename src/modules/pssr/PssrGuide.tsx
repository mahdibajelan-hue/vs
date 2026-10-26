import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import '../projectMetrics/healthGuide.css'

const STEPS: [string, string][] = [
  ['۱. تکمیل مکانیکی و تعریف سیستم', 'پروژه را به سیستم‌های راه‌اندازی تقسیم کنید (هر قطعهٔ خط، هر ایستگاه، سامانهٔ حفاظت کاتدی…). برای هر سیستم چک‌لیست PSSR خودکار از قالب ساخته می‌شود.'],
  ['۲. چک‌لیست PSSR', 'تیم بازبینی هر بند را بررسی می‌کند: «تأیید»، «رد / ناقص» یا «غیرقابل‌اعمال» همراه با مدرک. بندهای الزامی باید تأیید یا غیرقابل‌اعمال باشند.'],
  ['۳. جلسهٔ PSSR', 'تاریخ، حاضران (پیمانکار، ناظر، بهره‌بردار، HSE…) و خلاصهٔ بازدید ثبت می‌شود. بدون جلسهٔ ثبت‌شده RFSU صادر نمی‌شود.'],
  ['۴. یافته‌ها (پانچ‌لیست)', 'دستهٔ A: باید پیش از RFSU بسته شود. دستهٔ B: پیش از تحویل موقت. دستهٔ C: بهبود. هر پانچ را مسئول می‌بندد و فرد دیگری «تأیید بستن» می‌زند؛ پانچ A تا تأیید نشود مانع است.'],
  ['۵. گواهی RFSU', 'وقتی همهٔ موانع رفع شد، امضاکنندگان به ترتیب زنجیرهٔ امضا (تنظیمات) امضا می‌کنند. «رد» زنجیره را متوقف می‌کند تا اصلاح و دوباره امضا شود. با آخرین امضا گواهی صادر و قابل چاپ است.'],
  ['۶. تزریق گاز', 'پس از RFSU مجوز تزریق گاز و ثبت عملیات آن (گام دوم ماژول) انجام می‌شود.'],
]

export function PssrGuide({ onClose }: { onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return createPortal(
    <div className="hg-backdrop" onClick={onClose}>
      <div className="hg-dialog" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="psg-title" onClick={(e) => e.stopPropagation()}>
        <header className="hg-head"><b id="psg-title">راهنمای PSSR و RFSU</b><button type="button" className="hg-x" onClick={onClose} aria-label="بستن"><X size={16} /></button></header>
        <p className="hg-why" style={{ lineHeight: 1.9, marginBottom: '.6rem' }}>PSSR (بازبینی ایمنی پیش از راه‌اندازی) تضمین می‌کند هیچ سیستمی پیش از اطمینان از ساخت درست، تست‌ها، سامانه‌های ایمنی، دستورالعمل‌ها و آموزش، گاز نگیرد. خروجی آن گواهی RFSU (آمادگی برای راه‌اندازی) است که مجوز ورود به مرحلهٔ تزریق گاز است.</p>
        <ol className="hg-rules" style={{ listStyle: 'none', paddingInlineStart: 0 }}>{STEPS.map(([t, d]) => <li key={t}><b>{t}:</b> {d}</li>)}</ol>
        <h5 className="sgg-h">مراحل هر سیستم و رنگ‌ها</h5>
        <ul className="hg-rules" style={{ listStyle: 'disc' }}>
          <li><b style={{ color: '#64748b' }}>تکمیل مکانیکی:</b> هنوز بازبینی شروع نشده.</li>
          <li><b style={{ color: '#f59e0b' }}>در حال PSSR:</b> بازبینی شروع شده و مانع باز وجود دارد.</li>
          <li><b style={{ color: '#3b82f6' }}>آمادهٔ امضای RFSU:</b> همهٔ موانع رفع شده، منتظر امضا.</li>
          <li><b style={{ color: '#a855f7' }}>در حال امضای RFSU:</b> بخشی از زنجیره امضا کرده.</li>
          <li><b style={{ color: '#10b981' }}>RFSU صادر شد:</b> آمادهٔ تزریق گاز.</li>
          <li><b>درصد آمادگی</b> = سهم شرط‌های RFSU که برقرار است: بندهای الزامی حل‌شده + پانچ‌های A تأییدشده + برگزاری جلسه.</li>
        </ul>
        <h5 className="sgg-h">ارتباط با بقیهٔ سامانه</h5>
        <ul className="hg-rules" style={{ listStyle: 'disc' }}>
          <li>رادار پروژه پانچ‌های A باز را به‌عنوان سیگنال بحرانی نشان می‌دهد.</li>
          <li>صفحهٔ فاز G7 (پیش‌راه‌اندازی و راه‌اندازی) در چرخهٔ عمر وضعیت سیستم‌ها و درصد سیستم‌های دارای RFSU را نشان می‌دهد.</li>
        </ul>
      </div>
    </div>,
    document.body,
  )
}
