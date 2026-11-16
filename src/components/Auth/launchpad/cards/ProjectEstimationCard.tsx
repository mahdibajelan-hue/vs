import { IcEstimate } from '../hubIcons'
import { ModuleCard } from '../ModuleCard'

export function ProjectEstimationCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="05"
      title="برآورد پروژه‌ها"
      englishTag="Project Estimation & Cost Intelligence"
      description="برآورد پارامتریک هزینهٔ سرمایه‌ای خطوط لوله، بازهٔ دقت، جریان نقدینگی سالانه و گزارش قابل چاپ."
      icon={IcEstimate}
      accent="#db2777"
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
