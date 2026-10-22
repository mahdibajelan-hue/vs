import { ClipboardCheck } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function SupervisionAttendanceCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="17"
      title="حضور و غیاب دستگاه نظارت"
      englishTag="Site Supervision Attendance"
      description="حضور روزانهٔ ناظران و نمایندگان کارفرما، ساعت کار و اضافه‌کار، وعده‌های غذایی، کارکرد خودروهای استیجاری و گزارش ماهانه برای پرداخت؛ آمادهٔ اتصال به کارت ساعت."
      icon={ClipboardCheck}
      accent="#0891b2"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
