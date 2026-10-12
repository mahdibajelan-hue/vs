import { HardHat } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function ExecutionControlCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="14"
      title="مدیریت اجرا"
      englishTag="Execution Management"
      description="گزارش کارکرد روزانه بر پایهٔ فهرست‌بها، تأیید ردیف‌به‌ردیف دستگاه نظارت، فرم‌های فنی جوش و پوشش، پیشرفت فیزیکی وزنی و گزارش‌های هفتگی و ماهانه با شناسایی خودکار کسری."
      icon={HardHat}
      accent="#f97316"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
