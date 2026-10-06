import { Radar as RadarIcon } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'
import { RadarMiniVisual } from '../RadarMiniVisual'

export function ProjectRadarCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="01"
      title="رادار پروژه‌ها"
      englishTag="Project Intelligence & Control"
      description="مرکز فرماندهی هر پروژه — سیگنال‌ها، چرخه عمر، گیت‌ها، ریسک، مسائل، قرارداد و مالی."
      icon={RadarIcon}
      accent="#10b981"
      hero
      cta="ENTER PROJECT RADAR →"
      visual={<RadarMiniVisual size={56} />}
      locked={locked}
      onSelect={onSelect}
    />
  )
}
