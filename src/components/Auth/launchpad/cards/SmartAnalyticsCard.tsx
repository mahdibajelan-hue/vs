import { BarChart3 } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function SmartAnalyticsCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="03"
      title="گزارش هوشمند و تحلیل"
      englishTag="Smart Reporting & Decision Intelligence"
      description="تجمیع زنده داده از همه ماژول‌ها، گزارش مدیریتی و هشدار زودهنگام برای تصمیم‌گیری."
      icon={BarChart3}
      accent="#ea580c"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
