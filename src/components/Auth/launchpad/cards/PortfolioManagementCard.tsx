import { IcPortfolio } from '../hubIcons'
import { ModuleCard } from '../ModuleCard'

export function PortfolioManagementCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="02"
      title="مدیریت سبد پروژه‌ها"
      englishTag="Portfolio & Program Control"
      description="دید تجمیعی سلامت، ریسک و مالی کل سبد پروژه‌ها — Portfolio ← Program ← Project."
      icon={IcPortfolio}
      accent="#4f46e5"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
