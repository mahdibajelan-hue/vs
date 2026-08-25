import { Briefcase } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function PortfolioManagementCard({ onSelect }: { onSelect: () => void }) {
  return (
    <ModuleCard
      number="02"
      title="مدیریت پرتفولیو"
      englishTag="Portfolio & Program Control"
      description="دید تجمیعی سلامت، ریسک و مالی کل سبد پروژه‌ها به تفکیک پرتفولیو و طرح — Portfolio ← Program ← Project."
      icon={Briefcase}
      accent="#6366f1"
      onSelect={onSelect}
    />
  )
}
