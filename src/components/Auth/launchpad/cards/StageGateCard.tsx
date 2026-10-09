import { Orbit } from 'lucide-react'
import { ModuleCard } from '../ModuleCard'

export function StageGateCard({ onSelect, locked }: { onSelect: () => void; locked?: boolean }) {
  return (
    <ModuleCard
      number="08"
      title="چرخه عمر Stage-Gate"
      englishTag="Stage-Gate Lifecycle"
      description="مدل ۹ گیتی G1 تا G9، مدار پیشرفت برنامه‌ای و واقعی، گانت برنامه زمان‌بندی، راهبرد اجرا و نسخه‌های برنامه."
      icon={Orbit}
      accent="#0ea5e9"
      locked={locked}
      onSelect={onSelect}
    />
  )
}
