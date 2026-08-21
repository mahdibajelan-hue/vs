import { MousePointer2, PenLine, Wrench, Ruler } from 'lucide-react'
import { Modal } from '../common/Modal'

export function SchematicGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="راهنمای سریع طراحی نقشه شماتیک" subtitle="در چهار قدم ساده، نقشه خودتان را بسازید" onClose={onClose} width="max-w-xl">
      <div className="space-y-4">
        <Step
          icon={PenLine}
          num={1}
          title="ترسیم یک خط لوله"
          desc={
            <>
              حالت «ترسیم خط لوله جدید» (پیش‌فرض روشن است) را انتخاب کنید. روی نقشه <b>چند بار کلیک کنید</b> تا نقاط
              خط اضافه شوند — خط خودکار به زاویه‌های استاندارد ایزومتریک می‌چسبد. وقتی خط تمام شد، روی دکمه آبی
              <b> «پایان خط» </b>
              بالای صفحه بزنید و شناسه و سایز خط را وارد کنید.
            </>
          }
        />
        <Step
          icon={Ruler}
          num={2}
          title="یا: افزودن خط با مختصات دقیق"
          desc={
            <>
              اگر مختصات واقعی نقطه شروع و پایان خط (بر حسب متر) را دارید، به‌جای کلیک کردن روی نقشه، از دکمه
              <b> «افزودن خط با مختصات» </b>
              استفاده کنید — دقیق‌تر و سریع‌تر است و طول خط را هم خودش حساب می‌کند.
            </>
          }
        />
        <Step
          icon={Wrench}
          num={3}
          title="افزودن شیر و اتصالات"
          desc={
            <>
              از پنل سمت راست، روی آیکون شیر یا اتصال موردنظر (مثلاً «شیر دروازه‌ای») کلیک کنید، سپس روی نقطه‌ای از
              خط لوله که می‌خواهید آن قطعه در آنجا باشد کلیک کنید. علامت خودکار روی خط و هم‌راستا با آن قرار می‌گیرد.
              می‌توانید چند قطعه از همان نوع را پشت سر هم اضافه کنید بدون نیاز به انتخاب دوباره.
            </>
          }
        />
        <Step
          icon={MousePointer2}
          num={4}
          title="ویرایش یا حذف"
          desc={
            <>
              حالت «انتخاب / ویرایش» را بزنید، روی هر خط یا علامت کلیک کنید تا اطلاعاتش پایین صفحه نشان داده شود.
              اگر جای علامت درست نیست، آن را با موس <b>بکشید و رها کنید</b> تا دقیقاً روی نقطه درست بنشیند. اگر جهتش
              اشتباه است، از دکمه‌های چرخش، دکمه «معکوس» (۱۸۰ درجه)، یا وارد کردن زاویه دقیق استفاده کنید. کلید Delete
              هم برای حذف است.
            </>
          }
        />
        <div className="rounded-xl bg-white/[0.03] p-3 text-xs text-secondary leading-6">
          نکته: هر وقت وسط ترسیم خط پشیمان شدید، کلید Backspace آخرین نقطه را حذف می‌کند و Escape کل خط در حال ترسیم
          را لغو می‌کند.
        </div>
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
        >
          متوجه شدم
        </button>
      </div>
    </Modal>
  )
}

function Step({ icon: Icon, num, title, desc }: { icon: typeof PenLine; num: number; title: string; desc: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300 font-bold text-sm">
        {num}
      </div>
      <div>
        <p className="flex items-center gap-1.5 font-bold text-sm mb-1">
          <Icon size={14} className="text-brand-400" /> {title}
        </p>
        <p className="text-xs text-secondary leading-6">{desc}</p>
      </div>
    </div>
  )
}
