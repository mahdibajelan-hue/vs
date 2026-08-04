import { useState } from 'react'
import { Send } from 'lucide-react'
import { Modal } from '../common/Modal'

interface SendReportModalProps {
  projectName: string
  onClose: () => void
}

export function SendReportModal({ projectName, onClose }: SendReportModalProps) {
  const [to, setTo] = useState('')
  const [note, setNote] = useState('')

  const subject = `گزارش پیشرفت پروژه — ${projectName}`
  const body = `با سلام،\n\nگزارش پیشرفت پروژه «${projectName}» پیوست است. لطفاً فایل PDF دانلودشده را به این ایمیل ضمیمه کنید.\n\n${note}`

  const send = () => {
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = url
    onClose()
  }

  return (
    <Modal title="ارسال گزارش برای مدیران ستادی" subtitle="ابتدا PDF گزارش را دانلود کنید، سپس از اینجا یک پیش‌نویس ایمیل باز می‌شود" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">ایمیل گیرنده (یا چند ایمیل با کاما)</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} className="input" placeholder="manager@company.com" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-secondary">توضیح تکمیلی (اختیاری)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="input resize-none" />
        </label>
        <p className="text-[11px] text-muted leading-5">
          به‌دلیل محدودیت مرورگر، امکان پیوست خودکار فایل وجود ندارد — پیش‌نویس ایمیل با موضوع و متن آماده باز می‌شود و
          شما فایل PDF دانلودشده را دستی ضمیمه می‌کنید.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-secondary hover:bg-white/5">
            انصراف
          </button>
          <button
            onClick={send}
            className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-5 py-2 text-sm font-medium text-white hover:bg-brand-400 transition-colors"
          >
            <Send size={14} /> باز کردن پیش‌نویس ایمیل
          </button>
        </div>
      </div>
    </Modal>
  )
}
