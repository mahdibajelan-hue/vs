import { Briefcase } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function PortfolioManagementCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="02"
      title="مدیریت پرتفولیو"
      englishTag="Portfolio & Program Control"
      description="دید تجمیعی سلامت، ریسک و مالی کل سبد پروژه‌ها — Portfolio ← Program ← Project."
      icon={Briefcase}
      accent="#4f46e5"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
