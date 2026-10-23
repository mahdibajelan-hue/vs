import { Radar as RadarIcon } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'
import { RadarMiniVisual } from '../RadarMiniVisual'

export function ProjectRadarCard({ onSelect, locked, badge }: { onSelect: () => void; locked?: boolean; badge?: number }) {
  return (
    <ModuleCard
      number="01"
      title="رادار پروژه‌ها"
      englishTag="Project Intelligence & Control"
      description="اتاق فرمان هر پروژه — پروژه را انتخاب کنید؛ برنامهٔ زمانی، مالی، ریسک، مسائل، کالا، اجرا و اراضی همان پروژه در یک جا."
      icon={RadarIcon}
      accent="#059669"
      hero
      cta="ENTER PROJECT RADAR →"
      visual={<RadarMiniVisual size={56} />}
      locked={locked}
      badge={badge}
      onSelect={onSelect}
    />
  )
}
