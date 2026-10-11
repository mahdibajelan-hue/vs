import { Calculator } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function ProjectEstimationCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="05"
      title="برآورد پروژه‌ها"
      englishTag="Project Estimation & Cost Intelligence"
      description="ماشین‌حساب برآورد مالی EPC خط لوله، متره، بنچمارک هزینه و پیش‌بینی."
      icon={Calculator}
      accent="#db2777"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
