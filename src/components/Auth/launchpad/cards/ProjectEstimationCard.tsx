import { Calculator } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function ProjectEstimationCard({ onSelect }: { onSelect: () => void }) {
  return (
    <ModuleCard
      number="05"
      title="برآورد پروژه‌ها"
      englishTag="Project Estimation & Cost Intelligence"
      description="ماشین‌حساب برآورد مالی EPC خط لوله، متره و برآورد مقادیر، بنچمارک هزینه و پیش‌بینی."
      icon={Calculator}
      accent="#F2B705"
      onSelect={onSelect}
    />
  )
}
