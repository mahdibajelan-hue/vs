import { BarChart3 } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function SmartAnalyticsCard({ onSelect }: { onSelect: () => void }) {
  return (
    <ModuleCard
      number="03"
      title="گزارش هوشمند و تحلیل"
      englishTag="Smart Reporting & Decision Intelligence"
      description="تجمیع زنده داده از همه ماژول‌ها، گزارش‌های مدیریتی، تحلیل روند و هشدار زودهنگام برای تصمیم‌گیری."
      icon={BarChart3}
      accent="#2dd4bf"
      onSelect={onSelect}
    />
  )
}
