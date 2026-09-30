import { Calculator } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function ProjectEstimationCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="05"
      title="برآورد پروژه‌ها"
      englishTag="Project Estimation & Cost Intelligence"
      description="ماشین‌حساب برآورد مالی EPC خط لوله، متره، بنچمارک هزینه و پیش‌بینی."
      icon={Calculator}
      accent="#F2B705"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
